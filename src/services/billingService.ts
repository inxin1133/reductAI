type ListResponse<T> = {
  ok?: boolean
  rows?: T[]
  total?: number
  limit?: number
  offset?: number
}

export type BillingPlan = {
  id: string
  slug: string
  name: string
  tier: string
  tenant_type: string
  description: string | null
  included_seats: number
  min_seats: number
  max_seats: number | null
  extra_seat_price_usd: number
  storage_limit_mb: number | null
  is_active: boolean
  sort_order: number
  metadata: Record<string, unknown>
  credit_grants?: {
    monthly?: { monthly_credits?: number | null; initial_credits?: number | null } | null
    yearly?: { monthly_credits?: number | null; initial_credits?: number | null } | null
  } | null
}

export type BillingPlanPrice = {
  id: string
  plan_id: string
  billing_cycle: "monthly" | "yearly"
  price_usd: number | null
  currency: string
  version: number
  effective_at: string
  status: "active" | "draft" | "retired"
}

export type BillingPlanWithPrices = BillingPlan & {
  prices: {
    monthly: number | null
    yearly: number | null
  }
}

export type TopupProduct = {
  id: string
  sku_code: string
  name: string
  price_usd: number
  credits: number
  bonus_credits: number
  currency: string
  metadata: Record<string, unknown> | null
}

const BILLING_API_BASE = import.meta.env.VITE_BILLING_PUBLIC_API_BASE_URL || "/api/ai/billing/public"
const CREDITS_API_BASE = "/api/ai/credits/my"

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {}
  const token = window.localStorage.getItem("token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function pickRows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === "object" && Array.isArray((data as ListResponse<T>).rows)) {
    return (data as ListResponse<T>).rows as T[]
  }
  return []
}

function isNewerPrice(next: BillingPlanPrice, prev: BillingPlanPrice | null): boolean {
  if (!prev) return true
  if ((next.version || 0) > (prev.version || 0)) return true
  const nextTime = next.effective_at ? Date.parse(next.effective_at) : 0
  const prevTime = prev.effective_at ? Date.parse(prev.effective_at) : 0
  return nextTime > prevTime
}

export async function fetchBillingPlansWithPrices(): Promise<BillingPlanWithPrices[]> {
  const headers = getAuthHeaders()

  const [plansRes, pricesRes] = await Promise.all([
    fetch(`${BILLING_API_BASE}/plans?is_active=true&limit=200`, { headers }),
    fetch(`${BILLING_API_BASE}/plan-prices?status=active&limit=500`, { headers }),
  ])

  if (!plansRes.ok) {
    throw new Error(`요금제 목록을 불러오지 못했습니다. (${plansRes.status})`)
  }
  if (!pricesRes.ok) {
    throw new Error(`요금제 가격을 불러오지 못했습니다. (${pricesRes.status})`)
  }

  const plansData = await plansRes.json()
  const pricesData = await pricesRes.json()

  const plans = pickRows<BillingPlan>(plansData)
  const prices = pickRows<BillingPlanPrice>(pricesData)

  const priceMap = new Map<string, { monthly: BillingPlanPrice | null; yearly: BillingPlanPrice | null }>()
  prices.forEach((price) => {
    const current = priceMap.get(price.plan_id) || { monthly: null, yearly: null }
    if (price.billing_cycle === "monthly") {
      if (isNewerPrice(price, current.monthly)) current.monthly = price
    } else if (price.billing_cycle === "yearly") {
      if (isNewerPrice(price, current.yearly)) current.yearly = price
    }
    priceMap.set(price.plan_id, current)
  })

  return plans
    .filter((plan) => plan.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((plan) => {
      const priceEntry = priceMap.get(plan.id) || { monthly: null, yearly: null }
      return {
        ...plan,
        prices: {
          monthly: priceEntry.monthly?.price_usd ?? null,
          yearly: priceEntry.yearly?.price_usd ?? null,
        },
      }
    })
}

const BILLING_USER_API_BASE = "/api/ai/billing/user"

export type SubscriptionOverviewData = {
  subscription: {
    id: string
    tenant_id: string
    plan_id: string
    billing_cycle: "monthly" | "yearly"
    status: string
    started_at: string
    current_period_start: string
    current_period_end: string
    cancel_at_period_end: boolean
    cancelled_at: string | null
    ended_at: string | null
    auto_renew: boolean
    price_usd: number | null
    price_local?: number | null
    fx_rate?: number | null
    currency: string
    plan_name: string
    plan_tier: string
    plan_sort_order: number
    plan_tenant_type: string
    plan_metadata: Record<string, unknown> | null
    metadata: Record<string, unknown> | null
  } | null
  scheduled_changes: Array<{
    id: string
    subscription_id: string
    from_plan_id: string | null
    to_plan_id: string | null
    from_billing_cycle: string | null
    to_billing_cycle: string | null
    change_type: "upgrade" | "downgrade" | "cancel" | "resume"
    effective_at: string
    proration_amount_usd: number
    status: string
    from_plan_name: string | null
    from_plan_tier: string | null
    to_plan_name: string | null
    to_plan_tier: string | null
    metadata: Record<string, unknown> | null
  }>
  seat_addons: Array<{
    id: string
    subscription_id: string
    tenant_id: string
    quantity: number
    status: "active" | "scheduled_cancel" | "cancelled"
    effective_at: string
    cancel_at_period_end: boolean
    cancelled_at: string | null
    unit_price_usd: number
    unit_price_local?: number | null
    fx_rate?: number | null
    currency: string
    metadata: Record<string, unknown> | null
    created_at: string
  }>
  seat_summary: {
    total_addon_seats: number
    total_addon_monthly_usd: number
  }
}

export async function fetchSubscriptionOverview(): Promise<SubscriptionOverviewData> {
  const headers = getAuthHeaders()
  const res = await fetch(`${BILLING_USER_API_BASE}/subscription-overview`, { headers })
  if (!res.ok) throw new Error(`구독 정보를 불러오지 못했습니다. (${res.status})`)
  const data = await res.json()
  if (!data?.ok) throw new Error(data?.message || "구독 정보를 불러오지 못했습니다.")
  return {
    subscription: data.subscription ?? null,
    scheduled_changes: data.scheduled_changes ?? [],
    seat_addons: (data.seat_addons ?? []).map((a: any) => ({
      ...a,
      quantity: Number(a.quantity ?? 0),
      unit_price_usd: Number(a.unit_price_usd ?? 0),
      unit_price_local:
        a.unit_price_local === null || a.unit_price_local === undefined ? null : Number(a.unit_price_local),
      fx_rate: a.fx_rate === null || a.fx_rate === undefined ? null : Number(a.fx_rate),
    })),
    seat_summary: {
      total_addon_seats: Number(data.seat_summary?.total_addon_seats ?? 0),
      total_addon_monthly_usd: Number(data.seat_summary?.total_addon_monthly_usd ?? 0),
    },
  }
}

export async function cancelSeatAddon(addonId: string): Promise<{ ok: boolean; addon_id: string; status: string }> {
  const headers = { ...getAuthHeaders(), "Content-Type": "application/json" }
  const res = await fetch(`${BILLING_USER_API_BASE}/seat-addon-cancel`, {
    method: "POST",
    headers,
    body: JSON.stringify({ addon_id: addonId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.message || `좌석 취소 처리에 실패했습니다. (${res.status})`)
  }
  return res.json()
}

export async function fetchTopupProducts(): Promise<TopupProduct[]> {
  const headers = getAuthHeaders()
  const res = await fetch(`${CREDITS_API_BASE}/topup-products`, { headers })
  if (!res.ok) throw new Error(`충전 상품을 불러오지 못했습니다. (${res.status})`)
  const data = await res.json()
  return pickRows<TopupProduct>(data).map((row) => ({
    ...row,
    price_usd: Number(row.price_usd),
    credits: Number(row.credits),
    bonus_credits: Number(row.bonus_credits),
    metadata: row.metadata ?? null,
  }))
}

// ── Invoice types ──

export type BillingInvoice = {
  id: string
  invoice_number: string
  status: "draft" | "open" | "paid" | "void" | "uncollectible"
  currency: string
  subtotal_usd: number
  tax_usd: number
  discount_usd: number
  total_usd: number
  exchange_rate: number | null
  local_currency: string
  local_subtotal: number | null
  local_tax: number | null
  local_discount: number | null
  local_total: number | null
  period_start: string
  period_end: string
  issue_date: string
  due_date: string | null
  paid_at: string | null
  primary_line_type: string | null
  primary_description: string | null
}

export type InvoiceLineItem = {
  id: string
  line_type: "subscription" | "seat_overage" | "topup" | "adjustment" | "refund"
  description: string
  quantity: number
  unit_price_usd: number
  amount_usd: number
  currency: string
}

export type BillingInvoiceDetail = BillingInvoice & {
  line_items: InvoiceLineItem[]
  plan_name: string | null
  billing_cycle: string | null
}

function normalizeInvoice(raw: Record<string, unknown>): BillingInvoice {
  return {
    id: String(raw.id ?? ""),
    invoice_number: String(raw.invoice_number ?? ""),
    status: (raw.status as BillingInvoice["status"]) ?? "draft",
    currency: String(raw.currency ?? "USD"),
    subtotal_usd: Number(raw.subtotal_usd ?? 0),
    tax_usd: Number(raw.tax_usd ?? 0),
    discount_usd: Number(raw.discount_usd ?? 0),
    total_usd: Number(raw.total_usd ?? 0),
    exchange_rate: raw.exchange_rate != null ? Number(raw.exchange_rate) : null,
    local_currency: String(raw.local_currency ?? "KRW"),
    local_subtotal: raw.local_subtotal != null ? Number(raw.local_subtotal) : null,
    local_tax: raw.local_tax != null ? Number(raw.local_tax) : null,
    local_discount: raw.local_discount != null ? Number(raw.local_discount) : null,
    local_total: raw.local_total != null ? Number(raw.local_total) : null,
    period_start: String(raw.period_start ?? ""),
    period_end: String(raw.period_end ?? ""),
    issue_date: String(raw.issue_date ?? ""),
    due_date: raw.due_date != null ? String(raw.due_date) : null,
    paid_at: raw.paid_at != null ? String(raw.paid_at) : null,
    primary_line_type: raw.primary_line_type != null ? String(raw.primary_line_type) : null,
    primary_description: raw.primary_description != null ? String(raw.primary_description) : null,
  }
}

function normalizeLineItem(raw: Record<string, unknown>): InvoiceLineItem {
  return {
    id: String(raw.id ?? ""),
    line_type: (raw.line_type as InvoiceLineItem["line_type"]) ?? "subscription",
    description: String(raw.description ?? ""),
    quantity: Number(raw.quantity ?? 1),
    unit_price_usd: Number(raw.unit_price_usd ?? 0),
    amount_usd: Number(raw.amount_usd ?? 0),
    currency: String(raw.currency ?? "USD"),
  }
}

export async function fetchInvoices(params: {
  limit?: number
  offset?: number
}): Promise<{ rows: BillingInvoice[]; total: number }> {
  const headers = getAuthHeaders()
  const limit = params.limit ?? 10
  const offset = params.offset ?? 0
  const res = await fetch(`${BILLING_USER_API_BASE}/invoices?limit=${limit}&offset=${offset}`, { headers })
  if (!res.ok) throw new Error(`청구서 목록을 불러오지 못했습니다. (${res.status})`)
  const data = await res.json()
  if (!data?.ok) throw new Error(data?.message || "청구서 목록을 불러오지 못했습니다.")
  return {
    rows: (data.rows ?? []).map((r: Record<string, unknown>) => normalizeInvoice(r)),
    total: Number(data.total ?? 0),
  }
}

export type PaymentTransaction = {
  id: string
  invoice_id: string | null
  transaction_type: "charge" | "refund" | "adjustment"
  status: "pending" | "succeeded" | "failed" | "refunded" | "cancelled"
  amount_usd: number
  currency: string
  amount_local: number | null
  local_currency: string
  processed_at: string | null
  created_at: string
  invoice_number: string | null
  primary_line_type: string | null
  invoice_description: string | null
  card_brand: string | null
  card_last4: string | null
  pm_type: string | null
  metadata: Record<string, unknown> | null
}

function normalizeTransaction(raw: Record<string, unknown>): PaymentTransaction {
  return {
    id: String(raw.id ?? ""),
    invoice_id: raw.invoice_id != null ? String(raw.invoice_id) : null,
    transaction_type: (raw.transaction_type as PaymentTransaction["transaction_type"]) ?? "charge",
    status: (raw.status as PaymentTransaction["status"]) ?? "pending",
    amount_usd: Number(raw.amount_usd ?? 0),
    currency: String(raw.currency ?? "USD"),
    amount_local: raw.amount_local != null ? Number(raw.amount_local) : null,
    local_currency: String(raw.local_currency ?? "KRW"),
    processed_at: raw.processed_at != null ? String(raw.processed_at) : null,
    created_at: String(raw.created_at ?? ""),
    invoice_number: raw.invoice_number != null ? String(raw.invoice_number) : null,
    primary_line_type: raw.primary_line_type != null ? String(raw.primary_line_type) : null,
    invoice_description: raw.invoice_description != null ? String(raw.invoice_description) : null,
    card_brand: raw.card_brand != null ? String(raw.card_brand) : null,
    card_last4: raw.card_last4 != null ? String(raw.card_last4) : null,
    pm_type: raw.pm_type != null ? String(raw.pm_type) : null,
    metadata: (raw.metadata as Record<string, unknown>) ?? null,
  }
}

export async function fetchTransactions(params: {
  limit?: number
  offset?: number
}): Promise<{ rows: PaymentTransaction[]; total: number }> {
  const headers = getAuthHeaders()
  const limit = params.limit ?? 10
  const offset = params.offset ?? 0
  const res = await fetch(`${BILLING_USER_API_BASE}/transactions?limit=${limit}&offset=${offset}`, { headers })
  if (!res.ok) throw new Error(`결제 내역을 불러오지 못했습니다. (${res.status})`)
  const data = await res.json()
  if (!data?.ok) throw new Error(data?.message || "결제 내역을 불러오지 못했습니다.")
  return {
    rows: (data.rows ?? []).map((r: Record<string, unknown>) => normalizeTransaction(r)),
    total: Number(data.total ?? 0),
  }
}

export async function fetchInvoiceDetail(invoiceId: string): Promise<BillingInvoiceDetail> {
  const headers = getAuthHeaders()
  const res = await fetch(`${BILLING_USER_API_BASE}/invoices/${invoiceId}`, { headers })
  if (!res.ok) throw new Error(`청구서를 불러오지 못했습니다. (${res.status})`)
  const data = await res.json()
  if (!data?.ok) throw new Error(data?.message || "청구서를 불러오지 못했습니다.")
  const invoice = (data.invoice ?? data) as Record<string, unknown>
  return {
    ...normalizeInvoice(invoice),
    line_items: ((data.line_items ?? (invoice.line_items as unknown[])) ?? []).map(
      (r: unknown) => normalizeLineItem(r as Record<string, unknown>)
    ),
    plan_name: (data.plan_name ?? invoice.plan_name ?? null) as string | null,
    billing_cycle: (data.billing_cycle ?? invoice.billing_cycle ?? null) as string | null,
  }
}
