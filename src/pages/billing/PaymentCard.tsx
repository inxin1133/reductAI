import { useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { CreditCard, Lock } from "lucide-react"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CardAmex } from "@/components/icons/CardAmex"
import { CardJcb } from "@/components/icons/CardJcb"
import { CardMaster } from "@/components/icons/CardMaster"
import { CardUnion } from "@/components/icons/CardUnion"
import { CardVisa } from "@/components/icons/CardVisa"

type LocationState = {
  planId?: string
  planName?: string
  billingCycle?: "monthly" | "yearly"
}

type CardBrand = "visa" | "master" | "amex" | "jcb" | "union"

function normalizeCardNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 16)
}

function formatCardNumber(value: string): string {
  const digits = normalizeCardNumber(value)
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ")
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

function normalizeCvv(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4)
}

function detectCardBrand(rawDigits: string): CardBrand | null {
  const digits = rawDigits.replace(/\D/g, "")
  if (digits.length < 4) return null
  const first2 = Number(digits.slice(0, 2))
  const first4 = Number(digits.slice(0, 4))

  if (digits.startsWith("4")) return "visa"
  if ((first2 >= 51 && first2 <= 55) || (first4 >= 2221 && first4 <= 2720)) return "master"
  if (digits.startsWith("34") || digits.startsWith("37")) return "amex"
  if (first4 >= 3528 && first4 <= 3589) return "jcb"
  if (digits.startsWith("62")) return "union"
  return null
}

export default function PaymentCard() {
  const location = useLocation()
  const state = (location.state || {}) as LocationState
  const selectedPlanName = typeof state.planName === "string" ? state.planName : null

  const [cardNumber, setCardNumber] = useState("")
  const [cardHolder, setCardHolder] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")

  const formattedCardNumber = useMemo(() => formatCardNumber(cardNumber), [cardNumber])
  const cardNumberDisplay = formattedCardNumber || "0000 0000 0000 0000"
  const cardHolderDisplay = cardHolder.trim() || "카드 소유자"
  const cardExpiryDisplay = cardExpiry || "MM/YY"
  const cardBrand = useMemo(() => detectCardBrand(cardNumber), [cardNumber])
  const CardBrandIcon =
    cardBrand === "visa"
      ? CardVisa
      : cardBrand === "master"
        ? CardMaster
        : cardBrand === "amex"
          ? CardAmex
          : cardBrand === "jcb"
            ? CardJcb
            : cardBrand === "union"
              ? CardUnion
              : null

  return (
    <div className="min-h-screen bg-muted/20">
      <Header className="" />
      <main className="px-6 py-10">

        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-5">
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
            <div></div>
            {/* <Button type="button" variant="outline" className="min-w-[120px]" onClick={() => navigate(-1)}>
              이전
            </Button> */}
            <Button type="button" className="min-w-[120px]">
              다음 단계
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
