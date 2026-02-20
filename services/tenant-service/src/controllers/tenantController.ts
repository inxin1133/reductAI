import { Request, Response } from 'express';
import pool from '../config/db';

export const getTenants = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let query = `
      SELECT t.*, u.email as owner_email, u.full_name as owner_name
      FROM tenants t
      LEFT JOIN users u ON t.owner_id = u.id
      WHERE t.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (search) {
      query += ` AND (t.name ILIKE $1 OR t.slug ILIKE $1)`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM tenants t WHERE t.deleted_at IS NULL`;
    const countParams: any[] = [];
    if (search) {
      countQuery += ` AND (t.name ILIKE $1 OR t.slug ILIKE $1)`;
      countParams.push(`%${search}%`);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      tenants: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTenant = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, slug, domain, tenant_type, owner_id } = req.body;
    const status = typeof req.body?.status === 'string' ? req.body.status : 'active';
    const memberLimitRaw = req.body?.member_limit;
    const memberLimit =
      memberLimitRaw === null || memberLimitRaw === undefined || memberLimitRaw === ''
        ? null
        : Number(memberLimitRaw);

    if (memberLimit !== null && (!Number.isFinite(memberLimit) || memberLimit < 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid member_limit' });
    }

    // Create tenant
    const insertTenantQuery = `
      INSERT INTO tenants (name, slug, domain, tenant_type, owner_id, status, member_limit, current_member_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const initialMemberCount = owner_id ? 1 : 0;
    const tenantResult = await client.query(insertTenantQuery, [
      name,
      slug,
      domain,
      tenant_type,
      owner_id,
      status,
      memberLimit,
      initialMemberCount,
    ]);
    const tenant = tenantResult.rows[0];

    if (owner_id) {
      const roleResult = await client.query(
        `
        SELECT id
        FROM roles
        WHERE scope = 'tenant_base' AND slug = 'owner'
        LIMIT 1
        `
      );
      const roleId =
        roleResult.rows[0]?.id ||
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

      if (!roleId) {
        await client.query('ROLLBACK');
        return res.status(500).json({ message: 'Failed to resolve tenant base owner role' });
      }

      await client.query(
        `
        INSERT INTO user_tenant_roles (
          user_id,
          tenant_id,
          role_id,
          granted_by,
          membership_status,
          joined_at,
          is_primary_tenant
        )
        VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP, TRUE)
        ON CONFLICT (user_id, tenant_id, role_id)
        DO UPDATE SET
          membership_status = 'active',
          left_at = NULL,
          is_primary_tenant = TRUE
        `,
        [owner_id, tenant.id, roleId, owner_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(tenant);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating tenant:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
};

export const updateTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug, domain, tenant_type, status } = req.body;
    const memberLimitRaw = req.body?.member_limit;
    const memberLimit =
      memberLimitRaw === undefined || memberLimitRaw === ''
        ? undefined
        : memberLimitRaw === null
          ? null
          : Number(memberLimitRaw);

    if (memberLimit !== undefined && memberLimit !== null && (!Number.isFinite(memberLimit) || memberLimit < 0)) {
      return res.status(400).json({ message: 'Invalid member_limit' });
    }

    const query = `
      UPDATE tenants 
      SET name = COALESCE($1, name),
          slug = COALESCE($2, slug),
          domain = COALESCE($3, domain),
          tenant_type = COALESCE($4, tenant_type),
          status = COALESCE($5, status),
          member_limit = COALESCE($6, member_limit),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [name, slug, domain, tenant_type, status, memberLimit, id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Soft delete
    const result = await pool.query(`UPDATE tenants SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const lookupTenants = async (req: Request, res: Response) => {
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
        SELECT id, name, slug, tenant_type
        FROM tenants
        WHERE id = ANY($1::uuid[])
          AND deleted_at IS NULL
      `,
      [cleaned]
    );

    res.json({ ok: true, rows });
  } catch (error) {
    console.error('Error looking up tenants:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

