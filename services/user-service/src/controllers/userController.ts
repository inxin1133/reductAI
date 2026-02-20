import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/db';
import type { AuthedRequest } from '../middleware/requireAuth';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let query = `
      SELECT DISTINCT ON (u.id)
        u.id, u.email, u.full_name, u.status, u.email_verified, u.last_login_at, u.created_at, u.updated_at,
        r.name as role_name,
        r.slug as role_slug,
        r.id as role_id,
        pt.id as tenant_id,
        pt.name as tenant_name,
        pt.tenant_type as tenant_type,
        COALESCE(
          NULLIF(pt.metadata->>'plan_tier',''),
          NULLIF(pt.metadata->>'service_tier',''),
          NULLIF(pt.metadata->>'tier','')
        ) AS tenant_plan_tier
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id AND r.scope = 'platform'
      LEFT JOIN LATERAL (
        SELECT t.id, t.name, t.tenant_type, t.metadata, utr.is_primary_tenant, utr.joined_at, utr.granted_at
        FROM user_tenant_roles utr
        JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
        WHERE utr.user_id = u.id
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
        ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC, utr.granted_at ASC
        LIMIT 1
      ) pt ON TRUE
      WHERE u.deleted_at IS NULL
    `;
    
    const params: any[] = [];

    if (search) {
      query += ` AND (u.email ILIKE $1 OR u.full_name ILIKE $1)`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY u.id, ur.granted_at DESC NULLS LAST, u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`;
    const countParams: any[] = [];
    if (search) {
      countQuery += ` AND (email ILIKE $1 OR full_name ILIKE $1)`;
      countParams.push(`%${search}%`);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      users: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.status,
        u.email_verified,
        u.last_login_at,
        u.created_at,
        u.updated_at,
        u.metadata,
        r.name as role_name,
        r.slug as role_slug,
        r.id as role_id,
        pt.id as tenant_id,
        pt.name as tenant_name,
        pt.tenant_type as tenant_type,
        COALESCE(
          NULLIF(pt.metadata->>'plan_tier',''),
          NULLIF(pt.metadata->>'service_tier',''),
          NULLIF(pt.metadata->>'tier','')
        ) AS tenant_plan_tier
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id AND r.scope = 'platform'
      LEFT JOIN LATERAL (
        SELECT t.id, t.name, t.tenant_type, t.metadata, utr.is_primary_tenant, utr.joined_at, utr.granted_at
        FROM user_tenant_roles utr
        JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
        WHERE utr.user_id = u.id
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
        ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC, utr.granted_at ASC
        LIMIT 1
      ) pt ON TRUE
      WHERE u.id = $1 AND u.deleted_at IS NULL
      ORDER BY ur.granted_at DESC NULLS LAST
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { full_name, status, email_verified, role_id, tenant_name } = req.body;
    const authedReq = req as AuthedRequest;

    // 1. Update basic user info
    const updateUserQuery = `
      UPDATE users 
      SET full_name = COALESCE($1, full_name),
          status = COALESCE($2, status),
          email_verified = COALESCE($3, email_verified),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND deleted_at IS NULL
      RETURNING id, email, full_name, status, email_verified, updated_at
    `;
    
    const userResult = await client.query(updateUserQuery, [full_name, status, email_verified, id]);

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }

    if (tenant_name !== undefined) {
      const tenantName = typeof tenant_name === 'string' ? tenant_name.trim() : '';
      if (!tenantName) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid tenant_name' });
      }
      const tenantResult = await client.query(
        `
        SELECT t.id
        FROM user_tenant_roles utr
        JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
        WHERE utr.user_id = $1
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
        ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC, utr.granted_at ASC
        LIMIT 1
        `,
        [id]
      );
      if (tenantResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'User tenant not found' });
      }
      await client.query(
        `
        UPDATE tenants
        SET name = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [tenantName, tenantResult.rows[0].id]
      );
    }

    // 2. Update Platform Role if provided (role_id)
    // role_id provided -> assign platform role (single role).
    // role_id is empty/null -> remove platform roles.
    if (role_id !== undefined) {
      if (!role_id) {
        await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
      } else {
        const roleCheck = await client.query(`SELECT id FROM roles WHERE id = $1 AND scope = 'platform'`, [role_id]);
        if (roleCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'Invalid role_id or not a platform role' });
        }

        // Ensure single platform role per user
        await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
        await client.query(
          `
            INSERT INTO user_roles (user_id, role_id, granted_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, role_id) DO NOTHING
          `,
          [id, role_id, authedReq.userId || null]
        );
      }
    }

    await client.query('COMMIT');
    
    // Fetch updated user details including role name for response
    // Or just return what we have. Frontend will reload list.
    res.json(userResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const createUser = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { email, password, full_name, status, email_verified, role_id } = req.body || {};
    const authedReq = req as AuthedRequest;

    const emailValue = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const nameValue = typeof full_name === 'string' ? full_name.trim() : '';
    const statusValue = typeof status === 'string' ? status.trim() : 'active';
    const emailVerifiedValue = typeof email_verified === 'boolean' ? email_verified : false;

    if (!emailValue) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'email is required' });
    }
    if (typeof password !== 'string' || !password.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'password is required' });
    }

    const userCheck = await client.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [emailValue]);
    if (userCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'User already exists' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(String(password), saltRounds);

    const userRes = await client.query(
      `
      INSERT INTO users (email, password_hash, full_name, email_verified, status)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, email, full_name, status, email_verified, created_at, updated_at
      `,
      [emailValue, passwordHash, nameValue || emailValue, emailVerifiedValue, statusValue || 'active']
    );
    const user = userRes.rows[0];

    const ownerRoleRes = await client.query(
      `SELECT id FROM roles WHERE scope = 'tenant_base' AND slug = 'owner' LIMIT 1`
    );
    const ownerRoleId =
      ownerRoleRes.rows[0]?.id ||
      (
        await client.query(
          `
          INSERT INTO roles (name, slug, description, scope, tenant_id, is_system_role)
          VALUES ($1, $2, $3, 'tenant_base', NULL, TRUE)
          RETURNING id
          `,
          ['소유자', 'owner', 'Tenant base role: owner']
        )
      ).rows[0]?.id;

    if (!ownerRoleId) {
      await client.query('ROLLBACK');
      return res.status(500).json({ message: 'Failed to resolve owner role' });
    }

    const tenantName = nameValue || emailValue;
    const tenantSlug = `personal-${user.id}`;
    const tenantRes = await client.query(
      `
      INSERT INTO tenants (owner_id, name, slug, tenant_type, status, member_limit, current_member_count, metadata)
      VALUES ($1,$2,$3,'personal','active',$4,$5,$6::jsonb)
      RETURNING id
      `,
      [user.id, tenantName, tenantSlug, 1, 1, JSON.stringify({ plan_tier: 'free' })]
    );
    const tenantId = tenantRes.rows[0]?.id;
    if (!tenantId) {
      await client.query('ROLLBACK');
      return res.status(500).json({ message: 'Failed to create personal tenant' });
    }

    await client.query(
      `
      INSERT INTO user_tenant_roles (
        user_id,
        tenant_id,
        role_id,
        membership_status,
        joined_at,
        is_primary_tenant,
        granted_by
      )
      VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP, TRUE, $4)
      ON CONFLICT (user_id, tenant_id, role_id)
      DO UPDATE SET
        membership_status = 'active',
        left_at = NULL,
        is_primary_tenant = TRUE
      `,
      [user.id, tenantId, ownerRoleId, user.id]
    );

    if (role_id !== undefined && role_id !== null && String(role_id).trim()) {
      const roleIdValue = String(role_id).trim();
      const roleCheck = await client.query(`SELECT id FROM roles WHERE id = $1 AND scope = 'platform'`, [roleIdValue]);
      if (roleCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid role_id or not a platform role' });
      }
      await client.query(
        `
        INSERT INTO user_roles (user_id, role_id, granted_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, role_id) DO NOTHING
        `,
        [user.id, roleIdValue, authedReq.userId || null]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      user,
      tenant_id: tenantId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const lookupUsers = async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const cleaned = Array.from(
      new Set(
        ids
          .map((id: unknown) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id: string) => /^[0-9a-fA-F-]{36}$/.test(id))
      )
    );

    if (cleaned.length === 0) {
      return res.json({ ok: true, rows: [] });
    }

    const { rows } = await pool.query(
      `
        SELECT id, email, full_name
        FROM users
        WHERE id = ANY($1::uuid[])
          AND deleted_at IS NULL
      `,
      [cleaned]
    );

    res.json({ ok: true, rows });
  } catch (error) {
    console.error('Error looking up users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

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

export const listUserTenantMemberships = async (req: Request, res: Response) => {
  try {
    const q = toStr(req.query.q);
    const membershipFilter = toStr(req.query.membership);

    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = toInt(req.query.offset, 0);

    if (membershipFilter && membershipFilter !== 'none' && membershipFilter !== 'has') {
      return res.status(400).json({ message: 'invalid membership filter' });
    }

    const where: string[] = ['u.deleted_at IS NULL'];
    const params: any[] = [];

    if (q) {
      where.push(`(u.email ILIKE $${params.length + 1} OR u.full_name ILIKE $${params.length + 1})`);
      params.push(`%${q}%`);
    }
    if (membershipFilter === 'has') {
      where.push(`EXISTS (SELECT 1 FROM user_tenant_roles utr WHERE utr.user_id = u.id)`);
    }
    if (membershipFilter === 'none') {
      where.push(`NOT EXISTS (SELECT 1 FROM user_tenant_roles utr WHERE utr.user_id = u.id)`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereSql}`,
      params
    );

    const listRes = await pool.query(
      `
      SELECT u.id, u.email, u.full_name, u.status, u.email_verified, u.created_at
      FROM users u
      ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    );

    const users = listRes.rows || [];
    const userIds = users.map((row: any) => row.id).filter((id: string) => !!id);

    if (userIds.length === 0) {
      return res.json({
        ok: true,
        total: countRes.rows[0]?.total ?? 0,
        limit,
        offset,
        rows: users.map((row: any) => ({
          user: row,
          membership_count: 0,
          memberships: [],
        })),
      });
    }

    const membershipsRes = await pool.query(
      `
      SELECT
        utr.id,
        utr.user_id,
        utr.tenant_id,
        COALESCE(utr.membership_status, 'active') AS membership_status,
        utr.joined_at,
        utr.left_at,
        utr.is_primary_tenant,
        utr.granted_at,
        utr.expires_at,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.tenant_type AS tenant_type,
        COALESCE(
          NULLIF(t.metadata->>'plan_tier',''),
          NULLIF(t.metadata->>'service_tier',''),
          NULLIF(t.metadata->>'tier','')
        ) AS plan_tier,
        r.name AS role_name,
        r.slug AS role_slug,
        r.scope AS role_scope
      FROM user_tenant_roles utr
      JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
      LEFT JOIN roles r ON r.id = utr.role_id
      WHERE utr.user_id = ANY($1::uuid[])
      ORDER BY utr.user_id, COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC NULLS LAST, utr.granted_at ASC NULLS LAST
      `,
      [userIds]
    );

    const membershipMap = new Map<string, any[]>();
    membershipsRes.rows.forEach((row: any) => {
      const list = membershipMap.get(row.user_id) || [];
      list.push(row);
      membershipMap.set(row.user_id, list);
    });

    const rows = users.map((user: any) => {
      const memberships = membershipMap.get(user.id) || [];
      return {
        user,
        membership_count: memberships.length,
        memberships,
      };
    });

    res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows,
    });
  } catch (error) {
    console.error('Error fetching user tenant memberships:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
