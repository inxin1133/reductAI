import { Request, Response } from "express"
import type { AuthedRequest } from "../middleware/requireAuth"
import pool, { query } from "../config/db"
import { lookupTenants, lookupUsers } from "../services/identityClient"

function toInt(v: unknown, fallback: number | null = null) {
  if (v === null || v === undefined || v === "") return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.floor(n)
}

/** 소수점 2자리 반올림 (크레딧 정확도) */
function roundToCredit(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
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
const SYSTEM_TENANT_SLUG = "system"
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function systemTenantFilter(column: string) {
  return `NOT EXISTS (
    SELECT 1
    FROM tenants st
    WHERE st.id = ${column}
      AND (COALESCE((st.metadata->>'system')::boolean, FALSE) = TRUE OR st.slug = '${SYSTEM_TENANT_SLUG}')
  )`
}

function uniqIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((v): v is string => typeof v === "string" && v.length > 0)))
}

function isUuid(value: string) {
  return UUID_REGEX.test(value)
}

function resolveRequestedTenantId(req: AuthedRequest): string {
  const headerRaw = req.headers?.["x-tenant-id"]
  const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw
  if (typeof header === "string" && header.trim()) return header.trim()
  return ""
}

async function resolveTenantId(req: AuthedRequest): Promise<string> {
  const requested = resolveRequestedTenantId(req)
  const userId = req.userId ? String(req.userId) : ""
  if (requested && isUuid(requested) && userId) {
    const r = await query(
      `
      SELECT utr.tenant_id
      FROM user_tenant_roles utr
      JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
      WHERE utr.user_id = $1
        AND utr.tenant_id = $2
        AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
        AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
      LIMIT 1
      `,
      [userId, requested]
    )
    if (r.rows.length > 0) return String(r.rows[0].tenant_id)
  }
  const tokenTenantId = req.tenantId ? String(req.tenantId) : ""
  if (tokenTenantId) {
    const r = await query(
      `
      SELECT id
      FROM tenants
      WHERE id = $1
        AND deleted_at IS NULL
        AND COALESCE((metadata->>'system')::boolean, FALSE) = FALSE
      LIMIT 1
      `,
      [tokenTenantId]
    )
    if (r.rows.length > 0) return tokenTenantId
  }
  if (userId) {
    const r = await query(
      `
      SELECT utr.tenant_id
      FROM user_tenant_roles utr
      JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
      WHERE utr.user_id = $1
        AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
        AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
      ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC, utr.granted_at ASC
      LIMIT 1
      `,
      [userId]
    )
    if (r.rows.length > 0) return String(r.rows[0].tenant_id)
  }
  return ""
}

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
        roundToCredit(credits),
        roundToCredit(bonusCredits),
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
      setField("credits", roundToCredit(credits))
    }
    if (input.bonus_credits !== undefined) {
      const bonusCredits = Number(input.bonus_credits)
      if (!Number.isFinite(bonusCredits) || bonusCredits < 0) {
        return res.status(400).json({ message: "bonus_credits must be >= 0" })
      }
      setField("bonus_credits", roundToCredit(bonusCredits))
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
      where.push(`g.plan_slug ILIKE $${params.length + 1}`)
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_plan_grants g
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        g.*
      FROM credit_plan_grants g
      ${whereSql}
      ORDER BY g.created_at DESC
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
    const monthlyRaw = req.body?.monthly_credits
    const initialRaw = req.body?.initial_credits
    const isActive = toBool(req.body?.is_active)
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    const monthlyCredits = Number(monthlyRaw)
    const initialCredits = Number(initialRaw)
    if (!planSlug) return res.status(400).json({ message: "plan_slug is required" })
    if (!GRANT_BILLING_CYCLES.has(billingCycle)) {
      return res.status(400).json({ message: "billing_cycle must be monthly or yearly" })
    }
    if (!GRANT_CREDIT_TYPES.has(creditType)) {
      return res.status(400).json({ message: "credit_type must be subscription or topup" })
    }
    if (!Number.isFinite(monthlyCredits) || monthlyCredits < 0) {
      return res.status(400).json({ message: "monthly_credits must be >= 0" })
    }
    if (!Number.isFinite(initialCredits) || initialCredits < 0) {
      return res.status(400).json({ message: "initial_credits must be >= 0" })
    }
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const result = await query(
      `
      INSERT INTO credit_plan_grants (
        plan_slug, billing_cycle, credit_type, monthly_credits, initial_credits, is_active, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      RETURNING *
      `,
      [
        planSlug,
        billingCycle,
        creditType,
        roundToCredit(monthlyCredits),
        roundToCredit(initialCredits),
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
      if (!GRANT_BILLING_CYCLES.has(billingCycle)) {
        return res.status(400).json({ message: "billing_cycle must be monthly or yearly" })
      }
      setField("billing_cycle", billingCycle)
    }
    if (input.credit_type !== undefined) {
      const creditType = toStr(input.credit_type)
      if (!GRANT_CREDIT_TYPES.has(creditType)) {
        return res.status(400).json({ message: "credit_type must be subscription or topup" })
      }
      setField("credit_type", creditType)
    }
    if (input.monthly_credits !== undefined) {
      const monthlyCredits = Number(input.monthly_credits)
      if (!Number.isFinite(monthlyCredits) || monthlyCredits < 0) {
        return res.status(400).json({ message: "monthly_credits must be >= 0" })
      }
      setField("monthly_credits", roundToCredit(monthlyCredits))
    }
    if (input.initial_credits !== undefined) {
      const initialCredits = Number(input.initial_credits)
      if (!Number.isFinite(initialCredits) || initialCredits < 0) {
        return res.status(400).json({ message: "initial_credits must be >= 0" })
      }
      setField("initial_credits", roundToCredit(initialCredits))
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
          OR COALESCE(ct.from_account_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(ct.to_account_id::text, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    where.push(systemTenantFilter("fa.owner_tenant_id"))
    where.push(systemTenantFilter("ta.owner_tenant_id"))

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_transfers ct
      JOIN credit_accounts fa ON fa.id = ct.from_account_id
      JOIN credit_accounts ta ON ta.id = ct.to_account_id
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
        ta.owner_type AS to_owner_type,
        ta.owner_tenant_id AS to_owner_tenant_id,
        ta.owner_user_id AS to_owner_user_id,
        ta.display_name AS to_display_name
      FROM credit_transfers ct
      JOIN credit_accounts fa ON fa.id = ct.from_account_id
      JOIN credit_accounts ta ON ta.id = ct.to_account_id
      ${whereSql}
      ORDER BY ct.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const userIds = uniqIds(
      listRes.rows.flatMap((row) => [row.from_owner_user_id, row.to_owner_user_id, row.requested_by, row.approved_by])
    )
    const tenantIds = uniqIds(listRes.rows.flatMap((row) => [row.from_owner_tenant_id, row.to_owner_tenant_id]))

    const [userMap, tenantMap] = await Promise.all([
      lookupUsers(userIds, authHeader),
      lookupTenants(tenantIds, authHeader),
    ])

    const rows = listRes.rows.map((row) => {
      const fromTenant = row.from_owner_tenant_id ? tenantMap.get(String(row.from_owner_tenant_id)) : undefined
      const toTenant = row.to_owner_tenant_id ? tenantMap.get(String(row.to_owner_tenant_id)) : undefined
      const fromUser = row.from_owner_user_id ? userMap.get(String(row.from_owner_user_id)) : undefined
      const toUser = row.to_owner_user_id ? userMap.get(String(row.to_owner_user_id)) : undefined
      const requested = row.requested_by ? userMap.get(String(row.requested_by)) : undefined
      const approved = row.approved_by ? userMap.get(String(row.approved_by)) : undefined

      return {
        ...row,
        from_tenant_name: fromTenant?.name ?? null,
        from_tenant_slug: fromTenant?.slug ?? null,
        from_user_email: fromUser?.email ?? null,
        from_user_name: fromUser?.full_name ?? null,
        to_tenant_name: toTenant?.name ?? null,
        to_tenant_slug: toTenant?.slug ?? null,
        to_user_email: toUser?.email ?? null,
        to_user_name: toUser?.full_name ?? null,
        requested_email: requested?.email ?? null,
        requested_name: requested?.full_name ?? null,
        approved_email: approved?.email ?? null,
        approved_name: approved?.full_name ?? null,
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
          OR COALESCE(ca.owner_tenant_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(ca.owner_user_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(ca.source_tenant_id::text, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    where.push(systemTenantFilter("ca.owner_tenant_id"))
    where.push(systemTenantFilter("ca.source_tenant_id"))

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM credit_accounts ca ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT
        ca.*
      FROM credit_accounts ca
      ${whereSql}
      ORDER BY ca.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = uniqIds(listRes.rows.flatMap((row) => [row.owner_tenant_id, row.source_tenant_id]))
    const userIds = uniqIds(listRes.rows.flatMap((row) => [row.owner_user_id]))
    const [tenantMap, userMap] = await Promise.all([
      lookupTenants(tenantIds, authHeader),
      lookupUsers(userIds, authHeader),
    ])

    const rows = listRes.rows.map((row) => {
      const ownerTenant = row.owner_tenant_id ? tenantMap.get(String(row.owner_tenant_id)) : undefined
      const sourceTenant = row.source_tenant_id ? tenantMap.get(String(row.source_tenant_id)) : undefined
      const ownerUser = row.owner_user_id ? userMap.get(String(row.owner_user_id)) : undefined
      return {
        ...row,
        owner_tenant_name: ownerTenant?.name ?? null,
        owner_tenant_slug: ownerTenant?.slug ?? null,
        owner_tenant_type: ownerTenant?.tenant_type ?? null,
        owner_user_email: ownerUser?.email ?? null,
        owner_user_name: ownerUser?.full_name ?? null,
        source_tenant_name: sourceTenant?.name ?? null,
        source_tenant_slug: sourceTenant?.slug ?? null,
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
      const displayName = toStr(input.display_name)
      setField("display_name", displayName || null)
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

type GrantMode = "reset" | "increment"

function normalizeUsageAmount(amount: number) {
  if (!Number.isFinite(amount)) return 0
  return amount < 0 ? -amount : amount
}

function toIsoString(value: unknown): string {
  if (!value) return ""
  if (value instanceof Date) return value.toISOString()
  const s = String(value).trim()
  if (!s) return ""
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toISOString()
}

export async function getMyCreditSummary(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = await resolveTenantId(authed)
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })

    const subscriptionRes = await query(
      `
      SELECT
        s.id,
        s.billing_cycle,
        s.current_period_start,
        s.current_period_end,
        b.slug AS plan_slug,
        b.tier AS plan_tier
      FROM billing_subscriptions s
      JOIN billing_plans b ON b.id = s.plan_id
      WHERE s.tenant_id = $1
        AND s.status <> 'cancelled'
      ORDER BY s.created_at DESC
      LIMIT 1
      `,
      [tenantId]
    )
    const subscription = subscriptionRes.rows[0] as
      | {
          id: string
          billing_cycle: string
          current_period_start: string
          current_period_end: string
          plan_slug: string
          plan_tier: string
        }
      | undefined

    const planGrant = subscription
      ? (
          await query(
            `
            SELECT monthly_credits, initial_credits
            FROM credit_plan_grants
            WHERE plan_slug = $1
              AND billing_cycle = $2
              AND credit_type = 'subscription'
              AND is_active = TRUE
            LIMIT 1
            `,
            [subscription.plan_slug, subscription.billing_cycle]
          )
        ).rows[0]
      : null

    const subscriptionAccountRes = await query(
      `
      SELECT id, balance_credits, reserved_credits, expires_at
      FROM credit_accounts
      WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'subscription'
      LIMIT 1
      `,
      [tenantId]
    )
    const subscriptionAccount = subscriptionAccountRes.rows[0] as
      | { id: string; balance_credits: number; reserved_credits: number; expires_at?: string | null }
      | undefined

    const topupAccountRes = await query(
      `
      SELECT id, balance_credits, reserved_credits, expires_at
      FROM credit_accounts
      WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'topup'
      LIMIT 1
      `,
      [tenantId]
    )
    const topupAccount = topupAccountRes.rows[0] as
      | { id: string; balance_credits: number; reserved_credits: number; expires_at?: string | null }
      | undefined

    let summaryPeriodStart = toIsoString(subscription?.current_period_start)
    let summaryPeriodEnd = toIsoString(subscription?.current_period_end)
    if (!summaryPeriodStart && !summaryPeriodEnd && subscriptionAccount?.expires_at) {
      const exp = new Date(subscriptionAccount.expires_at)
      summaryPeriodEnd = exp.toISOString()
      const start = new Date(exp)
      start.setFullYear(start.getFullYear() - 1)
      summaryPeriodStart = start.toISOString()
    }

    const userId = toStr((authed as AuthedRequest).userId)

    let usedInPeriod = 0
    let userUsedInPeriod = 0
    if (subscriptionAccount?.id && summaryPeriodStart && summaryPeriodEnd) {
      const usageRes = await query(
        `
        SELECT COALESCE(SUM(amount_credits), 0) AS total
        FROM credit_ledger_entries
        WHERE account_id = $1
          AND entry_type = 'usage'
          AND occurred_at >= $2
          AND occurred_at < $3
        `,
        [subscriptionAccount.id, summaryPeriodStart, summaryPeriodEnd]
      )
      usedInPeriod = normalizeUsageAmount(Number(usageRes.rows[0]?.total ?? 0))

      if (userId) {
        const userUsageRes = await query(
          `
          SELECT COALESCE(SUM(amount_credits), 0) AS total
          FROM credit_usage_allocations
          WHERE account_id = $1
            AND user_id = $2
            AND created_at >= $3
            AND created_at < $4
          `,
          [subscriptionAccount.id, userId, summaryPeriodStart, summaryPeriodEnd]
        )
        userUsedInPeriod = normalizeUsageAmount(Number(userUsageRes.rows[0]?.total ?? 0))
      }
    }

    let topupUsedInPeriod = 0
    let topupLastTopupAt: string | null = null
    let topupAllowWhenEmpty: boolean | null = null
    if (topupAccount?.id) {
      if (summaryPeriodStart && summaryPeriodEnd) {
        const topupUsageRes = await query(
          `
          SELECT COALESCE(SUM(amount_credits), 0) AS total
          FROM credit_ledger_entries
          WHERE account_id = $1
            AND entry_type = 'usage'
            AND occurred_at >= $2
            AND occurred_at < $3
          `,
          [topupAccount.id, summaryPeriodStart, summaryPeriodEnd]
        )
        topupUsedInPeriod = normalizeUsageAmount(Number(topupUsageRes.rows[0]?.total ?? 0))
      }

      const lastTopupRes = await query(
        `
        SELECT occurred_at
        FROM credit_ledger_entries
        WHERE account_id = $1
          AND entry_type = 'topup_purchase'
        ORDER BY occurred_at DESC
        LIMIT 1
        `,
        [topupAccount.id]
      )
      topupLastTopupAt = lastTopupRes.rows[0]?.occurred_at ? toIsoString(lastTopupRes.rows[0].occurred_at) : null

      if (userId) {
        const allowRes = await query(
          `
          SELECT allow_when_empty
          FROM credit_account_access
          WHERE user_id = $1 AND account_id = $2
          LIMIT 1
          `,
          [userId, topupAccount.id]
        )
        topupAllowWhenEmpty =
          allowRes.rows[0]?.allow_when_empty === true || allowRes.rows[0]?.allow_when_empty === false
            ? Boolean(allowRes.rows[0].allow_when_empty)
            : null
      }
    }

    const subscriptionBalance = Number(subscriptionAccount?.balance_credits ?? 0)
    const subscriptionReserved = Number(subscriptionAccount?.reserved_credits ?? 0)
    const subscriptionRemaining = Math.max(0, subscriptionBalance - subscriptionReserved)

    const topupBalance = Number(topupAccount?.balance_credits ?? 0)
    const topupReserved = Number(topupAccount?.reserved_credits ?? 0)
    const topupRemaining = Math.max(0, topupBalance - topupReserved)
    const topupTotal = topupRemaining + topupUsedInPeriod
    const topupPercent = topupTotal > 0 ? Math.min(100, Math.round((topupUsedInPeriod / topupTotal) * 100)) : 0

    const hasSubscriptionAccount = Boolean(subscriptionAccount?.id)
    const hasBillingSubscription = Boolean(subscription)
    const subscriptionPayload =
      hasSubscriptionAccount || hasBillingSubscription
        ? {
            subscription_id: subscription?.id ?? null,
            plan_slug: subscription?.plan_slug ?? "free",
            plan_tier: subscription?.plan_tier ?? "free",
            billing_cycle: subscription?.billing_cycle ?? "monthly",
            period_start: subscription?.current_period_start ?? summaryPeriodStart ?? null,
            period_end: subscription?.current_period_end ?? summaryPeriodEnd ?? subscriptionAccount?.expires_at ?? null,
            next_charge_at: subscription?.current_period_end ?? subscriptionAccount?.expires_at ?? null,
            expires_at: subscription?.current_period_end ?? subscriptionAccount?.expires_at ?? null,
            grant_monthly: Number(planGrant?.monthly_credits ?? 0),
            grant_initial: Number(planGrant?.initial_credits ?? 0),
            account_id: subscriptionAccount?.id ?? null,
            balance_credits: subscriptionBalance,
            reserved_credits: subscriptionReserved,
            remaining_credits: subscriptionRemaining,
            used_credits: usedInPeriod,
            user_used_credits: userUsedInPeriod,
          }
        : null

    return res.json({
      ok: true,
      tenant_id: tenantId,
      subscription: subscriptionPayload,
      topup: {
        account_id: topupAccount?.id ?? null,
        balance_credits: topupBalance,
        reserved_credits: topupReserved,
        remaining_credits: topupRemaining,
        expires_at: topupAccount?.expires_at ?? null,
        used_credits: topupUsedInPeriod,
        total_credits: topupTotal,
        usage_percent: topupPercent,
        last_topup_at: topupLastTopupAt,
        allow_when_empty: topupAllowWhenEmpty,
      },
    })
  } catch (e: any) {
    console.error("getMyCreditSummary error:", e)
    return res.status(500).json({ message: "Failed to load credit summary", details: String(e?.message || e) })
  }
}

export async function getMyServiceUsage(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = await resolveTenantId(authed)
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })

    const periodEndRaw = toStr(req.query.period_end)
    const invoiceId = toStr(req.query.invoice_id)

    const subscriptionRes = await query(
      `
      SELECT
        s.id,
        s.billing_cycle,
        s.current_period_start,
        s.current_period_end,
        b.slug AS plan_slug,
        b.tier AS plan_tier
      FROM billing_subscriptions s
      JOIN billing_plans b ON b.id = s.plan_id
      WHERE s.tenant_id = $1
        AND s.status <> 'cancelled'
      ORDER BY s.created_at DESC
      LIMIT 1
      `,
      [tenantId]
    )
    const subscription = subscriptionRes.rows[0] as
      | {
          id: string
          billing_cycle: string
          current_period_start: string
          current_period_end: string
          plan_slug: string
          plan_tier: string
        }
      | undefined

    const invoicePeriodsRes = await query(
      `
      SELECT DISTINCT ON (period_end)
        id,
        period_start,
        period_end,
        created_at
      FROM billing_invoices
      WHERE tenant_id = $1
      ORDER BY period_end DESC, created_at DESC
      LIMIT 6
      `,
      [tenantId]
    )

    const periods: Array<{ invoice_id: string | null; period_start: string; period_end: string }> =
      invoicePeriodsRes.rows.map((row) => ({
        invoice_id: row.id ? String(row.id) : null,
        period_start: toIsoString(row.period_start),
        period_end: toIsoString(row.period_end),
      }))

    const subPeriodStart = toIsoString(subscription?.current_period_start)
    const subPeriodEnd = toIsoString(subscription?.current_period_end)

    if (subscription && subPeriodEnd) {
      const hasCurrent = periods.some((period) => period.period_end === subPeriodEnd)
      if (!hasCurrent) {
        periods.unshift({
          invoice_id: null,
          period_start: subPeriodStart,
          period_end: subPeriodEnd,
        })
      }
    }

    let selectedPeriod:
      | {
          invoice_id: string | null
          period_start: string
          period_end: string
        }
      | null = null

    if (invoiceId) {
      const invoiceRes = await query(
        `
        SELECT id, period_start, period_end
        FROM billing_invoices
        WHERE id = $1 AND tenant_id = $2
        LIMIT 1
        `,
        [invoiceId, tenantId]
      )
      const invoiceRow = invoiceRes.rows[0]
      if (!invoiceRow) {
        return res.status(404).json({ message: "invoice not found" })
      }
      selectedPeriod = {
        invoice_id: String(invoiceRow.id),
        period_start: toIsoString(invoiceRow.period_start),
        period_end: toIsoString(invoiceRow.period_end),
      }
      if (!periods.some((period) => period.period_end === selectedPeriod?.period_end)) {
        periods.unshift(selectedPeriod)
      }
    } else if (periodEndRaw) {
      const periodEndIso = toIsoString(periodEndRaw)
      const match = periods.find((period) => period.period_end === periodEndIso || period.period_end === periodEndRaw)
      if (!match) {
        return res.status(400).json({ message: "period_end not found" })
      }
      selectedPeriod = match
    } else if (periods.length > 0) {
      selectedPeriod = periods[0]
    } else if (subscription && subPeriodEnd) {
      selectedPeriod = {
        invoice_id: null,
        period_start: subPeriodStart,
        period_end: subPeriodEnd,
      }
    }

    const planGrant = subscription
      ? (
          await query(
            `
            SELECT monthly_credits, initial_credits
            FROM credit_plan_grants
            WHERE plan_slug = $1
              AND billing_cycle = $2
              AND credit_type = 'subscription'
              AND is_active = TRUE
            LIMIT 1
            `,
            [subscription.plan_slug, subscription.billing_cycle]
          )
        ).rows[0]
      : null

    const subscriptionAccountRes = await query(
      `
      SELECT id, balance_credits, reserved_credits
      FROM credit_accounts
      WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'subscription'
      LIMIT 1
      `,
      [tenantId]
    )
    const subscriptionAccount = subscriptionAccountRes.rows[0] as
      | { id: string; balance_credits: number; reserved_credits: number }
      | undefined

    let usedInPeriod = 0
    if (subscriptionAccount?.id && selectedPeriod) {
      const usageRes = await query(
        `
        SELECT COALESCE(SUM(amount_credits), 0) AS total
        FROM credit_ledger_entries
        WHERE account_id = $1
          AND entry_type = 'usage'
          AND occurred_at >= $2
          AND occurred_at < $3
        `,
        [subscriptionAccount.id, selectedPeriod.period_start, selectedPeriod.period_end]
      )
      usedInPeriod = normalizeUsageAmount(Number(usageRes.rows[0]?.total ?? 0))
    }

    const planTotal = Number(planGrant?.monthly_credits ?? 0)
    const accountRemaining = subscriptionAccount
      ? Math.max(0, Number(subscriptionAccount.balance_credits ?? 0) - Number(subscriptionAccount.reserved_credits ?? 0))
      : 0
    const totalCredits = planTotal > 0 ? planTotal : usedInPeriod + accountRemaining
    const remainingCredits = planTotal > 0 ? Math.max(0, totalCredits - usedInPeriod) : accountRemaining
    const usagePercent = totalCredits > 0 ? Math.min(100, (usedInPeriod / totalCredits) * 100) : 0

    let members: Array<{
      user_id: string
      used_credits: number
      max_per_period: number | null
      is_active: boolean
      user_name: string | null
      user_email: string | null
      role_slug: string | null
      joined_at: string | null
      profile_image_url: string | null
    }> = []

    if (subscriptionAccount?.id && selectedPeriod) {
      await query(
        `
        INSERT INTO credit_account_access (user_id, account_id, priority, max_per_period, allow_when_empty, is_active)
        SELECT utr.user_id, $1, 0, NULL, FALSE, TRUE
        FROM user_tenant_roles utr
        WHERE utr.tenant_id = $2
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
        ON CONFLICT (user_id, account_id) DO NOTHING
        `,
        [subscriptionAccount.id, tenantId]
      )

      const memberUsageRes = await query(
        `
        SELECT
          utr.user_id,
          r.slug AS role_slug,
          utr.joined_at,
          u.full_name AS user_name,
          u.email AS user_email,
          u.metadata->>'profile_image_asset_id' AS profile_image_asset_id,
          caa.max_per_period,
          caa.is_active,
          COALESCE(SUM(cua.amount_credits), 0) AS used_credits,
          MAX(user_tier.user_plan_tier) AS user_plan_tier
        FROM user_tenant_roles utr
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            NULLIF((
              SELECT TRIM(COALESCE(NULLIF(t.metadata->>'plan_tier',''), NULLIF(t.metadata->>'service_tier',''), NULLIF(t.metadata->>'tier','')))
              FROM tenants t
              WHERE t.owner_id = utr.user_id AND t.deleted_at IS NULL
                AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
              LIMIT 1
            ), ''),
            NULLIF((
              SELECT TRIM(COALESCE(NULLIF(t2.metadata->>'plan_tier',''), NULLIF(t2.metadata->>'service_tier',''), NULLIF(t2.metadata->>'tier','')))
              FROM user_tenant_roles utr2
              JOIN tenants t2 ON t2.id = utr2.tenant_id AND t2.deleted_at IS NULL
              WHERE utr2.user_id = utr.user_id
                AND (utr2.membership_status IS NULL OR utr2.membership_status = 'active')
                AND COALESCE((t2.metadata->>'system')::boolean, FALSE) = FALSE
              ORDER BY COALESCE(utr2.is_primary_tenant, FALSE) DESC, utr2.joined_at ASC NULLS LAST
              LIMIT 1
            ), ''),
            'free'
          ) AS user_plan_tier
        ) user_tier ON TRUE
        JOIN roles r ON r.id = utr.role_id
        JOIN users u ON u.id = utr.user_id AND u.deleted_at IS NULL
        LEFT JOIN credit_account_access caa
          ON caa.user_id = utr.user_id
          AND caa.account_id = $1
        LEFT JOIN credit_usage_allocations cua
          ON cua.account_id = $1
          AND cua.user_id = utr.user_id
          AND cua.created_at >= $2
          AND cua.created_at < $3
        WHERE utr.tenant_id = $4
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND r.slug NOT IN ('viewer', 'tenant_viewer')
        GROUP BY utr.user_id, r.slug, utr.joined_at, u.full_name, u.email, u.metadata, caa.max_per_period, caa.is_active
        ORDER BY
          CASE r.slug
            WHEN 'owner' THEN 0 WHEN 'tenant_owner' THEN 0
            WHEN 'admin' THEN 1 WHEN 'tenant_admin' THEN 1
            WHEN 'member' THEN 2 WHEN 'tenant_member' THEN 2
            ELSE 3
          END,
          utr.joined_at ASC
        `,
        [subscriptionAccount.id, selectedPeriod.period_start, selectedPeriod.period_end, tenantId]
      )

      members = memberUsageRes.rows.map((row) => {
        const profileAssetId = row.profile_image_asset_id ? String(row.profile_image_asset_id) : null
        const planTierRaw = row.user_plan_tier ? String(row.user_plan_tier).trim().toLowerCase() : ""
        return {
          user_id: String(row.user_id || ""),
          used_credits: normalizeUsageAmount(Number(row.used_credits ?? 0)),
          max_per_period:
            row.max_per_period === null || row.max_per_period === undefined ? null : Number(row.max_per_period),
          is_active: row.is_active !== false,
          user_name: row.user_name ?? null,
          user_email: row.user_email ?? null,
          role_slug: row.role_slug ?? null,
          joined_at: row.joined_at ? toIsoString(row.joined_at) : null,
          profile_image_url: profileAssetId ? `/api/ai/media/assets/${profileAssetId}` : null,
          plan_tier: planTierRaw || "free",
        }
      })
    }

    return res.json({
      ok: true,
      tenant_id: tenantId,
      current_period_end: subPeriodEnd || null,
      periods,
      summary:
        subscription && selectedPeriod
          ? {
              period_start: selectedPeriod.period_start,
              period_end: selectedPeriod.period_end,
              plan_slug: subscription.plan_slug,
              plan_tier: subscription.plan_tier,
              billing_cycle: subscription.billing_cycle,
              total_credits: totalCredits,
              used_credits: usedInPeriod,
              remaining_credits: remainingCredits,
              usage_percent: usagePercent,
              account_id: subscriptionAccount?.id ?? null,
            }
          : null,
      members,
    })
  } catch (e: any) {
    console.error("getMyServiceUsage error:", e)
    return res.status(500).json({ message: "Failed to load service usage", details: String(e?.message || e) })
  }
}

export async function updateMemberCreditAccess(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = await resolveTenantId(authed)
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })

    const targetUserId = toStr(req.body?.user_id)
    if (!targetUserId || !isUuid(targetUserId))
      return res.status(400).json({ message: "user_id is required (UUID)" })

    const memberCheck = await query(
      `
      SELECT utr.user_id, r.slug AS role_slug
      FROM user_tenant_roles utr
      JOIN roles r ON r.id = utr.role_id
      WHERE utr.user_id = $1 AND utr.tenant_id = $2
        AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
      LIMIT 1
      `,
      [targetUserId, tenantId]
    )
    if (memberCheck.rows.length === 0) return res.status(404).json({ message: "member not found" })

    const roleSlug = String(memberCheck.rows[0].role_slug || "").toLowerCase()
    if (roleSlug === "owner" || roleSlug === "tenant_owner")
      return res.status(400).json({ message: "owner credit access cannot be changed" })
    const accountRes = await query(
      `SELECT id, balance_credits, reserved_credits FROM credit_accounts WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'subscription' LIMIT 1`,
      [tenantId]
    )
    const accountRow = accountRes.rows[0]
    const accountId = accountRow?.id
    if (!accountId) return res.status(404).json({ message: "subscription account not found" })

    const subscriptionRes = await query(
      `
      SELECT s.billing_cycle, b.slug AS plan_slug
      FROM billing_subscriptions s
      JOIN billing_plans b ON b.id = s.plan_id
      WHERE s.tenant_id = $1
        AND s.status <> 'cancelled'
      ORDER BY s.created_at DESC
      LIMIT 1
      `,
      [tenantId]
    )
    const subscription = subscriptionRes.rows[0] as
      | { billing_cycle: string; plan_slug: string }
      | undefined

    const planGrant = subscription
      ? (
          await query(
            `
            SELECT monthly_credits
            FROM credit_plan_grants
            WHERE plan_slug = $1
              AND billing_cycle = $2
              AND credit_type = 'subscription'
              AND is_active = TRUE
            LIMIT 1
            `,
            [subscription.plan_slug, subscription.billing_cycle]
          )
        ).rows[0]
      : null

    const planTotal = Number(planGrant?.monthly_credits ?? 0)
    const accountRemaining = accountRow
      ? Math.max(0, Number(accountRow.balance_credits ?? 0) - Number(accountRow.reserved_credits ?? 0))
      : 0
    const totalCredits = planTotal > 0 ? planTotal : accountRemaining

    const fields: string[] = []
    const params: unknown[] = []

    const isActiveInput = toBool(req.body?.is_active)
    if (isActiveInput !== null) {
      params.push(isActiveInput)
      fields.push(`is_active = $${params.length}`)
    }

    const maxPerPeriodInput = req.body?.max_per_period
    if (maxPerPeriodInput !== undefined) {
      if (maxPerPeriodInput === null || maxPerPeriodInput === "") {
        fields.push(`max_per_period = NULL`)
      } else {
        const maxVal = toInt(maxPerPeriodInput, null)
        if (maxVal === null || maxVal < 0) return res.status(400).json({ message: "invalid max_per_period" })
        if (totalCredits > 0 && maxVal > totalCredits) {
          return res.status(400).json({ message: "max_per_period exceeds total credits", total_credits: totalCredits })
        }
        params.push(maxVal)
        fields.push(`max_per_period = $${params.length}`)
      }
    }

    if (fields.length === 0) return res.status(400).json({ message: "no fields to update" })

    params.push(targetUserId, accountId)
    const result = await query(
      `
      UPDATE credit_account_access
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $${params.length - 1} AND account_id = $${params.length}
      RETURNING user_id, account_id, is_active, max_per_period
      `,
      params
    )

    if (result.rows.length === 0) {
      await query(
        `
        INSERT INTO credit_account_access (user_id, account_id, priority, max_per_period, allow_when_empty, is_active)
        VALUES ($1, $2, 0, NULL, FALSE, TRUE)
        ON CONFLICT (user_id, account_id) DO NOTHING
        `,
        [targetUserId, accountId]
      )
      params.length = 0
      if (isActiveInput !== null) {
        params.push(isActiveInput)
        fields.length = 0
        fields.push(`is_active = $${params.length}`)
      }
      if (maxPerPeriodInput !== undefined) {
        if (maxPerPeriodInput === null || maxPerPeriodInput === "") {
          fields.push(`max_per_period = NULL`)
        } else {
          const maxVal = toInt(maxPerPeriodInput, null)
          if (maxVal !== null) {
            if (totalCredits > 0 && maxVal > totalCredits) {
              return res.status(400).json({ message: "max_per_period exceeds total credits", total_credits: totalCredits })
            }
            params.push(maxVal)
            fields.push(`max_per_period = $${params.length}`)
          }
        }
      }
      if (fields.length > 0) {
        params.push(targetUserId, accountId)
        await query(
          `UPDATE credit_account_access SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${params.length - 1} AND account_id = $${params.length}`,
          params
        )
      }
      const refetch = await query(
        `SELECT user_id, account_id, is_active, max_per_period FROM credit_account_access WHERE user_id = $1 AND account_id = $2`,
        [targetUserId, accountId]
      )
      return res.json({ ok: true, row: refetch.rows[0] ?? null })
    }

    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateMemberCreditAccess error:", e)
    return res.status(500).json({ message: "Failed to update member credit access", details: String(e?.message || e) })
  }
}

export async function updateMyTopupAutoUse(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = await resolveTenantId(authed)
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })

    const userId = toStr((authed as AuthedRequest).userId)
    if (!userId) return res.status(401).json({ message: "user_id is required" })

    const allowWhenEmpty = toBool(req.body?.allow_when_empty)
    if (allowWhenEmpty === null) return res.status(400).json({ message: "allow_when_empty is required" })

    const accountRes = await query(
      `SELECT id FROM credit_accounts WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'topup' LIMIT 1`,
      [tenantId]
    )
    const accountId = accountRes.rows[0]?.id
    if (!accountId) return res.status(404).json({ message: "topup account not found" })

    const result = await query(
      `
      INSERT INTO credit_account_access (user_id, account_id, priority, max_per_period, allow_when_empty, is_active)
      VALUES ($1, $2, 0, NULL, $3, TRUE)
      ON CONFLICT (user_id, account_id)
      DO UPDATE SET
        allow_when_empty = EXCLUDED.allow_when_empty,
        updated_at = CURRENT_TIMESTAMP
      RETURNING user_id, account_id, allow_when_empty
      `,
      [userId, accountId, allowWhenEmpty]
    )

    return res.json({ ok: true, row: result.rows[0] ?? null })
  } catch (e: any) {
    console.error("updateMyTopupAutoUse error:", e)
    return res.status(500).json({ message: "Failed to update topup auto use", details: String(e?.message || e) })
  }
}

export async function getMyTopupUsage(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = await resolveTenantId(authed)
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })

    const periodEndRaw = toStr(req.query.period_end)
    const invoiceId = toStr(req.query.invoice_id)

    const subscriptionRes = await query(
      `
      SELECT
        s.id,
        s.billing_cycle,
        s.current_period_start,
        s.current_period_end,
        b.slug AS plan_slug,
        b.tier AS plan_tier
      FROM billing_subscriptions s
      JOIN billing_plans b ON b.id = s.plan_id
      WHERE s.tenant_id = $1
        AND s.status <> 'cancelled'
      ORDER BY s.created_at DESC
      LIMIT 1
      `,
      [tenantId]
    )
    const subscription = subscriptionRes.rows[0] as
      | {
          id: string
          billing_cycle: string
          current_period_start: string
          current_period_end: string
          plan_slug: string
          plan_tier: string
        }
      | undefined

    const invoicePeriodsRes = await query(
      `
      SELECT DISTINCT ON (period_end)
        id,
        period_start,
        period_end,
        created_at
      FROM billing_invoices
      WHERE tenant_id = $1
      ORDER BY period_end DESC, created_at DESC
      LIMIT 6
      `,
      [tenantId]
    )

    const periods = invoicePeriodsRes.rows.map((row) => ({
      invoice_id: row.id as string,
      period_start: toIsoString(row.period_start),
      period_end: toIsoString(row.period_end),
    }))

    const subPeriodStart = toIsoString(subscription?.current_period_start)
    const subPeriodEnd = toIsoString(subscription?.current_period_end)

    if (subscription && subPeriodEnd) {
      const hasCurrent = periods.some((period) => period.period_end === subPeriodEnd)
      if (!hasCurrent) {
        periods.unshift({
          invoice_id: null as unknown as string,
          period_start: subPeriodStart,
          period_end: subPeriodEnd,
        })
      }
    }

    let selectedPeriod: { invoice_id: string | null; period_start: string; period_end: string } | null = null

    if (invoiceId) {
      const invoiceRes = await query(
        `SELECT id, period_start, period_end FROM billing_invoices WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [invoiceId, tenantId]
      )
      const invoiceRow = invoiceRes.rows[0]
      if (!invoiceRow) return res.status(404).json({ message: "invoice not found" })
      selectedPeriod = {
        invoice_id: String(invoiceRow.id),
        period_start: toIsoString(invoiceRow.period_start),
        period_end: toIsoString(invoiceRow.period_end),
      }
      if (!periods.some((p) => p.period_end === selectedPeriod?.period_end)) {
        periods.unshift(selectedPeriod as any)
      }
    } else if (periodEndRaw) {
      const periodEndIso = toIsoString(periodEndRaw)
      const match = periods.find((p) => p.period_end === periodEndIso || p.period_end === periodEndRaw)
      if (!match) return res.status(400).json({ message: "period_end not found" })
      selectedPeriod = match
    } else if (periods.length > 0) {
      selectedPeriod = periods[0]
    } else if (subscription && subPeriodEnd) {
      selectedPeriod = { invoice_id: null, period_start: subPeriodStart, period_end: subPeriodEnd }
    }

    const topupAccountRes = await query(
      `
      SELECT id, balance_credits, reserved_credits, expires_at
      FROM credit_accounts
      WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'topup'
      LIMIT 1
      `,
      [tenantId]
    )
    const topupAccount = topupAccountRes.rows[0] as
      | { id: string; balance_credits: number; reserved_credits: number; expires_at?: string | null }
      | undefined

    const subscriptionAccountRes = await query(
      `
      SELECT id
      FROM credit_accounts
      WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'subscription'
      LIMIT 1
      `,
      [tenantId]
    )
    const subscriptionAccountId = subscriptionAccountRes.rows[0]?.id as string | undefined

    let usedInPeriod = 0
    if (topupAccount?.id && selectedPeriod) {
      const usageRes = await query(
        `
        SELECT COALESCE(SUM(amount_credits), 0) AS total
        FROM credit_ledger_entries
        WHERE account_id = $1
          AND entry_type = 'usage'
          AND occurred_at >= $2
          AND occurred_at < $3
        `,
        [topupAccount.id, selectedPeriod.period_start, selectedPeriod.period_end]
      )
      usedInPeriod = normalizeUsageAmount(Number(usageRes.rows[0]?.total ?? 0))
    }

    const topupBalance = Number(topupAccount?.balance_credits ?? 0)
    const topupReserved = Number(topupAccount?.reserved_credits ?? 0)
    const topupRemaining = Math.max(0, topupBalance - topupReserved)
    const topupTotal = topupRemaining + usedInPeriod
    const topupPercent = topupTotal > 0 ? Math.min(100, Math.round((usedInPeriod / topupTotal) * 100)) : 0

    const userId = toStr((authed as AuthedRequest).userId)
    let allowWhenEmpty: boolean | null = null
    if (topupAccount?.id && userId) {
      const allowRes = await query(
        `SELECT allow_when_empty FROM credit_account_access WHERE user_id = $1 AND account_id = $2 LIMIT 1`,
        [userId, topupAccount.id]
      )
      allowWhenEmpty =
        allowRes.rows[0]?.allow_when_empty === true || allowRes.rows[0]?.allow_when_empty === false
          ? Boolean(allowRes.rows[0].allow_when_empty)
          : null
    }

    let members: Array<{
      user_id: string
      used_credits: number
      is_active: boolean
      user_name: string | null
      user_email: string | null
      role_slug: string | null
      joined_at: string | null
      profile_image_url: string | null
    }> = []

    if (topupAccount?.id && selectedPeriod && subscriptionAccountId) {
      await query(
        `
        INSERT INTO credit_account_access (user_id, account_id, priority, max_per_period, allow_when_empty, is_active)
        SELECT utr.user_id, $1, 0, NULL, FALSE, TRUE
        FROM user_tenant_roles utr
        WHERE utr.tenant_id = $2
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
        ON CONFLICT (user_id, account_id) DO NOTHING
        `,
        [subscriptionAccountId, tenantId]
      )

      await query(
        `
        INSERT INTO credit_account_access (user_id, account_id, priority, max_per_period, allow_when_empty, is_active)
        SELECT utr.user_id, $1, 0, NULL, FALSE, TRUE
        FROM user_tenant_roles utr
        JOIN roles r ON r.id = utr.role_id
        JOIN credit_account_access svc_access
          ON svc_access.user_id = utr.user_id
          AND svc_access.account_id = $3
          AND svc_access.is_active = TRUE
        WHERE utr.tenant_id = $2
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND r.slug NOT IN ('viewer', 'tenant_viewer')
        ON CONFLICT (user_id, account_id) DO NOTHING
        `,
        [topupAccount.id, tenantId, subscriptionAccountId]
      )

      const memberUsageRes = await query(
        `
        SELECT
          utr.user_id,
          r.slug AS role_slug,
          utr.joined_at,
          u.full_name AS user_name,
          u.email AS user_email,
          u.metadata->>'profile_image_asset_id' AS profile_image_asset_id,
          caa.is_active,
          COALESCE(SUM(cua.amount_credits), 0) AS used_credits,
          MAX(user_tier.user_plan_tier) AS user_plan_tier
        FROM user_tenant_roles utr
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            NULLIF((
              SELECT TRIM(COALESCE(NULLIF(t.metadata->>'plan_tier',''), NULLIF(t.metadata->>'service_tier',''), NULLIF(t.metadata->>'tier','')))
              FROM tenants t
              WHERE t.owner_id = utr.user_id AND t.deleted_at IS NULL
                AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
              LIMIT 1
            ), ''),
            NULLIF((
              SELECT TRIM(COALESCE(NULLIF(t2.metadata->>'plan_tier',''), NULLIF(t2.metadata->>'service_tier',''), NULLIF(t2.metadata->>'tier','')))
              FROM user_tenant_roles utr2
              JOIN tenants t2 ON t2.id = utr2.tenant_id AND t2.deleted_at IS NULL
              WHERE utr2.user_id = utr.user_id
                AND (utr2.membership_status IS NULL OR utr2.membership_status = 'active')
                AND COALESCE((t2.metadata->>'system')::boolean, FALSE) = FALSE
              ORDER BY COALESCE(utr2.is_primary_tenant, FALSE) DESC, utr2.joined_at ASC NULLS LAST
              LIMIT 1
            ), ''),
            'free'
          ) AS user_plan_tier
        ) user_tier ON TRUE
        JOIN roles r ON r.id = utr.role_id
        JOIN users u ON u.id = utr.user_id AND u.deleted_at IS NULL
        JOIN credit_account_access svc_access
          ON svc_access.user_id = utr.user_id
          AND svc_access.account_id = $5
          AND svc_access.is_active = TRUE
        LEFT JOIN credit_account_access caa
          ON caa.user_id = utr.user_id
          AND caa.account_id = $1
        LEFT JOIN credit_usage_allocations cua
          ON cua.account_id = $1
          AND cua.user_id = utr.user_id
          AND cua.created_at >= $2
          AND cua.created_at < $3
        WHERE utr.tenant_id = $4
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND r.slug NOT IN ('viewer', 'tenant_viewer')
        GROUP BY utr.user_id, r.slug, utr.joined_at, u.full_name, u.email, u.metadata, caa.is_active
        ORDER BY
          CASE r.slug
            WHEN 'owner' THEN 0 WHEN 'tenant_owner' THEN 0
            WHEN 'admin' THEN 1 WHEN 'tenant_admin' THEN 1
            WHEN 'member' THEN 2 WHEN 'tenant_member' THEN 2
            ELSE 3
          END,
          utr.joined_at ASC
        `,
        [topupAccount.id, selectedPeriod.period_start, selectedPeriod.period_end, tenantId, subscriptionAccountId]
      )

      members = memberUsageRes.rows.map((row) => {
        const profileAssetId = row.profile_image_asset_id ? String(row.profile_image_asset_id) : null
        const roleSlug = String(row.role_slug || "")
        const isOwner = roleSlug === "owner" || roleSlug === "tenant_owner"
        const planTierRaw = row.user_plan_tier ? String(row.user_plan_tier).trim().toLowerCase() : ""
        return {
          user_id: String(row.user_id || ""),
          used_credits: normalizeUsageAmount(Number(row.used_credits ?? 0)),
          is_active: isOwner ? true : row.is_active !== false,
          user_name: row.user_name ?? null,
          user_email: row.user_email ?? null,
          role_slug: row.role_slug ?? null,
          joined_at: row.joined_at ? toIsoString(row.joined_at) : null,
          profile_image_url: profileAssetId ? `/api/ai/media/assets/${profileAssetId}` : null,
          plan_tier: planTierRaw || "free",
        }
      })
    }

    return res.json({
      ok: true,
      tenant_id: tenantId,
      current_period_end: subPeriodEnd || null,
      periods,
      summary:
        subscription && selectedPeriod
          ? {
              period_start: selectedPeriod.period_start,
              period_end: selectedPeriod.period_end,
              total_credits: topupTotal,
              used_credits: usedInPeriod,
              remaining_credits: topupRemaining,
              usage_percent: topupPercent,
              account_id: topupAccount?.id ?? null,
            }
          : null,
      topup: {
        account_id: topupAccount?.id ?? null,
        balance_credits: topupBalance,
        remaining_credits: topupRemaining,
        expires_at: topupAccount?.expires_at ?? null,
        allow_when_empty: allowWhenEmpty,
      },
      members,
    })
  } catch (e: any) {
    console.error("getMyTopupUsage error:", e)
    return res.status(500).json({ message: "Failed to load topup usage", details: String(e?.message || e) })
  }
}

function formatUsageNumber(n: number): string {
  if (!Number.isFinite(n)) return "0"
  const v = roundToCredit(n)
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2)
}

export async function getTenantUsageHistory(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const userId = toStr(authed.userId)
    if (!userId) return res.status(401).json({ message: "user_id is required" })

    const tenantId = await resolveTenantId(authed)
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required (select a tenant via x-tenant-id)" })

    const limit = Math.min(Math.max(1, toInt(req.query.limit, 20) ?? 20), 100)
    const offset = Math.max(0, toInt(req.query.offset, 0) ?? 0)
    const from = toStr(req.query.from)
    const to = toStr(req.query.to)

    const where: string[] = ["(ca.owner_tenant_id = $1 OR ca.source_tenant_id = $1)"]
    const params: unknown[] = [tenantId]
    if (from) {
      params.push(from)
      where.push(`cua.created_at >= $${params.length}::timestamptz`)
    }
    if (to) {
      params.push(to)
      where.push(`cua.created_at <= $${params.length}::timestamptz`)
    }
    const whereSql = where.join(" AND ")

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_usage_allocations cua
      JOIN credit_accounts ca ON ca.id = cua.account_id
      WHERE ${whereSql}
      `,
      params
    )
    const total = countRes.rows[0]?.total ?? 0

    const listRes = await query(
      `
      SELECT
        cua.created_at,
        cua.amount_credits,
        cua.user_id,
        l.resolved_model,
        l.modality,
        l.input_tokens,
        l.output_tokens,
        l.total_tokens,
        COALESCE(l.web_search_count, 0)::int AS web_search_count,
        m.display_name AS model_display_name,
        COALESCE(iu.image_count, 0)::int AS image_count,
        COALESCE(vu.video_seconds, 0)::numeric AS video_seconds,
        COALESCE(mu.music_seconds, 0)::numeric AS music_seconds,
        COALESCE(au.audio_seconds, 0)::numeric AS audio_seconds
      FROM credit_usage_allocations cua
      JOIN credit_accounts ca ON ca.id = cua.account_id
      JOIN llm_usage_logs l ON l.id = cua.usage_log_id
      LEFT JOIN ai_models m ON m.id = l.model_id
      LEFT JOIN (
        SELECT usage_log_id, SUM(image_count)::int AS image_count
        FROM llm_image_usages
        GROUP BY usage_log_id
      ) iu ON iu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(seconds) AS video_seconds
        FROM llm_video_usages
        GROUP BY usage_log_id
      ) vu ON vu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(seconds) AS music_seconds
        FROM llm_music_usages
        GROUP BY usage_log_id
      ) mu ON mu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(seconds) AS audio_seconds
        FROM llm_audio_usages
        GROUP BY usage_log_id
      ) au ON au.usage_log_id = l.id
      WHERE ${whereSql}
      ORDER BY cua.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const userIds = uniqIds(listRes.rows.map((r: Record<string, unknown>) => r.user_id as string | null | undefined))
    const authHeader = String(req.headers.authorization || "")
    const userMap = userIds.length > 0 ? await lookupUsers(userIds, authHeader) : new Map()

    const rows = listRes.rows.map((row: Record<string, unknown>) => {
      const modality = String(row.modality || "text")
      const inputT = Number(row.input_tokens ?? 0)
      const outputT = Number(row.output_tokens ?? 0)
      const webSearchCount = Number(row.web_search_count ?? 0)
      const imageCount = Number(row.image_count ?? 0)
      const videoSec = Number(row.video_seconds ?? 0)
      const musicSec = Number(row.music_seconds ?? 0)
      const audioSec = Number(row.audio_seconds ?? 0)

      let usageDesc = ""
      if (modality === "image_create" && imageCount > 0) {
        usageDesc = `이미지 ${formatUsageNumber(imageCount)}장`
      } else if (modality === "video" && videoSec > 0) {
        usageDesc = `영상 ${Math.round(videoSec)}초`
      } else if (modality === "music" && musicSec > 0) {
        usageDesc = `음악 ${Math.round(musicSec)}초`
      } else if (modality === "audio" && audioSec > 0) {
        usageDesc = `음성 ${Math.round(audioSec)}초`
      } else {
        usageDesc = `입력 ${formatUsageNumber(inputT)} / 출력 ${formatUsageNumber(outputT)}`
        if (webSearchCount > 0) usageDesc += ` / 웹서치 ${webSearchCount}`
      }

      const model =
        row.model_display_name && String(row.model_display_name).trim()
          ? String(row.model_display_name)
          : String(row.resolved_model || "-")
      const credits = normalizeUsageAmount(Number(row.amount_credits ?? 0))
      const uid = row.user_id ? String(row.user_id) : ""
      const u = uid ? userMap.get(uid) : undefined
      const userName = u?.full_name?.trim() || u?.email?.trim() || (uid ? uid.slice(0, 8) + "…" : "-")

      return {
        created_at: toIsoString(row.created_at),
        model,
        user_name: userName,
        usage_desc: usageDesc,
        credits,
      }
    })

    const topModelsRes = await query(
      `
      SELECT
        COALESCE(m.display_name, l.resolved_model, 'unknown') AS model_name,
        SUM(cua.amount_credits)::numeric AS total_credits
      FROM credit_usage_allocations cua
      JOIN credit_accounts ca ON ca.id = cua.account_id
      JOIN llm_usage_logs l ON l.id = cua.usage_log_id
      LEFT JOIN ai_models m ON m.id = l.model_id
      WHERE ${whereSql}
      GROUP BY COALESCE(m.display_name, l.resolved_model, 'unknown')
      ORDER BY total_credits DESC
      LIMIT 5
      `,
      params
    )
    const topTotal = topModelsRes.rows.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.total_credits ?? 0), 0)
    const top_models = topModelsRes.rows.map((r: Record<string, unknown>) => {
      const cred = Number(r.total_credits ?? 0)
      const pct = topTotal > 0 ? Math.round((cred / topTotal) * 100) : 0
      return { model_name: String(r.model_name ?? "unknown"), total_credits: cred, percent: pct }
    })

    return res.json({ ok: true, rows, total, top_models })
  } catch (e: unknown) {
    console.error("getTenantUsageHistory error:", e)
    return res
      .status(500)
      .json({ message: "Failed to load tenant usage history", details: String((e as Error)?.message ?? e) })
  }
}

export async function getMyUsageHistory(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const userId = toStr(authed.userId)
    if (!userId) return res.status(401).json({ message: "user_id is required" })

    const limit = Math.min(Math.max(1, toInt(req.query.limit, 20) ?? 20), 100)
    const offset = Math.max(0, toInt(req.query.offset, 0) ?? 0)
    const from = toStr(req.query.from)
    const to = toStr(req.query.to)

    const where: string[] = ["cua.user_id = $1"]
    const params: unknown[] = [userId]
    if (from) {
      params.push(from)
      where.push(`cua.created_at >= $${params.length}::timestamptz`)
    }
    if (to) {
      params.push(to)
      where.push(`cua.created_at <= $${params.length}::timestamptz`)
    }
    const whereSql = where.join(" AND ")

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_usage_allocations cua
      WHERE ${whereSql}
      `,
      params
    )
    const total = countRes.rows[0]?.total ?? 0

    const listRes = await query(
      `
      SELECT
        cua.created_at,
        cua.amount_credits,
        l.resolved_model,
        l.modality,
        l.input_tokens,
        l.output_tokens,
        l.total_tokens,
        COALESCE(l.web_search_count, 0)::int AS web_search_count,
        m.display_name AS model_display_name,
        ca.owner_tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        COALESCE(iu.image_count, 0)::int AS image_count,
        COALESCE(vu.video_seconds, 0)::numeric AS video_seconds,
        COALESCE(mu.music_seconds, 0)::numeric AS music_seconds,
        COALESCE(au.audio_seconds, 0)::numeric AS audio_seconds
      FROM credit_usage_allocations cua
      JOIN llm_usage_logs l ON l.id = cua.usage_log_id
      JOIN credit_accounts ca ON ca.id = cua.account_id
      LEFT JOIN tenants t ON t.id = ca.owner_tenant_id AND t.deleted_at IS NULL
      LEFT JOIN ai_models m ON m.id = l.model_id
      LEFT JOIN (
        SELECT usage_log_id, SUM(image_count)::int AS image_count
        FROM llm_image_usages
        GROUP BY usage_log_id
      ) iu ON iu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(seconds) AS video_seconds
        FROM llm_video_usages
        GROUP BY usage_log_id
      ) vu ON vu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(seconds) AS music_seconds
        FROM llm_music_usages
        GROUP BY usage_log_id
      ) mu ON mu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(seconds) AS audio_seconds
        FROM llm_audio_usages
        GROUP BY usage_log_id
      ) au ON au.usage_log_id = l.id
      WHERE ${whereSql}
      ORDER BY cua.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const rows = listRes.rows.map((row: Record<string, unknown>) => {
      const modality = String(row.modality || "text")
      const inputT = Number(row.input_tokens ?? 0)
      const outputT = Number(row.output_tokens ?? 0)
      const webSearchCount = Number(row.web_search_count ?? 0)
      const imageCount = Number(row.image_count ?? 0)
      const videoSec = Number(row.video_seconds ?? 0)
      const musicSec = Number(row.music_seconds ?? 0)
      const audioSec = Number(row.audio_seconds ?? 0)

      let usageDesc = ""
      if (modality === "image_create" && imageCount > 0) {
        usageDesc = `이미지 ${formatUsageNumber(imageCount)}장`
      } else if (modality === "video" && videoSec > 0) {
        usageDesc = `영상 ${Math.round(videoSec)}초`
      } else if (modality === "music" && musicSec > 0) {
        usageDesc = `음악 ${Math.round(musicSec)}초`
      } else if (modality === "audio" && audioSec > 0) {
        usageDesc = `음성 ${Math.round(audioSec)}초`
      } else {
        usageDesc = `입력 ${formatUsageNumber(inputT)} / 출력 ${formatUsageNumber(outputT)}`
        if (webSearchCount > 0) usageDesc += ` / 웹서치 ${webSearchCount}`
      }

      const model =
        row.model_display_name && String(row.model_display_name).trim()
          ? String(row.model_display_name)
          : String(row.resolved_model || "-")
      const credits = normalizeUsageAmount(Number(row.amount_credits ?? 0))
      const tenantName = row.tenant_name && String(row.tenant_name).trim() ? String(row.tenant_name) : null
      const tenantSlug = row.tenant_slug && String(row.tenant_slug).trim() ? String(row.tenant_slug) : null
      const tenantLabel = tenantName || tenantSlug || (row.owner_tenant_id ? String(row.owner_tenant_id).slice(0, 8) + "…" : "-")

      return {
        created_at: toIsoString(row.created_at),
        model,
        usage_desc: usageDesc,
        credits,
        tenant_name: tenantName,
        tenant_slug: tenantSlug,
        tenant_label: tenantLabel,
      }
    })

    return res.json({ ok: true, rows, total })
  } catch (e: unknown) {
    console.error("getMyUsageHistory error:", e)
    return res
      .status(500)
      .json({ message: "Failed to load usage history", details: String((e as Error)?.message ?? e) })
  }
}

export async function updateMemberTopupCreditAccess(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = await resolveTenantId(authed)
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })

    const targetUserId = toStr(req.body?.user_id)
    if (!targetUserId || !isUuid(targetUserId))
      return res.status(400).json({ message: "user_id is required (UUID)" })

    const memberCheck = await query(
      `
      SELECT utr.user_id, r.slug AS role_slug
      FROM user_tenant_roles utr
      JOIN roles r ON r.id = utr.role_id
      WHERE utr.user_id = $1 AND utr.tenant_id = $2
        AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
      LIMIT 1
      `,
      [targetUserId, tenantId]
    )
    if (memberCheck.rows.length === 0) return res.status(404).json({ message: "member not found" })

    const roleSlug = String(memberCheck.rows[0].role_slug || "").toLowerCase()
    if (roleSlug === "owner" || roleSlug === "tenant_owner")
      return res.status(400).json({ message: "owner credit access cannot be changed" })
    if (roleSlug === "viewer" || roleSlug === "tenant_viewer") {
      return res.status(400).json({ message: "viewer cannot receive topup credits" })
    }

    const subscriptionAccountRes = await query(
      `SELECT id FROM credit_accounts WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'subscription' LIMIT 1`,
      [tenantId]
    )
    const subscriptionAccountId = subscriptionAccountRes.rows[0]?.id
    if (!subscriptionAccountId) return res.status(404).json({ message: "subscription account not found" })

    const serviceAccessRes = await query(
      `SELECT is_active FROM credit_account_access WHERE user_id = $1 AND account_id = $2 LIMIT 1`,
      [targetUserId, subscriptionAccountId]
    )
    const serviceActive = serviceAccessRes.rows[0]?.is_active !== false
    if (!serviceActive) {
      return res.status(400).json({ message: "service credit access required" })
    }

    const accountRes = await query(
      `SELECT id FROM credit_accounts WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'topup' LIMIT 1`,
      [tenantId]
    )
    const accountId = accountRes.rows[0]?.id
    if (!accountId) return res.status(404).json({ message: "topup account not found" })

    const isActiveInput = toBool(req.body?.is_active)
    if (isActiveInput === null) return res.status(400).json({ message: "is_active is required" })

    const result = await query(
      `
      INSERT INTO credit_account_access (user_id, account_id, priority, max_per_period, allow_when_empty, is_active)
      VALUES ($1, $2, 0, NULL, FALSE, $3)
      ON CONFLICT (user_id, account_id)
      DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = CURRENT_TIMESTAMP
      RETURNING user_id, account_id, is_active
      `,
      [targetUserId, accountId, isActiveInput]
    )

    return res.json({ ok: true, row: result.rows[0] ?? null })
  } catch (e: any) {
    console.error("updateMemberTopupCreditAccess error:", e)
    return res.status(500).json({ message: "Failed to update member topup credit access", details: String(e?.message || e) })
  }
}

/**
 * Pre-check: can user consume credits for AI usage?
 * Called by ai-agent-service before chatRun to block requests when no credits available.
 * Body: { user_id: string (required), tenant_id?: string }
 */
export async function checkCanConsume(req: Request, res: Response) {
  const userId = toStr(req.body?.user_id)
  if (!userId || !isUuid(userId)) {
    return res.status(400).json({
      ok: false,
      can_consume: false,
      reason: "invalid_user_id",
      message: "user_id is required (valid UUID)",
    })
  }

  let tenantId = toStr(req.body?.tenant_id)
  if (!tenantId || !isUuid(tenantId)) {
    const systemTenantRes = await query(
      `SELECT id FROM tenants WHERE slug = 'system' AND deleted_at IS NULL LIMIT 1`
    )
    const systemTenantId = systemTenantRes.rows[0]?.id ? String(systemTenantRes.rows[0].id) : null
    if (systemTenantId) {
      const primaryRes = await query(
        `
        SELECT utr.tenant_id
        FROM user_tenant_roles utr
        JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
        WHERE utr.user_id = $1
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
        ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC
        LIMIT 1
        `,
        [userId]
      )
      tenantId = primaryRes.rows[0]?.tenant_id ? String(primaryRes.rows[0].tenant_id) : ""
    }
  }
  if (!tenantId || !isUuid(tenantId)) {
    return res.json({
      ok: true,
      can_consume: false,
      reason: "no_tenant",
      message: "크레딧이 부족합니다.",
    })
  }

  try {
    const prefRes = await query(
      `SELECT selected_account_id FROM credit_user_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    )
    const selectedAccountId = prefRes.rows[0]?.selected_account_id
      ? String(prefRes.rows[0].selected_account_id)
      : null

    if (selectedAccountId) {
      const accTenantRes = await query(
        `
        SELECT ca.owner_tenant_id, ca.source_tenant_id, ca.owner_type
        FROM credit_accounts ca
        WHERE ca.id = $1 AND ca.status = 'active'
          AND (
            EXISTS (SELECT 1 FROM credit_account_access caa WHERE caa.user_id = $2 AND caa.account_id = ca.id AND caa.is_active = TRUE)
            OR EXISTS (SELECT 1 FROM tenants t WHERE t.id = ca.owner_tenant_id AND t.owner_id = $2 AND t.deleted_at IS NULL)
          )
        LIMIT 1
        `,
        [selectedAccountId, userId]
      )
      const accRow = accTenantRes.rows[0] as { owner_tenant_id?: string; source_tenant_id?: string; owner_type?: string } | undefined
      if (accRow) {
        const resolvedTenant = accRow.owner_type === "tenant" && accRow.owner_tenant_id
          ? accRow.owner_tenant_id
          : accRow.source_tenant_id
        if (resolvedTenant) tenantId = String(resolvedTenant)
      }
    }

    // 신규 대화 시 chatRun이 system tenant를 넘김. credit_accounts는 사용자 tenant에 있으므로 primary로 resolve
    const systemTenantRes = await query(
      `SELECT id FROM tenants WHERE slug = 'system' AND deleted_at IS NULL LIMIT 1`
    )
    const systemTenantId = systemTenantRes.rows[0]?.id ? String(systemTenantRes.rows[0].id) : null
    if (systemTenantId && tenantId === systemTenantId) {
      const primaryRes = await query(
        `
        SELECT utr.tenant_id
        FROM user_tenant_roles utr
        JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
        WHERE utr.user_id = $1
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
        ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC
        LIMIT 1
        `,
        [userId]
      )
      const primaryTenantId = primaryRes.rows[0]?.tenant_id ? String(primaryRes.rows[0].tenant_id) : null
      if (primaryTenantId) {
        tenantId = primaryTenantId
      }
    }

    const accountsRes = await query(
      `
      SELECT id, balance_credits, reserved_credits, priority, credit_type
      FROM (
        (
          SELECT ca.id, ca.balance_credits, ca.reserved_credits, caa.priority, ca.credit_type
          FROM credit_account_access caa
          JOIN credit_accounts ca ON ca.id = caa.account_id AND ca.status = 'active'
            AND ca.owner_type = 'tenant' AND ca.owner_tenant_id = $2
          WHERE caa.user_id = $1
            AND caa.is_active = TRUE
            AND (
              ca.credit_type = 'subscription'
              OR (ca.credit_type = 'topup' AND caa.allow_when_empty = TRUE)
            )
        )
        UNION
        (
          SELECT ca.id, ca.balance_credits, ca.reserved_credits, 0 AS priority, ca.credit_type
          FROM credit_accounts ca
          JOIN tenants t ON t.id = ca.owner_tenant_id AND t.owner_id = $1
          WHERE ca.status = 'active'
            AND ca.owner_type = 'tenant' AND ca.owner_tenant_id = $2
            AND (
              ca.credit_type = 'subscription'
              OR ca.credit_type = 'topup'
            )
            AND NOT EXISTS (
              SELECT 1 FROM credit_account_access caa2
              WHERE caa2.user_id = $1 AND caa2.account_id = ca.id
            )
        )
      ) sub
      ORDER BY
        CASE WHEN id::text = $3 THEN 0 ELSE 1 END,
        priority ASC,
        CASE credit_type WHEN 'subscription' THEN 0 ELSE 1 END
      `,
      [userId, tenantId, selectedAccountId || ""]
    )

    const accounts = accountsRes.rows as Array<{
      id: string
      balance_credits: number
      reserved_credits: number
    }>
    const withBalance = accounts.filter((a) => {
      const avail = Math.max(0, Number(a.balance_credits ?? 0) - Number(a.reserved_credits ?? 0))
      return avail > 0
    })

    const canConsume = withBalance.length > 0
    return res.json({
      ok: true,
      can_consume: canConsume,
      reason: canConsume ? null : "insufficient_credits",
      message: canConsume ? null : "크레딧이 부족합니다.",
    })
  } catch (e: unknown) {
    console.error("checkCanConsume error:", e)
    return res.status(500).json({
      ok: false,
      can_consume: false,
      reason: "error",
      message: "크레딧 확인 중 오류가 발생했습니다.",
    })
  }
}

export async function deductCreditsForUsage(req: Request, res: Response) {
  const usageLogId = toStr(req.body?.usage_log_id)
  if (!usageLogId || !isUuid(usageLogId)) {
    return res.status(400).json({ message: "usage_log_id is required (valid UUID)" })
  }

  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query("BEGIN")
    transactionStarted = true

    const logRes = await client.query(
      `
      SELECT
        l.tenant_id,
        l.user_id,
        l.total_cost,
        l.currency,
        l.status,
        l.modality,
        l.model_id,
        l.provider_id,
        p.slug AS provider_slug,
        m.model_id AS model_key
      FROM llm_usage_logs l
      LEFT JOIN ai_providers p ON p.id = l.provider_id
      LEFT JOIN ai_models m ON m.id = l.model_id
      WHERE l.id = $1
      LIMIT 1
      `,
      [usageLogId]
    )
    const logRow = logRes.rows[0] as
      | {
          tenant_id: string
          user_id: string | null
          total_cost: number
          currency: string
          status: string
          modality: string | null
          model_id: string | null
          provider_id: string | null
          provider_slug: string | null
          model_key: string | null
        }
      | undefined
    if (!logRow) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(404).json({ message: "usage log not found" })
    }
    let tenantId = String(logRow.tenant_id)
    const userId = logRow.user_id ? String(logRow.user_id) : null

    // 사용자가 크레딧 탭에서 선택한 계정(selected_account_id)이 있으면, 해당 계정의 tenant를 우선 사용
    const prefResForTenant = await client.query(
      `SELECT cup.selected_account_id
       FROM credit_user_preferences cup
       WHERE cup.user_id = $1 AND cup.selected_account_id IS NOT NULL
       LIMIT 1`,
      [userId]
    )
    const selectedAccId = prefResForTenant.rows[0]?.selected_account_id
      ? String(prefResForTenant.rows[0].selected_account_id)
      : null
    if (selectedAccId) {
      const accTenantRes = await client.query(
        `
        SELECT ca.owner_tenant_id, ca.source_tenant_id, ca.owner_type
        FROM credit_accounts ca
        WHERE ca.id = $1 AND ca.status = 'active'
          AND (
            EXISTS (SELECT 1 FROM credit_account_access caa WHERE caa.user_id = $2 AND caa.account_id = ca.id AND caa.is_active = TRUE)
            OR EXISTS (SELECT 1 FROM tenants t WHERE t.id = ca.owner_tenant_id AND t.owner_id = $2 AND t.deleted_at IS NULL)
          )
        LIMIT 1
        `,
        [selectedAccId, userId]
      )
      const accRow = accTenantRes.rows[0] as { owner_tenant_id?: string; source_tenant_id?: string; owner_type?: string } | undefined
      if (accRow) {
        const resolvedTenant = accRow.owner_type === "tenant" && accRow.owner_tenant_id
          ? accRow.owner_tenant_id
          : accRow.source_tenant_id
        if (resolvedTenant) tenantId = String(resolvedTenant)
      }
    }
    const totalCost = Number(logRow.total_cost ?? 0)
    const currency = String(logRow.currency || "USD").toUpperCase()
    const status = String(logRow.status || "")

    if (!userId) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(400).json({ message: "usage log has no user_id" })
    }
    if (status !== "success") {
      await client.query("ROLLBACK")
      transactionStarted = false
      console.warn("[deduct] skip usage_log_id=%s reason=status_not_success status=%s", usageLogId, status)
      return res.json({ ok: true, deducted: 0, skipped: true, reason: "status_not_success" })
    }
    if (!Number.isFinite(totalCost) || totalCost <= 0) {
      await client.query("ROLLBACK")
      transactionStarted = false
      console.warn("[deduct] skip usage_log_id=%s reason=no_cost total_cost=%s", usageLogId, totalCost)
      return res.json({ ok: true, deducted: 0, skipped: true, reason: "no_cost" })
    }

    // llm_usage_logs may have tenant_id=system (platform-wide). credit_accounts live on user's tenant.
    // Resolve user's primary tenant when log tenant is system.
    const systemTenantRes = await client.query(
      `SELECT id FROM tenants WHERE slug = 'system' AND deleted_at IS NULL LIMIT 1`
    )
    const systemTenantId = systemTenantRes.rows[0]?.id ? String(systemTenantRes.rows[0].id) : null
    if (systemTenantId && tenantId === systemTenantId) {
      const primaryRes = await client.query(
        `
        SELECT utr.tenant_id
        FROM user_tenant_roles utr
        JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
        WHERE utr.user_id = $1
          AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
          AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
        ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC
        LIMIT 1
        `,
        [userId]
      )
      const primaryTenantId = primaryRes.rows[0]?.tenant_id ? String(primaryRes.rows[0].tenant_id) : null
      if (primaryTenantId) {
        tenantId = primaryTenantId
      }
    }

    // Map llm_usage_logs.modality → pricing_markup_rules.modality
    const pricingModality = (() => {
      const m = String(logRow?.modality ?? "text").toLowerCase()
      const map: Record<string, string> = {
        text: "text",
        image_read: "image",
        image_create: "image",
        audio: "audio",
        video: "video",
        music: "audio",
        code: "code",
        multimodal: "text",
        embedding: "text",
      }
      return map[m] ?? "text"
    })()

    let marginPercent = 0
    try {
      await client.query("SAVEPOINT margin_lookup")
      // Support document/schema_pricing (is_active, effective_at, model_id, modality, scope_type)
      const marginRes = await client.query(
        `
        SELECT margin_percent
        FROM pricing_markup_rules
        WHERE is_active = TRUE
          AND (effective_at IS NULL OR effective_at <= NOW())
          AND (model_id IS NULL OR model_id = $1)
          AND (modality IS NULL OR modality = $2)
        ORDER BY
          (CASE WHEN model_id IS NOT NULL THEN 2 ELSE 0 END)
          + (CASE WHEN modality IS NOT NULL THEN 1 ELSE 0 END) DESC,
          priority DESC
        LIMIT 1
        `,
        [logRow?.model_id ?? null, pricingModality]
      )
      marginPercent = Number(marginRes.rows[0]?.margin_percent ?? 0)
      await client.query("RELEASE SAVEPOINT margin_lookup")
    } catch {
      try {
        await client.query("ROLLBACK TO SAVEPOINT margin_lookup")
      } catch {
        // savepoint may already be consumed
      }
    }

    const costWithMargin = totalCost * (1 + marginPercent / 100)
    const settingsRes = await client.query(
      `SELECT credits_per_usd FROM credit_settings WHERE currency = $1 LIMIT 1`,
      [currency]
    )
    const creditsPerUsd = Number(settingsRes.rows[0]?.credits_per_usd ?? 1000)
    const creditsToDeduct = roundToCredit(costWithMargin * creditsPerUsd)
    if (creditsToDeduct <= 0) {
      await client.query("ROLLBACK")
      transactionStarted = false
      console.warn(
        "[deduct] skip usage_log_id=%s reason=credits_zero total_cost=%s margin_percent=%s cost_with_margin=%s credits_per_usd=%s",
        usageLogId,
        totalCost,
        marginPercent,
        costWithMargin,
        creditsPerUsd
      )
      return res.json({ ok: true, deducted: 0, skipped: true, reason: "credits_zero" })
    }

    const existingAlloc = await client.query(
      `SELECT 1 FROM credit_usage_allocations WHERE usage_log_id = $1 LIMIT 1`,
      [usageLogId]
    )
    if (existingAlloc.rows.length > 0) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.json({ ok: true, deducted: 0, skipped: true, reason: "already_allocated" })
    }

    const prefRes = await client.query(
      `SELECT selected_account_id FROM credit_user_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    )
    const selectedAccountId = prefRes.rows[0]?.selected_account_id
      ? String(prefRes.rows[0].selected_account_id)
      : null

    const accountsRes = await client.query(
      `
      SELECT id, balance_credits, reserved_credits, priority, credit_type
      FROM (
        (
          SELECT ca.id, ca.balance_credits, ca.reserved_credits, caa.priority, ca.credit_type
          FROM credit_account_access caa
          JOIN credit_accounts ca ON ca.id = caa.account_id AND ca.status = 'active'
            AND ca.owner_type = 'tenant' AND ca.owner_tenant_id = $2
          WHERE caa.user_id = $1
            AND caa.is_active = TRUE
            AND (
              ca.credit_type = 'subscription'
              OR (ca.credit_type = 'topup' AND caa.allow_when_empty = TRUE)
            )
        )
        UNION
        (
          SELECT ca.id, ca.balance_credits, ca.reserved_credits, 0 AS priority, ca.credit_type
          FROM credit_accounts ca
          JOIN tenants t ON t.id = ca.owner_tenant_id AND t.owner_id = $1
          WHERE ca.status = 'active'
            AND ca.owner_type = 'tenant' AND ca.owner_tenant_id = $2
            AND (
              ca.credit_type = 'subscription'
              OR ca.credit_type = 'topup'
            )
            AND NOT EXISTS (
              SELECT 1 FROM credit_account_access caa2
              WHERE caa2.user_id = $1 AND caa2.account_id = ca.id
            )
        )
      ) sub
      ORDER BY
        CASE WHEN id::text = $3 THEN 0 ELSE 1 END,
        priority ASC,
        CASE credit_type WHEN 'subscription' THEN 0 ELSE 1 END
      `,
      [userId, tenantId, selectedAccountId || ""]
    )

    const accounts = accountsRes.rows as Array<{
      id: string
      balance_credits: number
      reserved_credits: number
      priority: number
      credit_type: string
    }>
    const withBalance = accounts.filter((a) => {
      const avail = Math.max(0, Number(a.balance_credits ?? 0) - Number(a.reserved_credits ?? 0))
      return avail > 0
    })
    if (withBalance.length === 0) {
      await client.query("ROLLBACK")
      transactionStarted = false
      console.warn(
        "[deduct] skip usage_log_id=%s reason=insufficient_balance userId=%s tenantId=%s accounts=%d (0 with balance)",
        usageLogId,
        userId,
        tenantId,
        accounts.length
      )
      return res.json({ ok: true, deducted: 0, skipped: true, reason: "insufficient_balance" })
    }

    let remaining = creditsToDeduct
    const allocations: Array<{ account_id: string; amount: number }> = []

    for (const acc of withBalance) {
      if (remaining <= 0) break
      const avail = Math.max(
        0,
        roundToCredit(Number(acc.balance_credits ?? 0) - Number(acc.reserved_credits ?? 0))
      )
      if (avail <= 0) continue
      let deduct = Math.min(remaining, avail)
      const deductRounded = roundToCredit(deduct)
      if (deductRounded > avail) deduct = 0
      else deduct = deductRounded
      if (deduct <= 0) continue
      remaining -= deduct
      allocations.push({ account_id: acc.id, amount: deduct })
    }

    // Allow partial deduction: deduct what we can (e.g. 15 of 20)
    // Response already sent to user; remaining shortage is logged only
    if (remaining > 0) {
      console.warn(
        "[deduct] partial deduction usage_log_id=%s remaining=%d creditsToDeduct=%d allocated=%d",
        usageLogId,
        remaining,
        creditsToDeduct,
        creditsToDeduct - remaining
      )
    }

    const occurredAt = new Date().toISOString()
    for (const alloc of allocations) {
      const accRes = await client.query(
        `SELECT id, balance_credits FROM credit_accounts WHERE id = $1 FOR UPDATE`,
        [alloc.account_id]
      )
      const acc = accRes.rows[0] as { id: string; balance_credits: number }
      if (!acc) continue
      const balanceBefore = Number(acc.balance_credits ?? 0)
      const balanceAfter = Math.max(0, balanceBefore - alloc.amount)
      await client.query(
        `UPDATE credit_accounts SET balance_credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [balanceAfter, alloc.account_id]
      )
      await client.query(
        `
        INSERT INTO credit_ledger_entries
          (account_id, entry_type, amount_credits, balance_after, usage_log_id, occurred_at, metadata)
        VALUES ($1, 'usage', $2, $3, $4, $5::timestamptz, $6::jsonb)
        `,
        [
          alloc.account_id,
          -alloc.amount,
          balanceAfter,
          usageLogId,
          occurredAt,
          JSON.stringify({
            usage_log_id: usageLogId,
            user_id: userId,
            base_cost_usd: totalCost,
            margin_percent: marginPercent,
            cost_with_margin_usd: costWithMargin,
          }),
        ]
      )
      await client.query(
        `
        INSERT INTO credit_usage_allocations (usage_log_id, user_id, account_id, amount_credits)
        VALUES ($1, $2, $3, $4)
        `,
        [usageLogId, userId, alloc.account_id, alloc.amount]
      )
    }

    await client.query("COMMIT")
    transactionStarted = false
    const actualDeducted = allocations.reduce((sum, a) => sum + a.amount, 0)
    console.log(
      "[deduct] success usage_log_id=%s base_cost=%.6f margin%%=%s cost_with_margin=%.6f deducted=%d",
      usageLogId,
      totalCost,
      marginPercent,
      costWithMargin,
      actualDeducted
    )
    return res.json({
      ok: true,
      deducted: actualDeducted,
      allocations: allocations.map((a) => ({ account_id: a.account_id, amount: a.amount })),
    })
  } catch (e: unknown) {
    if (transactionStarted) await client.query("ROLLBACK")
    console.error("deductCreditsForUsage error:", e)
    return res
      .status(500)
      .json({ message: "Failed to deduct credits", details: String((e as Error)?.message ?? e) })
  } finally {
    client.release()
  }
}

export async function grantSubscriptionCredits(req: Request, res: Response) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    const tenantId = toStr(req.body?.tenant_id)
    const subscriptionId = toStr(req.body?.subscription_id)
    const planSlug = toStr(req.body?.plan_slug)
    const billingCycle = toStr(req.body?.billing_cycle)
    const creditType = toStr(req.body?.credit_type) || "subscription"
    const grantMode = (toStr(req.body?.grant_mode) || "reset") as GrantMode
    const grantKey = toStr(req.body?.grant_key)
    const reason = toStr(req.body?.reason)
    const periodStart = toStr(req.body?.period_start)
    const periodEnd = toStr(req.body?.period_end)
    const grantAmountRaw = req.body?.grant_amount

    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })
    if (!planSlug) return res.status(400).json({ message: "plan_slug is required" })
    if (!GRANT_BILLING_CYCLES.has(billingCycle)) {
      return res.status(400).json({ message: "invalid billing_cycle" })
    }
    if (!ACCOUNT_CREDIT_TYPES.has(creditType)) {
      return res.status(400).json({ message: "invalid credit_type" })
    }
    if (grantMode !== "reset" && grantMode !== "increment") {
      return res.status(400).json({ message: "invalid grant_mode" })
    }
    if (!periodEnd) return res.status(400).json({ message: "period_end is required" })

    const periodEndDate = new Date(periodEnd)
    if (Number.isNaN(periodEndDate.getTime())) {
      return res.status(400).json({ message: "invalid period_end" })
    }
    const periodEndIso = periodEndDate.toISOString()

    await client.query("BEGIN")
    transactionStarted = true

    if (grantKey) {
      const existing = await client.query(
        `SELECT id FROM credit_ledger_entries WHERE metadata->>'grant_key' = $1 LIMIT 1`,
        [grantKey]
      )
      if (existing.rows.length > 0) {
        await client.query("ROLLBACK")
        transactionStarted = false
        return res.json({ ok: true, duplicated: true })
      }
    }

    const grantAmountOverride =
      grantAmountRaw === null || grantAmountRaw === undefined || grantAmountRaw === ""
        ? null
        : Number(grantAmountRaw)
    if (grantAmountOverride !== null && (!Number.isFinite(grantAmountOverride) || grantAmountOverride < 0)) {
      return res.status(400).json({ message: "grant_amount must be >= 0" })
    }

    const planRes = await client.query(
      `
      SELECT monthly_credits, initial_credits
      FROM credit_plan_grants
      WHERE plan_slug = $1 AND billing_cycle = $2 AND credit_type = $3 AND is_active = TRUE
      LIMIT 1
      `,
      [planSlug, billingCycle, creditType]
    )
    const planRow = planRes.rows[0] as { monthly_credits?: number; initial_credits?: number } | undefined
    if (!planRow && grantAmountOverride === null) {
      return res.status(404).json({ message: "plan grant not found" })
    }

    const baseGrant =
      grantAmountOverride !== null
        ? roundToCredit(grantAmountOverride)
        : roundToCredit(Number(planRow?.monthly_credits ?? 0))
    const initialCredits = roundToCredit(Number(planRow?.initial_credits ?? 0))

    const accountRes = await client.query(
      `
      SELECT id, balance_credits
      FROM credit_accounts
      WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = $2
      LIMIT 1
      FOR UPDATE
      `,
      [tenantId, creditType]
    )

    let accountId = accountRes.rows[0]?.id as string | undefined
    let balanceBefore = Number(accountRes.rows[0]?.balance_credits ?? 0)
    const isNew = !accountId

    if (!accountId) {
      const insertRes = await client.query(
        `
        INSERT INTO credit_accounts
          (owner_type, owner_tenant_id, credit_type, status, balance_credits, reserved_credits, expires_at, metadata)
        VALUES
          ('tenant', $1, $2, 'active', 0, 0, $3, $4::jsonb)
        RETURNING id, balance_credits
        `,
        [
          tenantId,
          creditType,
          periodEndIso,
          JSON.stringify({ source: "subscription_grant", plan_slug: planSlug }),
        ]
      )
      accountId = insertRes.rows[0]?.id
      balanceBefore = Number(insertRes.rows[0]?.balance_credits ?? 0)
    }

    let totalGrant = baseGrant
    if (isNew && initialCredits > 0 && creditType === "subscription") {
      totalGrant += initialCredits
    }

    const balanceAfter =
      grantMode === "reset" ? totalGrant : Math.max(0, roundToCredit(balanceBefore + totalGrant))
    const delta = balanceAfter - balanceBefore

    await client.query(
      `
      UPDATE credit_accounts
      SET balance_credits = $1,
          expires_at = $2,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [balanceAfter, periodEndIso, accountId]
    )

    if (delta !== 0) {
      const entryType = delta >= 0 ? "subscription_grant" : "adjustment"
      await client.query(
        `
        INSERT INTO credit_ledger_entries
          (account_id, entry_type, amount_credits, balance_after, subscription_id, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6::jsonb)
        `,
        [
          accountId,
          entryType,
          delta,
          balanceAfter,
          subscriptionId || null,
          JSON.stringify({
            grant_key: grantKey || null,
            plan_slug: planSlug,
            billing_cycle: billingCycle,
            grant_mode: grantMode,
            period_start: periodStart || null,
            period_end: periodEndIso,
            reason: reason || null,
          }),
        ]
      )
    }

    await client.query("COMMIT")
    transactionStarted = false

    return res.json({
      ok: true,
      account_id: accountId,
      granted: totalGrant,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      grant_mode: grantMode,
    })
  } catch (e: any) {
    if (transactionStarted) await client.query("ROLLBACK")
    console.error("grantSubscriptionCredits error:", e)
    return res.status(500).json({ message: "Failed to grant credits", details: String(e?.message || e) })
  } finally {
    client.release()
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
          OR COALESCE(le.account_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(le.usage_log_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(le.transfer_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(le.subscription_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(le.invoice_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(le.payment_transaction_id::text, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    where.push(systemTenantFilter("ca.owner_tenant_id"))
    where.push(systemTenantFilter("ca.source_tenant_id"))

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_ledger_entries le
      JOIN credit_accounts ca ON ca.id = le.account_id
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
        ca.source_tenant_id
      FROM credit_ledger_entries le
      JOIN credit_accounts ca ON ca.id = le.account_id
      ${whereSql}
      ORDER BY le.occurred_at DESC, le.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = uniqIds(listRes.rows.flatMap((row) => [row.owner_tenant_id, row.source_tenant_id]))
    const userIds = uniqIds(listRes.rows.flatMap((row) => [row.owner_user_id]))
    const [tenantMap, userMap] = await Promise.all([
      lookupTenants(tenantIds, authHeader),
      lookupUsers(userIds, authHeader),
    ])

    const rows = listRes.rows.map((row) => {
      const ownerTenant = row.owner_tenant_id ? tenantMap.get(String(row.owner_tenant_id)) : undefined
      const ownerUser = row.owner_user_id ? userMap.get(String(row.owner_user_id)) : undefined
      return {
        ...row,
        owner_tenant_name: ownerTenant?.name ?? null,
        owner_tenant_slug: ownerTenant?.slug ?? null,
        owner_user_email: ownerUser?.email ?? null,
        owner_user_name: ownerUser?.full_name ?? null,
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
    if (q) {
      where.push(
        `(
          COALESCE(cua.usage_log_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(cua.account_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(cua.user_id::text, '') ILIKE $${params.length + 1}
          OR COALESCE(ca.display_name, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    where.push(systemTenantFilter("ca.owner_tenant_id"))
    where.push(systemTenantFilter("ca.source_tenant_id"))

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM credit_usage_allocations cua
      JOIN credit_accounts ca ON ca.id = cua.account_id
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
        NULL::timestamptz AS usage_created_at,
        NULL::text AS request_id,
        NULL::text AS usage_status,
        NULL::text AS feature_name,
        NULL::text AS modality,
        NULL::int AS total_tokens,
        NULL::numeric AS total_cost,
        NULL::text AS currency,
        NULL::int AS response_time_ms,
        NULL::text AS model_display_name,
        NULL::text AS model_api_id,
        NULL::text AS provider_slug,
        ca.owner_type,
        ca.credit_type,
        ca.status AS account_status,
        ca.display_name AS account_display_name,
        ca.owner_tenant_id,
        ca.owner_user_id,
        ca.source_tenant_id
      FROM credit_usage_allocations cua
      JOIN credit_accounts ca ON ca.id = cua.account_id
      ${whereSql}
      ORDER BY cua.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = uniqIds(listRes.rows.flatMap((row) => [row.owner_tenant_id, row.source_tenant_id]))
    const userIds = uniqIds(listRes.rows.flatMap((row) => [row.owner_user_id, row.user_id]))
    const [tenantMap, userMap] = await Promise.all([
      lookupTenants(tenantIds, authHeader),
      lookupUsers(userIds, authHeader),
    ])

    const rows = listRes.rows.map((row) => {
      const ownerTenant = row.owner_tenant_id ? tenantMap.get(String(row.owner_tenant_id)) : undefined
      const ownerUser = row.owner_user_id ? userMap.get(String(row.owner_user_id)) : undefined
      const usageUser = row.user_id ? userMap.get(String(row.user_id)) : undefined
      return {
        ...row,
        owner_tenant_name: ownerTenant?.name ?? null,
        owner_tenant_slug: ownerTenant?.slug ?? null,
        owner_user_email: ownerUser?.email ?? null,
        owner_user_name: ownerUser?.full_name ?? null,
        usage_user_email: usageUser?.email ?? null,
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
    console.error("listCreditUsageAllocations error:", e)
    return res.status(500).json({ message: "Failed to list credit usage allocations", details: String(e?.message || e) })
  }
}

export async function getMyGrantedCredits(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const userId = toStr(authed.userId)
    if (!userId) return res.status(401).json({ message: "user_id is required" })

    const tenantsRes = await query(
      `
      SELECT
        utr.tenant_id,
        t.name AS tenant_name,
        t.tenant_type,
        r.slug AS role_slug,
        utr.joined_at
      FROM user_tenant_roles utr
      JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
      JOIN roles r ON r.id = utr.role_id
      WHERE utr.user_id = $1
        AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
        AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
      ORDER BY utr.joined_at ASC
      `,
      [userId]
    )

    if (tenantsRes.rows.length === 0) {
      return res.json({ ok: true, grants: [] })
    }

    const grants: Array<{
      tenant_id: string
      tenant_name: string | null
      tenant_type: string | null
      plan_tier: string | null
      role_slug: string | null
      account_id: string | null
      service: {
        total_credits: number
        used_credits: number
        user_used_credits: number
        remaining_credits: number
        usage_percent: number
        max_per_period: number | null
        is_active: boolean
        period_start: string | null
        period_end: string | null
      } | null
      topup_auto_use: boolean
      topup_account_id: string | null
      topup_remaining_credits: number
    }> = []

    for (const tenantRow of tenantsRes.rows) {
      const tenantId = String(tenantRow.tenant_id)
      const tenantName = tenantRow.tenant_name ?? null
      const tenantType = tenantRow.tenant_type ?? null
      const roleSlug = tenantRow.role_slug ?? null

      const subRes = await query(
        `
        SELECT
          s.id,
          s.billing_cycle,
          s.current_period_start,
          s.current_period_end,
          b.slug AS plan_slug,
          b.tier AS plan_tier
        FROM billing_subscriptions s
        JOIN billing_plans b ON b.id = s.plan_id
        WHERE s.tenant_id = $1
          AND s.status <> 'cancelled'
        ORDER BY s.created_at DESC
        LIMIT 1
        `,
        [tenantId]
      )
      const sub = subRes.rows[0] as
        | { id: string; billing_cycle: string; current_period_start: string; current_period_end: string; plan_slug: string; plan_tier: string }
        | undefined

      if (!sub) {
        const subAccountNoSubRes = await query(
          `SELECT id, balance_credits, reserved_credits FROM credit_accounts WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'subscription' LIMIT 1`,
          [tenantId]
        )
        const subAccountNoSub = subAccountNoSubRes.rows[0] as { id: string; balance_credits: number; reserved_credits: number } | undefined
        const isOwnerNoSub = roleSlug === "owner" || roleSlug === "tenant_owner"
        const hasAccessNoSub = isOwnerNoSub || (subAccountNoSub?.id
          ? (await query(
              `SELECT 1 FROM credit_account_access WHERE user_id = $1 AND account_id = $2 AND is_active = TRUE LIMIT 1`,
              [userId, subAccountNoSub.id]
            )).rows.length > 0
          : false)
        let accountIdNoSub: string | null = null
        let serviceNoSub: typeof grants[0]["service"] = null
        if (subAccountNoSub?.id && hasAccessNoSub) {
          const accountRemainingNoSub = Math.max(0, Number(subAccountNoSub.balance_credits ?? 0) - Number(subAccountNoSub.reserved_credits ?? 0))
          let userUsedNoSub = 0
          let maxPerPeriodNoSub: number | null = null
          const accessNoSubRes = await query(
            `SELECT max_per_period FROM credit_account_access WHERE user_id = $1 AND account_id = $2 LIMIT 1`,
            [userId, subAccountNoSub.id]
          )
          if (accessNoSubRes.rows[0]?.max_per_period != null) {
            maxPerPeriodNoSub = Number(accessNoSubRes.rows[0].max_per_period)
            const userUsageNoSubRes = await query(
              `SELECT COALESCE(SUM(amount_credits), 0) AS total FROM credit_usage_allocations WHERE account_id = $1 AND user_id = $2`,
              [subAccountNoSub.id, userId]
            )
            userUsedNoSub = normalizeUsageAmount(Number(userUsageNoSubRes.rows[0]?.total ?? 0))
          }
          const remainingNoSub = maxPerPeriodNoSub != null
            ? Math.max(0, Math.min(maxPerPeriodNoSub - userUsedNoSub, accountRemainingNoSub))
            : accountRemainingNoSub
          accountIdNoSub = subAccountNoSub.id
          serviceNoSub = {
            total_credits: accountRemainingNoSub,
            used_credits: 0,
            user_used_credits: userUsedNoSub,
            remaining_credits: remainingNoSub,
            usage_percent: 0,
            max_per_period: maxPerPeriodNoSub,
            is_active: true,
            period_start: null,
            period_end: null,
          }
        }
        const topupNoSubRes = await query(
          `SELECT id, balance_credits, reserved_credits FROM credit_accounts WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'topup' LIMIT 1`,
          [tenantId]
        )
        const topupNoSub = topupNoSubRes.rows[0] as { id: string; balance_credits: number; reserved_credits: number } | undefined
        let topupAutoUseNoSub = false
        let topupRemainingNoSub = 0
        if (topupNoSub?.id) {
          const topupAccessNoSub = await query(
            `SELECT allow_when_empty FROM credit_account_access WHERE user_id = $1 AND account_id = $2 LIMIT 1`,
            [userId, topupNoSub.id]
          )
          topupAutoUseNoSub = topupAccessNoSub.rows[0]?.allow_when_empty === true
          if (isOwnerNoSub || topupAutoUseNoSub) {
            topupRemainingNoSub = Math.max(0, Number(topupNoSub.balance_credits ?? 0) - Number(topupNoSub.reserved_credits ?? 0))
          }
        }
        grants.push({
          tenant_id: tenantId,
          tenant_name: tenantName,
          tenant_type: tenantType,
          plan_tier: "free",
          role_slug: roleSlug,
          account_id: accountIdNoSub,
          service: serviceNoSub,
          topup_auto_use: isOwnerNoSub || topupAutoUseNoSub,
          topup_account_id: topupNoSub?.id ?? null,
          topup_remaining_credits: topupRemainingNoSub,
        })
        continue
      }

      const planGrant = (
        await query(
          `SELECT monthly_credits FROM credit_plan_grants WHERE plan_slug = $1 AND billing_cycle = $2 AND credit_type = 'subscription' AND is_active = TRUE LIMIT 1`,
          [sub.plan_slug, sub.billing_cycle]
        )
      ).rows[0]

      const subAccountRes = await query(
        `SELECT id, balance_credits, reserved_credits FROM credit_accounts WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'subscription' LIMIT 1`,
        [tenantId]
      )
      const subAccount = subAccountRes.rows[0] as { id: string; balance_credits: number; reserved_credits: number } | undefined

      const periodStart = toIsoString(sub.current_period_start)
      const periodEnd = toIsoString(sub.current_period_end)
      const planTotal = Number(planGrant?.monthly_credits ?? 0)

      let tenantUsed = 0
      let userUsed = 0
      let maxPerPeriod: number | null = null
      let isActive = true

      if (subAccount?.id && periodStart && periodEnd) {
        const tenantUsageRes = await query(
          `SELECT COALESCE(SUM(amount_credits), 0) AS total FROM credit_ledger_entries WHERE account_id = $1 AND entry_type = 'usage' AND occurred_at >= $2 AND occurred_at < $3`,
          [subAccount.id, periodStart, periodEnd]
        )
        tenantUsed = normalizeUsageAmount(Number(tenantUsageRes.rows[0]?.total ?? 0))

        const userUsageRes = await query(
          `SELECT COALESCE(SUM(amount_credits), 0) AS total FROM credit_usage_allocations WHERE account_id = $1 AND user_id = $2 AND created_at >= $3 AND created_at < $4`,
          [subAccount.id, userId, periodStart, periodEnd]
        )
        userUsed = normalizeUsageAmount(Number(userUsageRes.rows[0]?.total ?? 0))

        const accessRes = await query(
          `SELECT is_active, max_per_period FROM credit_account_access WHERE user_id = $1 AND account_id = $2 LIMIT 1`,
          [userId, subAccount.id]
        )
        if (accessRes.rows[0]) {
          isActive = accessRes.rows[0].is_active !== false
          maxPerPeriod = accessRes.rows[0].max_per_period !== null && accessRes.rows[0].max_per_period !== undefined
            ? Number(accessRes.rows[0].max_per_period)
            : null
        }
      }

      const accountRemaining = subAccount
        ? Math.max(0, Number(subAccount.balance_credits ?? 0) - Number(subAccount.reserved_credits ?? 0))
        : 0
      const totalCredits = planTotal > 0 ? planTotal : tenantUsed + accountRemaining
      const tenantRemaining = planTotal > 0 ? Math.max(0, totalCredits - tenantUsed) : accountRemaining
      const usagePercent = totalCredits > 0 ? Math.min(100, (tenantUsed / totalCredits) * 100) : 0

      const remaining =
        maxPerPeriod != null
          ? Math.max(0, Math.min(maxPerPeriod - userUsed, tenantRemaining))
          : tenantRemaining

      let topupAutoUse = false
      let topupRemaining = 0
      const topupAccountRes = await query(
        `SELECT id, balance_credits, reserved_credits FROM credit_accounts WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'topup' LIMIT 1`,
        [tenantId]
      )
      const topupAccountRow = topupAccountRes.rows[0] as { id: string; balance_credits: number; reserved_credits: number } | undefined
      const topupAccountId = topupAccountRow?.id ?? null
      if (topupAccountId) {
        const topupAccessRes = await query(
          `SELECT allow_when_empty FROM credit_account_access WHERE user_id = $1 AND account_id = $2 LIMIT 1`,
          [userId, topupAccountId]
        )
        topupAutoUse = topupAccessRes.rows[0]?.allow_when_empty === true
        if (topupAutoUse && topupAccountRow) {
          topupRemaining = Math.max(0, Number(topupAccountRow.balance_credits ?? 0) - Number(topupAccountRow.reserved_credits ?? 0))
        }
      }

      grants.push({
        tenant_id: tenantId,
        tenant_name: tenantName,
        tenant_type: tenantType,
        plan_tier: sub.plan_tier ?? null,
        role_slug: roleSlug,
        account_id: subAccount?.id ?? null,
        service: {
          total_credits: totalCredits,
          used_credits: tenantUsed,
          user_used_credits: userUsed,
          remaining_credits: remaining,
          usage_percent: usagePercent,
          max_per_period: maxPerPeriod,
          is_active: isActive,
          period_start: periodStart || null,
          period_end: periodEnd || null,
        },
        topup_auto_use: topupAutoUse,
        topup_account_id: topupAccountId,
        topup_remaining_credits: topupRemaining,
      })
    }

    return res.json({ ok: true, grants })
  } catch (e: any) {
    console.error("getMyGrantedCredits error:", e)
    return res.status(500).json({ message: "Failed to load granted credits", details: String(e?.message || e) })
  }
}

export async function getMyCreditPreferences(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const userId = toStr(authed.userId)
    if (!userId) return res.status(401).json({ message: "user_id is required" })

    const res_ = await query(
      `SELECT selected_account_id FROM credit_user_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    )
    const row = res_.rows[0] as { selected_account_id: string | null } | undefined
    return res.json({
      ok: true,
      selected_account_id: row?.selected_account_id ?? null,
    })
  } catch (e: any) {
    console.error("getMyCreditPreferences error:", e)
    return res.status(500).json({ message: "Failed to get credit preferences", details: String(e?.message || e) })
  }
}

export async function updateMyCreditPreferences(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const userId = toStr(authed.userId)
    if (!userId) return res.status(401).json({ message: "user_id is required" })

    const rawAccountId = req.body?.selected_account_id
    const selectedAccountId =
      rawAccountId === null || rawAccountId === undefined || rawAccountId === ""
        ? null
        : toStr(String(rawAccountId))

    if (selectedAccountId !== null) {
      if (!isUuid(selectedAccountId)) {
        return res.status(400).json({ message: "selected_account_id must be a valid UUID" })
      }
      const accessRes = await query(
        `
        SELECT 1 FROM credit_accounts ca
        WHERE ca.id = $2 AND ca.status = 'active'
          AND (
            EXISTS (SELECT 1 FROM credit_account_access caa
                    WHERE caa.user_id = $1 AND caa.account_id = ca.id AND caa.is_active = TRUE)
            OR EXISTS (SELECT 1 FROM tenants t
                       WHERE t.id = ca.owner_tenant_id AND t.owner_id = $1 AND t.deleted_at IS NULL)
          )
        LIMIT 1
        `,
        [userId, selectedAccountId]
      )
      if (accessRes.rows.length === 0) {
        return res.status(403).json({ message: "No access to the specified credit account" })
      }
    }

    await query(
      `
      INSERT INTO credit_user_preferences (user_id, selected_account_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET selected_account_id = EXCLUDED.selected_account_id, updated_at = CURRENT_TIMESTAMP
      `,
      [userId, selectedAccountId]
    )

    return res.json({ ok: true, selected_account_id: selectedAccountId })
  } catch (e: any) {
    console.error("updateMyCreditPreferences error:", e)
    return res.status(500).json({ message: "Failed to update credit preferences", details: String(e?.message || e) })
  }
}

export async function listPublicTopupProducts(_req: Request, res: Response) {
  try {
    const result = await query(
      `
      SELECT id, sku_code, name, price_usd, credits, bonus_credits, currency, metadata
      FROM credit_topup_products
      WHERE is_active = TRUE
      ORDER BY price_usd ASC
      `
    )
    return res.json({ ok: true, rows: result.rows })
  } catch (e: any) {
    console.error("listPublicTopupProducts error:", e)
    return res.status(500).json({ message: "Failed to list topup products" })
  }
}
