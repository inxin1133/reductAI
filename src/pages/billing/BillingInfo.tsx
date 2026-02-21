import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  appendVisited,
  hasBillingCard,
  hasBillingInfo,
  hasVisited,
  readBillingCard,
  readBillingInfo,
  type CheckoutFlowState,
  writeBillingInfo,
} from "@/lib/billingFlow"

type LocationState = {
  planId?: string
  planName?: string
  billingCycle?: "monthly" | "yearly"
  allowEdit?: boolean
  flow?: CheckoutFlowState
}

type BillingFormState = {
  name: string
  email: string
  postalCode: string
  address1: string
  address2: string
  extraAddress: string
  phone: string
  countryCode: string
  taxCountryCode: string
  currency: string
}

type BillingAccountRow = {
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
}

type BillingAccountResponse = {
  ok?: boolean
  row?: BillingAccountRow | null
  message?: string
}

type PaymentMethodRow = {
  metadata?: Record<string, unknown> | null
}

type PaymentMethodsResponse = {
  ok?: boolean
  rows?: PaymentMethodRow[]
}

const INITIAL_BILLING_FORM: BillingFormState = {
  name: "",
  email: "",
  postalCode: "",
  address1: "",
  address2: "",
  extraAddress: "",
  phone: "",
  countryCode: "KR",
  taxCountryCode: "KR",
  currency: "KRW",
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15)
}

const COMMON_COUNTRY_CODES = [
  "1",
  "7",
  "20",
  "27",
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "39",
  "40",
  "41",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "81",
  "82",
  "84",
  "86",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "98",
]

const COUNTRY_OPTIONS = [
  { code: "KR", label: "대한민국 (KR)" },
  { code: "US", label: "미국 (US)" },
  { code: "JP", label: "일본 (JP)" },
  { code: "CN", label: "중국 (CN)" },
  { code: "SG", label: "싱가포르 (SG)" },
  { code: "HK", label: "홍콩 (HK)" },
  { code: "GB", label: "영국 (GB)" },
  { code: "DE", label: "독일 (DE)" },
  { code: "FR", label: "프랑스 (FR)" },
  { code: "AU", label: "호주 (AU)" },
  { code: "CA", label: "캐나다 (CA)" },
]

const CURRENCY_OPTIONS = [
  { code: "KRW", label: "KRW (원)" },
  { code: "USD", label: "USD ($)" },
  { code: "JPY", label: "JPY (¥)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "GBP", label: "GBP (£)" },
  { code: "CNY", label: "CNY (¥)" },
  { code: "SGD", label: "SGD ($)" },
  { code: "HKD", label: "HKD ($)" },
  { code: "AUD", label: "AUD ($)" },
  { code: "CAD", label: "CAD ($)" },
]

function pickCountryCode(digits: string): string {
  if (!digits) return ""
  for (let len = 3; len >= 1; len -= 1) {
    const code = digits.slice(0, len)
    if (COMMON_COUNTRY_CODES.includes(code)) return code
  }
  return digits.length >= 2 ? digits.slice(0, 2) : digits.slice(0, 1)
}

function formatKoreanNumber(digits: string): string {
  if (!digits) return ""
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function formatInternationalRest(digits: string): string {
  if (!digits) return ""
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function formatPhone(value: string): string {
  const digits = normalizePhoneDigits(value)
  if (!digits) return ""
  if (digits.length > 11) {
    const code = pickCountryCode(digits)
    const rest = digits.slice(code.length)
    if (!rest) return code
    if (code === "82") {
      const local = formatKoreanNumber(`0${rest}`)
      return `${code}-${local.replace(/^0/, "")}`
    }
    return `${code}-${formatInternationalRest(rest)}`
  }
  return formatKoreanNumber(digits)
}

const DAUM_POSTCODE_SCRIPT_ID = "daum-postcode-script"

export default function BillingInfo() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as LocationState
  const selectedPlanName = typeof state.planName === "string" ? state.planName : null
  const allowEdit = Boolean(state.allowEdit)
  const canGoBackToCard = hasVisited(state.flow, "card")
  const inFlow = Boolean(state.flow?.visited?.length)

  const [billingForm, setBillingForm] = useState<BillingFormState>(() => {
    const stored = readBillingInfo()
    if (!stored) return INITIAL_BILLING_FORM
    return {
      ...INITIAL_BILLING_FORM,
      ...stored,
      phone: formatPhone(stored.phone || ""),
    }
  })
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const detailAddressRef = useRef<HTMLInputElement | null>(null)

  const authHeaders = useCallback((): Record<string, string> => {
    const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  useEffect(() => {
    if (billingForm.name) return
    const stored = readBillingCard()
    const holder = stored?.holder?.trim()
    if (!holder) return
    setBillingForm((prev) => (prev.name ? prev : { ...prev, name: holder }))
  }, [billingForm.name])

  useEffect(() => {
    if (billingForm.email) return
    if (typeof window === "undefined") return
    const accountEmail = String(window.localStorage.getItem("user_email") || "").trim()
    if (!accountEmail) return
    setBillingForm((prev) => (prev.email ? prev : { ...prev, email: accountEmail }))
  }, [billingForm.email])

  useEffect(() => {
    if (allowEdit || inFlow) return
    if (!hasBillingCard()) {
      navigate("/billing/card", { replace: true })
      return
    }
    if (hasBillingCard() && hasBillingInfo()) {
      navigate("/billing/confirm", { replace: true })
    }
  }, [allowEdit, inFlow, navigate])

  useEffect(() => {
    let cancelled = false

    async function loadBillingAccount() {
      const headers = authHeaders()
      if (!headers.Authorization) return

      try {
        const res = await fetch("/api/ai/billing/user/billing-account", { headers })
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as BillingAccountResponse | null
        if (!data?.ok || !data?.row || cancelled) return
        const row = data.row
        setBillingForm((prev) => {
          const next = {
            ...prev,
            name: row.billing_name ?? prev.name,
            email: row.billing_email ?? prev.email,
            postalCode: row.billing_postal_code ?? prev.postalCode,
            address1: row.billing_address1 ?? prev.address1,
            address2: row.billing_address2 ?? prev.address2,
            extraAddress: row.billing_extra_address ?? prev.extraAddress,
            phone: row.billing_phone ? formatPhone(row.billing_phone) : prev.phone,
            countryCode: row.country_code ?? prev.countryCode,
            taxCountryCode: row.tax_country_code ?? prev.taxCountryCode,
            currency: row.currency ?? prev.currency,
          }
          writeBillingInfo({ ...next, phone: normalizePhoneDigits(next.phone) })
          return next
        })
      } catch (e) {
        console.error(e)
      }
    }

    void loadBillingAccount()
    return () => {
      cancelled = true
    }
  }, [authHeaders])

  useEffect(() => {
    if (billingForm.name) return
    const headers = authHeaders()
    if (!headers.Authorization) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/ai/billing/user/payment-methods?limit=1", { headers })
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as PaymentMethodsResponse | null
        const holder = data?.rows?.[0]?.metadata?.holder
        if (!cancelled && typeof holder === "string" && holder.trim()) {
          setBillingForm((prev) => (prev.name ? prev : { ...prev, name: holder.trim() }))
        }
      } catch (e) {
        console.error(e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authHeaders, billingForm.name])

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

  const handleNext = async () => {
    const phoneDigits = normalizePhoneDigits(billingForm.phone)
    writeBillingInfo({ ...billingForm, phone: phoneDigits })

    const headers = authHeaders()
    if (headers.Authorization) {
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
            billing_phone: phoneDigits,
            country_code: billingForm.countryCode || null,
            tax_country_code: billingForm.taxCountryCode || billingForm.countryCode || null,
            currency: billingForm.currency || null,
          }),
        })
        const data = (await res.json().catch(() => null)) as BillingAccountResponse | null
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || "FAILED_SAVE")
        }
      } catch (e) {
        console.error(e)
        alert("청구 정보 저장에 실패했습니다.")
        return
      }
    }

    navigate("/billing/confirm", {
      state: {
        planId: state.planId,
        planName: state.planName,
        billingCycle: state.billingCycle,
        flow: appendVisited(state.flow, "info"),
      },
    })
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="px-6 py-10">
        <div className="mx-auto flex w-full max-w-[700px] flex-col gap-5">
          <div className="text-center flex flex-col gap-3">
            <h1 className="text-xl font-bold text-foreground">청구 정보 작성</h1>
            {selectedPlanName ? (
              <p className="text-base text-muted-foreground">
                선택한 요금제: <span className="font-semibold text-foreground">{selectedPlanName}</span>
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
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
                    value={billingForm.countryCode}
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
                    value={billingForm.currency}
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
          </div>

          <div className="flex items-center justify-between">
            {canGoBackToCard ? (
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
