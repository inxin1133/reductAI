import { Request, Response } from 'express';
import pool from '../config/db';

export const getRoles = async (req: Request, res: Response) => {
  try {
    const tenantId = typeof req.query.tenant_id === "string" ? req.query.tenant_id : undefined;
    const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
    const allowedScopes = new Set(["platform", "tenant_base", "tenant_custom"]);

    if (scope && !allowedScopes.has(scope)) {
      return res.status(400).json({ message: "Invalid scope filter" });
    }
    let query = `SELECT * FROM roles WHERE 1=1`;
    const params: any[] = [];

    if (tenantId && !scope) {
      params.push(tenantId);
      query += ` AND (scope = 'tenant_base' OR (scope = 'tenant_custom' AND tenant_id = $${params.length}))`;
    } else {
      if (scope) {
        params.push(scope);
        query += ` AND scope = $${params.length}`;
      }
      if (tenantId) {
        params.push(tenantId);
        query += ` AND tenant_id = $${params.length}`;
      }
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
    const { name, slug, description, permissions, tenant_id, scope: rawScope, is_global } = req.body; // permissions is array of IDs
    const scope =
      rawScope ??
      (typeof is_global === "boolean" ? (is_global ? "platform" : "tenant_custom") : undefined);

    const allowedScopes = new Set(["platform", "tenant_base", "tenant_custom"]);
    if (!scope || !allowedScopes.has(scope)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Invalid role scope. Use platform, tenant_base, or tenant_custom.',
        code: 'INVALID_ROLE_SCOPE'
      });
    }

    // Validation: tenant_custom requires tenant_id
    if (scope === "tenant_custom" && !tenant_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Tenant ID is required for tenant_custom roles.',
        code: 'MISSING_TENANT_ID'
      });
    }

    const insertRoleQuery = `
      INSERT INTO roles (name, slug, description, scope, tenant_id, is_system_role)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const resolvedTenantId = scope === "tenant_custom" ? tenant_id : null;
    const isSystemRole = scope === "platform" || scope === "tenant_base";
    const roleResult = await client.query(insertRoleQuery, [
      name,
      slug,
      description,
      scope,
      resolvedTenantId,
      isSystemRole,
    ]);
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
    const { name, slug, description, permissions, tenant_id, scope: rawScope, is_global } = req.body;
    const scope =
      rawScope ??
      (typeof is_global === "boolean" ? (is_global ? "platform" : "tenant_custom") : undefined);

    const existingRoleResult = await client.query(`SELECT scope, tenant_id FROM roles WHERE id = $1`, [id]);
    if (existingRoleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Role not found' });
    }
    const existingRole = existingRoleResult.rows[0];

    const nextScope = scope ?? existingRole.scope;
    const nextTenantId = nextScope === "tenant_custom"
      ? (tenant_id ?? existingRole.tenant_id)
      : null;

    const allowedScopes = new Set(["platform", "tenant_base", "tenant_custom"]);
    if (!allowedScopes.has(nextScope)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Invalid role scope. Use platform, tenant_base, or tenant_custom.',
        code: 'INVALID_ROLE_SCOPE'
      });
    }

    if (nextScope === "tenant_custom" && !nextTenantId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Tenant ID is required for tenant_custom roles.' });
    }

    const updateRoleQuery = `
      UPDATE roles 
      SET name = COALESCE($1, name),
          slug = COALESCE($2, slug),
          description = COALESCE($3, description),
          scope = $4,
          tenant_id = $5,
          is_system_role = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;
    const isSystemRole = nextScope === "platform" || nextScope === "tenant_base";
    const roleResult = await client.query(updateRoleQuery, [
      name,
      slug,
      description,
      nextScope,
      nextTenantId,
      isSystemRole,
      id,
    ]);
    
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
