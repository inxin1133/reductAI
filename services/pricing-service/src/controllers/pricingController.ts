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
        tier_unit,
        tier_min,
        tier_max,
        input_cost_per_1k,
        output_cost_per_1k,
        avg_cost_per_1k,
        margin_percent,
        avg_cost_per_1k_with_margin
      FROM pricing_model_cost_summaries
      ${whereSql}
      ORDER BY provider_slug ASC, model_name ASC, tier_unit NULLS FIRST, tier_min NULLS FIRST
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

export async function listMarkups(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)
    const providerSlug = toStr(req.query.provider_slug)
    const modelKey = toStr(req.query.model_key)
    const modality = toStr(req.query.modality)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (status) {
      where.push(`status = $${params.length + 1}`)
      params.push(status)
    }
    if (providerSlug) {
      where.push(`provider_slug = $${params.length + 1}`)
      params.push(providerSlug)
    }
    if (modelKey) {
      where.push(`model_key = $${params.length + 1}`)
      params.push(modelKey)
    }
    if (modality) {
      where.push(`modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (q) {
      where.push(
        `(
          name ILIKE $${params.length + 1}
          OR COALESCE(description, '') ILIKE $${params.length + 1}
          OR COALESCE(provider_slug, '') ILIKE $${params.length + 1}
          OR COALESCE(model_key, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM pricing_markup_rules ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT
        id,
        name,
        description,
        provider_slug,
        model_key,
        modality,
        margin_percent,
        status,
        effective_from,
        effective_to,
        created_at,
        updated_at
      FROM pricing_markup_rules
      ${whereSql}
      ORDER BY created_at DESC
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

const MARKUP_STATUSES = new Set(["active", "inactive"])

export async function createMarkup(req: Request, res: Response) {
  try {
    const name = toStr(req.body?.name)
    const description = typeof req.body?.description === "string" ? req.body.description : null
    const providerSlug = toStr(req.body?.provider_slug)
    const modelKey = toStr(req.body?.model_key)
    const modality = toStr(req.body?.modality)
    const marginPercent = Number(req.body?.margin_percent)
    const status = toStr(req.body?.status) || "active"
    const effectiveFrom = req.body?.effective_from || null
    const effectiveTo = req.body?.effective_to || null

    if (!name) return res.status(400).json({ message: "name is required" })
    if (!Number.isFinite(marginPercent)) return res.status(400).json({ message: "margin_percent must be numeric" })
    if (!MARKUP_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })

    const result = await query(
      `
      INSERT INTO pricing_markup_rules (
        name, description, provider_slug, model_key, modality, margin_percent, status, effective_from, effective_to
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING
        id, name, description, provider_slug, model_key, modality, margin_percent, status, effective_from, effective_to, created_at, updated_at
      `,
      [
        name,
        description,
        providerSlug || null,
        modelKey || null,
        modality || null,
        marginPercent,
        status,
        effectiveFrom,
        effectiveTo,
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
    if (input.description !== undefined) {
      const description = typeof input.description === "string" ? input.description : null
      setField("description", description)
    }
    if (input.provider_slug !== undefined) {
      const providerSlug = toStr(input.provider_slug)
      setField("provider_slug", providerSlug || null)
    }
    if (input.model_key !== undefined) {
      const modelKey = toStr(input.model_key)
      setField("model_key", modelKey || null)
    }
    if (input.modality !== undefined) {
      const modality = toStr(input.modality)
      setField("modality", modality || null)
    }
    if (input.margin_percent !== undefined) {
      const marginPercent = Number(input.margin_percent)
      if (!Number.isFinite(marginPercent)) return res.status(400).json({ message: "margin_percent must be numeric" })
      setField("margin_percent", marginPercent)
    }
    if (input.status !== undefined) {
      const status = toStr(input.status)
      if (!MARKUP_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.effective_from !== undefined) {
      setField("effective_from", input.effective_from || null)
    }
    if (input.effective_to !== undefined) {
      setField("effective_to", input.effective_to || null)
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE pricing_markup_rules
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING
        id, name, description, provider_slug, model_key, modality, margin_percent, status, effective_from, effective_to, created_at, updated_at
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
