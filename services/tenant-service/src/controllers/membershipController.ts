import { Request, Response } from 'express';
import pool from '../config/db';
import type { AuthedRequest } from '../middleware/requireAuth';

type MembershipStatus = 'active' | 'inactive' | 'suspended' | 'pending';

const STATUSES = new Set<MembershipStatus>(['active', 'inactive', 'suspended', 'pending']);

const toInt = (value: unknown, fallback: number) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
};

const toStr = (value: unknown) => {
  const s = typeof value === 'string' ? value : '';
  return s.trim();
};

const toBool = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

async function refreshTenantMemberCount(client: any, tenantId: string) {
  const countRes = await client.query(
    `
      SELECT COUNT(DISTINCT user_id)::int AS total
      FROM user_tenant_roles
      WHERE tenant_id = $1
        AND (membership_status IS NULL OR membership_status = 'active')
    `,
    [tenantId]
  );
  const total = countRes.rows[0]?.total ?? 0;
  await client.query(`UPDATE tenants SET current_member_count = $2 WHERE id = $1`, [tenantId, total]);
}

export const listTenantMemberships = async (req: Request, res: Response) => {
  try {
    const q = toStr(req.query.q);
    const status = toStr(req.query.status) as MembershipStatus | '';
    const tenantId = toStr(req.query.tenant_id);
    const userId = toStr(req.query.user_id);
    const roleId = toStr(req.query.role_id);

    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = toInt(req.query.offset, 0);

    const where: string[] = ['u.deleted_at IS NULL', 't.deleted_at IS NULL'];
    const params: any[] = [];

    if (status) {
      if (!STATUSES.has(status)) return res.status(400).json({ message: 'invalid status' });
      where.push(`utr.membership_status = $${params.length + 1}`);
      params.push(status);
    }
    if (tenantId) {
      where.push(`utr.tenant_id = $${params.length + 1}`);
      params.push(tenantId);
    }
    if (userId) {
      where.push(`utr.user_id = $${params.length + 1}`);
      params.push(userId);
    }
    if (roleId) {
      where.push(`utr.role_id = $${params.length + 1}`);
      params.push(roleId);
    }
    if (q) {
      where.push(
        `(
          u.email ILIKE $${params.length + 1}
          OR u.full_name ILIKE $${params.length + 1}
          OR t.name ILIKE $${params.length + 1}
          OR t.slug ILIKE $${params.length + 1}
          OR r.name ILIKE $${params.length + 1}
          OR r.slug ILIKE $${params.length + 1}
        )`
      );
      params.push(`%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM user_tenant_roles utr
      JOIN users u ON u.id = utr.user_id
      JOIN tenants t ON t.id = utr.tenant_id
      LEFT JOIN roles r ON r.id = utr.role_id
      ${whereSql}
      `,
      params
    );

    const listRes = await pool.query(
      `
      SELECT
        utr.id,
        utr.user_id,
        utr.tenant_id,
        utr.role_id,
        COALESCE(utr.membership_status, 'active') AS membership_status,
        utr.joined_at,
        utr.left_at,
        utr.is_primary_tenant,
        utr.granted_at,
        utr.granted_by,
        utr.expires_at,
        u.email AS user_email,
        u.full_name AS user_name,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.tenant_type AS tenant_type,
        r.name AS role_name,
        r.slug AS role_slug,
        r.scope AS role_scope
      FROM user_tenant_roles utr
      JOIN users u ON u.id = utr.user_id
      JOIN tenants t ON t.id = utr.tenant_id
      LEFT JOIN roles r ON r.id = utr.role_id
      ${whereSql}
      ORDER BY utr.joined_at DESC NULLS LAST, utr.granted_at DESC NULLS LAST
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    );

    res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    });
  } catch (error) {
    console.error('Error fetching tenant memberships:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTenantMembership = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = toStr(req.body?.user_id);
    const tenantId = toStr(req.body?.tenant_id);
    const roleId = toStr(req.body?.role_id);
    const status = (toStr(req.body?.membership_status) as MembershipStatus) || 'active';
    const isPrimary = toBool(req.body?.is_primary_tenant) ?? false;
    const expiresAt = req.body?.expires_at || null;
    const grantedBy = (req as AuthedRequest).userId || null;

    if (!userId) return res.status(400).json({ message: 'user_id is required' });
    if (!tenantId) return res.status(400).json({ message: 'tenant_id is required' });
    if (!roleId) return res.status(400).json({ message: 'role_id is required' });
    if (!STATUSES.has(status)) return res.status(400).json({ message: 'invalid membership_status' });

    const result = await client.query(
      `
      INSERT INTO user_tenant_roles (
        user_id, tenant_id, role_id, membership_status, is_primary_tenant, granted_by, expires_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, user_id, tenant_id, role_id, membership_status, joined_at, left_at, is_primary_tenant, granted_at, granted_by, expires_at
      `,
      [userId, tenantId, roleId, status, isPrimary, grantedBy, expiresAt]
    );

    const row = result.rows[0];

    if (isPrimary) {
      await client.query(
        `
        UPDATE user_tenant_roles
        SET is_primary_tenant = FALSE
        WHERE user_id = $1 AND id <> $2
        `,
        [userId, row.id]
      );
    }

    await refreshTenantMemberCount(client, tenantId);
    await client.query('COMMIT');

    res.status(201).json({ ok: true, row });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating tenant membership:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Membership already exists', details: error.detail });
    }
    res.status(500).json({ message: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
};

export const updateTenantMembership = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const input = req.body || {};

    const fields: string[] = [];
    const params: any[] = [];

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`);
      params.push(value);
    };

    if (input.role_id !== undefined) {
      const roleId = toStr(input.role_id);
      if (!roleId) return res.status(400).json({ message: 'role_id must be non-empty' });
      setField('role_id', roleId);
    }
    if (input.membership_status !== undefined) {
      const status = toStr(input.membership_status) as MembershipStatus;
      if (!STATUSES.has(status)) return res.status(400).json({ message: 'invalid membership_status' });
      setField('membership_status', status);
      if (status === 'inactive' && input.left_at === undefined) {
        fields.push(`left_at = CURRENT_TIMESTAMP`);
      }
    }
    if (input.left_at !== undefined) {
      setField('left_at', input.left_at || null);
    }
    if (input.is_primary_tenant !== undefined) {
      const isPrimary = toBool(input.is_primary_tenant);
      if (isPrimary === undefined) return res.status(400).json({ message: 'invalid is_primary_tenant' });
      setField('is_primary_tenant', isPrimary);
    }
    if (input.expires_at !== undefined) {
      setField('expires_at', input.expires_at || null);
    }

    if (fields.length === 0) return res.status(400).json({ message: 'No fields to update' });

    const result = await client.query(
      `
      UPDATE user_tenant_roles
      SET ${fields.join(', ')}
      WHERE id = $${params.length + 1}
      RETURNING id, user_id, tenant_id, role_id, membership_status, joined_at, left_at, is_primary_tenant, granted_at, granted_by, expires_at
      `,
      [...params, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Membership not found' });
    }

    const row = result.rows[0];

    if (row.is_primary_tenant) {
      await client.query(
        `
        UPDATE user_tenant_roles
        SET is_primary_tenant = FALSE
        WHERE user_id = $1 AND id <> $2
        `,
        [row.user_id, row.id]
      );
    }

    await refreshTenantMemberCount(client, row.tenant_id);
    await client.query('COMMIT');

    res.json({ ok: true, row });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating tenant membership:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Membership already exists', details: error.detail });
    }
    res.status(500).json({ message: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
};
