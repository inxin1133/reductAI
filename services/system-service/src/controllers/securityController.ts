import { Request, Response } from "express"
import { query } from "../config/db"
import { lookupTenants, lookupUsers } from "../services/identityClient"

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
      if (status === "active") where.push(`expires_at > NOW()`)
      if (status === "expired") where.push(`expires_at <= NOW()`)
    }
    if (tenantId) {
      where.push(`tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (userId) {
      where.push(`user_id = $${params.length + 1}`)
      params.push(userId)
    }
    if (ip) {
      where.push(`COALESCE(ip_address::text, '') ILIKE $${params.length + 1}`)
      params.push(`%${ip}%`)
    }
    if (q) {
      where.push(
        `(
          COALESCE(token_hash, '') ILIKE $${params.length + 1}
          OR COALESCE(ip_address::text, '') ILIKE $${params.length + 1}
          OR COALESCE(user_agent, '') ILIKE $${params.length + 1}
          OR COALESCE(user_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(tenant_id::text, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM user_sessions ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT
        id,
        user_id,
        tenant_id,
        token_hash,
        ip_address::text AS ip_address,
        user_agent,
        expires_at,
        last_activity_at,
        created_at,
        CASE WHEN expires_at <= NOW() THEN 'expired' ELSE 'active' END AS status
      FROM user_sessions
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const userIds = Array.from(
      new Set(listRes.rows.map((row) => row.user_id).filter((id) => typeof id === "string" && id))
    )
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const [userMap, tenantMap] = await Promise.all([
      lookupUsers(userIds, authHeader),
      lookupTenants(tenantIds, authHeader),
    ])

    const rows = listRes.rows.map((row) => {
      const user = row.user_id ? userMap.get(String(row.user_id)) : undefined
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
        user_email: user?.email ?? null,
        user_name: user?.full_name ?? null,
        tenant_name: tenant?.name ?? null,
        tenant_slug: tenant?.slug ?? null,
        tenant_type: tenant?.tenant_type ?? null,
      }
    })

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows,
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
