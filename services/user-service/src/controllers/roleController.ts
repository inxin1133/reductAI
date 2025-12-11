import { Request, Response } from 'express';
import pool from '../config/db';

export const getRoles = async (req: Request, res: Response) => {
  try {
    const { tenant_id } = req.query;
    let query = `SELECT * FROM roles WHERE 1=1`; // roles table usually doesn't have deleted_at based on schema
    const params: any[] = [];

    // If tenant_id is provided, filter by it OR global roles. 
    // If not provided (super admin), maybe show all or just global?
    // For simplicity, let's show all for now if no filter, or handle as per requirement.
    // Assuming super admin view shows everything.
    
    if (tenant_id) {
      query += ` AND (tenant_id = $1 OR is_global = TRUE)`;
      params.push(tenant_id);
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get role details
    const roleResult = await pool.query(`SELECT * FROM roles WHERE id = $1`, [id]);
    if (roleResult.rows.length === 0) {
      return res.status(404).json({ message: 'Role not found' });
    }
    const role = roleResult.rows[0];

    // Get permissions for this role
    const permResult = await pool.query(`
      SELECT p.* 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = $1
    `, [id]);
    
    role.permissions = permResult.rows;

    res.json(role);
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createRole = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, slug, description, is_global, permissions, tenant_id } = req.body; // permissions is array of IDs

    // Validation: if not global, tenant_id is required
    if (!is_global && !tenant_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Tenant ID is required for non-global roles.',
        code: 'MISSING_TENANT_ID'
      });
    }

    const insertRoleQuery = `
      INSERT INTO roles (name, slug, description, is_global, tenant_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const roleResult = await client.query(insertRoleQuery, [name, slug, description, is_global || false, tenant_id || null]);
    const role = roleResult.rows[0];

    if (permissions && Array.isArray(permissions)) {
      const insertPermQuery = `
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES ($1, $2)
      `;
      for (const permId of permissions) {
        await client.query(insertPermQuery, [role.id, permId]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(role);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating role:', error);
    // Return detailed error message if possible
    res.status(500).json({ 
      message: 'Internal server error', 
      details: error.message 
    });
  } finally {
    client.release();
  }
};

export const updateRole = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { name, slug, description, is_global, permissions } = req.body;

    const updateRoleQuery = `
      UPDATE roles 
      SET name = COALESCE($1, name),
          slug = COALESCE($2, slug),
          description = COALESCE($3, description),
          is_global = COALESCE($4, is_global),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const roleResult = await client.query(updateRoleQuery, [name, slug, description, is_global, id]);
    
    if (roleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Role not found' });
    }
    const role = roleResult.rows[0];

    // Update permissions: Delete old ones and insert new ones
    if (permissions && Array.isArray(permissions)) {
      await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [id]);
      
      const insertPermQuery = `
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES ($1, $2)
      `;
      for (const permId of permissions) {
        await client.query(insertPermQuery, [role.id, permId]);
      }
    }

    await client.query('COMMIT');
    res.json(role);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating role:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Hard delete since roles table doesn't have deleted_at
    const result = await pool.query(`DELETE FROM roles WHERE id = $1 RETURNING id`, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.json({ message: 'Role deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting role:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
};
