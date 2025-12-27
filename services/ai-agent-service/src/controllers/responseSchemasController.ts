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
  return JSON.stringify(v ?? {})
}

export async function listResponseSchemas(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()

    const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
    const name = typeof req.query.name === "string" ? req.query.name.trim() : ""
    const isActive = typeof req.query.is_active === "string" ? req.query.is_active : ""

    const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200)
    const offset = Math.max(toInt(req.query.offset, 0), 0)

    const where: string[] = [`tenant_id = $1`]
    const params: any[] = [tenantId]

    if (isActive === "true" || isActive === "false") {
      where.push(`is_active = $${params.length + 1}`)
      params.push(isActive === "true")
    }
    if (name) {
      where.push(`name = $${params.length + 1}`)
      params.push(name)
    }
    if (q) {
      where.push(`(name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`)
      params.push(`%${q}%`)
    }

    const whereSql = `WHERE ${where.join(" AND ")}`

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM response_schemas ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT
        id, tenant_id, name, version, strict, description, is_active, created_at, updated_at
      FROM response_schemas
      ${whereSql}
      ORDER BY is_active DESC, name ASC, version DESC, updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    return res.json({ ok: true, total: countRes.rows[0]?.total ?? 0, limit, offset, rows: listRes.rows })
  } catch (e: any) {
    console.error("listResponseSchemas error:", e)
    return res.status(500).json({ message: "Failed to list response schemas", details: String(e?.message || e) })
  }
}

export async function getResponseSchema(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const id = String(req.params.id || "")
    const r = await query(`SELECT * FROM response_schemas WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, id])
    if (r.rows.length === 0) return res.status(404).json({ message: "Not found" })
    return res.json({ ok: true, row: r.rows[0] })
  } catch (e: any) {
    console.error("getResponseSchema error:", e)
    return res.status(500).json({ message: "Failed to get response schema", details: String(e?.message || e) })
  }
}

export async function createResponseSchema(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const body = req.body || {}

    const name = String(body.name || "").trim()
    const version = Number(body.version || 1) || 1
    const strict = body.strict === undefined ? true : Boolean(body.strict)
    const schema = body.schema
    const description = body.description === undefined ? null : String(body.description || "")
    const isActive = body.is_active === undefined ? true : Boolean(body.is_active)

    if (!name) return res.status(400).json({ message: "name is required" })
    if (!schema || typeof schema !== "object" || Array.isArray(schema))
      return res.status(400).json({ message: "schema (JSON object) is required" })

    const result = await query(
      `
      INSERT INTO response_schemas
        (tenant_id, name, version, strict, schema, description, is_active)
      VALUES
        ($1,$2,$3,$4,$5::jsonb,$6,$7)
      RETURNING *
      `,
      [tenantId, name, version, strict, safeJsonb(schema), description, isActive]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("createResponseSchema error:", e)
    if (e?.code === "23505") return res.status(409).json({ message: "Duplicate schema (tenant/name/version already exists)" })
    return res.status(500).json({ message: "Failed to create response schema", details: String(e?.message || e) })
  }
}

export async function updateResponseSchema(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const id = String(req.params.id || "")
    const body = req.body || {}

    const existing = await query(`SELECT id FROM response_schemas WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
    if (existing.rows.length === 0) return res.status(404).json({ message: "Not found" })

    const fields: string[] = []
    const params: any[] = [tenantId, id]

    if (body.name !== undefined) {
      params.push(String(body.name || "").trim())
      fields.push(`name = $${params.length}`)
    }
    if (body.version !== undefined) {
      params.push(Number(body.version || 1) || 1)
      fields.push(`version = $${params.length}`)
    }
    if (body.strict !== undefined) {
      params.push(Boolean(body.strict))
      fields.push(`strict = $${params.length}`)
    }
    if (body.schema !== undefined) {
      const s = body.schema
      if (!s || typeof s !== "object" || Array.isArray(s)) return res.status(400).json({ message: "schema must be a JSON object" })
      params.push(safeJsonb(safeObj(s)))
      fields.push(`schema = $${params.length}::jsonb`)
    }
    if (body.description !== undefined) {
      params.push(body.description === null ? null : String(body.description || ""))
      fields.push(`description = $${params.length}`)
    }
    if (body.is_active !== undefined) {
      params.push(Boolean(body.is_active))
      fields.push(`is_active = $${params.length}`)
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`)

    if (fields.length === 1) {
      const row = await query(`SELECT * FROM response_schemas WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
      return res.json({ ok: true, row: row.rows[0] })
    }

    const sql = `
      UPDATE response_schemas
      SET ${fields.join(", ")}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `
    const updated = await query(sql, params)
    return res.json({ ok: true, row: updated.rows[0] })
  } catch (e: any) {
    console.error("updateResponseSchema error:", e)
    if (e?.code === "23505") return res.status(409).json({ message: "Duplicate schema (tenant/name/version already exists)" })
    return res.status(500).json({ message: "Failed to update response schema", details: String(e?.message || e) })
  }
}

export async function deleteResponseSchema(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const id = String(req.params.id || "")
    const r = await query(`DELETE FROM response_schemas WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id])
    if (r.rows.length === 0) return res.status(404).json({ message: "Not found" })
    return res.json({ ok: true, deleted: true, id })
  } catch (e: any) {
    console.error("deleteResponseSchema error:", e)
    return res.status(500).json({ message: "Failed to delete response schema", details: String(e?.message || e) })
  }
}


