import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Check, Loader2, Users, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LoginModal } from "@/components/LoginModal"
import { fetchBillingPlansWithPrices } from "@/services/billingService"
import type { BillingPlanWithPrices } from "@/services/billingService"
import { PLAN_TIER_ORDER, type PlanTier } from "@/lib/planTier"
import { extractPlanHighlights, formatPlanCredits } from "@/lib/billingPlanContent"

type BillingCycle = "monthly" | "yearly"

function normalizePlanTier(value: unknown): PlanTier | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!raw) return null
  if (PLAN_TIER_ORDER.includes(raw as PlanTier)) return raw as PlanTier
  return null
}

function formatPrice(price: number | null): string {
  if (price == null) return "문의"
  if (price === 0) return "무료"
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function tierColor(tier: string): string {
  switch (tier) {
    case "free": return "border-border"
    case "pro": return "border-teal-500"
    case "premium": return "border-indigo-500"
    case "business": return "border-amber-500"
    case "enterprise": return "border-rose-500"
    default: return "border-border"
  }
}

function tierBadgeBg(tier: string): string {
  switch (tier) {
    case "free": return "bg-muted text-muted-foreground"
    case "pro": return "bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400"
    case "premium": return "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
    case "business": return "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
    case "enterprise": return "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
    default: return "bg-muted text-muted-foreground"
  }
}

function ctaButtonClass(tier: PlanTier): string {
  switch (tier) {
    case "pro": return "bg-teal-500 text-white hover:bg-teal-600"
    case "premium": return "bg-indigo-500 text-white hover:bg-indigo-600"
    case "business": return "bg-amber-500 text-white hover:bg-amber-600"
    case "enterprise": return "bg-rose-500 text-white hover:bg-rose-600"
    default: return ""
  }
}

export default function PricingPage() {
  const [plans, setPlans] = useState<BillingPlanWithPrices[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly")
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)

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
    loadPlans()
  }, [loadPlans])

  const faqItems = useMemo(
    () => [
      {
        q: "무료 플랜에서 유료 플랜으로 언제든 업그레이드할 수 있나요?",
        a: "네, 언제든지 업그레이드할 수 있습니다. 업그레이드 시 남은 기간에 대해 차액만 결제하면 됩니다.",
      },
      {
        q: "연간 결제 시 할인이 적용되나요?",
        a: "네, 연간 결제 시 월간 대비 약 17%의 할인이 적용됩니다.",
      },
      {
        q: "크레딧은 어떻게 사용되나요?",
        a: "AI 모델을 사용할 때마다 크레딧이 차감됩니다. 모델별, 기능별로 소비되는 크레딧이 다르며, 매월 크레딧이 갱신됩니다.",
      },
      {
        q: "팀 플랜의 좌석을 추가할 수 있나요?",
        a: "프리미엄, 비즈니스 플랜에서는 기본 좌석 외에 추가 좌석을 구매할 수 있습니다. 추가 좌석 가격은 플랜별로 동일합니다.",
      },
      {
        q: "환불 정책은 어떻게 되나요?",
        a: "월 구독 취소 시, 이번 달은 기존 등급 사용 유지 → 새로운 등급 및 월간 구독으로 다음달 부터 진행됩니다. 연간 구독 취소 시, 이번 달은 기존 등급 사용 유지 → 남은 기간에 대한 환불이 가능합니다. 자세한 내용은 환불 정책 페이지를 참고하세요.",
      },
    ],
    []
  )

  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-[1000px] px-6 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Pricing
          </span>
          <h1 className="text-4xl font-black text-foreground lg:text-5xl">
            합리적인 가격으로<br />시작하세요
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            개인부터 대규모 팀까지, 필요에 맞는 플랜을 선택하세요.            
          </p>

          {/* Billing cycle toggle */}
          <div className="mt-8 flex items-center justify-center">
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-5 py-2 text-sm font-medium transition-colors",
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
                  "rounded-md px-5 py-2 text-sm font-medium transition-colors",
                  billingCycle === "yearly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setBillingCycle("yearly")}
              >
                연간
                <span className="ml-1 text-xs text-teal-500 font-semibold">Save 17%</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20">
        <div className="mx-auto max-w-[1280px] px-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={loadPlans}>
                다시 시도
              </Button>
            </div>
          ) : plans.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              등록된 요금제가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const price =
                  billingCycle === "monthly" ? plan.prices?.monthly : plan.prices?.yearly
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
                const seats =
                  plan.max_seats == null
                    ? `${plan.included_seats}명+`
                    : plan.included_seats === plan.max_seats
                      ? `${plan.included_seats}명`
                      : `${plan.included_seats}~${plan.max_seats}명`
                const planTier = normalizePlanTier(plan.tier) ?? "free"
                const highlights = extractPlanHighlights(plan.metadata)

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "flex flex-col rounded-xl border-2 bg-card p-6 transition-shadow hover:shadow-lg",
                      tierColor(plan.tier)
                    )}
                  >
                    {/* Tier badge */}
                    <div className="mb-3 flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold uppercase",
                          tierBadgeBg(plan.tier)
                        )}
                      >
                        {plan.tier}
                      </span>
                      {/* {plan.tenant_type === "personal" && (
                        <span className="text-xs text-muted-foreground">개인</span>
                      )}
                      {plan.tenant_type === "team" && (
                        <span className="text-xs text-muted-foreground">팀</span>
                      )} */}
                    </div>

                    <h3 className="text-xl font-bold text-card-foreground">{plan.name}</h3>
                    {plan.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                    )}

                    {/* Price */}
                    <div className="mt-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-extrabold text-card-foreground">
                          {formatPrice(price ?? null)}
                        </span>
                        {price != null && price > 0 && (
                          <span className="text-sm text-muted-foreground">
                            /{billingCycle === "monthly" ? "월" : "년"}
                          </span>
                        )}
                      </div>
                      {monthlyEquivalent != null && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          월 ${monthlyEquivalent.toLocaleString()} 상당
                        </p>
                      )}
                    </div>

                    {/* CTA */}
                    <div className="mt-6">
                      <Button
                        variant={planTier === "free" ? "outline" : "default"}
                        className={cn("w-full", planTier !== "free" && ctaButtonClass(planTier))}
                        onClick={() => setIsLoginModalOpen(true)}
                      >
                        {planTier === "free" ? "무료로 시작" : "시작하기"}
                      </Button>
                    </div>

                    {/* Specs */}
                    <ul className="mt-6 flex flex-col gap-3 border-t border-border/40 pt-6 text-sm text-card-foreground">
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
                          {plan.extra_seat_price_usd > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {" "}(추가 ${plan.extra_seat_price_usd}/석)
                            </span>
                          )}
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
                                : plan.tenant_type === "group"
                                  ? "그룹"
                                  : "없음"}
                          </span>
                        </span>
                      </li>
                      {/* <li className="flex items-start gap-2">
                        <HardDrive className="mt-0.5 size-4 shrink-0 text-teal-500" />
                        <span>
                          스토리지 <span className="font-semibold">{storage}</span>
                        </span>
                      </li> */}
                    </ul>

                    {/* Highlights */}
                    {highlights.length > 0 && (
                      <ul className="mt-4 flex flex-col gap-2 border-t border-border/40 pt-4 text-sm">
                        {highlights.map((h) => (
                          <li key={h} className="flex items-start gap-2 text-muted-foreground">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-[800px] px-6">
          <h2 className="mb-10 text-center text-3xl font-bold text-foreground">자주 묻는 질문</h2>
          <div className="space-y-6">
            {faqItems.map((item) => (
              <div key={item.q} className="rounded-lg border border-border/60 bg-card p-5">
                <h3 className="text-sm font-semibold text-card-foreground">{item.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-[1000px] px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground">
            더 궁금한 점이 있으신가요?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Enterprise 플랜이나 대량 구매에 대해 상담을 원하시면 문의해 주세요.
          </p>
          <div className="mt-8">
            <Link to="/contact">
              <Button size="lg" variant="outline" >
                문의하기
              </Button>
            </Link>
          </div>
        </div>
      </section>
      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />
    </>
  )
}
