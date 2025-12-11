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

    // Create tenant
    const insertTenantQuery = `
      INSERT INTO tenants (name, slug, domain, tenant_type, owner_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const tenantResult = await client.query(insertTenantQuery, [name, slug, domain, tenant_type, owner_id]);
    const tenant = tenantResult.rows[0];

    // Add owner as a member with 'owner' role in tenant_memberships
    // Check if membership already exists (unlikely for new tenant but good practice)
    await client.query(`
      INSERT INTO tenant_memberships (tenant_id, user_id, membership_role, is_primary_tenant)
      VALUES ($1, $2, 'owner', true)
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET membership_role = 'owner'
    `, [tenant.id, owner_id]);

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

    const query = `
      UPDATE tenants 
      SET name = COALESCE($1, name),
          slug = COALESCE($2, slug),
          domain = COALESCE($3, domain),
          tenant_type = COALESCE($4, tenant_type),
          status = COALESCE($5, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [name, slug, domain, tenant_type, status, id]);

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

