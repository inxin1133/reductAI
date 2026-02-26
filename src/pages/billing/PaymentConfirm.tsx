import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  type CardBrand,
  type BillingInfoProfile,
  hasVisited,
  readBillingCard,
  readBillingInfo,
  type CheckoutFlowState,
  writeBillingCard,
  writeBillingInfo,
} from "@/lib/billingFlow"
import { CURRENCY_OPTIONS, COUNTRY_OPTIONS } from "@/lib/billingOptions"
import {
  cardBg,
  cardLabel,
  detectCardBrand,
  formatCardNumber,
  formatExpiry,
  formatExpiryLabel,
  getCardBrandIcon,
  normalizeCardBrand,
  normalizeCardNumber,
  normalizeCvv,
  parseExpiry,
} from "@/lib/card"
import { currencySymbol, formatMoney, roundMoney } from "@/lib/currency"
import { formatPhone, normalizePhoneDigits } from "@/lib/phone"
import { CreditCard, Lock, Plus, WalletCards, FilePenLine } from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchBillingPlansWithPrices } from "@/services/billingService"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type LocationState = {
  planId?: string
  planName?: string
  billingCycle?: "monthly" | "yearly"
  action?: "new" | "change" | "cancel" | "topup" | "seat_add"
  fromDowngrade?: boolean
  flow?: CheckoutFlowState
  topupProductId?: string
  topupProductName?: string
  topupCredits?: number
  topupPrice?: number
  seatQuantity?: number
  seatUnitPrice?: number
  seatMax?: number | null
}

type TopupQuoteResponse = {
  ok?: boolean
  product_id?: string
  sku_code?: string
  product_name?: string
  credits?: number
  bonus_credits?: number
  total_credits?: number
  currency?: string
  amount?: number
  base_currency?: string
  base_amount?: number
  fx_rate?: number | null
  tax_rate_percent?: number
  tax_amount?: number
  total_amount?: number
  message?: string
}

type TopupCheckoutResponse = {
  ok?: boolean
  total_amount?: number
  tax_amount?: number
  currency?: string
  credits_granted?: number
  balance_before?: number
  balance_after?: number
  transaction_id?: string
  message?: string
}

type SeatAddonQuoteResponse = {
  ok?: boolean
  quantity?: number
  unit_price_usd?: number
  unit_price_local?: number
  currency?: string
  amount?: number
  base_currency?: string
  base_amount?: number
  fx_rate?: number | null
  tax_rate_percent?: number
  tax_amount?: number
  total_amount?: number
  message?: string
}

type SeatAddonCheckoutResponse = {
  ok?: boolean
  quantity?: number
  unit_price_usd?: number
  unit_price_local?: number
  fx_rate?: number | null
  total_amount?: number
  tax_amount?: number
  currency?: string
  new_member_limit?: number
  transaction_id?: string
  message?: string
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

type BillingAccountResponse = {
  ok?: boolean
  row?: {
    billing_name?: string | null
    billing_email?: string | null
    billing_postal_code?: string | null
    billing_address1?: string | null
    billing_address2?: string | null
    billing_extra_address?: string | null
    billing_phone?: string | null
    country_code?: string | null
    tax_country_code?: string | null
    currency?: string | null
  } | null
}

type PaymentMethodRow = {
  id: string
  card_brand?: string | null
  card_last4?: string | null
  card_exp_month?: number | null
  card_exp_year?: number | null
  is_default?: boolean | null
  status?: string | null
  metadata?: Record<string, unknown> | null
}

type PaymentMethodsResponse = {
  ok?: boolean
  rows?: PaymentMethodRow[]
}

type CheckoutResponse = {
  ok?: boolean
  total_amount?: number
  currency?: string
  next_billing_date?: string
  transaction_id?: string
  transaction?: { id?: string | null }
  message?: string
}

type QuoteResponse = {
  ok?: boolean
  plan_id?: string
  billing_cycle?: string
  plan_name?: string | null
  currency?: string
  amount?: number
  base_currency?: string | null
  base_amount?: number | null
  fx_rate?: number | null
  tax_rate_percent?: number
  tax_amount?: number
  total_amount?: number
  message?: string
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

type QuoteState = {
  currency: string
  amount: number
  tax_rate_percent: number
  tax_amount: number
  total_amount: number
  fx_rate?: number | null
  base_currency?: string | null
  base_amount?: number | null
}

export default function PaymentConfirm() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = useMemo(() => (location.state || {}) as LocationState, [location.state])
  const action = state.action ?? "new"
  const isChangeFlow = action === "change"
  const isTopupFlow = action === "topup"
  const isSeatFlow = action === "seat_add"
  const isFromDowngrade = Boolean(state.fromDowngrade)
  const selectedPlanName = typeof state.planName === "string" ? state.planName : null
  const billingCycleLabel = state.billingCycle === "yearly" ? "연간 구독" : "월간 구독"
  const canGoBackToInfo = hasVisited(state.flow, "info")
  const canGoBackToDowngrade = hasVisited(state.flow, "downgrade")
  const inFlow = Boolean(state.flow?.visited?.length)

  useEffect(() => {
    if (action === "cancel") {
      navigate("/billing/cancel", { replace: true, state: { action: "cancel" } })
    }
  }, [action, navigate])

  const [card, setCard] = useState(() => readBillingCard())
  const [billingInfo, setBillingInfo] = useState<BillingInfoProfile>(() => {
    const stored = readBillingInfo() ?? EMPTY_BILLING_INFO
    return {
      ...stored,
      phone: formatPhone(stored.phone || ""),
      countryCode: stored.countryCode ?? "KR",
      taxCountryCode: stored.taxCountryCode ?? "KR",
      currency: stored.currency ?? "KRW",
    }
  })
  const [quote, setQuote] = useState<QuoteState | null>(null)
  const [changeQuote, setChangeQuote] = useState<SubscriptionChangeQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [resolvedPlanName, setResolvedPlanName] = useState<string | null>(null)
  const displayCurrency = changeQuote?.currency || quote?.currency || billingInfo.currency || "USD"
  const basePrice = quote?.amount ?? null
  const taxRatePercent = isChangeFlow ? changeQuote?.tax_rate_percent ?? 0 : quote?.tax_rate_percent ?? 0
  const taxAmount = isChangeFlow ? changeQuote?.tax_amount ?? 0 : quote?.tax_amount ?? 0
  const totalAmount = isChangeFlow ? changeQuote?.total_amount ?? 0 : quote?.total_amount ?? 0
  const refundAmount = changeQuote?.refund_amount ?? 0
  const netAmount = changeQuote?.net_amount ?? 0
  const creditDelta = changeQuote?.credit_delta ?? 0
  const currentPlanName = changeQuote?.current?.plan_name ?? "-"
  const targetPlanName = changeQuote?.target?.plan_name ?? "-"
  const currentCycleLabel =
    changeQuote?.current?.billing_cycle === "yearly" ? "연간" : changeQuote?.current?.billing_cycle === "monthly" ? "월간" : "-"
  const targetCycleLabel =
    changeQuote?.target?.billing_cycle === "yearly" ? "연간" : changeQuote?.target?.billing_cycle === "monthly" ? "월간" : "-"
  const planCycleLabel = isChangeFlow
    ? `${currentCycleLabel} → ${targetCycleLabel}`
    : billingCycleLabel
  const displayPlanName = isChangeFlow
    ? targetPlanName
    : resolvedPlanName ?? selectedPlanName ?? "Professional"
  const selectedCountryLabel = useMemo(() => {
    const option = COUNTRY_OPTIONS.find((item) => item.code === billingInfo.countryCode)
    return option?.label ?? billingInfo.countryCode ?? "-"
  }, [billingInfo.countryCode])
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
  const [cardOptions, setCardOptions] = useState<CardOption[]>([])
  const [cardSaving, setCardSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const requiresPayment = isChangeFlow
    ? Boolean(changeQuote && Number.isFinite(changeQuote.total_amount) && changeQuote.total_amount > 0)
    : Boolean(quote && Number.isFinite(quote.total_amount))
  const canPay = isTopupFlow || isSeatFlow
    ? Boolean(
        quote &&
          Number.isFinite(quote.total_amount) &&
          agreeTerms &&
          card?.last4 &&
          billingInfo.name &&
          billingInfo.email &&
          billingInfo.address1 &&
          !paying &&
          !quoteLoading
      )
    : isChangeFlow
      ? Boolean(
          changeQuote &&
            agreeTerms &&
            !paying &&
            !quoteLoading &&
            (!requiresPayment ||
              (card?.last4 && billingInfo.name && billingInfo.email && billingInfo.address1))
        )
      : Boolean(
          quote &&
            Number.isFinite(quote.total_amount) &&
            agreeTerms &&
            card?.last4 &&
            billingInfo.name &&
            billingInfo.email &&
            billingInfo.address1 &&
            !paying &&
            !quoteLoading
        )

  const authHeaders = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {}
    const token = window.localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const loadPlanInfo = useCallback(async () => {
    if (!state.planId || isChangeFlow || isTopupFlow || isSeatFlow) return
    try {
      const plans = await fetchBillingPlansWithPrices()
      const plan = plans.find((item) => item.id === state.planId)
      if (!plan) return
      setResolvedPlanName(plan.name || null)
    } catch (e) {
      console.error(e)
    }
  }, [isChangeFlow, isSeatFlow, isTopupFlow, state.planId])

  const loadQuote = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) return null

    try {
      setQuoteLoading(true)

      if (isTopupFlow) {
        setChangeQuote(null)
        if (!state.topupProductId) { setQuote(null); return null }
        const res = await fetch("/api/ai/billing/user/topup-quote", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: state.topupProductId }),
        })
        const data = (await res.json().catch(() => null)) as TopupQuoteResponse | null
        if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_QUOTE")
        const currency = data.currency || "USD"
        const nextQuote: QuoteState = {
          currency,
          amount: roundMoney(Number(data.amount ?? 0), currency),
          tax_rate_percent: Number(data.tax_rate_percent ?? 0),
          tax_amount: roundMoney(Number(data.tax_amount ?? 0), currency),
          total_amount: roundMoney(Number(data.total_amount ?? 0), currency),
          fx_rate: data.fx_rate ?? null,
          base_currency: data.base_currency ?? null,
          base_amount: data.base_amount ?? null,
        }
        setQuote(nextQuote)
        return nextQuote
      }

      if (isSeatFlow) {
        setChangeQuote(null)
        if (!state.seatQuantity) {
          setQuote(null)
          return null
        }
        const res = await fetch("/api/ai/billing/user/seat-addon-quote", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: state.seatQuantity }),
        })
        const data = (await res.json().catch(() => null)) as SeatAddonQuoteResponse | null
        if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_QUOTE")
        const currency = data.currency || "USD"
        const nextQuote: QuoteState = {
          currency,
          amount: roundMoney(Number(data.amount ?? 0), currency),
          tax_rate_percent: Number(data.tax_rate_percent ?? 0),
          tax_amount: roundMoney(Number(data.tax_amount ?? 0), currency),
          total_amount: roundMoney(Number(data.total_amount ?? 0), currency),
          fx_rate: data.fx_rate ?? null,
          base_currency: data.base_currency ?? null,
          base_amount: data.base_amount ?? null,
        }
        setQuote(nextQuote)
        return nextQuote
      }

      if (isChangeFlow) {
        setQuote(null)
        const res = await fetch("/api/ai/billing/user/subscription-quote", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "change",
            target_plan_id: state.planId || null,
            target_billing_cycle: state.billingCycle || null,
          }),
        })
        const data = (await res.json().catch(() => null)) as SubscriptionChangeResponse | null
        if (!res.ok || !data?.quote) throw new Error(data?.message || "FAILED_QUOTE")
        setChangeQuote(data.quote)
        return data.quote
      }

      if (!state.planId || !state.billingCycle) {
        setQuote(null)
        return null
      }
      setChangeQuote(null)
      const res = await fetch("/api/ai/billing/user/quote", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: state.planId,
          billing_cycle: state.billingCycle,
        }),
      })
      const data = (await res.json().catch(() => null)) as QuoteResponse | null
      if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_QUOTE")
      const currency = data.currency || "USD"
      const amount = roundMoney(Number(data.amount ?? 0), currency)
      const taxAmount = roundMoney(Number(data.tax_amount ?? 0), currency)
      const totalAmount = roundMoney(Number(data.total_amount ?? 0), currency)
      const nextQuote: QuoteState = {
        currency,
        amount,
        tax_rate_percent: Number(data.tax_rate_percent ?? 0),
        tax_amount: taxAmount,
        total_amount: totalAmount,
        fx_rate: data.fx_rate ?? null,
        base_currency: data.base_currency ?? null,
        base_amount: data.base_amount ?? null,
      }
      setQuote(nextQuote)
      if (data?.plan_name) setResolvedPlanName(data.plan_name)
      return nextQuote
    } catch (e) {
      console.error(e)
      setQuote(null)
      setChangeQuote(null)
      return null
    } finally {
      setQuoteLoading(false)
    }
  }, [
    authHeaders,
    isChangeFlow,
    isSeatFlow,
    isTopupFlow,
    state.billingCycle,
    state.planId,
    state.seatQuantity,
    state.topupProductId,
  ])

  const loadBillingData = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) return null
    try {
      const [accountRes, methodsRes] = await Promise.all([
        fetch("/api/ai/billing/user/billing-account", { headers }),
        fetch("/api/ai/billing/user/payment-methods?limit=50", { headers }),
      ])

      let hasInfo = false
      if (accountRes.ok) {
        const data = (await accountRes.json().catch(() => null)) as BillingAccountResponse | null
        const row = data?.row
        if (row) {
          const nextInfo = {
            name: row.billing_name ?? "",
            email: row.billing_email ?? "",
            postalCode: row.billing_postal_code ?? "",
            address1: row.billing_address1 ?? "",
            address2: row.billing_address2 ?? "",
            extraAddress: row.billing_extra_address ?? "",
            phone: row.billing_phone ? formatPhone(row.billing_phone) : "",
            countryCode: row.country_code ?? "KR",
            taxCountryCode: row.tax_country_code ?? row.country_code ?? "KR",
            currency: row.currency ?? "KRW",
          }
          hasInfo = Boolean(nextInfo.name && nextInfo.email && nextInfo.address1)
          setBillingInfo(nextInfo)
          if (!isBillingEditOpen) setBillingForm(nextInfo)
          writeBillingInfo({ ...nextInfo, phone: normalizePhoneDigits(nextInfo.phone) })
        }
      }

      let hasCard = false
      if (methodsRes.ok) {
        const data = (await methodsRes.json().catch(() => null)) as PaymentMethodsResponse | null
        const rows = Array.isArray(data?.rows) ? data?.rows : []
        const options = rows
          .filter((row) => row.status !== "deleted")
          .map((row) => {
            const brand = normalizeCardBrand(row.card_brand) ?? "visa"
            const holder = String(row.metadata?.holder || "").trim() || "사용자"
            return {
              id: row.id,
              brand,
              label: cardLabel(brand),
              last4: row.card_last4 || "0000",
              expiry: formatExpiryLabel(row.card_exp_month, row.card_exp_year),
              holder,
              isDefault: Boolean(row.is_default),
              bg: cardBg(brand),
            }
          })
        setCardOptions(options)
        const selected = options.find((opt) => opt.isDefault) ?? options[0]
        if (selected) {
          setCard({
            brand: selected.brand,
            last4: selected.last4,
            holder: selected.holder,
            expiry: selected.expiry,
          })
          writeBillingCard({
            brand: selected.brand,
            last4: selected.last4,
            holder: selected.holder,
            expiry: selected.expiry,
          })
          hasCard = true
        }
      }

      return { hasCard, hasInfo }
    } finally {
      // no-op
    }
  }, [authHeaders, isBillingEditOpen])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const status = await loadBillingData()
        if (cancelled) return
        if (!inFlow && status && !isChangeFlow) {
          if (!status.hasCard) {
            navigate("/billing/card", { replace: true, state })
            return
          }
          if (!status.hasInfo) {
            navigate("/billing/info", { replace: true, state })
            return
          }
        }
        await loadQuote()
      } catch (e) {
        console.error(e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [inFlow, isChangeFlow, loadBillingData, loadQuote, navigate, state])

  useEffect(() => {
    void loadPlanInfo()
  }, [loadPlanInfo])

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

  const CardIcon = getCardBrandIcon(card?.brand)
  const billingAddress = [billingInfo?.address1, billingInfo?.address2, billingInfo?.extraAddress]
    .filter(Boolean)
    .join(" ")
  const billingPhoneDisplay = billingInfo.phone ? formatPhone(billingInfo.phone) : "-"
  const formatAmountLabel = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return quoteLoading ? "계산 중" : "-"
    }
    return `${currencySymbol(displayCurrency)}${formatMoney(value, displayCurrency)}`
  }

  const addFormattedCardNumber = useMemo(() => formatCardNumber(addCardNumber), [addCardNumber])
  const addCardNumberDisplay = addFormattedCardNumber || "0000 0000 0000 0000"
  const addCardHolderDisplay = addCardHolder.trim() || "카드 소유자"
  const addCardExpiryDisplay = addCardExpiry || "MM/YY"
  const addCardBrand = useMemo(() => detectCardBrand(addCardNumber), [addCardNumber])
  const AddCardIcon = getCardBrandIcon(addCardBrand)
  const canSaveCard = Boolean(addCardBrand && normalizeCardNumber(addCardNumber).length >= 4 && !cardSaving)

  const handleSaveCard = async () => {
    if (!canSaveCard || !addCardBrand) return
    const digits = normalizeCardNumber(addCardNumber)
    const last4 = digits.slice(-4)
    const { month, year } = parseExpiry(addCardExpiry)
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
      setCardSaving(true)
      const res = await fetch("/api/ai/billing/user/payment-methods", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "toss",
          type: "card",
          card_brand: addCardBrand,
          card_last4: last4,
          card_exp_month: month,
          card_exp_year: year,
          metadata: { holder: addCardHolder.trim() || null },
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null
      if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_SAVE")

      await loadBillingData()
      setIsCardAddOpen(false)
    } catch (e) {
      console.error(e)
      alert("카드 저장에 실패했습니다.")
    } finally {
      setCardSaving(false)
    }
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

  const handleSaveBilling = async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }
    try {
      const res = await fetch("/api/ai/billing/user/billing-account", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            billing_name: billingForm.name,
            billing_email: billingForm.email,
            billing_postal_code: billingForm.postalCode,
            billing_address1: billingForm.address1,
            billing_address2: billingForm.address2,
            billing_extra_address: billingForm.extraAddress,
            billing_phone: normalizePhoneDigits(billingForm.phone),
            country_code: billingForm.countryCode || null,
            tax_country_code: billingForm.taxCountryCode || billingForm.countryCode || null,
            currency: billingForm.currency || null,
          }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null
      if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_SAVE")
      writeBillingInfo(billingForm)
      setBillingInfo(billingForm)
      await loadQuote()
      setIsBillingEditOpen(false)
    } catch (e) {
      console.error(e)
      alert("청구 정보 저장에 실패했습니다.")
    }
  }

  const handleCheckout = async () => {
    if (!canPay || paying) return
    const headers = authHeaders()
    if (!headers.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }

    try {
      setPaying(true)

      if (isTopupFlow) {
        if (!state.topupProductId) { alert("충전 상품 정보가 없습니다."); return }
        const res = await fetch("/api/ai/billing/user/topup-checkout", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: state.topupProductId }),
        })
        const data = (await res.json().catch(() => null)) as TopupCheckoutResponse | null
        if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_TOPUP")
        navigate("/billing/complete", {
          state: {
            action: "topup",
            topupProductName: state.topupProductName,
            topupCredits: data.credits_granted ?? state.topupCredits,
            totalAmount: data.total_amount ?? quote?.total_amount ?? totalAmount,
            currency: data.currency ?? quote?.currency ?? displayCurrency,
            transactionId: data.transaction_id,
          },
        })
        return
      }

      if (isSeatFlow) {
        if (!state.seatQuantity) {
          alert("추가할 좌석 수가 없습니다.")
          return
        }
        const res = await fetch("/api/ai/billing/user/seat-addon-checkout", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: state.seatQuantity }),
        })
        const data = (await res.json().catch(() => null)) as SeatAddonCheckoutResponse | null
        if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_SEAT_ADDON")
        navigate("/billing/complete", {
          state: {
            action: "seat_add",
            seatQuantity: data.quantity ?? state.seatQuantity,
            totalAmount: data.total_amount ?? quote?.total_amount ?? totalAmount,
            currency: data.currency ?? quote?.currency ?? displayCurrency,
            transactionId: data.transaction_id,
          },
        })
        return
      }

      if (isChangeFlow) {
        const res = await fetch("/api/ai/billing/user/subscription-change", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "change",
            target_plan_id: state.planId || null,
            target_billing_cycle: state.billingCycle || null,
          }),
        })
        const data = (await res.json().catch(() => null)) as ApplySubscriptionChangeResponse | null
        if (!res.ok || !data?.ok || !data?.quote) throw new Error(data?.message || "FAILED_CHANGE")
        const nextBillingDate = data.quote.next_billing_date
          ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
              new Date(data.quote.next_billing_date)
            )
          : undefined
        const effectiveAt = data.quote.effective_at
          ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
              new Date(data.quote.effective_at)
            )
          : undefined
        const transactionId = data.charge_transaction?.id ?? data.refund_transaction?.id
        navigate("/billing/complete", {
          state: {
            action,
            changeType: data.quote.change_type,
            schedule: data.quote.schedule,
            planName: data.quote.target?.plan_name ?? data.quote.current?.plan_name,
            billingCycle: data.quote.target?.billing_cycle ?? data.quote.current?.billing_cycle,
            totalAmount: data.quote.total_amount,
            currency: data.quote.currency,
            nextBillingDate,
            effectiveAt,
            refundAmount: data.quote.refund_amount,
            chargeAmount: data.quote.total_amount,
            transactionId,
          },
        })
        return
      }

      if (!state.planId || !state.billingCycle) {
        alert("요금제 정보가 없습니다.")
        return
      }
      const res = await fetch("/api/ai/billing/user/checkout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: state.planId,
          billing_cycle: state.billingCycle,
        }),
      })
      const data = (await res.json().catch(() => null)) as CheckoutResponse | null
      if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_CHECKOUT")
      const nextBillingDate = data?.next_billing_date
        ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
            new Date(data.next_billing_date)
          )
        : undefined
      navigate("/billing/complete", {
        state: {
          planName: displayPlanName,
          billingCycle: state.billingCycle,
          totalAmount: data?.total_amount ?? quote?.total_amount ?? totalAmount,
          currency: data?.currency ?? quote?.currency ?? displayCurrency,
          nextBillingDate,
          transactionId: data?.transaction_id ?? data?.transaction?.id,
        },
      })
    } catch (e) {
      console.error(e)
      alert("결제 처리에 실패했습니다.")
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="px-6 py-10">
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6">
          <div className="text-center flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-foreground">
              {isTopupFlow ? "크레딧 충전" : isSeatFlow ? "좌석 추가" : "결제 확인"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isTopupFlow
                ? "크레딧 충전 결제 정보를 확인해주세요"
                : isSeatFlow
                  ? "좌석 추가 결제 정보를 확인해주세요"
                  : isFromDowngrade
                    ? "다운그레이드에 따른 새 플랜 결제를 확인해주세요"
                    : "결제 정보를 최종 확인해주세요"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
                <div className="text-sm font-semibold text-foreground">
                  {isTopupFlow
                    ? "충전 상품"
                    : isChangeFlow
                      ? isFromDowngrade
                        ? "다운그레이드 결제"
                        : "변경 요약"
                      : "선택한 플랜"}
                </div>
                {isTopupFlow ? (
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-foreground">{state.topupProductName || "크레딧 충전"}</div>
                      <div className="text-sm text-muted-foreground">+{(state.topupCredits ?? 0).toLocaleString()} 크레딧</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {selectedCountryLabel} · {displayCurrency}
                      </div>
                      <div className="text-lg font-semibold text-foreground">
                        {formatAmountLabel(basePrice)}
                      </div>
                    </div>
                  </div>
                ) : isSeatFlow ? (
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-foreground">좌석 추가</div>
                      <div className="text-sm text-muted-foreground">
                        {state.seatQuantity ? `${state.seatQuantity}석 추가` : "좌석 추가"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {selectedCountryLabel} · {displayCurrency}
                      </div>
                      <div className="text-lg font-semibold text-foreground">
                        {formatAmountLabel(basePrice)}
                      </div>
                    </div>
                  </div>
                ) : (
                <>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-foreground">{displayPlanName}</div>
                    <div className="text-sm text-muted-foreground">{planCycleLabel}</div>
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {formatAmountLabel(isChangeFlow ? changeQuote?.charge_amount : basePrice)}
                  </div>
                </div>
                {isChangeFlow ? (
                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                    <div>
                      현재: {currentPlanName} · {currentCycleLabel}
                    </div>
                    <div>
                      변경: {targetPlanName} · {targetCycleLabel}
                    </div>
                    {changeQuote?.effective_at ? (
                      <div>
                        적용일:{" "}
                        {new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
                          new Date(changeQuote.effective_at)
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                </>
                )}
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
                    <div className={cn("flex size-10 items-center justify-center rounded-lg", cardBg(card?.brand || "visa"))}>
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
                  <div>{billingPhoneDisplay}</div>
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
                  <span className="text-primary">자동결제 및 환불정책</span>에 동의합니다.
                </p>
              </div>

              <div className="flex items-center justify-between">
                {canGoBackToInfo || canGoBackToDowngrade || inFlow ? (
                  <Button type="button" variant="outline" className="min-w-[120px]" onClick={() => navigate(-1)}>
                    이전
                  </Button>
                ) : (
                  <div />
                )}
                <div />
              </div>
            </div>

            <div className="self-start rounded-xl border border-border bg-background p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">결제 요약</div>
              {!isChangeFlow && !isTopupFlow && !isSeatFlow ? (
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
              ) : null}
              <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                {isTopupFlow ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span>상품 가격</span>
                      <span className="text-foreground">{formatAmountLabel(basePrice)}</span>
                    </div>
                    {taxAmount > 0 ? (
                      <div className="flex items-center justify-between">
                        <span>세금 ({taxRatePercent || 0}%)</span>
                        <span className="text-foreground">{formatAmountLabel(taxAmount)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span>충전 크레딧</span>
                      <span className="text-foreground">+{(state.topupCredits ?? 0).toLocaleString()}</span>
                    </div>
                  </>
                ) : isSeatFlow ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span>좌석 추가 금액</span>
                      <span className="text-foreground">{formatAmountLabel(basePrice)}</span>
                    </div>
                    {taxAmount > 0 ? (
                      <div className="flex items-center justify-between">
                        <span>세금 ({taxRatePercent || 0}%)</span>
                        <span className="text-foreground">{formatAmountLabel(taxAmount)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span>추가 좌석</span>
                      <span className="text-foreground">+{state.seatQuantity ?? 0}석</span>
                    </div>
                  </>
                ) : isChangeFlow ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span>차액 결제</span>
                      <span className="text-foreground">{formatAmountLabel(changeQuote?.charge_amount)}</span>
                    </div>
                    {taxAmount > 0 ? (
                      <div className="flex items-center justify-between">
                        <span>세금 ({taxRatePercent || 0}%)</span>
                        <span className="text-foreground">{formatAmountLabel(taxAmount)}</span>
                      </div>
                    ) : null}
                    {refundAmount > 0 ? (
                      <div className="flex items-center justify-between">
                        <span>환불 예정</span>
                        <span className="text-foreground">-{formatAmountLabel(refundAmount)}</span>
                      </div>
                    ) : null}
                    {creditDelta > 0 ? (
                      <div className="flex items-center justify-between">
                        <span>추가 크레딧</span>
                        <span className="text-foreground">+{creditDelta.toLocaleString()}</span>
                      </div>
                    ) : null}
                    {changeQuote?.schedule ? (
                      <div className="flex items-center justify-between">
                        <span>적용 예정일</span>
                        <span className="text-foreground">
                          {changeQuote.effective_at
                            ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(
                                new Date(changeQuote.effective_at)
                              )
                            : "-"}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span>플랜 가격</span>
                      <span className="text-foreground">{formatAmountLabel(basePrice)}</span>
                    </div>
                    {taxAmount > 0 ? (
                      <div className="flex items-center justify-between">
                        <span>세금 ({taxRatePercent || 0}%)</span>
                        <span className="text-foreground">{formatAmountLabel(taxAmount)}</span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {isChangeFlow && refundAmount > 0 ? "최종 정산 금액" : "총 결제 금액"}
                  </span>
                  <span className="text-2xl font-bold text-blue-600">
                    {formatAmountLabel(isChangeFlow && refundAmount > 0 ? netAmount : totalAmount)}
                  </span>
                </div>
              </div>
              <Button type="button" className="mt-4 w-full" onClick={handleCheckout} disabled={!canPay}>
                {isTopupFlow
                  ? "결제하기"
                  : isSeatFlow
                    ? "좌석 추가 결제하기"
                    : isChangeFlow
                      ? changeQuote?.schedule
                        ? "변경 예약하기"
                        : requiresPayment
                          ? isFromDowngrade
                            ? "다운그레이드 결제하기"
                            : "변경 결제하기"
                          : "변경 적용하기"
                      : "결제하기"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                {isTopupFlow
                  ? "결제 완료 후 즉시 크레딧이 충전됩니다."
                  : isSeatFlow
                    ? "결제 완료 후 즉시 좌석이 추가됩니다."
                    : isChangeFlow
                      ? isFromDowngrade
                        ? "기존 연간 구독의 환불과 새로운 플랜 결제가 함께 처리됩니다."
                        : "변경 유형에 따라 차액 결제 또는 환불이 적용됩니다."
                      : "결제 시 자동으로 정기 구독이 시작됩니다. 언제든지 구독을 취소할 수 있습니다."}
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
              const Icon = getCardBrandIcon(option.brand) ?? CreditCard
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
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>청구지 국가</Label>
                <Select
                  value={billingForm.countryCode || "KR"}
                  onValueChange={(value) =>
                    setBillingForm((prev) => ({ ...prev, countryCode: value, taxCountryCode: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="국가 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>결제 통화</Label>
                <Select
                  value={billingForm.currency || "KRW"}
                  onValueChange={(value) => setBillingForm((prev) => ({ ...prev, currency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="통화 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                onChange={(e) => setBillingForm((prev) => ({ ...prev, phone: formatPhone(e.target.value) }))}
                placeholder="전화번호"
                inputMode="tel"
                autoComplete="tel"
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
