export type PlanTier = "free" | "pro" | "premium" | "business" | "enterprise"

export const PLAN_TIER_ORDER: PlanTier[] = ["free", "pro", "premium", "business", "enterprise"]

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
  business: "Business",
  enterprise: "Enterprise",
}

export type CreditTabStyles = {
  outerSelected: string
  outerUnselected: string
  labelSelected: string
  labelUnselected: string
  badgeSelected: string
  badgeUnselected: string
}

export const PLAN_TIER_STYLES: Record<
  PlanTier,
  { badge: string; avatar: string; creditTab: CreditTabStyles }
> = {
  free: {
    badge: "bg-muted text-muted-foreground ring-1 ring-border",
    avatar: "bg-muted-foreground",
    creditTab: {
      outerSelected: "bg-muted-foreground",
      outerUnselected: "bg-background border border-border ring-1 ring-muted-foreground/50",
      labelSelected: "text-primary-foreground",
      labelUnselected: "text-muted-foreground",
      badgeSelected: "bg-primary-foreground text-muted-foreground",
      badgeUnselected: "bg-muted-foreground text-primary-foreground",
    },
  },
  pro: {
    badge: "bg-teal-50 text-teal-600 ring-1 ring-teal-500",
    avatar: "bg-teal-500",
    creditTab: {
      outerSelected: "bg-teal-500",
      outerUnselected: "bg-background border border-border ring-1 ring-teal-500",
      labelSelected: "text-primary-foreground",
      labelUnselected: "text-teal-600",
      badgeSelected: "bg-primary-foreground text-teal-500",
      badgeUnselected: "bg-teal-500 text-primary-foreground",
    },
  },
  premium: {
    badge: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500",
    avatar: "bg-indigo-500",
    creditTab: {
      outerSelected: "bg-indigo-500",
      outerUnselected: "bg-background border border-border ring-1 ring-indigo-500",
      labelSelected: "text-primary-foreground",
      labelUnselected: "text-indigo-600",
      badgeSelected: "bg-primary-foreground text-indigo-500",
      badgeUnselected: "bg-indigo-500 text-primary-foreground",
    },
  },
  business: {
    badge: "bg-amber-50 text-amber-600 ring-1 ring-amber-500",
    avatar: "bg-amber-500",
    creditTab: {
      outerSelected: "bg-amber-500",
      outerUnselected: "bg-background border border-border ring-1 ring-amber-500",
      labelSelected: "text-primary-foreground",
      labelUnselected: "text-amber-600",
      badgeSelected: "bg-primary-foreground text-amber-500",
      badgeUnselected: "bg-amber-500 text-primary-foreground",
    },
  },
  enterprise: {
    badge: "bg-rose-50 text-rose-600 ring-1 ring-rose-500",
    avatar: "bg-rose-500",
    creditTab: {
      outerSelected: "bg-rose-500",
      outerUnselected: "bg-background border border-border ring-1 ring-rose-500",
      labelSelected: "text-primary-foreground",
      labelUnselected: "text-rose-600",
      badgeSelected: "bg-primary-foreground text-rose-500",
      badgeUnselected: "bg-rose-500 text-primary-foreground",
    },
  },
}

export function getCreditTabStyles(tier: PlanTier | null): CreditTabStyles {
  const resolved = tier && tier in PLAN_TIER_STYLES ? (tier as PlanTier) : "free"
  return PLAN_TIER_STYLES[resolved].creditTab
}

const TIER_ALIASES: Record<string, PlanTier> = {
  free: "free",
  pro: "pro",
  premium: "premium",
  business: "business",
  enterprise: "enterprise",
}

export function normalizePlanTier(raw?: string | null): PlanTier | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (!s) return null
  return TIER_ALIASES[s] ?? null
}

/** tenant_type + plan_tier로 서비스 플랜 결정 */
export function resolveServiceTier(info: {
  tenant_type?: string | null
  plan_tier?: string | null
}): PlanTier {
  const tier = normalizePlanTier(info.plan_tier)
  if (tier) return tier
  const type = String(info.tenant_type || "").toLowerCase()
  if (type === "personal") return "free"
  if (type === "team" || type === "group") return "premium"
  return "free"
}
