import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { CardAmex } from "@/components/icons/CardAmex"
import { CardJcb } from "@/components/icons/CardJcb"
import { CardMaster } from "@/components/icons/CardMaster"
import { CardUnion } from "@/components/icons/CardUnion"
import { CardVisa } from "@/components/icons/CardVisa"
import { type CardBrand, type BillingInfoProfile, readBillingCard, readBillingInfo, hasBillingCard, hasBillingInfo, writeBillingCard, writeBillingInfo } from "@/lib/billingFlow"
import { CreditCard, Lock, Plus, WalletCards, FilePenLine } from "lucide-react"
import { cn } from "@/lib/utils"

type LocationState = {
  planId?: string
  planName?: string
  billingCycle?: "monthly" | "yearly"
}

const EMPTY_BILLING_INFO: BillingInfoProfile = {
  name: "",
  email: "",
  postalCode: "",
  address1: "",
  address2: "",
  extraAddress: "",
  phone: "",
}

const DAUM_POSTCODE_SCRIPT_ID = "daum-postcode-script"

type CardOption = {
  id: string
  brand: CardBrand
  label: string
  last4: string
  expiry: string
  holder: string
  isDefault: boolean
  bg: string
}

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

export default function PaymentConfirm() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as LocationState
  const selectedPlanName = typeof state.planName === "string" ? state.planName : null
  const billingCycleLabel = state.billingCycle === "yearly" ? "연간 구독" : "월간 구독"
  const basePrice = state.billingCycle === "yearly" ? 790000 : 79000
  const vatAmount = Math.round(basePrice * 0.1)
  const totalAmount = basePrice + vatAmount

  const [card, setCard] = useState(() => readBillingCard())
  const [billingInfo, setBillingInfo] = useState<BillingInfoProfile>(() => readBillingInfo() ?? EMPTY_BILLING_INFO)
  const [couponCode, setCouponCode] = useState("")
  const [agreeTerms, setAgreeTerms] = useState(true)
  const [isCardSelectOpen, setIsCardSelectOpen] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [isCardAddOpen, setIsCardAddOpen] = useState(false)
  const [addCardNumber, setAddCardNumber] = useState("")
  const [addCardHolder, setAddCardHolder] = useState("")
  const [addCardExpiry, setAddCardExpiry] = useState("")
  const [addCardCvv, setAddCardCvv] = useState("")
  const [isBillingEditOpen, setIsBillingEditOpen] = useState(false)
  const [billingForm, setBillingForm] = useState<BillingInfoProfile>(billingInfo)
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const detailAddressRef = useRef<HTMLInputElement | null>(null)

  const [cardOptions, setCardOptions] = useState<CardOption[]>(() => [
    { id: "visa-1234", brand: "visa" as const, label: "Visa", last4: "1234", expiry: "12/28", holder: "Kangwoo", isDefault: true, bg: "bg-[#1a1f71]" },
    { id: "master-5678", brand: "master" as const, label: "Mastercard", last4: "5678", expiry: "08/27", holder: "Kangwoo", isDefault: false, bg: "bg-[#f5f5f5] dark:bg-neutral-800" },
    { id: "amex-9012", brand: "amex" as const, label: "Amex", last4: "9012", expiry: "03/26", holder: "Kangwoo", isDefault: false, bg: "bg-[#006fcf]" },
  ])

  useEffect(() => {
    if (!hasBillingCard()) {
      navigate("/billing/card", { replace: true })
      return
    }
    if (!hasBillingInfo()) {
      navigate("/billing/info", { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    if (!isBillingEditOpen) return
    setBillingForm(billingInfo)
  }, [billingInfo, isBillingEditOpen])

  useEffect(() => {
    if (!isCardAddOpen) return
    setAddCardNumber("")
    setAddCardHolder("")
    setAddCardExpiry("")
    setAddCardCvv("")
  }, [isCardAddOpen])

  useEffect(() => {
    if (!isCardSelectOpen) return
    const match = cardOptions.find((option) => option.brand === card?.brand && option.last4 === card?.last4)
    setSelectedCardId(match?.id ?? cardOptions[0]?.id ?? null)
  }, [card?.brand, card?.last4, cardOptions, isCardSelectOpen])

  const handleSelectCard = () => {
    if (!selectedCardId) return
    const selected = cardOptions.find((option) => option.id === selectedCardId)
    if (!selected) return
    writeBillingCard({
      brand: selected.brand,
      last4: selected.last4,
      holder: selected.holder,
      expiry: selected.expiry,
    })
    setCard({
      brand: selected.brand,
      last4: selected.last4,
      holder: selected.holder,
      expiry: selected.expiry,
    })
    setIsCardSelectOpen(false)
  }

  const CardIcon =
    card?.brand === "visa"
      ? CardVisa
      : card?.brand === "master"
        ? CardMaster
        : card?.brand === "amex"
          ? CardAmex
          : card?.brand === "jcb"
            ? CardJcb
            : card?.brand === "union"
              ? CardUnion
              : null
  const billingAddress = [billingInfo?.address1, billingInfo?.address2, billingInfo?.extraAddress]
    .filter(Boolean)
    .join(" ")

  const addFormattedCardNumber = useMemo(() => formatCardNumber(addCardNumber), [addCardNumber])
  const addCardNumberDisplay = addFormattedCardNumber || "0000 0000 0000 0000"
  const addCardHolderDisplay = addCardHolder.trim() || "카드 소유자"
  const addCardExpiryDisplay = addCardExpiry || "MM/YY"
  const addCardBrand = useMemo(() => detectCardBrand(addCardNumber), [addCardNumber])
  const AddCardIcon =
    addCardBrand === "visa"
      ? CardVisa
      : addCardBrand === "master"
        ? CardMaster
        : addCardBrand === "amex"
          ? CardAmex
          : addCardBrand === "jcb"
            ? CardJcb
            : addCardBrand === "union"
              ? CardUnion
              : null
  const canSaveCard = Boolean(addCardBrand && normalizeCardNumber(addCardNumber).length >= 4)

  const handleSaveCard = () => {
    if (!canSaveCard || !addCardBrand) return
    const digits = normalizeCardNumber(addCardNumber)
    const last4 = digits.slice(-4)
    const label =
      addCardBrand === "visa"
        ? "Visa"
        : addCardBrand === "master"
          ? "Mastercard"
          : addCardBrand === "amex"
            ? "Amex"
            : addCardBrand === "jcb"
              ? "JCB"
              : "UnionPay"
    const bg =
      addCardBrand === "visa"
        ? "bg-[#1a1f71]"
        : addCardBrand === "master"
          ? "bg-[#f5f5f5] dark:bg-neutral-800"
          : addCardBrand === "amex"
            ? "bg-[#006fcf]"
            : addCardBrand === "jcb"
              ? "bg-[#1b5e20]"
              : "bg-[#d81f26]"
    const nextCard = {
      id: `${addCardBrand}-${last4}-${Date.now()}`,
      brand: addCardBrand,
      label,
      last4,
      expiry: addCardExpiry || "MM/YY",
      holder: addCardHolder.trim() || "사용자",
      isDefault: false,
      bg,
    }
    setCardOptions((prev) => [nextCard, ...prev])
    writeBillingCard({
      brand: nextCard.brand,
      last4: nextCard.last4,
      holder: nextCard.holder,
      expiry: nextCard.expiry,
    })
    setCard({
      brand: nextCard.brand,
      last4: nextCard.last4,
      holder: nextCard.holder,
      expiry: nextCard.expiry,
    })
    setIsCardAddOpen(false)
  }

  const loadDaumPostcode = useCallback(() => {
    if (typeof window === "undefined") return Promise.reject(new Error("no-window"))
    if ((window as Window & { daum?: { Postcode?: unknown } }).daum?.Postcode) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(DAUM_POSTCODE_SCRIPT_ID) as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener("error", () => reject(new Error("postcode-load-failed")), { once: true })
        return
      }
      const script = document.createElement("script")
      script.id = DAUM_POSTCODE_SCRIPT_ID
      script.async = true
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("postcode-load-failed"))
      document.body.appendChild(script)
    })
  }, [])

  const handleSearchPostcode = useCallback(async () => {
    if (postcodeLoading) return
    setPostcodeLoading(true)
    try {
      await loadDaumPostcode()
      const PostcodeCtor = (window as Window & { daum?: { Postcode?: new (args: unknown) => { open: () => void } } }).daum
        ?.Postcode
      if (!PostcodeCtor) return
      new PostcodeCtor({
        oncomplete: (data: {
          zonecode?: string
          roadAddress?: string
          jibunAddress?: string
          userSelectedType?: "R" | "J"
          bname?: string
          buildingName?: string
          apartment?: "Y" | "N"
        }) => {
          const address =
            data.userSelectedType === "R" ? data.roadAddress || "" : data.jibunAddress || ""
          let extra = ""
          if (data.userSelectedType === "R") {
            if (data.bname && /[동|로|가]$/g.test(data.bname)) extra += data.bname
            if (data.buildingName && data.apartment === "Y") {
              extra += extra ? `, ${data.buildingName}` : data.buildingName
            }
            if (extra) extra = `(${extra})`
          }
          setBillingForm((prev) => ({
            ...prev,
            postalCode: data.zonecode || "",
            address1: address,
            extraAddress: extra,
          }))
          window.setTimeout(() => detailAddressRef.current?.focus(), 0)
        },
      }).open()
    } finally {
      setPostcodeLoading(false)
    }
  }, [loadDaumPostcode, postcodeLoading])

  const handleSaveBilling = () => {
    writeBillingInfo(billingForm)
    setBillingInfo(billingForm)
    setIsBillingEditOpen(false)
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="px-6 py-10">
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6">
          <div className="text-center flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-foreground">결제 확인</h1>
            <p className="text-sm text-muted-foreground">결제 정보를 최종 확인해주세요</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                <div className="text-sm font-semibold text-foreground">선택한 플랜</div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-foreground">{selectedPlanName || "Professional"}</div>
                    <div className="text-sm text-muted-foreground">{billingCycleLabel}</div>
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    ₩{basePrice.toLocaleString("ko-KR")}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                  <span>결제 수단</span>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-muted-foreground h-8 w-8"
                          aria-label="카드 추가"
                          onClick={() => setIsCardAddOpen(true)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>카드 추가</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-muted-foreground h-8 w-8"
                          aria-label="등록된 카드 선택"
                          onClick={() => setIsCardSelectOpen(true)}
                        >
                          <WalletCards className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p>등록된 카드 선택</p>
                      </TooltipContent>
                    </Tooltip>

                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  {CardIcon ? (
                    <div className="flex size-10 items-center justify-center rounded-lg">
                      <CardIcon className="h-6 w-9" />
                    </div>
                  ) : null}
                  <div>
                    <div className="text-sm text-muted-foreground">
                      •••• •••• •••• {card?.last4 || "0000"}
                    </div>
                    <div className="text-xs text-muted-foreground">{card?.holder || "-"}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                <div className="flex justify-between items-center gap-2 text-sm font-semibold text-foreground">
                  <span>청구 정보</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground h-8 w-8"
                        aria-label="청구 정보 수정"
                        onClick={() => setIsBillingEditOpen(true)}
                      >
                        <FilePenLine className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>청구 정보 수정</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <div className="text-foreground">{billingInfo.name || "-"}</div>
                  <div>{billingInfo.email || "-"}</div>
                  <div>{billingInfo.phone || "-"}</div>
                  <div>{billingAddress || "-"}</div>
                  <div>{billingInfo.postalCode || "-"}</div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
                <Checkbox
                  checked={agreeTerms}
                  onCheckedChange={(checked) => setAgreeTerms(Boolean(checked))}
                  aria-label="약관 동의"
                />
                <p className="text-sm text-muted-foreground">
                  <span className="text-primary">서비스 이용약관</span>,{" "}
                  <span className="text-primary">개인정보 처리방침</span>,{" "}
                  <span className="text-primary">환불 정책</span>에 동의합니다.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-[120px]"
                  onClick={() =>
                    navigate("/billing/info", {
                      state: {
                        planId: state.planId,
                        planName: state.planName,
                        billingCycle: state.billingCycle,
                        allowEdit: true,
                      },
                    })
                  }
                >
                  이전
                </Button>
                <div />
              </div>
            </div>

            <div className="self-start rounded-xl border border-border bg-background p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">결제 요약</div>
              <div className="mt-4 grid gap-2">
                <label className="text-xs font-medium text-muted-foreground">쿠폰 코드</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value)}
                    placeholder="쿠폰 코드 입력"
                  />
                  <Button type="button" variant="outline" size="sm">
                    적용
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>플랜 가격</span>
                  <span className="text-foreground">₩{basePrice.toLocaleString("ko-KR")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>VAT (10%)</span>
                  <span className="text-foreground">₩{vatAmount.toLocaleString("ko-KR")}</span>
                </div>
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-foreground">총 결제 금액</span>
                  <span className="text-2xl font-bold text-blue-600">
                    ₩{totalAmount.toLocaleString("ko-KR")}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                className="mt-4 w-full"
                onClick={() =>
                  navigate("/billing/complete", {
                    state: {
                      planName: selectedPlanName || "Professional",
                      billingCycle: state.billingCycle,
                      totalAmount,
                    },
                  })
                }
              >
                결제하기
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                결제 시 자동으로 정기 구독이 시작됩니다. 언제든지 구독을 취소할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Dialog open={isCardSelectOpen} onOpenChange={setIsCardSelectOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>등록된 카드 선택</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {cardOptions.map((option) => {
              const isSelected = option.id === selectedCardId
              const Icon =
                option.brand === "visa"
                  ? CardVisa
                  : option.brand === "master"
                    ? CardMaster
                    : option.brand === "amex"
                      ? CardAmex
                      : option.brand === "jcb"
                        ? CardJcb
                        : option.brand === "union"
                          ? CardUnion
                          : CreditCard
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent/30",
                    isSelected && "border-primary ring-1 ring-primary/30 bg-primary/5"
                  )}
                  onClick={() => setSelectedCardId(option.id)}
                >
                  <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", option.bg)}>
                    <Icon className="h-6 w-9" />
                  </div>
                  <div className="flex flex-1 flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {option.label} •••• {option.last4}
                      </span>
                      {option.isDefault ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30">
                          기본
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">만료 {option.expiry}</span>
                  </div>
                </button>
              )
            })}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setIsCardSelectOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSelectCard} disabled={!selectedCardId}>
              선택
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCardAddOpen} onOpenChange={setIsCardAddOpen}>
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
                  {AddCardIcon ? (
                    <AddCardIcon className="h-6 w-9" />
                  ) : (
                    <CreditCard className="size-6 text-white/90" />
                  )}
                  <span className="text-xs text-white/80">Card</span>
                </div>
                <div className="mt-6 text-lg tracking-[0.18em]">{addCardNumberDisplay}</div>
                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-white/70">카드 소유자</p>
                    <p className="text-sm font-semibold">{addCardHolderDisplay}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-white/70">유효기간</p>
                    <p className="text-sm font-semibold">{addCardExpiryDisplay}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-foreground">카드 번호</label>
                <Input
                  value={addFormattedCardNumber}
                  onChange={(event) => setAddCardNumber(normalizeCardNumber(event.target.value))}
                  placeholder="1234 1234 1234 1234"
                  inputMode="numeric"
                  autoComplete="cc-number"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-foreground">카드 소유자 이름</label>
                <Input
                  value={addCardHolder}
                  onChange={(event) => setAddCardHolder(event.target.value)}
                  placeholder="카드 소유자 이름"
                  autoComplete="cc-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-foreground">유효기간</label>
                  <Input
                    value={addCardExpiry}
                    onChange={(event) => setAddCardExpiry(formatExpiry(event.target.value))}
                    placeholder="MM/YY"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-foreground">CVV</label>
                  <Input
                    value={addCardCvv}
                    onChange={(event) => setAddCardCvv(normalizeCvv(event.target.value))}
                    placeholder="123"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCardAddOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveCard} disabled={!canSaveCard}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBillingEditOpen} onOpenChange={setIsBillingEditOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>청구 정보 수정</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 text-sm">
            <div className="grid gap-2">
              <Label>이름(회사명)</Label>
              <Input
                value={billingForm.name}
                onChange={(e) => setBillingForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="예: Reduct AI"
              />
            </div>
            <div className="grid gap-2">
              <Label>이메일</Label>
              <Input
                type="email"
                value={billingForm.email}
                onChange={(e) => setBillingForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="billing@reduct.ai"
              />
            </div>
            <div className="grid gap-2">
              <Label>우편번호</Label>
              <div className="flex items-center gap-2">
                <Input value={billingForm.postalCode} readOnly placeholder="우편번호" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={handleSearchPostcode}
                  disabled={postcodeLoading}
                >
                  {postcodeLoading ? "검색 중..." : "주소 검색"}
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>주소</Label>
              <Input value={billingForm.address1} readOnly placeholder="도로명/지번 주소" />
            </div>
            <div className="grid gap-2">
              <Label>상세주소</Label>
              <Input
                ref={detailAddressRef}
                value={billingForm.address2}
                onChange={(e) => setBillingForm((prev) => ({ ...prev, address2: e.target.value }))}
                placeholder="상세주소 입력"
              />
            </div>
            <div className="grid gap-2">
              <Label>참고항목</Label>
              <Input value={billingForm.extraAddress} readOnly placeholder="참고항목" />
            </div>
            <div className="grid gap-2">
              <Label>전화번호</Label>
              <Input
                value={billingForm.phone}
                onChange={(e) => setBillingForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="전화번호"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBillingEditOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveBilling}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
