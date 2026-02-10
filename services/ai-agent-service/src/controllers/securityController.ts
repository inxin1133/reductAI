import { Request, Response } from "express"
import { query } from "../config/db"

type SessionStatus = "active" | "expired"

function toInt(v: unknown, fallback: number) {
  if (v === null || v === undefined || v === "") return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.floor(n))
}

function toStr(v: unknown) {
  const s = typeof v === "string" ? v : ""
  return s.trim()
}

const SESSION_STATUSES = new Set<SessionStatus>(["active", "expired"])

export async function listUserSessions(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status) as SessionStatus | ""
    const tenantId = toStr(req.query.tenant_id)
    const userId = toStr(req.query.user_id)
    const ip = toStr(req.query.ip)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (status) {
      if (!SESSION_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      if (status === "active") where.push(`us.expires_at > NOW()`)
      if (status === "expired") where.push(`us.expires_at <= NOW()`)
    }
    if (tenantId) {
      where.push(`us.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (userId) {
      where.push(`us.user_id = $${params.length + 1}`)
      params.push(userId)
    }
    if (ip) {
      where.push(`COALESCE(us.ip_address::text, '') ILIKE $${params.length + 1}`)
      params.push(`%${ip}%`)
    }
    if (q) {
      where.push(
        `(
          COALESCE(u.email, '') ILIKE $${params.length + 1}
          OR COALESCE(u.full_name, '') ILIKE $${params.length + 1}
          OR COALESCE(t.name, '') ILIKE $${params.length + 1}
          OR COALESCE(t.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(us.token_hash, '') ILIKE $${params.length + 1}
          OR COALESCE(us.ip_address::text, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM user_sessions us
      JOIN users u ON u.id = us.user_id
      LEFT JOIN tenants t ON t.id = us.tenant_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        us.id,
        us.user_id,
        us.tenant_id,
        us.token_hash,
        us.ip_address::text AS ip_address,
        us.user_agent,
        us.expires_at,
        us.last_activity_at,
        us.created_at,
        u.email AS user_email,
        u.full_name AS user_name,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.tenant_type,
        CASE WHEN us.expires_at <= NOW() THEN 'expired' ELSE 'active' END AS status
      FROM user_sessions us
      JOIN users u ON u.id = us.user_id
      LEFT JOIN tenants t ON t.id = us.tenant_id
      ${whereSql}
      ORDER BY us.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    })
  } catch (e: any) {
    console.error("listUserSessions error:", e)
    return res.status(500).json({ message: "Failed to list user sessions", details: String(e?.message || e) })
  }
}

export async function revokeUserSession(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const result = await query(`DELETE FROM user_sessions WHERE id = $1 RETURNING id`, [id])
    if (result.rows.length === 0) return res.status(404).json({ message: "Session not found" })

    return res.json({ ok: true, id: result.rows[0].id })
  } catch (e: any) {
    console.error("revokeUserSession error:", e)
    return res.status(500).json({ message: "Failed to revoke session", details: String(e?.message || e) })
  }
}
