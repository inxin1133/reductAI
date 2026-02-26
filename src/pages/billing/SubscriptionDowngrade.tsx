import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowDown, ArrowLeft, ArrowRight, CalendarClock, Info, Loader2, ShieldAlert } from "lucide-react"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { currencySymbol, formatMoney } from "@/lib/currency"
import { PLAN_TIER_LABELS, type PlanTier } from "@/lib/planTier"
import { appendVisited, type CheckoutFlowState } from "@/lib/billingFlow"

type LocationState = {
  planId?: string
  planName?: string
  billingCycle?: "monthly" | "yearly"
  action?: "change"
  flow?: CheckoutFlowState
}

type SubscriptionChangeQuote = {
  action: "change" | "cancel"
  change_type: string
  schedule: boolean
  currency: string
  tax_rate_percent: number
  charge_amount: number
  tax_amount: number
  total_amount: number
  refund_amount: number
  net_amount: number
  credit_delta: number
  effective_at: string
  next_billing_date: string
  current: {
    plan_id: string
    plan_name?: string | null
    plan_tier?: string | null
    billing_cycle?: string | null
    price_monthly?: number
    price_yearly?: number
  }
  target?: {
    plan_id: string
    plan_name?: string | null
    plan_tier?: string | null
    billing_cycle?: string | null
    price_monthly?: number
    price_yearly?: number
  } | null
}

type SubscriptionChangeResponse = {
  ok?: boolean
  quote?: SubscriptionChangeQuote | null
  message?: string
}

type ApplySubscriptionChangeResponse = {
  ok?: boolean
  quote?: SubscriptionChangeQuote | null
  charge_transaction?: { id?: string | null } | null
  refund_transaction?: { id?: string | null } | null
  message?: string
}

function tierLabel(tier: string | null | undefined): string {
  const raw = typeof tier === "string" ? tier.trim().toLowerCase() : ""
  return PLAN_TIER_LABELS[raw as PlanTier] || raw || "-"
}

function cycleLabel(cycle: string | null | undefined): string {
  if (cycle === "yearly") return "연간"
  if (cycle === "monthly") return "월간"
  return "-"
}

function fmtAmount(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return `${currencySymbol(currency)}${formatMoney(value, currency)}`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(d)
}

export default function SubscriptionDowngrade() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = useMemo(() => (location.state || {}) as LocationState, [location.state])

  const [quote, setQuote] = useState<SubscriptionChangeQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [agreeDowngrade, setAgreeDowngrade] = useState(false)
  const [applying, setApplying] = useState(false)

  const authHeaders = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {}
    const token = window.localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  useEffect(() => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setLoading(false)
      setError("로그인이 필요합니다.")
      return
    }
    if (!state.planId || !state.billingCycle) {
      setLoading(false)
      setError("요금제 정보가 없습니다.")
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch("/api/ai/billing/user/subscription-quote", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "change",
            target_plan_id: state.planId,
            target_billing_cycle: state.billingCycle,
          }),
        })
        const data = (await res.json().catch(() => null)) as SubscriptionChangeResponse | null
        if (!res.ok || !data?.quote) throw new Error(data?.message || "FAILED_QUOTE")
        if (active) setQuote(data.quote)
      } catch (e) {
        console.error(e)
        if (active) setError(e instanceof Error ? e.message : "견적 정보를 불러올 수 없습니다.")
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [authHeaders, state.planId, state.billingCycle])

  const isMonthlyDowngrade = quote?.change_type === "monthly_downgrade"
  const isAnnualDowngrade = quote?.change_type === "annual_downgrade"
  const hasRefund = (quote?.refund_amount ?? 0) > 0
  const hasCharge = (quote?.charge_amount ?? 0) > 0
  const currency = quote?.currency || "USD"

  const currentPlanName = quote?.current?.plan_name || tierLabel(quote?.current?.plan_tier)
  const targetPlanName = quote?.target?.plan_name || tierLabel(quote?.target?.plan_tier)
  const currentCycle = cycleLabel(quote?.current?.billing_cycle)
  const targetCycle = cycleLabel(quote?.target?.billing_cycle)

  const handleApplyMonthlyDowngrade = async () => {
    if (applying) return
    const headers = authHeaders()
    if (!headers.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }

    try {
      setApplying(true)
      const res = await fetch("/api/ai/billing/user/subscription-change", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change",
          target_plan_id: state.planId,
          target_billing_cycle: state.billingCycle,
        }),
      })
      const data = (await res.json().catch(() => null)) as ApplySubscriptionChangeResponse | null
      if (!res.ok || !data?.ok || !data?.quote) throw new Error(data?.message || "FAILED_CHANGE")

      const effectiveAt = data.quote.effective_at
        ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
            new Date(data.quote.effective_at)
          )
        : undefined
      navigate("/billing/complete", {
        state: {
          action: "change",
          changeType: data.quote.change_type,
          schedule: data.quote.schedule,
          planName: data.quote.target?.plan_name ?? data.quote.current?.plan_name,
          billingCycle: data.quote.target?.billing_cycle ?? data.quote.current?.billing_cycle,
          totalAmount: data.quote.total_amount,
          currency: data.quote.currency,
          effectiveAt,
          refundAmount: data.quote.refund_amount,
          chargeAmount: data.quote.total_amount,
          transactionId: data.charge_transaction?.id ?? data.refund_transaction?.id,
        },
      })
    } catch (e) {
      console.error(e)
      alert("다운그레이드 처리에 실패했습니다.")
    } finally {
      setApplying(false)
      setConfirmOpen(false)
    }
  }

  const handleProceedToPayment = () => {
    navigate("/billing/confirm", {
      state: {
        planId: state.planId,
        planName: state.planName ?? quote?.target?.plan_name,
        billingCycle: state.billingCycle,
        action: "change",
        fromDowngrade: true,
        flow: appendVisited(state.flow, "downgrade"),
      },
    })
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="px-6 py-10">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="px-2" onClick={() => navigate(-1)}>
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">다운그레이드</h1>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
              <ShieldAlert className="size-8 text-destructive" />
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
                돌아가기
              </Button>
            </div>
          ) : quote ? (
            <>
              <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                <div className="text-sm font-semibold text-foreground">요금제 변경 요약</div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex-1 rounded-lg border border-border p-3 text-center">
                    <div className="text-xs text-muted-foreground">현재 플랜</div>
                    <div className="mt-1 text-base font-semibold text-foreground">{currentPlanName}</div>
                    <div className="text-xs text-muted-foreground">{currentCycle}</div>
                  </div>
                  <ArrowDown className="size-5 shrink-0 rotate-[-90deg] text-muted-foreground" />
                  <div className="flex-1 rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
                    <div className="text-xs text-muted-foreground">변경 플랜</div>
                    <div className="mt-1 text-base font-semibold text-foreground">{targetPlanName}</div>
                    <div className="text-xs text-muted-foreground">{targetCycle}</div>
                  </div>
                </div>
              </div>

              {isMonthlyDowngrade ? (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-500/30 dark:bg-amber-500/5">
                    <div className="flex items-start gap-3">
                      <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <div className="text-sm font-semibold text-foreground">다음 결제일부터 적용됩니다</div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          이번 달은 현재 <span className="font-medium">{currentPlanName}</span> 등급이 유지됩니다.
                          다음 결제일({fmtDate(quote.effective_at)})부터{" "}
                          <span className="font-medium">{targetPlanName}</span> 등급이 적용되며,
                          그에 맞는 요금과 크레딧이 제공됩니다.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                    <div className="text-sm font-semibold text-foreground">변경 상세</div>
                    <div className="mt-4 grid gap-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">현재 월 요금</span>
                        <span className="text-foreground">{fmtAmount(quote.current.price_monthly, currency)}/월</span>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">변경 후 월 요금</span>
                        <span className="text-foreground">{fmtAmount(quote.target?.price_monthly, currency)}/월</span>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">적용 예정일</span>
                        <span className="font-medium text-foreground">{fmtDate(quote.effective_at)}</span>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">추가 결제/환불</span>
                        <span className="font-medium text-foreground">없음</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
                    <Checkbox
                      checked={agreeDowngrade}
                      onCheckedChange={(checked) => setAgreeDowngrade(Boolean(checked))}
                      aria-label="다운그레이드 동의"
                    />
                    <p className="text-sm text-muted-foreground">
                      다운그레이드 정책을 이해하였으며, 다음 결제일부터 새로운 등급이 적용되는 것에 동의합니다.
                      이번 달은 현재 등급이 유지됩니다.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={() => navigate(-1)}>
                      돌아가기
                    </Button>
                    <Button
                      disabled={!agreeDowngrade || applying}
                      onClick={() => setConfirmOpen(true)}
                    >
                      {applying ? "처리 중..." : "다운그레이드 예약"}
                    </Button>
                  </div>
                </>
              ) : isAnnualDowngrade ? (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-500/30 dark:bg-amber-500/5">
                    <div className="flex items-start gap-3">
                      <Info className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <div className="text-sm font-semibold text-foreground">연간 구독 변경 안내</div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          현재 연간 구독을 취소하고 새로운 플랜으로 전환합니다.
                          연간 약정 중도 취소 시 할인이 적용되지 않는 정상 월 가격으로 사용 기간이 계산되며,
                          남은 차액이 환불됩니다. 이번 달은 현재 등급이 유지되고,
                          새 플랜은 다음 달부터 적용됩니다.
                        </p>
                      </div>
                    </div>
                  </div>

                  {hasRefund ? (
                    <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                      <div className="text-sm font-semibold text-foreground">현재 연간 구독 환불</div>
                      <div className="mt-4 grid gap-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">연간 결제 금액</span>
                          <span className="text-foreground">{fmtAmount(quote.current.price_yearly, currency)}</span>
                        </div>
                        <div className="h-px bg-border" />
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            정상 월 가격({fmtAmount(quote.current.price_monthly, currency)}) x 사용 기간 차감
                          </span>
                          <span className="text-foreground">
                            -{fmtAmount((quote.current.price_yearly ?? 0) - quote.refund_amount, currency)}
                          </span>
                        </div>
                        <div className="h-px bg-border" />
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-medium">환불 예정 금액</span>
                          <span className="text-lg font-bold text-blue-600">{fmtAmount(quote.refund_amount, currency)}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                    <div className="text-sm font-semibold text-foreground">새로운 플랜 결제</div>
                    <div className="mt-4 grid gap-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">새 플랜</span>
                        <span className="font-medium text-foreground">{targetPlanName} · {targetCycle}</span>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          {quote.target?.billing_cycle === "yearly" ? "연간 요금" : "월간 요금"}
                        </span>
                        <span className="text-foreground">
                          {fmtAmount(
                            quote.target?.billing_cycle === "yearly"
                              ? quote.target?.price_yearly
                              : quote.target?.price_monthly,
                            currency
                          )}
                        </span>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">다음 결제일</span>
                        <span className="font-medium text-foreground">{fmtDate(quote.next_billing_date)}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        환불 처리 후 새로운 플랜 결제가 진행됩니다. 다음 단계에서 결제 상세를 확인하실 수 있습니다.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
                    <Checkbox
                      checked={agreeDowngrade}
                      onCheckedChange={(checked) => setAgreeDowngrade(Boolean(checked))}
                      aria-label="다운그레이드 동의"
                    />
                    <p className="text-sm text-muted-foreground">
                      연간 약정 중도 취소에 따른 환불 정책과 새로운 플랜 결제에 동의합니다.
                      정상 월 가격 기준으로 사용분이 차감되고 차액이 환불됩니다.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={() => navigate(-1)}>
                      돌아가기
                    </Button>
                    <Button disabled={!agreeDowngrade} onClick={handleProceedToPayment}>
                      결제 진행
                      <ArrowRight className="ml-1 size-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">변경 정보</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {quote.schedule
                          ? `변경이 ${fmtDate(quote.effective_at)}에 적용됩니다.`
                          : "변경이 즉시 적용됩니다."}
                      </p>
                      {hasCharge ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          추가 결제: {fmtAmount(quote.total_amount, currency)}
                        </p>
                      ) : null}
                      {hasRefund ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          환불 예정: {fmtAmount(quote.refund_amount, currency)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <Button variant="outline" onClick={() => navigate(-1)}>
                      돌아가기
                    </Button>
                    <Button onClick={handleProceedToPayment}>
                      결제 진행
                      <ArrowRight className="ml-1 size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>다운그레이드 최종 확인</DialogTitle>
            <DialogDescription>
              다음 결제일부터 새로운 등급이 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">현재</span>
              <span className="font-medium">{currentPlanName} · {currentCycle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">변경</span>
              <span className="font-medium">{targetPlanName} · {targetCycle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">적용일</span>
              <span className="font-medium">{fmtDate(quote?.effective_at)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={applying}>
              취소
            </Button>
            <Button onClick={handleApplyMonthlyDowngrade} disabled={applying}>
              {applying ? "처리 중..." : "다운그레이드 확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
