import { Check, CheckCircle2, Download, ArrowRight } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"

type LocationState = {
  planName?: string
  billingCycle?: "monthly" | "yearly"
  totalAmount?: number
  currency?: string
  nextBillingDate?: string
  transactionId?: string
}

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  KRW: 0,
  JPY: 0,
  CNY: 2,
  HKD: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
}

function currencyDecimals(currency: string) {
  const key = String(currency || "").toUpperCase()
  return CURRENCY_DECIMALS[key] ?? 2
}

function currencySymbol(currency: string) {
  const key = String(currency || "").toUpperCase()
  switch (key) {
    case "KRW":
      return "₩"
    case "USD":
      return "$"
    case "JPY":
      return "¥"
    case "EUR":
      return "€"
    case "GBP":
      return "£"
    case "CNY":
      return "¥"
    case "HKD":
      return "HK$"
    case "SGD":
      return "S$"
    case "AUD":
      return "A$"
    case "CAD":
      return "C$"
    default:
      return `${key} `
  }
}

function formatMoney(value: number, currency: string) {
  const decimals = currencyDecimals(currency)
  return value.toLocaleString("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function PaymentComplete() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as LocationState
  const planName = state.planName ?? "Professional"
  const billingCycleLabel = state.billingCycle === "yearly" ? "연간" : "월간"
  const totalAmount = state.totalAmount ?? 86900
  const currency = state.currency ?? "USD"
  const nextBillingDate = state.nextBillingDate ?? (() => {
    const now = new Date()
    const next = new Date(now)
    if (state.billingCycle === "yearly") {
      next.setFullYear(now.getFullYear() + 1)
    } else {
      next.setMonth(now.getMonth() + 1)
    }
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(next)
  })()
  const transactionId = state.transactionId ?? "TXN177146175864291ZVJJMH1"

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="px-6 py-14">
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="size-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">결제가 완료되었습니다!</h1>
            <p className="text-sm text-muted-foreground">
              환영합니다! {planName} 플랜이 성공적으로 활성화되었습니다.
            </p>
          </div>

          <div className="w-full rounded-xl border border-border bg-background shadow-sm">
            <div className="grid gap-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">플랜</span>
                <span className="font-semibold text-foreground">{planName}</span>
              </div>
              <div className="h-px w-full bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">결제 금액</span>
                <span className="text-lg font-semibold text-foreground">
                  {currencySymbol(currency)}
                  {formatMoney(totalAmount, currency)}
                </span>
              </div>
              <div className="h-px w-full bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">결제 주기</span>
                <span className="font-semibold text-foreground">{billingCycleLabel}</span>
              </div>
              <div className="h-px w-full bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">다음 결제일</span>
                <span className="font-semibold text-foreground">{nextBillingDate}</span>
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
              {[
                "이메일로 영수증과 구독 확인 이메일이 발송되었습니다.",
                `대시보드에서 모든 ${planName} 플랜 기능을 사용할 수 있습니다.`,
                "계정 설정에서 언제든지 플랜을 변경하거나 구독을 취소할 수 있습니다.",
              ].map((item) => (
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
