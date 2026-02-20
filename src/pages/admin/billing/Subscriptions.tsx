import { useEffect, useMemo, useState } from "react"
import { adminFetch } from "@/lib/adminFetch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Pencil, Plus, RefreshCcw } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type PlanOption = {
  id: string
  slug: string
  name: string
  tier: string
  tenant_type: string
}

type PlanPriceRow = {
  id: string
  plan_id: string
  billing_cycle: "monthly" | "yearly" | string
  price_usd: string | number | null
  currency?: string | null
  status?: string | null
  effective_at?: string | null
  version?: number | string | null
  plan_slug?: string | null
  plan_name?: string | null
  plan_tier?: string | null
  plan_tenant_type?: string | null
}

type FxRateRow = {
  id: string
  base_currency: string
  quote_currency: string
  rate: string | number
  source?: string | null
  effective_at?: string | null
  is_active?: boolean | null
}

type SubscriptionRow = {
  id: string
  tenant_id: string
  plan_id: string
  billing_cycle: "monthly" | "yearly"
  status: "active" | "cancelled" | "past_due" | "trialing" | "suspended" | "scheduled_cancel"
  started_at: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  cancelled_at?: string | null
  ended_at?: string | null
  auto_renew: boolean
  price_usd?: string | number | null
  currency: string
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  plan_name?: string | null
  plan_slug?: string | null
  plan_tier?: string | null
}

type ChangeRow = {
  id: string
  subscription_id: string
  from_plan_id?: string | null
  to_plan_id?: string | null
  from_billing_cycle?: string | null
  to_billing_cycle?: string | null
  change_type: "upgrade" | "downgrade" | "cancel" | "resume"
  effective_at: string
  proration_amount_usd?: string | number | null
  credit_proration_credits?: string | number | null
  status: "scheduled" | "applied" | "cancelled"
  requested_by?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  from_plan_name?: string | null
  from_plan_slug?: string | null
  to_plan_name?: string | null
  to_plan_slug?: string | null
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

type EditForm = {
  status: SubscriptionRow["status"]
  cancel_at_period_end: boolean
  auto_renew: boolean
  current_period_start: string
  current_period_end: string
  cancelled_at: string
  ended_at: string
  price_usd: string
  currency: string
  metadata: string
}

type ProvisionForm = {
  tenant_id: string
  subscription_id: string
  plan_id: string
  billing_cycle: "monthly" | "yearly"
  current_period_start: string
  current_period_end: string
  price_usd: string
  currency: string
  auto_renew: boolean
  cancel_at_period_end: boolean
  provider: "toss" | "stripe"
  note: string
}

type TenantLookupUser = {
  id: string
  email?: string | null
  full_name?: string | null
  tenant_id?: string | null
  tenant_name?: string | null
  tenant_type?: string | null
}

const SUBS_API = "/api/ai/billing/subscriptions"
const PROVISION_API = "/api/ai/billing/subscriptions/provision"
const CHANGES_API = "/api/ai/billing/subscription-changes"
const PLANS_API = "/api/ai/billing/plans"
const PLAN_PRICES_API = "/api/ai/billing/plan-prices"
const FX_RATES_API = "/api/ai/billing/fx-rates"
const FILTER_ALL = "__all__"

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function toDateTimeLocal(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatMoney(v: unknown, currency?: string) {
  if (v === null || v === undefined || v === "") return "-"
  const n = Number(v)
  if (!Number.isFinite(n)) return "-"
  return `${currency || "USD"} ${n.toFixed(2)}`
}

function addMonths(date: Date, months: number) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function badgeClass(active: boolean) {
  return active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"
}

function statusBadge(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "cancelled" || status === "suspended") return "bg-rose-50 text-rose-700 border-rose-200"
  if (status === "past_due") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "trialing") return "bg-blue-50 text-blue-700 border-blue-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toNumberOrNull(value: unknown) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  KRW: 0,
  JPY: 0,
}

function normalizeCurrency(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : ""
  return raw.length === 3 ? raw : raw
}

function currencyDecimals(currency: string) {
  return CURRENCY_DECIMALS[normalizeCurrency(currency)] ?? 2
}

function roundMoney(value: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function formatMoneyDisplay(value: number | null, currency: string) {
  if (value === null) return ""
  const decimals = currencyDecimals(currency)
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function pickLatestPlanPrice(rows: PlanPriceRow[], planId: string, billingCycle: string) {
  if (!planId) return null
  const matches = rows.filter(
    (r) => String(r.plan_id) === String(planId) && String(r.billing_cycle) === String(billingCycle || "monthly")
  )
  if (!matches.length) return null
  const active = matches.filter((r) => !r.status || r.status === "active")
  const list = active.length ? active : matches
  return list
    .slice()
    .sort((a, b) => {
      const av = toNumberOrNull(a.version) ?? 0
      const bv = toNumberOrNull(b.version) ?? 0
      if (av !== bv) return bv - av
      const at = a.effective_at ? new Date(a.effective_at).getTime() : 0
      const bt = b.effective_at ? new Date(b.effective_at).getTime() : 0
      return bt - at
    })[0]
}

function pickLatestFxRate(rows: FxRateRow[], base: string, quote: string) {
  const baseKey = normalizeCurrency(base)
  const quoteKey = normalizeCurrency(quote)
  if (!baseKey || !quoteKey) return null
  const matches = rows.filter(
    (r) =>
      normalizeCurrency(r.base_currency) === baseKey &&
      normalizeCurrency(r.quote_currency) === quoteKey &&
      r.is_active !== false
  )
  if (!matches.length) return null
  const row = matches
    .slice()
    .sort((a, b) => {
      const at = a.effective_at ? new Date(a.effective_at).getTime() : 0
      const bt = b.effective_at ? new Date(b.effective_at).getTime() : 0
      return bt - at
    })[0]
  const rate = toNumberOrNull(row.rate)
  if (!rate || rate <= 0) return null
  return rate
}

function resolveFxRate(rows: FxRateRow[], base: string, quote: string) {
  const baseKey = normalizeCurrency(base)
  const quoteKey = normalizeCurrency(quote)
  if (!baseKey || !quoteKey) return null
  if (baseKey === quoteKey) return 1
  const direct = pickLatestFxRate(rows, baseKey, quoteKey)
  if (direct) return direct
  const reverse = pickLatestFxRate(rows, quoteKey, baseKey)
  if (reverse) return 1 / reverse
  return null
}

function normalizeRenewalFlags(cancelAt: boolean, autoRenew: boolean) {
  if (cancelAt === autoRenew) {
    return { cancel_at_period_end: cancelAt, auto_renew: !cancelAt }
  }
  return { cancel_at_period_end: cancelAt, auto_renew: autoRenew }
}

export default function BillingSubscriptions() {
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [planPrices, setPlanPrices] = useState<PlanPriceRow[]>([])
  const [planPricesLoading, setPlanPricesLoading] = useState(false)
  const [fxRates, setFxRates] = useState<FxRateRow[]>([])
  const [fxRatesLoading, setFxRatesLoading] = useState(false)
  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [status, setStatus] = useState(FILTER_ALL)
  const [billingCycle, setBillingCycle] = useState(FILTER_ALL)
  const [planId, setPlanId] = useState(FILTER_ALL)
  const [tenantId, setTenantId] = useState("")

  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [changesLoading, setChangesLoading] = useState(false)
  const [changesTotal, setChangesTotal] = useState(0)
  const [changesPage, setChangesPage] = useState(0)
  const changesLimit = 50

  const [changeQ, setChangeQ] = useState("")
  const [changeType, setChangeType] = useState(FILTER_ALL)
  const [changeStatus, setChangeStatus] = useState(FILTER_ALL)
  const [changeSubscriptionId, setChangeSubscriptionId] = useState("")

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<SubscriptionRow | null>(null)
  const [form, setForm] = useState<EditForm>({
    status: "active",
    cancel_at_period_end: false,
    auto_renew: true,
    current_period_start: "",
    current_period_end: "",
    cancelled_at: "",
    ended_at: "",
    price_usd: "",
    currency: "USD",
    metadata: "",
  })
  const [saving, setSaving] = useState(false)

  const [provisionOpen, setProvisionOpen] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [provisionForm, setProvisionForm] = useState<ProvisionForm>({
    tenant_id: "",
    subscription_id: "",
    plan_id: "",
    billing_cycle: "monthly",
    current_period_start: "",
    current_period_end: "",
    price_usd: "",
    currency: "USD",
    auto_renew: true,
    cancel_at_period_end: false,
    provider: "stripe",
    note: "",
  })

  const [tenantLookupQuery, setTenantLookupQuery] = useState("")
  const [tenantLookupOptions, setTenantLookupOptions] = useState<TenantLookupUser[]>([])
  const [tenantLookupOpen, setTenantLookupOpen] = useState(false)
  const [tenantLookupLoading, setTenantLookupLoading] = useState(false)
  const [tenantLookupError, setTenantLookupError] = useState<string | null>(null)

  const editPlanPrice = useMemo(() => {
    if (!editing) return null
    return pickLatestPlanPrice(planPrices, editing.plan_id, editing.billing_cycle || "monthly")
  }, [editing, planPrices])

  const provisionPlanPrice = useMemo(
    () => pickLatestPlanPrice(planPrices, provisionForm.plan_id, provisionForm.billing_cycle || "monthly"),
    [planPrices, provisionForm.billing_cycle, provisionForm.plan_id]
  )

  const editAutoPrice = useMemo(() => {
    const baseAmount = toNumberOrNull(editPlanPrice?.price_usd)
    if (baseAmount === null) return null
    const baseCurrency = normalizeCurrency(editPlanPrice?.currency) || "USD"
    const targetCurrency = normalizeCurrency(form.currency) || baseCurrency
    const rate = resolveFxRate(fxRates, baseCurrency, targetCurrency)
    if (rate === null) return null
    return roundMoney(baseAmount * rate, currencyDecimals(targetCurrency))
  }, [editPlanPrice, form.currency, fxRates])

  const provisionAutoPrice = useMemo(() => {
    const baseAmount = toNumberOrNull(provisionPlanPrice?.price_usd)
    if (baseAmount === null) return null
    const baseCurrency = normalizeCurrency(provisionPlanPrice?.currency) || "USD"
    const targetCurrency = normalizeCurrency(provisionForm.currency) || baseCurrency
    const rate = resolveFxRate(fxRates, baseCurrency, targetCurrency)
    if (rate === null) return null
    return roundMoney(baseAmount * rate, currencyDecimals(targetCurrency))
  }, [provisionForm.currency, provisionPlanPrice, fxRates])

  const currencyOptions = useMemo(() => {
    const set = new Set<string>()
    set.add("USD")
    fxRates.forEach((r) => {
      if (r.base_currency) set.add(String(r.base_currency).toUpperCase())
      if (r.quote_currency) set.add(String(r.quote_currency).toUpperCase())
    })
    if (form.currency) set.add(String(form.currency).toUpperCase())
    if (provisionForm.currency) set.add(String(provisionForm.currency).toUpperCase())
    return Array.from(set).sort()
  }, [fxRates, form.currency, provisionForm.currency])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (status !== FILTER_ALL) params.set("status", status)
    if (billingCycle !== FILTER_ALL) params.set("billing_cycle", billingCycle)
    if (planId !== FILTER_ALL) params.set("plan_id", planId)
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    return params.toString()
  }, [billingCycle, limit, page, planId, q, status, tenantId])

  const changesQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(changesLimit))
    params.set("offset", String(changesPage * changesLimit))
    if (changeQ.trim()) params.set("q", changeQ.trim())
    if (changeType !== FILTER_ALL) params.set("change_type", changeType)
    if (changeStatus !== FILTER_ALL) params.set("status", changeStatus)
    if (changeSubscriptionId.trim()) params.set("subscription_id", changeSubscriptionId.trim())
    return params.toString()
  }, [changeQ, changeStatus, changeSubscriptionId, changeType, changesLimit, changesPage])

  async function fetchPlans() {
    try {
      const res = await adminFetch(`${PLANS_API}?limit=200&offset=0`)
      const json: unknown = await res.json().catch(() => null)
      if (Array.isArray(json)) {
        setPlans(json as PlanOption[])
        return
      }
      if (json && typeof json === "object" && Array.isArray((json as { rows?: unknown }).rows)) {
        setPlans((json as { rows: PlanOption[] }).rows)
        return
      }
      setPlans([])
    } catch (e) {
      console.error(e)
      setPlans([])
    }
  }

  async function fetchPlanPrices() {
    setPlanPricesLoading(true)
    try {
      const res = await adminFetch(`${PLAN_PRICES_API}?status=active&limit=200&offset=0`)
      const json = (await res.json().catch(() => null)) as ListResponse<PlanPriceRow> | PlanPriceRow[] | null
      if (Array.isArray(json)) {
        setPlanPrices(json)
        return
      }
      if (json && typeof json === "object" && Array.isArray(json.rows)) {
        setPlanPrices(json.rows)
        return
      }
      setPlanPrices([])
    } catch (e) {
      console.error(e)
      setPlanPrices([])
    } finally {
      setPlanPricesLoading(false)
    }
  }

  async function fetchFxRates() {
    setFxRatesLoading(true)
    try {
      const res = await adminFetch(`${FX_RATES_API}?is_active=true&limit=200&offset=0`)
      const json = (await res.json().catch(() => null)) as ListResponse<FxRateRow> | FxRateRow[] | null
      if (Array.isArray(json)) {
        setFxRates(json)
        return
      }
      if (json && typeof json === "object" && Array.isArray(json.rows)) {
        setFxRates(json.rows)
        return
      }
      setFxRates([])
    } catch (e) {
      console.error(e)
      setFxRates([])
    } finally {
      setFxRatesLoading(false)
    }
  }

  async function fetchSubscriptions() {
    setLoading(true)
    try {
      const res = await adminFetch(`${SUBS_API}?${queryString}`)
      const json = (await res.json()) as ListResponse<SubscriptionRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setRows(json.rows || [])
      setTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  async function fetchChanges() {
    setChangesLoading(true)
    try {
      const res = await adminFetch(`${CHANGES_API}?${changesQuery}`)
      const json = (await res.json()) as ListResponse<ChangeRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setChanges(json.rows || [])
      setChangesTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setChanges([])
      setChangesTotal(0)
    } finally {
      setChangesLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
    fetchPlanPrices()
    fetchFxRates()
  }, [])

  useEffect(() => {
    if (!provisionOpen) {
      setTenantLookupQuery("")
      setTenantLookupOptions([])
      setTenantLookupOpen(false)
      setTenantLookupLoading(false)
      setTenantLookupError(null)
      return
    }
    if (provisionForm.tenant_id && !tenantLookupQuery) {
      setTenantLookupQuery(provisionForm.tenant_id)
    }
  }, [provisionForm.tenant_id, provisionOpen, tenantLookupQuery])

  useEffect(() => {
    if (!editOpen || !editing) return
    if (editAutoPrice === null) return
    const next = String(editAutoPrice)
    setForm((p) => (p.price_usd === next ? p : { ...p, price_usd: next }))
  }, [editAutoPrice, editOpen, editing])

  useEffect(() => {
    if (!provisionOpen) return
    if (provisionAutoPrice === null) return
    const next = String(provisionAutoPrice)
    setProvisionForm((p) => (p.price_usd === next ? p : { ...p, price_usd: next }))
  }, [provisionAutoPrice, provisionOpen])

  useEffect(() => {
    if (!provisionOpen) return
    const q = tenantLookupQuery.trim()
    if (!q) {
      setTenantLookupOptions([])
      setTenantLookupLoading(false)
      setTenantLookupError(null)
      return
    }

    let cancelled = false
    setTenantLookupLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ limit: "20", search: q })
          const res = await adminFetch(`/api/users?${params.toString()}`)
          const data = (await res.json().catch(() => null)) as
            | { users?: TenantLookupUser[]; rows?: TenantLookupUser[]; message?: string }
            | null
          if (!res.ok) {
            const msg = typeof data?.message === "string" ? data.message : "사용자 검색에 실패했습니다."
            throw new Error(msg)
          }
          const list = Array.isArray(data?.users)
            ? data?.users
            : Array.isArray(data?.rows)
              ? data?.rows
              : []
          const normalized = list
            .map((u) => ({
              id: String(u.id || ""),
              email: u.email ?? null,
              full_name: u.full_name ?? null,
              tenant_id: u.tenant_id ?? null,
              tenant_name: u.tenant_name ?? null,
              tenant_type: u.tenant_type ?? null,
            }))
            .filter((u) => u.id)
          if (!cancelled) {
            setTenantLookupOptions(normalized)
            setTenantLookupError(null)
          }
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : "사용자 검색 중 오류가 발생했습니다."
            setTenantLookupError(msg)
            setTenantLookupOptions([])
          }
        } finally {
          if (!cancelled) setTenantLookupLoading(false)
        }
      })()
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [provisionOpen, tenantLookupQuery])

  useEffect(() => {
    fetchSubscriptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  useEffect(() => {
    fetchChanges()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changesQuery])

  function openEdit(row: SubscriptionRow) {
    setEditing(row)
    const normalized = normalizeRenewalFlags(Boolean(row.cancel_at_period_end), Boolean(row.auto_renew))
    setForm({
      status: row.status,
      cancel_at_period_end: normalized.cancel_at_period_end,
      auto_renew: normalized.auto_renew,
      current_period_start: toDateTimeLocal(row.current_period_start),
      current_period_end: toDateTimeLocal(row.current_period_end),
      cancelled_at: toDateTimeLocal(row.cancelled_at || null),
      ended_at: toDateTimeLocal(row.ended_at || null),
      price_usd: row.price_usd === null || row.price_usd === undefined ? "" : String(row.price_usd),
      currency: row.currency || "USD",
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setEditOpen(true)
  }

  function openProvision(row?: SubscriptionRow) {
    const now = new Date()
    const cycle = row?.billing_cycle || "monthly"
    const defaultEnd =
      cycle === "yearly" ? addMonths(now, 12) : addMonths(now, 1)
    const normalized = normalizeRenewalFlags(Boolean(row?.cancel_at_period_end), row?.auto_renew ?? true)
    setProvisionForm({
      tenant_id: row?.tenant_id || "",
      subscription_id: row?.id || "",
      plan_id: row?.plan_id || plans[0]?.id || "",
      billing_cycle: cycle,
      current_period_start: toDateTimeLocal(row?.current_period_start || now.toISOString()),
      current_period_end: toDateTimeLocal(row?.current_period_end || defaultEnd.toISOString()),
      price_usd:
        row?.price_usd === null || row?.price_usd === undefined ? "" : String(row.price_usd),
      currency: row?.currency || "USD",
      auto_renew: normalized.auto_renew,
      cancel_at_period_end: normalized.cancel_at_period_end,
      provider: "stripe",
      note: "",
    })
    setProvisionOpen(true)
  }

  async function saveEdit() {
    if (!editing) return
    if (!form.current_period_start) return alert("현재 기간 시작을 입력해주세요.")
    if (!form.current_period_end) return alert("현재 기간 종료를 입력해주세요.")

    const priceUsd =
      editAutoPrice !== null ? editAutoPrice : form.price_usd.trim() ? Number(form.price_usd) : null
    if (priceUsd !== null && (!Number.isFinite(priceUsd) || priceUsd < 0)) {
      return alert("가격 값을 확인해주세요.")
    }
    const currency = form.currency.trim().toUpperCase()
    if (!currency || currency.length !== 3) return alert("통화 코드를 확인해주세요.")

    const metadataValue = parseJson(form.metadata)
    if (metadataValue === null) return alert("메타데이터 JSON 형식이 올바르지 않습니다.")

    try {
      setSaving(true)
      const { cancel_at_period_end, auto_renew } = normalizeRenewalFlags(
        form.cancel_at_period_end,
        form.auto_renew
      )
      const res = await adminFetch(`${SUBS_API}/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          cancel_at_period_end,
          auto_renew,
          current_period_start: new Date(form.current_period_start).toISOString(),
          current_period_end: new Date(form.current_period_end).toISOString(),
          cancelled_at: form.cancelled_at ? new Date(form.cancelled_at).toISOString() : null,
          ended_at: form.ended_at ? new Date(form.ended_at).toISOString() : null,
          price_usd: priceUsd,
          currency,
          metadata: metadataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setEditOpen(false)
      setEditing(null)
      await fetchSubscriptions()
    } catch (e) {
      console.error(e)
      alert("구독 정보 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function saveProvision() {
    if (!provisionForm.tenant_id.trim()) return alert("테넌트 ID를 입력해주세요.")
    if (!provisionForm.plan_id) return alert("플랜을 선택해주세요.")
    if (!provisionForm.current_period_start) return alert("현재 기간 시작을 입력해주세요.")
    if (!provisionForm.current_period_end) return alert("현재 기간 종료를 입력해주세요.")
    if (provisionAutoPrice === null && !provisionForm.price_usd.trim()) {
      return alert("가격을 입력해주세요.")
    }

    const priceUsd =
      provisionAutoPrice !== null ? provisionAutoPrice : provisionForm.price_usd.trim() ? Number(provisionForm.price_usd) : 0
    if (!Number.isFinite(priceUsd) || priceUsd < 0) return alert("가격 값을 확인해주세요.")
    const currency = provisionForm.currency.trim().toUpperCase()
    if (!currency || currency.length !== 3) return alert("통화 코드를 확인해주세요.")

    const startDate = new Date(provisionForm.current_period_start)
    const endDate = new Date(provisionForm.current_period_end)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return alert("기간 날짜를 확인해주세요.")
    }

    const normalized = normalizeRenewalFlags(provisionForm.cancel_at_period_end, provisionForm.auto_renew)
    const payload: Record<string, unknown> = {
      tenant_id: provisionForm.tenant_id.trim(),
      plan_id: provisionForm.plan_id,
      billing_cycle: provisionForm.billing_cycle,
      current_period_start: startDate.toISOString(),
      current_period_end: endDate.toISOString(),
      price_usd: priceUsd,
      currency,
      auto_renew: normalized.auto_renew,
      cancel_at_period_end: normalized.cancel_at_period_end,
      provider: provisionForm.provider,
      note: provisionForm.note.trim() || undefined,
    }
    if (provisionForm.subscription_id) {
      payload.subscription_id = provisionForm.subscription_id
    }

    try {
      setProvisioning(true)
      const res = await adminFetch(PROVISION_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_PROVISION")
      setProvisionOpen(false)
      await fetchSubscriptions()
      await fetchChanges()
    } catch (e) {
      console.error(e)
      alert("관리자 구독 적용에 실패했습니다.")
    } finally {
      setProvisioning(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))
  const changesPageCount = Math.max(1, Math.ceil(changesTotal / changesLimit))

  return (
    <AdminPage
      headerContent={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => openProvision()}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">유료 구독 적용</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchSubscriptions} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">구독 새로고침</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchChanges} disabled={changesLoading}>
            {changesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">변경 새로고침</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-1">
        <div className="text-xl font-semibold">구독 현황</div>
        <div className="text-sm text-muted-foreground">billing_subscriptions, billing_subscription_changes</div>
      </div>

      <Tabs defaultValue="subscriptions">
        <TabsList>
          <TabsTrigger value="subscriptions">구독 현황</TabsTrigger>
          <TabsTrigger value="changes">변경 내역</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="테넌트/플랜 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="w-full md:w-40 space-y-1">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="trialing">trialing</SelectItem>
                  <SelectItem value="past_due">past_due</SelectItem>
                  <SelectItem value="scheduled_cancel">scheduled_cancel</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                  <SelectItem value="suspended">suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">주기</div>
              <Select value={billingCycle} onValueChange={setBillingCycle}>
                <SelectTrigger>
                  <SelectValue placeholder="주기" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="monthly">monthly</SelectItem>
                  <SelectItem value="yearly">yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-60 space-y-1">
              <div className="text-xs text-muted-foreground">플랜</div>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="플랜 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.tier}/{p.tenant_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-56 space-y-1">
              <div className="text-xs text-muted-foreground">테넌트 ID</div>
              <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant_id" />
            </div>
            <div className="flex items-center gap-2" />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>테넌트</TableHead>
                  <TableHead>플랜</TableHead>
                  <TableHead>주기</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>현재 기간</TableHead>
                  <TableHead>자동갱신</TableHead>
                  <TableHead>취소 예정</TableHead>
                  <TableHead>가격</TableHead>
                  <TableHead>업데이트</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      표시할 구독이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.tenant_name || row.tenant_slug || row.tenant_id}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {row.tenant_slug} {row.tenant_type ? `(${row.tenant_type})` : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.plan_name || row.plan_slug || row.plan_id}</span>
                        <span className="text-xs text-muted-foreground font-mono">{row.plan_tier || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{row.billing_cycle}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadge(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(row.current_period_start)} ~ {fmtDate(row.current_period_end)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass(row.auto_renew)}>
                        {row.auto_renew ? "ON" : "OFF"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass(row.cancel_at_period_end)}>
                        {row.cancel_at_period_end ? "예정" : "아님"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{formatMoney(row.price_usd, row.currency)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openProvision(row)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">총 {total}건</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                이전
              </Button>
              <span className="text-muted-foreground">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="테넌트/플랜 검색" value={changeQ} onChange={(e) => setChangeQ(e.target.value)} />
            </div>
            <div className="w-full md:w-48 space-y-1">
              <div className="text-xs text-muted-foreground">구독 ID</div>
              <Input value={changeSubscriptionId} onChange={(e) => setChangeSubscriptionId(e.target.value)} placeholder="subscription_id" />
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">유형</div>
              <Select value={changeType} onValueChange={setChangeType}>
                <SelectTrigger>
                  <SelectValue placeholder="유형" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="upgrade">upgrade</SelectItem>
                  <SelectItem value="downgrade">downgrade</SelectItem>
                  <SelectItem value="cancel">cancel</SelectItem>
                  <SelectItem value="resume">resume</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select value={changeStatus} onValueChange={setChangeStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="scheduled">scheduled</SelectItem>
                  <SelectItem value="applied">applied</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2" />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>테넌트</TableHead>
                  <TableHead>변경 유형</TableHead>
                  <TableHead>플랜 변경</TableHead>
                  <TableHead>주기 변경</TableHead>
                  <TableHead>유효 시간</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>조정 금액</TableHead>
                  <TableHead className="text-right">업데이트</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.length === 0 && !changesLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      표시할 변경 내역이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {changesLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {changes.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.tenant_name || row.tenant_slug || "-"}</span>
                        <span className="text-xs text-muted-foreground font-mono">{row.tenant_slug || ""}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{row.change_type}</TableCell>
                    <TableCell className="text-xs">
                      <div>{row.from_plan_name || row.from_plan_slug || "-"}</div>
                      <div className="text-muted-foreground">→ {row.to_plan_name || row.to_plan_slug || "-"}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.from_billing_cycle || "-"} → {row.to_billing_cycle || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.effective_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadge(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      USD {Number(row.proration_amount_usd ?? 0).toFixed(2)}
                      <div className="text-muted-foreground">credits {row.credit_proration_credits ?? 0}</div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">총 {changesTotal}건</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={changesPage <= 0}
                onClick={() => setChangesPage((p) => Math.max(0, p - 1))}
              >
                이전
              </Button>
              <span className="text-muted-foreground">
                {changesPage + 1} / {changesPageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={changesPage + 1 >= changesPageCount}
                onClick={() => setChangesPage((p) => Math.min(changesPageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>구독 상태 수정</DialogTitle>
          </DialogHeader>

          {editing ? (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {editing.tenant_name || editing.tenant_slug || editing.tenant_id} ·{" "}
                {editing.plan_name || editing.plan_slug || editing.plan_id}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">상태</div>
                  <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as EditForm["status"] }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="상태" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="trialing">trialing</SelectItem>
                      <SelectItem value="past_due">past_due</SelectItem>
                      <SelectItem value="scheduled_cancel">scheduled_cancel</SelectItem>
                      <SelectItem value="cancelled">cancelled</SelectItem>
                      <SelectItem value="suspended">suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">통화</div>
                  <Select value={form.currency} onValueChange={(v) => setForm((p) => ({ ...p, currency: v.toUpperCase() }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="통화 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fxRatesLoading ? (
                    <div className="text-xs text-muted-foreground">환율 목록 불러오는 중...</div>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">현재 기간 시작</div>
                  <Input
                    type="datetime-local"
                    value={form.current_period_start}
                    onChange={(e) => setForm((p) => ({ ...p, current_period_start: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">현재 기간 종료</div>
                  <Input
                    type="datetime-local"
                    value={form.current_period_end}
                    onChange={(e) => setForm((p) => ({ ...p, current_period_end: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">취소 일시</div>
                  <Input
                    type="datetime-local"
                    value={form.cancelled_at}
                    onChange={(e) => setForm((p) => ({ ...p, cancelled_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">종료 일시</div>
                  <Input
                    type="datetime-local"
                    value={form.ended_at}
                    onChange={(e) => setForm((p) => ({ ...p, ended_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">가격({form.currency || "USD"})</div>
                  <Input
                    type={editAutoPrice !== null ? "text" : "number"}
                    min={0}
                    step="0.01"
                    value={
                      editAutoPrice !== null
                        ? formatMoneyDisplay(editAutoPrice, form.currency)
                        : form.price_usd
                    }
                    onChange={(e) => setForm((p) => ({ ...p, price_usd: e.target.value }))}
                    readOnly={editAutoPrice !== null}
                  />
                  {editAutoPrice !== null ? (
                    <div className="text-xs text-muted-foreground">
                      플랜 기준으로 자동 책정됩니다.
                    </div>
                  ) : editPlanPrice ? (
                    <div className="text-xs text-muted-foreground">환율 정보를 찾지 못했습니다. 필요 시 입력하세요.</div>
                  ) : planPricesLoading ? (
                    <div className="text-xs text-muted-foreground">플랜 가격 불러오는 중...</div>
                  ) : editing?.plan_id ? (
                    <div className="text-xs text-muted-foreground">플랜 가격 정보를 찾지 못했습니다. 필요 시 입력하세요.</div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="cancel-at-period-end"
                    checked={form.cancel_at_period_end}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, cancel_at_period_end: v, auto_renew: !v }))}
                  />
                  <Label htmlFor="cancel-at-period-end">기간 종료 시 취소</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="auto-renew"
                    checked={form.auto_renew}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, auto_renew: v, cancel_at_period_end: !v }))}
                  />
                  <Label htmlFor="auto-renew">자동 갱신</Label>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">메타데이터(JSON)</div>
                <Textarea
                  rows={4}
                  value={form.metadata}
                  onChange={(e) => setForm((p) => ({ ...p, metadata: e.target.value }))}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={saving ? "ml-2" : ""}>저장</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={provisionOpen} onOpenChange={setProvisionOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>관리자 유료 구독 적용</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {provisionForm.subscription_id ? (
              <div className="text-xs text-muted-foreground">현재 구독 ID: {provisionForm.subscription_id}</div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">테넌트 (사용자 검색)</div>
                <div className="relative">
                  <Input
                    value={tenantLookupQuery}
                    onChange={(e) => {
                      const next = e.target.value
                      setTenantLookupQuery(next)
                      setTenantLookupOpen(true)
                      setTenantLookupError(null)
                      if (provisionForm.tenant_id) {
                        setProvisionForm((p) => ({ ...p, tenant_id: "" }))
                      }
                    }}
                    onFocus={() => setTenantLookupOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setTenantLookupOpen(false), 150)
                    }}
                    placeholder="사용자 이름 또는 이메일로 검색"
                    readOnly={Boolean(provisionForm.subscription_id)}
                  />
                  {tenantLookupOpen && !provisionForm.subscription_id ? (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow">
                      {tenantLookupLoading ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">검색 중...</div>
                      ) : null}
                      {!tenantLookupLoading && tenantLookupError ? (
                        <div className="px-3 py-2 text-sm text-destructive">{tenantLookupError}</div>
                      ) : null}
                      {!tenantLookupLoading && !tenantLookupError && tenantLookupQuery.trim() ? (
                        tenantLookupOptions.length ? (
                          <div className="max-h-64 overflow-auto py-1">
                            {tenantLookupOptions.map((u) => {
                              const label = `${u.full_name || "이름 없음"} (${u.email || "이메일 없음"})`
                              const detailParts = [
                                u.tenant_name ? `테넌트: ${u.tenant_name}` : null,
                                u.tenant_type ? `유형: ${u.tenant_type}` : null,
                                u.tenant_id ? `ID: ${u.tenant_id}` : "테넌트 없음",
                              ].filter(Boolean)
                              const selectable = Boolean(u.tenant_id)
                              return (
                                <button
                                  type="button"
                                  key={`${u.id}-${u.tenant_id || "no-tenant"}`}
                                  className={`w-full px-3 py-2 text-left hover:bg-accent ${
                                    selectable ? "" : "cursor-not-allowed opacity-60"
                                  }`}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    if (!selectable || !u.tenant_id) return
                                    setProvisionForm((p) => ({ ...p, tenant_id: u.tenant_id || "" }))
                                    setTenantLookupQuery(label)
                                    setTenantLookupOpen(false)
                                  }}
                                >
                                  <div className="text-sm font-medium">{label}</div>
                                  <div className="text-xs text-muted-foreground">{detailParts.join(" · ")}</div>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-sm text-muted-foreground">검색 결과가 없습니다.</div>
                        )
                      ) : !tenantLookupLoading && !tenantLookupError ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">이름 또는 이메일을 입력하세요.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {provisionForm.tenant_id ? (
                  <div className="text-xs text-muted-foreground">선택된 테넌트 ID: {provisionForm.tenant_id}</div>
                ) : null}
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">플랜</div>
                <Select value={provisionForm.plan_id} onValueChange={(v) => setProvisionForm((p) => ({ ...p, plan_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="플랜 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.tier}/{p.tenant_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">주기</div>
                <Select
                  value={provisionForm.billing_cycle}
                  onValueChange={(v) => setProvisionForm((p) => ({ ...p, billing_cycle: v as ProvisionForm["billing_cycle"] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="주기" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">monthly</SelectItem>
                    <SelectItem value="yearly">yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">결제 제공자</div>
                <Select
                  value={provisionForm.provider}
                  onValueChange={(v) => setProvisionForm((p) => ({ ...p, provider: v as ProvisionForm["provider"] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">stripe</SelectItem>
                    <SelectItem value="toss">toss</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">현재 기간 시작</div>
                <Input
                  type="datetime-local"
                  value={provisionForm.current_period_start}
                  onChange={(e) => setProvisionForm((p) => ({ ...p, current_period_start: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">현재 기간 종료</div>
                <Input
                  type="datetime-local"
                  value={provisionForm.current_period_end}
                  onChange={(e) => setProvisionForm((p) => ({ ...p, current_period_end: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">가격({provisionForm.currency || "USD"})</div>
                <Input
                  type={provisionAutoPrice !== null ? "text" : "number"}
                  min={0}
                  step="0.01"
                  value={
                    provisionAutoPrice !== null
                      ? formatMoneyDisplay(provisionAutoPrice, provisionForm.currency)
                      : provisionForm.price_usd
                  }
                  onChange={(e) => setProvisionForm((p) => ({ ...p, price_usd: e.target.value }))}
                  readOnly={provisionAutoPrice !== null}
                />
                {provisionAutoPrice !== null ? (
                  <div className="text-xs text-muted-foreground">플랜 기준으로 자동 책정됩니다.</div>
                ) : provisionPlanPrice ? (
                  <div className="text-xs text-muted-foreground">환율 정보를 찾지 못했습니다. 필요 시 입력하세요.</div>
                ) : planPricesLoading ? (
                  <div className="text-xs text-muted-foreground">플랜 가격 불러오는 중...</div>
                ) : provisionForm.plan_id ? (
                  <div className="text-xs text-muted-foreground">플랜 가격 정보를 찾지 못했습니다. 필요 시 입력하세요.</div>
                ) : (
                  <div className="text-xs text-muted-foreground">플랜을 선택하면 자동으로 설정됩니다.</div>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">통화</div>
                <Select value={provisionForm.currency} onValueChange={(v) => setProvisionForm((p) => ({ ...p, currency: v.toUpperCase() }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="통화 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fxRatesLoading ? (
                  <div className="text-xs text-muted-foreground">환율 목록 불러오는 중...</div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="provision-cancel-at-period-end"
                  checked={provisionForm.cancel_at_period_end}
                  onCheckedChange={(v) => setProvisionForm((p) => ({ ...p, cancel_at_period_end: v, auto_renew: !v }))}
                />
                <Label htmlFor="provision-cancel-at-period-end">기간 종료 시 취소</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="provision-auto-renew"
                  checked={provisionForm.auto_renew}
                  onCheckedChange={(v) => setProvisionForm((p) => ({ ...p, auto_renew: v, cancel_at_period_end: !v }))}
                />
                <Label htmlFor="provision-auto-renew">자동 갱신</Label>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">서비스 제공 메모</div>
              <Textarea
                rows={3}
                value={provisionForm.note}
                onChange={(e) => setProvisionForm((p) => ({ ...p, note: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProvisionOpen(false)} disabled={provisioning}>
              닫기
            </Button>
            <Button onClick={saveProvision} disabled={provisioning}>
              {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={provisioning ? "ml-2" : ""}>적용</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
