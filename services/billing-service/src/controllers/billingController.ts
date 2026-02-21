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

  let priceRow = await pickLatestPlanPrice(client, planId, billingCycle, targetCurrency)
  let baseCurrency = targetCurrency
  let baseAmount = 0
  let amount = 0
  let fxRate: number | null = null
  let fxRateId: string | null = null
  let fxEffectiveAt: string | null = null

  if (priceRow) {
    const rawAmount = priceRow.price_usd
    baseAmount = rawAmount === null || rawAmount === undefined || rawAmount === "" ? 0 : Number(rawAmount)
    if (!Number.isFinite(baseAmount) || baseAmount < 0) {
      throw quoteError(400, "price_usd must be >= 0")
    }
    amount = roundMoney(baseAmount, targetCurrency)
  } else {
    const usdRow = await pickLatestPlanPrice(client, planId, billingCycle, "USD")
    if (!usdRow) throw quoteError(404, "Billing plan price not found")
    priceRow = usdRow
    baseCurrency = "USD"
    const rawAmount = usdRow.price_usd
    baseAmount = rawAmount === null || rawAmount === undefined || rawAmount === "" ? 0 : Number(rawAmount)
    if (!Number.isFinite(baseAmount) || baseAmount < 0) {
      throw quoteError(400, "price_usd must be >= 0")
    }
    if (targetCurrency === "USD") {
      amount = roundMoney(baseAmount, targetCurrency)
    } else {
      const fx = await resolveFxRate(client, "USD", targetCurrency)
      if (!fx) throw quoteError(404, "FX rate not found")
      fxRate = fx.rate
      fxRateId = fx.id
      fxEffectiveAt = fx.effective_at ?? null
      amount = roundMoney(baseAmount * fxRate, targetCurrency)
    }
  }

  const taxRateRow = taxCountryCode ? await pickLatestTaxRate(client, taxCountryCode) : null
  const taxRatePercent = taxRateRow ? Number(taxRateRow.rate_percent) : 0
  const taxAmount =
    Number.isFinite(taxRatePercent) && taxRatePercent > 0 ? roundMoney(amount * (taxRatePercent / 100), targetCurrency) : 0
  const totalAmount = roundMoney(amount + taxAmount, targetCurrency)

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
    price_id: priceRow?.id ?? null,
    price_currency: priceRow?.currency ?? baseCurrency,
  }
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

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
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

    const planRes = await client.query(`SELECT id, tier, tenant_type FROM billing_plans WHERE id = $1`, [planId])
    if (planRes.rows.length === 0) return res.status(404).json({ message: "Billing plan not found" })
    const planTier = String(planRes.rows[0]?.tier || "")
    const planTenantType = String(planRes.rows[0]?.tenant_type || "")

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
            currency = $9,
            metadata = $10::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
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
           cancel_at_period_end, auto_renew, price_usd, currency, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
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
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{plan_tier}', to_jsonb($2::text), TRUE),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND deleted_at IS NULL
        `,
        [planTenantType, planTier || "free", resolvedTenantId]
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
    const taxAmount =
      Number.isFinite(taxRatePercent) && taxRatePercent > 0
        ? roundMoney(priceUsd * (taxRatePercent / 100), currency)
        : 0
    const totalAmount = roundMoney(priceUsd + taxAmount, currency)

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

    addInvoiceCol("tenant_id", resolvedTenantId)
    addInvoiceCol("subscription_id", subscriptionRow.id)
    addInvoiceCol("billing_account_id", billingAccountId)
    addInvoiceCol("invoice_number", makeInvoiceNumber("SVP"))
    addInvoiceCol("status", "paid")
    addInvoiceCol("currency", currency)
    addInvoiceCol("subtotal_usd", priceUsd)
    addInvoiceCol("total_usd", totalAmount)
    addInvoiceCol("issue_date", nowIso)
    addInvoiceCol("paid_at", nowIso)
    addInvoiceCol("metadata", JSON.stringify(serviceMeta), "jsonb")
    if (invoiceColumns.has("tax_usd")) addInvoiceCol("tax_usd", taxAmount)
    if (invoiceColumns.has("tax_amount_usd")) addInvoiceCol("tax_amount_usd", taxAmount)
    if (invoiceColumns.has("tax_rate_id")) addInvoiceCol("tax_rate_id", taxRateRow?.id ?? null)
    if (invoiceColumns.has("discount_usd")) addInvoiceCol("discount_usd", 0)
    if (invoiceColumns.has("period_start")) addInvoiceCol("period_start", periodStartIso)
    if (invoiceColumns.has("period_end")) addInvoiceCol("period_end", periodEndIso)
    if (invoiceColumns.has("local_currency")) addInvoiceCol("local_currency", currency)
    if (invoiceColumns.has("local_subtotal")) addInvoiceCol("local_subtotal", priceUsd)
    if (invoiceColumns.has("local_tax")) addInvoiceCol("local_tax", taxAmount)
    if (invoiceColumns.has("local_total")) addInvoiceCol("local_total", totalAmount)

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
          invoiceCols.splice(0, invoiceCols.length)
          invoiceVals.splice(0, invoiceVals.length)
          invoicePlaceholders.splice(0, invoicePlaceholders.length)
          addInvoiceCol("tenant_id", resolvedTenantId)
          addInvoiceCol("subscription_id", subscriptionRow.id)
          addInvoiceCol("billing_account_id", billingAccountId)
          addInvoiceCol("invoice_number", makeInvoiceNumber("SVP"))
          addInvoiceCol("status", "paid")
          addInvoiceCol("currency", currency)
          addInvoiceCol("subtotal_usd", priceUsd)
          addInvoiceCol("total_usd", totalAmount)
          addInvoiceCol("issue_date", nowIso)
          addInvoiceCol("paid_at", nowIso)
          addInvoiceCol("metadata", JSON.stringify(serviceMeta), "jsonb")
          if (invoiceColumns.has("tax_usd")) addInvoiceCol("tax_usd", taxAmount)
          if (invoiceColumns.has("tax_amount_usd")) addInvoiceCol("tax_amount_usd", taxAmount)
          if (invoiceColumns.has("tax_rate_id")) addInvoiceCol("tax_rate_id", taxRateRow?.id ?? null)
          if (invoiceColumns.has("discount_usd")) addInvoiceCol("discount_usd", 0)
          if (invoiceColumns.has("period_start")) addInvoiceCol("period_start", periodStartIso)
          if (invoiceColumns.has("period_end")) addInvoiceCol("period_end", periodEndIso)
          if (invoiceColumns.has("local_currency")) addInvoiceCol("local_currency", currency)
          if (invoiceColumns.has("local_subtotal")) addInvoiceCol("local_subtotal", priceUsd)
          if (invoiceColumns.has("local_tax")) addInvoiceCol("local_tax", taxAmount)
          if (invoiceColumns.has("local_total")) addInvoiceCol("local_total", totalAmount)
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
        currency,
        JSON.stringify(serviceMeta),
      ]
    )

    await client.query(
      `
      INSERT INTO payment_transactions
        (invoice_id, billing_account_id, provider, transaction_type, status, amount_usd, currency, processed_at, provider_transaction_id, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      `,
      [
        invoiceRow.id,
        billingAccountId,
        provider,
        "adjustment",
        "succeeded",
        priceUsd,
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

    if (!tenantId) return res.status(400).json({ message: "tenantId is required" })
    if (!planId) return res.status(400).json({ message: "plan_id is required" })
    if (!BILLING_CYCLES.has(billingCycle)) return res.status(400).json({ message: "invalid billing_cycle" })
    if (!PAYMENT_PROVIDERS.has(provider)) return res.status(400).json({ message: "invalid provider" })
    if (await isSystemTenantId(client, tenantId)) {
      return res.status(400).json({ message: "system tenant cannot be billed" })
    }

    const planRes = await client.query(`SELECT id, name, tier, tenant_type FROM billing_plans WHERE id = $1`, [planId])
    if (planRes.rows.length === 0) return res.status(404).json({ message: "Billing plan not found" })
    const planTier = String(planRes.rows[0]?.tier || "")
    const planTenantType = String(planRes.rows[0]?.tenant_type || "")
    const planName = String(planRes.rows[0]?.name || "")

    const quote = await resolveUserQuote(client, tenantId, planId, billingCycle)
    const priceUsd = quote.amount
    const currency = quote.currency
    const taxRatePercent = quote.tax_rate_percent
    const taxAmount = quote.tax_amount
    const totalAmount = quote.total_amount
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
            currency = $9,
            metadata = $10::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
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
           cancel_at_period_end, auto_renew, price_usd, currency, metadata)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
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
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{plan_tier}', to_jsonb($2::text), TRUE),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND deleted_at IS NULL
        `,
        [planTenantType, planTier || "free", tenantId]
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
    addInvoiceCol("subscription_id", subscriptionRow.id)
    addInvoiceCol("billing_account_id", billingAccountId)
    addInvoiceCol("invoice_number", makeInvoiceNumber("USR"))
    addInvoiceCol("status", "paid")
    addInvoiceCol("currency", currency)
    addInvoiceCol("subtotal_usd", priceUsd)
    addInvoiceCol("total_usd", totalAmount)
    addInvoiceCol("issue_date", periodStartIso)
    addInvoiceCol("paid_at", periodStartIso)
    addInvoiceCol("metadata", JSON.stringify(subscriptionMeta), "jsonb")
    if (invoiceColumns.has("tax_usd")) addInvoiceCol("tax_usd", taxAmount)
    if (invoiceColumns.has("tax_amount_usd")) addInvoiceCol("tax_amount_usd", taxAmount)
    if (invoiceColumns.has("tax_rate_id")) addInvoiceCol("tax_rate_id", taxRateId ?? null)
    if (invoiceColumns.has("fx_rate_id")) addInvoiceCol("fx_rate_id", fxRateId ?? null)
    if (invoiceColumns.has("exchange_rate")) addInvoiceCol("exchange_rate", exchangeRate ?? null)
    if (invoiceColumns.has("discount_usd")) addInvoiceCol("discount_usd", 0)
    if (invoiceColumns.has("period_start")) addInvoiceCol("period_start", periodStartIso)
    if (invoiceColumns.has("period_end")) addInvoiceCol("period_end", periodEndIso)
    if (invoiceColumns.has("local_currency")) addInvoiceCol("local_currency", currency)
    if (invoiceColumns.has("local_subtotal")) addInvoiceCol("local_subtotal", priceUsd)
    if (invoiceColumns.has("local_tax")) addInvoiceCol("local_tax", taxAmount)
    if (invoiceColumns.has("local_total")) addInvoiceCol("local_total", totalAmount)

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
          invoiceCols.splice(0, invoiceCols.length)
          invoiceVals.splice(0, invoiceVals.length)
          invoicePlaceholders.splice(0, invoicePlaceholders.length)
          addInvoiceCol("tenant_id", tenantId)
          addInvoiceCol("subscription_id", subscriptionRow.id)
          addInvoiceCol("billing_account_id", billingAccountId)
          addInvoiceCol("invoice_number", makeInvoiceNumber("USR"))
          addInvoiceCol("status", "paid")
          addInvoiceCol("currency", currency)
          addInvoiceCol("subtotal_usd", priceUsd)
          addInvoiceCol("total_usd", totalAmount)
          addInvoiceCol("issue_date", periodStartIso)
          addInvoiceCol("paid_at", periodStartIso)
          addInvoiceCol("metadata", JSON.stringify(subscriptionMeta), "jsonb")
          if (invoiceColumns.has("tax_usd")) addInvoiceCol("tax_usd", taxAmount)
          if (invoiceColumns.has("tax_amount_usd")) addInvoiceCol("tax_amount_usd", taxAmount)
          if (invoiceColumns.has("tax_rate_id")) addInvoiceCol("tax_rate_id", taxRateId ?? null)
          if (invoiceColumns.has("fx_rate_id")) addInvoiceCol("fx_rate_id", fxRateId ?? null)
          if (invoiceColumns.has("exchange_rate")) addInvoiceCol("exchange_rate", exchangeRate ?? null)
          if (invoiceColumns.has("discount_usd")) addInvoiceCol("discount_usd", 0)
          if (invoiceColumns.has("period_start")) addInvoiceCol("period_start", periodStartIso)
          if (invoiceColumns.has("period_end")) addInvoiceCol("period_end", periodEndIso)
          if (invoiceColumns.has("local_currency")) addInvoiceCol("local_currency", currency)
          if (invoiceColumns.has("local_subtotal")) addInvoiceCol("local_subtotal", priceUsd)
          if (invoiceColumns.has("local_tax")) addInvoiceCol("local_tax", taxAmount)
          if (invoiceColumns.has("local_total")) addInvoiceCol("local_total", totalAmount)
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
        currency,
        JSON.stringify(subscriptionMeta),
      ]
    )

    const txRes = await client.query(
      `
      INSERT INTO payment_transactions
        (invoice_id, billing_account_id, provider, transaction_type, status, amount_usd, currency, processed_at, provider_transaction_id, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      RETURNING *
      `,
      [
        invoiceRow.id,
        billingAccountId,
        provider,
        "charge",
        "succeeded",
        totalAmount,
        currency,
        periodStartIso,
        makeInvoiceNumber("USR-TX"),
        JSON.stringify(subscriptionMeta),
      ]
    )

    await client.query("COMMIT")
    transactionStarted = false

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
