import { Request, Response } from "express"
import { query } from "../config/db"

type AuditStatus = "success" | "failure" | "error"

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

const AUDIT_STATUSES = new Set<AuditStatus>(["success", "failure", "error"])

export async function listAuditLogs(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status) as AuditStatus | ""
    const action = toStr(req.query.action)
    const resourceType = toStr(req.query.resource_type)
    const tenantId = toStr(req.query.tenant_id)
    const userId = toStr(req.query.user_id)
    const serviceId = toStr(req.query.service_id)
    const from = toStr(req.query.from)
    const to = toStr(req.query.to)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (status) {
      if (!AUDIT_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      where.push(`a.status = $${params.length + 1}`)
      params.push(status)
    }
    if (action) {
      where.push(`a.action ILIKE $${params.length + 1}`)
      params.push(`%${action}%`)
    }
    if (resourceType) {
      where.push(`a.resource_type ILIKE $${params.length + 1}`)
      params.push(`%${resourceType}%`)
    }
    if (tenantId) {
      where.push(`a.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (userId) {
      where.push(`a.user_id = $${params.length + 1}`)
      params.push(userId)
    }
    if (serviceId) {
      where.push(`a.service_id = $${params.length + 1}`)
      params.push(serviceId)
    }
    if (from) {
      where.push(`a.created_at >= $${params.length + 1}::timestamptz`)
      params.push(from)
    }
    if (to) {
      where.push(`a.created_at <= $${params.length + 1}::timestamptz`)
      params.push(to)
    }
    if (q) {
      where.push(
        `(
          a.action ILIKE $${params.length + 1}
          OR a.resource_type ILIKE $${params.length + 1}
          OR COALESCE(a.error_message, '') ILIKE $${params.length + 1}
          OR COALESCE(a.ip_address::text, '') ILIKE $${params.length + 1}
          OR COALESCE(a.user_agent, '') ILIKE $${params.length + 1}
          OR COALESCE(u.email, '') ILIKE $${params.length + 1}
          OR COALESCE(u.full_name, '') ILIKE $${params.length + 1}
          OR COALESCE(t.name, '') ILIKE $${params.length + 1}
          OR COALESCE(t.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(s.name, '') ILIKE $${params.length + 1}
          OR COALESCE(s.slug, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN tenants t ON t.id = a.tenant_id
      LEFT JOIN services s ON s.id = a.service_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        a.id,
        a.tenant_id,
        a.user_id,
        a.service_id,
        a.action,
        a.resource_type,
        a.resource_id,
        a.status,
        a.ip_address::text AS ip_address,
        a.user_agent,
        a.request_data,
        a.response_data,
        a.error_message,
        a.created_at,
        u.email AS user_email,
        u.full_name AS user_name,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.tenant_type,
        s.name AS service_name,
        s.slug AS service_slug
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN tenants t ON t.id = a.tenant_id
      LEFT JOIN services s ON s.id = a.service_id
      ${whereSql}
      ORDER BY a.created_at DESC
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
    console.error("listAuditLogs error:", e)
    return res.status(500).json({ message: "Failed to list audit logs", details: String(e?.message || e) })
  }
}
