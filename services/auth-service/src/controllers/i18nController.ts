import { Request, Response } from 'express';
import { query } from '../config/db';

export const getLanguages = async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM languages ORDER BY display_order ASC, name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ message: 'Error fetching languages' });
  }
};

export const createLanguage = async (req: Request, res: Response) => {
  const { code, name, native_name, direction, is_active, is_default, flag_emoji, display_order } = req.body;
  
  // If setting as default, unset other defaults first (optional but good practice)
  if (is_default) {
     await query('UPDATE languages SET is_default = FALSE WHERE is_default = TRUE');
  }

  try {
    const result = await query(
      `INSERT INTO languages (code, name, native_name, direction, is_active, is_default, flag_emoji, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [code, name, native_name, direction || 'ltr', is_active ?? true, is_default ?? false, flag_emoji, display_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating language:', error);
    res.status(500).json({ message: 'Error creating language' });
  }
};

export const updateLanguage = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { code, name, native_name, direction, is_active, is_default, flag_emoji, display_order } = req.body;

  if (is_default) {
    await query('UPDATE languages SET is_default = FALSE WHERE is_default = TRUE AND id != $1', [id]);
 }

  try {
    const result = await query(
      `UPDATE languages
       SET code = $1, name = $2, native_name = $3, direction = $4, is_active = $5, is_default = $6, flag_emoji = $7, display_order = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [code, name, native_name, direction, is_active, is_default, flag_emoji, display_order, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Language not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating language:', error);
    res.status(500).json({ message: 'Error updating language' });
  }
};

export const deleteLanguage = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await query('DELETE FROM languages WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Language not found' });
    }
    res.json({ message: 'Language deleted successfully' });
  } catch (error) {
    console.error('Error deleting language:', error);
    res.status(500).json({ message: 'Error deleting language' });
  }
};

