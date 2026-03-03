import { Request, Response } from "express"
import pool, { query } from "../config/db"

function toInt(v: unknown, fallback: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.floor(n))
}

function toStr(v: unknown) {
  const s = typeof v === "string" ? v : ""
  return s.trim()
}

export async function listPublicPrices(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const providerSlug = toStr(req.query.provider_slug)
    const modality = toStr(req.query.modality)
    const tierUnit = toStr(req.query.tier_unit)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (providerSlug) {
      where.push(`provider_slug = $${params.length + 1}`)
      params.push(providerSlug)
    }
    if (modality) {
      where.push(`modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (tierUnit) {
      where.push(`tier_unit = $${params.length + 1}`)
      params.push(tierUnit)
    }
    if (q) {
      where.push(
        `(
          model_name ILIKE $${params.length + 1}
          OR model_key ILIKE $${params.length + 1}
          OR provider_slug ILIKE $${params.length + 1}
          OR modality ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM pricing_model_cost_summaries ${whereSql}`,
      params
    )

    const listRes = await query(
      `
      SELECT
        provider_slug,
        model_key,
        model_name,
        modality,
        usage_kind,
        token_category,
        unit_type,
        tier_unit,
        tier_min,
        tier_max,
        input_cost_per_1k,
        output_cost_per_1k,
        avg_cost_per_1k,
        cost_per_unit,
        margin_percent,
        avg_cost_per_1k_with_margin,
        cost_per_unit_with_margin
      FROM pricing_model_cost_summaries
      ${whereSql}
      ORDER BY provider_slug ASC, model_name ASC, modality ASC, usage_kind ASC, tier_unit NULLS FIRST, tier_min NULLS FIRST
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
    console.error("listPublicPrices error:", e)
    return res.status(500).json({ message: "Failed to list public prices", details: String(e?.message || e) })
  }
}

export async function listRateCards(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)
    const limit = Math.min(toInt(req.query.limit, 100), 500)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (status) {
      where.push(`status = $${params.length + 1}`)
      params.push(status)
    }
    if (q) {
      where.push(
        `(
          name ILIKE $${params.length + 1}
          OR COALESCE(description, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM pricing_rate_cards ${whereSql}`,
      params
    )

    const listRes = await query(
      `
      SELECT id, name, version, status, effective_at, description, created_at, updated_at
      FROM pricing_rate_cards
      ${whereSql}
      ORDER BY effective_at DESC, version DESC
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
    console.error("listRateCards error:", e)
    return res.status(500).json({ message: "Failed to list rate cards", details: String(e?.message || e) })
  }
}

const RATE_CARD_STATUSES = new Set(["draft", "active", "retired"])

export async function createRateCard(req: Request, res: Response) {
  try {
    const name = toStr(req.body?.name)
    const versionRaw = req.body?.version
    const status = toStr(req.body?.status) || "draft"
    const effectiveAt = req.body?.effective_at
    const description = typeof req.body?.description === "string" ? req.body.description : null

    const version = Number(versionRaw)

    if (!name) return res.status(400).json({ message: "name is required" })
    if (!Number.isFinite(version) || version <= 0) return res.status(400).json({ message: "version must be positive" })
    if (!effectiveAt) return res.status(400).json({ message: "effective_at is required" })
    if (!RATE_CARD_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })

    const result = await query(
      `
      INSERT INTO pricing_rate_cards (name, version, effective_at, status, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, version, status, effective_at, description, created_at, updated_at
      `,
      [name, Math.floor(version), effectiveAt, status, description]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Rate card already exists", details: String(e?.detail || "") })
    }
    console.error("createRateCard error:", e)
    return res.status(500).json({ message: "Failed to create rate card", details: String(e?.message || e) })
  }
}

export async function updateRateCard(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const input = req.body || {}
    const fields: string[] = []
    const params: any[] = []

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`)
      params.push(value)
    }

    if (input.name !== undefined) {
      const name = toStr(input.name)
      if (!name) return res.status(400).json({ message: "name must be non-empty" })
      setField("name", name)
    }
    if (input.version !== undefined) {
      const version = Number(input.version)
      if (!Number.isFinite(version) || version <= 0) return res.status(400).json({ message: "version must be positive" })
      setField("version", Math.floor(version))
    }
    if (input.status !== undefined) {
      const status = toStr(input.status)
      if (!RATE_CARD_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.effective_at !== undefined) {
      if (!input.effective_at) return res.status(400).json({ message: "effective_at is required" })
      setField("effective_at", input.effective_at)
    }
    if (input.description !== undefined) {
      const description = typeof input.description === "string" ? input.description : null
      setField("description", description)
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE pricing_rate_cards
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, name, version, status, effective_at, description, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Rate card not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Rate card already exists", details: String(e?.detail || "") })
    }
    console.error("updateRateCard error:", e)
    return res.status(500).json({ message: "Failed to update rate card", details: String(e?.message || e) })
  }
}

export async function cloneRateCard(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const sourceId = String(req.params.id || "")
    if (!sourceId) return res.status(400).json({ message: "source id is required" })

    const name = toStr(req.body?.name)
    const versionRaw = req.body?.version
    const status = toStr(req.body?.status) || "draft"
    const effectiveAt = req.body?.effective_at
    const description = typeof req.body?.description === "string" ? req.body.description : null

    const version = Number(versionRaw)

    if (!name) return res.status(400).json({ message: "name is required" })
    if (!Number.isFinite(version) || version <= 0) return res.status(400).json({ message: "version must be positive" })
    if (!effectiveAt) return res.status(400).json({ message: "effective_at is required" })
    if (!RATE_CARD_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })

    await client.query("BEGIN")

    const sourceCheck = await client.query(`SELECT id FROM pricing_rate_cards WHERE id = $1`, [sourceId])
    if (sourceCheck.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ message: "Source rate card not found" })
    }

    const newCardRes = await client.query(
      `
      INSERT INTO pricing_rate_cards (name, version, effective_at, status, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, version, status, effective_at, description, created_at, updated_at
      `,
      [name, Math.floor(version), effectiveAt, status, description]
    )

    const newCard = newCardRes.rows[0]

    const countRes = await client.query(`SELECT COUNT(*)::int AS total FROM pricing_rates WHERE rate_card_id = $1`, [
      sourceId,
    ])

    await client.query(
      `
      INSERT INTO pricing_rates (rate_card_id, sku_id, rate_value, tier_unit, tier_min, tier_max, metadata)
      SELECT $1, sku_id, rate_value, tier_unit, tier_min, tier_max, metadata
      FROM pricing_rates
      WHERE rate_card_id = $2
      `,
      [newCard.id, sourceId]
    )

    await client.query("COMMIT")
    return res.status(201).json({ ok: true, rate_card: newCard, copied: countRes.rows[0]?.total ?? 0 })
  } catch (e: any) {
    await client.query("ROLLBACK")
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Rate card already exists", details: String(e?.detail || "") })
    }
    console.error("cloneRateCard error:", e)
    return res.status(500).json({ message: "Failed to clone rate card", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function listRates(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const providerSlug = toStr(req.query.provider_slug)
    const modelKey = toStr(req.query.model_key)
    const modality = toStr(req.query.modality)
    const usageKind = toStr(req.query.usage_kind)
    const tokenCategory = toStr(req.query.token_category)
    const tierUnit = toStr(req.query.tier_unit)
    const rateCardId = toStr(req.query.rate_card_id)
    const rateCardStatus = toStr(req.query.rate_card_status)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (rateCardId) {
      where.push(`r.rate_card_id = $${params.length + 1}`)
      params.push(rateCardId)
    }
    if (rateCardStatus) {
      where.push(`rc.status = $${params.length + 1}`)
      params.push(rateCardStatus)
    }
    if (providerSlug) {
      where.push(`s.provider_slug = $${params.length + 1}`)
      params.push(providerSlug)
    }
    if (modelKey) {
      where.push(`s.model_key = $${params.length + 1}`)
      params.push(modelKey)
    }
    if (modality) {
      where.push(`s.modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (usageKind) {
      where.push(`s.usage_kind = $${params.length + 1}`)
      params.push(usageKind)
    }
    if (tokenCategory) {
      where.push(`s.token_category = $${params.length + 1}`)
      params.push(tokenCategory)
    }
    if (tierUnit) {
      where.push(`r.tier_unit = $${params.length + 1}`)
      params.push(tierUnit)
    }
    if (q) {
      where.push(
        `(
          s.model_name ILIKE $${params.length + 1}
          OR s.model_key ILIKE $${params.length + 1}
          OR s.provider_slug ILIKE $${params.length + 1}
          OR s.sku_code ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM pricing_rates r
      JOIN pricing_rate_cards rc ON rc.id = r.rate_card_id
      JOIN pricing_skus s ON s.id = r.sku_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        r.id,
        r.rate_card_id,
        rc.name AS rate_card_name,
        rc.version AS rate_card_version,
        rc.status AS rate_card_status,
        rc.effective_at AS rate_card_effective_at,
        r.sku_id,
        s.sku_code,
        s.provider_slug,
        s.model_key,
        s.model_name,
        s.modality,
        s.usage_kind,
        s.token_category,
        s.unit,
        s.unit_size,
        r.rate_value,
        r.tier_unit,
        r.tier_min,
        r.tier_max
      FROM pricing_rates r
      JOIN pricing_rate_cards rc ON rc.id = r.rate_card_id
      JOIN pricing_skus s ON s.id = r.sku_id
      ${whereSql}
      ORDER BY rc.effective_at DESC, rc.version DESC, s.provider_slug ASC, s.model_name ASC
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
    console.error("listRates error:", e)
    return res.status(500).json({ message: "Failed to list rates", details: String(e?.message || e) })
  }
}

export async function updateRate(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const input = req.body || {}
    const fields: string[] = []
    const params: any[] = []

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`)
      params.push(value)
    }

    if (input.rate_value !== undefined) {
      const rateValue = Number(input.rate_value)
      if (!Number.isFinite(rateValue) || rateValue < 0) {
        return res.status(400).json({ message: "rate_value must be non-negative number" })
      }
      setField("rate_value", rateValue)
    }
    if (input.tier_unit !== undefined) {
      const tierUnit = toStr(input.tier_unit)
      setField("tier_unit", tierUnit || null)
    }
    if (input.tier_min !== undefined) {
      const tierMin = input.tier_min === null || input.tier_min === "" ? null : Number(input.tier_min)
      if (tierMin !== null && (!Number.isFinite(tierMin) || tierMin < 0)) {
        return res.status(400).json({ message: "tier_min must be non-negative number" })
      }
      setField("tier_min", tierMin)
    }
    if (input.tier_max !== undefined) {
      const tierMax = input.tier_max === null || input.tier_max === "" ? null : Number(input.tier_max)
      if (tierMax !== null && (!Number.isFinite(tierMax) || tierMax < 0)) {
        return res.status(400).json({ message: "tier_max must be non-negative number" })
      }
      setField("tier_max", tierMax)
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE pricing_rates
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, rate_card_id, sku_id, rate_value, tier_unit, tier_min, tier_max, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Rate not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateRate error:", e)
    return res.status(500).json({ message: "Failed to update rate", details: String(e?.message || e) })
  }
}

const BULK_RATE_OPERATIONS = new Set(["percent", "multiply", "set"])

export async function bulkUpdateRates(req: Request, res: Response) {
  try {
    const rateCardId = toStr(req.body?.rate_card_id)
    if (!rateCardId) return res.status(400).json({ message: "rate_card_id is required" })

    const operation = toStr(req.body?.operation)
    if (!BULK_RATE_OPERATIONS.has(operation)) {
      return res.status(400).json({ message: "invalid operation" })
    }

    const valueRaw = req.body?.value
    const value = Number(valueRaw)
    if (!Number.isFinite(value)) return res.status(400).json({ message: "value must be numeric" })

    const q = toStr(req.body?.q)
    const providerSlug = toStr(req.body?.provider_slug)
    const modelKey = toStr(req.body?.model_key)
    const modality = toStr(req.body?.modality)
    const usageKind = toStr(req.body?.usage_kind)
    const tokenCategory = toStr(req.body?.token_category)
    const tierUnit = toStr(req.body?.tier_unit)

    const where: string[] = []
    const params: any[] = []

    where.push(`r.rate_card_id = $${params.length + 1}`)
    params.push(rateCardId)

    if (providerSlug) {
      where.push(`s.provider_slug = $${params.length + 1}`)
      params.push(providerSlug)
    }
    if (modelKey) {
      where.push(`s.model_key = $${params.length + 1}`)
      params.push(modelKey)
    }
    if (modality) {
      where.push(`s.modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (usageKind) {
      where.push(`s.usage_kind = $${params.length + 1}`)
      params.push(usageKind)
    }
    if (tokenCategory) {
      where.push(`s.token_category = $${params.length + 1}`)
      params.push(tokenCategory)
    }
    if (tierUnit) {
      where.push(`r.tier_unit = $${params.length + 1}`)
      params.push(tierUnit)
    }
    if (q) {
      where.push(
        `(
          s.model_name ILIKE $${params.length + 1}
          OR s.model_key ILIKE $${params.length + 1}
          OR s.provider_slug ILIKE $${params.length + 1}
          OR s.sku_code ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const valueParam = `$${params.length + 1}`
    params.push(value)

    let rateExpr = valueParam
    if (operation === "percent") {
      rateExpr = `rate_value * (1 + ${valueParam} / 100.0)`
    } else if (operation === "multiply") {
      rateExpr = `rate_value * ${valueParam}`
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const result = await query(
      `
      UPDATE pricing_rates r
      SET rate_value = ${rateExpr}, updated_at = CURRENT_TIMESTAMP
      FROM pricing_skus s
      ${whereSql} AND r.sku_id = s.id
      RETURNING r.id
      `,
      params
    )

    return res.json({ ok: true, updated: result.rowCount })
  } catch (e: any) {
    console.error("bulkUpdateRates error:", e)
    return res.status(500).json({ message: "Failed to bulk update rates", details: String(e?.message || e) })
  }
}

// ========================================
// SKU CRUD
// ========================================

const VALID_MODALITIES = new Set(["text", "code", "image", "video", "audio", "web_search"])
const VALID_USAGE_KINDS = new Set([
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "image_generation",
  "seconds",
  "requests",
])
const VALID_TOKEN_CATEGORIES = new Set(["text", "image"])
const VALID_UNITS = new Set(["tokens", "image", "second", "request"])

export async function listSkus(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const providerSlug = toStr(req.query.provider_slug)
    const modelId = toStr(req.query.model_id)
    const modelKey = toStr(req.query.model_key)
    const modality = toStr(req.query.modality)
    const usageKind = toStr(req.query.usage_kind)
    const tokenCategory = toStr(req.query.token_category)
    const isActive = toStr(req.query.is_active)

    const limit = Math.min(toInt(req.query.limit, 50), 500)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (providerSlug) {
      where.push(`provider_slug = $${params.length + 1}`)
      params.push(providerSlug)
    }
    if (modelId) {
      where.push(`model_id = $${params.length + 1}`)
      params.push(modelId)
    } else if (modelKey) {
      where.push(`model_key = $${params.length + 1}`)
      params.push(modelKey)
    }
    if (modality) {
      where.push(`modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (usageKind) {
      where.push(`usage_kind = $${params.length + 1}`)
      params.push(usageKind)
    }
    if (tokenCategory) {
      where.push(`token_category = $${params.length + 1}`)
      params.push(tokenCategory)
    }
    if (isActive === "true" || isActive === "false") {
      where.push(`is_active = $${params.length + 1}`)
      params.push(isActive === "true")
    }
    if (q) {
      where.push(
        `(
          model_name ILIKE $${params.length + 1}
          OR model_key ILIKE $${params.length + 1}
          OR provider_slug ILIKE $${params.length + 1}
          OR sku_code ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM pricing_skus ${whereSql}`, params)

    const includeRate = !!modelId
    const listRes = await query(
      includeRate
        ? `
      SELECT
        s.id, s.sku_code, s.provider_slug, s.model_id, s.model_key, s.model_name,
        s.modality, s.usage_kind, s.token_category, s.unit, s.unit_size, s.currency,
        s.is_active, s.metadata, s.created_at, s.updated_at,
        (SELECT r.rate_value::text
         FROM pricing_rates r
         JOIN pricing_rate_cards rc ON r.rate_card_id = rc.id
         WHERE rc.status = 'active' AND rc.effective_at <= NOW()
           AND r.sku_id = s.id
         ORDER BY rc.effective_at DESC, r.tier_min NULLS FIRST
         LIMIT 1) AS rate_value
      FROM pricing_skus s
      ${whereSql}
      ORDER BY s.sku_code ASC, s.model_key ASC, s.modality ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `
        : `
      SELECT
        id, sku_code, provider_slug, model_id, model_key, model_name,
        modality, usage_kind, token_category, unit, unit_size, currency,
        is_active, metadata, created_at, updated_at
      FROM pricing_skus
      ${whereSql}
      ORDER BY sku_code ASC, model_key ASC, modality ASC
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
    console.error("listSkus error:", e)
    return res.status(500).json({ message: "Failed to list SKUs", details: String(e?.message || e) })
  }
}

function buildSkuCode(providerSlug: string, modelKey: string, modality: string, usageKind: string, tokenCategory: string | null, metadata?: any): string {
  const base = `${providerSlug}.${modelKey}.${modality}.${usageKind}`
  if (tokenCategory) return `${base}.${tokenCategory}`
  if (metadata && typeof metadata === "object") {
    const parts: string[] = []
    if (metadata.quality) parts.push(metadata.quality)
    if (metadata.size) parts.push(metadata.size)
    if (metadata.resolution) parts.push(metadata.resolution)
    if (metadata.task) parts.push(metadata.task)
    if (parts.length) return `${base}.${parts.join(".")}`
  }
  return base
}

export async function checkSkuCodeAvailability(req: Request, res: Response) {
  try {
    const skuCode = toStr(req.query.sku_code)
    if (!skuCode) return res.status(400).json({ message: "sku_code query is required" })

    const result = await query(
      `SELECT 1 FROM pricing_skus WHERE sku_code = $1 LIMIT 1`,
      [skuCode]
    )
    const exists = result.rows.length > 0

    return res.json({ ok: true, exists })
  } catch (e: any) {
    console.error("checkSkuCodeAvailability error:", e)
    return res.status(500).json({ message: "Failed to check SKU code", details: String(e?.message || e) })
  }
}

export async function createSku(req: Request, res: Response) {
  try {
    const providerSlug = toStr(req.body?.provider_slug)
    const modelKey = toStr(req.body?.model_key)
    const modelName = toStr(req.body?.model_name)
    const modality = toStr(req.body?.modality)
    const usageKind = toStr(req.body?.usage_kind)
    const tokenCategory = toStr(req.body?.token_category) || null
    const unit = toStr(req.body?.unit)
    const unitSize = toInt(req.body?.unit_size, 0)
    const currency = toStr(req.body?.currency) || "USD"
    const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}
    const skuCodeOverride = toStr(req.body?.sku_code)

    if (!providerSlug) return res.status(400).json({ message: "provider_slug is required" })
    if (!modelKey) return res.status(400).json({ message: "model_key is required" })
    if (!modelName) return res.status(400).json({ message: "model_name is required" })
    if (!VALID_MODALITIES.has(modality)) return res.status(400).json({ message: "invalid modality" })
    if (!VALID_USAGE_KINDS.has(usageKind)) return res.status(400).json({ message: "invalid usage_kind" })
    if (tokenCategory && !VALID_TOKEN_CATEGORIES.has(tokenCategory)) return res.status(400).json({ message: "invalid token_category" })
    if (!VALID_UNITS.has(unit)) return res.status(400).json({ message: "invalid unit" })
    if (unitSize <= 0) return res.status(400).json({ message: "unit_size must be positive" })

    const skuCode = skuCodeOverride || buildSkuCode(providerSlug, modelKey, modality, usageKind, tokenCategory, metadata)

    const bodyModelId = req.body?.model_id
    let modelId: string | null = null
    if (bodyModelId && typeof bodyModelId === "string" && bodyModelId.trim()) {
      modelId = bodyModelId.trim()
    } else {
      const modelRes = await query(
        `SELECT id FROM ai_models WHERE model_id = $1 OR name = $1 LIMIT 1`,
        [modelKey]
      )
      modelId = modelRes.rows[0]?.id || null
    }

    const result = await query(
      `
      INSERT INTO pricing_skus (
        sku_code, provider_slug, model_id, model_key, model_name,
        modality, usage_kind, token_category, unit, unit_size, currency, is_active, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12)
      RETURNING *
      `,
      [skuCode, providerSlug, modelId, modelKey, modelName, modality, usageKind, tokenCategory, unit, unitSize, currency, metadata]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "SKU already exists", details: String(e?.detail || "") })
    }
    console.error("createSku error:", e)
    return res.status(500).json({ message: "Failed to create SKU", details: String(e?.message || e) })
  }
}

export async function updateSku(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const input = req.body || {}
    const fields: string[] = []
    const params: any[] = []

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`)
      params.push(value)
    }

    if (input.model_id !== undefined) {
      const v = input.model_id === null || input.model_id === "" ? null : toStr(input.model_id)
      setField("model_id", v)
    }
    if (input.provider_slug !== undefined) {
      const v = toStr(input.provider_slug)
      if (!v) return res.status(400).json({ message: "provider_slug must be non-empty when provided" })
      setField("provider_slug", v)
    }
    if (input.model_key !== undefined) {
      const v = toStr(input.model_key)
      if (!v) return res.status(400).json({ message: "model_key must be non-empty when provided" })
      setField("model_key", v)
    }
    if (input.model_name !== undefined) {
      const v = toStr(input.model_name)
      if (!v) return res.status(400).json({ message: "model_name must be non-empty" })
      setField("model_name", v)
    }
    if (input.modality !== undefined) {
      if (!VALID_MODALITIES.has(toStr(input.modality))) return res.status(400).json({ message: "invalid modality" })
      setField("modality", toStr(input.modality))
    }
    if (input.usage_kind !== undefined) {
      if (!VALID_USAGE_KINDS.has(toStr(input.usage_kind))) return res.status(400).json({ message: "invalid usage_kind" })
      setField("usage_kind", toStr(input.usage_kind))
    }
    if (input.token_category !== undefined) {
      const tc = toStr(input.token_category) || null
      if (tc && !VALID_TOKEN_CATEGORIES.has(tc)) return res.status(400).json({ message: "invalid token_category" })
      setField("token_category", tc)
    }
    if (input.unit !== undefined) {
      if (!VALID_UNITS.has(toStr(input.unit))) return res.status(400).json({ message: "invalid unit" })
      setField("unit", toStr(input.unit))
    }
    if (input.unit_size !== undefined) {
      const us = toInt(input.unit_size, 0)
      if (us <= 0) return res.status(400).json({ message: "unit_size must be positive" })
      setField("unit_size", us)
    }
    if (input.currency !== undefined) {
      setField("currency", toStr(input.currency) || "USD")
    }
    if (input.is_active !== undefined) {
      setField("is_active", Boolean(input.is_active))
    }
    if (input.metadata !== undefined) {
      setField("metadata", input.metadata && typeof input.metadata === "object" ? input.metadata : {})
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE pricing_skus
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "SKU not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateSku error:", e)
    return res.status(500).json({ message: "Failed to update SKU", details: String(e?.message || e) })
  }
}

export async function deleteSku(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const result = await query(
      `UPDATE pricing_skus SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, sku_code, is_active`,
      [id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "SKU not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("deleteSku error:", e)
    return res.status(500).json({ message: "Failed to deactivate SKU", details: String(e?.message || e) })
  }
}

// ========================================
// Rate Card - Missing SKUs & Add Rates
// ========================================

export async function listMissingSkus(req: Request, res: Response) {
  try {
    const rateCardId = String(req.params.id || "")
    if (!rateCardId) return res.status(400).json({ message: "rate card id is required" })

    const q = toStr(req.query.q)
    const providerSlug = toStr(req.query.provider_slug)
    const modality = toStr(req.query.modality)

    const where: string[] = [
      "s.is_active = TRUE",
      `s.id NOT IN (SELECT sku_id FROM pricing_rates WHERE rate_card_id = $1)`,
    ]
    const params: any[] = [rateCardId]

    if (providerSlug) {
      where.push(`s.provider_slug = $${params.length + 1}`)
      params.push(providerSlug)
    }
    if (modality) {
      where.push(`s.modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (q) {
      where.push(
        `(
          s.model_name ILIKE $${params.length + 1}
          OR s.model_key ILIKE $${params.length + 1}
          OR s.provider_slug ILIKE $${params.length + 1}
          OR s.sku_code ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.join(" AND ")

    const result = await query(
      `
      SELECT
        s.id, s.sku_code, s.provider_slug, s.model_key, s.model_name,
        s.modality, s.usage_kind, s.token_category, s.unit, s.unit_size,
        s.currency, s.metadata
      FROM pricing_skus s
      WHERE ${whereSql}
      ORDER BY s.provider_slug, s.model_key, s.usage_kind
      `,
      params
    )

    return res.json({ ok: true, rows: result.rows })
  } catch (e: any) {
    console.error("listMissingSkus error:", e)
    return res.status(500).json({ message: "Failed to list missing SKUs", details: String(e?.message || e) })
  }
}

export async function addRatesToCard(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const rateCardId = String(req.params.id || "")
    if (!rateCardId) return res.status(400).json({ message: "rate card id is required" })

    const rates = req.body?.rates
    if (!Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({ message: "rates array is required and must not be empty" })
    }

    const cardCheck = await client.query(`SELECT id FROM pricing_rate_cards WHERE id = $1`, [rateCardId])
    if (cardCheck.rows.length === 0) {
      return res.status(404).json({ message: "Rate card not found" })
    }

    await client.query("BEGIN")

    let inserted = 0
    for (const r of rates) {
      const skuId = String(r.sku_id || "")
      const rateValue = Number(r.rate_value)
      if (!skuId) continue
      if (!Number.isFinite(rateValue) || rateValue < 0) continue

      const tierUnit = r.tier_unit || null
      const tierMin = r.tier_min != null ? Number(r.tier_min) : null
      const tierMax = r.tier_max != null ? Number(r.tier_max) : null

      await client.query(
        `
        INSERT INTO pricing_rates (rate_card_id, sku_id, rate_value, tier_unit, tier_min, tier_max)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (rate_card_id, sku_id, tier_unit, tier_min, tier_max) DO NOTHING
        `,
        [rateCardId, skuId, rateValue, tierUnit, tierMin, tierMax]
      )
      inserted++
    }

    await client.query("COMMIT")
    return res.status(201).json({ ok: true, inserted })
  } catch (e: any) {
    await client.query("ROLLBACK")
    console.error("addRatesToCard error:", e)
    return res.status(500).json({ message: "Failed to add rates", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

// ========================================
// SKU Auto-generation from model
// ========================================

type SkuTemplateEntry = {
  usage_kind: string
  token_category: string | null
  unit: string
  unit_size: number
  metadata?: Record<string, any>
}

const SKU_TEMPLATES: Record<string, SkuTemplateEntry[]> = {
  text: [
    { usage_kind: "input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "cached_input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "output_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
  ],
  code: [
    { usage_kind: "input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "cached_input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "output_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
  ],
  image: [
    { usage_kind: "input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "cached_input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "output_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "input_tokens", token_category: "image", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "cached_input_tokens", token_category: "image", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "output_tokens", token_category: "image", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "image_generation", token_category: null, unit: "image", unit_size: 1, metadata: { quality: "low", size: "1024x1024" } },
    { usage_kind: "image_generation", token_category: null, unit: "image", unit_size: 1, metadata: { quality: "medium", size: "1024x1024" } },
    { usage_kind: "image_generation", token_category: null, unit: "image", unit_size: 1, metadata: { quality: "high", size: "1024x1024" } },
  ],
  audio: [
    { usage_kind: "input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "cached_input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "output_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "seconds", token_category: null, unit: "second", unit_size: 1 },
  ],
  video: [
    { usage_kind: "seconds", token_category: null, unit: "second", unit_size: 1 },
  ],
  web_search: [
    { usage_kind: "requests", token_category: null, unit: "request", unit_size: 1 },
  ],
  multimodal: [
    { usage_kind: "input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "cached_input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
    { usage_kind: "output_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
  ],
  embedding: [
    { usage_kind: "input_tokens", token_category: "text", unit: "tokens", unit_size: 1000000 },
  ],
}

// GET /skus/needs-generation?model_id=xxx → { needsGeneration: boolean }
// Uses pricing_skus.model_id (FK to ai_models.id) as primary linkage.
export async function checkModelNeedsSkuGeneration(req: Request, res: Response) {
  try {
    const modelId = toStr(req.query?.model_id)
    if (!modelId) return res.status(400).json({ message: "model_id query is required" })

    const existRes = await query(
      `SELECT 1 FROM pricing_skus WHERE model_id = $1 AND is_active = TRUE LIMIT 1`,
      [modelId]
    )
    if (existRes.rows.length > 0) {
      return res.json({ ok: true, needsGeneration: false })
    }
    return res.json({ ok: true, needsGeneration: true })
  } catch (e: any) {
    console.error("checkModelNeedsSkuGeneration error:", e)
    return res.status(500).json({ message: "Failed to check", details: String(e?.message || e) })
  }
}

export async function generateSkusForModel(req: Request, res: Response) {
  try {
    const modelId = toStr(req.body?.model_id)
    const modalityOverride = toStr(req.body?.modality)

    if (!modelId) return res.status(400).json({ message: "model_id (UUID) is required" })

    const modelRes = await query(
      `
      SELECT m.id, m.model_id AS model_key, m.display_name, m.model_type,
             p.slug AS provider_slug
      FROM ai_models m
      LEFT JOIN ai_providers p ON p.id = m.provider_id
      WHERE m.id = $1
      `,
      [modelId]
    )

    if (modelRes.rows.length === 0) return res.status(404).json({ message: "Model not found" })

    const model = modelRes.rows[0]
    const modality = modalityOverride || model.model_type || "text"
    const templates = SKU_TEMPLATES[modality] || SKU_TEMPLATES.text

    const created: any[] = []
    const skipped: string[] = []

    for (const tpl of templates) {
      const skuCode = buildSkuCode(
        model.provider_slug || "unknown",
        model.model_key,
        modality,
        tpl.usage_kind,
        tpl.token_category,
        tpl.metadata
      )

      try {
        const result = await query(
          `
          INSERT INTO pricing_skus (
            sku_code, provider_slug, model_id, model_key, model_name,
            modality, usage_kind, token_category, unit, unit_size, currency, is_active, metadata
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'USD',TRUE,$11)
          RETURNING id, sku_code
          `,
          [
            skuCode,
            model.provider_slug || "unknown",
            model.id,
            model.model_key,
            model.display_name || model.model_key,
            modality,
            tpl.usage_kind,
            tpl.token_category,
            tpl.unit,
            tpl.unit_size,
            tpl.metadata || {},
          ]
        )
        created.push(result.rows[0])
      } catch (insertErr: any) {
        if (insertErr?.code === "23505") {
          skipped.push(skuCode)
        } else {
          throw insertErr
        }
      }
    }

    return res.status(201).json({ ok: true, created, skipped, modality, templates_used: templates.length })
  } catch (e: any) {
    console.error("generateSkusForModel error:", e)
    return res.status(500).json({ message: "Failed to generate SKUs", details: String(e?.message || e) })
  }
}

// ========================================
// Markups
// ========================================

export async function listMarkups(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const scopeType = toStr(req.query.scope_type)
    const modality = toStr(req.query.modality)
    const usageKind = toStr(req.query.usage_kind)
    const tokenCategory = toStr(req.query.token_category)
    const isActiveRaw = toStr(req.query.is_active)
    const modelId = toStr(req.query.model_id)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (scopeType) {
      where.push(`scope_type = $${params.length + 1}`)
      params.push(scopeType)
    }
    if (modality) {
      where.push(`modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (usageKind) {
      where.push(`usage_kind = $${params.length + 1}`)
      params.push(usageKind)
    }
    if (tokenCategory) {
      where.push(`token_category = $${params.length + 1}`)
      params.push(tokenCategory)
    }
    if (isActiveRaw === "true") {
      where.push(`is_active = TRUE`)
    } else if (isActiveRaw === "false") {
      where.push(`is_active = FALSE`)
    }
    if (modelId) {
      where.push(`model_id = $${params.length + 1}`)
      params.push(modelId)
    }
    if (q) {
      where.push(`name ILIKE $${params.length + 1}`)
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM pricing_markup_rules ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT
        m.id,
        m.name,
        m.scope_type,
        m.model_id,
        m.modality,
        m.usage_kind,
        m.token_category,
        m.margin_percent,
        m.priority,
        m.is_active,
        m.effective_at,
        m.created_at,
        m.updated_at,
        am.display_name AS model_display_name,
        am.model_id AS model_api_id
      FROM pricing_markup_rules m
      LEFT JOIN ai_models am ON am.id = m.model_id
      ${whereSql}
      ORDER BY m.priority DESC, m.created_at DESC
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
    console.error("listMarkups error:", e)
    return res.status(500).json({ message: "Failed to list markups", details: String(e?.message || e) })
  }
}

const MARKUP_SCOPE_TYPES = new Set(["global", "modality", "model", "model_usage"])

export async function createMarkup(req: Request, res: Response) {
  try {
    const name = toStr(req.body?.name)
    const scopeType = toStr(req.body?.scope_type) || "global"
    const modelId = req.body?.model_id || null
    const modality = req.body?.modality || null
    const usageKind = req.body?.usage_kind || null
    const tokenCategory = req.body?.token_category || null
    const marginPercent = Number(req.body?.margin_percent)
    const priority = Number(req.body?.priority) || 0
    const isActive = req.body?.is_active !== false
    const effectiveAt = req.body?.effective_at || null

    if (!name) return res.status(400).json({ message: "name is required" })
    if (!Number.isFinite(marginPercent)) return res.status(400).json({ message: "margin_percent must be numeric" })
    if (!MARKUP_SCOPE_TYPES.has(scopeType)) return res.status(400).json({ message: "invalid scope_type" })

    const result = await query(
      `
      INSERT INTO pricing_markup_rules (
        name, scope_type, model_id, modality, usage_kind, token_category, margin_percent, priority, is_active, effective_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
      RETURNING id, name, scope_type, model_id, modality, usage_kind, token_category, margin_percent, priority, is_active, effective_at, created_at, updated_at
      `,
      [
        name,
        scopeType,
        modelId && String(modelId).trim() ? modelId : null,
        modality && String(modality).trim() ? modality : null,
        usageKind && String(usageKind).trim() ? usageKind : null,
        tokenCategory && String(tokenCategory).trim() ? tokenCategory : null,
        marginPercent,
        Number.isFinite(priority) ? priority : 0,
        isActive,
        effectiveAt ? String(effectiveAt) : null,
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("createMarkup error:", e)
    return res.status(500).json({ message: "Failed to create markup", details: String(e?.message || e) })
  }
}

export async function updateMarkup(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const input = req.body || {}
    const fields: string[] = []
    const params: any[] = []

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`)
      params.push(value)
    }

    if (input.name !== undefined) {
      const name = toStr(input.name)
      if (!name) return res.status(400).json({ message: "name must be non-empty" })
      setField("name", name)
    }
    if (input.scope_type !== undefined) {
      const scopeType = toStr(input.scope_type)
      if (!MARKUP_SCOPE_TYPES.has(scopeType)) return res.status(400).json({ message: "invalid scope_type" })
      setField("scope_type", scopeType)
    }
    if (input.model_id !== undefined) {
      const modelId = input.model_id && String(input.model_id).trim() ? input.model_id : null
      setField("model_id", modelId)
    }
    if (input.modality !== undefined) {
      setField("modality", input.modality && String(input.modality).trim() ? input.modality : null)
    }
    if (input.usage_kind !== undefined) {
      setField("usage_kind", input.usage_kind && String(input.usage_kind).trim() ? input.usage_kind : null)
    }
    if (input.token_category !== undefined) {
      setField("token_category", input.token_category && String(input.token_category).trim() ? input.token_category : null)
    }
    if (input.margin_percent !== undefined) {
      const marginPercent = Number(input.margin_percent)
      if (!Number.isFinite(marginPercent)) return res.status(400).json({ message: "margin_percent must be numeric" })
      setField("margin_percent", marginPercent)
    }
    if (input.priority !== undefined) {
      setField("priority", Number(input.priority) || 0)
    }
    if (input.is_active !== undefined) {
      setField("is_active", input.is_active === true || input.is_active === "true")
    }
    if (input.effective_at !== undefined) {
      setField("effective_at", input.effective_at ? String(input.effective_at) : null)
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE pricing_markup_rules
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, name, scope_type, model_id, modality, usage_kind, token_category, margin_percent, priority, is_active, effective_at, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Markup not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateMarkup error:", e)
    return res.status(500).json({ message: "Failed to update markup", details: String(e?.message || e) })
  }
}

export async function deleteMarkup(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const result = await query(`DELETE FROM pricing_markup_rules WHERE id = $1 RETURNING id`, [id])
    if (result.rows.length === 0) return res.status(404).json({ message: "Markup not found" })

    return res.json({ ok: true, id: result.rows[0].id })
  } catch (e: any) {
    console.error("deleteMarkup error:", e)
    return res.status(500).json({ message: "Failed to delete markup", details: String(e?.message || e) })
  }
}
