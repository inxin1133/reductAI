import { Request, Response } from 'express';
import pool from '../config/db';

const PROVIDERS = new Set(['google', 'kakao', 'naver', 'local']);

const toInt = (value: unknown, fallback: number) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
};

const toStr = (value: unknown) => {
  const s = typeof value === 'string' ? value : '';
  return s.trim();
};

export const listUserProviders = async (req: Request, res: Response) => {
  try {
    const q = toStr(req.query.q);
    const provider = toStr(req.query.provider);
    const userId = toStr(req.query.user_id);

    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = toInt(req.query.offset, 0);

    const where: string[] = ['u.deleted_at IS NULL'];
    const params: any[] = [];

    if (provider) {
      if (!PROVIDERS.has(provider)) {
        return res.status(400).json({ message: 'Invalid provider' });
      }
      where.push(`up.provider = $${params.length + 1}`);
      params.push(provider);
    }
    if (userId) {
      where.push(`up.user_id = $${params.length + 1}`);
      params.push(userId);
    }
    if (q) {
      where.push(
        `(
          u.email ILIKE $${params.length + 1}
          OR u.full_name ILIKE $${params.length + 1}
          OR up.provider_user_id ILIKE $${params.length + 1}
        )`
      );
      params.push(`%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM user_providers up
      JOIN users u ON u.id = up.user_id
      ${whereSql}
      `,
      params
    );

    const listRes = await pool.query(
      `
      SELECT
        up.id,
        up.user_id,
        up.provider,
        up.provider_user_id,
        up.extra_data,
        up.created_at,
        u.email AS user_email,
        u.full_name AS user_name
      FROM user_providers up
      JOIN users u ON u.id = up.user_id
      ${whereSql}
      ORDER BY up.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    );

    res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    });
  } catch (error) {
    console.error('Error fetching user providers:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createUserProvider = async (req: Request, res: Response) => {
  try {
    const userId = toStr(req.body?.user_id);
    const provider = toStr(req.body?.provider);
    const providerUserId = toStr(req.body?.provider_user_id);
    const extraDataInput = req.body?.extra_data;
    const extraData =
      extraDataInput && typeof extraDataInput === 'object'
        ? extraDataInput
        : extraDataInput
          ? null
          : {};

    if (!userId) return res.status(400).json({ message: 'user_id is required' });
    if (!provider) return res.status(400).json({ message: 'provider is required' });
    if (!providerUserId) return res.status(400).json({ message: 'provider_user_id is required' });
    if (!PROVIDERS.has(provider)) return res.status(400).json({ message: 'Invalid provider' });
    if (extraData === null) return res.status(400).json({ message: 'extra_data must be object' });

    const result = await pool.query(
      `
      INSERT INTO user_providers (user_id, provider, provider_user_id, extra_data)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING id, user_id, provider, provider_user_id, extra_data, created_at
      `,
      [userId, provider, providerUserId, JSON.stringify(extraData || {})]
    );

    res.status(201).json({ ok: true, row: result.rows[0] });
  } catch (error: any) {
    console.error('Error creating user provider:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Provider mapping already exists', details: error.detail });
    }
    if (error?.code === '23503') {
      return res.status(400).json({ message: 'Invalid user_id' });
    }
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
};

export const deleteUserProvider = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM user_providers WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Provider mapping not found' });
    }
    res.json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting user provider:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
