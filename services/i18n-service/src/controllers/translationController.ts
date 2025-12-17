import { Request, Response } from 'express';
import pool from '../config/db';

// 번역 데이터(키 + 번역값) 조회
export const getTranslations = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20; // 데이터가 많으므로 20개 기본
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const namespaceId = req.query.namespace_id as string;

    // 1. 기본 쿼리: 키 정보와 해당 키의 모든 번역을 JSON 형태로 집계
    let query = `
      SELECT 
        tk.id, 
        tk.key, 
        tk.description, 
        tk.namespace_id, 
        tn.name as namespace_name,
        COALESCE(
          jsonb_object_agg(l.code, t.value) FILTER (WHERE t.id IS NOT NULL), 
          '{}'::jsonb
        ) as translations
      FROM translation_keys tk
      JOIN translation_namespaces tn ON tk.namespace_id = tn.id
      LEFT JOIN translations t ON tk.id = t.translation_key_id
      LEFT JOIN languages l ON t.language_id = l.id
    `;

    const params: any[] = [];
    const whereClauses: string[] = [];

    // 2. 검색 조건 추가
    if (search) {
      whereClauses.push(`(tk.key ILIKE $${params.length + 1} OR tk.description ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (namespaceId && namespaceId !== 'all') {
      whereClauses.push(`tk.namespace_id = $${params.length + 1}`);
      params.push(namespaceId);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
    }

    query += ` GROUP BY tk.id, tn.name, tn.id`; // tn.id 추가 (정렬 등 안전성)
    query += ` ORDER BY tk.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // console.log("Query:", query, params); // 디버깅용

    const { rows } = await pool.query(query, params);

    // 3. 전체 카운트 (페이지네이션용)
    let countQuery = `
      SELECT COUNT(*) 
      FROM translation_keys tk 
      JOIN translation_namespaces tn ON tk.namespace_id = tn.id
    `;
    
    if (whereClauses.length > 0) {
      countQuery += ` WHERE ` + whereClauses.join(' AND ');
    }

    // countQuery 파라미터는 limit, offset 제외한 앞부분만 사용
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 번역 키 생성
export const createTranslationKey = async (req: Request, res: Response) => {
  try {
    const { namespace_id, key, description } = req.body;

    if (!namespace_id || !key) {
      return res.status(400).json({ message: 'Namespace ID and Key are required' });
    }

    const query = `
      INSERT INTO translation_keys (namespace_id, key, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [namespace_id, key, description]);
    res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating translation key:', error);
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Duplicate key in this namespace' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 번역 값 업데이트 (또는 생성) - Upsert + History
export const updateTranslationValue = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { translation_key_id, language_code, value } = req.body;
    // @ts-expect-error user attached by auth middleware
    const userId = req.user?.userId || null;

    if (!translation_key_id || !language_code) {
      return res.status(400).json({ message: 'Key ID and Language Code are required' });
    }

    // 1. 언어 ID 찾기
    const langRes = await client.query('SELECT id FROM languages WHERE code = $1', [language_code]);
    if (langRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Language not found' });
    }
    const language_id = langRes.rows[0].id;

    // 2. 기존 값 조회 (이력 저장을 위해)
    const oldRes = await client.query(
      'SELECT id, value FROM translations WHERE translation_key_id = $1 AND language_id = $2',
      [translation_key_id, language_id]
    );
    const oldTranslation = oldRes.rows[0];
    const oldValue = oldTranslation ? oldTranslation.value : null;

    // 값이 변경되지 않았으면 스킵 (선택 사항이나, 불필요한 이력 방지)
    if (oldValue === value) {
      await client.query('ROLLBACK');
      return res.json(oldTranslation);
    }

    // 3. 번역 값 Upsert
    const upsertQuery = `
      INSERT INTO translations (translation_key_id, language_id, value, is_approved)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (translation_key_id, language_id) 
      DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const { rows } = await client.query(upsertQuery, [translation_key_id, language_id, value]);
    const newTranslation = rows[0];

    // 4. 이력 저장 (History)
    if (newTranslation) {
      const historyQuery = `
        INSERT INTO translation_history (translation_id, old_value, new_value, changed_by, change_reason)
        VALUES ($1, $2, $3, $4, $5)
      `;
      // change_reason은 현재 UI에서 받지 않으므로 'Updated via Admin' 등으로 고정하거나 null 처리
      await client.query(historyQuery, [
        newTranslation.id,
        oldValue, // 이전 값 (없으면 null)
        value,    // 새 값
        userId,   // 변경자 ID
        'Updated via Translation Manager'
      ]);
    }
    
    await client.query('COMMIT');
    res.json(newTranslation);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating translation:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

// 번역 키 삭제
export const deleteTranslationKey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // CASCADE 설정이 되어 있다면 translations도 같이 삭제됨
    await pool.query('DELETE FROM translation_keys WHERE id = $1', [id]);
    res.json({ message: 'Translation key deleted' });
  } catch (error) {
    console.error('Error deleting translation key:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
