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

const BILLING_API_BASE = import.meta.env.VITE_BILLING_PUBLIC_API_BASE_URL || "/api/ai/billing/public"

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
