import { Request, Response } from "express"
import { query } from "../config/db"

function toInt(v: unknown, fallback: number | null = null) {
  if (v === null || v === undefined || v === "") return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.floor(n)
}

function toStr(v: unknown) {
  const s = typeof v === "string" ? v : ""
  return s.trim()
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v
  if (typeof v === "string") {
    if (v.toLowerCase() === "true") return true
    if (v.toLowerCase() === "false") return false
  }
  return null
}

const GRANT_BILLING_CYCLES = new Set(["monthly", "yearly"])
const GRANT_CREDIT_TYPES = new Set(["subscription", "topup"])
const TRANSFER_TYPES = new Set(["grant", "revoke"])
const TRANSFER_STATUSES = new Set(["pending", "completed", "revoked", "cancelled"])
const ACCOUNT_OWNER_TYPES = new Set(["tenant", "user"])
const ACCOUNT_CREDIT_TYPES = new Set(["subscription", "topup"])
const ACCOUNT_STATUSES = new Set(["active", "suspended", "expired"])
const LEDGER_ENTRY_TYPES = new Set([
  "subscription_grant",
  "topup_purchase",
  "transfer_in",
  "transfer_out",
  "usage",
  "adjustment",
  "expiry",
  "refund",
  "reversal",
])

export async function listTopupProducts(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const currency = toStr(req.query.currency)
    const isActiveRaw = toStr(req.query.is_active)
    const isActive = isActiveRaw ? toBool(isActiveRaw) : null

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (currency) {
      where.push(`currency = $${params.length + 1}`)
      params.push(currency)
    }
    if (isActive !== null) {
      where.push(`is_active = $${params.length + 1}`)
      params.push(isActive)
    }
    if (q) {
      where.push(
        `(
          sku_code ILIKE $${params.length + 1}
          OR name ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM credit_topup_products ${whereSql}`, params)
    const listRes = await query(
      `
      SELECT id, sku_code, name, price_usd, credits, bonus_credits, currency, is_active, metadata, created_at, updated_at
      FROM credit_topup_products
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
    console.error("listTopupProducts error:", e)
    return res.status(500).json({ message: "Failed to list topup products", details: String(e?.message || e) })
  }
}

export async function createTopupProduct(req: Request, res: Response) {
  try {
    const skuCode = toStr(req.body?.sku_code)
    const name = toStr(req.body?.name)
    const priceRaw = req.body?.price_usd
    const creditsRaw = req.body?.credits
    const bonusRaw = req.body?.bonus_credits
    const currency = toStr(req.body?.currency).toUpperCase() || "USD"
    const isActive = toBool(req.body?.is_active)
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    const priceUsd = Number(priceRaw)
    const credits = Number(creditsRaw)
    const bonusCredits =
      bonusRaw === null || bonusRaw === undefined || bonusRaw === "" ? 0 : Number(bonusRaw)

    if (!skuCode) return res.status(400).json({ message: "sku_code is required" })
    if (!name) return res.status(400).json({ message: "name is required" })
    if (!Number.isFinite(priceUsd) || priceUsd < 0) {
      return res.status(400).json({ message: "price_usd must be >= 0" })
    }
    if (!Number.isFinite(credits) || credits <= 0) {
      return res.status(400).json({ message: "credits must be positive" })
    }
    if (!Number.isFinite(bonusCredits) || bonusCredits < 0) {
      return res.status(400).json({ message: "bonus_credits must be >= 0" })
    }
    if (!currency || currency.length !== 3) {
      return res.status(400).json({ message: "currency must be 3 letters" })
    }
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const result = await query(
      `
      INSERT INTO credit_topup_products
        (sku_code, name, price_usd, credits, bonus_credits, currency, is_active, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING id, sku_code, name, price_usd, credits, bonus_credits, currency, is_active, metadata, created_at, updated_at
      `,
      [
        skuCode,
        name,
        priceUsd,
        Math.floor(credits),
        Math.floor(bonusCredits),
        currency,
        isActive === null ? true : isActive,
        JSON.stringify(metadataValue || {}),
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Topup product already exists", details: String(e?.detail || "") })
    }
    console.error("createTopupProduct error:", e)
    return res.status(500).json({ message: "Failed to create topup product", details: String(e?.message || e) })
  }
}

export async function updateTopupProduct(req: Request, res: Response) {
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

    if (input.sku_code !== undefined) {
      const skuCode = toStr(input.sku_code)
      if (!skuCode) return res.status(400).json({ message: "sku_code must be non-empty" })
      setField("sku_code", skuCode)
    }
    if (input.name !== undefined) {
      const name = toStr(input.name)
      if (!name) return res.status(400).json({ message: "name must be non-empty" })
      setField("name", name)
    }
    if (input.price_usd !== undefined) {
      const priceUsd = Number(input.price_usd)
      if (!Number.isFinite(priceUsd) || priceUsd < 0) {
        return res.status(400).json({ message: "price_usd must be >= 0" })
      }
      setField("price_usd", priceUsd)
    }
    if (input.credits !== undefined) {
      const credits = Number(input.credits)
      if (!Number.isFinite(credits) || credits <= 0) {
        return res.status(400).json({ message: "credits must be positive" })
      }
      setField("credits", Math.floor(credits))
    }
    if (input.bonus_credits !== undefined) {
      const bonusCredits = Number(input.bonus_credits)
      if (!Number.isFinite(bonusCredits) || bonusCredits < 0) {
        return res.status(400).json({ message: "bonus_credits must be >= 0" })
      }
      setField("bonus_credits", Math.floor(bonusCredits))
    }
    if (input.currency !== undefined) {
      const currency = toStr(input.currency).toUpperCase()
      if (!currency || currency.length !== 3) {
        return res.status(400).json({ message: "currency must be 3 letters" })
      }
      setField("currency", currency)
    }
    if (input.is_active !== undefined) {
      const isActive = toBool(input.is_active)
      if (isActive === null) return res.status(400).json({ message: "is_active must be boolean" })
      setField("is_active", isActive)
    }
    if (input.metadata !== undefined) {
      const metadataInput = input.metadata
      const metadataValue =
        metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}
      if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })
      setField("metadata", JSON.stringify(metadataValue || {}))
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE credit_topup_products
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, sku_code, name, price_usd, credits, bonus_credits, currency, is_active, metadata, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Topup product not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Topup product already exists", details: String(e?.detail || "") })
    }
    console.error("updateTopupProduct error:", e)
    return res.status(500).json({ message: "Failed to update topup product", details: String(e?.message || e) })
  }
}

export async function listPlanGrants(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const planSlug = toStr(req.query.plan_slug)
    const billingCycle = toStr(req.query.billing_cycle)
    const creditType = toStr(req.query.credit_type)
    const isActiveRaw = toStr(req.query.is_active)
    const isActive = isActiveRaw ? toBool(isActiveRaw) : null

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (planSlug) {
      where.push(`g.plan_slug = $${params.length + 1}`)
      params.push(planSlug)
    }
    if (billingCycle) {
      where.push(`g.billing_cycle = $${params.length + 1}`)
      params.push(billingCycle)
    }
    if (creditType) {
      where.push(`g.credit_type = $${params.length + 1}`)
      params.push(creditType)
    }
    if (isActive !== null) {
      where.push(`g.is_active = $${params.length + 1}`)
      params.push(isActive)
    }
    if (q) {
      where.push(
        `(
          g.plan_slug ILIKE $${params.length + 1}
          OR COALESCE(b.name, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_plan_grants g
      LEFT JOIN billing_plans b ON b.slug = g.plan_slug
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        g.*,
        b.name AS plan_name,
        b.tier AS plan_tier
      FROM credit_plan_grants g
      LEFT JOIN billing_plans b ON b.slug = g.plan_slug
      ${whereSql}
      ORDER BY g.plan_slug ASC, g.billing_cycle ASC, g.credit_type ASC
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
    console.error("listPlanGrants error:", e)
    return res.status(500).json({ message: "Failed to list plan grants", details: String(e?.message || e) })
  }
}

export async function createPlanGrant(req: Request, res: Response) {
  try {
    const planSlug = toStr(req.body?.plan_slug)
    const billingCycle = toStr(req.body?.billing_cycle)
    const creditType = toStr(req.body?.credit_type)
    const monthlyCreditsRaw = req.body?.monthly_credits
    const initialCreditsRaw = req.body?.initial_credits
    const expiresInDaysRaw = req.body?.expires_in_days
    const isActive = toBool(req.body?.is_active)
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    const monthlyCredits = Number(monthlyCreditsRaw)
    const initialCredits = Number(initialCreditsRaw)
    const expiresInDays =
      expiresInDaysRaw === null || expiresInDaysRaw === undefined || expiresInDaysRaw === ""
        ? null
        : Number(expiresInDaysRaw)

    if (!planSlug) return res.status(400).json({ message: "plan_slug is required" })
    if (!GRANT_BILLING_CYCLES.has(billingCycle)) return res.status(400).json({ message: "invalid billing_cycle" })
    if (!GRANT_CREDIT_TYPES.has(creditType)) return res.status(400).json({ message: "invalid credit_type" })
    if (!Number.isFinite(monthlyCredits) || monthlyCredits < 0) {
      return res.status(400).json({ message: "monthly_credits must be >= 0" })
    }
    if (!Number.isFinite(initialCredits) || initialCredits < 0) {
      return res.status(400).json({ message: "initial_credits must be >= 0" })
    }
    if (expiresInDays !== null && (!Number.isFinite(expiresInDays) || expiresInDays < 0)) {
      return res.status(400).json({ message: "expires_in_days must be >= 0" })
    }
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const result = await query(
      `
      INSERT INTO credit_plan_grants
        (plan_slug, billing_cycle, monthly_credits, initial_credits, credit_type, expires_in_days, is_active, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING *
      `,
      [
        planSlug,
        billingCycle,
        Math.floor(monthlyCredits),
        Math.floor(initialCredits),
        creditType,
        expiresInDays,
        isActive === null ? true : isActive,
        JSON.stringify(metadataValue || {}),
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Plan grant already exists", details: String(e?.detail || "") })
    }
    console.error("createPlanGrant error:", e)
    return res.status(500).json({ message: "Failed to create plan grant", details: String(e?.message || e) })
  }
}

export async function updatePlanGrant(req: Request, res: Response) {
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

    if (input.plan_slug !== undefined) {
      const planSlug = toStr(input.plan_slug)
      if (!planSlug) return res.status(400).json({ message: "plan_slug must be non-empty" })
      setField("plan_slug", planSlug)
    }
    if (input.billing_cycle !== undefined) {
      const billingCycle = toStr(input.billing_cycle)
      if (!GRANT_BILLING_CYCLES.has(billingCycle)) return res.status(400).json({ message: "invalid billing_cycle" })
      setField("billing_cycle", billingCycle)
    }
    if (input.credit_type !== undefined) {
      const creditType = toStr(input.credit_type)
      if (!GRANT_CREDIT_TYPES.has(creditType)) return res.status(400).json({ message: "invalid credit_type" })
      setField("credit_type", creditType)
    }
    if (input.monthly_credits !== undefined) {
      const monthlyCredits = Number(input.monthly_credits)
      if (!Number.isFinite(monthlyCredits) || monthlyCredits < 0) {
        return res.status(400).json({ message: "monthly_credits must be >= 0" })
      }
      setField("monthly_credits", Math.floor(monthlyCredits))
    }
    if (input.initial_credits !== undefined) {
      const initialCredits = Number(input.initial_credits)
      if (!Number.isFinite(initialCredits) || initialCredits < 0) {
        return res.status(400).json({ message: "initial_credits must be >= 0" })
      }
      setField("initial_credits", Math.floor(initialCredits))
    }
    if (input.expires_in_days !== undefined) {
      const expiresInDays =
        input.expires_in_days === null || input.expires_in_days === undefined || input.expires_in_days === ""
          ? null
          : Number(input.expires_in_days)
      if (expiresInDays !== null && (!Number.isFinite(expiresInDays) || expiresInDays < 0)) {
        return res.status(400).json({ message: "expires_in_days must be >= 0" })
      }
      setField("expires_in_days", expiresInDays)
    }
    if (input.is_active !== undefined) {
      const isActive = toBool(input.is_active)
      if (isActive === null) return res.status(400).json({ message: "is_active must be boolean" })
      setField("is_active", isActive)
    }
    if (input.metadata !== undefined) {
      const metadataInput = input.metadata
      const metadataValue =
        metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}
      if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })
      setField("metadata", JSON.stringify(metadataValue || {}))
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE credit_plan_grants
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Plan grant not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Plan grant already exists", details: String(e?.detail || "") })
    }
    console.error("updatePlanGrant error:", e)
    return res.status(500).json({ message: "Failed to update plan grant", details: String(e?.message || e) })
  }
}

export async function listCreditTransfers(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const transferType = toStr(req.query.transfer_type)
    const status = toStr(req.query.status)
    const fromAccountId = toStr(req.query.from_account_id)
    const toAccountId = toStr(req.query.to_account_id)
    const tenantId = toStr(req.query.tenant_id)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (transferType) {
      if (!TRANSFER_TYPES.has(transferType)) {
        return res.status(400).json({ message: "invalid transfer_type" })
      }
      where.push(`ct.transfer_type = $${params.length + 1}`)
      params.push(transferType)
    }
    if (status) {
      if (!TRANSFER_STATUSES.has(status)) {
        return res.status(400).json({ message: "invalid status" })
      }
      where.push(`ct.status = $${params.length + 1}`)
      params.push(status)
    }
    if (fromAccountId) {
      where.push(`ct.from_account_id = $${params.length + 1}`)
      params.push(fromAccountId)
    }
    if (toAccountId) {
      where.push(`ct.to_account_id = $${params.length + 1}`)
      params.push(toAccountId)
    }
    if (tenantId) {
      where.push(`(fa.owner_tenant_id = $${params.length + 1} OR ta.owner_tenant_id = $${params.length + 1})`)
      params.push(tenantId)
    }
    if (q) {
      where.push(
        `(
          COALESCE(fa.display_name, '') ILIKE $${params.length + 1}
          OR COALESCE(ta.display_name, '') ILIKE $${params.length + 1}
          OR COALESCE(ft.name, '') ILIKE $${params.length + 1}
          OR COALESCE(ft.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(tt.name, '') ILIKE $${params.length + 1}
          OR COALESCE(tt.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(fu.email, '') ILIKE $${params.length + 1}
          OR COALESCE(fu.full_name, '') ILIKE $${params.length + 1}
          OR COALESCE(tu.email, '') ILIKE $${params.length + 1}
          OR COALESCE(tu.full_name, '') ILIKE $${params.length + 1}
          OR COALESCE(ru.email, '') ILIKE $${params.length + 1}
          OR COALESCE(au.email, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_transfers ct
      JOIN credit_accounts fa ON fa.id = ct.from_account_id
      JOIN credit_accounts ta ON ta.id = ct.to_account_id
      LEFT JOIN tenants ft ON ft.id = fa.owner_tenant_id
      LEFT JOIN tenants tt ON tt.id = ta.owner_tenant_id
      LEFT JOIN users fu ON fu.id = fa.owner_user_id
      LEFT JOIN users tu ON tu.id = ta.owner_user_id
      LEFT JOIN users ru ON ru.id = ct.requested_by
      LEFT JOIN users au ON au.id = ct.approved_by
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        ct.*,
        fa.owner_type AS from_owner_type,
        fa.owner_tenant_id AS from_owner_tenant_id,
        fa.owner_user_id AS from_owner_user_id,
        fa.display_name AS from_display_name,
        ft.name AS from_tenant_name,
        ft.slug AS from_tenant_slug,
        fu.email AS from_user_email,
        fu.full_name AS from_user_name,
        ta.owner_type AS to_owner_type,
        ta.owner_tenant_id AS to_owner_tenant_id,
        ta.owner_user_id AS to_owner_user_id,
        ta.display_name AS to_display_name,
        tt.name AS to_tenant_name,
        tt.slug AS to_tenant_slug,
        tu.email AS to_user_email,
        tu.full_name AS to_user_name,
        ru.email AS requested_email,
        ru.full_name AS requested_name,
        au.email AS approved_email,
        au.full_name AS approved_name
      FROM credit_transfers ct
      JOIN credit_accounts fa ON fa.id = ct.from_account_id
      JOIN credit_accounts ta ON ta.id = ct.to_account_id
      LEFT JOIN tenants ft ON ft.id = fa.owner_tenant_id
      LEFT JOIN tenants tt ON tt.id = ta.owner_tenant_id
      LEFT JOIN users fu ON fu.id = fa.owner_user_id
      LEFT JOIN users tu ON tu.id = ta.owner_user_id
      LEFT JOIN users ru ON ru.id = ct.requested_by
      LEFT JOIN users au ON au.id = ct.approved_by
      ${whereSql}
      ORDER BY ct.created_at DESC
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
    console.error("listCreditTransfers error:", e)
    return res.status(500).json({ message: "Failed to list credit transfers", details: String(e?.message || e) })
  }
}

export async function listCreditAccounts(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const ownerType = toStr(req.query.owner_type)
    const creditType = toStr(req.query.credit_type)
    const status = toStr(req.query.status)
    const tenantId = toStr(req.query.tenant_id)
    const userId = toStr(req.query.user_id)
    const sourceTenantId = toStr(req.query.source_tenant_id)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (ownerType) {
      if (!ACCOUNT_OWNER_TYPES.has(ownerType)) return res.status(400).json({ message: "invalid owner_type" })
      where.push(`ca.owner_type = $${params.length + 1}`)
      params.push(ownerType)
    }
    if (creditType) {
      if (!ACCOUNT_CREDIT_TYPES.has(creditType)) return res.status(400).json({ message: "invalid credit_type" })
      where.push(`ca.credit_type = $${params.length + 1}`)
      params.push(creditType)
    }
    if (status) {
      if (!ACCOUNT_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      where.push(`ca.status = $${params.length + 1}`)
      params.push(status)
    }
    if (tenantId) {
      where.push(`ca.owner_tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (userId) {
      where.push(`ca.owner_user_id = $${params.length + 1}`)
      params.push(userId)
    }
    if (sourceTenantId) {
      where.push(`ca.source_tenant_id = $${params.length + 1}`)
      params.push(sourceTenantId)
    }
    if (q) {
      where.push(
        `(
          COALESCE(ca.display_name, '') ILIKE $${params.length + 1}
          OR COALESCE(ot.name, '') ILIKE $${params.length + 1}
          OR COALESCE(ot.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(ou.email, '') ILIKE $${params.length + 1}
          OR COALESCE(ou.full_name, '') ILIKE $${params.length + 1}
          OR COALESCE(st.name, '') ILIKE $${params.length + 1}
          OR COALESCE(st.slug, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_accounts ca
      LEFT JOIN tenants ot ON ot.id = ca.owner_tenant_id
      LEFT JOIN users ou ON ou.id = ca.owner_user_id
      LEFT JOIN tenants st ON st.id = ca.source_tenant_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        ca.*,
        ot.name AS owner_tenant_name,
        ot.slug AS owner_tenant_slug,
        ot.tenant_type AS owner_tenant_type,
        ou.email AS owner_user_email,
        ou.full_name AS owner_user_name,
        st.name AS source_tenant_name,
        st.slug AS source_tenant_slug
      FROM credit_accounts ca
      LEFT JOIN tenants ot ON ot.id = ca.owner_tenant_id
      LEFT JOIN users ou ON ou.id = ca.owner_user_id
      LEFT JOIN tenants st ON st.id = ca.source_tenant_id
      ${whereSql}
      ORDER BY ca.created_at DESC
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
    console.error("listCreditAccounts error:", e)
    return res.status(500).json({ message: "Failed to list credit accounts", details: String(e?.message || e) })
  }
}

export async function updateCreditAccount(req: Request, res: Response) {
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

    if (input.status !== undefined) {
      const status = toStr(input.status)
      if (!ACCOUNT_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.expires_at !== undefined) {
      setField("expires_at", input.expires_at || null)
    }
    if (input.display_name !== undefined) {
      const displayName = typeof input.display_name === "string" ? input.display_name : null
      setField("display_name", displayName)
    }
    if (input.metadata !== undefined) {
      const metadataInput = input.metadata
      const metadataValue =
        metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}
      if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })
      setField("metadata", JSON.stringify(metadataValue || {}))
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE credit_accounts
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Credit account not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateCreditAccount error:", e)
    return res.status(500).json({ message: "Failed to update credit account", details: String(e?.message || e) })
  }
}

export async function listCreditLedgerEntries(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const accountId = toStr(req.query.account_id)
    const entryType = toStr(req.query.entry_type)
    const ownerType = toStr(req.query.owner_type)
    const creditType = toStr(req.query.credit_type)
    const tenantId = toStr(req.query.tenant_id)
    const userId = toStr(req.query.user_id)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (accountId) {
      where.push(`le.account_id = $${params.length + 1}`)
      params.push(accountId)
    }
    if (entryType) {
      if (!LEDGER_ENTRY_TYPES.has(entryType)) return res.status(400).json({ message: "invalid entry_type" })
      where.push(`le.entry_type = $${params.length + 1}`)
      params.push(entryType)
    }
    if (ownerType) {
      if (!ACCOUNT_OWNER_TYPES.has(ownerType)) return res.status(400).json({ message: "invalid owner_type" })
      where.push(`ca.owner_type = $${params.length + 1}`)
      params.push(ownerType)
    }
    if (creditType) {
      if (!ACCOUNT_CREDIT_TYPES.has(creditType)) return res.status(400).json({ message: "invalid credit_type" })
      where.push(`ca.credit_type = $${params.length + 1}`)
      params.push(creditType)
    }
    if (tenantId) {
      where.push(`ca.owner_tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (userId) {
      where.push(`ca.owner_user_id = $${params.length + 1}`)
      params.push(userId)
    }
    if (q) {
      where.push(
        `(
          COALESCE(ca.display_name, '') ILIKE $${params.length + 1}
          OR COALESCE(ot.name, '') ILIKE $${params.length + 1}
          OR COALESCE(ot.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(ou.email, '') ILIKE $${params.length + 1}
          OR COALESCE(ou.full_name, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_ledger_entries le
      JOIN credit_accounts ca ON ca.id = le.account_id
      LEFT JOIN tenants ot ON ot.id = ca.owner_tenant_id
      LEFT JOIN users ou ON ou.id = ca.owner_user_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        le.*,
        ca.owner_type,
        ca.credit_type,
        ca.status AS account_status,
        ca.display_name AS account_display_name,
        ca.owner_tenant_id,
        ca.owner_user_id,
        ot.name AS owner_tenant_name,
        ot.slug AS owner_tenant_slug,
        ou.email AS owner_user_email,
        ou.full_name AS owner_user_name
      FROM credit_ledger_entries le
      JOIN credit_accounts ca ON ca.id = le.account_id
      LEFT JOIN tenants ot ON ot.id = ca.owner_tenant_id
      LEFT JOIN users ou ON ou.id = ca.owner_user_id
      ${whereSql}
      ORDER BY le.occurred_at DESC, le.created_at DESC
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
    console.error("listCreditLedgerEntries error:", e)
    return res.status(500).json({ message: "Failed to list credit ledger entries", details: String(e?.message || e) })
  }
}

export async function listCreditUsageAllocations(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const accountId = toStr(req.query.account_id)
    const usageLogId = toStr(req.query.usage_log_id)
    const ownerType = toStr(req.query.owner_type)
    const creditType = toStr(req.query.credit_type)
    const tenantId = toStr(req.query.tenant_id)
    const userId = toStr(req.query.user_id)
    const providerSlug = toStr(req.query.provider_slug)
    const modelApiId = toStr(req.query.model_id)
    const modality = toStr(req.query.modality)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (accountId) {
      where.push(`cua.account_id = $${params.length + 1}`)
      params.push(accountId)
    }
    if (usageLogId) {
      where.push(`cua.usage_log_id = $${params.length + 1}`)
      params.push(usageLogId)
    }
    if (ownerType) {
      if (!ACCOUNT_OWNER_TYPES.has(ownerType)) return res.status(400).json({ message: "invalid owner_type" })
      where.push(`ca.owner_type = $${params.length + 1}`)
      params.push(ownerType)
    }
    if (creditType) {
      if (!ACCOUNT_CREDIT_TYPES.has(creditType)) return res.status(400).json({ message: "invalid credit_type" })
      where.push(`ca.credit_type = $${params.length + 1}`)
      params.push(creditType)
    }
    if (tenantId) {
      where.push(`ca.owner_tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (userId) {
      where.push(`cua.user_id = $${params.length + 1}`)
      params.push(userId)
    }
    if (providerSlug) {
      where.push(`COALESCE(p.slug, l.request_data->>'provider_slug') = $${params.length + 1}`)
      params.push(providerSlug)
    }
    if (modelApiId) {
      where.push(`COALESCE(l.resolved_model, m.model_id) = $${params.length + 1}`)
      params.push(modelApiId)
    }
    if (modality) {
      where.push(`l.modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (q) {
      where.push(
        `(
          l.request_id ILIKE $${params.length + 1}
          OR COALESCE(m.display_name, '') ILIKE $${params.length + 1}
          OR COALESCE(l.resolved_model, m.model_id) ILIKE $${params.length + 1}
          OR COALESCE(p.slug, l.request_data->>'provider_slug') ILIKE $${params.length + 1}
          OR COALESCE(ot.name, '') ILIKE $${params.length + 1}
          OR COALESCE(ot.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(ou.email, '') ILIKE $${params.length + 1}
          OR COALESCE(ou.full_name, '') ILIKE $${params.length + 1}
          OR COALESCE(u.email, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_usage_allocations cua
      JOIN credit_accounts ca ON ca.id = cua.account_id
      JOIN llm_usage_logs l ON l.id = cua.usage_log_id
      LEFT JOIN users u ON u.id = cua.user_id
      LEFT JOIN ai_models m ON m.id = l.model_id
      LEFT JOIN ai_providers p ON p.id = l.provider_id
      LEFT JOIN tenants ot ON ot.id = ca.owner_tenant_id
      LEFT JOIN users ou ON ou.id = ca.owner_user_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        cua.id,
        cua.usage_log_id,
        cua.user_id,
        cua.account_id,
        cua.amount_credits,
        cua.created_at,
        l.created_at AS usage_created_at,
        l.request_id,
        l.status AS usage_status,
        l.feature_name,
        l.modality,
        l.total_tokens,
        l.total_cost,
        l.currency,
        COALESCE(l.response_time_ms, l.latency_ms) AS response_time_ms,
        u.email AS usage_user_email,
        m.display_name AS model_display_name,
        COALESCE(l.resolved_model, m.model_id) AS model_api_id,
        COALESCE(p.slug, l.request_data->>'provider_slug') AS provider_slug,
        ca.owner_type,
        ca.credit_type,
        ca.status AS account_status,
        ca.display_name AS account_display_name,
        ca.owner_tenant_id,
        ca.owner_user_id,
        ca.source_tenant_id,
        ot.name AS owner_tenant_name,
        ot.slug AS owner_tenant_slug,
        ou.email AS owner_user_email,
        ou.full_name AS owner_user_name
      FROM credit_usage_allocations cua
      JOIN credit_accounts ca ON ca.id = cua.account_id
      JOIN llm_usage_logs l ON l.id = cua.usage_log_id
      LEFT JOIN users u ON u.id = cua.user_id
      LEFT JOIN ai_models m ON m.id = l.model_id
      LEFT JOIN ai_providers p ON p.id = l.provider_id
      LEFT JOIN tenants ot ON ot.id = ca.owner_tenant_id
      LEFT JOIN users ou ON ou.id = ca.owner_user_id
      ${whereSql}
      ORDER BY l.created_at DESC, cua.created_at DESC
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
    console.error("listCreditUsageAllocations error:", e)
    return res.status(500).json({ message: "Failed to list credit usage allocations", details: String(e?.message || e) })
  }
}
