import { Request, Response } from 'express';
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
        r.id as role_id
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id AND r.scope = 'platform'
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
