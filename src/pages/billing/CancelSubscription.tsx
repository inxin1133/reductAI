import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AlertTriangle, ArrowLeft, CalendarOff, Info, Loader2, ShieldAlert } from "lucide-react"
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

type LocationState = {
  action?: "cancel"
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

export default function CancelSubscription() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = useMemo(() => (location.state || {}) as LocationState, [location.state])

  const [quote, setQuote] = useState<SubscriptionChangeQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [agreeCancel, setAgreeCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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

    let active = true
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch("/api/ai/billing/user/subscription-quote", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        })
        const data = (await res.json().catch(() => null)) as SubscriptionChangeResponse | null
        if (!res.ok || !data?.quote) throw new Error(data?.message || "FAILED_QUOTE")
        if (active) setQuote(data.quote)
      } catch (e) {
        console.error(e)
        if (active) setError(e instanceof Error ? e.message : "구독 정보를 불러올 수 없습니다.")
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [authHeaders])

  const isYearly = quote?.current?.billing_cycle === "yearly"
  const hasRefund = (quote?.refund_amount ?? 0) > 0
  const currency = quote?.currency || "USD"

  const handleConfirmCancel = async () => {
    if (cancelling) return
    const headers = authHeaders()
    if (!headers.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }

    try {
      setCancelling(true)
      const res = await fetch("/api/ai/billing/user/subscription-change", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      })
      const data = (await res.json().catch(() => null)) as ApplySubscriptionChangeResponse | null
      if (!res.ok || !data?.ok || !data?.quote) throw new Error(data?.message || "FAILED_CANCEL")

      const effectiveAt = data.quote.effective_at
        ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
            new Date(data.quote.effective_at)
          )
        : undefined
      const transactionId = data.refund_transaction?.id ?? data.charge_transaction?.id
      navigate("/billing/complete", {
        state: {
          action: "cancel",
          changeType: data.quote.change_type,
          schedule: data.quote.schedule,
          planName: data.quote.current?.plan_name,
          billingCycle: data.quote.current?.billing_cycle,
          totalAmount: data.quote.total_amount,
          currency: data.quote.currency,
          effectiveAt,
          refundAmount: data.quote.refund_amount,
          chargeAmount: data.quote.total_amount,
          transactionId,
        },
      })
    } catch (e) {
      console.error(e)
      alert("구독 취소 처리에 실패했습니다.")
    } finally {
      setCancelling(false)
      setConfirmOpen(false)
    }
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
            <h1 className="text-2xl font-bold text-foreground">구독 취소</h1>
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
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">구독을 취소하시겠습니까?</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isYearly
                        ? "연간 구독을 취소하면 정상 월 가격 기준으로 사용 기간이 계산되며, 남은 차액이 환불됩니다. 이번 달 말까지 현재 서비스를 이용할 수 있습니다."
                        : "월간 구독을 취소하면 현재 결제 기간이 끝날 때까지 서비스를 이용할 수 있으며, 이후 유료 구독이 중지됩니다. 환불은 없습니다."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                <div className="text-sm font-semibold text-foreground">현재 구독 정보</div>
                <div className="mt-4 grid gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">플랜</span>
                    <span className="font-medium text-foreground">
                      {quote.current.plan_name || tierLabel(quote.current.plan_tier)}
                    </span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">결제 주기</span>
                    <span className="font-medium text-foreground">{cycleLabel(quote.current.billing_cycle)}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {isYearly ? "연간 결제 금액" : "월간 결제 금액"}
                    </span>
                    <span className="font-medium text-foreground">
                      {fmtAmount(isYearly ? quote.current.price_yearly : quote.current.price_monthly, currency)}
                    </span>
                  </div>
                </div>
              </div>

              {isYearly && hasRefund ? (
                <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                  <div className="text-sm font-semibold text-foreground">환불 계산</div>
                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">연간 결제 금액</span>
                      <span className="text-foreground">{fmtAmount(quote.current.price_yearly, currency)}</span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">정상 월 가격 기준 사용분 차감</span>
                      <span className="text-foreground">
                        {fmtAmount((quote.current.price_yearly ?? 0) - quote.refund_amount, currency)}
                      </span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">환불 예정 금액</span>
                      <span className="text-lg font-bold text-blue-600">{fmtAmount(quote.refund_amount, currency)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      연간 약정 중도 취소 시 할인이 적용되지 않는 정상 월 가격(
                      {fmtAmount(quote.current.price_monthly, currency)}/월)으로 사용 기간을 계산한 후, 남은 차액만 환불됩니다.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                <div className="text-sm font-semibold text-foreground">취소 후 일정</div>
                <div className="mt-4 grid gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">서비스 종료일</span>
                    <span className="font-medium text-foreground">{fmtDate(quote.effective_at)}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">상태</span>
                    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30">
                      예약 취소
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                  <CalendarOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {isYearly
                      ? "이번 달 말까지 현재 등급의 모든 기능을 이용할 수 있습니다. 이후 무료 플랜으로 전환됩니다."
                      : "현재 결제 기간 종료일까지 모든 기능을 이용할 수 있습니다. 이후 무료 플랜으로 전환됩니다."}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
                <Checkbox
                  checked={agreeCancel}
                  onCheckedChange={(checked) => setAgreeCancel(Boolean(checked))}
                  aria-label="취소 동의"
                />
                <p className="text-sm text-muted-foreground">
                  구독 취소 정책을 이해하였으며,{" "}
                  {isYearly
                    ? "연간 약정 중도 취소에 따른 환불 정책에 동의합니다."
                    : "현재 결제 기간 종료 후 구독이 중지되는 것에 동의합니다."}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => navigate(-1)}>
                  돌아가기
                </Button>
                <Button
                  variant="destructive"
                  disabled={!agreeCancel || cancelling}
                  onClick={() => setConfirmOpen(true)}
                >
                  {cancelling ? "처리 중..." : "구독 취소"}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </main>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>구독 취소 최종 확인</DialogTitle>
            <DialogDescription>
              정말 구독을 취소하시겠습니까? 이 작업은 되돌릴 수 있지만, 취소 후 다시 구독하려면 새로 결제해야 합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">플랜</span>
              <span className="font-medium">
                {quote?.current.plan_name || tierLabel(quote?.current.plan_tier)}
              </span>
            </div>
            {hasRefund ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">환불 예정</span>
                <span className="font-medium text-blue-600">{fmtAmount(quote?.refund_amount, currency)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">서비스 종료일</span>
              <span className="font-medium">{fmtDate(quote?.effective_at)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={cancelling}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={cancelling}>
              {cancelling ? "처리 중..." : "구독 취소 확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
