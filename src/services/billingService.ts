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
