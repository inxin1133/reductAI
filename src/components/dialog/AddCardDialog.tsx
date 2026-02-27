import { useCallback, useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CreditCard, Lock } from "lucide-react"
import {
  detectCardBrand,
  formatCardNumber,
  formatExpiry,
  getCardBrandIcon,
  normalizeCardNumber,
  normalizeCvv,
  parseExpiry,
} from "@/lib/card"

type AddCardDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void | Promise<unknown>
  getAuthHeaders?: () => Record<string, string>
}

function resolveAuthHeaders(getAuthHeaders?: () => Record<string, string>): Record<string, string> {
  if (getAuthHeaders) return getAuthHeaders()
  if (typeof window === "undefined") return {}
  const token = window.localStorage.getItem("token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function AddCardDialog({ open, onOpenChange, onSaved, getAuthHeaders }: AddCardDialogProps) {
  const [cardNumber, setCardNumber] = useState("")
  const [cardHolder, setCardHolder] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setCardNumber("")
    setCardHolder("")
    setCardExpiry("")
    setCardCvv("")
  }, [open])

  const formattedCardNumber = useMemo(() => formatCardNumber(cardNumber), [cardNumber])
  const cardNumberDisplay = formattedCardNumber || "0000 0000 0000 0000"
  const cardHolderDisplay = cardHolder.trim() || "카드 소유자"
  const cardExpiryDisplay = cardExpiry || "MM/YY"
  const cardBrand = useMemo(() => detectCardBrand(cardNumber), [cardNumber])
  const CardBrandIcon = getCardBrandIcon(cardBrand)
  const canSaveCard = Boolean(cardBrand && normalizeCardNumber(cardNumber).length >= 4 && !saving)

  const handleSaveCard = useCallback(async () => {
    if (!canSaveCard || !cardBrand) return
    const digits = normalizeCardNumber(cardNumber)
    const last4 = digits.slice(-4)
    const { month, year } = parseExpiry(cardExpiry)
    if (month && (month < 1 || month > 12)) {
      alert("유효기간 월을 확인해주세요.")
      return
    }
    if (year && year < 2000) {
      alert("유효기간 년도를 확인해주세요.")
      return
    }

    const headers = resolveAuthHeaders(getAuthHeaders)
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
      if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_SAVE")
      if (onSaved) await onSaved()
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      alert("카드 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }, [canSaveCard, cardBrand, cardExpiry, cardHolder, cardNumber, getAuthHeaders, onOpenChange, onSaved])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>카드 추가</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
              <Lock className="size-3" />
              <span>256-bit SSL 암호화로 안전하게 보호됩니다.</span>
            </div>
            <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 p-5 text-white shadow-md">
              <div className="flex items-start justify-between">
                {CardBrandIcon ? <CardBrandIcon className="h-6 w-9" /> : <CreditCard className="size-6 text-white/90" />}
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

          <div className="grid gap-3">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSaveCard} disabled={!canSaveCard}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
