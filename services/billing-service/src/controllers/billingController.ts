import { Request, Response } from "express"
import pool, { query } from "../config/db"
import type { AuthedRequest } from "../middleware/requireAuth"
import { lookupTenants } from "../services/identityClient"

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

const POLICY_EFFECTIVE_DATE = "2026-03-02"

function resolveClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const ip = typeof forwardedValue === "string" ? forwardedValue.split(",")[0]?.trim() : ""
  if (ip) return ip
  return typeof req.ip === "string" ? req.ip : ""
}

async function insertRefundPolicyConsent(
  client: any,
  userId: string,
  source: string,
  referenceId: string | null,
  req: Request
) {
  const ip = resolveClientIp(req)
  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : ""
  await client.query(
    `INSERT INTO user_policy_consents (user_id, policy_type, policy_version, agreed, source, reference_id, ip_address, user_agent)
     VALUES ($1, 'refund_policy', $2, TRUE, $3, $4, $5, $6)`,
    [userId, POLICY_EFFECTIVE_DATE, source, referenceId, ip || null, ua || null]
  )
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function safeNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

function nextMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0)
}

function diffDaysCeil(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime()
  return Math.max(0, Math.ceil(diff / MS_PER_DAY))
}

function countUsedMonths(start: Date, end: Date) {
  if (end < start) return 0
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
}

function countRemainingFullMonths(startNextMonth: Date, periodEnd: Date) {
  const endMonthStart = startOfMonth(periodEnd)
  if (startNextMonth >= endMonthStart) return 0
  let count = 0
  const cursor = new Date(startNextMonth.getTime())
  while (cursor < endMonthStart) {
    count += 1
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return count
}

function getMonthlyCredits(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return 0
  const raw = (metadata as Record<string, unknown>)?.monthly_credits
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0
}

const CREDITS_SERVICE_URL = process.env.CREDITS_SERVICE_URL || "http://credits-service:3011"
const CREDITS_SERVICE_KEY = process.env.CREDITS_SERVICE_KEY || ""

type CreditGrantMode = "reset" | "increment"
type SubscriptionCreditGrantPayload = {
  tenant_id: string
  subscription_id?: string | null
  plan_slug: string
  billing_cycle: string
  period_start?: string | null
  period_end: string
  grant_mode: CreditGrantMode
  grant_amount?: number | null
  grant_key?: string | null
  reason?: string | null
  credit_type?: string | null
}

async function requestSubscriptionCreditGrant(payload: SubscriptionCreditGrantPayload) {
  if (!CREDITS_SERVICE_KEY) {
    console.warn("credits-service key not configured; skip credit grant")
    return { ok: false, skipped: true, reason: "missing_service_key" }
  }
  const url = new URL("/api/ai/credits/internal/subscription-grant", CREDITS_SERVICE_URL)
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-key": CREDITS_SERVICE_KEY,
      },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      console.error("credits-service grant failed:", res.status, json)
      return { ok: false, status: res.status, response: json }
    }
    return { ok: true, response: json }
  } catch (e) {
    console.error("credits-service grant error:", e)
    return { ok: false, error: String((e as Error)?.message || e) }
  }
}

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  KRW: 0,
  JPY: 0,
}

function currencyDecimals(currency: string) {
  const key = toStr(currency).toUpperCase()
  return CURRENCY_DECIMALS[key] ?? 2
}

function roundMoney(value: number, currency: string) {
  const factor = 10 ** currencyDecimals(currency)
  return Math.round(value * factor) / factor
}

function normalizeCurrency(value: unknown) {
  const key = toStr(value).toUpperCase()
  if (!key || key.length !== 3) return ""
  return key
}

type FxRateMatch = {
  id: string | null
  rate: number
  effective_at?: string | null
}

async function pickLatestFxRate(client: any, base: string, quote: string): Promise<FxRateMatch | null> {
  const baseKey = normalizeCurrency(base)
  const quoteKey = normalizeCurrency(quote)
  if (!baseKey || !quoteKey) return null
  const res = await client.query(
    `
    SELECT id, rate, effective_at
    FROM fx_rates
    WHERE base_currency = $1 AND quote_currency = $2 AND is_active = TRUE
    ORDER BY effective_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    `,
    [baseKey, quoteKey]
  )
  const row = res.rows[0]
  if (!row) return null
  const rate = Number(row.rate)
  if (!Number.isFinite(rate) || rate <= 0) return null
  return { id: row.id, rate, effective_at: row.effective_at ?? null }
}

async function resolveFxRate(client: any, base: string, quote: string) {
  const baseKey = normalizeCurrency(base)
  const quoteKey = normalizeCurrency(quote)
  if (!baseKey || !quoteKey) return null
  if (baseKey === quoteKey) return { id: null, rate: 1, effective_at: null, inverted: false }
  const direct = await pickLatestFxRate(client, baseKey, quoteKey)
  if (direct) return { ...direct, inverted: false }
  const reverse = await pickLatestFxRate(client, quoteKey, baseKey)
  if (reverse) return { id: reverse.id, rate: 1 / reverse.rate, effective_at: reverse.effective_at ?? null, inverted: true }
  return null
}

async function pickLatestPlanPrice(
  client: any,
  planId: string,
  billingCycle: string,
  currency: string
): Promise<{ id: string; price_usd: any; currency: string; version?: any; effective_at?: any } | null> {
  const currencyKey = normalizeCurrency(currency)
  if (!currencyKey) return null
  const res = await client.query(
    `
    SELECT id, price_usd, currency, version, effective_at
    FROM billing_plan_prices
    WHERE plan_id = $1 AND billing_cycle = $2 AND status = 'active' AND currency = $3
    ORDER BY effective_at DESC NULLS LAST, version DESC
    LIMIT 1
    `,
    [planId, billingCycle, currencyKey]
  )
  return res.rows[0] || null
}

function quoteError(status: number, message: string) {
  const err = new Error(message)
  ;(err as any).status = status
  return err
}

async function resolveUserQuote(client: any, tenantId: string, planId: string, billingCycle: string) {
  if (!tenantId) throw quoteError(400, "tenantId is required")
  if (!planId) throw quoteError(400, "plan_id is required")
  if (!BILLING_CYCLES.has(billingCycle)) throw quoteError(400, "invalid billing_cycle")

  const accountRes = await client.query(
    `SELECT currency, tax_country_code, country_code FROM billing_accounts WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  )
  const accountRow = accountRes.rows[0] || {}
  const targetCurrency = normalizeCurrency(accountRow.currency) || "USD"
  const taxCountryCode = toStr(accountRow.tax_country_code || accountRow.country_code).toUpperCase()

  const priceRow = await pickLatestPlanPrice(client, planId, billingCycle, "USD")
  if (!priceRow) throw quoteError(404, "Billing plan price not found")

  const baseCurrency = "USD"
  const rawAmount = priceRow.price_usd
  const baseAmount = rawAmount === null || rawAmount === undefined || rawAmount === "" ? 0 : Number(rawAmount)
  if (!Number.isFinite(baseAmount) || baseAmount < 0) {
    throw quoteError(400, "price_usd must be >= 0")
  }

  let amount = roundMoney(baseAmount, targetCurrency)
  let fxRate: number | null = null
  let fxRateId: string | null = null
  let fxEffectiveAt: string | null = null
  if (targetCurrency !== "USD") {
    const fx = await resolveFxRate(client, "USD", targetCurrency)
    if (!fx) throw quoteError(404, "FX rate not found")
    fxRate = fx.rate
    fxRateId = fx.id
    fxEffectiveAt = fx.effective_at ?? null
    amount = roundMoney(baseAmount * fxRate, targetCurrency)
  }

  const taxRateRow = taxCountryCode ? await pickLatestTaxRate(client, taxCountryCode) : null
  const taxRatePercent = taxRateRow ? Number(taxRateRow.rate_percent) : 0
  const taxAmount =
    Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(amount * (taxRatePercent / 100), targetCurrency) : 0
  const totalAmount = roundMoney(amount + taxAmount, targetCurrency)

  const taxAmountUsd =
    Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(baseAmount * (taxRatePercent / 100), "USD") : 0
  const totalAmountUsd = roundMoney(baseAmount + taxAmountUsd, "USD")

  return {
    currency: targetCurrency,
    amount,
    base_currency: baseCurrency,
    base_amount: baseAmount,
    fx_rate: fxRate,
    fx_rate_id: fxRateId,
    fx_effective_at: fxEffectiveAt,
    tax_rate_percent: taxRatePercent,
    tax_rate_id: taxRateRow?.id ?? null,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    tax_amount_usd: taxAmountUsd,
    total_amount_usd: totalAmountUsd,
    price_id: priceRow?.id ?? null,
    price_currency: priceRow?.currency ?? baseCurrency,
  }
}

type SafePlanQuote = {
  currency: string
  amount: number | null
  base_amount: number | null
  fx_rate: number | null
  tax_rate_percent: number
}

async function safeResolveUserQuote(client: any, tenantId: string, planId: string, billingCycle: string): Promise<SafePlanQuote> {
  try {
    const quote = await resolveUserQuote(client, tenantId, planId, billingCycle)
    return {
      currency: quote.currency || "USD",
      amount: typeof quote.amount === "number" ? quote.amount : null,
      base_amount: typeof quote.base_amount === "number" ? quote.base_amount : null,
      fx_rate: typeof quote.fx_rate === "number" ? quote.fx_rate : null,
      tax_rate_percent: safeNumber(quote.tax_rate_percent, 0),
    }
  } catch {
    return { currency: "USD", amount: null, base_amount: null, fx_rate: null, tax_rate_percent: 0 }
  }
}

function pickMonthlyPrice(monthly: SafePlanQuote, yearly: SafePlanQuote) {
  if (typeof monthly.amount === "number") return monthly.amount
  if (typeof yearly.amount === "number") return yearly.amount / 12
  return 0
}

function pickYearlyPrice(yearly: SafePlanQuote, monthly: SafePlanQuote) {
  if (typeof yearly.amount === "number") return yearly.amount
  if (typeof monthly.amount === "number") return monthly.amount * 12
  return 0
}

function pickMonthlyBase(monthly: SafePlanQuote, yearly: SafePlanQuote) {
  if (typeof monthly.base_amount === "number") return monthly.base_amount
  if (typeof yearly.base_amount === "number") return yearly.base_amount / 12
  return 0
}

function pickYearlyBase(yearly: SafePlanQuote, monthly: SafePlanQuote) {
  if (typeof yearly.base_amount === "number") return yearly.base_amount
  if (typeof monthly.base_amount === "number") return monthly.base_amount * 12
  return 0
}

async function pickLatestTaxRate(client: any, countryCode: string) {
  const code = toStr(countryCode).toUpperCase()
  if (!code) return null
  const res = await client.query(
    `
    SELECT id, rate_percent, effective_at
    FROM tax_rates
    WHERE country_code = $1 AND is_active = TRUE
    ORDER BY effective_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    `,
    [code]
  )
  return res.rows[0] || null
}

let billingInvoiceColumns: Set<string> | null = null

async function isSystemTenantId(client: any, tenantId: string): Promise<boolean> {
  if (!tenantId) return false
  const r = await client.query(
    `
    SELECT slug, COALESCE((metadata->>'system')::boolean, FALSE) AS is_system
    FROM tenants
    WHERE id = $1 AND deleted_at IS NULL
    LIMIT 1
    `,
    [tenantId]
  )
  const row = r.rows[0]
  if (!row) return false
  return Boolean(row.is_system) || String(row.slug || "") === "system"
}

async function loadInvoiceColumns(client: any) {
  if (billingInvoiceColumns) return billingInvoiceColumns
  const res = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_invoices'
    `
  )
  billingInvoiceColumns = new Set(res.rows.map((row: any) => String(row.column_name)))
  return billingInvoiceColumns
}

function makeInvoiceNumber(prefix = "SVP") {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${prefix}-${stamp}-${rand}`
}

async function scheduleExcessSeatAddonCancellation(
  client: any,
  subscriptionId: string,
  tenantId: string,
  targetPlan: { tenant_type?: string; max_seats?: number | null; included_seats?: number | null } | null,
  reason: string
) {
  const isPersonal = targetPlan?.tenant_type === "personal"
  if (isPersonal) {
    await client.query(
      `
      UPDATE billing_subscription_seat_addons
      SET status = 'scheduled_cancel',
          cancel_at_period_end = TRUE,
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{auto_cancel_reason}', to_jsonb($3::text), TRUE),
          updated_at = CURRENT_TIMESTAMP
      WHERE subscription_id = $1 AND tenant_id = $2 AND status = 'active'
      `,
      [subscriptionId, tenantId, reason]
    )
    return
  }

  const maxSeats = typeof targetPlan?.max_seats === "number" ? targetPlan.max_seats : null
  const includedSeats = typeof targetPlan?.included_seats === "number" ? targetPlan.included_seats : 0
  if (maxSeats === null) return

  const maxExpandable = Math.max(0, maxSeats - includedSeats)

  const addonsRes = await client.query(
    `
    SELECT id, quantity FROM billing_subscription_seat_addons
    WHERE subscription_id = $1 AND tenant_id = $2 AND status = 'active'
    ORDER BY effective_at ASC
    `,
    [subscriptionId, tenantId]
  )

  let remaining = maxExpandable
  const toCancel: string[] = []
  for (const addon of addonsRes.rows) {
    const qty = Number(addon.quantity ?? 0)
    if (remaining >= qty) {
      remaining -= qty
    } else {
      toCancel.push(addon.id)
    }
  }

  if (toCancel.length > 0) {
    await client.query(
      `
      UPDATE billing_subscription_seat_addons
      SET status = 'scheduled_cancel',
          cancel_at_period_end = TRUE,
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{auto_cancel_reason}', to_jsonb($3::text), TRUE),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::uuid[]) AND subscription_id = $2
      `,
      [toCancel, subscriptionId, reason]
    )
  }
}

async function loadCurrentSubscription(client: any, tenantId: string) {
  const res = await client.query(
    `
    SELECT
      s.*,
      b.name AS plan_name,
      b.tier AS plan_tier,
      b.sort_order AS plan_sort_order,
      b.tenant_type AS plan_tenant_type,
      b.metadata AS plan_metadata
    FROM billing_subscriptions s
    JOIN billing_plans b ON b.id = s.plan_id
    WHERE s.tenant_id = $1 AND s.status <> 'cancelled'
    ORDER BY s.created_at DESC
    LIMIT 1
    `,
    [tenantId]
  )
  return res.rows[0] || null
}

async function loadPlan(client: any, planId: string) {
  const res = await client.query(
    `
    SELECT id, slug, name, tier, sort_order, tenant_type, included_seats, max_seats, extra_seat_price_usd, metadata
    FROM billing_plans
    WHERE id = $1
    `,
    [planId]
  )
  return res.rows[0] || null
}

async function ensureBillingAccount(client: any, tenantId: string, currency: string, userId?: string | null) {
  const res = await client.query(`SELECT id FROM billing_accounts WHERE tenant_id = $1`, [tenantId])
  let billingAccountId = res.rows[0]?.id
  if (!billingAccountId) {
    const createRes = await client.query(
      `
      INSERT INTO billing_accounts (tenant_id, currency, metadata)
      VALUES ($1,$2,$3::jsonb)
      RETURNING id
      `,
      [tenantId, currency, JSON.stringify({ source: "user_subscription_change", created_by: userId || null })]
    )
    billingAccountId = createRes.rows[0]?.id
  }
  return billingAccountId || null
}

async function resolvePaymentMethodId(client: any, billingAccountId: string, inputId?: string | null) {
  const candidate = toStr(inputId)
  if (candidate) {
    const check = await client.query(
      `SELECT id FROM payment_methods WHERE id = $1 AND billing_account_id = $2 AND status <> 'deleted'`,
      [candidate, billingAccountId]
    )
    if (check.rows[0]?.id) return check.rows[0].id as string
  }
  const fallback = await client.query(
    `SELECT pm.id AS id
     FROM billing_accounts ba
     LEFT JOIN payment_methods pm ON pm.id = ba.default_payment_method_id AND pm.status <> 'deleted'
     WHERE ba.id = $1`,
    [billingAccountId]
  )
  return (fallback.rows[0]?.id as string | undefined) ?? null
}

async function insertPaymentTransaction(
  client: any,
  params: {
    billing_account_id: string
    amount_usd: number
    amount_local?: number | null
    currency?: string
    local_currency?: string
    transaction_type: "charge" | "refund" | "adjustment"
    status?: "pending" | "succeeded" | "failed" | "refunded" | "cancelled"
    provider?: string
    metadata?: Record<string, unknown> | null
    processed_at?: string | null
    invoice_id?: string | null
    payment_method_id?: string | null
  }
) {
  const status = params.status || (params.transaction_type === "refund" ? "refunded" : "succeeded")
  const provider = params.provider || "toss"
  const processedAt = params.processed_at || new Date().toISOString()
  const result = await client.query(
    `
    INSERT INTO payment_transactions
      (billing_account_id, provider, transaction_type, status,
       amount_usd, currency, amount_local, local_currency,
       invoice_id, payment_method_id,
       processed_at, provider_transaction_id, metadata)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
    RETURNING *
    `,
    [
      params.billing_account_id,
      provider,
      params.transaction_type,
      status,
      params.amount_usd,
      params.currency || "USD",
      params.amount_local ?? null,
      params.local_currency ?? null,
      params.invoice_id ?? null,
      params.payment_method_id ?? null,
      processedAt,
      makeInvoiceNumber(params.transaction_type === "refund" ? "USR-RF" : "USR-TX"),
      JSON.stringify(params.metadata || {}),
    ]
  )
  return result.rows[0] || null
}

function addBillingCycle(date: Date, billingCycle: string) {
  const d = new Date(date.getTime())
  if (billingCycle === "yearly") {
    d.setFullYear(d.getFullYear() + 1)
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d
}

async function buildSubscriptionChangeQuote(
  client: any,
  tenantId: string,
  action: "change" | "cancel",
  targetPlanId?: string,
  targetBillingCycle?: string
) {
  const current = await loadCurrentSubscription(client, tenantId)
  if (!current) throw quoteError(404, "Active subscription not found")

  const now = new Date()
  const currentPeriodStart = new Date(current.current_period_start)
  const currentPeriodEnd = new Date(current.current_period_end)
  const currentCycle = String(current.billing_cycle || "monthly")

  const currentMonthlyQuote = await safeResolveUserQuote(client, tenantId, current.plan_id, "monthly")
  const currentYearlyQuote = await safeResolveUserQuote(client, tenantId, current.plan_id, "yearly")
  const currentMonthlyPrice = pickMonthlyPrice(currentMonthlyQuote, currentYearlyQuote)
  const currentYearlyPrice = pickYearlyPrice(currentYearlyQuote, currentMonthlyQuote)
  const currentMonthlyBase = pickMonthlyBase(currentMonthlyQuote, currentYearlyQuote)
  const currentYearlyBase = pickYearlyBase(currentYearlyQuote, currentMonthlyQuote)
  const currentFxRate = currentMonthlyQuote.fx_rate ?? currentYearlyQuote.fx_rate ?? null
  const currentCredits = getMonthlyCredits(current.plan_metadata)

  let targetPlan: any | null = null
  let targetCycle = currentCycle
  if (action === "change") {
    if (!targetPlanId) throw quoteError(400, "target_plan_id is required")
    if (!targetBillingCycle) throw quoteError(400, "target_billing_cycle is required")
    targetCycle = String(targetBillingCycle)
    if (!BILLING_CYCLES.has(targetCycle)) throw quoteError(400, "invalid target_billing_cycle")
    targetPlan = await loadPlan(client, targetPlanId)
    if (!targetPlan) throw quoteError(404, "target plan not found")
    if (String(targetPlan.id) === String(current.plan_id) && targetCycle === currentCycle) {
      throw quoteError(400, "no changes requested")
    }
  }

  const targetMonthlyQuote =
    action === "change" && targetPlan ? await safeResolveUserQuote(client, tenantId, targetPlan.id, "monthly") : currentMonthlyQuote
  const targetYearlyQuote =
    action === "change" && targetPlan ? await safeResolveUserQuote(client, tenantId, targetPlan.id, "yearly") : currentYearlyQuote

  const targetMonthlyPrice = pickMonthlyPrice(targetMonthlyQuote, targetYearlyQuote)
  const targetYearlyPrice = pickYearlyPrice(targetYearlyQuote, targetMonthlyQuote)
  const targetMonthlyBase = pickMonthlyBase(targetMonthlyQuote, targetYearlyQuote)
  const targetYearlyBase = pickYearlyBase(targetYearlyQuote, targetMonthlyQuote)
  const targetFxRate = targetMonthlyQuote.fx_rate ?? targetYearlyQuote.fx_rate ?? null
  const targetCredits = getMonthlyCredits(targetPlan?.metadata ?? null)

  const currency =
    (action === "change" && targetPlan ? targetMonthlyQuote.currency : currentMonthlyQuote.currency) ||
    normalizeCurrency(current.currency) ||
    "USD"
  const taxRatePercent = safeNumber(
    (action === "change" && targetPlan ? targetMonthlyQuote.tax_rate_percent : currentMonthlyQuote.tax_rate_percent) || 0,
    0
  )

  const paidAmount = safeNumber(
    current.price_local !== null && current.price_local !== undefined
      ? current.price_local
      : current.currency === "USD"
        ? current.price_usd
        : null,
    currentCycle === "yearly" ? currentYearlyPrice : currentMonthlyPrice
  )

  const planOrderCurrent = safeNumber(current.plan_sort_order, 0)
  const planOrderTarget = safeNumber(targetPlan?.sort_order, planOrderCurrent)
  const isUpgrade = action === "change" ? planOrderTarget > planOrderCurrent : false

  let changeType = action === "cancel" ? "cancel" : "change"
  if (action === "change") {
    if (currentCycle === "monthly" && targetCycle === "monthly") {
      changeType = isUpgrade ? "monthly_upgrade" : "monthly_downgrade"
    } else if (currentCycle === "monthly" && targetCycle === "yearly") {
      changeType = "monthly_to_yearly"
    } else if (currentCycle === "yearly" && targetCycle === "yearly") {
      changeType = isUpgrade ? "annual_upgrade" : "annual_downgrade"
    } else if (currentCycle === "yearly" && targetCycle === "monthly") {
      changeType = "annual_downgrade"
    }
  }

  let chargeAmount = 0
  let refundAmount = 0
  let creditDelta = 0
  let schedule = false
  let effectiveAt = now.toISOString()
  let nextBillingDate = currentPeriodEnd.toISOString()

  if (action === "cancel") {
    schedule = true
    if (currentCycle === "yearly") {
      const usedMonths = countUsedMonths(currentPeriodStart, now)
      refundAmount = Math.max(0, paidAmount - currentMonthlyPrice * usedMonths)
      effectiveAt = endOfMonth(now).toISOString()
    } else {
      effectiveAt = currentPeriodEnd.toISOString()
    }
  } else if (changeType === "monthly_upgrade") {
    const totalDays = Math.max(1, diffDaysCeil(currentPeriodStart, currentPeriodEnd))
    const remainingDays = diffDaysCeil(now, currentPeriodEnd)
    const ratio = clampNumber(remainingDays / totalDays, 0, 1)
    const diff = targetMonthlyPrice - currentMonthlyPrice
    chargeAmount = Math.max(0, diff * ratio)
    creditDelta = Math.max(0, (targetCredits - currentCredits) * ratio)
    nextBillingDate = currentPeriodEnd.toISOString()
  } else if (changeType === "monthly_downgrade") {
    schedule = true
    effectiveAt = currentPeriodEnd.toISOString()
    nextBillingDate = currentPeriodEnd.toISOString()
  } else if (changeType === "monthly_to_yearly") {
    chargeAmount = targetYearlyPrice
    nextBillingDate = addBillingCycle(now, "yearly").toISOString()
  } else if (changeType === "annual_upgrade") {
    const monthEnd = endOfMonth(now)
    const remainingDays = diffDaysCeil(now, monthEnd)
    const daysInMonth = Math.max(1, monthEnd.getDate())
    const ratio = clampNumber(remainingDays / daysInMonth, 0, 1)
    const remainingMonths = countRemainingFullMonths(nextMonthStart(now), currentPeriodEnd)
    const diff = targetMonthlyPrice - currentMonthlyPrice
    chargeAmount = Math.max(0, diff * ratio + diff * remainingMonths)
    creditDelta = Math.max(0, (targetCredits - currentCredits) * ratio)
    nextBillingDate = currentPeriodEnd.toISOString()
  } else if (changeType === "annual_downgrade") {
    const usedMonths = countUsedMonths(currentPeriodStart, now)
    refundAmount = Math.max(0, paidAmount - currentMonthlyPrice * usedMonths)
    chargeAmount = targetCycle === "yearly" ? targetYearlyPrice : targetMonthlyPrice
    nextBillingDate = addBillingCycle(now, targetCycle).toISOString()
  }

  chargeAmount = roundMoney(chargeAmount, currency)
  refundAmount = roundMoney(refundAmount, currency)
  creditDelta = Math.max(0, Math.round(creditDelta))
  const taxAmount =
    chargeAmount > 0 && taxRatePercent > 0 ? roundMoney(chargeAmount * (taxRatePercent / 100), currency) : 0
  const totalAmount = roundMoney(chargeAmount + taxAmount, currency)
  const netAmount = roundMoney(totalAmount - refundAmount, currency)

  return {
    action,
    change_type: changeType,
    schedule,
    currency,
    tax_rate_percent: taxRatePercent,
    charge_amount: chargeAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    refund_amount: refundAmount,
    net_amount: netAmount,
    credit_delta: creditDelta,
    effective_at: effectiveAt,
    next_billing_date: nextBillingDate,
    current: {
      plan_id: current.plan_id,
      plan_name: current.plan_name,
      plan_tier: current.plan_tier,
      billing_cycle: currentCycle,
      price_monthly: roundMoney(currentMonthlyPrice, currency),
      price_yearly: roundMoney(currentYearlyPrice, currency),
      price_monthly_usd: roundMoney(currentMonthlyBase, "USD"),
      price_yearly_usd: roundMoney(currentYearlyBase, "USD"),
      fx_rate: currentFxRate,
    },
    target: targetPlan
      ? {
          plan_id: targetPlan.id,
          plan_slug: targetPlan.slug ?? null,
          plan_name: targetPlan.name,
          plan_tier: targetPlan.tier,
          plan_sort_order: targetPlan.sort_order ?? 0,
          billing_cycle: targetCycle,
          price_monthly: roundMoney(targetMonthlyPrice, currency),
          price_yearly: roundMoney(targetYearlyPrice, currency),
          price_monthly_usd: roundMoney(targetMonthlyBase, "USD"),
          price_yearly_usd: roundMoney(targetYearlyBase, "USD"),
          fx_rate: targetFxRate,
          tenant_type: targetPlan.tenant_type || null,
          included_seats: targetPlan.included_seats ?? null,
        }
      : null,
  }
}

const PLAN_TIERS = new Set(["free", "pro", "premium", "business", "enterprise"])
const TENANT_TYPES = new Set(["personal", "team", "group"])
const BILLING_CYCLES = new Set(["monthly", "yearly"])
const PRICE_STATUSES = new Set(["active", "draft", "retired"])
const FX_SOURCES = new Set(["operating", "market"])
const TAX_SOURCES = new Set(["manual", "market"])
const SUBSCRIPTION_STATUSES = new Set(["active", "cancelled", "past_due", "trialing", "suspended", "scheduled_cancel"])
const CHANGE_TYPES = new Set(["upgrade", "downgrade", "cancel", "resume"])
const CHANGE_STATUSES = new Set(["scheduled", "applied", "cancelled"])
const INVOICE_STATUSES = new Set(["draft", "open", "paid", "void", "uncollectible"])
const TRANSACTION_TYPES = new Set(["charge", "refund", "adjustment"])
const TRANSACTION_STATUSES = new Set(["pending", "succeeded", "failed", "refunded", "cancelled"])
const SEAT_ADDON_STATUSES = new Set(["active", "scheduled_cancel", "cancelled"])

const SYNC_KEYS = {
  fx: "fx_rates",
  tax: "tax_rates",
}

const FX_BASE_CURRENCY = "USD"
const FX_TARGET_CURRENCIES = ["KRW", "USD", "JPY", "CNY", "SGD", "GBP", "EUR", "AUD", "CAD"]
const FX_RATE_PRECISION = 6
const FX_SYNC_LOOKBACK_DAYS = 7

const KOREAEXIM_BASE_URL =
  process.env.KOREAEXIM_BASE_URL || "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON"
const KOREAEXIM_AUTH_KEY = process.env.KOREAEXIM_AUTH_KEY || process.env.KOREAEXIM_API_KEY || ""
const KOREAEXIM_DATA_CODE = process.env.KOREAEXIM_DATA_CODE || "AP01"

const DEFAULT_TAX_RATES: Record<string, { name: string; rate_percent: number }> = {
  KR: { name: "KR VAT", rate_percent: 10 },
  US: { name: "US Sales Tax", rate_percent: 0 },
  JP: { name: "JP Consumption Tax", rate_percent: 10 },
  CN: { name: "CN VAT", rate_percent: 13 },
  SG: { name: "SG GST", rate_percent: 9 },
  GB: { name: "GB VAT", rate_percent: 20 },
  DE: { name: "DE VAT", rate_percent: 19 },
  FR: { name: "FR VAT", rate_percent: 20 },
  AU: { name: "AU GST", rate_percent: 10 },
  CA: { name: "CA GST", rate_percent: 5 },
}

function roundFxRate(value: number) {
  const factor = 10 ** FX_RATE_PRECISION
  return Math.round(value * factor) / factor
}

function parseRateNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const cleaned = String(value).replace(/[^\d.-]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return n
}

function formatKstDateYYYYMMDD(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value
  }
  return `${map.year}${map.month}${map.day}`
}

function toKstMidnightIso(ymd: string) {
  if (!/^\d{8}$/.test(ymd)) return new Date().toISOString()
  const year = Number(ymd.slice(0, 4))
  const month = Number(ymd.slice(4, 6))
  const day = Number(ymd.slice(6, 8))
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+09:00`
  return new Date(iso).toISOString()
}

function parseEximUnit(raw: unknown) {
  const unit = toStr(raw).toUpperCase()
  const match = unit.match(/^([A-Z]{3})\s*\((\d+)\)$/)
  if (match) {
    return { code: match[1], scale: Number(match[2]) || 1 }
  }
  return { code: unit, scale: 1 }
}

async function fetchKoreaEximRates(searchDate: string) {
  if (!KOREAEXIM_AUTH_KEY) throw new Error("KOREAEXIM_AUTH_KEY is required")
  const url = new URL(KOREAEXIM_BASE_URL)
  url.searchParams.set("authkey", KOREAEXIM_AUTH_KEY)
  url.searchParams.set("searchdate", searchDate)
  url.searchParams.set("data", KOREAEXIM_DATA_CODE)

  const res = await fetch(url.toString())
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`KOREAEXIM API error: ${res.status} ${text}`)
  }
  try {
    const json = JSON.parse(text)
    if (!Array.isArray(json)) throw new Error("KOREAEXIM API response is not array")
    return json
  } catch (e) {
    throw new Error("KOREAEXIM API JSON parse failed")
  }
}

async function loadLatestKoreaEximRates() {
  const today = new Date()
  let lastError: unknown = null
  for (let i = 0; i < FX_SYNC_LOOKBACK_DAYS; i += 1) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const searchDate = formatKstDateYYYYMMDD(d)
    try {
      const rows = await fetchKoreaEximRates(searchDate)
      if (Array.isArray(rows) && rows.length > 0) {
        return { searchDate, rows }
      }
    } catch (e) {
      lastError = e
    }
  }
  if (lastError) throw lastError
  throw new Error("KOREAEXIM API returned empty data")
}

function buildMarketFxRates(rows: any[]) {
  const map = new Map<string, number>()
  for (const row of rows) {
    const { code, scale } = parseEximUnit(row?.cur_unit)
    const raw = parseRateNumber(row?.deal_bas_r)
    if (!code || !raw || scale <= 0) continue
    map.set(code, raw / scale)
  }

  const krwPerUsd = map.get("USD")
  if (!krwPerUsd) throw new Error("USD 환율을 찾을 수 없습니다.")

  const rates: Array<{ quote_currency: string; rate: number }> = []
  const missing: string[] = []

  for (const currency of FX_TARGET_CURRENCIES) {
    if (currency === "USD") {
      rates.push({ quote_currency: currency, rate: 1 })
      continue
    }
    if (currency === "KRW") {
      rates.push({ quote_currency: currency, rate: krwPerUsd })
      continue
    }
    const krwPerTarget = map.get(currency)
    if (!krwPerTarget) {
      missing.push(currency)
      continue
    }
    const rate = krwPerUsd / krwPerTarget
    rates.push({ quote_currency: currency, rate })
  }

  return { rates, missing }
}

async function ensureSyncStatus(client: any, syncKey: string) {
  await client.query(
    `
    INSERT INTO billing_sync_status (sync_key, is_enabled)
    VALUES ($1, TRUE)
    ON CONFLICT (sync_key) DO NOTHING
    `,
    [syncKey]
  )
  const res = await client.query(`SELECT * FROM billing_sync_status WHERE sync_key = $1`, [syncKey])
  return res.rows[0] || null
}

async function updateSyncStatus(
  client: any,
  syncKey: string,
  input: {
    is_enabled?: boolean
    last_run_at?: string | null
    last_success_at?: string | null
    last_error?: string | null
    last_source?: string | null
    last_record_count?: number | null
  }
) {
  const fields: string[] = []
  const params: any[] = []
  const setField = (name: string, value: any) => {
    fields.push(`${name} = $${params.length + 1}`)
    params.push(value)
  }

  if (input.is_enabled !== undefined) setField("is_enabled", input.is_enabled)
  if (input.last_run_at !== undefined) setField("last_run_at", input.last_run_at)
  if (input.last_success_at !== undefined) setField("last_success_at", input.last_success_at)
  if (input.last_error !== undefined) setField("last_error", input.last_error)
  if (input.last_source !== undefined) setField("last_source", input.last_source)
  if (input.last_record_count !== undefined) setField("last_record_count", input.last_record_count)

  if (fields.length === 0) return ensureSyncStatus(client, syncKey)

  const res = await client.query(
    `
    UPDATE billing_sync_status
    SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
    WHERE sync_key = $${params.length + 1}
    RETURNING *
    `,
    [...params, syncKey]
  )
  return res.rows[0] || ensureSyncStatus(client, syncKey)
}

async function syncFxRatesInternal(client: any) {
  const { searchDate, rows } = await loadLatestKoreaEximRates()
  const effectiveAtBase = toKstMidnightIso(searchDate)
  const { rates, missing } = buildMarketFxRates(rows)

  let inserted = 0
  let skipped = 0

  await client.query("BEGIN")
  try {
    for (const entry of rates) {
      const quoteCurrency = normalizeCurrency(entry.quote_currency)
      const nextRate = roundFxRate(entry.rate)
      if (!quoteCurrency || !Number.isFinite(nextRate) || nextRate <= 0) continue

      const latestRes = await client.query(
        `
        SELECT rate, effective_at
        FROM fx_rates
        WHERE base_currency = $1 AND quote_currency = $2 AND source = 'market'
        ORDER BY effective_at DESC NULLS LAST, created_at DESC
        LIMIT 1
        `,
        [FX_BASE_CURRENCY, quoteCurrency]
      )
      const latestRow = latestRes.rows[0]
      if (latestRow) {
        const latestRate = roundFxRate(Number(latestRow.rate))
        if (Number.isFinite(latestRate) && latestRate === nextRate) {
          skipped += 1
          continue
        }
      }

      let effectiveAt = effectiveAtBase
      if (latestRow?.effective_at) {
        const latestIso = new Date(latestRow.effective_at).toISOString()
        if (latestIso === effectiveAtBase) {
          effectiveAt = new Date().toISOString()
        }
      }

      await client.query(
        `
        UPDATE fx_rates
        SET is_active = FALSE
        WHERE base_currency = $1 AND quote_currency = $2 AND source = 'market' AND is_active = TRUE
        `,
        [FX_BASE_CURRENCY, quoteCurrency]
      )
      await client.query(
        `
        INSERT INTO fx_rates (base_currency, quote_currency, rate, source, effective_at, is_active)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [FX_BASE_CURRENCY, quoteCurrency, nextRate, "market", effectiveAt, true]
      )
      inserted += 1
    }

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  }

  return { inserted, skipped, missing, effective_at: effectiveAtBase, search_date: searchDate }
}

async function syncTaxRatesInternal(client: any) {
  const nowIso = new Date().toISOString()
  let inserted = 0
  let skipped = 0

  await client.query("BEGIN")
  try {
    for (const [countryCode, entry] of Object.entries(DEFAULT_TAX_RATES)) {
      const rate = Number(entry.rate_percent)
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) continue

      const latestRes = await client.query(
        `
        SELECT rate_percent
        FROM tax_rates
        WHERE country_code = $1 AND source = 'market'
        ORDER BY effective_at DESC NULLS LAST, created_at DESC
        LIMIT 1
        `,
        [countryCode]
      )
      const latestRow = latestRes.rows[0]
      if (latestRow) {
        const latestRate = Number(latestRow.rate_percent)
        if (Number.isFinite(latestRate) && latestRate === rate) {
          skipped += 1
          continue
        }
      }

      await client.query(
        `
        UPDATE tax_rates
        SET is_active = FALSE
        WHERE country_code = $1 AND is_active = TRUE
        `,
        [countryCode]
      )
      await client.query(
        `
        INSERT INTO tax_rates (name, country_code, rate_percent, source, effective_at, is_active)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [entry.name, countryCode, rate, "market", nowIso, true]
      )
      inserted += 1
    }

    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  }

  return { inserted, skipped, effective_at: nowIso }
}

export async function getFxSyncStatus(req: Request, res: Response) {
  try {
    const row = await ensureSyncStatus(pool, SYNC_KEYS.fx)
    return res.json({ ok: true, row })
  } catch (e: any) {
    console.error("getFxSyncStatus error:", e)
    return res.status(500).json({ message: "Failed to load FX sync status", details: String(e?.message || e) })
  }
}

export async function updateFxSyncStatus(req: Request, res: Response) {
  try {
    const isEnabled = toBool(req.body?.is_enabled)
    if (isEnabled === null) return res.status(400).json({ message: "is_enabled is required" })
    const row = await updateSyncStatus(pool, SYNC_KEYS.fx, { is_enabled: isEnabled })
    return res.json({ ok: true, row })
  } catch (e: any) {
    console.error("updateFxSyncStatus error:", e)
    return res.status(500).json({ message: "Failed to update FX sync status", details: String(e?.message || e) })
  }
}

export async function syncFxRates(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const force = toBool(req.body?.force) ?? toBool(req.query?.force) ?? false
    const status = await ensureSyncStatus(client, SYNC_KEYS.fx)
    if (!status?.is_enabled && !force) {
      return res.status(409).json({ message: "FX sync is disabled" })
    }
    const startedAt = new Date().toISOString()
    await updateSyncStatus(client, SYNC_KEYS.fx, { last_run_at: startedAt, last_error: null })

    const result = await syncFxRatesInternal(client)
    const finishedAt = new Date().toISOString()
    const row = await updateSyncStatus(client, SYNC_KEYS.fx, {
      last_success_at: finishedAt,
      last_error: null,
      last_source: "market",
      last_record_count: result.inserted,
    })

    return res.json({ ok: true, status: row, ...result })
  } catch (e: any) {
    const message = String(e?.message || e)
    await updateSyncStatus(client, SYNC_KEYS.fx, { last_error: message })
    console.error("syncFxRates error:", e)
    return res.status(500).json({ message: "Failed to sync FX rates", details: message })
  } finally {
    client.release()
  }
}

export async function getTaxSyncStatus(req: Request, res: Response) {
  try {
    const row = await ensureSyncStatus(pool, SYNC_KEYS.tax)
    return res.json({ ok: true, row })
  } catch (e: any) {
    console.error("getTaxSyncStatus error:", e)
    return res.status(500).json({ message: "Failed to load tax sync status", details: String(e?.message || e) })
  }
}

export async function updateTaxSyncStatus(req: Request, res: Response) {
  try {
    const isEnabled = toBool(req.body?.is_enabled)
    if (isEnabled === null) return res.status(400).json({ message: "is_enabled is required" })
    const row = await updateSyncStatus(pool, SYNC_KEYS.tax, { is_enabled: isEnabled })
    return res.json({ ok: true, row })
  } catch (e: any) {
    console.error("updateTaxSyncStatus error:", e)
    return res.status(500).json({ message: "Failed to update tax sync status", details: String(e?.message || e) })
  }
}

export async function syncTaxRates(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const force = toBool(req.body?.force) ?? toBool(req.query?.force) ?? false
    const status = await ensureSyncStatus(client, SYNC_KEYS.tax)
    if (!status?.is_enabled && !force) {
      return res.status(409).json({ message: "Tax sync is disabled" })
    }
    const startedAt = new Date().toISOString()
    await updateSyncStatus(client, SYNC_KEYS.tax, { last_run_at: startedAt, last_error: null })

    const result = await syncTaxRatesInternal(client)
    const finishedAt = new Date().toISOString()
    const row = await updateSyncStatus(client, SYNC_KEYS.tax, {
      last_success_at: finishedAt,
      last_error: null,
      last_source: "market",
      last_record_count: result.inserted,
    })

    return res.json({ ok: true, status: row, ...result })
  } catch (e: any) {
    const message = String(e?.message || e)
    await updateSyncStatus(client, SYNC_KEYS.tax, { last_error: message })
    console.error("syncTaxRates error:", e)
    return res.status(500).json({ message: "Failed to sync tax rates", details: message })
  } finally {
    client.release()
  }
}

export async function listBillingPlans(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const tier = toStr(req.query.tier)
    const tenantType = toStr(req.query.tenant_type)
    const isActiveRaw = toStr(req.query.is_active)
    const isActive = isActiveRaw ? toBool(isActiveRaw) : null

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (tier) {
      where.push(`tier = $${params.length + 1}`)
      params.push(tier)
    }
    if (tenantType) {
      where.push(`tenant_type = $${params.length + 1}`)
      params.push(tenantType)
    }
    if (isActive !== null) {
      where.push(`is_active = $${params.length + 1}`)
      params.push(isActive)
    }
    if (q) {
      where.push(
        `(
          slug ILIKE $${params.length + 1}
          OR name ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM billing_plans ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT
        id, slug, name, tier, tenant_type, description,
        included_seats, min_seats, max_seats,
        extra_seat_price_usd, storage_limit_mb,
        is_active, sort_order, metadata, created_at, updated_at
      FROM billing_plans
      ${whereSql}
      ORDER BY sort_order ASC, created_at DESC
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
    console.error("listBillingPlans error:", e)
    return res.status(500).json({ message: "Failed to list billing plans", details: String(e?.message || e) })
  }
}

export async function listPublicBillingPlans(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const tier = toStr(req.query.tier)
    const tenantType = toStr(req.query.tenant_type)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = ["is_active = TRUE"]
    const params: any[] = []

    if (tier) {
      where.push(`tier = $${params.length + 1}`)
      params.push(tier)
    }
    if (tenantType) {
      where.push(`tenant_type = $${params.length + 1}`)
      params.push(tenantType)
    }
    if (q) {
      where.push(
        `(
          slug ILIKE $${params.length + 1}
          OR name ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = `WHERE ${where.join(" AND ")}`

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM billing_plans ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT
        id, slug, name, tier, tenant_type, description,
        included_seats, min_seats, max_seats,
        extra_seat_price_usd, storage_limit_mb,
        is_active, sort_order, metadata, created_at, updated_at
      FROM billing_plans
      ${whereSql}
      ORDER BY sort_order ASC, created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const slugs = Array.from(
      new Set(listRes.rows.map((row) => String(row.slug || "").trim()).filter((slug) => slug))
    )
    const creditGrantMap = new Map<
      string,
      {
        monthly?: { monthly_credits: number | null; initial_credits: number | null } | null
        yearly?: { monthly_credits: number | null; initial_credits: number | null } | null
      }
    >()
    if (slugs.length) {
      const grantsRes = await query(
        `
        SELECT plan_slug, billing_cycle, monthly_credits, initial_credits
        FROM credit_plan_grants
        WHERE plan_slug = ANY($1)
          AND credit_type = 'subscription'
          AND is_active = TRUE
        `,
        [slugs]
      )
      grantsRes.rows.forEach((row) => {
        const planSlug = String(row.plan_slug || "").trim()
        if (!planSlug) return
        const entry =
          creditGrantMap.get(planSlug) || {
            monthly: null,
            yearly: null,
          }
        const monthlyCreditsRaw = row.monthly_credits
        const initialCreditsRaw = row.initial_credits
        const monthlyCredits = Number.isFinite(Number(monthlyCreditsRaw)) ? Number(monthlyCreditsRaw) : null
        const initialCredits = Number.isFinite(Number(initialCreditsRaw)) ? Number(initialCreditsRaw) : null
        const next = { monthly_credits: monthlyCredits, initial_credits: initialCredits }
        if (String(row.billing_cycle) === "yearly") entry.yearly = next
        else entry.monthly = next
        creditGrantMap.set(planSlug, entry)
      })
    }

    const rows = listRes.rows.map((row) => ({
      ...row,
      credit_grants: creditGrantMap.get(String(row.slug || "").trim()) ?? null,
    }))

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows,
    })
  } catch (e: any) {
    console.error("listPublicBillingPlans error:", e)
    return res.status(500).json({ message: "Failed to list public billing plans", details: String(e?.message || e) })
  }
}

export async function createBillingPlan(req: Request, res: Response) {
  try {
    const slug = toStr(req.body?.slug)
    const name = toStr(req.body?.name)
    const tier = toStr(req.body?.tier)
    const tenantTypeRaw = req.body?.tenant_type
    const tenantType = toStr(tenantTypeRaw)
    const description = typeof req.body?.description === "string" ? req.body.description : null

    const includedSeatsRaw = req.body?.included_seats
    const minSeatsRaw = req.body?.min_seats
    const maxSeatsRaw = req.body?.max_seats
    const extraSeatRaw = req.body?.extra_seat_price_usd
    const storageLimitRaw = req.body?.storage_limit_mb
    const sortOrderRaw = req.body?.sort_order

    const includedSeats = Number(includedSeatsRaw)
    const minSeats = Number(minSeatsRaw)
    const maxSeats =
      maxSeatsRaw === null || maxSeatsRaw === undefined || maxSeatsRaw === "" ? null : Number(maxSeatsRaw)
    const extraSeatPrice =
      extraSeatRaw === null || extraSeatRaw === undefined || extraSeatRaw === "" ? 0 : Number(extraSeatRaw)
    const storageLimit =
      storageLimitRaw === null || storageLimitRaw === undefined || storageLimitRaw === "" ? null : Number(storageLimitRaw)
    const sortOrder =
      sortOrderRaw === null || sortOrderRaw === undefined || sortOrderRaw === "" ? 0 : Number(sortOrderRaw)
    const isActive = toBool(req.body?.is_active)
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    if (!slug) return res.status(400).json({ message: "slug is required" })
    if (!name) return res.status(400).json({ message: "name is required" })
    if (!PLAN_TIERS.has(tier)) return res.status(400).json({ message: "invalid tier" })
    if (!tenantType || !TENANT_TYPES.has(tenantType)) {
      return res.status(400).json({ message: "invalid tenant_type" })
    }
    if (tier === "free" && tenantType !== "personal") {
      return res.status(400).json({ message: "free plans must use personal tenant_type" })
    }
    if (!Number.isFinite(includedSeats) || includedSeats <= 0) {
      return res.status(400).json({ message: "included_seats must be positive" })
    }
    if (!Number.isFinite(minSeats) || minSeats <= 0) return res.status(400).json({ message: "min_seats must be positive" })
    if (maxSeats !== null && (!Number.isFinite(maxSeats) || maxSeats < 0)) {
      return res.status(400).json({ message: "max_seats must be >= 0" })
    }
    if (maxSeats !== null && maxSeats < includedSeats) {
      return res.status(400).json({ message: "max_seats must be >= included_seats" })
    }
    if (maxSeats !== null && minSeats > maxSeats) {
      return res.status(400).json({ message: "min_seats must be <= max_seats" })
    }
    if (!Number.isFinite(extraSeatPrice) || extraSeatPrice < 0) {
      return res.status(400).json({ message: "extra_seat_price_usd must be >= 0" })
    }
    if (storageLimit !== null && (!Number.isFinite(storageLimit) || storageLimit < 0)) {
      return res.status(400).json({ message: "storage_limit_mb must be >= 0" })
    }
    if (!Number.isFinite(sortOrder)) return res.status(400).json({ message: "sort_order must be numeric" })
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const result = await query(
      `
      INSERT INTO billing_plans
        (slug, name, tier, tenant_type, description, included_seats, min_seats, max_seats,
         extra_seat_price_usd, storage_limit_mb, is_active, sort_order, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
      RETURNING
        id, slug, name, tier, tenant_type, description,
        included_seats, min_seats, max_seats,
        extra_seat_price_usd, storage_limit_mb,
        is_active, sort_order, metadata, created_at, updated_at
      `,
      [
        slug,
        name,
        tier,
        tenantType,
        description,
        includedSeats,
        minSeats,
        maxSeats,
        extraSeatPrice,
        storageLimit,
        isActive === null ? true : isActive,
        sortOrder,
        JSON.stringify(metadataValue || {}),
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Billing plan already exists", details: String(e?.detail || "") })
    }
    console.error("createBillingPlan error:", e)
    return res.status(500).json({ message: "Failed to create billing plan", details: String(e?.message || e) })
  }
}

export async function updateBillingPlan(req: Request, res: Response) {
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

    if (input.slug !== undefined) {
      const slug = toStr(input.slug)
      if (!slug) return res.status(400).json({ message: "slug must be non-empty" })
      setField("slug", slug)
    }
    if (input.name !== undefined) {
      const name = toStr(input.name)
      if (!name) return res.status(400).json({ message: "name must be non-empty" })
      setField("name", name)
    }
    let nextTier: string | null = null
    let currentTier: string | null = null
    let currentTenantType: string | null = null

    const loadCurrentPlan = async () => {
      if (currentTier !== null) return
      const currentRes = await query(`SELECT tier, tenant_type FROM billing_plans WHERE id = $1`, [id])
      if (currentRes.rows.length === 0) return
      currentTier = currentRes.rows[0]?.tier ?? null
      currentTenantType = currentRes.rows[0]?.tenant_type ?? null
    }

    if (input.tier !== undefined) {
      const tier = toStr(input.tier)
      if (!PLAN_TIERS.has(tier)) return res.status(400).json({ message: "invalid tier" })
      nextTier = tier
      setField("tier", tier)
    }
    if (input.tenant_type !== undefined) {
      const tenantType = toStr(input.tenant_type)
      if (!tenantType || !TENANT_TYPES.has(tenantType)) {
        return res.status(400).json({ message: "invalid tenant_type" })
      }
      if (!nextTier) {
        await loadCurrentPlan()
        nextTier = currentTier
      }
      if (nextTier === "free" && tenantType !== "personal") {
        return res.status(400).json({ message: "free plans must use personal tenant_type" })
      }
      setField("tenant_type", tenantType)
    }
    if (nextTier && nextTier !== "free" && input.tenant_type === undefined) {
      await loadCurrentPlan()
      if (!currentTenantType) {
        return res.status(400).json({ message: "tenant_type is required for non-free plans" })
      }
    }
    if (nextTier === "free" && input.tenant_type === undefined) {
      setField("tenant_type", "personal")
    }
    if (input.description !== undefined) {
      const description = typeof input.description === "string" ? input.description : null
      setField("description", description)
    }
    if (input.included_seats !== undefined) {
      const included = Number(input.included_seats)
      if (!Number.isFinite(included) || included <= 0) {
        return res.status(400).json({ message: "included_seats must be positive" })
      }
      setField("included_seats", Math.floor(included))
    }
    if (input.min_seats !== undefined) {
      const minSeats = Number(input.min_seats)
      if (!Number.isFinite(minSeats) || minSeats <= 0) {
        return res.status(400).json({ message: "min_seats must be positive" })
      }
      setField("min_seats", Math.floor(minSeats))
    }
    if (input.max_seats !== undefined) {
      const maxSeats =
        input.max_seats === null || input.max_seats === undefined || input.max_seats === "" ? null : Number(input.max_seats)
      if (maxSeats !== null && (!Number.isFinite(maxSeats) || maxSeats < 0)) {
        return res.status(400).json({ message: "max_seats must be >= 0" })
      }
      setField("max_seats", maxSeats)
    }
    if (input.extra_seat_price_usd !== undefined) {
      const extraSeatPrice =
        input.extra_seat_price_usd === null || input.extra_seat_price_usd === undefined || input.extra_seat_price_usd === ""
          ? 0
          : Number(input.extra_seat_price_usd)
      if (!Number.isFinite(extraSeatPrice) || extraSeatPrice < 0) {
        return res.status(400).json({ message: "extra_seat_price_usd must be >= 0" })
      }
      setField("extra_seat_price_usd", extraSeatPrice)
    }
    if (input.storage_limit_mb !== undefined) {
      const storageLimit =
        input.storage_limit_mb === null || input.storage_limit_mb === undefined || input.storage_limit_mb === ""
          ? null
          : Number(input.storage_limit_mb)
      if (storageLimit !== null && (!Number.isFinite(storageLimit) || storageLimit < 0)) {
        return res.status(400).json({ message: "storage_limit_mb must be >= 0" })
      }
      setField("storage_limit_mb", storageLimit)
    }
    if (input.is_active !== undefined) {
      const isActive = toBool(input.is_active)
      if (isActive === null) return res.status(400).json({ message: "is_active must be boolean" })
      setField("is_active", isActive)
    }
    if (input.sort_order !== undefined) {
      const sortOrder =
        input.sort_order === null || input.sort_order === undefined || input.sort_order === "" ? 0 : Number(input.sort_order)
      if (!Number.isFinite(sortOrder)) return res.status(400).json({ message: "sort_order must be numeric" })
      setField("sort_order", Math.floor(sortOrder))
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
      UPDATE billing_plans
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING
        id, slug, name, tier, tenant_type, description,
        included_seats, min_seats, max_seats,
        extra_seat_price_usd, storage_limit_mb,
        is_active, sort_order, metadata, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Billing plan not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Billing plan already exists", details: String(e?.detail || "") })
    }
    console.error("updateBillingPlan error:", e)
    return res.status(500).json({ message: "Failed to update billing plan", details: String(e?.message || e) })
  }
}

export async function listBillingPlanPrices(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const planId = toStr(req.query.plan_id)
    const billingCycle = toStr(req.query.billing_cycle)
    const status = toStr(req.query.status)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (planId) {
      where.push(`p.plan_id = $${params.length + 1}`)
      params.push(planId)
    }
    if (billingCycle) {
      where.push(`p.billing_cycle = $${params.length + 1}`)
      params.push(billingCycle)
    }
    if (status) {
      where.push(`p.status = $${params.length + 1}`)
      params.push(status)
    }
    if (q) {
      where.push(
        `(
          b.slug ILIKE $${params.length + 1}
          OR b.name ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM billing_plan_prices p
      JOIN billing_plans b ON b.id = p.plan_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        p.*,
        b.slug AS plan_slug,
        b.name AS plan_name,
        b.tier AS plan_tier,
        b.tenant_type AS plan_tenant_type
      FROM billing_plan_prices p
      JOIN billing_plans b ON b.id = p.plan_id
      ${whereSql}
      ORDER BY b.sort_order ASC, b.name ASC, p.billing_cycle ASC, p.version DESC, p.effective_at DESC
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
    console.error("listBillingPlanPrices error:", e)
    return res.status(500).json({ message: "Failed to list billing plan prices", details: String(e?.message || e) })
  }
}

export async function listPublicBillingPlanPrices(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const planId = toStr(req.query.plan_id)
    const billingCycle = toStr(req.query.billing_cycle)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = ["p.status = 'active'", "b.is_active = TRUE", "p.effective_at <= NOW()"]
    const params: any[] = []

    if (planId) {
      where.push(`p.plan_id = $${params.length + 1}`)
      params.push(planId)
    }
    if (billingCycle) {
      where.push(`p.billing_cycle = $${params.length + 1}`)
      params.push(billingCycle)
    }
    if (q) {
      where.push(
        `(
          b.slug ILIKE $${params.length + 1}
          OR b.name ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = `WHERE ${where.join(" AND ")}`

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM billing_plan_prices p
      JOIN billing_plans b ON b.id = p.plan_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        p.*,
        b.slug AS plan_slug,
        b.name AS plan_name,
        b.tier AS plan_tier,
        b.tenant_type AS plan_tenant_type
      FROM billing_plan_prices p
      JOIN billing_plans b ON b.id = p.plan_id
      ${whereSql}
      ORDER BY b.sort_order ASC, b.name ASC, p.billing_cycle ASC, p.version DESC, p.effective_at DESC
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
    console.error("listPublicBillingPlanPrices error:", e)
    return res.status(500).json({ message: "Failed to list public billing plan prices", details: String(e?.message || e) })
  }
}

export async function createBillingPlanPrice(req: Request, res: Response) {
  try {
    const planId = toStr(req.body?.plan_id)
    const billingCycle = toStr(req.body?.billing_cycle)
    const status = toStr(req.body?.status) || "draft"
    const currency = toStr(req.body?.currency) || "USD"
    const versionRaw = req.body?.version
    const effectiveAt = req.body?.effective_at
    const description = typeof req.body?.description === "string" ? req.body.description : null

    const version = Number(versionRaw)
    const priceRaw = req.body?.price_usd
    const priceUsd =
      priceRaw === null || priceRaw === undefined || priceRaw === "" ? null : Number(priceRaw)
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    if (!planId) return res.status(400).json({ message: "plan_id is required" })
    if (!BILLING_CYCLES.has(billingCycle)) return res.status(400).json({ message: "invalid billing_cycle" })
    if (!PRICE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
    if (!Number.isFinite(version) || version <= 0) return res.status(400).json({ message: "version must be positive" })
    if (!effectiveAt) return res.status(400).json({ message: "effective_at is required" })
    if (priceUsd !== null && (!Number.isFinite(priceUsd) || priceUsd < 0)) {
      return res.status(400).json({ message: "price_usd must be >= 0" })
    }
    if (currency.length !== 3) return res.status(400).json({ message: "currency must be 3 letters" })
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const result = await query(
      `
      INSERT INTO billing_plan_prices
        (plan_id, billing_cycle, price_usd, currency, version, effective_at, status, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING *
      `,
      [
        planId,
        billingCycle,
        priceUsd,
        currency.toUpperCase(),
        Math.floor(version),
        effectiveAt,
        status,
        JSON.stringify(metadataValue || {}),
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Plan price already exists", details: String(e?.detail || "") })
    }
    console.error("createBillingPlanPrice error:", e)
    return res.status(500).json({ message: "Failed to create billing plan price", details: String(e?.message || e) })
  }
}

export async function updateBillingPlanPrice(req: Request, res: Response) {
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

    if (input.plan_id !== undefined) {
      const planId = toStr(input.plan_id)
      if (!planId) return res.status(400).json({ message: "plan_id must be non-empty" })
      setField("plan_id", planId)
    }
    if (input.billing_cycle !== undefined) {
      const billingCycle = toStr(input.billing_cycle)
      if (!BILLING_CYCLES.has(billingCycle)) return res.status(400).json({ message: "invalid billing_cycle" })
      setField("billing_cycle", billingCycle)
    }
    if (input.status !== undefined) {
      const status = toStr(input.status)
      if (!PRICE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.currency !== undefined) {
      const currency = toStr(input.currency)
      if (!currency || currency.length !== 3) return res.status(400).json({ message: "currency must be 3 letters" })
      setField("currency", currency.toUpperCase())
    }
    if (input.version !== undefined) {
      const version = Number(input.version)
      if (!Number.isFinite(version) || version <= 0) return res.status(400).json({ message: "version must be positive" })
      setField("version", Math.floor(version))
    }
    if (input.effective_at !== undefined) {
      if (!input.effective_at) return res.status(400).json({ message: "effective_at is required" })
      setField("effective_at", input.effective_at)
    }
    if (input.price_usd !== undefined) {
      const priceUsd =
        input.price_usd === null || input.price_usd === undefined || input.price_usd === "" ? null : Number(input.price_usd)
      if (priceUsd !== null && (!Number.isFinite(priceUsd) || priceUsd < 0)) {
        return res.status(400).json({ message: "price_usd must be >= 0" })
      }
      setField("price_usd", priceUsd)
    }
    if (input.price_local !== undefined) {
      const priceLocal =
        input.price_local === null || input.price_local === undefined || input.price_local === "" ? null : Number(input.price_local)
      if (priceLocal !== null && (!Number.isFinite(priceLocal) || priceLocal < 0)) {
        return res.status(400).json({ message: "price_local must be >= 0" })
      }
      setField("price_local", priceLocal)
    }
    if (input.fx_rate !== undefined) {
      const fxRate =
        input.fx_rate === null || input.fx_rate === undefined || input.fx_rate === "" ? null : Number(input.fx_rate)
      if (fxRate !== null && (!Number.isFinite(fxRate) || fxRate < 0)) {
        return res.status(400).json({ message: "fx_rate must be >= 0" })
      }
      setField("fx_rate", fxRate)
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
      UPDATE billing_plan_prices
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Billing plan price not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Plan price already exists", details: String(e?.detail || "") })
    }
    console.error("updateBillingPlanPrice error:", e)
    return res.status(500).json({ message: "Failed to update billing plan price", details: String(e?.message || e) })
  }
}

export async function listBillingSubscriptions(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)
    const billingCycle = toStr(req.query.billing_cycle)
    const planId = toStr(req.query.plan_id)
    const tenantId = toStr(req.query.tenant_id)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (status) {
      where.push(`s.status = $${params.length + 1}`)
      params.push(status)
    }
    if (billingCycle) {
      where.push(`s.billing_cycle = $${params.length + 1}`)
      params.push(billingCycle)
    }
    if (planId) {
      where.push(`s.plan_id = $${params.length + 1}`)
      params.push(planId)
    }
    if (tenantId) {
      where.push(`s.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (q) {
      where.push(
        `(
          b.name ILIKE $${params.length + 1}
          OR b.slug ILIKE $${params.length + 1}
          OR s.tenant_id::text ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM billing_subscriptions s
      JOIN billing_plans b ON b.id = s.plan_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        s.*,
        b.name AS plan_name,
        b.slug AS plan_slug,
        b.tier AS plan_tier
      FROM billing_subscriptions s
      JOIN billing_plans b ON b.id = s.plan_id
      ${whereSql}
      ORDER BY s.current_period_end DESC, s.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)
    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
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
    console.error("listBillingSubscriptions error:", e)
    return res.status(500).json({ message: "Failed to list subscriptions", details: String(e?.message || e) })
  }
}

export async function listBillingSeatAddons(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)
    const tenantId = toStr(req.query.tenant_id)
    const subscriptionId = toStr(req.query.subscription_id)
    const planId = toStr(req.query.plan_id)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (status) {
      if (!SEAT_ADDON_STATUSES.has(status)) {
        return res.status(400).json({ message: "invalid status" })
      }
      where.push(`ssa.status = $${params.length + 1}`)
      params.push(status)
    }
    if (tenantId) {
      where.push(`ssa.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (subscriptionId) {
      where.push(`ssa.subscription_id = $${params.length + 1}`)
      params.push(subscriptionId)
    }
    if (planId) {
      where.push(`s.plan_id = $${params.length + 1}`)
      params.push(planId)
    }
    if (q) {
      where.push(
        `(
          b.name ILIKE $${params.length + 1}
          OR b.slug ILIKE $${params.length + 1}
          OR ssa.tenant_id::text ILIKE $${params.length + 1}
          OR ssa.subscription_id::text ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM billing_subscription_seat_addons ssa
      JOIN billing_subscriptions s ON s.id = ssa.subscription_id
      JOIN billing_plans b ON b.id = s.plan_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        ssa.*,
        s.plan_id,
        b.name AS plan_name,
        b.slug AS plan_slug,
        b.tier AS plan_tier
      FROM billing_subscription_seat_addons ssa
      JOIN billing_subscriptions s ON s.id = ssa.subscription_id
      JOIN billing_plans b ON b.id = s.plan_id
      ${whereSql}
      ORDER BY ssa.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)
    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
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
    console.error("listBillingSeatAddons error:", e)
    return res.status(500).json({ message: "Failed to list seat addons", details: String(e?.message || e) })
  }
}

export async function createBillingSeatAddon(req: Request, res: Response) {
  try {
    const subscriptionId = toStr(req.body?.subscription_id)
    const tenantIdInput = toStr(req.body?.tenant_id)
    const statusInput = toStr(req.body?.status) || "active"
    const quantityRaw = req.body?.quantity
    const effectiveAt = req.body?.effective_at
    const cancelAtRaw = toBool(req.body?.cancel_at_period_end)
    const cancelledAt = req.body?.cancelled_at
    const unitPriceRaw = req.body?.unit_price_usd
    const unitPriceLocalRaw = req.body?.unit_price_local
    const fxRateRaw = req.body?.fx_rate
    const currency = toStr(req.body?.currency).toUpperCase() || "USD"
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    if (!subscriptionId) return res.status(400).json({ message: "subscription_id is required" })
    if (!SEAT_ADDON_STATUSES.has(statusInput)) {
      return res.status(400).json({ message: "invalid status" })
    }
    const quantity = Number(quantityRaw)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "quantity must be > 0" })
    }
    const unitPrice =
      unitPriceRaw === null || unitPriceRaw === undefined || unitPriceRaw === ""
        ? 0
        : Number(unitPriceRaw)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ message: "unit_price_usd must be >= 0" })
    }
    const unitPriceLocal =
      unitPriceLocalRaw === null || unitPriceLocalRaw === undefined || unitPriceLocalRaw === ""
        ? null
        : Number(unitPriceLocalRaw)
    if (unitPriceLocal !== null && (!Number.isFinite(unitPriceLocal) || unitPriceLocal < 0)) {
      return res.status(400).json({ message: "unit_price_local must be >= 0" })
    }
    const fxRate = fxRateRaw === null || fxRateRaw === undefined || fxRateRaw === "" ? null : Number(fxRateRaw)
    if (fxRate !== null && (!Number.isFinite(fxRate) || fxRate < 0)) {
      return res.status(400).json({ message: "fx_rate must be >= 0" })
    }
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const subRes = await query(`SELECT id, tenant_id FROM billing_subscriptions WHERE id = $1`, [subscriptionId])
    const subRow = subRes.rows[0]
    if (!subRow) return res.status(404).json({ message: "Subscription not found" })

    const tenantId = tenantIdInput || String(subRow.tenant_id)
    if (tenantId && String(subRow.tenant_id) !== tenantId) {
      return res.status(400).json({ message: "tenant_id does not match subscription" })
    }

    const cancelAtPeriodEnd =
      cancelAtRaw !== null
        ? cancelAtRaw
        : statusInput === "scheduled_cancel"
          ? true
          : false
    const cancelledAtFinal =
      statusInput === "cancelled" ? cancelledAt || new Date().toISOString() : cancelledAt || null

    const result = await query(
      `
      INSERT INTO billing_subscription_seat_addons
        (subscription_id, tenant_id, quantity, status, effective_at, cancel_at_period_end, cancelled_at,
         unit_price_usd, unit_price_local, fx_rate, currency, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      RETURNING *
      `,
      [
        subscriptionId,
        tenantId,
        Math.floor(quantity),
        statusInput,
        effectiveAt || new Date().toISOString(),
        cancelAtPeriodEnd,
        cancelledAtFinal,
        unitPrice,
        unitPriceLocal,
        fxRate,
        currency,
        JSON.stringify(metadataValue || {}),
      ]
    )

    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("createBillingSeatAddon error:", e)
    return res.status(500).json({ message: "Failed to create seat addon", details: String(e?.message || e) })
  }
}

export async function updateBillingSeatAddon(req: Request, res: Response) {
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

    if (input.quantity !== undefined) {
      const quantity = Number(input.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "quantity must be > 0" })
      }
      setField("quantity", Math.floor(quantity))
    }

    let statusInput: string | null = null
    if (input.status !== undefined) {
      statusInput = toStr(input.status)
      if (!SEAT_ADDON_STATUSES.has(statusInput)) {
        return res.status(400).json({ message: "invalid status" })
      }
      setField("status", statusInput)
    }

    if (input.effective_at !== undefined) {
      setField("effective_at", input.effective_at || null)
    }

    if (input.cancel_at_period_end !== undefined) {
      const cancelAt = toBool(input.cancel_at_period_end)
      if (cancelAt === null) return res.status(400).json({ message: "cancel_at_period_end must be boolean" })
      setField("cancel_at_period_end", cancelAt)
    }

    if (input.cancelled_at !== undefined) {
      setField("cancelled_at", input.cancelled_at || null)
    } else if (statusInput === "cancelled") {
      setField("cancelled_at", new Date().toISOString())
    }

    if (input.unit_price_usd !== undefined) {
      const unitPrice =
        input.unit_price_usd === null || input.unit_price_usd === "" ? 0 : Number(input.unit_price_usd)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ message: "unit_price_usd must be >= 0" })
      }
      setField("unit_price_usd", unitPrice)
    }
    if (input.unit_price_local !== undefined) {
      const unitPriceLocal =
        input.unit_price_local === null || input.unit_price_local === "" ? null : Number(input.unit_price_local)
      if (unitPriceLocal !== null && (!Number.isFinite(unitPriceLocal) || unitPriceLocal < 0)) {
        return res.status(400).json({ message: "unit_price_local must be >= 0" })
      }
      setField("unit_price_local", unitPriceLocal)
    }
    if (input.fx_rate !== undefined) {
      const fxRate = input.fx_rate === null || input.fx_rate === "" ? null : Number(input.fx_rate)
      if (fxRate !== null && (!Number.isFinite(fxRate) || fxRate < 0)) {
        return res.status(400).json({ message: "fx_rate must be >= 0" })
      }
      setField("fx_rate", fxRate)
    }

    if (input.currency !== undefined) {
      const currency = toStr(input.currency).toUpperCase()
      if (!currency || currency.length !== 3) {
        return res.status(400).json({ message: "currency must be 3 letters" })
      }
      setField("currency", currency)
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
      UPDATE billing_subscription_seat_addons
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Seat addon not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateBillingSeatAddon error:", e)
    return res.status(500).json({ message: "Failed to update seat addon", details: String(e?.message || e) })
  }
}

export async function updateBillingSubscription(req: Request, res: Response) {
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
      if (!SUBSCRIPTION_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.cancel_at_period_end !== undefined) {
      const cancelAt = toBool(input.cancel_at_period_end)
      if (cancelAt === null) return res.status(400).json({ message: "cancel_at_period_end must be boolean" })
      setField("cancel_at_period_end", cancelAt)
    }
    if (input.auto_renew !== undefined) {
      const autoRenew = toBool(input.auto_renew)
      if (autoRenew === null) return res.status(400).json({ message: "auto_renew must be boolean" })
      setField("auto_renew", autoRenew)
    }
    if (input.current_period_start !== undefined) {
      if (!input.current_period_start) return res.status(400).json({ message: "current_period_start is required" })
      setField("current_period_start", input.current_period_start)
    }
    if (input.current_period_end !== undefined) {
      if (!input.current_period_end) return res.status(400).json({ message: "current_period_end is required" })
      setField("current_period_end", input.current_period_end)
    }
    if (input.cancelled_at !== undefined) {
      setField("cancelled_at", input.cancelled_at || null)
    }
    if (input.ended_at !== undefined) {
      setField("ended_at", input.ended_at || null)
    }
    if (input.price_usd !== undefined) {
      const priceUsd =
        input.price_usd === null || input.price_usd === undefined || input.price_usd === "" ? null : Number(input.price_usd)
      if (priceUsd !== null && (!Number.isFinite(priceUsd) || priceUsd < 0)) {
        return res.status(400).json({ message: "price_usd must be >= 0" })
      }
      setField("price_usd", priceUsd)
    }
    if (input.currency !== undefined) {
      const currency = toStr(input.currency).toUpperCase()
      if (!currency || currency.length !== 3) return res.status(400).json({ message: "currency must be 3 letters" })
      setField("currency", currency)
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
      UPDATE billing_subscriptions
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Subscription not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateBillingSubscription error:", e)
    return res.status(500).json({ message: "Failed to update subscription", details: String(e?.message || e) })
  }
}

export async function provisionBillingSubscription(req: Request, res: Response) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(req.body?.tenant_id)
    const subscriptionId = toStr(req.body?.subscription_id)
    const planId = toStr(req.body?.plan_id)
    const billingCycle = toStr(req.body?.billing_cycle)
    const currency = toStr(req.body?.currency).toUpperCase() || "USD"
    const provider = toStr(req.body?.provider) || "stripe"
    const status = toStr(req.body?.status) || "active"
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : ""
    const taxCountryCode = toStr(req.body?.tax_country_code).toUpperCase()

    const priceUsdRaw = req.body?.price_usd
    const priceUsd = priceUsdRaw === null || priceUsdRaw === undefined || priceUsdRaw === "" ? 0 : Number(priceUsdRaw)
    const priceLocalRaw = req.body?.price_local
    const priceLocal =
      priceLocalRaw === null || priceLocalRaw === undefined || priceLocalRaw === "" ? null : Number(priceLocalRaw)
    const fxRateRaw = req.body?.fx_rate
    const fxRate = fxRateRaw === null || fxRateRaw === undefined || fxRateRaw === "" ? null : Number(fxRateRaw)

    const cancelAt = toBool(req.body?.cancel_at_period_end)
    const autoRenew = toBool(req.body?.auto_renew)

    const currentPeriodStart = req.body?.current_period_start
    const currentPeriodEnd = req.body?.current_period_end

    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })
    if (await isSystemTenantId({ query }, tenantId)) {
      return res.status(400).json({ message: "system tenant cannot be billed" })
    }
    if (!planId) return res.status(400).json({ message: "plan_id is required" })
    if (!BILLING_CYCLES.has(billingCycle)) return res.status(400).json({ message: "invalid billing_cycle" })
    if (!SUBSCRIPTION_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
    if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
    if (!Number.isFinite(priceUsd) || priceUsd < 0) {
      return res.status(400).json({ message: "price_usd must be >= 0" })
    }
    if (priceLocal !== null && (!Number.isFinite(priceLocal) || priceLocal < 0)) {
      return res.status(400).json({ message: "price_local must be >= 0" })
    }
    if (fxRate !== null && (!Number.isFinite(fxRate) || fxRate < 0)) {
      return res.status(400).json({ message: "fx_rate must be >= 0" })
    }
    if (!currency || currency.length !== 3) return res.status(400).json({ message: "currency must be 3 letters" })
    if (taxCountryCode && taxCountryCode.length !== 2) {
      return res.status(400).json({ message: "tax_country_code must be 2 letters" })
    }
    if (!currentPeriodStart) return res.status(400).json({ message: "current_period_start is required" })
    if (!currentPeriodEnd) return res.status(400).json({ message: "current_period_end is required" })

    const periodStartDate = new Date(currentPeriodStart)
    const periodEndDate = new Date(currentPeriodEnd)
    if (Number.isNaN(periodStartDate.getTime()) || Number.isNaN(periodEndDate.getTime())) {
      return res.status(400).json({ message: "invalid period dates" })
    }

    const periodStartIso = periodStartDate.toISOString()
    const periodEndIso = periodEndDate.toISOString()

    const planRes = await client.query(
      `SELECT id, slug, tier, tenant_type, included_seats FROM billing_plans WHERE id = $1`,
      [planId]
    )
    if (planRes.rows.length === 0) return res.status(404).json({ message: "Billing plan not found" })
    const planTier = String(planRes.rows[0]?.tier || "")
    const planTenantType = String(planRes.rows[0]?.tenant_type || "")
    const planIncludedSeatsRaw = planRes.rows[0]?.included_seats
    const planIncludedSeats =
      typeof planIncludedSeatsRaw === "number" && Number.isFinite(planIncludedSeatsRaw)
        ? Math.floor(planIncludedSeatsRaw)
        : null

    await client.query("BEGIN")
    transactionStarted = true

    let subscriptionRow: any | null = null
    if (subscriptionId) {
      const subRes = await client.query(`SELECT * FROM billing_subscriptions WHERE id = $1`, [subscriptionId])
      if (subRes.rows.length === 0) {
      await client.query("ROLLBACK")
      transactionStarted = false
        return res.status(404).json({ message: "Subscription not found" })
      }
      subscriptionRow = subRes.rows[0]
    } else {
      const subRes = await client.query(
        `SELECT * FROM billing_subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
      )
      subscriptionRow = subRes.rows[0] || null
    }

    const nowIso = new Date().toISOString()
    const serviceMeta = {
      source: "service_provision",
      note: note || null,
      provided_by: authed.userId,
      provided_at: nowIso,
    }

    const existingMeta =
      subscriptionRow && subscriptionRow.metadata && typeof subscriptionRow.metadata === "object" ? subscriptionRow.metadata : {}
    const nextSubscriptionMeta = {
      ...existingMeta,
      service_provision: serviceMeta,
    }

    const resolvedTenantId = subscriptionRow ? String(subscriptionRow.tenant_id) : tenantId
    if (subscriptionRow && resolvedTenantId !== tenantId) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(400).json({ message: "tenant_id does not match subscription" })
    }
    if (await isSystemTenantId(client, resolvedTenantId)) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(400).json({ message: "system tenant cannot be billed" })
    }

    const resolvedPriceLocal = priceLocal ?? (currency === "USD" ? priceUsd : null)
    const resolvedFxRate = fxRate ?? null

    if (subscriptionRow) {
      const updateRes = await client.query(
        `
        UPDATE billing_subscriptions
        SET plan_id = $1,
            billing_cycle = $2,
            status = $3,
            current_period_start = $4,
            current_period_end = $5,
            cancel_at_period_end = $6,
            auto_renew = $7,
            price_usd = $8,
            price_local = $9,
            fx_rate = $10,
            currency = $11,
            local_currency = $12,
            metadata = $13::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
        RETURNING *
        `,
        [
          planId,
          billingCycle,
          status,
          periodStartIso,
          periodEndIso,
          cancelAt === null ? false : cancelAt,
          autoRenew === null ? true : autoRenew,
          priceUsd,
          resolvedPriceLocal,
          resolvedFxRate,
          "USD",
          currency,
          JSON.stringify(nextSubscriptionMeta),
          subscriptionRow.id,
        ]
      )
      subscriptionRow = updateRes.rows[0]
    } else {
      const insertRes = await client.query(
        `
        INSERT INTO billing_subscriptions
          (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end,
           cancel_at_period_end, auto_renew, price_usd, price_local, fx_rate, currency, local_currency, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
        RETURNING *
        `,
        [
          resolvedTenantId,
          planId,
          billingCycle,
          status,
          periodStartIso,
          periodEndIso,
          cancelAt === null ? false : cancelAt,
          autoRenew === null ? true : autoRenew,
          priceUsd,
          resolvedPriceLocal,
          resolvedFxRate,
          "USD",
          currency,
          JSON.stringify({ service_provision: serviceMeta }),
        ]
      )
      subscriptionRow = insertRes.rows[0]
    }

    if (planTenantType) {
      await client.query(
        `
        UPDATE tenants
        SET tenant_type = $1,
            member_limit = COALESCE($2, member_limit),
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{plan_tier}', to_jsonb($3::text), TRUE),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND deleted_at IS NULL
        `,
        [planTenantType, planIncludedSeats, planTier || "free", resolvedTenantId]
      )
    }

    const billingAccountRes = await client.query(`SELECT id FROM billing_accounts WHERE tenant_id = $1`, [resolvedTenantId])
    let billingAccountId = billingAccountRes.rows[0]?.id
    if (!billingAccountId) {
      const createAccountRes = await client.query(
        `
        INSERT INTO billing_accounts (tenant_id, currency, metadata)
        VALUES ($1,$2,$3::jsonb)
        RETURNING id
        `,
        [
          resolvedTenantId,
          currency,
          JSON.stringify({ source: "service_provision", created_by: authed.userId, created_at: nowIso }),
        ]
      )
      billingAccountId = createAccountRes.rows[0]?.id
    }

    if (!billingAccountId) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(500).json({ message: "Failed to resolve billing account" })
    }
    const taxRateRow = taxCountryCode ? await pickLatestTaxRate(client, taxCountryCode) : null
    const taxRatePercent = taxRateRow ? Number(taxRateRow.rate_percent) : 0
    const taxAmountUsd =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0
        ? roundMoney(priceUsd * (taxRatePercent / 100), "USD")
        : 0
    const totalAmountUsd = roundMoney(priceUsd + taxAmountUsd, "USD")

    const localSubtotal = resolvedPriceLocal ?? priceUsd
    const localTaxAmount =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0
        ? roundMoney(localSubtotal * (taxRatePercent / 100), currency)
        : 0
    const localTotalAmount = roundMoney(localSubtotal + localTaxAmount, currency)

    const invoiceColumns = await loadInvoiceColumns(client)
    const invoiceCols: string[] = []
    const invoiceVals: any[] = []
    const invoicePlaceholders: string[] = []
    const addInvoiceCol = (name: string, value: any, cast?: string) => {
      if (!invoiceColumns.has(name)) return
      invoiceCols.push(name)
      invoiceVals.push(value)
      invoicePlaceholders.push(cast ? `$${invoiceVals.length}::${cast}` : `$${invoiceVals.length}`)
    }

    const buildProvisionInvoiceCols = () => {
      invoiceCols.splice(0, invoiceCols.length)
      invoiceVals.splice(0, invoiceVals.length)
      invoicePlaceholders.splice(0, invoicePlaceholders.length)
      addInvoiceCol("tenant_id", resolvedTenantId)
      addInvoiceCol("subscription_id", subscriptionRow.id)
      addInvoiceCol("billing_account_id", billingAccountId)
      addInvoiceCol("invoice_number", makeInvoiceNumber("SVP"))
      addInvoiceCol("status", "paid")
      addInvoiceCol("currency", "USD")
      addInvoiceCol("subtotal_usd", priceUsd)
      addInvoiceCol("total_usd", totalAmountUsd)
      addInvoiceCol("issue_date", nowIso)
      addInvoiceCol("paid_at", nowIso)
      addInvoiceCol("metadata", JSON.stringify(serviceMeta), "jsonb")
      if (invoiceColumns.has("tax_usd")) addInvoiceCol("tax_usd", taxAmountUsd)
      if (invoiceColumns.has("tax_rate_id")) addInvoiceCol("tax_rate_id", taxRateRow?.id ?? null)
      if (invoiceColumns.has("exchange_rate")) addInvoiceCol("exchange_rate", resolvedFxRate ?? null)
      if (invoiceColumns.has("discount_usd")) addInvoiceCol("discount_usd", 0)
      if (invoiceColumns.has("period_start")) addInvoiceCol("period_start", periodStartIso)
      if (invoiceColumns.has("period_end")) addInvoiceCol("period_end", periodEndIso)
      if (invoiceColumns.has("local_currency")) addInvoiceCol("local_currency", currency)
      if (invoiceColumns.has("local_subtotal")) addInvoiceCol("local_subtotal", localSubtotal)
      if (invoiceColumns.has("local_tax")) addInvoiceCol("local_tax", localTaxAmount)
      if (invoiceColumns.has("local_discount")) addInvoiceCol("local_discount", 0)
      if (invoiceColumns.has("local_total")) addInvoiceCol("local_total", localTotalAmount)
    }
    buildProvisionInvoiceCols()

    let invoiceRow: any | null = null
    for (let i = 0; i < 3; i += 1) {
      try {
        const insertInvoiceRes = await client.query(
          `
          INSERT INTO billing_invoices (${invoiceCols.join(", ")})
          VALUES (${invoicePlaceholders.join(", ")})
          RETURNING *
          `,
          invoiceVals
        )
        invoiceRow = insertInvoiceRes.rows[0]
        break
      } catch (e: any) {
        if (e?.code === "23505" && String(e?.detail || "").includes("invoice_number")) {
          buildProvisionInvoiceCols()
          continue
        }
        throw e
      }
    }

    if (!invoiceRow) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(500).json({ message: "Failed to create invoice" })
    }

    await client.query(
      `
      INSERT INTO invoice_line_items
        (invoice_id, line_type, description, quantity, unit_price_usd, amount_usd, currency, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      `,
      [
        invoiceRow.id,
        "adjustment",
        "서비스 제공",
        1,
        priceUsd,
        priceUsd,
        "USD",
        JSON.stringify(serviceMeta),
      ]
    )

    await client.query(
      `
      INSERT INTO payment_transactions
        (invoice_id, billing_account_id, provider, transaction_type, status,
         amount_usd, currency, amount_local, local_currency,
         payment_method_id, processed_at, provider_transaction_id, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
      `,
      [
        invoiceRow.id,
        billingAccountId,
        provider,
        "adjustment",
        "succeeded",
        totalAmountUsd,
        "USD",
        localTotalAmount,
        currency,
        nowIso,
        makeInvoiceNumber("SVP-TX"),
        JSON.stringify(serviceMeta),
      ]
    )

    await client.query("COMMIT")
    transactionStarted = false

    return res.status(201).json({
      ok: true,
      subscription: subscriptionRow,
      invoice: invoiceRow,
    })
  } catch (e: any) {
    if (transactionStarted) {
      await client.query("ROLLBACK")
    }
    console.error("provisionBillingSubscription error:", e)
    return res.status(500).json({ message: "Failed to provision subscription", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function listBillingSubscriptionChanges(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const subscriptionId = toStr(req.query.subscription_id)
    const changeType = toStr(req.query.change_type)
    const status = toStr(req.query.status)
    const tenantId = toStr(req.query.tenant_id)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (subscriptionId) {
      where.push(`c.subscription_id = $${params.length + 1}`)
      params.push(subscriptionId)
    }
    if (changeType) {
      where.push(`c.change_type = $${params.length + 1}`)
      params.push(changeType)
    }
    if (status) {
      where.push(`c.status = $${params.length + 1}`)
      params.push(status)
    }
    if (tenantId) {
      where.push(`s.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (q) {
      where.push(
        `(
          bf.name ILIKE $${params.length + 1}
          OR bf.slug ILIKE $${params.length + 1}
          OR bt.name ILIKE $${params.length + 1}
          OR bt.slug ILIKE $${params.length + 1}
          OR s.tenant_id::text ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM billing_subscription_changes c
      JOIN billing_subscriptions s ON s.id = c.subscription_id
      LEFT JOIN billing_plans bf ON bf.id = c.from_plan_id
      LEFT JOIN billing_plans bt ON bt.id = c.to_plan_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        c.*,
        s.tenant_id,
        bf.name AS from_plan_name,
        bf.slug AS from_plan_slug,
        bt.name AS to_plan_name,
        bt.slug AS to_plan_slug
      FROM billing_subscription_changes c
      JOIN billing_subscriptions s ON s.id = c.subscription_id
      LEFT JOIN billing_plans bf ON bf.id = c.from_plan_id
      LEFT JOIN billing_plans bt ON bt.id = c.to_plan_id
      ${whereSql}
      ORDER BY c.effective_at DESC, c.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)
    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
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
    console.error("listBillingSubscriptionChanges error:", e)
    return res.status(500).json({ message: "Failed to list subscription changes", details: String(e?.message || e) })
  }
}

export async function listBillingInvoices(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)
    const tenantId = toStr(req.query.tenant_id)
    const subscriptionId = toStr(req.query.subscription_id)
    const billingAccountId = toStr(req.query.billing_account_id)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (status) {
      where.push(`i.status = $${params.length + 1}`)
      params.push(status)
    }
    if (tenantId) {
      where.push(`i.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (subscriptionId) {
      where.push(`i.subscription_id = $${params.length + 1}`)
      params.push(subscriptionId)
    }
    if (billingAccountId) {
      where.push(`i.billing_account_id = $${params.length + 1}`)
      params.push(billingAccountId)
    }
    if (q) {
      where.push(
        `(
          i.invoice_number ILIKE $${params.length + 1}
          OR b.name ILIKE $${params.length + 1}
          OR b.slug ILIKE $${params.length + 1}
          OR i.tenant_id::text ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM billing_invoices i
      LEFT JOIN billing_subscriptions s ON s.id = i.subscription_id
      LEFT JOIN billing_plans b ON b.id = s.plan_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        i.*,
        s.status AS subscription_status,
        s.billing_cycle AS subscription_billing_cycle,
        b.name AS plan_name,
        b.slug AS plan_slug,
        b.tier AS plan_tier
      FROM billing_invoices i
      LEFT JOIN billing_subscriptions s ON s.id = i.subscription_id
      LEFT JOIN billing_plans b ON b.id = s.plan_id
      ${whereSql}
      ORDER BY i.issue_date DESC NULLS LAST, i.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)
    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
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
    console.error("listBillingInvoices error:", e)
    return res.status(500).json({ message: "Failed to list invoices", details: String(e?.message || e) })
  }
}

export async function listInvoiceLineItems(req: Request, res: Response) {
  try {
    const invoiceId = toStr(req.query.invoice_id)
    if (!invoiceId) return res.status(400).json({ message: "invoice_id is required" })

    const limit = Math.min(toInt(req.query.limit, 100) ?? 100, 500)
    const offset = toInt(req.query.offset, 0) ?? 0

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM invoice_line_items WHERE invoice_id = $1`, [invoiceId])
    const listRes = await query(
      `
      SELECT id, invoice_id, line_type, description, quantity, unit_price_usd, amount_usd, currency, metadata, created_at
      FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY created_at ASC
      LIMIT $2 OFFSET $3
      `,
      [invoiceId, limit, offset]
    )

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    })
  } catch (e: any) {
    console.error("listInvoiceLineItems error:", e)
    return res.status(500).json({ message: "Failed to list invoice line items", details: String(e?.message || e) })
  }
}

export async function updateBillingInvoice(req: Request, res: Response) {
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
      if (!INVOICE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.due_date !== undefined) {
      setField("due_date", input.due_date || null)
    }
    if (input.paid_at !== undefined) {
      setField("paid_at", input.paid_at || null)
    }
    if (input.issue_date !== undefined) {
      setField("issue_date", input.issue_date || null)
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
      UPDATE billing_invoices
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Invoice not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateBillingInvoice error:", e)
    return res.status(500).json({ message: "Failed to update invoice", details: String(e?.message || e) })
  }
}

export async function listPaymentTransactions(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)
    const provider = toStr(req.query.provider)
    const transactionType = toStr(req.query.transaction_type)
    const tenantId = toStr(req.query.tenant_id)
    const invoiceId = toStr(req.query.invoice_id)
    const billingAccountId = toStr(req.query.billing_account_id)
    const paymentMethodId = toStr(req.query.payment_method_id)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (status) {
      where.push(`pt.status = $${params.length + 1}`)
      params.push(status)
    }
    if (provider) {
      where.push(`pt.provider = $${params.length + 1}`)
      params.push(provider)
    }
    if (transactionType) {
      where.push(`pt.transaction_type = $${params.length + 1}`)
      params.push(transactionType)
    }
    if (tenantId) {
      where.push(`ba.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (invoiceId) {
      where.push(`pt.invoice_id = $${params.length + 1}`)
      params.push(invoiceId)
    }
    if (billingAccountId) {
      where.push(`pt.billing_account_id = $${params.length + 1}`)
      params.push(billingAccountId)
    }
    if (paymentMethodId) {
      where.push(`pt.payment_method_id = $${params.length + 1}`)
      params.push(paymentMethodId)
    }
    if (q) {
      where.push(
        `(
          pt.provider_transaction_id ILIKE $${params.length + 1}
          OR i.invoice_number ILIKE $${params.length + 1}
          OR ba.tenant_id::text ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM payment_transactions pt
      JOIN billing_accounts ba ON ba.id = pt.billing_account_id
      LEFT JOIN billing_invoices i ON i.id = pt.invoice_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        pt.*,
        ba.tenant_id,
        i.invoice_number
      FROM payment_transactions pt
      JOIN billing_accounts ba ON ba.id = pt.billing_account_id
      LEFT JOIN billing_invoices i ON i.id = pt.invoice_id
      ${whereSql}
      ORDER BY pt.processed_at DESC NULLS LAST, pt.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)
    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
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
    console.error("listPaymentTransactions error:", e)
    return res.status(500).json({ message: "Failed to list payment transactions", details: String(e?.message || e) })
  }
}

export async function updatePaymentTransaction(req: Request, res: Response) {
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
      if (!TRANSACTION_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.transaction_type !== undefined) {
      const type = toStr(input.transaction_type)
      if (!TRANSACTION_TYPES.has(type)) return res.status(400).json({ message: "invalid transaction_type" })
      setField("transaction_type", type)
    }
    if (input.processed_at !== undefined) {
      setField("processed_at", input.processed_at || null)
    }
    if (input.failure_reason !== undefined) {
      const reason = typeof input.failure_reason === "string" ? input.failure_reason : null
      setField("failure_reason", reason)
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
      UPDATE payment_transactions
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Payment transaction not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updatePaymentTransaction error:", e)
    return res.status(500).json({ message: "Failed to update payment transaction", details: String(e?.message || e) })
  }
}

export async function listTaxRates(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const countryCode = toStr(req.query.country_code)
    const source = toStr(req.query.source)
    const isActiveRaw = toStr(req.query.is_active)
    const isActive = isActiveRaw ? toBool(isActiveRaw) : null

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (countryCode) {
      where.push(`country_code = $${params.length + 1}`)
      params.push(countryCode)
    }
    if (source) {
      if (!TAX_SOURCES.has(source)) return res.status(400).json({ message: "invalid source" })
      where.push(`source = $${params.length + 1}`)
      params.push(source)
    }
    if (isActive !== null) {
      where.push(`is_active = $${params.length + 1}`)
      params.push(isActive)
    }
    if (q) {
      where.push(
        `(
          name ILIKE $${params.length + 1}
          OR country_code ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM tax_rates ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT id, name, country_code, rate_percent, source, effective_at, is_active, created_at, updated_at
      FROM tax_rates
      ${whereSql}
      ORDER BY country_code ASC, effective_at DESC
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
    console.error("listTaxRates error:", e)
    return res.status(500).json({ message: "Failed to list tax rates", details: String(e?.message || e) })
  }
}

export async function createTaxRate(req: Request, res: Response) {
  try {
    const name = toStr(req.body?.name)
    const countryCode = toStr(req.body?.country_code).toUpperCase()
    const rateRaw = req.body?.rate_percent
    const ratePercent = Number(rateRaw)
    const source = toStr(req.body?.source) || "manual"
    const effectiveAt = req.body?.effective_at
    const isActive = toBool(req.body?.is_active)

    if (!name) return res.status(400).json({ message: "name is required" })
    if (!countryCode || countryCode.length !== 2) {
      return res.status(400).json({ message: "country_code must be 2 letters" })
    }
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      return res.status(400).json({ message: "rate_percent must be between 0 and 100" })
    }
    if (!TAX_SOURCES.has(source)) return res.status(400).json({ message: "invalid source" })
    if (!effectiveAt) return res.status(400).json({ message: "effective_at is required" })

    const result = await query(
      `
      INSERT INTO tax_rates (name, country_code, rate_percent, source, effective_at, is_active)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, name, country_code, rate_percent, source, effective_at, is_active, created_at, updated_at
      `,
      [name, countryCode, ratePercent, source, effectiveAt, isActive === null ? true : isActive]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("createTaxRate error:", e)
    return res.status(500).json({ message: "Failed to create tax rate", details: String(e?.message || e) })
  }
}

export async function updateTaxRate(req: Request, res: Response) {
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
    if (input.country_code !== undefined) {
      const countryCode = toStr(input.country_code).toUpperCase()
      if (!countryCode || countryCode.length !== 2) {
        return res.status(400).json({ message: "country_code must be 2 letters" })
      }
      setField("country_code", countryCode)
    }
    if (input.rate_percent !== undefined) {
      const ratePercent = Number(input.rate_percent)
      if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
        return res.status(400).json({ message: "rate_percent must be between 0 and 100" })
      }
      setField("rate_percent", ratePercent)
    }
    if (input.source !== undefined) {
      const source = toStr(input.source)
      if (!TAX_SOURCES.has(source)) return res.status(400).json({ message: "invalid source" })
      setField("source", source)
    }
    if (input.effective_at !== undefined) {
      if (!input.effective_at) return res.status(400).json({ message: "effective_at is required" })
      setField("effective_at", input.effective_at)
    }
    if (input.is_active !== undefined) {
      const isActive = toBool(input.is_active)
      if (isActive === null) return res.status(400).json({ message: "is_active must be boolean" })
      setField("is_active", isActive)
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE tax_rates
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, name, country_code, rate_percent, source, effective_at, is_active, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Tax rate not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateTaxRate error:", e)
    return res.status(500).json({ message: "Failed to update tax rate", details: String(e?.message || e) })
  }
}

export async function listFxRates(req: Request, res: Response) {
  try {
    const baseCurrency = toStr(req.query.base_currency)
    const quoteCurrency = toStr(req.query.quote_currency)
    const source = toStr(req.query.source)
    const isActiveRaw = toStr(req.query.is_active)
    const isActive = isActiveRaw ? toBool(isActiveRaw) : null

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (baseCurrency) {
      where.push(`base_currency = $${params.length + 1}`)
      params.push(baseCurrency)
    }
    if (quoteCurrency) {
      where.push(`quote_currency = $${params.length + 1}`)
      params.push(quoteCurrency)
    }
    if (source) {
      where.push(`source = $${params.length + 1}`)
      params.push(source)
    }
    if (isActive !== null) {
      where.push(`is_active = $${params.length + 1}`)
      params.push(isActive)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM fx_rates ${whereSql}`, params)

    const listRes = await query(
      `
      SELECT id, base_currency, quote_currency, rate, source, effective_at, is_active, created_at, updated_at
      FROM fx_rates
      ${whereSql}
      ORDER BY effective_at DESC
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
    console.error("listFxRates error:", e)
    return res.status(500).json({ message: "Failed to list fx rates", details: String(e?.message || e) })
  }
}

export async function createFxRate(req: Request, res: Response) {
  try {
    const baseCurrency = toStr(req.body?.base_currency).toUpperCase() || "USD"
    const quoteCurrency = toStr(req.body?.quote_currency).toUpperCase() || "KRW"
    const source = toStr(req.body?.source) || "operating"
    const rateRaw = req.body?.rate
    const rate = Number(rateRaw)
    const effectiveAt = req.body?.effective_at
    const isActive = toBool(req.body?.is_active)

    if (!baseCurrency || baseCurrency.length !== 3) {
      return res.status(400).json({ message: "base_currency must be 3 letters" })
    }
    if (!quoteCurrency || quoteCurrency.length !== 3) {
      return res.status(400).json({ message: "quote_currency must be 3 letters" })
    }
    if (!FX_SOURCES.has(source)) return res.status(400).json({ message: "invalid source" })
    if (!Number.isFinite(rate) || rate <= 0) return res.status(400).json({ message: "rate must be positive" })
    if (!effectiveAt) return res.status(400).json({ message: "effective_at is required" })

    const result = await query(
      `
      INSERT INTO fx_rates (base_currency, quote_currency, rate, source, effective_at, is_active)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, base_currency, quote_currency, rate, source, effective_at, is_active, created_at, updated_at
      `,
      [baseCurrency, quoteCurrency, rate, source, effectiveAt, isActive === null ? true : isActive]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "FX rate already exists", details: String(e?.detail || "") })
    }
    console.error("createFxRate error:", e)
    return res.status(500).json({ message: "Failed to create fx rate", details: String(e?.message || e) })
  }
}

export async function updateFxRate(req: Request, res: Response) {
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

    if (input.base_currency !== undefined) {
      const baseCurrency = toStr(input.base_currency).toUpperCase()
      if (!baseCurrency || baseCurrency.length !== 3) {
        return res.status(400).json({ message: "base_currency must be 3 letters" })
      }
      setField("base_currency", baseCurrency)
    }
    if (input.quote_currency !== undefined) {
      const quoteCurrency = toStr(input.quote_currency).toUpperCase()
      if (!quoteCurrency || quoteCurrency.length !== 3) {
        return res.status(400).json({ message: "quote_currency must be 3 letters" })
      }
      setField("quote_currency", quoteCurrency)
    }
    if (input.source !== undefined) {
      const source = toStr(input.source)
      if (!FX_SOURCES.has(source)) return res.status(400).json({ message: "invalid source" })
      setField("source", source)
    }
    if (input.rate !== undefined) {
      const rate = Number(input.rate)
      if (!Number.isFinite(rate) || rate <= 0) return res.status(400).json({ message: "rate must be positive" })
      setField("rate", rate)
    }
    if (input.effective_at !== undefined) {
      if (!input.effective_at) return res.status(400).json({ message: "effective_at is required" })
      setField("effective_at", input.effective_at)
    }
    if (input.is_active !== undefined) {
      const isActive = toBool(input.is_active)
      if (isActive === null) return res.status(400).json({ message: "is_active must be boolean" })
      setField("is_active", isActive)
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE fx_rates
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, base_currency, quote_currency, rate, source, effective_at, is_active, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "FX rate not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "FX rate already exists", details: String(e?.detail || "") })
    }
    console.error("updateFxRate error:", e)
    return res.status(500).json({ message: "Failed to update fx rate", details: String(e?.message || e) })
  }
}

const PAYMENT_PROVIDERS = new Set(["toss", "stripe"])
const PAYMENT_METHOD_TYPES = new Set(["card"])
const PAYMENT_METHOD_STATUSES = new Set(["active", "expired", "deleted"])

export async function listPaymentProviderConfigs(req: Request, res: Response) {
  try {
    const provider = toStr(req.query.provider)
    const isActiveRaw = toStr(req.query.is_active)
    const isActive = isActiveRaw ? toBool(isActiveRaw) : null

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (provider) {
      where.push(`provider = $${params.length + 1}`)
      params.push(provider)
    }
    if (isActive !== null) {
      where.push(`is_active = $${params.length + 1}`)
      params.push(isActive)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM payment_provider_configs ${whereSql}`, params)
    const listRes = await query(
      `
      SELECT id, provider, is_active, config, created_at, updated_at
      FROM payment_provider_configs
      ${whereSql}
      ORDER BY provider ASC
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
    console.error("listPaymentProviderConfigs error:", e)
    return res.status(500).json({ message: "Failed to list payment provider configs", details: String(e?.message || e) })
  }
}

export async function createPaymentProviderConfig(req: Request, res: Response) {
  try {
    const provider = toStr(req.body?.provider)
    const isActive = toBool(req.body?.is_active)
    const configInput = req.body?.config
    const configValue =
      configInput && typeof configInput === "object" ? configInput : configInput ? null : {}

    if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
    if (configValue === null) return res.status(400).json({ message: "config must be object" })

    const result = await query(
      `
      INSERT INTO payment_provider_configs (provider, is_active, config)
      VALUES ($1,$2,$3::jsonb)
      RETURNING id, provider, is_active, config, created_at, updated_at
      `,
      [provider, isActive === null ? true : isActive, JSON.stringify(configValue || {})]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Provider config already exists", details: String(e?.detail || "") })
    }
    console.error("createPaymentProviderConfig error:", e)
    return res.status(500).json({ message: "Failed to create payment provider config", details: String(e?.message || e) })
  }
}

export async function updatePaymentProviderConfig(req: Request, res: Response) {
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

    if (input.provider !== undefined) {
      const provider = toStr(input.provider)
      if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
      setField("provider", provider)
    }
    if (input.is_active !== undefined) {
      const isActive = toBool(input.is_active)
      if (isActive === null) return res.status(400).json({ message: "is_active must be boolean" })
      setField("is_active", isActive)
    }
    if (input.config !== undefined) {
      const configInput = input.config
      const configValue =
        configInput && typeof configInput === "object" ? configInput : configInput ? null : {}
      if (configValue === null) return res.status(400).json({ message: "config must be object" })
      setField("config", JSON.stringify(configValue || {}))
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE payment_provider_configs
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, provider, is_active, config, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Provider config not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Provider config already exists", details: String(e?.detail || "") })
    }
    console.error("updatePaymentProviderConfig error:", e)
    return res.status(500).json({ message: "Failed to update payment provider config", details: String(e?.message || e) })
  }
}

export async function listBillingAccounts(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const tenantId = toStr(req.query.tenant_id)
    const countryCode = toStr(req.query.country_code)
    const currency = toStr(req.query.currency)

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (tenantId) {
      where.push(`ba.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (countryCode) {
      where.push(`ba.country_code = $${params.length + 1}`)
      params.push(countryCode)
    }
    if (currency) {
      where.push(`ba.currency = $${params.length + 1}`)
      params.push(currency)
    }
    if (q) {
      where.push(
        `(
          ba.billing_email ILIKE $${params.length + 1}
          OR ba.billing_name ILIKE $${params.length + 1}
          OR ba.tenant_id::text ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM billing_accounts ba
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        ba.*
      FROM billing_accounts ba
      ${whereSql}
      ORDER BY ba.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)
    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
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
    console.error("listBillingAccounts error:", e)
    return res.status(500).json({ message: "Failed to list billing accounts", details: String(e?.message || e) })
  }
}

export async function createBillingAccount(req: Request, res: Response) {
  try {
    const tenantId = toStr(req.body?.tenant_id)
    const billingEmail = typeof req.body?.billing_email === "string" ? req.body.billing_email : null
    const billingName = typeof req.body?.billing_name === "string" ? req.body.billing_name : null
    const billingPostalCode = toStr(req.body?.billing_postal_code) || null
    const billingAddress1 = toStr(req.body?.billing_address1) || null
    const billingAddress2 = toStr(req.body?.billing_address2) || null
    const billingExtraAddress = toStr(req.body?.billing_extra_address) || null
    const billingPhone = toStr(req.body?.billing_phone) || null
    const countryCode = toStr(req.body?.country_code).toUpperCase() || null
    const taxCountryCode = toStr(req.body?.tax_country_code).toUpperCase() || null
    const taxId = typeof req.body?.tax_id === "string" ? req.body.tax_id : null
    const currency = toStr(req.body?.currency).toUpperCase() || "USD"
    const defaultPaymentMethodId = toStr(req.body?.default_payment_method_id) || null
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })
    if (countryCode && countryCode.length !== 2) {
      return res.status(400).json({ message: "country_code must be 2 letters" })
    }
    if (taxCountryCode && taxCountryCode.length !== 2) {
      return res.status(400).json({ message: "tax_country_code must be 2 letters" })
    }
    if (!currency || currency.length !== 3) {
      return res.status(400).json({ message: "currency must be 3 letters" })
    }
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const result = await query(
      `
      INSERT INTO billing_accounts
        (tenant_id, billing_email, billing_name, billing_postal_code, billing_address1, billing_address2, billing_extra_address, billing_phone,
         country_code, tax_country_code, tax_id, currency, default_payment_method_id, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
      RETURNING *
      `,
      [
        tenantId,
        billingEmail,
        billingName,
        billingPostalCode,
        billingAddress1,
        billingAddress2,
        billingExtraAddress,
        billingPhone,
        countryCode,
        taxCountryCode,
        taxId,
        currency,
        defaultPaymentMethodId,
        JSON.stringify(metadataValue || {}),
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Billing account already exists", details: String(e?.detail || "") })
    }
    console.error("createBillingAccount error:", e)
    return res.status(500).json({ message: "Failed to create billing account", details: String(e?.message || e) })
  }
}

export async function updateBillingAccount(req: Request, res: Response) {
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

    if (input.tenant_id !== undefined) {
      const tenantId = toStr(input.tenant_id)
      if (!tenantId) return res.status(400).json({ message: "tenant_id must be non-empty" })
      setField("tenant_id", tenantId)
    }
    if (input.billing_email !== undefined) {
      const billingEmail = typeof input.billing_email === "string" ? input.billing_email : null
      setField("billing_email", billingEmail)
    }
    if (input.billing_name !== undefined) {
      const billingName = typeof input.billing_name === "string" ? input.billing_name : null
      setField("billing_name", billingName)
    }
    if (input.billing_postal_code !== undefined) {
      const billingPostalCode = toStr(input.billing_postal_code) || null
      setField("billing_postal_code", billingPostalCode)
    }
    if (input.billing_address1 !== undefined) {
      const billingAddress1 = toStr(input.billing_address1) || null
      setField("billing_address1", billingAddress1)
    }
    if (input.billing_address2 !== undefined) {
      const billingAddress2 = toStr(input.billing_address2) || null
      setField("billing_address2", billingAddress2)
    }
    if (input.billing_extra_address !== undefined) {
      const billingExtraAddress = toStr(input.billing_extra_address) || null
      setField("billing_extra_address", billingExtraAddress)
    }
    if (input.billing_phone !== undefined) {
      const billingPhone = toStr(input.billing_phone) || null
      setField("billing_phone", billingPhone)
    }
    if (input.country_code !== undefined) {
      const countryCode = toStr(input.country_code).toUpperCase()
      if (countryCode && countryCode.length !== 2) {
        return res.status(400).json({ message: "country_code must be 2 letters" })
      }
      setField("country_code", countryCode || null)
    }
    if (input.tax_country_code !== undefined) {
      const taxCountryCode = toStr(input.tax_country_code).toUpperCase()
      if (taxCountryCode && taxCountryCode.length !== 2) {
        return res.status(400).json({ message: "tax_country_code must be 2 letters" })
      }
      setField("tax_country_code", taxCountryCode || null)
    }
    if (input.tax_id !== undefined) {
      const taxId = typeof input.tax_id === "string" ? input.tax_id : null
      setField("tax_id", taxId)
    }
    if (input.currency !== undefined) {
      const currency = toStr(input.currency).toUpperCase()
      if (!currency || currency.length !== 3) {
        return res.status(400).json({ message: "currency must be 3 letters" })
      }
      setField("currency", currency)
    }
    if (input.default_payment_method_id !== undefined) {
      const defaultPaymentMethodId = toStr(input.default_payment_method_id) || null
      setField("default_payment_method_id", defaultPaymentMethodId)
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
      UPDATE billing_accounts
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Billing account not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Billing account already exists", details: String(e?.detail || "") })
    }
    console.error("updateBillingAccount error:", e)
    return res.status(500).json({ message: "Failed to update billing account", details: String(e?.message || e) })
  }
}

export async function getMyBillingAccount(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const result = await query(`SELECT * FROM billing_accounts WHERE tenant_id = $1 LIMIT 1`, [tenantId])
    return res.json({ ok: true, row: result.rows[0] || null })
  } catch (e: any) {
    console.error("getMyBillingAccount error:", e)
    return res.status(500).json({ message: "Failed to load billing account", details: String(e?.message || e) })
  }
}

export async function upsertMyBillingAccount(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const billingEmail = typeof req.body?.billing_email === "string" ? req.body.billing_email : null
    const billingName = typeof req.body?.billing_name === "string" ? req.body.billing_name : null
    const billingPostalCode = toStr(req.body?.billing_postal_code) || null
    const billingAddress1 = toStr(req.body?.billing_address1) || null
    const billingAddress2 = toStr(req.body?.billing_address2) || null
    const billingExtraAddress = toStr(req.body?.billing_extra_address) || null
    const billingPhone = toStr(req.body?.billing_phone) || null

    const countryCode = toStr(req.body?.country_code).toUpperCase() || null
    const taxCountryCode = toStr(req.body?.tax_country_code).toUpperCase() || null
    const currency = toStr(req.body?.currency).toUpperCase() || "USD"

    if (countryCode && countryCode.length !== 2) {
      return res.status(400).json({ message: "country_code must be 2 letters" })
    }
    if (taxCountryCode && taxCountryCode.length !== 2) {
      return res.status(400).json({ message: "tax_country_code must be 2 letters" })
    }
    if (!currency || currency.length !== 3) {
      return res.status(400).json({ message: "currency must be 3 letters" })
    }

    const result = await query(
      `
      INSERT INTO billing_accounts
        (tenant_id, billing_email, billing_name, billing_postal_code, billing_address1, billing_address2, billing_extra_address, billing_phone,
         country_code, tax_country_code, currency, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      ON CONFLICT (tenant_id) DO UPDATE
      SET
        billing_email = EXCLUDED.billing_email,
        billing_name = EXCLUDED.billing_name,
        billing_postal_code = EXCLUDED.billing_postal_code,
        billing_address1 = EXCLUDED.billing_address1,
        billing_address2 = EXCLUDED.billing_address2,
        billing_extra_address = EXCLUDED.billing_extra_address,
        billing_phone = EXCLUDED.billing_phone,
        country_code = EXCLUDED.country_code,
        tax_country_code = EXCLUDED.tax_country_code,
        currency = EXCLUDED.currency,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [
        tenantId,
        billingEmail,
        billingName,
        billingPostalCode,
        billingAddress1,
        billingAddress2,
        billingExtraAddress,
        billingPhone,
        countryCode,
        taxCountryCode,
        currency,
        JSON.stringify({}),
      ]
    )

    return res.status(200).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("upsertMyBillingAccount error:", e)
    return res.status(500).json({ message: "Failed to save billing account", details: String(e?.message || e) })
  }
}

export async function listMyPaymentMethods(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM payment_methods pm
      JOIN billing_accounts ba ON ba.id = pm.billing_account_id
      WHERE ba.tenant_id = $1 AND pm.status <> 'deleted'
      `,
      [tenantId]
    )
    const rowsRes = await query(
      `
      SELECT pm.*
      FROM payment_methods pm
      JOIN billing_accounts ba ON ba.id = pm.billing_account_id
      WHERE ba.tenant_id = $1 AND pm.status <> 'deleted'
      ORDER BY pm.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [tenantId, limit, offset]
    )

    return res.json({
      ok: true,
      rows: rowsRes.rows || [],
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
    })
  } catch (e: any) {
    console.error("listMyPaymentMethods error:", e)
    return res.status(500).json({ message: "Failed to load payment methods", details: String(e?.message || e) })
  }
}

export async function setMyDefaultPaymentMethod(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const paymentMethodId = toStr(req.params.id)
    if (!paymentMethodId) return res.status(400).json({ message: "id is required" })

    await client.query("BEGIN")

    const check = await client.query(
      `SELECT pm.id FROM payment_methods pm
       JOIN billing_accounts ba ON ba.id = pm.billing_account_id
       WHERE ba.tenant_id = $1 AND pm.id = $2 AND pm.status <> 'deleted'`,
      [tenantId, paymentMethodId]
    )
    if (check.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ message: "Payment method not found" })
    }

    await client.query(
      `UPDATE payment_methods SET is_default = false, updated_at = CURRENT_TIMESTAMP
       WHERE billing_account_id = (SELECT id FROM billing_accounts WHERE tenant_id = $1)
         AND is_default = true`,
      [tenantId]
    )
    await client.query(
      `UPDATE payment_methods SET is_default = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [paymentMethodId]
    )

    await client.query("COMMIT")
    return res.json({ ok: true })
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("setMyDefaultPaymentMethod error:", e)
    return res.status(500).json({ message: "Failed to set default", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function deleteMyPaymentMethod(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const paymentMethodId = toStr(req.params.id)
    if (!paymentMethodId) return res.status(400).json({ message: "id is required" })

    const result = await query(
      `UPDATE payment_methods SET status = 'deleted', is_default = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND billing_account_id = (SELECT id FROM billing_accounts WHERE tenant_id = $2)
         AND status <> 'deleted'
       RETURNING id`,
      [paymentMethodId, tenantId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Payment method not found" })
    }
    return res.json({ ok: true })
  } catch (e: any) {
    console.error("deleteMyPaymentMethod error:", e)
    return res.status(500).json({ message: "Failed to delete payment method", details: String(e?.message || e) })
  }
}

export async function listMyTransactions(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const limit = Math.min(toInt(req.query.limit, 10) ?? 10, 100)
    const offset = toInt(req.query.offset, 0) ?? 0

    const countRes = await query(
      `SELECT COUNT(*)::int AS total
       FROM payment_transactions pt
       JOIN billing_accounts ba ON ba.id = pt.billing_account_id
       WHERE ba.tenant_id = $1`,
      [tenantId]
    )

    const listRes = await query(
      `SELECT
         pt.id,
         pt.invoice_id,
         pt.transaction_type,
         pt.status,
         pt.amount_usd,
         pt.currency,
         pt.amount_local,
         pt.local_currency,
         pt.processed_at,
         pt.created_at,
         pt.metadata,
         i.invoice_number,
         (SELECT li.line_type FROM invoice_line_items li WHERE li.invoice_id = pt.invoice_id ORDER BY li.amount_usd DESC, li.created_at LIMIT 1) AS primary_line_type,
         (SELECT li.description FROM invoice_line_items li WHERE li.invoice_id = pt.invoice_id ORDER BY li.amount_usd DESC, li.created_at LIMIT 1) AS invoice_description,
         pm.card_brand,
         pm.card_last4,
         pm.type AS pm_type
       FROM payment_transactions pt
       JOIN billing_accounts ba ON ba.id = pt.billing_account_id
       LEFT JOIN billing_invoices i ON i.id = pt.invoice_id
       LEFT JOIN payment_methods pm ON pm.id = pt.payment_method_id
       WHERE ba.tenant_id = $1
       ORDER BY pt.processed_at DESC NULLS LAST, pt.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    )

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    })
  } catch (e: any) {
    console.error("listMyTransactions error:", e)
    return res.status(500).json({ message: "Failed to list transactions", details: String(e?.message || e) })
  }
}

export async function getMyTaxRate(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const accountRes = await query(
      `SELECT tax_country_code, country_code FROM billing_accounts WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    )
    const row = accountRes.rows[0] || {}
    const countryCode = toStr(row.tax_country_code || row.country_code).toUpperCase()
    if (!countryCode) return res.json({ ok: true, country_code: null, rate_percent: 0 })

    const rateRow = await pickLatestTaxRate(pool, countryCode)
    const ratePercent = rateRow ? Number(rateRow.rate_percent) : 0
    return res.json({ ok: true, country_code: countryCode, rate_percent: ratePercent, tax_rate_id: rateRow?.id ?? null })
  } catch (e: any) {
    console.error("getMyTaxRate error:", e)
    return res.status(500).json({ message: "Failed to load tax rate", details: String(e?.message || e) })
  }
}

export async function getMySubscription(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    const row = await loadCurrentSubscription(client, tenantId)
    return res.json({ ok: true, row: row || null })
  } catch (e: any) {
    console.error("getMySubscription error:", e)
    return res.status(500).json({ message: "Failed to load subscription", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function quoteMySubscriptionChange(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const action = toStr(req.body?.action || req.query?.action) || "change"
    const targetPlanId = toStr(req.body?.target_plan_id || req.query?.target_plan_id)
    const targetBillingCycle = toStr(req.body?.target_billing_cycle || req.query?.target_billing_cycle)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (action !== "change" && action !== "cancel") return res.status(400).json({ message: "invalid action" })

    const quote = await buildSubscriptionChangeQuote(
      client,
      tenantId,
      action as "change" | "cancel",
      targetPlanId || undefined,
      targetBillingCycle || undefined
    )

    return res.status(200).json({ ok: true, quote })
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json({ message: e?.message || "Failed to quote change" })
    console.error("quoteMySubscriptionChange error:", e)
    return res.status(500).json({ message: "Failed to quote change", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function applyMySubscriptionChange(req: Request, res: Response) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const userId = toStr(authed.userId)
    const action = toStr(req.body?.action) || "change"
    const targetPlanId = toStr(req.body?.target_plan_id)
    const targetBillingCycle = toStr(req.body?.target_billing_cycle)
    const paymentMethodIdInput = toStr(req.body?.payment_method_id) || null
    const refundPolicyConsent = toBool(req.body?.refund_policy_consent)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!refundPolicyConsent) return res.status(400).json({ message: "Refund policy consent is required" })
    if (action !== "change" && action !== "cancel") return res.status(400).json({ message: "invalid action" })

    const quote = await buildSubscriptionChangeQuote(
      client,
      tenantId,
      action as "change" | "cancel",
      targetPlanId || undefined,
      targetBillingCycle || undefined
    )

    const current = await loadCurrentSubscription(client, tenantId)
    if (!current) return res.status(404).json({ message: "Active subscription not found" })

    const nowIso = new Date().toISOString()
    const billingAccountId = await ensureBillingAccount(client, tenantId, quote.currency, userId)
    if (!billingAccountId) return res.status(500).json({ message: "Failed to resolve billing account" })
    const paymentMethodId = await resolvePaymentMethodId(client, billingAccountId, paymentMethodIdInput)

    await client.query("BEGIN")
    transactionStarted = true

    const metadataBase = {
      source: "user_subscription_change",
      action: quote.action,
      change_type: quote.change_type,
      plan_id: quote.target?.plan_id ?? current.plan_id,
      plan_name: quote.target?.plan_name ?? current.plan_name,
      billing_cycle: quote.target?.billing_cycle ?? current.billing_cycle,
      credit_delta: quote.credit_delta,
      effective_at: quote.effective_at,
    }

    let subscriptionRow = current
    let chargeTransaction: any | null = null
    let refundTransaction: any | null = null

    if (quote.action === "cancel") {
      await client.query(
        `
        UPDATE billing_subscriptions
        SET status = $1,
            cancel_at_period_end = $2,
            auto_renew = $3,
            cancelled_at = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        `,
        ["scheduled_cancel", true, false, nowIso, current.id]
      )

      await client.query(
        `
        INSERT INTO billing_subscription_changes
          (subscription_id, change_type, status, from_plan_id, to_plan_id, requested_by, effective_at, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        `,
        [current.id, "cancel", "scheduled", current.plan_id, null, userId || null, quote.effective_at, JSON.stringify(metadataBase)]
      )

      await client.query(
        `
        UPDATE billing_subscription_seat_addons
        SET status = 'scheduled_cancel',
            cancel_at_period_end = TRUE,
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{auto_cancel_reason}', '"subscription_cancel"'::jsonb, TRUE),
            updated_at = CURRENT_TIMESTAMP
        WHERE subscription_id = $1 AND tenant_id = $2 AND status = 'active'
        `,
        [current.id, tenantId]
      )
    } else if (quote.change_type === "monthly_downgrade") {
      await client.query(
        `
        INSERT INTO billing_subscription_changes
          (subscription_id, change_type, status, from_plan_id, to_plan_id, requested_by, effective_at, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        `,
        [
          current.id,
          "downgrade",
          "scheduled",
          current.plan_id,
          quote.target?.plan_id || null,
          userId || null,
          quote.effective_at,
          JSON.stringify(metadataBase),
        ]
      )

      await scheduleExcessSeatAddonCancellation(client, current.id, tenantId, quote.target ?? null, "downgrade")
    } else {
      const targetPlan = quote.target
      if (!targetPlan) throw quoteError(400, "target plan is required")

      const resetPeriod = quote.change_type === "annual_downgrade" || quote.change_type === "monthly_to_yearly"
      const nextPeriodStart = nowIso
      const nextPeriodEnd = addBillingCycle(new Date(), targetPlan.billing_cycle).toISOString()

      const metadata = {
        ...metadataBase,
        changed_by: userId || null,
        changed_at: nowIso,
      }

      const nextPriceLocal =
        targetPlan.billing_cycle === "yearly" ? quote.target?.price_yearly : quote.target?.price_monthly
      const nextPriceUsd =
        targetPlan.billing_cycle === "yearly" ? quote.target?.price_yearly_usd : quote.target?.price_monthly_usd
      const nextFxRate = quote.target?.fx_rate ?? null

      const updateFields = [
        targetPlan.plan_id,
        targetPlan.billing_cycle,
        "active",
        resetPeriod ? nextPeriodStart : current.current_period_start,
        resetPeriod ? nextPeriodEnd : current.current_period_end,
        false,
        true,
        nextPriceUsd ?? null,
        nextPriceLocal ?? null,
        nextFxRate,
        "USD",
        quote.currency,
        JSON.stringify(metadata),
        current.id,
      ]

      await client.query(
        `
        UPDATE billing_subscriptions
        SET plan_id = $1,
            billing_cycle = $2,
            status = $3,
            current_period_start = $4,
            current_period_end = $5,
            cancel_at_period_end = $6,
            auto_renew = $7,
            price_usd = $8,
            price_local = $9,
            fx_rate = $10,
            currency = $11,
            local_currency = $12,
            metadata = $13::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
        RETURNING *
        `,
        updateFields
      )

      await client.query(
        `
        INSERT INTO billing_subscription_changes
          (subscription_id, change_type, status, from_plan_id, to_plan_id, requested_by, effective_at, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        `,
        [
          current.id,
          quote.change_type === "annual_downgrade" ? "downgrade" : "upgrade",
          "applied",
          current.plan_id,
          targetPlan.plan_id,
          userId || null,
          quote.effective_at,
          JSON.stringify(metadataBase),
        ]
      )

      if (targetPlan.tenant_type) {
        const includedSeats =
          typeof targetPlan.included_seats === "number" && Number.isFinite(targetPlan.included_seats)
            ? Math.floor(targetPlan.included_seats)
            : null
        await client.query(
          `
          UPDATE tenants
          SET tenant_type = $1,
              member_limit = COALESCE($2, member_limit),
              metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{plan_tier}', to_jsonb($3::text), TRUE),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4 AND deleted_at IS NULL
          `,
          [targetPlan.tenant_type, includedSeats, targetPlan.plan_tier || "free", tenantId]
        )
      }

      if (
        quote.change_type === "annual_downgrade" ||
        (quote.change_type !== "monthly_to_yearly" && quote.target)
      ) {
        const isDowngrade =
          quote.change_type === "annual_downgrade" ||
          (quote.change_type !== "monthly_to_yearly" &&
            quote.target &&
            Number(quote.target.plan_sort_order ?? 999) < Number(current.plan_sort_order ?? 0))
        if (isDowngrade) {
          await scheduleExcessSeatAddonCancellation(client, current.id, tenantId, targetPlan, "downgrade")
        }
      }

      subscriptionRow = {
        ...subscriptionRow,
        plan_id: targetPlan.plan_id,
        billing_cycle: targetPlan.billing_cycle,
        current_period_start: resetPeriod ? nextPeriodStart : current.current_period_start,
        current_period_end: resetPeriod ? nextPeriodEnd : current.current_period_end,
      }
    }

    const changeFxRate = quote.target?.fx_rate ?? quote.current?.fx_rate ?? null
    const toUsd = (localAmount: number) =>
      changeFxRate && changeFxRate > 0 ? roundMoney(localAmount / changeFxRate, "USD") : localAmount

    if (quote.charge_amount > 0) {
      chargeTransaction = await insertPaymentTransaction(client, {
        billing_account_id: billingAccountId,
        amount_usd: toUsd(quote.total_amount),
        amount_local: quote.total_amount,
        currency: "USD",
        local_currency: quote.currency,
        transaction_type: "charge",
        metadata: metadataBase,
        payment_method_id: paymentMethodId,
      })
    }
    if (quote.refund_amount > 0) {
      refundTransaction = await insertPaymentTransaction(client, {
        billing_account_id: billingAccountId,
        amount_usd: toUsd(quote.refund_amount),
        amount_local: quote.refund_amount,
        currency: "USD",
        local_currency: quote.currency,
        transaction_type: "refund",
        metadata: metadataBase,
        payment_method_id: paymentMethodId,
      })
    }

    const consentRefId = chargeTransaction?.id || refundTransaction?.id || subscriptionRow?.id || null
    await insertRefundPolicyConsent(client, userId, "subscription_change", consentRefId, req)

    await client.query("COMMIT")
    transactionStarted = false

    let creditGrantResult: any = null
    if (
      quote.action === "change" &&
      quote.change_type !== "monthly_downgrade" &&
      quote.target?.plan_slug &&
      subscriptionRow?.current_period_end
    ) {
      const isReset =
        quote.change_type === "annual_downgrade" || quote.change_type === "monthly_to_yearly"
      const grantMode: CreditGrantMode = isReset ? "reset" : "increment"
      const grantAmount = grantMode === "increment" ? quote.credit_delta : null
      if (grantMode === "reset" || (grantAmount && grantAmount > 0)) {
        const grantKey = `${subscriptionRow.id}:${subscriptionRow.current_period_end}:${grantMode}:${grantAmount ?? "reset"}`
        creditGrantResult = await requestSubscriptionCreditGrant({
          tenant_id: tenantId,
          subscription_id: subscriptionRow.id,
          plan_slug: String(quote.target.plan_slug),
          billing_cycle: String(quote.target.billing_cycle),
          period_start: subscriptionRow.current_period_start,
          period_end: subscriptionRow.current_period_end,
          grant_mode: grantMode,
          grant_amount: grantAmount ?? undefined,
          grant_key: grantKey,
          reason: quote.change_type,
        })
      }
    }

    return res.status(200).json({
      ok: true,
      quote,
      subscription: subscriptionRow,
      charge_transaction: chargeTransaction,
      refund_transaction: refundTransaction,
      credit_grant: creditGrantResult,
    })
  } catch (e: any) {
    if (transactionStarted) await client.query("ROLLBACK")
    if (e?.status) return res.status(e.status).json({ message: e?.message || "Failed to apply change" })
    console.error("applyMySubscriptionChange error:", e)
    return res.status(500).json({ message: "Failed to apply change", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function quoteUserSubscription(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const planId = toStr(req.body?.plan_id || req.query?.plan_id)
    const billingCycle = toStr(req.body?.billing_cycle || req.query?.billing_cycle)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!planId) return res.status(400).json({ message: "plan_id is required" })
    if (!BILLING_CYCLES.has(billingCycle)) return res.status(400).json({ message: "invalid billing_cycle" })

    const planRes = await client.query(`SELECT id, name FROM billing_plans WHERE id = $1`, [planId])
    if (planRes.rows.length === 0) return res.status(404).json({ message: "Billing plan not found" })

    const quote = await resolveUserQuote(client, tenantId, planId, billingCycle)
    return res.status(200).json({
      ok: true,
      plan_id: planId,
      billing_cycle: billingCycle,
      plan_name: planRes.rows[0]?.name ?? null,
      ...quote,
    })
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json({ message: e?.message || "Failed to quote" })
    console.error("quoteUserSubscription error:", e)
    return res.status(500).json({ message: "Failed to quote", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function createMyPaymentMethod(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const provider = toStr(req.body?.provider) || "toss"
    const type = toStr(req.body?.type) || "card"
    const providerCustomerId = typeof req.body?.provider_customer_id === "string" ? req.body.provider_customer_id : null
    const providerPaymentMethodId =
      typeof req.body?.provider_payment_method_id === "string" ? req.body.provider_payment_method_id : null
    const cardBrand = typeof req.body?.card_brand === "string" ? req.body.card_brand : null
    const cardLast4 = typeof req.body?.card_last4 === "string" ? req.body.card_last4 : null
    const cardExpMonthRaw = req.body?.card_exp_month
    const cardExpYearRaw = req.body?.card_exp_year
    const cardExpMonth =
      cardExpMonthRaw === null || cardExpMonthRaw === undefined || cardExpMonthRaw === "" ? null : Number(cardExpMonthRaw)
    const cardExpYear =
      cardExpYearRaw === null || cardExpYearRaw === undefined || cardExpYearRaw === "" ? null : Number(cardExpYearRaw)
    const status = toStr(req.body?.status) || "active"
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
    if (!PAYMENT_METHOD_TYPES.has(type)) return res.status(400).json({ message: "invalid type" })
    if (!PAYMENT_METHOD_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
    if (cardExpMonth !== null && (!Number.isFinite(cardExpMonth) || cardExpMonth < 1 || cardExpMonth > 12)) {
      return res.status(400).json({ message: "card_exp_month must be 1-12" })
    }
    if (cardExpYear !== null && (!Number.isFinite(cardExpYear) || cardExpYear < 2000)) {
      return res.status(400).json({ message: "card_exp_year must be >= 2000" })
    }
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const accountRes = await query(`SELECT id FROM billing_accounts WHERE tenant_id = $1`, [tenantId])
    let billingAccountId = accountRes.rows[0]?.id
    if (!billingAccountId) {
      const createRes = await query(
        `
        INSERT INTO billing_accounts (tenant_id, metadata)
        VALUES ($1,$2::jsonb)
        RETURNING id
        `,
        [tenantId, JSON.stringify({ source: "user_payment_method", created_by: authed.userId })]
      )
      billingAccountId = createRes.rows[0]?.id
    }
    if (!billingAccountId) return res.status(500).json({ message: "Failed to resolve billing account" })

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM payment_methods
      WHERE billing_account_id = $1 AND status <> 'deleted'
      `,
      [billingAccountId]
    )
    const isDefault = (countRes.rows[0]?.total ?? 0) === 0

    const result = await query(
      `
      INSERT INTO payment_methods
        (billing_account_id, provider, type, provider_customer_id, provider_payment_method_id,
         card_brand, card_last4, card_exp_month, card_exp_year, is_default, status, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      RETURNING *
      `,
      [
        billingAccountId,
        provider,
        type,
        providerCustomerId,
        providerPaymentMethodId,
        cardBrand,
        cardLast4,
        cardExpMonth,
        cardExpYear,
        isDefault,
        status,
        JSON.stringify(metadataValue || {}),
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Payment method already exists", details: String(e?.detail || "") })
    }
    console.error("createMyPaymentMethod error:", e)
    return res.status(500).json({ message: "Failed to create payment method", details: String(e?.message || e) })
  }
}

export async function checkoutUserSubscription(req: Request, res: Response) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const planId = toStr(req.body?.plan_id)
    const billingCycle = toStr(req.body?.billing_cycle)
    const provider = toStr(req.body?.provider) || "toss"
    const paymentMethodIdInput = toStr(req.body?.payment_method_id) || null
    const refundPolicyConsent = toBool(req.body?.refund_policy_consent)

    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!planId) return res.status(400).json({ message: "plan_id is required" })
    if (!BILLING_CYCLES.has(billingCycle)) return res.status(400).json({ message: "invalid billing_cycle" })
    if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
    if (!refundPolicyConsent) return res.status(400).json({ message: "Refund policy consent is required" })
    if (await isSystemTenantId(client, tenantId)) {
      return res.status(400).json({ message: "system tenant cannot be billed" })
    }

    const planRes = await client.query(
      `SELECT id, slug, name, tier, tenant_type, included_seats FROM billing_plans WHERE id = $1`,
      [planId]
    )
    if (planRes.rows.length === 0) return res.status(404).json({ message: "Billing plan not found" })
    const planTier = String(planRes.rows[0]?.tier || "")
    const planTenantType = String(planRes.rows[0]?.tenant_type || "")
    const planName = String(planRes.rows[0]?.name || "")
    const planSlug = String(planRes.rows[0]?.slug || "")
    const planIncludedSeatsRaw = planRes.rows[0]?.included_seats
    const planIncludedSeats =
      typeof planIncludedSeatsRaw === "number" && Number.isFinite(planIncludedSeatsRaw)
        ? Math.floor(planIncludedSeatsRaw)
        : null

    const quote = await resolveUserQuote(client, tenantId, planId, billingCycle)
    const priceUsd = safeNumber(quote.base_amount, 0)
    const priceLocal = safeNumber(quote.amount, priceUsd)
    const fxRate = typeof quote.fx_rate === "number" ? quote.fx_rate : null
    const currency = quote.currency
    const taxRatePercent = quote.tax_rate_percent
    const taxAmount = quote.tax_amount
    const totalAmount = quote.total_amount
    const taxAmountUsd = quote.tax_amount_usd
    const totalAmountUsd = quote.total_amount_usd
    const taxRateId = quote.tax_rate_id
    const fxRateId = quote.fx_rate_id
    const exchangeRate = quote.fx_rate

    const now = new Date()
    const periodStartIso = now.toISOString()
    const periodEnd = new Date(now)
    if (billingCycle === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    }
    const periodEndIso = periodEnd.toISOString()

    await client.query("BEGIN")
    transactionStarted = true

    const subRes = await client.query(
      `SELECT * FROM billing_subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    )
    let subscriptionRow = subRes.rows[0] || null
    const subscriptionMeta = {
      source: "user_checkout",
      plan_id: planId,
      plan_name: planName,
      billing_cycle: billingCycle,
      checked_out_by: authed.userId,
      checked_out_at: periodStartIso,
    }

    if (subscriptionRow) {
      const updateRes = await client.query(
        `
        UPDATE billing_subscriptions
        SET plan_id = $1,
            billing_cycle = $2,
            status = $3,
            current_period_start = $4,
            current_period_end = $5,
            cancel_at_period_end = $6,
            auto_renew = $7,
            price_usd = $8,
            price_local = $9,
            fx_rate = $10,
            currency = $11,
            local_currency = $12,
            metadata = $13::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
        RETURNING *
        `,
        [
          planId,
          billingCycle,
          "active",
          periodStartIso,
          periodEndIso,
          false,
          true,
          priceUsd,
          priceLocal,
          fxRate,
          "USD",
          currency,
          JSON.stringify(subscriptionMeta),
          subscriptionRow.id,
        ]
      )
      subscriptionRow = updateRes.rows[0]
    } else {
      const insertRes = await client.query(
        `
        INSERT INTO billing_subscriptions
          (tenant_id, plan_id, billing_cycle, status, current_period_start, current_period_end,
           cancel_at_period_end, auto_renew, price_usd, price_local, fx_rate, currency, local_currency, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
        RETURNING *
        `,
        [
          tenantId,
          planId,
          billingCycle,
          "active",
          periodStartIso,
          periodEndIso,
          false,
          true,
          priceUsd,
          priceLocal,
          fxRate,
          "USD",
          currency,
          JSON.stringify(subscriptionMeta),
        ]
      )
      subscriptionRow = insertRes.rows[0]
    }

    if (planTenantType) {
      await client.query(
        `
        UPDATE tenants
        SET tenant_type = $1,
            member_limit = COALESCE($2, member_limit),
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{plan_tier}', to_jsonb($3::text), TRUE),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND deleted_at IS NULL
        `,
        [planTenantType, planIncludedSeats, planTier || "free", tenantId]
      )
    }

    const billingAccountRes = await client.query(`SELECT id FROM billing_accounts WHERE tenant_id = $1`, [tenantId])
    let billingAccountId = billingAccountRes.rows[0]?.id
    if (!billingAccountId) {
      const createAccountRes = await client.query(
        `
        INSERT INTO billing_accounts (tenant_id, currency, metadata)
        VALUES ($1,$2,$3::jsonb)
        RETURNING id
        `,
        [tenantId, currency, JSON.stringify({ source: "user_checkout", created_by: authed.userId })]
      )
      billingAccountId = createAccountRes.rows[0]?.id
    }
    if (!billingAccountId) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(500).json({ message: "Failed to resolve billing account" })
    }
    const paymentMethodId = await resolvePaymentMethodId(client, billingAccountId, paymentMethodIdInput)

    const invoiceColumns = await loadInvoiceColumns(client)
    const invoiceCols: string[] = []
    const invoiceVals: any[] = []
    const invoicePlaceholders: string[] = []
    const addInvoiceCol = (name: string, value: any, cast?: string) => {
      if (!invoiceColumns.has(name)) return
      invoiceCols.push(name)
      invoiceVals.push(value)
      invoicePlaceholders.push(cast ? `$${invoiceVals.length}::${cast}` : `$${invoiceVals.length}`)
    }

    const buildInvoiceCols = () => {
      invoiceCols.splice(0, invoiceCols.length)
      invoiceVals.splice(0, invoiceVals.length)
      invoicePlaceholders.splice(0, invoicePlaceholders.length)
      addInvoiceCol("tenant_id", tenantId)
      addInvoiceCol("subscription_id", subscriptionRow.id)
      addInvoiceCol("billing_account_id", billingAccountId)
      addInvoiceCol("invoice_number", makeInvoiceNumber("USR"))
      addInvoiceCol("status", "paid")
      addInvoiceCol("currency", "USD")
      addInvoiceCol("subtotal_usd", priceUsd)
      addInvoiceCol("total_usd", totalAmountUsd)
      addInvoiceCol("issue_date", periodStartIso)
      addInvoiceCol("paid_at", periodStartIso)
      addInvoiceCol("metadata", JSON.stringify(subscriptionMeta), "jsonb")
      if (invoiceColumns.has("tax_usd")) addInvoiceCol("tax_usd", taxAmountUsd)
      if (invoiceColumns.has("tax_rate_id")) addInvoiceCol("tax_rate_id", taxRateId ?? null)
      if (invoiceColumns.has("fx_rate_id")) addInvoiceCol("fx_rate_id", fxRateId ?? null)
      if (invoiceColumns.has("exchange_rate")) addInvoiceCol("exchange_rate", exchangeRate ?? null)
      if (invoiceColumns.has("discount_usd")) addInvoiceCol("discount_usd", 0)
      if (invoiceColumns.has("period_start")) addInvoiceCol("period_start", periodStartIso)
      if (invoiceColumns.has("period_end")) addInvoiceCol("period_end", periodEndIso)
      if (invoiceColumns.has("local_currency")) addInvoiceCol("local_currency", currency)
      if (invoiceColumns.has("local_subtotal")) addInvoiceCol("local_subtotal", priceLocal)
      if (invoiceColumns.has("local_tax")) addInvoiceCol("local_tax", taxAmount)
      if (invoiceColumns.has("local_discount")) addInvoiceCol("local_discount", 0)
      if (invoiceColumns.has("local_total")) addInvoiceCol("local_total", totalAmount)
    }
    buildInvoiceCols()

    let invoiceRow: any | null = null
    for (let i = 0; i < 3; i += 1) {
      try {
        const insertInvoiceRes = await client.query(
          `
          INSERT INTO billing_invoices (${invoiceCols.join(", ")})
          VALUES (${invoicePlaceholders.join(", ")})
          RETURNING *
          `,
          invoiceVals
        )
        invoiceRow = insertInvoiceRes.rows[0]
        break
      } catch (e: any) {
        if (e?.code === "23505" && String(e?.detail || "").includes("invoice_number")) {
          buildInvoiceCols()
          continue
        }
        throw e
      }
    }

    if (!invoiceRow) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(500).json({ message: "Failed to create invoice" })
    }

    await client.query(
      `
      INSERT INTO invoice_line_items
        (invoice_id, line_type, description, quantity, unit_price_usd, amount_usd, currency, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      `,
      [
        invoiceRow.id,
        "adjustment",
        "서비스 제공",
        1,
        priceUsd,
        priceUsd,
        "USD",
        JSON.stringify(subscriptionMeta),
      ]
    )

    const txRes = await client.query(
      `
      INSERT INTO payment_transactions
        (invoice_id, billing_account_id, provider, transaction_type, status,
         amount_usd, currency, amount_local, local_currency,
         payment_method_id, processed_at, provider_transaction_id, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
      RETURNING *
      `,
      [
        invoiceRow.id,
        billingAccountId,
        provider,
        "charge",
        "succeeded",
        totalAmountUsd,
        "USD",
        totalAmount,
        currency,
        paymentMethodId,
        periodStartIso,
        makeInvoiceNumber("USR-TX"),
        JSON.stringify(subscriptionMeta),
      ]
    )

    await insertRefundPolicyConsent(client, toStr(authed.userId), "checkout", txRes.rows[0]?.id || null, req)

    await client.query("COMMIT")
    transactionStarted = false

    let creditGrantResult: any = null
    if (planSlug && subscriptionRow?.current_period_end) {
      const grantKey = `${subscriptionRow.id}:${periodEndIso}:reset`
      creditGrantResult = await requestSubscriptionCreditGrant({
        tenant_id: tenantId,
        subscription_id: subscriptionRow.id,
        plan_slug: planSlug,
        billing_cycle: billingCycle,
        period_start: periodStartIso,
        period_end: periodEndIso,
        grant_mode: "reset",
        grant_key: grantKey,
        reason: "checkout",
      })
    }

    return res.status(200).json({
      ok: true,
      subscription: subscriptionRow,
      invoice: invoiceRow,
      transaction: txRes.rows[0],
      total_amount: totalAmount,
      tax_amount: taxAmount,
      tax_rate_percent: taxRatePercent,
      currency,
      next_billing_date: periodEndIso,
      credit_grant: creditGrantResult,
    })
  } catch (e: any) {
    if (transactionStarted) await client.query("ROLLBACK")
    if (e?.status) {
      return res.status(e.status).json({ message: e?.message || "Failed to checkout subscription" })
    }
    console.error("checkoutUserSubscription error:", e)
    return res.status(500).json({ message: "Failed to checkout subscription", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function getMyCheckoutSummary(req: Request, res: Response) {
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const transactionId = toStr(req.query.transaction_id)
    const invoiceId = toStr(req.query.invoice_id)

    const where: string[] = ["ba.tenant_id = $1"]
    const params: any[] = [tenantId]

    if (transactionId) {
      where.push(`pt.id = $${params.length + 1}`)
      params.push(transactionId)
    } else if (invoiceId) {
      where.push(`i.id = $${params.length + 1}`)
      params.push(invoiceId)
    }

    const whereSql = `WHERE ${where.join(" AND ")}`

    const result = await query(
      `
      SELECT
        pt.id AS transaction_id,
        pt.status AS transaction_status,
        pt.provider AS transaction_provider,
        pt.processed_at,
        pt.amount_usd,
        pt.amount_local,
        pt.currency AS transaction_currency,
        pt.local_currency AS transaction_local_currency,
        pt.metadata AS transaction_metadata,
        i.id AS invoice_id,
        i.invoice_number,
        i.status AS invoice_status,
        i.total_usd,
        i.local_total,
        i.currency AS invoice_currency,
        i.local_currency AS invoice_local_currency,
        i.period_end,
        i.metadata AS invoice_metadata,
        s.id AS subscription_id,
        s.billing_cycle,
        s.current_period_end,
        s.metadata AS subscription_metadata,
        b.name AS plan_name,
        b.tier AS plan_tier
      FROM payment_transactions pt
      JOIN billing_accounts ba ON ba.id = pt.billing_account_id
      LEFT JOIN billing_invoices i ON i.id = pt.invoice_id
      LEFT JOIN billing_subscriptions s ON s.id = i.subscription_id
      LEFT JOIN billing_plans b ON b.id = s.plan_id
      ${whereSql}
      ORDER BY pt.processed_at DESC NULLS LAST, pt.created_at DESC
      LIMIT 1
      `,
      params
    )

    const row = result.rows[0]
    if (!row) return res.status(404).json({ message: "Checkout summary not found" })

    const subscriptionMeta =
      row.subscription_metadata && typeof row.subscription_metadata === "object" ? row.subscription_metadata : {}
    const invoiceMeta = row.invoice_metadata && typeof row.invoice_metadata === "object" ? row.invoice_metadata : {}
    const transactionMeta =
      row.transaction_metadata && typeof row.transaction_metadata === "object" ? row.transaction_metadata : {}

    const planName =
      row.plan_name || subscriptionMeta.plan_name || invoiceMeta.plan_name || transactionMeta.plan_name || null
    const billingCycle =
      row.billing_cycle ||
      subscriptionMeta.billing_cycle ||
      invoiceMeta.billing_cycle ||
      transactionMeta.billing_cycle ||
      null

    const currencyRaw =
      row.invoice_local_currency ||
      row.invoice_currency ||
      row.transaction_local_currency ||
      row.transaction_currency ||
      ""
    const currency = normalizeCurrency(currencyRaw) || "USD"

    const totalRaw = row.local_total ?? row.total_usd ?? row.amount_local ?? row.amount_usd ?? null
    const totalAmount = totalRaw === null || totalRaw === undefined || totalRaw === "" ? null : Number(totalRaw)
    const totalValue = Number.isFinite(totalAmount) ? totalAmount : null

    const nextBillingDate = row.current_period_end || row.period_end || null

    return res.json({
      ok: true,
      summary: {
        plan_name: planName,
        plan_tier: row.plan_tier ?? null,
        billing_cycle: billingCycle,
        total_amount: totalValue,
        currency,
        next_billing_date: nextBillingDate,
        transaction_id: row.transaction_id ?? null,
        transaction_status: row.transaction_status ?? null,
        invoice_id: row.invoice_id ?? null,
        invoice_number: row.invoice_number ?? null,
        invoice_status: row.invoice_status ?? null,
        processed_at: row.processed_at ?? null,
      },
    })
  } catch (e: any) {
    console.error("getMyCheckoutSummary error:", e)
    return res.status(500).json({ message: "Failed to load checkout summary", details: String(e?.message || e) })
  }
}

export async function listPaymentMethods(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const billingAccountId = toStr(req.query.billing_account_id)
    const provider = toStr(req.query.provider)
    const status = toStr(req.query.status)
    const isDefaultRaw = toStr(req.query.is_default)
    const isDefault = isDefaultRaw ? toBool(isDefaultRaw) : null

    const limit = Math.min(toInt(req.query.limit, 50) ?? 50, 200)
    const offset = toInt(req.query.offset, 0) ?? 0

    const where: string[] = []
    const params: any[] = []

    if (billingAccountId) {
      where.push(`pm.billing_account_id = $${params.length + 1}`)
      params.push(billingAccountId)
    }
    if (provider) {
      where.push(`pm.provider = $${params.length + 1}`)
      params.push(provider)
    }
    if (status) {
      where.push(`pm.status = $${params.length + 1}`)
      params.push(status)
    }
    if (isDefault !== null) {
      where.push(`pm.is_default = $${params.length + 1}`)
      params.push(isDefault)
    }
    if (q) {
      where.push(
        `(
          pm.provider_payment_method_id ILIKE $${params.length + 1}
          OR pm.provider_customer_id ILIKE $${params.length + 1}
          OR pm.card_last4 ILIKE $${params.length + 1}
          OR ba.tenant_id::text ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM payment_methods pm
      JOIN billing_accounts ba ON ba.id = pm.billing_account_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        pm.*,
        ba.tenant_id,
        ba.billing_email
      FROM payment_methods pm
      JOIN billing_accounts ba ON ba.id = pm.billing_account_id
      ${whereSql}
      ORDER BY pm.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)
    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
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
    console.error("listPaymentMethods error:", e)
    return res.status(500).json({ message: "Failed to list payment methods", details: String(e?.message || e) })
  }
}

export async function createPaymentMethod(req: Request, res: Response) {
  try {
    const billingAccountId = toStr(req.body?.billing_account_id)
    const provider = toStr(req.body?.provider)
    const type = toStr(req.body?.type) || "card"
    const providerCustomerId = typeof req.body?.provider_customer_id === "string" ? req.body.provider_customer_id : null
    const providerPaymentMethodId = toStr(req.body?.provider_payment_method_id)
    const cardBrand = typeof req.body?.card_brand === "string" ? req.body.card_brand : null
    const cardLast4 = typeof req.body?.card_last4 === "string" ? req.body.card_last4 : null
    const cardExpMonthRaw = req.body?.card_exp_month
    const cardExpYearRaw = req.body?.card_exp_year
    const cardExpMonth =
      cardExpMonthRaw === null || cardExpMonthRaw === undefined || cardExpMonthRaw === "" ? null : Number(cardExpMonthRaw)
    const cardExpYear =
      cardExpYearRaw === null || cardExpYearRaw === undefined || cardExpYearRaw === "" ? null : Number(cardExpYearRaw)
    const isDefault = toBool(req.body?.is_default)
    const status = toStr(req.body?.status) || "active"
    const metadataInput = req.body?.metadata
    const metadataValue =
      metadataInput && typeof metadataInput === "object" ? metadataInput : metadataInput ? null : {}

    if (!billingAccountId) return res.status(400).json({ message: "billing_account_id is required" })
    if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
    if (!PAYMENT_METHOD_TYPES.has(type)) return res.status(400).json({ message: "invalid type" })
    if (!PAYMENT_METHOD_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
    if (cardExpMonth !== null && (!Number.isFinite(cardExpMonth) || cardExpMonth < 1 || cardExpMonth > 12)) {
      return res.status(400).json({ message: "card_exp_month must be 1-12" })
    }
    if (cardExpYear !== null && (!Number.isFinite(cardExpYear) || cardExpYear < 2000)) {
      return res.status(400).json({ message: "card_exp_year must be >= 2000" })
    }
    if (metadataValue === null) return res.status(400).json({ message: "metadata must be object" })

    const result = await query(
      `
      INSERT INTO payment_methods
        (billing_account_id, provider, type, provider_customer_id, provider_payment_method_id,
         card_brand, card_last4, card_exp_month, card_exp_year, is_default, status, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      RETURNING *
      `,
      [
        billingAccountId,
        provider,
        type,
        providerCustomerId,
        providerPaymentMethodId,
        cardBrand,
        cardLast4,
        cardExpMonth,
        cardExpYear,
        isDefault === null ? false : isDefault,
        status,
        JSON.stringify(metadataValue || {}),
      ]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Payment method already exists", details: String(e?.detail || "") })
    }
    console.error("createPaymentMethod error:", e)
    return res.status(500).json({ message: "Failed to create payment method", details: String(e?.message || e) })
  }
}

export async function updatePaymentMethod(req: Request, res: Response) {
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

    if (input.billing_account_id !== undefined) {
      const billingAccountId = toStr(input.billing_account_id)
      if (!billingAccountId) return res.status(400).json({ message: "billing_account_id must be non-empty" })
      setField("billing_account_id", billingAccountId)
    }
    if (input.provider !== undefined) {
      const provider = toStr(input.provider)
      if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
      setField("provider", provider)
    }
    if (input.type !== undefined) {
      const type = toStr(input.type)
      if (!PAYMENT_METHOD_TYPES.has(type)) return res.status(400).json({ message: "invalid type" })
      setField("type", type)
    }
    if (input.provider_customer_id !== undefined) {
      const providerCustomerId = typeof input.provider_customer_id === "string" ? input.provider_customer_id : null
      setField("provider_customer_id", providerCustomerId)
    }
    if (input.provider_payment_method_id !== undefined) {
      const providerPaymentMethodId = toStr(input.provider_payment_method_id)
      if (!providerPaymentMethodId) {
        return res.status(400).json({ message: "provider_payment_method_id must be non-empty" })
      }
      setField("provider_payment_method_id", providerPaymentMethodId)
    }
    if (input.card_brand !== undefined) {
      const cardBrand = typeof input.card_brand === "string" ? input.card_brand : null
      setField("card_brand", cardBrand)
    }
    if (input.card_last4 !== undefined) {
      const cardLast4 = typeof input.card_last4 === "string" ? input.card_last4 : null
      setField("card_last4", cardLast4)
    }
    if (input.card_exp_month !== undefined) {
      const cardExpMonth =
        input.card_exp_month === null || input.card_exp_month === undefined || input.card_exp_month === ""
          ? null
          : Number(input.card_exp_month)
      if (cardExpMonth !== null && (!Number.isFinite(cardExpMonth) || cardExpMonth < 1 || cardExpMonth > 12)) {
        return res.status(400).json({ message: "card_exp_month must be 1-12" })
      }
      setField("card_exp_month", cardExpMonth)
    }
    if (input.card_exp_year !== undefined) {
      const cardExpYear =
        input.card_exp_year === null || input.card_exp_year === undefined || input.card_exp_year === ""
          ? null
          : Number(input.card_exp_year)
      if (cardExpYear !== null && (!Number.isFinite(cardExpYear) || cardExpYear < 2000)) {
        return res.status(400).json({ message: "card_exp_year must be >= 2000" })
      }
      setField("card_exp_year", cardExpYear)
    }
    if (input.is_default !== undefined) {
      const isDefault = toBool(input.is_default)
      if (isDefault === null) return res.status(400).json({ message: "is_default must be boolean" })
      setField("is_default", isDefault)
    }
    if (input.status !== undefined) {
      const status = toStr(input.status)
      if (!PAYMENT_METHOD_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
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
      UPDATE payment_methods
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING *
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Payment method not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Payment method already exists", details: String(e?.detail || "") })
    }
    console.error("updatePaymentMethod error:", e)
    return res.status(500).json({ message: "Failed to update payment method", details: String(e?.message || e) })
  }
}

export async function quoteTopupPurchase(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const productId = toStr(req.body?.product_id)

    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!productId) return res.status(400).json({ message: "product_id is required" })

    const productRes = await client.query(
      `SELECT id, sku_code, name, price_usd, credits, bonus_credits, currency
       FROM credit_topup_products WHERE id = $1 AND is_active = TRUE`,
      [productId]
    )
    if (productRes.rows.length === 0) return res.status(404).json({ message: "Product not found" })
    const product = productRes.rows[0]
    const baseAmount = Number(product.price_usd)

    const accountRes = await client.query(
      `SELECT currency, tax_country_code, country_code FROM billing_accounts WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    )
    const accountRow = accountRes.rows[0] || {}
    const targetCurrency = normalizeCurrency(accountRow.currency) || "USD"
    const taxCountryCode = toStr(accountRow.tax_country_code || accountRow.country_code).toUpperCase()

    let amount = roundMoney(baseAmount, targetCurrency)
    let fxRate: number | null = null
    let fxRateId: string | null = null
    if (targetCurrency !== "USD") {
      const fx = await resolveFxRate(client, "USD", targetCurrency)
      if (fx) {
        fxRate = fx.rate
        fxRateId = fx.id
        amount = roundMoney(baseAmount * fxRate, targetCurrency)
      }
    }
    const taxRateRow = taxCountryCode ? await pickLatestTaxRate(client, taxCountryCode) : null
    const taxRatePercent = taxRateRow ? Number(taxRateRow.rate_percent) : 0
    const taxAmount =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(amount * (taxRatePercent / 100), targetCurrency) : 0
    const totalAmount = roundMoney(amount + taxAmount, targetCurrency)

    return res.json({
      ok: true,
      product_id: product.id,
      sku_code: product.sku_code,
      product_name: product.name,
      credits: Number(product.credits),
      bonus_credits: Number(product.bonus_credits),
      total_credits: Number(product.credits),
      currency: targetCurrency,
      amount,
      base_currency: "USD",
      base_amount: baseAmount,
      fx_rate: fxRate,
      tax_rate_percent: taxRatePercent,
      tax_amount: taxAmount,
      total_amount: totalAmount,
    })
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json({ message: e?.message })
    console.error("quoteTopupPurchase error:", e)
    return res.status(500).json({ message: "Failed to quote topup purchase" })
  } finally {
    client.release()
  }
}

export async function checkoutTopupPurchase(req: Request, res: Response) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const productId = toStr(req.body?.product_id)
    const provider = toStr(req.body?.provider) || "toss"
    const paymentMethodIdInput = toStr(req.body?.payment_method_id) || null
    const refundPolicyConsent = toBool(req.body?.refund_policy_consent)

    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!productId) return res.status(400).json({ message: "product_id is required" })
    if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
    if (!refundPolicyConsent) return res.status(400).json({ message: "Refund policy consent is required" })

    const productRes = await client.query(
      `SELECT id, sku_code, name, price_usd, credits, bonus_credits, currency
       FROM credit_topup_products WHERE id = $1 AND is_active = TRUE`,
      [productId]
    )
    if (productRes.rows.length === 0) return res.status(404).json({ message: "Product not found" })
    const product = productRes.rows[0]
    const baseAmount = Number(product.price_usd)
    const totalCredits = Number(product.credits)

    const accountRes = await client.query(
      `SELECT currency, tax_country_code, country_code FROM billing_accounts WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    )
    const accountRow = accountRes.rows[0] || {}
    const targetCurrency = normalizeCurrency(accountRow.currency) || "USD"
    const taxCountryCode = toStr(accountRow.tax_country_code || accountRow.country_code).toUpperCase()

    let amount = roundMoney(baseAmount, targetCurrency)
    let fxRate: number | null = null
    let fxRateId: string | null = null
    if (targetCurrency !== "USD") {
      const fx = await resolveFxRate(client, "USD", targetCurrency)
      if (fx) {
        fxRate = fx.rate
        fxRateId = fx.id
        amount = roundMoney(baseAmount * fxRate, targetCurrency)
      }
    }

    const taxRateRow = taxCountryCode ? await pickLatestTaxRate(client, taxCountryCode) : null
    const taxRatePercent = taxRateRow ? Number(taxRateRow.rate_percent) : 0
    const taxAmount =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(amount * (taxRatePercent / 100), targetCurrency) : 0
    const totalAmount = roundMoney(amount + taxAmount, targetCurrency)

    const taxAmountUsd =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(baseAmount * (taxRatePercent / 100), "USD") : 0
    const totalAmountUsd = roundMoney(baseAmount + taxAmountUsd, "USD")

    const now = new Date()
    const nowIso = now.toISOString()

    await client.query("BEGIN")
    transactionStarted = true

    let billingAccountId: string | null = null
    const billingAccountRes = await client.query(`SELECT id FROM billing_accounts WHERE tenant_id = $1`, [tenantId])
    billingAccountId = billingAccountRes.rows[0]?.id ?? null
    if (!billingAccountId) {
      const createAccountRes = await client.query(
        `INSERT INTO billing_accounts (tenant_id, currency, metadata)
         VALUES ($1,$2,$3::jsonb) RETURNING id`,
        [tenantId, targetCurrency, JSON.stringify({ source: "topup_checkout", created_by: authed.userId })]
      )
      billingAccountId = createAccountRes.rows[0]?.id
    }
    if (!billingAccountId) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(500).json({ message: "Failed to resolve billing account" })
    }
    const paymentMethodId = await resolvePaymentMethodId(client, billingAccountId, paymentMethodIdInput)

    const topupMeta = {
      source: "topup_checkout",
      product_id: productId,
      sku_code: product.sku_code,
      product_name: product.name,
      credits: Number(product.credits),
      bonus_credits: Number(product.bonus_credits),
      total_credits: totalCredits,
      checked_out_by: authed.userId,
      checked_out_at: nowIso,
    }

    const invoiceColumns = await loadInvoiceColumns(client)
    const invoiceCols: string[] = []
    const invoiceVals: any[] = []
    const invoicePlaceholders: string[] = []
    const addInvoiceCol = (name: string, value: any, cast?: string) => {
      if (!invoiceColumns.has(name)) return
      invoiceCols.push(name)
      invoiceVals.push(value)
      invoicePlaceholders.push(cast ? `$${invoiceVals.length}::${cast}` : `$${invoiceVals.length}`)
    }

    addInvoiceCol("tenant_id", tenantId)
    addInvoiceCol("billing_account_id", billingAccountId)
    addInvoiceCol("invoice_number", makeInvoiceNumber("TOP"))
    addInvoiceCol("status", "paid")
    addInvoiceCol("currency", "USD")
    addInvoiceCol("subtotal_usd", baseAmount)
    addInvoiceCol("total_usd", totalAmountUsd)
    addInvoiceCol("issue_date", nowIso)
    addInvoiceCol("paid_at", nowIso)
    addInvoiceCol("metadata", JSON.stringify(topupMeta), "jsonb")
    if (invoiceColumns.has("tax_usd")) addInvoiceCol("tax_usd", taxAmountUsd)
    if (invoiceColumns.has("tax_rate_id")) addInvoiceCol("tax_rate_id", taxRateRow?.id ?? null)
    if (invoiceColumns.has("fx_rate_id")) addInvoiceCol("fx_rate_id", fxRateId ?? null)
    if (invoiceColumns.has("exchange_rate")) addInvoiceCol("exchange_rate", fxRate ?? null)
    if (invoiceColumns.has("discount_usd")) addInvoiceCol("discount_usd", 0)
    if (invoiceColumns.has("period_start")) addInvoiceCol("period_start", nowIso)
    if (invoiceColumns.has("period_end")) addInvoiceCol("period_end", nowIso)
    if (invoiceColumns.has("local_currency")) addInvoiceCol("local_currency", targetCurrency)
    if (invoiceColumns.has("local_subtotal")) addInvoiceCol("local_subtotal", amount)
    if (invoiceColumns.has("local_tax")) addInvoiceCol("local_tax", taxAmount)
    if (invoiceColumns.has("local_discount")) addInvoiceCol("local_discount", 0)
    if (invoiceColumns.has("local_total")) addInvoiceCol("local_total", totalAmount)

    const invoiceInsertRes = await client.query(
      `INSERT INTO billing_invoices (${invoiceCols.join(", ")})
       VALUES (${invoicePlaceholders.join(", ")}) RETURNING *`,
      invoiceVals
    )
    const invoiceRow = invoiceInsertRes.rows[0]
    if (!invoiceRow) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(500).json({ message: "Failed to create invoice" })
    }

    await client.query(
      `INSERT INTO invoice_line_items
        (invoice_id, line_type, description, quantity, unit_price_usd, amount_usd, currency, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [invoiceRow.id, "topup", product.name, 1, baseAmount, baseAmount, "USD", JSON.stringify(topupMeta)]
    )

    const txRes = await client.query(
      `INSERT INTO payment_transactions
        (invoice_id, billing_account_id, provider, transaction_type, status,
         amount_usd, currency, amount_local, local_currency,
         payment_method_id, processed_at, provider_transaction_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
      [invoiceRow.id, billingAccountId, provider, "charge", "succeeded", totalAmountUsd, "USD", totalAmount, targetCurrency, paymentMethodId, nowIso, makeInvoiceNumber("TOP-TX"), JSON.stringify(topupMeta)]
    )
    const txRow = txRes.rows[0]

    const topupAccountRes = await client.query(
      `SELECT id, balance_credits FROM credit_accounts
       WHERE owner_type = 'tenant' AND owner_tenant_id = $1 AND credit_type = 'topup'
       FOR UPDATE`,
      [tenantId]
    )

    let topupAccountId = topupAccountRes.rows[0]?.id as string | undefined
    let balanceBefore = Number(topupAccountRes.rows[0]?.balance_credits ?? 0)

    const expiryMonths = 36
    const expiresAt = new Date(now)
    expiresAt.setMonth(expiresAt.getMonth() + expiryMonths)
    const expiresAtIso = expiresAt.toISOString()

    if (!topupAccountId) {
      const insertAccountRes = await client.query(
        `INSERT INTO credit_accounts
          (owner_type, owner_tenant_id, credit_type, status, balance_credits, reserved_credits, expires_at, metadata)
         VALUES ('tenant', $1, 'topup', 'active', 0, 0, $2, $3::jsonb)
         RETURNING id, balance_credits`,
        [tenantId, expiresAtIso, JSON.stringify({ source: "topup_purchase" })]
      )
      topupAccountId = insertAccountRes.rows[0]?.id
      balanceBefore = 0
    }

    const balanceAfter = balanceBefore + totalCredits

    await client.query(
      `UPDATE credit_accounts
       SET balance_credits = $1, expires_at = $2, status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [balanceAfter, expiresAtIso, topupAccountId]
    )

    await client.query(
      `INSERT INTO credit_ledger_entries
        (account_id, entry_type, amount_credits, balance_after, payment_transaction_id, invoice_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        topupAccountId,
        "topup_purchase",
        totalCredits,
        balanceAfter,
        txRow?.id ?? null,
        invoiceRow.id,
        JSON.stringify({
          product_id: productId,
          sku_code: product.sku_code,
          credits: Number(product.credits),
          bonus_credits: Number(product.bonus_credits),
        }),
      ]
    )

    await insertRefundPolicyConsent(client, toStr(authed.userId), "topup_checkout", txRow?.id || null, req)

    await client.query("COMMIT")
    transactionStarted = false

    return res.json({
      ok: true,
      invoice: invoiceRow,
      transaction: txRow,
      total_amount: totalAmount,
      tax_amount: taxAmount,
      currency: targetCurrency,
      credits_granted: totalCredits,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      transaction_id: txRow?.id,
    })
  } catch (e: any) {
    if (transactionStarted) await client.query("ROLLBACK")
    console.error("checkoutTopupPurchase error:", e)
    return res.status(500).json({ message: "Failed to checkout topup purchase", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function quoteSeatAddonPurchase(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const quantity = toInt(req.body?.quantity, null)

    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!quantity || quantity <= 0) return res.status(400).json({ message: "quantity must be positive" })

    const subscription = await loadCurrentSubscription(client, tenantId)
    if (!subscription?.plan_id) return res.status(404).json({ message: "Subscription not found" })
    const plan = await loadPlan(client, String(subscription.plan_id))
    if (!plan) return res.status(404).json({ message: "Billing plan not found" })

    const unitPriceUsd = Number(plan.extra_seat_price_usd ?? 0)
    const baseAmount = roundMoney(unitPriceUsd * quantity, "USD")

    const accountRes = await client.query(
      `SELECT currency, tax_country_code, country_code FROM billing_accounts WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    )
    const accountRow = accountRes.rows[0] || {}
    const targetCurrency = normalizeCurrency(accountRow.currency) || "USD"
    const taxCountryCode = toStr(accountRow.tax_country_code || accountRow.country_code).toUpperCase()

    let amount = roundMoney(baseAmount, targetCurrency)
    let fxRate: number | null = null
    if (targetCurrency !== "USD") {
      const fx = await resolveFxRate(client, "USD", targetCurrency)
      if (fx) {
        fxRate = fx.rate
        amount = roundMoney(baseAmount * fxRate, targetCurrency)
      }
    }
    const unitPriceLocal = roundMoney(amount / quantity, targetCurrency)

    const taxRateRow = taxCountryCode ? await pickLatestTaxRate(client, taxCountryCode) : null
    const taxRatePercent = taxRateRow ? Number(taxRateRow.rate_percent) : 0
    const taxAmount =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(amount * (taxRatePercent / 100), targetCurrency) : 0
    const totalAmount = roundMoney(amount + taxAmount, targetCurrency)

    const tenantRes = await client.query(`SELECT member_limit FROM tenants WHERE id = $1`, [tenantId])
    const memberLimitRaw = tenantRes.rows[0]?.member_limit
    const includedSeats = Number(plan.included_seats ?? 0)
    const maxSeats = plan.max_seats === null || plan.max_seats === undefined ? null : Number(plan.max_seats)
    const currentSeats =
      typeof memberLimitRaw === "number" && Number.isFinite(memberLimitRaw) ? Math.floor(memberLimitRaw) : includedSeats
    const maxExpandableSeats = maxSeats !== null ? Math.max(0, maxSeats - currentSeats) : null
    if (maxExpandableSeats !== null && quantity > maxExpandableSeats) {
      return res.status(400).json({ message: "quantity exceeds max expandable seats" })
    }

    return res.json({
      ok: true,
      quantity,
      unit_price_usd: unitPriceUsd,
      unit_price_local: unitPriceLocal,
      currency: targetCurrency,
      amount,
      base_currency: "USD",
      base_amount: baseAmount,
      fx_rate: fxRate,
      tax_rate_percent: taxRatePercent,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      current_seats: currentSeats,
      max_seats: maxSeats,
      max_expandable_seats: maxExpandableSeats,
    })
  } catch (e: any) {
    console.error("quoteSeatAddonPurchase error:", e)
    return res.status(500).json({ message: "Failed to quote seat addon purchase", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function checkoutSeatAddonPurchase(req: Request, res: Response) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const quantity = toInt(req.body?.quantity, null)
    const provider = toStr(req.body?.provider) || "toss"
    const paymentMethodIdInput = toStr(req.body?.payment_method_id) || null
    const refundPolicyConsent = toBool(req.body?.refund_policy_consent)

    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!quantity || quantity <= 0) return res.status(400).json({ message: "quantity must be positive" })
    if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
    if (!refundPolicyConsent) return res.status(400).json({ message: "Refund policy consent is required" })

    const subscription = await loadCurrentSubscription(client, tenantId)
    if (!subscription?.plan_id) return res.status(404).json({ message: "Subscription not found" })
    const plan = await loadPlan(client, String(subscription.plan_id))
    if (!plan) return res.status(404).json({ message: "Billing plan not found" })

    const unitPriceUsd = Number(plan.extra_seat_price_usd ?? 0)
    const baseAmount = roundMoney(unitPriceUsd * quantity, "USD")

    const accountRes = await client.query(
      `SELECT currency, tax_country_code, country_code FROM billing_accounts WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    )
    const accountRow = accountRes.rows[0] || {}
    const targetCurrency = normalizeCurrency(accountRow.currency) || "USD"
    const taxCountryCode = toStr(accountRow.tax_country_code || accountRow.country_code).toUpperCase()

    let amount = roundMoney(baseAmount, targetCurrency)
    let fxRate: number | null = null
    let fxRateId: string | null = null
    if (targetCurrency !== "USD") {
      const fx = await resolveFxRate(client, "USD", targetCurrency)
      if (fx) {
        fxRate = fx.rate
        fxRateId = fx.id
        amount = roundMoney(baseAmount * fxRate, targetCurrency)
      }
    }

    const unitPriceLocal = fxRate != null ? roundMoney(unitPriceUsd * fxRate, targetCurrency) : unitPriceUsd

    const taxRateRow = taxCountryCode ? await pickLatestTaxRate(client, taxCountryCode) : null
    const taxRatePercent = taxRateRow ? Number(taxRateRow.rate_percent) : 0
    const taxAmount =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(amount * (taxRatePercent / 100), targetCurrency) : 0
    const totalAmount = roundMoney(amount + taxAmount, targetCurrency)

    const taxAmountUsd =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(baseAmount * (taxRatePercent / 100), "USD") : 0
    const totalAmountUsd = roundMoney(baseAmount + taxAmountUsd, "USD")

    const tenantRes = await client.query(`SELECT member_limit FROM tenants WHERE id = $1`, [tenantId])
    const memberLimitRaw = tenantRes.rows[0]?.member_limit
    const includedSeats = Number(plan.included_seats ?? 0)
    const maxSeats = plan.max_seats === null || plan.max_seats === undefined ? null : Number(plan.max_seats)
    const currentSeats =
      typeof memberLimitRaw === "number" && Number.isFinite(memberLimitRaw) ? Math.floor(memberLimitRaw) : includedSeats
    const newMemberLimit = currentSeats + quantity
    if (maxSeats !== null && newMemberLimit > maxSeats) {
      return res.status(400).json({ message: "quantity exceeds max seats" })
    }

    const now = new Date()
    const nowIso = now.toISOString()

    await client.query("BEGIN")
    transactionStarted = true

    let billingAccountId: string | null = null
    const billingAccountRes = await client.query(`SELECT id FROM billing_accounts WHERE tenant_id = $1`, [tenantId])
    billingAccountId = billingAccountRes.rows[0]?.id ?? null
    if (!billingAccountId) {
      const createAccountRes = await client.query(
        `INSERT INTO billing_accounts (tenant_id, currency, metadata)
         VALUES ($1,$2,$3::jsonb) RETURNING id`,
        [tenantId, targetCurrency, JSON.stringify({ source: "seat_addon_checkout", created_by: authed.userId })]
      )
      billingAccountId = createAccountRes.rows[0]?.id
    }
    if (!billingAccountId) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(500).json({ message: "Failed to resolve billing account" })
    }
    const paymentMethodId = await resolvePaymentMethodId(client, billingAccountId, paymentMethodIdInput)

    const addonMeta = {
      source: "seat_addon_checkout",
      subscription_id: subscription.id,
      plan_id: subscription.plan_id,
      quantity,
      unit_price_usd: unitPriceUsd,
      unit_price_local: unitPriceLocal,
      fx_rate: fxRate,
      base_currency: "USD",
      local_currency: targetCurrency,
      checked_out_by: authed.userId,
      checked_out_at: nowIso,
    }

    const invoiceColumns = await loadInvoiceColumns(client)
    const invoiceCols: string[] = []
    const invoiceVals: any[] = []
    const invoicePlaceholders: string[] = []
    const addInvoiceCol = (name: string, value: any, cast?: string) => {
      if (!invoiceColumns.has(name)) return
      invoiceCols.push(name)
      invoiceVals.push(value)
      invoicePlaceholders.push(cast ? `$${invoiceVals.length}::${cast}` : `$${invoiceVals.length}`)
    }

    addInvoiceCol("tenant_id", tenantId)
    addInvoiceCol("subscription_id", subscription.id)
    addInvoiceCol("billing_account_id", billingAccountId)
    addInvoiceCol("invoice_number", makeInvoiceNumber("SEAT"))
    addInvoiceCol("status", "paid")
    addInvoiceCol("currency", "USD")
    addInvoiceCol("subtotal_usd", baseAmount)
    addInvoiceCol("total_usd", totalAmountUsd)
    addInvoiceCol("issue_date", nowIso)
    addInvoiceCol("paid_at", nowIso)
    addInvoiceCol("metadata", JSON.stringify(addonMeta), "jsonb")
    if (invoiceColumns.has("tax_usd")) addInvoiceCol("tax_usd", taxAmountUsd)
    if (invoiceColumns.has("tax_rate_id")) addInvoiceCol("tax_rate_id", taxRateRow?.id ?? null)
    if (invoiceColumns.has("fx_rate_id")) addInvoiceCol("fx_rate_id", fxRateId ?? null)
    if (invoiceColumns.has("exchange_rate")) addInvoiceCol("exchange_rate", fxRate ?? null)
    if (invoiceColumns.has("discount_usd")) addInvoiceCol("discount_usd", 0)
    if (invoiceColumns.has("period_start")) addInvoiceCol("period_start", nowIso)
    if (invoiceColumns.has("period_end")) addInvoiceCol("period_end", nowIso)
    if (invoiceColumns.has("local_currency")) addInvoiceCol("local_currency", targetCurrency)
    if (invoiceColumns.has("local_subtotal")) addInvoiceCol("local_subtotal", amount)
    if (invoiceColumns.has("local_tax")) addInvoiceCol("local_tax", taxAmount)
    if (invoiceColumns.has("local_discount")) addInvoiceCol("local_discount", 0)
    if (invoiceColumns.has("local_total")) addInvoiceCol("local_total", totalAmount)

    const invoiceInsertRes = await client.query(
      `INSERT INTO billing_invoices (${invoiceCols.join(", ")})
       VALUES (${invoicePlaceholders.join(", ")}) RETURNING *`,
      invoiceVals
    )
    const invoiceRow = invoiceInsertRes.rows[0]
    if (!invoiceRow) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(500).json({ message: "Failed to create invoice" })
    }

    await client.query(
      `INSERT INTO invoice_line_items
        (invoice_id, line_type, description, quantity, unit_price_usd, amount_usd, currency, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        invoiceRow.id,
        "seat_overage",
        "좌석 추가",
        quantity,
        unitPriceUsd,
        baseAmount,
        "USD",
        JSON.stringify(addonMeta),
      ]
    )

    const txRes = await client.query(
      `INSERT INTO payment_transactions
        (invoice_id, billing_account_id, provider, transaction_type, status,
         amount_usd, currency, amount_local, local_currency,
         payment_method_id, processed_at, provider_transaction_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
      [
        invoiceRow.id,
        billingAccountId,
        provider,
        "charge",
        "succeeded",
        totalAmountUsd,
        "USD",
        totalAmount,
        targetCurrency,
        paymentMethodId,
        nowIso,
        makeInvoiceNumber("SEAT-TX"),
        JSON.stringify(addonMeta),
      ]
    )
    const txRow = txRes.rows[0]

    await client.query(
      `INSERT INTO billing_subscription_seat_addons
        (subscription_id, tenant_id, quantity, status, effective_at, unit_price_usd, unit_price_local, fx_rate, currency, local_currency, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [
        subscription.id,
        tenantId,
        quantity,
        "active",
        nowIso,
        unitPriceUsd,
        unitPriceLocal,
        fxRate,
        "USD",
        targetCurrency,
        JSON.stringify(addonMeta),
      ]
    )

    await client.query(
      `UPDATE tenants SET member_limit = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL`,
      [newMemberLimit, tenantId]
    )

    await insertRefundPolicyConsent(client, toStr(authed.userId), "seat_addon_checkout", txRow?.id || null, req)

    await client.query("COMMIT")
    transactionStarted = false

    return res.json({
      ok: true,
      quantity,
      unit_price_usd: unitPriceUsd,
      unit_price_local: unitPriceLocal,
      fx_rate: fxRate,
      total_amount: totalAmount,
      tax_amount: taxAmount,
      currency: targetCurrency,
      new_member_limit: newMemberLimit,
      transaction_id: txRow?.id,
    })
  } catch (e: any) {
    if (transactionStarted) await client.query("ROLLBACK")
    console.error("checkoutSeatAddonPurchase error:", e)
    return res.status(500).json({ message: "Failed to checkout seat addon purchase", details: String(e?.message || e) })
  } finally {
    client.release()
  }
}

export async function getMySubscriptionOverview(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const subscription = await loadCurrentSubscription(client, tenantId)

    let scheduledChanges: any[] = []
    if (subscription?.id) {
      const changesRes = await client.query(
        `
        SELECT sc.*, fp.name AS from_plan_name, fp.tier AS from_plan_tier,
               tp.name AS to_plan_name, tp.tier AS to_plan_tier
        FROM billing_subscription_changes sc
        LEFT JOIN billing_plans fp ON fp.id = sc.from_plan_id
        LEFT JOIN billing_plans tp ON tp.id = sc.to_plan_id
        WHERE sc.subscription_id = $1 AND sc.status = 'scheduled'
        ORDER BY sc.effective_at ASC
        `,
        [subscription.id]
      )
      scheduledChanges = changesRes.rows
    }

    let seatAddons: any[] = []
    if (subscription?.id) {
      const addonsRes = await client.query(
        `
        SELECT id, subscription_id, tenant_id, quantity, status, effective_at,
               cancel_at_period_end, cancelled_at, unit_price_usd, unit_price_local, fx_rate, currency, metadata, created_at
        FROM billing_subscription_seat_addons
        WHERE subscription_id = $1 AND tenant_id = $2 AND status <> 'cancelled'
        ORDER BY effective_at ASC
        `,
        [subscription.id, tenantId]
      )
      seatAddons = addonsRes.rows
    }

    const totalAddonSeats = seatAddons.reduce(
      (sum: number, a: any) => sum + (a.status === "active" ? Number(a.quantity ?? 0) : 0),
      0
    )
    const totalAddonMonthlyUsd = seatAddons.reduce((sum: number, a: any) => {
      if (a.status !== "active") return sum
      const qty = Number(a.quantity ?? 0)
      const local =
        typeof a.unit_price_local === "number"
          ? Number(a.unit_price_local)
          : typeof a.fx_rate === "number"
            ? Number(a.unit_price_usd ?? 0) * Number(a.fx_rate)
            : Number(a.unit_price_usd ?? 0)
      return sum + qty * local
    }, 0)

    return res.json({
      ok: true,
      subscription: subscription || null,
      scheduled_changes: scheduledChanges,
      seat_addons: seatAddons,
      seat_summary: {
        total_addon_seats: totalAddonSeats,
        total_addon_monthly_usd: roundMoney(totalAddonMonthlyUsd, "USD"),
      },
    })
  } catch (e: any) {
    console.error("getMySubscriptionOverview error:", e)
    return res.status(500).json({ message: "Failed to load subscription overview" })
  } finally {
    client.release()
  }
}

export async function cancelMySeatAddon(req: Request, res: Response) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const addonId = toStr(req.body?.addon_id || req.params?.id)

    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!addonId) return res.status(400).json({ message: "addon_id is required" })

    await client.query("BEGIN")
    transactionStarted = true

    const addonRes = await client.query(
      `SELECT * FROM billing_subscription_seat_addons
       WHERE id = $1 AND tenant_id = $2 AND status = 'active'
       FOR UPDATE`,
      [addonId, tenantId]
    )
    if (addonRes.rows.length === 0) {
      await client.query("ROLLBACK")
      transactionStarted = false
      return res.status(404).json({ message: "Seat addon not found or already cancelled" })
    }

    await client.query(
      `UPDATE billing_subscription_seat_addons
       SET status = 'scheduled_cancel',
           cancel_at_period_end = TRUE,
           metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cancelled_by}', to_jsonb($1::text), TRUE),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [authed.userId, addonId]
    )

    await client.query("COMMIT")
    transactionStarted = false

    return res.json({ ok: true, addon_id: addonId, status: "scheduled_cancel" })
  } catch (e: any) {
    if (transactionStarted) await client.query("ROLLBACK")
    console.error("cancelMySeatAddon error:", e)
    return res.status(500).json({ message: "Failed to cancel seat addon" })
  } finally {
    client.release()
  }
}

export async function listMyInvoices(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })

    const limit = Math.min(toInt(req.query.limit, 10) ?? 10, 50)
    const offset = toInt(req.query.offset, 0) ?? 0

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM billing_invoices WHERE tenant_id = $1`,
      [tenantId]
    )

    const listRes = await client.query(
      `
      SELECT
        i.id, i.invoice_number, i.status, i.currency,
        i.subtotal_usd, i.tax_usd, i.discount_usd, i.total_usd,
        i.exchange_rate, i.local_currency, i.local_subtotal, i.local_tax, i.local_total,
        i.period_start, i.period_end, i.issue_date, i.due_date, i.paid_at,
        b.name AS plan_name, b.tier AS plan_tier,
        s.billing_cycle,
        (SELECT li.line_type FROM invoice_line_items li WHERE li.invoice_id = i.id ORDER BY li.amount_usd DESC, li.created_at LIMIT 1) AS primary_line_type,
        (SELECT li.description FROM invoice_line_items li WHERE li.invoice_id = i.id ORDER BY li.amount_usd DESC, li.created_at LIMIT 1) AS primary_description
      FROM billing_invoices i
      LEFT JOIN billing_subscriptions s ON s.id = i.subscription_id
      LEFT JOIN billing_plans b ON b.id = s.plan_id
      WHERE i.tenant_id = $1
      ORDER BY i.issue_date DESC NULLS LAST, i.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [tenantId, limit, offset]
    )

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    })
  } catch (e: any) {
    console.error("listMyInvoices error:", e)
    return res.status(500).json({ message: "Failed to list invoices" })
  } finally {
    client.release()
  }
}

export async function getMyInvoiceDetail(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const authed = req as AuthedRequest
    const tenantId = toStr(authed.tenantId)
    const invoiceId = toStr(req.params.id)
    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!invoiceId) return res.status(400).json({ message: "invoice id is required" })

    const invoiceRes = await client.query(
      `
      SELECT
        i.id, i.invoice_number, i.status, i.currency,
        i.subtotal_usd, i.tax_usd, i.discount_usd, i.total_usd,
        i.exchange_rate, i.local_currency, i.local_subtotal, i.local_tax, i.local_total,
        i.period_start, i.period_end, i.issue_date, i.due_date, i.paid_at,
        b.name AS plan_name, b.tier AS plan_tier,
        s.billing_cycle
      FROM billing_invoices i
      LEFT JOIN billing_subscriptions s ON s.id = i.subscription_id
      LEFT JOIN billing_plans b ON b.id = s.plan_id
      WHERE i.id = $1 AND i.tenant_id = $2
      `,
      [invoiceId, tenantId]
    )

    if (invoiceRes.rows.length === 0) {
      return res.status(404).json({ message: "Invoice not found" })
    }

    const invoice = invoiceRes.rows[0]

    const lineItemsRes = await client.query(
      `
      SELECT id, line_type, description, quantity, unit_price_usd, amount_usd, currency, metadata
      FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY created_at ASC
      `,
      [invoiceId]
    )

    return res.json({
      ok: true,
      invoice,
      line_items: lineItemsRes.rows,
    })
  } catch (e: any) {
    console.error("getMyInvoiceDetail error:", e)
    return res.status(500).json({ message: "Failed to load invoice detail" })
  } finally {
    client.release()
  }
}
