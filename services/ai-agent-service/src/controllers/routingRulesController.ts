import { Request, Response } from "express"
import { query } from "../config/db"
import { ensureSystemTenantId } from "../services/systemTenantService"

function toInt(v: unknown, fallback: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.floor(n)
}

function safeObj(v: unknown): Record<string, unknown> {
  if (!v) return {}
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

function safeJsonb(v: unknown): string {
  // always store as JSONB
  return JSON.stringify(v ?? {})
}

type ScopeType = "GLOBAL" | "ROLE" | "TENANT"

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function normalizeScope(
  tenantId: string,
  scope_type: unknown,
  scope_id: unknown
): { scope_type: ScopeType; scope_id: string | null } {
  const stRaw = typeof scope_type === "string" ? scope_type.trim().toUpperCase() : ""
  const st: ScopeType = stRaw === "GLOBAL" || stRaw === "ROLE" || stRaw === "TENANT" ? (stRaw as ScopeType) : "TENANT"

  if (st === "GLOBAL") return { scope_type: "GLOBAL", scope_id: null }
  if (st === "TENANT") return { scope_type: "TENANT", scope_id: tenantId }

  // ROLE
  const sid = typeof scope_id === "string" ? scope_id.trim() : ""
  if (!isUuid(sid)) throw new Error("INVALID_SCOPE_ID")
  return { scope_type: "ROLE", scope_id: sid }
}

export async function listRoutingRules(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
    const isActive = typeof req.query.is_active === "string" ? req.query.is_active : ""
    const scopeTypeQ = typeof req.query.scope_type === "string" ? req.query.scope_type.trim().toUpperCase() : ""
    const scopeIdQ = typeof req.query.scope_id === "string" ? req.query.scope_id.trim() : ""

    const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200)
    const offset = Math.max(toInt(req.query.offset, 0), 0)

    const where: string[] = [`r.tenant_id = $1`]
    const params: any[] = [tenantId]

    if (scopeTypeQ === "GLOBAL" || scopeTypeQ === "ROLE" || scopeTypeQ === "TENANT") {
      where.push(`r.scope_type = $${params.length + 1}`)
      params.push(scopeTypeQ)
    }
    if (scopeIdQ) {
      where.push(`r.scope_id = $${params.length + 1}`)
      params.push(scopeIdQ)
    }
    if (isActive === "true" || isActive === "false") {
      where.push(`r.is_active = $${params.length + 1}`)
      params.push(isActive === "true")
    }
    if (q) {
      where.push(`r.rule_name ILIKE $${params.length + 1}`)
      params.push(`%${q}%`)
    }

    const whereSql = `WHERE ${where.join(" AND ")}`

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM model_routing_rules r ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT
        r.id,
        r.scope_type,
        r.scope_id,
        r.rule_name,
        r.priority,
        r.conditions,
        r.is_active,
        r.metadata,
        r.created_at,
        r.updated_at,
        r.target_model_id,
        tm.display_name AS target_model_display_name,
        tm.model_id AS target_model_api_id,
        r.fallback_model_id,
        fm.display_name AS fallback_model_display_name,
        fm.model_id AS fallback_model_api_id
      FROM model_routing_rules r
      JOIN ai_models tm ON tm.id = r.target_model_id
      LEFT JOIN ai_models fm ON fm.id = r.fallback_model_id
      ${whereSql}
      ORDER BY r.is_active DESC, r.priority DESC, r.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    return res.json({ ok: true, total: countRes.rows[0]?.total ?? 0, limit, offset, rows: listRes.rows })
  } catch (e: any) {
    console.error("listRoutingRules error:", e)
    return res.status(500).json({ message: "Failed to list routing rules", details: String(e?.message || e) })
  }
}

export async function getRoutingRule(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const id = String(req.params.id || "")
    const r = await query(
      `
      SELECT
        r.*,
        tm.display_name AS target_model_display_name,
        tm.model_id AS target_model_api_id,
        fm.display_name AS fallback_model_display_name,
        fm.model_id AS fallback_model_api_id
      FROM model_routing_rules r
      JOIN ai_models tm ON tm.id = r.target_model_id
      LEFT JOIN ai_models fm ON fm.id = r.fallback_model_id
      WHERE r.tenant_id = $1 AND r.id = $2
      LIMIT 1
      `,
      [tenantId, id]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "Not found" })
    return res.json({ ok: true, row: r.rows[0] })
  } catch (e: any) {
    console.error("getRoutingRule error:", e)
    return res.status(500).json({ message: "Failed to get routing rule", details: String(e?.message || e) })
  }
}

export async function createRoutingRule(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const {
      scope_type,
      scope_id,
      rule_name,
      priority = 0,
      conditions,
      target_model_id,
      fallback_model_id = null,
      is_active = true,
      metadata = {},
    } = req.body || {}

    const name = String(rule_name || "").trim()
    if (!name) return res.status(400).json({ message: "rule_name is required" })
    if (!target_model_id) return res.status(400).json({ message: "target_model_id is required" })

    const cond = safeObj(conditions)
    if (Object.keys(cond).length === 0) {
      // 최소 조건을 강제(실수 방지). feature 미지정이면 chat로 기본.
      cond.feature = "chat"
    }

    let scope: { scope_type: ScopeType; scope_id: string | null }
    try {
      scope = normalizeScope(tenantId, scope_type, scope_id)
    } catch {
      return res.status(400).json({ message: "Invalid scope_id (UUID required when scope_type=ROLE)" })
    }

    const result = await query(
      `
      INSERT INTO model_routing_rules
        (tenant_id, scope_type, scope_id, rule_name, priority, conditions, target_model_id, fallback_model_id, is_active, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)
      RETURNING *
      `,
      [
        tenantId,
        scope.scope_type,
        scope.scope_id,
        name,
        Number(priority) || 0,
        safeJsonb(cond),
        target_model_id,
        fallback_model_id,
        Boolean(is_active),
        safeJsonb(metadata || {}),
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("createRoutingRule error:", e)
    if (e?.code === "23505") return res.status(409).json({ message: "Duplicate rule_name in scope (already exists)" })
    return res.status(500).json({ message: "Failed to create routing rule", details: String(e?.message || e) })
  }
}

export async function updateRoutingRule(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const id = String(req.params.id || "")
    const body = req.body || {}

    const existing = await query(`SELECT id FROM model_routing_rules WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
    if (existing.rows.length === 0) return res.status(404).json({ message: "Not found" })

    const fields: string[] = []
    const params: any[] = [tenantId, id]

    // scope: 지원 (부분 업데이트)
    if (body.scope_type !== undefined || body.scope_id !== undefined) {
      let scope: { scope_type: ScopeType; scope_id: string | null }
      try {
        scope = normalizeScope(tenantId, body.scope_type, body.scope_id)
      } catch {
        return res.status(400).json({ message: "Invalid scope_id (UUID required when scope_type=ROLE)" })
      }
      params.push(scope.scope_type)
      fields.push(`scope_type = $${params.length}`)
      params.push(scope.scope_id)
      fields.push(`scope_id = $${params.length}`)
    }

    if (body.rule_name !== undefined) {
      params.push(String(body.rule_name || "").trim())
      fields.push(`rule_name = $${params.length}`)
    }
    if (body.priority !== undefined) {
      params.push(Number(body.priority) || 0)
      fields.push(`priority = $${params.length}`)
    }
    if (body.conditions !== undefined) {
      params.push(safeJsonb(safeObj(body.conditions)))
      fields.push(`conditions = $${params.length}::jsonb`)
    }
    if (body.target_model_id !== undefined) {
      params.push(body.target_model_id)
      fields.push(`target_model_id = $${params.length}`)
    }
    if (body.fallback_model_id !== undefined) {
      params.push(body.fallback_model_id || null)
      fields.push(`fallback_model_id = $${params.length}`)
    }
    if (body.is_active !== undefined) {
      params.push(Boolean(body.is_active))
      fields.push(`is_active = $${params.length}`)
    }
    if (body.metadata !== undefined) {
      params.push(safeJsonb(safeObj(body.metadata)))
      fields.push(`metadata = $${params.length}::jsonb`)
    }

    // updated_at
    fields.push(`updated_at = CURRENT_TIMESTAMP`)

    const sql = `
      UPDATE model_routing_rules
      SET ${fields.join(", ")}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `
    const updated = await query(sql, params)
    return res.json({ ok: true, row: updated.rows[0] })
  } catch (e: any) {
    console.error("updateRoutingRule error:", e)
    if (e?.code === "23505") return res.status(409).json({ message: "Duplicate rule_name in scope (already exists)" })
    return res.status(500).json({ message: "Failed to update routing rule", details: String(e?.message || e) })
  }
}

export async function deleteRoutingRule(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const id = String(req.params.id || "")
    const r = await query(
      `DELETE FROM model_routing_rules WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenantId, id]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "Not found" })
    return res.json({ ok: true, deleted: true, id })
  } catch (e: any) {
    console.error("deleteRoutingRule error:", e)
    return res.status(500).json({ message: "Failed to delete routing rule", details: String(e?.message || e) })
  }
}


