import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Check, HardDrive, Loader2, Users, X, Zap } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { appendVisited, hasBillingCard, hasBillingInfo } from "@/lib/billingFlow"
import { fetchBillingPlansWithPrices } from "@/services/billingService"
import type { BillingPlanWithPrices } from "@/services/billingService"
import { PLAN_TIER_ORDER, type PlanTier } from "@/lib/planTier"
import { extractPlanHighlights, formatPlanCredits } from "@/lib/billingPlanContent"
import { TermsAgreementDialog, type TermsDialogType } from "@/components/dialog/TermsAgreementDialog"

type PlanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTier?: string | null
}

type BillingCycle = "monthly" | "yearly"

type BillingAccountResponse = {
  ok?: boolean
  row?: {
    billing_name?: string | null
    billing_email?: string | null
    billing_address1?: string | null
  } | null
}

type PaymentMethodsResponse = {
  ok?: boolean
  rows?: Array<{ status?: string | null }>
}

type SubscriptionSummary = {
  id: string
  plan_id: string
  plan_name?: string | null
  plan_tier?: string | null
  billing_cycle?: "monthly" | "yearly" | string | null
  current_period_end?: string | null
  status?: string | null
}

type SubscriptionResponse = {
  ok?: boolean
  row?: SubscriptionSummary | null
  message?: string
}

function normalizePlanTier(value: unknown): PlanTier | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!raw) return null
  if (PLAN_TIER_ORDER.includes(raw as PlanTier)) return raw as PlanTier
  return null
}

function formatStorage(mb: number | null): string {
  if (mb == null) return "무제한"
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`
  return `${mb} MB`
}

function formatPrice(price: number | null): string {
  if (price == null) return "문의"
  if (price === 0) return "무료"
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function tierColor(tier: string): string {
  switch (tier) {
    case "free":
      return "border-border"
    case "pro":
      return "border-teal-500"
    case "premium":
      return "border-indigo-500"
    case "business":
      return "border-amber-500"
    case "enterprise":
      return "border-rose-500"
    default:
      return "border-border"
  }
}

function tierBadgeBg(tier: string): string {
  switch (tier) {
    case "free":
      return "bg-muted text-muted-foreground"
    case "pro":
      return "bg-teal-50 text-teal-600 dark:text-teal-400"
    case "premium":
      return "bg-indigo-50 text-indigo-600 dark:text-indigo-400"
    case "business":
      return "bg-amber-50 text-amber-600 dark:text-amber-400"
    case "enterprise":
      return "bg-rose-50 text-rose-600 dark:text-rose-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function upgradeButtonClass(tier: PlanTier): string {
  switch (tier) {
    case "pro":
      return "bg-teal-500 text-white hover:bg-teal-600"
    case "premium":
      return "bg-indigo-500 text-white hover:bg-indigo-600"
    case "business":
      return "bg-amber-500 text-white hover:bg-amber-600"
    case "enterprise":
      return "bg-rose-500 text-white hover:bg-rose-600"
    default:
      return "bg-primary text-primary-foreground hover:bg-primary/90"
  }
}

function currentButtonClass(tier: PlanTier): string {
  switch (tier) {
    case "pro":
      return "border-teal-500 text-teal-600 hover:border-teal-500 hover:text-teal-600"
    case "premium":
      return "border-indigo-500 text-indigo-600 hover:border-indigo-500 hover:text-indigo-600"
    case "business":
      return "border-amber-500 text-amber-600 hover:border-amber-500 hover:text-amber-600"
    case "enterprise":
      return "border-rose-500 text-rose-600 hover:border-rose-500 hover:text-rose-600"
    default:
      return "border-muted text-muted-foreground hover:border-muted hover:text-muted-foreground"
  }
}

export function PlanDialog({ open, onOpenChange, currentTier }: PlanDialogProps) {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<BillingPlanWithPrices[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly")
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionSummary | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [refundPolicyDialogType, setRefundPolicyDialogType] = useState<TermsDialogType>(null)
  const normalizedCurrentTier = useMemo(
    () => normalizePlanTier(currentSubscription?.plan_tier ?? currentTier) ?? "free",
    [currentSubscription?.plan_tier, currentTier]
  )
  const currentPlanId = currentSubscription?.plan_id ?? null
  const currentBillingCycle = currentSubscription?.billing_cycle ?? null

  const authHeaders = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {}
    const token = window.localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const resolveNextRoute = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      return !hasBillingCard() ? "/billing/card" : !hasBillingInfo() ? "/billing/info" : "/billing/confirm"
    }

    try {
      const [accountRes, methodsRes] = await Promise.all([
        fetch("/api/ai/billing/user/billing-account", { headers }),
        fetch("/api/ai/billing/user/payment-methods?limit=1", { headers }),
      ])

      let hasInfo = false
      if (accountRes.ok) {
        const data = (await accountRes.json().catch(() => null)) as BillingAccountResponse | null
        const row = data?.row
        hasInfo = Boolean(row?.billing_name && row?.billing_email && row?.billing_address1)
      }

      let hasCard = false
      if (methodsRes.ok) {
        const data = (await methodsRes.json().catch(() => null)) as PaymentMethodsResponse | null
        hasCard = Array.isArray(data?.rows) && data.rows.length > 0
      }

      return !hasCard ? "/billing/card" : !hasInfo ? "/billing/info" : "/billing/confirm"
    } catch (e) {
      console.error(e)
      return "/billing/card"
    }
  }, [authHeaders])

  const loadPlans = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchBillingPlansWithPrices()
      .then((rows) => setPlans(rows))
      .catch((err) => {
        setPlans([])
        setError(err instanceof Error ? err.message : "요금제를 불러올 수 없습니다.")
      })
      .finally(() => setLoading(false))
  }, [])

  const loadCurrentSubscription = useCallback(() => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setCurrentSubscription(null)
      return
    }
    setSubscriptionLoading(true)
    fetch("/api/ai/billing/user/subscription", { headers })
      .then((res) => res.json().catch(() => null) as Promise<SubscriptionResponse | null>)
      .then((data) => {
        if (data?.row) setCurrentSubscription(data.row)
        else setCurrentSubscription(null)
      })
      .catch((e) => {
        console.error(e)
        setCurrentSubscription(null)
      })
      .finally(() => setSubscriptionLoading(false))
  }, [authHeaders])

  useEffect(() => {
    if (!open) return
    loadPlans()
  }, [open, loadPlans])

  useEffect(() => {
    if (!open) return
    loadCurrentSubscription()
  }, [open, loadCurrentSubscription])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-10 flex w-[calc(100%-2rem)] max-w-[960px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">서비스 플랜 요금표</h2>
            <span className="text-xs text-muted-foreground">(부가세 별도)</span>
          </div>
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex items-center justify-center gap-1 px-6 py-3">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                billingCycle === "monthly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setBillingCycle("monthly")}
            >
              월간
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                billingCycle === "yearly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setBillingCycle("yearly")}
            >
              연간
              <span className="ml-1 text-xs text-teal-500">Save 17%</span>
            </button>
          </div>
        </div>

        <div className="px-6 py-3 w-full">          
          <h1 className="text-xl font-black text-center text-foreground lg:text-2xl">
            합리적인 가격으로 시작하세요
          </h1>
          <p className="mt-2 text-center text-muted-foreground">
            개인부터 대규모 팀까지, 필요에 맞는 플랜을 선택하세요.            
          </p>
        </div>

        {/* Content */}
        <div className="max-h-[calc(100vh-14rem)] overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
              <p>{error}</p>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
                onClick={loadPlans}
              >
                다시 시도
              </button>
            </div>
          ) : plans.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              등록된 요금제가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const price = billingCycle === "monthly" ? plan.prices?.monthly : plan.prices?.yearly
                const monthlyEquivalent =
                  billingCycle === "yearly" && price != null && price > 0
                    ? Math.round((price / 12) * 100) / 100
                    : null
                const creditDisplay = formatPlanCredits({
                  billingCycle,
                  creditGrants: plan.credit_grants,
                })
                const credits = creditDisplay.label
                const creditsIsMonthly = creditDisplay.isMonthly
                // const storage = formatStorage(plan.storage_limit_mb)
                const seats =
                  plan.max_seats == null
                    ? `${plan.included_seats}명+`
                    : plan.included_seats === plan.max_seats
                      ? `${plan.included_seats}명`
                      : `${plan.included_seats}~${plan.max_seats}명`
                const planTier = normalizePlanTier(plan.tier) ?? "free"
                const highlights = extractPlanHighlights(plan.metadata)
                const currentIndex = PLAN_TIER_ORDER.indexOf(normalizedCurrentTier)
                const planIndex = PLAN_TIER_ORDER.indexOf(planTier)
                const isCurrentPlan = currentPlanId ? plan.id === currentPlanId : planIndex === currentIndex
                const isCycleChange = Boolean(isCurrentPlan && currentBillingCycle && currentBillingCycle !== billingCycle)
                const isCurrent = isCurrentPlan && (!currentBillingCycle || currentBillingCycle === billingCycle)
                const isUpgrade = planIndex > currentIndex
                const isDowngrade = planIndex < currentIndex
                const cycleLabel = billingCycle === "yearly" ? "연간" : "월간"
                const actionLabel = isCurrent
                  ? "현재 요금제"
                  : isCycleChange
                    ? `${cycleLabel}으로 변경`
                    : isUpgrade
                      ? "업그레이드"
                      : isDowngrade
                        ? "다운그레이드"
                        : "요금제 변경"

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "flex flex-col rounded-xl border-2 bg-card p-5 transition-shadow hover:shadow-md",
                      tierColor(plan.tier)
                    )}
                  >
                    {/* Tier badge + Name */}
                    <div className="mb-3 flex items-center gap-2">
                      <span
                        className={cn("rounded-md px-2 py-0.5 text-xs font-semibold uppercase", tierBadgeBg(plan.tier))}
                      >
                        {plan.tier}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-card-foreground">{plan.name}</h3>
                    {plan.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                    ) : null}

                    {/* Price */}
                    <div className="mt-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-card-foreground">
                          {formatPrice(price ?? null)}
                        </span>
                        {price != null && price > 0 ? (
                          <span className="text-sm text-muted-foreground">
                            /{billingCycle === "monthly" ? "월" : "년"}
                          </span>
                        ) : null}
                      </div>
                      {monthlyEquivalent != null ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          월 ${monthlyEquivalent.toLocaleString()} 상당
                        </p>
                      ) : null}
                    </div>

                    {/* Features */}
                    <ul className="mt-5 flex flex-col gap-2.5 text-sm text-card-foreground">
                      <li className="flex items-start gap-2">
                        <Zap className="mt-0.5 size-4 shrink-0 text-teal-500" />
                        <span>
                          크레딧 <span className="font-semibold">{credits}</span>
                          {creditsIsMonthly ? "/월" : ""}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Users className="mt-0.5 size-4 shrink-0 text-teal-500" />
                        <span>
                          좌석 <span className="font-semibold">{seats}</span>
                          {plan.extra_seat_price_usd > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              (추가 ${plan.extra_seat_price_usd}/석)
                            </span>
                          ) : null}
                        </span>
                      </li>
                      {/* <li className="flex items-start gap-2">
                        <HardDrive className="mt-0.5 size-4 shrink-0 text-teal-500" />
                        <span>
                          스토리지 <span className="font-semibold">{storage}</span>
                        </span>
                      </li> */}
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-teal-500" />
                        <span>
                          유형{" "}
                          <span className="font-semibold">
                            {plan.tenant_type === "personal"
                              ? "개인"
                              : plan.tenant_type === "team"
                                ? "팀"
                                : plan.tenant_type === "group"
                                  ? "그룹"
                                  : "없음"}
                          </span>
                        </span>
                      </li>
                    </ul>
                    {highlights.length > 0 ? (
                      <ul className="mt-4 flex flex-col gap-2 border-t border-border/40 pt-4 text-xs text-muted-foreground">
                        {highlights.map((item, index) => (
                          <li key={`${plan.id}-highlight-${index}`} className="flex items-start gap-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {/* CTA 요금제 버튼 */}
                    <div className="mt-auto pt-5">
                      <Button
                        variant={isCurrent ? "outline" : isUpgrade || isCycleChange ? "default" : "secondary"}
                        className={cn(
                          "w-full",
                          isCurrent
                            ? cn(currentButtonClass(planTier), "cursor-default hover:bg-transparent")
                            : isUpgrade
                              ? upgradeButtonClass(planTier)
                              : ""
                        )}
                        onClick={() => {
                          if (isCurrent) return
                          void (async () => {
                            const navState = {
                              planId: plan.id,
                              planName: plan.name,
                              billingCycle,
                              action: currentSubscription ? "change" : undefined,
                              flow: appendVisited(undefined, "plan"),
                            }

                            if (currentSubscription && (isDowngrade || isCycleChange)) {
                              const isCycleDowngrade =
                                isCycleChange && currentBillingCycle === "yearly" && billingCycle === "monthly"
                              if (isDowngrade || isCycleDowngrade) {
                                onOpenChange(false)
                                navigate("/billing/downgrade", { state: navState })
                                return
                              }
                            }

                            const target = await resolveNextRoute()
                            onOpenChange(false)
                            navigate(target, { state: navState })
                          })()
                        }}
                        disabled={subscriptionLoading}
                      >
                        {actionLabel}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 유료서비스, 자동결제 및 환불정책 */}
          <div className="flex flex-1 mt-8 justify-center">
            <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setRefundPolicyDialogType("refund")}>
              유료서비스, 자동결제 및 환불정책
            </Button>
          </div>

        </div>
      </div>

      <TermsAgreementDialog
        type={refundPolicyDialogType}
        onOpenChange={(open) => !open && setRefundPolicyDialogType(null)}
      />
    </div>,
    document.body
  )
}
