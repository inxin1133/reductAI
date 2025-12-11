import { Request, Response } from 'express';
import pool from '../config/db';

export const getPermissions = async (req: Request, res: Response) => {
  try {
    const query = `SELECT * FROM permissions ORDER BY resource, action`;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

