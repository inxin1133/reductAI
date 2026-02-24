import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, CheckCircle2, Download, ArrowRight } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { currencySymbol, formatMoney } from "@/lib/currency"

type LocationState = {
  planName?: string
  billingCycle?: "monthly" | "yearly"
  totalAmount?: number
  currency?: string
  nextBillingDate?: string
  transactionId?: string
  action?: "new" | "change" | "cancel"
  changeType?: string
  schedule?: boolean
  effectiveAt?: string
  refundAmount?: number
  chargeAmount?: number
}

type CheckoutSummary = {
  plan_name?: string | null
  plan_tier?: string | null
  billing_cycle?: "monthly" | "yearly" | string | null
  total_amount?: number | null
  currency?: string | null
  next_billing_date?: string | null
  transaction_id?: string | null
  transaction_status?: string | null
  invoice_id?: string | null
  invoice_number?: string | null
  invoice_status?: string | null
  processed_at?: string | null
}

type CheckoutSummaryResponse = {
  ok?: boolean
  summary?: CheckoutSummary | null
  message?: string
}

export default function PaymentComplete() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = useMemo(() => (location.state || {}) as LocationState, [location.state])
  const action = state.action ?? "new"
  const isChangeFlow = action === "change" || action === "cancel"
  const [summary, setSummary] = useState<CheckoutSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const authHeaders = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {}
    const token = window.localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const fallbackSummary = useMemo<CheckoutSummary>(
    () => ({
      plan_name: state.planName ?? null,
      billing_cycle: state.billingCycle ?? null,
      total_amount: typeof state.totalAmount === "number" ? state.totalAmount : null,
      currency: state.currency ?? null,
      next_billing_date: state.nextBillingDate ?? null,
      transaction_id: state.transactionId ?? null,
    }),
    [state.billingCycle, state.currency, state.nextBillingDate, state.planName, state.totalAmount, state.transactionId]
  )

  useEffect(() => {
    const headers = authHeaders()
    if (!headers.Authorization) return
    if (isChangeFlow && !state.transactionId) return

    const params = new URLSearchParams()
    const searchParams = new URLSearchParams(location.search)
    const transactionId = state.transactionId || searchParams.get("transaction_id") || searchParams.get("tx")
    const invoiceId = searchParams.get("invoice_id") || searchParams.get("invoice")

    if (transactionId) {
      params.set("transaction_id", transactionId)
    } else if (invoiceId) {
      params.set("invoice_id", invoiceId)
    }

    const url = params.toString()
      ? `/api/ai/billing/user/checkout-summary?${params.toString()}`
      : "/api/ai/billing/user/checkout-summary"

    let active = true
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch(url, { headers })
        const data = (await res.json().catch(() => null)) as CheckoutSummaryResponse | null
        if (!res.ok || !data?.summary) throw new Error(data?.message || "FAILED_LOAD")
        if (active) setSummary(data.summary)
      } catch (e) {
        console.error(e)
        if (active) setError("결제 정보를 불러오지 못했습니다.")
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [authHeaders, isChangeFlow, location.search, state.transactionId])

  const resolved = summary ?? fallbackSummary
  const planName = resolved.plan_name ?? "-"
  const planLabel = resolved.plan_name ? `${resolved.plan_name} 플랜` : "선택한 플랜"
  const billingCycleLabel =
    resolved.billing_cycle === "yearly" ? "연간" : resolved.billing_cycle === "monthly" ? "월간" : "-"
  const currency = resolved.currency || "USD"
  const totalAmount = resolved.total_amount
  const chargeAmount = typeof state.chargeAmount === "number" ? state.chargeAmount : totalAmount ?? 0
  const refundAmount = typeof state.refundAmount === "number" ? state.refundAmount : 0
  const netAmount = typeof chargeAmount === "number" ? chargeAmount - refundAmount : null
  const transactionId = resolved.transaction_id || "-"
  const nextBillingDate = (() => {
    const value = resolved.next_billing_date || state.nextBillingDate
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(parsed)
  })()
  const effectiveAt = state.effectiveAt || "-"
  const totalLabel =
    typeof totalAmount === "number" && Number.isFinite(totalAmount)
      ? `${currencySymbol(currency)}${formatMoney(totalAmount, currency)}`
      : loading
        ? "불러오는 중"
        : "-"
  const chargeLabel =
    typeof chargeAmount === "number" && Number.isFinite(chargeAmount)
      ? `${currencySymbol(currency)}${formatMoney(chargeAmount, currency)}`
      : "-"
  const refundLabel =
    typeof refundAmount === "number" && Number.isFinite(refundAmount) && refundAmount > 0
      ? `${currencySymbol(currency)}${formatMoney(refundAmount, currency)}`
      : "-"
  const netLabel =
    typeof netAmount === "number" && Number.isFinite(netAmount)
      ? `${currencySymbol(currency)}${formatMoney(netAmount, currency)}`
      : "-"

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="px-6 py-14">
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="size-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {action === "cancel"
                ? "구독 취소 요청이 완료되었습니다!"
                : isChangeFlow
                  ? state.schedule
                    ? "요금제 변경이 예약되었습니다!"
                    : "요금제 변경이 완료되었습니다!"
                  : "결제가 완료되었습니다!"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {action === "cancel"
                ? `${planLabel}은 종료일까지 유지됩니다.`
                : isChangeFlow
                  ? `${planLabel} 변경 내용이 반영되었습니다.`
                  : `환영합니다! ${planLabel}이 성공적으로 활성화되었습니다.`}
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>

          <div className="w-full rounded-xl border border-border bg-background shadow-sm">
            <div className="grid gap-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">플랜</span>
                <span className="font-semibold text-foreground">{planName}</span>
              </div>
              <div className="h-px w-full bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {isChangeFlow ? "결제 금액" : "결제 금액"}
                </span>
                <span className="text-lg font-semibold text-foreground">{isChangeFlow ? chargeLabel : totalLabel}</span>
              </div>
              {isChangeFlow && refundAmount > 0 ? (
                <>
                  <div className="h-px w-full bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">환불 예정</span>
                    <span className="text-lg font-semibold text-foreground">{refundLabel}</span>
                  </div>
                  <div className="h-px w-full bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">최종 정산 금액</span>
                    <span className="text-lg font-semibold text-foreground">{netLabel}</span>
                  </div>
                </>
              ) : null}
              <div className="h-px w-full bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">결제 주기</span>
                <span className="font-semibold text-foreground">{billingCycleLabel}</span>
              </div>
              <div className="h-px w-full bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{isChangeFlow ? "적용일" : "다음 결제일"}</span>
                <span className="font-semibold text-foreground">{isChangeFlow ? effectiveAt : nextBillingDate}</span>
              </div>
              <div className="h-px w-full bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">거래 번호</span>
                <span className="text-sm font-semibold text-foreground">{transactionId}</span>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button variant="outline" className="min-w-[180px]">
              <Download className="size-4" />
              영수증 다운로드
            </Button>
            <Button className="min-w-[180px]" onClick={() => navigate("/front-ai")}>
              리덕트 화면으로 이동
              <ArrowRight className="size-4" />
            </Button>
          </div>

          <div className="w-full rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="text-sm font-semibold text-foreground">다음 단계</div>
            <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              {(isChangeFlow
                ? action === "cancel"
                  ? ["구독은 적용일까지 유지됩니다.", "필요 시 언제든지 다시 구독할 수 있습니다."]
                  : ["변경 내용이 적용되었습니다.", "계정 설정에서 언제든지 플랜을 다시 변경할 수 있습니다."]
                : [
                    "이메일로 영수증과 구독 확인 이메일이 발송되었습니다.",
                    `대시보드에서 모든 ${planLabel} 기능을 사용할 수 있습니다.`,
                    "계정 설정에서 언제든지 플랜을 변경하거나 구독을 취소할 수 있습니다.",
                  ]
              ).map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <Check className="size-3" />
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
