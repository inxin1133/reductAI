import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  ClipboardList,
  CreditCard,
  Ellipsis,
  HandHelping,
  Loader2,
  Menu,
  NotebookPen,
  Plus,
  ReceiptText,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatPhone, normalizePhoneDigits } from "@/lib/phone"
import { CURRENCY_OPTIONS, COUNTRY_OPTIONS } from "@/lib/billingOptions"
import { cardBg, cardLabel, formatExpiryLabel, getCardBrandIcon, normalizeCardBrand } from "@/lib/card"
import { LINE_TYPE_CONFIG, type BillingLineType } from "@/lib/billingLineType"
import type { CardBrand } from "@/lib/billingFlow"
import { currencySymbol, formatMoney, normalizeCurrency } from "@/lib/currency"
import { PLAN_TIER_LABELS, PLAN_TIER_STYLES, type PlanTier } from "@/lib/planTier"
import { cn } from "@/lib/utils"
import { fetchSubscriptionOverview, cancelSeatAddon, fetchInvoices, fetchInvoiceDetail, fetchTransactions, type SubscriptionOverviewData, type BillingInvoice, type BillingInvoiceDetail, type PaymentTransaction } from "@/services/billingService"
import { AddCardDialog } from "@/components/dialog/AddCardDialog"

type BillingMenuId = "subscription" | "invoices" | "billing" | "payments" | "transactions"

type BillingSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMenu?: BillingMenuId
  onOpenPlanDialog?: () => void
}

const BILLING_MENUS: Array<{ id: BillingMenuId; label: string; icon: typeof CreditCard }> = [
  { id: "subscription", label: "구독 관리", icon: HandHelping },
  { id: "invoices", label: "청구서", icon: ReceiptText },
  { id: "billing", label: "청구 관리", icon: NotebookPen },
  { id: "payments", label: "결제 수단", icon: CreditCard },
  { id: "transactions", label: "결제 내역", icon: ClipboardList },
]

const BILLING_MENU_STORAGE_KEY = "reductai:billing:activeMenu"
const DAUM_POSTCODE_SCRIPT_ID = "daum-postcode-script"
const INVOICES_PER_PAGE = 5
const TX_PER_PAGE = 10

const INVOICE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "임시", className: "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:ring-gray-500/30" },
  open: { label: "미결제", className: "bg-blue-50 text-blue-600 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/30" },
  paid: { label: "결제됨", className: "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
  void: { label: "무효", className: "bg-gray-50 text-gray-500 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:ring-gray-500/30" },
  uncollectible: { label: "수금 불가", className: "bg-red-50 text-red-600 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30" },
}

const TX_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "대기", className: "bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30" },
  succeeded: { label: "성공", className: "bg-emerald-50 text-emerald-600 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
  failed: { label: "실패", className: "bg-red-50 text-red-600 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30" },
  refunded: { label: "환불", className: "bg-purple-50 text-purple-600 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/30" },
  cancelled: { label: "취소", className: "bg-gray-50 text-gray-500 ring-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:ring-gray-500/30" },
}

const TX_TYPE_LABELS: Record<string, string> = {
  charge: "결제",
  refund: "환불",
  adjustment: "조정",
}


function formatInvoiceDate(value: string | null | undefined): string {
  if (!value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

function getInvoicePageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | "ellipsis")[] = [1]
  if (current > 3) pages.push("ellipsis")
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push("ellipsis")
  if (total > 1) pages.push(total)
  return pages
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

type PaymentCardOption = {
  id: string
  brand: CardBrand
  label: string
  last4: string
  expiry: string
  holder: string
  isDefault: boolean
  bg: string
}

type SeatCancellingMap = Record<string, boolean>

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

function readBillingMenuFromStorage(): BillingMenuId | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(BILLING_MENU_STORAGE_KEY)
    if (!raw) return null
    return BILLING_MENUS.some((item) => item.id === raw) ? (raw as BillingMenuId) : null
  } catch {
    return null
  }
}

function writeBillingMenuToStorage(value: BillingMenuId) {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(BILLING_MENU_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

const BillingSidebarMenu = ({
  activeId,
  onChange,
}: {
  activeId: BillingMenuId
  onChange: (id: BillingMenuId) => void
}) => (
  <div className="flex flex-col p-2">
    <div className="flex h-8 items-center px-2 text-xs text-sidebar-foreground/70">결제 관리</div>
    <div className="flex flex-col gap-1">
      {BILLING_MENUS.map((item) => {
        const Icon = item.icon
        const isActive = activeId === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground transition-colors hover:bg-accent",
              isActive && "bg-accent"
            )}
            onClick={() => onChange(item.id)}
          >
            <Icon className="size-5 shrink-0" />
            <span className="text-sm">{item.label}</span>
          </button>
        )
      })}
    </div>
  </div>
)

export function BillingSettingsDialog({ open, onOpenChange, initialMenu, onOpenPlanDialog }: BillingSettingsDialogProps) {
  const navigate = useNavigate()
  const [activeMenu, setActiveMenu] = useState<BillingMenuId>(() => readBillingMenuFromStorage() ?? "subscription")
  const [billingEditOpen, setBillingEditOpen] = useState(false)
  const [billingForm, setBillingForm] = useState<BillingFormState>(INITIAL_BILLING_FORM)
  const [overview, setOverview] = useState<SubscriptionOverviewData | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)
  const [seatCancelling, setSeatCancelling] = useState<SeatCancellingMap>({})
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingSaving, setBillingSaving] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentCardOption[]>([])
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false)
  const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(null)
  const [pmActionLoading, setPmActionLoading] = useState<string | null>(null)
  const [isCardAddOpen, setIsCardAddOpen] = useState(false)
  const detailAddressRef = useRef<HTMLInputElement | null>(null)
  const wasOpenRef = useRef(false)

  const [invoicePage, setInvoicePage] = useState(1)
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [invoicesTotal, setInvoicesTotal] = useState(0)
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoicesError, setInvoicesError] = useState<string | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [invoiceDetail, setInvoiceDetail] = useState<BillingInvoiceDetail | null>(null)
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false)

  const [txPage, setTxPage] = useState(1)
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([])
  const [txTotal, setTxTotal] = useState(0)
  const [txLoading, setTxLoading] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    if (initialMenu) {
      setActiveMenu(initialMenu)
      return
    }
    const stored = readBillingMenuFromStorage()
    if (stored) setActiveMenu(stored)
  }, [open, initialMenu])

  useEffect(() => {
    writeBillingMenuToStorage(activeMenu)
  }, [activeMenu])

  useEffect(() => {
    if (activeMenu !== "billing") setBillingEditOpen(false)
  }, [activeMenu])

  useEffect(() => {
    if (activeMenu !== "invoices") {
      setSelectedInvoiceId(null)
      setInvoiceDetail(null)
    }
  }, [activeMenu])

  const authHeaders = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {}
    const token = window.localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const handleOpenPlanDialog = useCallback(() => {
    onOpenChange(false)
    onOpenPlanDialog?.()
  }, [onOpenChange, onOpenPlanDialog])

  const handleCancelSubscription = useCallback(() => {
    onOpenChange(false)
    navigate("/billing/cancel", { state: { action: "cancel" } })
  }, [navigate, onOpenChange])

  const loadBillingAccount = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) return
    setBillingLoading(true)
    setBillingError(null)
    try {
      const res = await fetch("/api/ai/billing/user/billing-account", { headers })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json().catch(() => null)
      if (!data?.ok || !data?.row) {
        setBillingForm((prev) => {
          if (prev.email) return prev
          const accountEmail = typeof window !== "undefined" ? window.localStorage.getItem("user_email") || "" : ""
          return { ...prev, email: accountEmail.trim() }
        })
        return
      }
      const row = data.row
      setBillingForm({
        name: row.billing_name ?? "",
        email: row.billing_email ?? "",
        postalCode: row.billing_postal_code ?? "",
        address1: row.billing_address1 ?? "",
        address2: row.billing_address2 ?? "",
        extraAddress: row.billing_extra_address ?? "",
        phone: row.billing_phone ? formatPhone(row.billing_phone) : "",
        countryCode: row.country_code ?? "KR",
        taxCountryCode: row.tax_country_code ?? "KR",
        currency: row.currency ?? "KRW",
      })
    } catch (e) {
      console.error("loadBillingAccount error:", e)
      setBillingError("청구 정보를 불러오지 못했습니다.")
    } finally {
      setBillingLoading(false)
    }
  }, [authHeaders])

  useEffect(() => {
    if (!open || activeMenu !== "billing") return
    void loadBillingAccount()
  }, [open, activeMenu, loadBillingAccount])

  const handleSaveBilling = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) return
    setBillingSaving(true)
    try {
      const phoneDigits = normalizePhoneDigits(billingForm.phone)
      const res = await fetch("/api/ai/billing/user/billing-account", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          billing_name: billingForm.name || null,
          billing_email: billingForm.email || null,
          billing_postal_code: billingForm.postalCode || null,
          billing_address1: billingForm.address1 || null,
          billing_address2: billingForm.address2 || null,
          billing_extra_address: billingForm.extraAddress || null,
          billing_phone: phoneDigits || null,
          country_code: billingForm.countryCode || null,
          tax_country_code: billingForm.taxCountryCode || billingForm.countryCode || null,
          currency: billingForm.currency || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED_SAVE")
      setBillingEditOpen(false)
    } catch (e) {
      console.error("handleSaveBilling error:", e)
      alert("청구 정보 저장에 실패했습니다.")
    } finally {
      setBillingSaving(false)
    }
  }, [authHeaders, billingForm])

  const loadPaymentMethods = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) return
    setPaymentMethodsLoading(true)
    setPaymentMethodsError(null)
    try {
      const res = await fetch("/api/ai/billing/user/payment-methods?limit=50", { headers })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json().catch(() => null)
      const rows = Array.isArray(data?.rows) ? data.rows : []
      const options: PaymentCardOption[] = rows
        .filter((row: { status?: string }) => row.status !== "deleted")
        .map((row: { id: string; card_brand?: string | null; card_last4?: string | null; card_exp_month?: number | null; card_exp_year?: number | null; is_default?: boolean | null; metadata?: Record<string, unknown> | null }) => {
          const brand = normalizeCardBrand(row.card_brand) ?? "visa"
          return {
            id: row.id,
            brand,
            label: cardLabel(brand),
            last4: row.card_last4 || "0000",
            expiry: formatExpiryLabel(row.card_exp_month, row.card_exp_year),
            holder: String(row.metadata?.holder || "").trim() || "",
            isDefault: Boolean(row.is_default),
            bg: cardBg(brand),
          }
        })
      setPaymentMethods(options)
    } catch (e) {
      console.error("loadPaymentMethods error:", e)
      setPaymentMethodsError("결제 수단을 불러오지 못했습니다.")
    } finally {
      setPaymentMethodsLoading(false)
    }
  }, [authHeaders])

  useEffect(() => {
    if (!open || activeMenu !== "payments") return
    void loadPaymentMethods()
  }, [open, activeMenu, loadPaymentMethods])

  const handleSetDefaultCard = useCallback(async (pmId: string) => {
    const headers = authHeaders()
    if (!headers.Authorization) return
    setPmActionLoading(pmId)
    try {
      const res = await fetch(`/api/ai/billing/user/payment-methods/${pmId}/default`, {
        method: "PUT",
        headers,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED")
      await loadPaymentMethods()
    } catch (e) {
      console.error("handleSetDefaultCard error:", e)
      alert("기본 카드 설정에 실패했습니다.")
    } finally {
      setPmActionLoading(null)
    }
  }, [authHeaders, loadPaymentMethods])

  const handleDeleteCard = useCallback(async (pmId: string) => {
    if (!window.confirm("이 카드를 삭제하시겠습니까?")) return
    const headers = authHeaders()
    if (!headers.Authorization) return
    setPmActionLoading(pmId)
    try {
      const res = await fetch(`/api/ai/billing/user/payment-methods/${pmId}`, {
        method: "DELETE",
        headers,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.message || "FAILED")
      await loadPaymentMethods()
    } catch (e) {
      console.error("handleDeleteCard error:", e)
      alert("카드 삭제에 실패했습니다.")
    } finally {
      setPmActionLoading(null)
    }
  }, [authHeaders, loadPaymentMethods])

  const loadSubscriptionOverview = useCallback(async () => {
    setSubscriptionLoading(true)
    setSubscriptionError(null)
    try {
      const data = await fetchSubscriptionOverview()
      setOverview(data)
    } catch (e) {
      console.error(e)
      setSubscriptionError("구독 정보를 불러오지 못했습니다.")
    } finally {
      setSubscriptionLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || activeMenu !== "subscription") return
    const headers = authHeaders()
    if (!headers.Authorization) {
      setOverview(null)
      setSubscriptionError(null)
      setSubscriptionLoading(false)
      return
    }
    void loadSubscriptionOverview()
  }, [open, activeMenu, authHeaders, loadSubscriptionOverview])

  const activeLabel = useMemo(() => {
    const menu = BILLING_MENUS.find((item) => item.id === activeMenu)
    return menu?.label ?? "결제 관리"
  }, [activeMenu])

  const sub = overview?.subscription ?? null

  const planLabel = useMemo(() => {
    if (!sub) return "-"
    const planName = sub.plan_name?.trim()
    if (planName) return planName
    const tierRaw = typeof sub.plan_tier === "string" ? sub.plan_tier.trim().toLowerCase() : ""
    if (!tierRaw) return "-"
    return PLAN_TIER_LABELS[tierRaw as PlanTier] || "-"
  }, [sub])

  const resolvedPlanTier = useMemo(() => {
    if (!sub) return null
    const raw = typeof sub.plan_tier === "string" ? sub.plan_tier.trim().toLowerCase() : ""
    return (raw && raw in PLAN_TIER_LABELS) ? raw as PlanTier : null
  }, [sub])

  const billingCycleLabel = useMemo(() => {
    if (sub?.billing_cycle === "yearly") return "연간"
    if (sub?.billing_cycle === "monthly") return "월간"
    return "-"
  }, [sub])

  const planCycleLabel = useMemo(() => {
    if (subscriptionLoading) return "불러오는 중"
    if (planLabel !== "-" && billingCycleLabel !== "-") return `${planLabel} · ${billingCycleLabel}`
    if (planLabel !== "-") return planLabel
    if (billingCycleLabel !== "-") return billingCycleLabel
    return "-"
  }, [billingCycleLabel, planLabel, subscriptionLoading])

  const priceLabel = useMemo(() => {
    if (subscriptionLoading) return "불러오는 중"
    if (!sub) return "-"
    const localAmount =
      sub.price_local !== null && sub.price_local !== undefined ? Number(sub.price_local) : null
    const usdAmount = Number(sub.price_usd)
    const amount = localAmount !== null ? localAmount : usdAmount
    if (!Number.isFinite(amount)) return "-"
    const currency = normalizeCurrency(localAmount !== null ? sub.currency : "USD") || "USD"
    const amountLabel = `${currencySymbol(currency)}${formatMoney(amount, currency)}`
    const cycleUnit = sub.billing_cycle === "yearly" ? "년" : sub.billing_cycle === "monthly" ? "월" : ""
    return cycleUnit ? `${amountLabel} / ${cycleUnit}` : amountLabel
  }, [subscriptionLoading, sub])

  const nextBillingLabel = useMemo(() => {
    if (subscriptionLoading) return "불러오는 중"
    if (!sub) return "-"
    const value = sub.current_period_end
    if (!value) return "-"
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return String(value)
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed)
  }, [subscriptionLoading, sub])

  const scheduledChanges = overview?.scheduled_changes ?? []
  const seatAddons = useMemo(() => overview?.seat_addons ?? [], [overview])
  const activeSeatAddons = useMemo(() => seatAddons.filter((a) => a.status !== "cancelled"), [seatAddons])

  const handleCancelSeatAddon = useCallback(async (addonId: string) => {
    if (!window.confirm("이 좌석 추가를 취소하시겠습니까?\n다음 결제일부터 적용됩니다.")) return
    setSeatCancelling((prev) => ({ ...prev, [addonId]: true }))
    try {
      await cancelSeatAddon(addonId)
      await loadSubscriptionOverview()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "좌석 취소에 실패했습니다."
      alert(msg)
    } finally {
      setSeatCancelling((prev) => ({ ...prev, [addonId]: false }))
    }
  }, [loadSubscriptionOverview])

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

  const loadInvoiceList = useCallback(async (page: number) => {
    setInvoicesLoading(true)
    setInvoicesError(null)
    try {
      const result = await fetchInvoices({ limit: INVOICES_PER_PAGE, offset: (page - 1) * INVOICES_PER_PAGE })
      setInvoices(result.rows)
      setInvoicesTotal(result.total)
    } catch (e) {
      console.error(e)
      setInvoicesError("청구서 목록을 불러오지 못했습니다.")
    } finally {
      setInvoicesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || activeMenu !== "invoices" || selectedInvoiceId) return
    const headers = authHeaders()
    if (!headers.Authorization) {
      setInvoices([])
      setInvoicesTotal(0)
      setInvoicesLoading(false)
      return
    }
    void loadInvoiceList(invoicePage)
  }, [open, activeMenu, invoicePage, selectedInvoiceId, authHeaders, loadInvoiceList])

  const handleViewInvoice = useCallback(async (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId)
    setInvoiceDetailLoading(true)
    setInvoiceDetail(null)
    try {
      const detail = await fetchInvoiceDetail(invoiceId)
      setInvoiceDetail(detail)
    } catch (e) {
      console.error(e)
    } finally {
      setInvoiceDetailLoading(false)
    }
  }, [])

  const invoiceTotalPages = Math.max(1, Math.ceil(invoicesTotal / INVOICES_PER_PAGE))

  const loadTransactions = useCallback(async (page: number) => {
    setTxLoading(true)
    setTxError(null)
    try {
      const result = await fetchTransactions({ limit: TX_PER_PAGE, offset: (page - 1) * TX_PER_PAGE })
      setTransactions(result.rows)
      setTxTotal(result.total)
    } catch (e) {
      console.error(e)
      setTxError("결제 내역을 불러오지 못했습니다.")
    } finally {
      setTxLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || activeMenu !== "transactions") return
    const headers = authHeaders()
    if (!headers.Authorization) {
      setTransactions([])
      setTxTotal(0)
      setTxLoading(false)
      return
    }
    void loadTransactions(txPage)
  }, [open, activeMenu, txPage, authHeaders, loadTransactions])

  const txTotalPages = Math.max(1, Math.ceil(txTotal / TX_PER_PAGE))

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-48px)] overflow-hidden rounded-xl border border-border p-0 shadow-lg sm:max-w-[min(980px,calc(100%-48px))]"
      >
        <div className="flex h-[700px] max-h-[calc(100vh-2rem)] w-full bg-background">
          <div className="hidden w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            <BillingSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {activeMenu === "billing" && billingEditOpen ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => setBillingEditOpen(false)}
                    aria-label="뒤로가기"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                ) : null}
                {activeMenu === "invoices" && selectedInvoiceId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => {
                      setSelectedInvoiceId(null)
                      setInvoiceDetail(null)
                    }}
                    aria-label="뒤로가기"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                ) : null}
                <Popover>
                  <PopoverTrigger
                    className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
                    aria-label="메뉴"
                  >
                    <Menu className="size-4" />
                  </PopoverTrigger>
                  <PopoverContent align="start" side="bottom" sideOffset={8} className="w-56 p-0">
                    <div className="flex flex-col rounded-lg border border-sidebar-border bg-sidebar">
                      <BillingSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
                    </div>
                  </PopoverContent>
                </Popover>
                <h2 className="text-base font-bold text-foreground">{activeLabel}</h2>
              </div>
              <DialogClose
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </DialogClose>
            </div>

            <div className="mt-3 min-w-0 flex-1 overflow-y-auto pr-2">
              {activeMenu === "subscription" ? (
                // 구독 관리
                <div className="grid gap-4">
                  {/* 현재 구독 */}
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center gap-2 border-b border-border pb-2">
                      <span className="text-sm font-semibold text-foreground">현재 구독</span>
                      {resolvedPlanTier && (
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", PLAN_TIER_STYLES[resolvedPlanTier].badge)}>
                          {PLAN_TIER_LABELS[resolvedPlanTier]}
                        </span>
                      )}
                      {sub?.status === "scheduled_cancel" || sub?.cancel_at_period_end ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30">
                          취소 예약
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                      <span>{planCycleLabel}</span>
                      <span className="text-foreground">{priceLabel}</span>
                    </div>
                    <div className="flex gap-2 items-center justify-between">
                      <div className="flex flex-col">
                        <div className="mt-2 text-xs text-muted-foreground">다음 결제일: {nextBillingLabel}</div>
                        {subscriptionError ? (
                          <div className="mt-1 text-xs text-destructive">{subscriptionError}</div>
                        ) : null}
                      </div>
                      {sub && !sub.cancel_at_period_end && sub.status !== "cancelled" && sub.status !== "scheduled_cancel" ? (
                        <Button variant="ghost" size="xs" className="w-fit text-destructive" onClick={handleCancelSubscription}>
                          구독 취소
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* 예약된 변경사항 */}
                  {scheduledChanges.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-500/30 dark:bg-amber-500/5">
                      <div className="text-sm font-semibold text-foreground border-b border-amber-200 pb-2 dark:border-amber-500/30">
                        예약된 변경
                      </div>
                      <div className="mt-2 flex flex-col gap-2">
                        {scheduledChanges.map((change) => {
                          const effectiveDate = new Date(change.effective_at)
                          const dateLabel = Number.isNaN(effectiveDate.getTime())
                            ? change.effective_at
                            : new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(effectiveDate)
                          const changeTypeLabel = change.change_type === "cancel"
                            ? "구독 취소"
                            : change.change_type === "downgrade"
                            ? "다운그레이드"
                            : change.change_type === "upgrade"
                            ? "업그레이드"
                            : change.change_type === "resume"
                            ? "재개"
                            : change.change_type
                          return (
                            <div key={change.id} className="flex items-center justify-between text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                  {changeTypeLabel}
                                </span>
                                {change.to_plan_name ? (
                                  <span>→ {change.to_plan_name}</span>
                                ) : null}
                              </div>
                              <span>{dateLabel} 적용 예정</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* 좌석 월간 자동결제 */}
                  {activeSeatAddons.length > 0 ? (
                    <div className="rounded-lg border border-border p-4">
                      <div className="text-sm font-semibold text-foreground border-b border-border pb-2">
                        좌석 월간 자동결제
                      </div>
                      <div className="mt-2 flex flex-col gap-2">
                        {activeSeatAddons.map((addon) => {
                          const addonDate = new Date(addon.effective_at)
                          const dateLabel = Number.isNaN(addonDate.getTime())
                            ? addon.effective_at
                            : new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(addonDate)
                          const rawCurrency = normalizeCurrency(addon.currency) || "USD"
                          const localUnit =
                            addon.unit_price_local !== null && addon.unit_price_local !== undefined
                              ? Number(addon.unit_price_local)
                              : null
                          const fxRate =
                            addon.fx_rate !== null && addon.fx_rate !== undefined ? Number(addon.fx_rate) : null
                          const displayCurrency = localUnit !== null || fxRate ? rawCurrency : "USD"
                          const displayUnitPrice =
                            localUnit ?? (fxRate ? addon.unit_price_usd * fxRate : addon.unit_price_usd)
                          const unitPriceLabel = `${currencySymbol(displayCurrency)}${formatMoney(displayUnitPrice, displayCurrency)}`
                          const totalPrice = addon.quantity * displayUnitPrice
                          const totalPriceLabel = `${currencySymbol(displayCurrency)}${formatMoney(totalPrice, displayCurrency)}`
                          const isCancelling = seatCancelling[addon.id] ?? false
                          const isScheduledCancel = addon.status === "scheduled_cancel"
                          return (
                            <div key={addon.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-sm text-foreground">
                                  <span>추가 좌석 {addon.quantity}명</span>
                                  {isScheduledCancel ? (
                                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30">
                                      취소 예약
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {unitPriceLabel}/좌석/월 · 합계 {totalPriceLabel}/월
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  적용일: {dateLabel}
                                </div>
                              </div>
                              {!isScheduledCancel ? (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="text-destructive"
                                  disabled={isCancelling}
                                  onClick={() => handleCancelSeatAddon(addon.id)}
                                >
                                  {isCancelling ? "처리 중..." : "취소"}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">다음 결제일 취소</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  <Button variant="outline" className="w-fit" onClick={handleOpenPlanDialog}>
                    요금제 변경
                  </Button>
                </div>
              ) : null}

              {activeMenu === "invoices" ? (
                // 청구서 
                selectedInvoiceId ? (
                  <div className="grid gap-4">
                    {invoiceDetailLoading ? (
                      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">불러오는 중...</div>
                    ) : !invoiceDetail ? (
                      <div className="flex items-center justify-center py-12 text-sm text-destructive">청구서를 불러오지 못했습니다.</div>
                    ) : (
                      <>
                        <div className="rounded-lg border border-border p-4">
                          <div className="flex items-center gap-2 border-b border-border pb-2">
                            <span className="text-sm font-semibold text-foreground">청구서 정보</span>
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", INVOICE_STATUS_CONFIG[invoiceDetail.status]?.className ?? "")}>
                              {INVOICE_STATUS_CONFIG[invoiceDetail.status]?.label ?? invoiceDetail.status}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2.5 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">청구서 번호</span>
                              <span className="font-medium text-foreground">{invoiceDetail.invoice_number}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">발행일</span>
                              <span className="text-foreground">{formatInvoiceDate(invoiceDetail.issue_date)}</span>
                            </div>
                            {invoiceDetail.paid_at ? (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">결제일</span>
                                <span className="text-foreground">{formatInvoiceDate(invoiceDetail.paid_at)}</span>
                              </div>
                            ) : invoiceDetail.due_date ? (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">결제 기한</span>
                                <span className="text-foreground">{formatInvoiceDate(invoiceDetail.due_date)}</span>
                              </div>
                            ) : null}
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">청구 기간</span>
                              <span className="text-foreground">
                                {formatInvoiceDate(invoiceDetail.period_start)} ~ {formatInvoiceDate(invoiceDetail.period_end)}
                              </span>
                            </div>
                            {invoiceDetail.plan_name ? (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">요금제</span>
                                <span className="text-foreground">{invoiceDetail.plan_name}</span>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {invoiceDetail.line_items.length > 0 ? (() => {
                          const hasLocal = invoiceDetail.local_currency !== "USD" && invoiceDetail.exchange_rate != null && invoiceDetail.exchange_rate > 0
                          const lc = invoiceDetail.local_currency
                          const xr = invoiceDetail.exchange_rate ?? 1
                          return (
                            <div className="rounded-lg border border-border">
                              <div className="px-4 pt-3 pb-1 text-sm font-semibold text-foreground">청구 항목</div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">항목</TableHead>
                                    <TableHead className="w-[50px] text-center text-xs">수량</TableHead>
                                    <TableHead className="w-[100px] text-right text-xs">단가</TableHead>
                                    <TableHead className="w-[100px] text-right text-xs">금액</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {invoiceDetail.line_items.map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="text-sm">{item.description}</TableCell>
                                      <TableCell className="text-center text-sm text-muted-foreground">{item.quantity}</TableCell>
                                      <TableCell className="text-right text-sm text-muted-foreground">
                                        {hasLocal ? (
                                          <>
                                            {currencySymbol(lc)}{formatMoney(Math.round(item.unit_price_usd * xr), lc)}
                                            <div className="text-[11px] text-muted-foreground/60">${formatMoney(item.unit_price_usd, "USD")}</div>
                                          </>
                                        ) : (
                                          <>${formatMoney(item.unit_price_usd, "USD")}</>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-medium">
                                        {hasLocal ? (
                                          <>
                                            {currencySymbol(lc)}{formatMoney(Math.round(item.amount_usd * xr), lc)}
                                            <div className="text-[11px] text-muted-foreground/60">${formatMoney(item.amount_usd, "USD")}</div>
                                          </>
                                        ) : (
                                          <>${formatMoney(item.amount_usd, "USD")}</>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )
                        })() : null}

                        {(() => {
                          const dl = invoiceDetail
                          const hasLocal = dl.local_currency !== "USD" && dl.local_subtotal != null
                          const lc = dl.local_currency
                          return (
                            <div className="rounded-lg border border-border p-4">
                              <div className="flex flex-col gap-1.5 text-sm">
                                <div className="flex items-center justify-between text-muted-foreground">
                                  <span>소계</span>
                                  <span>
                                    {hasLocal
                                      ? <>{currencySymbol(lc)}{formatMoney(dl.local_subtotal!, lc)}</>
                                      : <>${formatMoney(dl.subtotal_usd, "USD")}</>}
                                  </span>
                                </div>
                                {(hasLocal ? (dl.local_tax ?? 0) > 0 : dl.tax_usd > 0) ? (
                                  <div className="flex items-center justify-between text-muted-foreground">
                                    <span>세금</span>
                                    <span>
                                      {hasLocal
                                        ? <>{currencySymbol(lc)}{formatMoney(dl.local_tax!, lc)}</>
                                        : <>${formatMoney(dl.tax_usd, "USD")}</>}
                                    </span>
                                  </div>
                                ) : null}
                                {dl.discount_usd > 0 ? (
                                  <div className="flex items-center justify-between text-muted-foreground">
                                    <span>할인</span>
                                    <span>
                                      {hasLocal
                                        ? <>-{currencySymbol(lc)}{formatMoney(dl.local_discount ?? Math.round(dl.discount_usd * (dl.exchange_rate ?? 1)), lc)}</>
                                        : <>-${formatMoney(dl.discount_usd, "USD")}</>}
                                    </span>
                                  </div>
                                ) : null}
                                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 font-semibold text-foreground">
                                  <span>합계</span>
                                  <span>
                                    {hasLocal
                                      ? <>{currencySymbol(lc)}{formatMoney(dl.local_total!, lc)}</>
                                      : <>${formatMoney(dl.total_usd, "USD")}</>}
                                  </span>
                                </div>
                                {hasLocal ? (
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span />
                                    <span>${formatMoney(dl.total_usd, "USD")}</span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )
                        })()}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3">
                    
                    {invoicesLoading ? (
                      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">불러오는 중...</div>
                    ) : invoicesError ? (
                      <div className="flex items-center justify-center py-12 text-sm text-destructive">{invoicesError}</div>
                    ) : invoices.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">청구서가 없습니다.</div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-sm w-[90px]">유형</TableHead>
                              <TableHead className="text-sm">내용</TableHead>
                              <TableHead className="text-sm w-[130px]">청구서 번호</TableHead>
                              <TableHead className="text-sm w-[100px]">발행일</TableHead>
                              <TableHead className="text-sm w-[70px]">상태</TableHead>
                              <TableHead className="text-sm text-right w-[120px]">금액</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoices.map((inv) => {
                              const ltCfg =
                                inv.primary_line_type && inv.primary_line_type in LINE_TYPE_CONFIG
                                  ? LINE_TYPE_CONFIG[inv.primary_line_type as BillingLineType]
                                  : null
                              return (
                                <TableRow
                                  key={inv.id}
                                  className="cursor-pointer transition-colors hover:bg-accent/50"
                                  onClick={() => handleViewInvoice(inv.id)}
                                >
                                  <TableCell>
                                    {ltCfg ? (
                                      <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", ltCfg.className)}>
                                        {ltCfg.label}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs max-w-[180px] truncate" title={inv.primary_description ?? ""}>
                                    {inv.primary_description || "-"}
                                  </TableCell>
                                  <TableCell
                                    className="text-xs font-medium text-foreground"
                                    title={inv.invoice_number}
                                  >
                                    {inv.invoice_number.length > 12 ? `${inv.invoice_number.slice(0, 12)}…` : inv.invoice_number}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatInvoiceDate(inv.issue_date)}</TableCell>
                                  <TableCell>
                                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", INVOICE_STATUS_CONFIG[inv.status]?.className ?? "")}>
                                      {INVOICE_STATUS_CONFIG[inv.status]?.label ?? inv.status}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-foreground">
                                    {inv.local_total != null && inv.local_currency !== "USD" ? (
                                      <>
                                        {currencySymbol(inv.local_currency)}{formatMoney(inv.local_total, inv.local_currency)}
                                        <div className="text-xs text-muted-foreground">
                                          ${formatMoney(inv.total_usd, "USD")}
                                        </div>
                                      </>
                                    ) : (
                                      <>${formatMoney(inv.total_usd, "USD")}</>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                        {invoicesTotal > INVOICES_PER_PAGE ? (
                          <Pagination className="mt-1">
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                  onClick={(e) => { e.preventDefault(); if (invoicePage > 1) setInvoicePage((p) => p - 1) }}
                                  className={cn(invoicePage <= 1 && "pointer-events-none opacity-50", "cursor-pointer")}
                                />
                              </PaginationItem>
                              {getInvoicePageNumbers(invoicePage, invoiceTotalPages).map((p, idx) =>
                                p === "ellipsis" ? (
                                  <PaginationItem key={`e${idx}`}>
                                    <PaginationEllipsis />
                                  </PaginationItem>
                                ) : (
                                  <PaginationItem key={p}>
                                    <PaginationLink
                                      isActive={p === invoicePage}
                                      onClick={(e) => { e.preventDefault(); setInvoicePage(p as number) }}
                                      className="cursor-pointer"
                                    >
                                      {p}
                                    </PaginationLink>
                                  </PaginationItem>
                                )
                              )}
                              <PaginationItem>
                                <PaginationNext
                                  onClick={(e) => { e.preventDefault(); if (invoicePage < invoiceTotalPages) setInvoicePage((p) => p + 1) }}
                                  className={cn(invoicePage >= invoiceTotalPages && "pointer-events-none opacity-50", "cursor-pointer")}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        ) : null}
                      </>
                    )}
                  </div>
                )
              ) : null}

              {activeMenu === "billing" ? (
                // 청구 관리
                <div className="grid gap-3">
                  {billingLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      <span className="text-sm">청구 정보를 불러오는 중...</span>
                    </div>
                  ) : billingError ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                      <p className="text-sm text-destructive">{billingError}</p>
                      <Button variant="outline" size="sm" onClick={() => void loadBillingAccount()}>
                        다시 시도
                      </Button>
                    </div>
                  ) : !billingEditOpen ? (
                    <>
                      <div className="p-4">
                        <div className="text-sm font-semibold text-foreground border-b border-border pb-2">청구 정보</div>
                        {[
                          { label: "이름(회사명)", value: billingForm.name },
                          { label: "이메일", value: billingForm.email },
                          { label: "청구지 국가", value: COUNTRY_OPTIONS.find((c) => c.code === billingForm.countryCode)?.label ?? billingForm.countryCode },
                          { label: "결제 통화", value: CURRENCY_OPTIONS.find((c) => c.code === billingForm.currency)?.label ?? billingForm.currency },
                          {
                            label: "청구주소",
                            value: [billingForm.postalCode, billingForm.address1, billingForm.address2, billingForm.extraAddress]
                              .filter(Boolean)
                              .join(", ") || undefined,
                          },
                          { label: "전화번호", value: billingForm.phone ? formatPhone(billingForm.phone) : undefined },
                        ].map((item) => (
                          <div key={item.label} className="mt-3 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{item.label}</span>
                            <span className="text-sm text-foreground text-right max-w-[60%] truncate">
                              {item.value || <span className="text-muted-foreground/50">미입력</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" className="w-fit" onClick={() => setBillingEditOpen(true)}>
                        청구 정보 업데이트
                      </Button>
                    </>
                  ) : (
                    <div className="p-4 flex flex-col gap-3">
                      <div className="text-sm font-semibold text-foreground border-b border-border pb-2">청구 정보 수정</div>
                      <div className="mt-2 grid gap-4 text-sm">
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
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => { setBillingEditOpen(false); void loadBillingAccount() }}>
                          취소
                        </Button>
                        <Button onClick={handleSaveBilling} disabled={billingSaving}>
                          {billingSaving ? (
                            <>
                              <Loader2 className="mr-2 size-4 animate-spin" />
                              저장 중...
                            </>
                          ) : "저장"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {activeMenu === "payments" ? (
                // 결제 수단 관리
                <div className="grid gap-4">
                  {paymentMethodsLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      <span className="text-sm">결제 수단을 불러오는 중...</span>
                    </div>
                  ) : paymentMethodsError ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                      <p className="text-sm text-destructive">{paymentMethodsError}</p>
                      <Button variant="outline" size="sm" onClick={() => void loadPaymentMethods()}>
                        다시 시도
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="text-sm font-semibold text-foreground border-b border-border pb-2">등록된 결제 수단</div>
                      {paymentMethods.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                          <CreditCard className="size-8 opacity-40" />
                          <p className="text-sm">등록된 결제 수단이 없습니다.</p>
                        </div>
                      ) : (
                        <div className="mt-3 grid gap-3">
                          {paymentMethods.map((pm) => {
                            const BrandIcon = getCardBrandIcon(pm.brand)
                            const isActioning = pmActionLoading === pm.id
                            return (
                              <div
                                key={pm.id}
                                className={cn(
                                  "flex items-center gap-3 rounded-xl border p-3 bg-card transition-colors",
                                  pm.isDefault ? "border-emerald-300 dark:border-emerald-500/40" : "border-border"
                                )}
                              >
                                <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", pm.bg)}>
                                  {BrandIcon ? <BrandIcon className="h-6 w-9" /> : <CreditCard className="size-5 text-foreground" />}
                                </div>
                                <div className="flex flex-1 flex-col min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{pm.label} •••• {pm.last4}</span>
                                    {pm.isDefault && (
                                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30">
                                        기본
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">만료 {pm.expiry}</span>
                                </div>
                                {isActioning ? (
                                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                ) : !pm.isDefault ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="size-8 p-0">
                                        <Ellipsis className="size-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                      <DropdownMenuItem
                                        className="flex items-center gap-2 text-sm"
                                        onClick={() => void handleSetDefaultCard(pm.id)}
                                      >
                                        <Star className="size-4" />
                                        기본 카드 설정
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="flex items-center gap-2 text-sm text-destructive"
                                        onClick={() => void handleDeleteCard(pm.id)}
                                      >
                                        <Trash2 className="size-4" />
                                        카드 삭제
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-fit"
                    onClick={() => setIsCardAddOpen(true)}
                  >
                    <Plus className="size-4 mr-2" />
                    결제 수단 추가
                  </Button>
                </div>
              ) : null}

              {activeMenu === "transactions" ? (
                // 결제 내역 관리
                <div className="space-y-4">
                  {txLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">불러오는 중…</span>
                    </div>
                  ) : txError ? (
                    <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                      <p>{txError}</p>
                      <Button variant="outline" size="sm" onClick={() => loadTransactions(txPage)}>다시 시도</Button>
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      결제 내역이 없습니다.
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">날짜</TableHead>
                            <TableHead className="w-[80px]">유형</TableHead>
                            <TableHead>내용</TableHead>
                            <TableHead className="w-[140px]">결제 수단</TableHead>
                            <TableHead className="text-right">금액</TableHead>
                            <TableHead className="w-[70px] text-center">상태</TableHead>
                            <TableHead className="w-[90px] text-center">영수증</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((tx) => {
                            const brand = tx.card_brand ? normalizeCardBrand(tx.card_brand) : null
                            const CardIcon = brand ? (getCardBrandIcon(brand) ?? CreditCard) : CreditCard
                            const brandLabel = brand ? cardLabel(brand) : null
                            const statusCfg = TX_STATUS_CONFIG[tx.status] ?? TX_STATUS_CONFIG.pending
                            const typeLabel = TX_TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type

                            const isLocal = tx.amount_local != null && tx.local_currency && tx.local_currency !== tx.currency
                            const primaryAmount = isLocal
                              ? `${currencySymbol(tx.local_currency)}${formatMoney(tx.amount_local!, tx.local_currency)}`
                              : `${currencySymbol(tx.currency)}${formatMoney(tx.amount_usd, tx.currency)}`
                            const secondaryAmount = isLocal
                              ? `${currencySymbol(tx.currency)}${formatMoney(tx.amount_usd, tx.currency)}`
                              : null

                            return (
                              <TableRow key={tx.id}>
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatInvoiceDate(tx.processed_at ?? tx.created_at)}
                                </TableCell>
                                <TableCell>
                                  <span className={cn(
                                    "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                                    tx.transaction_type === "refund"
                                      ? "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400"
                                      : tx.transaction_type === "adjustment"
                                        ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                                        : "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                                  )}>
                                    {typeLabel}
                                  </span>
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px] truncate" title={tx.invoice_description ?? tx.invoice_number ?? ""}>
                                  {(() => {
                                    const ltCfg =
                                      tx.primary_line_type && tx.primary_line_type in LINE_TYPE_CONFIG
                                        ? LINE_TYPE_CONFIG[tx.primary_line_type as BillingLineType]
                                        : null
                                    return ltCfg ? ltCfg.label : (tx.invoice_description || tx.invoice_number || "-")
                                  })()}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {tx.card_last4 ? (
                                    <div className="flex items-center gap-1.5">
                                      <CardIcon className="h-5 w-7 shrink-0 rounded-sm" />
                                      <span className="text-xs text-muted-foreground">{brandLabel ? `${brandLabel} ·` : ""} {tx.card_last4}</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  <div className="font-medium text-sm">{primaryAmount}</div>
                                  {secondaryAmount && (
                                    <div className="text-[11px] text-muted-foreground">{secondaryAmount}</div>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className={cn(
                                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                                    statusCfg.className
                                  )}>
                                    {statusCfg.label}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button variant="outline" size="sm" className="h-7 text-xs">
                                    영수증
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>

                      {txTotalPages > 1 && (
                        <div className="flex justify-center pt-2">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                  onClick={() => txPage > 1 && setTxPage(txPage - 1)}
                                  className={cn(txPage <= 1 && "pointer-events-none opacity-50")}
                                />
                              </PaginationItem>
                              {getInvoicePageNumbers(txPage, txTotalPages).map((p, idx) =>
                                p === "ellipsis" ? (
                                  <PaginationItem key={`e-${idx}`}>
                                    <PaginationEllipsis />
                                  </PaginationItem>
                                ) : (
                                  <PaginationItem key={p}>
                                    <PaginationLink
                                      isActive={p === txPage}
                                      onClick={() => setTxPage(p)}
                                    >
                                      {p}
                                    </PaginationLink>
                                  </PaginationItem>
                                )
                              )}
                              <PaginationItem>
                                <PaginationNext
                                  onClick={() => txPage < txTotalPages && setTxPage(txPage + 1)}
                                  className={cn(txPage >= txTotalPages && "pointer-events-none opacity-50")}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        </DialogContent>
      </Dialog>
      <AddCardDialog
        open={isCardAddOpen}
        onOpenChange={setIsCardAddOpen}
        onSaved={loadPaymentMethods}
        getAuthHeaders={authHeaders}
      />
    </>
  )
}
