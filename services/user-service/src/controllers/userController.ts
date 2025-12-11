import { Request, Response } from 'express';
import pool from '../config/db';

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
        r.id as role_id
      FROM users u
      LEFT JOIN user_tenant_roles utr ON u.id = utr.user_id
      LEFT JOIN roles r ON utr.role_id = r.id AND r.is_global = TRUE
      WHERE u.deleted_at IS NULL
    `;
    
    const params: any[] = [];

    if (search) {
      query += ` AND (u.email ILIKE $1 OR u.full_name ILIKE $1)`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY u.id, u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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
        id, email, full_name, status, email_verified, last_login_at, created_at, updated_at, metadata
      FROM users 
      WHERE id = $1 AND deleted_at IS NULL
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
    const { full_name, status, email_verified, role_id } = req.body;

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

    // 2. Update Role if provided (role_id)
    // We only assign a role when role_id is provided and is a valid global role.
    // If role_id is omitted or empty, we leave role assignments as-is.
    if (role_id) {
      // Validate role_id as a global role
      const roleCheck = await client.query(`SELECT id FROM roles WHERE id = $1 AND is_global = TRUE`, [role_id]);
      if (roleCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid role_id or not a global role' });
      }

      // Find a tenant context to assign the global role (primary tenant preferred)
      const tenantResult = await client.query(`
        SELECT tenant_id FROM tenant_memberships 
        WHERE user_id = $1 
        ORDER BY is_primary_tenant DESC, joined_at ASC 
        LIMIT 1
      `, [id]);

      if (tenantResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'User has no tenant to assign the role' });
      }

      const tenantId = tenantResult.rows[0].tenant_id;

      // Remove existing global roles for this user in any tenant (ensure single global role assignment)
      await client.query(`
        DELETE FROM user_tenant_roles
        WHERE user_id = $1 
        AND role_id IN (SELECT id FROM roles WHERE is_global = TRUE)
      `, [id]);

      // Insert new role assignment
      await client.query(`
        INSERT INTO user_tenant_roles (user_id, tenant_id, role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING
      `, [id, tenantId, role_id]);
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
