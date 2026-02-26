type PlanMetadata = Record<string, unknown> | null | undefined
type PlanCreditGrant = { monthly_credits?: number | null; initial_credits?: number | null }
type PlanCreditGrants = { monthly?: PlanCreditGrant | null; yearly?: PlanCreditGrant | null } | null | undefined

function normalizeHighlightValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean)
  }
  if (value && typeof value === "object") {
    const items = (value as { items?: unknown }).items
    if (Array.isArray(items)) return normalizeHighlightValue(items)
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []
    const lines = trimmed
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.length ? lines : [trimmed]
  }
  return []
}

export function extractPlanHighlights(metadata: PlanMetadata): string[] {
  if (!metadata || typeof metadata !== "object") return []

  const meta = metadata as Record<string, unknown>
  const marketing = meta.marketing && typeof meta.marketing === "object" ? (meta.marketing as Record<string, unknown>) : null

  const candidates = [
    meta.highlights,
    meta.features,
    meta.benefits,
    marketing?.highlights,
    marketing?.features,
    marketing?.benefits,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeHighlightValue(candidate)
    if (normalized.length) return normalized
  }

  return []
}

function normalizeCreditValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function pickCreditGrant(billingCycle: "monthly" | "yearly", grants: PlanCreditGrants): PlanCreditGrant | null {
  if (!grants) return null
  if (billingCycle === "yearly") return grants.yearly ?? grants.monthly ?? null
  return grants.monthly ?? grants.yearly ?? null
}

export function formatPlanCredits(args: {
  billingCycle: "monthly" | "yearly"
  creditGrants?: PlanCreditGrants
}): { label: string; isMonthly: boolean } {
  const { billingCycle, creditGrants } = args
  const grant = pickCreditGrant(billingCycle, creditGrants)

  const grantMonthly = normalizeCreditValue(grant?.monthly_credits)
  const grantInitial = normalizeCreditValue(grant?.initial_credits)

  const monthly = grantMonthly
  const initial = grantInitial

  if (monthly !== null && monthly > 0) {
    const label = monthly >= 1000 ? `${(monthly / 1000).toLocaleString()}K` : String(monthly)
    return { label, isMonthly: true }
  }
  if (initial !== null && initial > 0) {
    return { label: `${initial.toLocaleString()} (최초)`, isMonthly: false }
  }
  return { label: "문의", isMonthly: false }
}
