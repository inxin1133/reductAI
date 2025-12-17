import { Request, Response } from 'express';
import pool from '../config/db';

export const getTranslationHistory = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const namespaceId = req.query.namespace_id as string;
    const languageCode = req.query.language_code as string;

    let query = `
      SELECT 
        th.id,
        th.old_value,
        th.new_value,
        th.change_reason,
        th.created_at,
        th.changed_by,
        t.id as translation_id,
        tk.key,
        tn.name as namespace_name,
        l.code as language_code,
        l.name as language_name,
        l.flag_emoji
      FROM translation_history th
      JOIN translations t ON th.translation_id = t.id
      JOIN translation_keys tk ON t.translation_key_id = tk.id
      JOIN translation_namespaces tn ON tk.namespace_id = tn.id
      JOIN languages l ON t.language_id = l.id
    `;

    const params: any[] = [];
    const whereClauses: string[] = [];

    // 검색 (키, 변경 내용)
    if (search) {
      whereClauses.push(`(tk.key ILIKE $${params.length + 1} OR th.new_value ILIKE $${params.length + 1} OR th.old_value ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (namespaceId && namespaceId !== 'all') {
      whereClauses.push(`tk.namespace_id = $${params.length + 1}`);
      params.push(namespaceId);
    }

    if (languageCode && languageCode !== 'all') {
      whereClauses.push(`l.code = $${params.length + 1}`);
      params.push(languageCode);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
    }

    query += ` ORDER BY th.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    // 전체 카운트
    let countQuery = `
      SELECT COUNT(*) 
      FROM translation_history th
      JOIN translations t ON th.translation_id = t.id
      JOIN translation_keys tk ON t.translation_key_id = tk.id
      JOIN translation_namespaces tn ON tk.namespace_id = tn.id
      JOIN languages l ON t.language_id = l.id
    `;
    
    if (whereClauses.length > 0) {
      countQuery += ` WHERE ` + whereClauses.join(' AND ');
    }

    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      history: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching translation history:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

