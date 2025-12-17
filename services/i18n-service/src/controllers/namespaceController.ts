import { Request, Response } from 'express';
import pool from '../config/db';

export const getNamespaces = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let query = `
      SELECT *
      FROM translation_namespaces
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (search) {
      whereClauses.push(`(name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1} OR service_name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM translation_namespaces`;
    const countParams: any[] = [];
    if (search) {
      countQuery += ` WHERE (name ILIKE $1 OR description ILIKE $1 OR service_name ILIKE $1)`;
      countParams.push(`%${search}%`);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      namespaces: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching namespaces:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getNamespace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM translation_namespaces WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Namespace not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching namespace:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createNamespace = async (req: Request, res: Response) => {
  try {
    const { name, description, service_name, is_system } = req.body;

    const query = `
      INSERT INTO translation_namespaces (name, description, service_name, is_system)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [name, description, service_name, is_system || false];
    
    const { rows } = await pool.query(query, values);
    res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating namespace:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Namespace with this name already exists' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateNamespace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, service_name, is_system } = req.body;

    // First check if it's a system namespace and protect it if needed,
    // but the requirement says "is_system: true" means system namespace.
    // Usually system namespaces shouldn't be deleted, but editing might be allowed for description.
    // Let's allow editing for now.

    const query = `
      UPDATE translation_namespaces 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          service_name = COALESCE($3, service_name),
          is_system = COALESCE($4, is_system),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const values = [name, description, service_name, is_system, id];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Namespace not found' });
    }

    res.json(rows[0]);
  } catch (error: any) {
    console.error('Error updating namespace:', error);
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Namespace with this name already exists' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteNamespace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if system namespace
    const checkQuery = 'SELECT is_system FROM translation_namespaces WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Namespace not found' });
    }

    if (checkResult.rows[0].is_system) {
      return res.status(403).json({ message: 'System namespaces cannot be deleted' });
    }

    const query = 'DELETE FROM translation_namespaces WHERE id = $1 RETURNING id';
    const { rows } = await pool.query(query, [id]);

    res.json({ message: 'Namespace deleted successfully' });
  } catch (error) {
    console.error('Error deleting namespace:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

