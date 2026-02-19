import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Check, HardDrive, Loader2, Users, X, Zap } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { fetchBillingPlansWithPrices } from "@/services/billingService"
import type { BillingPlanWithPrices } from "@/services/billingService"

type PlanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type BillingCycle = "monthly" | "yearly"


function formatStorage(mb: number | null): string {
  if (mb == null) return "무제한"
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`
  return `${mb} MB`
}

function formatCredits(metadata: Record<string, unknown>): string {
  const monthly = metadata?.monthly_credits
  if (typeof monthly === "number" && monthly > 0) {
    return monthly >= 1000 ? `${(monthly / 1000).toLocaleString()}K` : String(monthly)
  }
  const initial = metadata?.initial_credits
  if (typeof initial === "number" && initial > 0) {
    return `${initial.toLocaleString()} (최초)`
  }
  return "문의"
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

export function PlanDialog({ open, onOpenChange }: PlanDialogProps) {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<BillingPlanWithPrices[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly")

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

  useEffect(() => {
    if (!open) return
    loadPlans()
  }, [open, loadPlans])

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
                const credits = formatCredits(plan.metadata || {})
                const storage = formatStorage(plan.storage_limit_mb)
                const seats =
                  plan.max_seats == null
                    ? `${plan.included_seats}명+`
                    : plan.included_seats === plan.max_seats
                      ? `${plan.included_seats}명`
                      : `${plan.included_seats}~${plan.max_seats}명`

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
                          {typeof (plan.metadata as Record<string, unknown>)?.monthly_credits === "number" ? "/월" : ""}
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
                      <li className="flex items-start gap-2">
                        <HardDrive className="mt-0.5 size-4 shrink-0 text-teal-500" />
                        <span>
                          스토리지 <span className="font-semibold">{storage}</span>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-teal-500" />
                        <span>
                          유형{" "}
                          <span className="font-semibold">
                            {plan.tenant_type === "personal"
                              ? "개인"
                              : plan.tenant_type === "team"
                                ? "팀"
                                : "그룹"}
                          </span>
                        </span>
                      </li>
                    </ul>

                    {/* CTA */}
                    <div className="mt-auto pt-5">
                      <button
                        type="button"
                        className={cn(
                          "flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors",
                          plan.tier === "free"
                            ? "border border-border bg-background text-foreground hover:bg-accent"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                        onClick={() => {
                          if (plan.tier === "free") return
                          onOpenChange(false)
                          navigate("/billing/card", {
                            state: {
                              planId: plan.id,
                              planName: plan.name,
                              billingCycle,
                            },
                          })
                        }}
                      >
                        {plan.tier === "free" ? "현재 요금제" : "업그레이드"}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
