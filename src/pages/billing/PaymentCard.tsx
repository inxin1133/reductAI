import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { CreditCard, Lock } from "lucide-react"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { appendVisited, type CheckoutFlowState, writeBillingCard } from "@/lib/billingFlow"
import { detectCardBrand, formatCardNumber, formatExpiry, getCardBrandIcon, normalizeCardNumber, normalizeCvv, parseExpiry } from "@/lib/card"

type LocationState = {
  planId?: string
  planName?: string
  billingCycle?: "monthly" | "yearly"
  allowEdit?: boolean
  flow?: CheckoutFlowState
}

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
  rows?: Array<unknown>
}

export default function PaymentCard() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = useMemo(() => (location.state || {}) as LocationState, [location.state])
  const selectedPlanName = typeof state.planName === "string" ? state.planName : null
  const allowEdit = Boolean(state.allowEdit)
  const canGoBack = Boolean(state.flow?.visited?.length)
  const inFlow = Boolean(state.flow?.visited?.length)

  const [cardNumber, setCardNumber] = useState("")
  const [cardHolder, setCardHolder] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const [saving, setSaving] = useState(false)

  const formattedCardNumber = useMemo(() => formatCardNumber(cardNumber), [cardNumber])
  const cardNumberDisplay = formattedCardNumber || "0000 0000 0000 0000"
  const cardHolderDisplay = cardHolder.trim() || "카드 소유자"
  const cardExpiryDisplay = cardExpiry || "MM/YY"
  const cardBrand = useMemo(() => detectCardBrand(cardNumber), [cardNumber])
  const CardBrandIcon = getCardBrandIcon(cardBrand)

  const authHeaders = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {}
    const token = window.localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const fetchBillingStatus = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) return null
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

    return { hasCard, hasInfo }
  }, [authHeaders])

  useEffect(() => {
    if (allowEdit || inFlow) return
    let cancelled = false

    void (async () => {
      try {
        const status = await fetchBillingStatus()
        if (!status || cancelled) return
        if (status.hasCard && status.hasInfo) {
          navigate("/billing/confirm", { replace: true, state })
          return
        }
        if (status.hasCard) {
          navigate("/billing/info", { replace: true, state })
        }
      } catch (e) {
        console.error(e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [allowEdit, fetchBillingStatus, navigate, state, inFlow])

  const handleNext = async () => {
    if (saving) return
    const digits = normalizeCardNumber(cardNumber)
    if (!digits || digits.length < 12 || !cardBrand) {
      alert("카드 번호를 확인해주세요.")
      return
    }
    const last4 = digits ? digits.slice(-4) : ""
    const { month, year } = parseExpiry(cardExpiry)
    if (month && (month < 1 || month > 12)) {
      alert("유효기간 월을 확인해주세요.")
      return
    }
    if (year && year < 2000) {
      alert("유효기간 년도를 확인해주세요.")
      return
    }

    const headers = authHeaders()
    if (!headers.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }

    try {
      setSaving(true)
      const res = await fetch("/api/ai/billing/user/payment-methods", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "toss",
          type: "card",
          card_brand: cardBrand,
          card_last4: last4,
          card_exp_month: month,
          card_exp_year: year,
          metadata: { holder: cardHolder.trim() || null },
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "FAILED_SAVE")
      }

      writeBillingCard({
        brand: cardBrand ?? undefined,
        last4: last4 || undefined,
        holder: cardHolder.trim() || undefined,
        expiry: cardExpiry || undefined,
      })

      const status = await fetchBillingStatus()
      const target = status?.hasInfo ? "/billing/confirm" : "/billing/info"
      navigate(target, {
        state: {
          planId: state.planId,
          planName: state.planName,
          billingCycle: state.billingCycle,
          flow: appendVisited(state.flow, "card"),
        },
      })
    } catch (e) {
      console.error(e)
      alert("카드 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header className="" />
      <main className="px-6 py-10">

        <div className="mx-auto flex w-full max-w-[700px] flex-col gap-5">
          <div className="text-center flex flex-col gap-3">
            <h1 className="text-xl font-bold text-foreground">결제 카드 등록</h1>

            {selectedPlanName ? (
              <p className="mt-1 text-base text-muted-foreground">
                선택한 요금제: <span className="font-semibold text-foreground">{selectedPlanName}</span>
              </p>
            ) : null}

          </div>



          <div className="grid grid-cols-1 gap-6 md:grid-cols-2  justify-between w-full gap-4 items-center rounded-xl border border-border bg-background p-4 shadow-sm">



            <div className="flex-1">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-4">
                <Lock className="size-3" />
                <span>256-bit SSL 암호화로 안전하게 보호됩니다.</span>
              </div>
              <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 p-5 text-white shadow-md">
                <div className="flex items-start justify-between">
                  {CardBrandIcon ? (
                    <CardBrandIcon className="h-6 w-9" />
                  ) : (
                    <CreditCard className="size-6 text-white/90" />
                  )}
                  <span className="text-xs text-white/80">Card</span>
                </div>
                <div className="mt-6 text-lg tracking-[0.18em]">{cardNumberDisplay}</div>
                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-white/70">카드 소유자</p>
                    <p className="text-sm font-semibold">{cardHolderDisplay}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-white/70">유효기간</p>
                    <p className="text-sm font-semibold">{cardExpiryDisplay}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-foreground">카드 번호</label>
                <Input
                  value={formattedCardNumber}
                  onChange={(event) => setCardNumber(normalizeCardNumber(event.target.value))}
                  placeholder="1234 1234 1234 1234"
                  inputMode="numeric"
                  autoComplete="cc-number"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-foreground">카드 소유자 이름</label>
                <Input
                  value={cardHolder}
                  onChange={(event) => setCardHolder(event.target.value)}
                  placeholder="카드 소유자 이름"
                  autoComplete="cc-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-foreground">유효기간</label>
                  <Input
                    value={cardExpiry}
                    onChange={(event) => setCardExpiry(formatExpiry(event.target.value))}
                    placeholder="MM/YY"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-foreground">CVV</label>
                  <Input
                    value={cardCvv}
                    onChange={(event) => setCardCvv(normalizeCvv(event.target.value))}
                    placeholder="123"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                  />
                </div>
              </div>
            </div>

          </div>
          <div className="flex items-center justify-between">
            {canGoBack ? (
              <Button type="button" variant="outline" className="min-w-[120px]" onClick={() => navigate(-1)}>
                이전
              </Button>
            ) : (
              <div />
            )}
            <Button type="button" className="min-w-[120px]" onClick={handleNext}>
              다음 단계
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
