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

type ProviderConfigRow = {
  id: string
  provider: "toss" | "stripe"
  is_active: boolean
  config?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type BillingAccountRow = {
  id: string
  tenant_id: string
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  billing_email?: string | null
  billing_name?: string | null
  country_code?: string | null
  tax_country_code?: string | null
  tax_id?: string | null
  currency: string
  default_payment_method_id?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type PaymentMethodRow = {
  id: string
  billing_account_id: string
  tenant_id?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  billing_email?: string | null
  provider: "toss" | "stripe"
  type: "card"
  provider_customer_id?: string | null
  provider_payment_method_id: string
  card_brand?: string | null
  card_last4?: string | null
  card_exp_month?: number | null
  card_exp_year?: number | null
  is_default: boolean
  status: "active" | "expired" | "deleted"
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

type ProviderForm = {
  provider: "toss" | "stripe"
  is_active: boolean
  config: string
}

type AccountForm = {
  tenant_id: string
  billing_email: string
  billing_name: string
  country_code: string
  tax_country_code: string
  tax_id: string
  currency: string
  default_payment_method_id: string
  metadata: string
}

type MethodForm = {
  billing_account_id: string
  provider: "toss" | "stripe"
  type: "card"
  provider_customer_id: string
  provider_payment_method_id: string
  card_brand: string
  card_last4: string
  card_exp_month: string
  card_exp_year: string
  is_default: boolean
  status: "active" | "expired" | "deleted"
  metadata: string
}

const PROVIDER_API = "/api/ai/billing/payment-provider-configs"
const ACCOUNTS_API = "/api/ai/billing/billing-accounts"
const METHODS_API = "/api/ai/billing/payment-methods"
const FILTER_ALL = "__all__"

const PROVIDER_EMPTY: ProviderForm = {
  provider: "toss",
  is_active: true,
  config: "",
}

const ACCOUNT_EMPTY: AccountForm = {
  tenant_id: "",
  billing_email: "",
  billing_name: "",
  country_code: "",
  tax_country_code: "",
  tax_id: "",
  currency: "USD",
  default_payment_method_id: "",
  metadata: "",
}

const METHOD_EMPTY: MethodForm = {
  billing_account_id: "",
  provider: "toss",
  type: "card",
  provider_customer_id: "",
  provider_payment_method_id: "",
  card_brand: "",
  card_last4: "",
  card_exp_month: "",
  card_exp_year: "",
  is_default: false,
  status: "active",
  metadata: "",
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatJsonPreview(value: unknown) {
  if (!value) return "-"
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value)
    return raw.length > 60 ? `${raw.slice(0, 60)}...` : raw
  } catch {
    return "-"
  }
}

function badgeClass(active: boolean) {
  return active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"
}

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function PaymentSettings() {
  const [providerRows, setProviderRows] = useState<ProviderConfigRow[]>([])
  const [providerLoading, setProviderLoading] = useState(false)
  const [providerTotal, setProviderTotal] = useState(0)
  const [providerPage, setProviderPage] = useState(0)
  const providerLimit = 50

  const [providerFilter, setProviderFilter] = useState(FILTER_ALL)
  const [providerActive, setProviderActive] = useState(FILTER_ALL)

  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [providerEditing, setProviderEditing] = useState<ProviderConfigRow | null>(null)
  const [providerForm, setProviderForm] = useState<ProviderForm>(PROVIDER_EMPTY)
  const [providerSaving, setProviderSaving] = useState(false)

  const [accountRows, setAccountRows] = useState<BillingAccountRow[]>([])
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountTotal, setAccountTotal] = useState(0)
  const [accountPage, setAccountPage] = useState(0)
  const accountLimit = 50

  const [accountQ, setAccountQ] = useState("")
  const [accountTenantId, setAccountTenantId] = useState("")
  const [accountCountry, setAccountCountry] = useState("")
  const [accountCurrency, setAccountCurrency] = useState("")

  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [accountEditing, setAccountEditing] = useState<BillingAccountRow | null>(null)
  const [accountForm, setAccountForm] = useState<AccountForm>(ACCOUNT_EMPTY)
  const [accountSaving, setAccountSaving] = useState(false)

  const [methodRows, setMethodRows] = useState<PaymentMethodRow[]>([])
  const [methodLoading, setMethodLoading] = useState(false)
  const [methodTotal, setMethodTotal] = useState(0)
  const [methodPage, setMethodPage] = useState(0)
  const methodLimit = 50

  const [methodQ, setMethodQ] = useState("")
  const [methodAccountId, setMethodAccountId] = useState("")
  const [methodProvider, setMethodProvider] = useState(FILTER_ALL)
  const [methodStatus, setMethodStatus] = useState(FILTER_ALL)
  const [methodDefault, setMethodDefault] = useState(FILTER_ALL)

  const [methodDialogOpen, setMethodDialogOpen] = useState(false)
  const [methodEditing, setMethodEditing] = useState<PaymentMethodRow | null>(null)
  const [methodForm, setMethodForm] = useState<MethodForm>(METHOD_EMPTY)
  const [methodSaving, setMethodSaving] = useState(false)

  const providerQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(providerLimit))
    params.set("offset", String(providerPage * providerLimit))
    if (providerFilter !== FILTER_ALL) params.set("provider", providerFilter)
    if (providerActive !== FILTER_ALL) params.set("is_active", providerActive)
    return params.toString()
  }, [providerActive, providerFilter, providerLimit, providerPage])

  const accountQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(accountLimit))
    params.set("offset", String(accountPage * accountLimit))
    if (accountQ.trim()) params.set("q", accountQ.trim())
    if (accountTenantId.trim()) params.set("tenant_id", accountTenantId.trim())
    if (accountCountry.trim()) params.set("country_code", accountCountry.trim().toUpperCase())
    if (accountCurrency.trim()) params.set("currency", accountCurrency.trim().toUpperCase())
    return params.toString()
  }, [accountCountry, accountCurrency, accountLimit, accountPage, accountQ, accountTenantId])

  const methodQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(methodLimit))
    params.set("offset", String(methodPage * methodLimit))
    if (methodQ.trim()) params.set("q", methodQ.trim())
    if (methodAccountId.trim()) params.set("billing_account_id", methodAccountId.trim())
    if (methodProvider !== FILTER_ALL) params.set("provider", methodProvider)
    if (methodStatus !== FILTER_ALL) params.set("status", methodStatus)
    if (methodDefault !== FILTER_ALL) params.set("is_default", methodDefault)
    return params.toString()
  }, [methodAccountId, methodDefault, methodLimit, methodPage, methodProvider, methodQ, methodStatus])

  async function fetchProviders() {
    setProviderLoading(true)
    try {
      const res = await adminFetch(`${PROVIDER_API}?${providerQuery}`)
      const json = (await res.json()) as ListResponse<ProviderConfigRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setProviderRows(json.rows || [])
      setProviderTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setProviderRows([])
      setProviderTotal(0)
    } finally {
      setProviderLoading(false)
    }
  }

  async function fetchAccounts() {
    setAccountLoading(true)
    try {
      const res = await adminFetch(`${ACCOUNTS_API}?${accountQuery}`)
      const json = (await res.json()) as ListResponse<BillingAccountRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setAccountRows(json.rows || [])
      setAccountTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setAccountRows([])
      setAccountTotal(0)
    } finally {
      setAccountLoading(false)
    }
  }

  async function fetchMethods() {
    setMethodLoading(true)
    try {
      const res = await adminFetch(`${METHODS_API}?${methodQuery}`)
      const json = (await res.json()) as ListResponse<PaymentMethodRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setMethodRows(json.rows || [])
      setMethodTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setMethodRows([])
      setMethodTotal(0)
    } finally {
      setMethodLoading(false)
    }
  }

  useEffect(() => {
    fetchProviders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerQuery])

  useEffect(() => {
    fetchAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountQuery])

  useEffect(() => {
    fetchMethods()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodQuery])

  function openProviderCreate() {
    setProviderEditing(null)
    setProviderForm(PROVIDER_EMPTY)
    setProviderDialogOpen(true)
  }

  function openProviderEdit(row: ProviderConfigRow) {
    setProviderEditing(row)
    setProviderForm({
      provider: row.provider,
      is_active: Boolean(row.is_active),
      config: row.config ? JSON.stringify(row.config, null, 2) : "",
    })
    setProviderDialogOpen(true)
  }

  async function saveProvider() {
    const configValue = parseJson(providerForm.config)
    if (configValue === null) return alert("config JSON 형식이 올바르지 않습니다.")
    try {
      setProviderSaving(true)
      const res = await adminFetch(providerEditing ? `${PROVIDER_API}/${providerEditing.id}` : PROVIDER_API, {
        method: providerEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerForm.provider,
          is_active: providerForm.is_active,
          config: configValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setProviderDialogOpen(false)
      setProviderEditing(null)
      setProviderForm(PROVIDER_EMPTY)
      await fetchProviders()
    } catch (e) {
      console.error(e)
      alert("PG 설정 저장에 실패했습니다.")
    } finally {
      setProviderSaving(false)
    }
  }

  function openAccountCreate() {
    setAccountEditing(null)
    setAccountForm(ACCOUNT_EMPTY)
    setAccountDialogOpen(true)
  }

  function openAccountEdit(row: BillingAccountRow) {
    setAccountEditing(row)
    setAccountForm({
      tenant_id: row.tenant_id || "",
      billing_email: row.billing_email || "",
      billing_name: row.billing_name || "",
      country_code: row.country_code || "",
      tax_country_code: row.tax_country_code || "",
      tax_id: row.tax_id || "",
      currency: row.currency || "USD",
      default_payment_method_id: row.default_payment_method_id || "",
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setAccountDialogOpen(true)
  }

  async function saveAccount() {
    if (!accountForm.tenant_id.trim()) return alert("테넌트 ID를 입력해주세요.")
    const metadataValue = parseJson(accountForm.metadata)
    if (metadataValue === null) return alert("metadata JSON 형식이 올바르지 않습니다.")
    if (accountForm.country_code && accountForm.country_code.trim().length !== 2) {
      return alert("국가 코드는 2자리로 입력해주세요.")
    }
    if (accountForm.tax_country_code && accountForm.tax_country_code.trim().length !== 2) {
      return alert("세금 국가 코드는 2자리로 입력해주세요.")
    }
    if (accountForm.currency && accountForm.currency.trim().length !== 3) {
      return alert("통화 코드는 3자리로 입력해주세요.")
    }

    try {
      setAccountSaving(true)
      const res = await adminFetch(accountEditing ? `${ACCOUNTS_API}/${accountEditing.id}` : ACCOUNTS_API, {
        method: accountEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: accountForm.tenant_id.trim(),
          billing_email: accountForm.billing_email.trim() || null,
          billing_name: accountForm.billing_name.trim() || null,
          country_code: accountForm.country_code.trim().toUpperCase() || null,
          tax_country_code: accountForm.tax_country_code.trim().toUpperCase() || null,
          tax_id: accountForm.tax_id.trim() || null,
          currency: accountForm.currency.trim().toUpperCase() || "USD",
          default_payment_method_id: accountForm.default_payment_method_id.trim() || null,
          metadata: metadataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setAccountDialogOpen(false)
      setAccountEditing(null)
      setAccountForm(ACCOUNT_EMPTY)
      await fetchAccounts()
    } catch (e) {
      console.error(e)
      alert("과금 계정 저장에 실패했습니다.")
    } finally {
      setAccountSaving(false)
    }
  }

  function openMethodCreate() {
    setMethodEditing(null)
    setMethodForm(METHOD_EMPTY)
    setMethodDialogOpen(true)
  }

  function openMethodEdit(row: PaymentMethodRow) {
    setMethodEditing(row)
    setMethodForm({
      billing_account_id: row.billing_account_id || "",
      provider: row.provider || "toss",
      type: row.type || "card",
      provider_customer_id: row.provider_customer_id || "",
      provider_payment_method_id: row.provider_payment_method_id || "",
      card_brand: row.card_brand || "",
      card_last4: row.card_last4 || "",
      card_exp_month: row.card_exp_month ? String(row.card_exp_month) : "",
      card_exp_year: row.card_exp_year ? String(row.card_exp_year) : "",
      is_default: Boolean(row.is_default),
      status: row.status || "active",
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setMethodDialogOpen(true)
  }

  async function saveMethod() {
    if (!methodForm.billing_account_id.trim()) return alert("과금 계정 ID를 입력해주세요.")
    if (!methodForm.provider_payment_method_id.trim()) return alert("결제 수단 ID를 입력해주세요.")
    const metadataValue = parseJson(methodForm.metadata)
    if (metadataValue === null) return alert("metadata JSON 형식이 올바르지 않습니다.")

    const expMonth = methodForm.card_exp_month.trim() ? Number(methodForm.card_exp_month) : null
    const expYear = methodForm.card_exp_year.trim() ? Number(methodForm.card_exp_year) : null
    if (expMonth !== null && (!Number.isFinite(expMonth) || expMonth < 1 || expMonth > 12)) {
      return alert("만료 월은 1~12로 입력해주세요.")
    }
    if (expYear !== null && (!Number.isFinite(expYear) || expYear < 2000)) {
      return alert("만료 년도는 2000 이상으로 입력해주세요.")
    }

    try {
      setMethodSaving(true)
      const res = await adminFetch(methodEditing ? `${METHODS_API}/${methodEditing.id}` : METHODS_API, {
        method: methodEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billing_account_id: methodForm.billing_account_id.trim(),
          provider: methodForm.provider,
          type: methodForm.type,
          provider_customer_id: methodForm.provider_customer_id.trim() || null,
          provider_payment_method_id: methodForm.provider_payment_method_id.trim(),
          card_brand: methodForm.card_brand.trim() || null,
          card_last4: methodForm.card_last4.trim() || null,
          card_exp_month: expMonth,
          card_exp_year: expYear,
          is_default: methodForm.is_default,
          status: methodForm.status,
          metadata: metadataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setMethodDialogOpen(false)
      setMethodEditing(null)
      setMethodForm(METHOD_EMPTY)
      await fetchMethods()
    } catch (e) {
      console.error(e)
      alert("결제 수단 저장에 실패했습니다.")
    } finally {
      setMethodSaving(false)
    }
  }

  const providerPageCount = Math.max(1, Math.ceil(providerTotal / providerLimit))
  const accountPageCount = Math.max(1, Math.ceil(accountTotal / accountLimit))
  const methodPageCount = Math.max(1, Math.ceil(methodTotal / methodLimit))

  return (
    <AdminPage
      headerContent={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchProviders} disabled={providerLoading}>
            {providerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">PG 새로고침</span>
          </Button>
          <Button size="sm" onClick={openProviderCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">PG 추가</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAccounts} disabled={accountLoading}>
            {accountLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">계정 새로고침</span>
          </Button>
          <Button size="sm" onClick={openAccountCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">계정 추가</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchMethods} disabled={methodLoading}>
            {methodLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">결제수단 새로고침</span>
          </Button>
          <Button size="sm" onClick={openMethodCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">결제수단 추가</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-1">
        <div className="text-xl font-semibold">결제 수단/PG 설정</div>
        <div className="text-sm text-muted-foreground">payment_provider_configs, billing_accounts, payment_methods</div>
      </div>

      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">PG 설정</TabsTrigger>
          <TabsTrigger value="accounts">과금 계정</TabsTrigger>
          <TabsTrigger value="methods">결제 수단</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="w-full md:w-48 space-y-1">
              <div className="text-xs text-muted-foreground">Provider</div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="toss">toss</SelectItem>
                  <SelectItem value="stripe">stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-40 space-y-1">
              <div className="text-xs text-muted-foreground">활성</div>
              <Select value={providerActive} onValueChange={setProviderActive}>
                <SelectTrigger>
                  <SelectValue placeholder="활성" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="true">활성</SelectItem>
                  <SelectItem value="false">비활성</SelectItem>
                </SelectContent>
              </Select>
            </div>
              <div className="flex items-center gap-2" />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>활성</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>업데이트</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerRows.length === 0 && !providerLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      표시할 PG 설정이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {providerLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {providerRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">{row.provider}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass(row.is_active)}>
                        {row.is_active ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatJsonPreview(row.config)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openProviderEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">총 {providerTotal}건</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={providerPage <= 0}
                onClick={() => setProviderPage((p) => Math.max(0, p - 1))}
              >
                이전
              </Button>
              <span className="text-muted-foreground">
                {providerPage + 1} / {providerPageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={providerPage + 1 >= providerPageCount}
                onClick={() => setProviderPage((p) => Math.min(providerPageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="테넌트/이메일/이름 검색" value={accountQ} onChange={(e) => setAccountQ(e.target.value)} />
            </div>
            <div className="w-full md:w-64 space-y-1">
              <div className="text-xs text-muted-foreground">테넌트 ID</div>
              <Input value={accountTenantId} onChange={(e) => setAccountTenantId(e.target.value)} placeholder="tenant_id" />
            </div>
            <div className="w-full md:w-24 space-y-1">
              <div className="text-xs text-muted-foreground">국가</div>
              <Input value={accountCountry} onChange={(e) => setAccountCountry(e.target.value.toUpperCase())} maxLength={2} />
            </div>
            <div className="w-full md:w-24 space-y-1">
              <div className="text-xs text-muted-foreground">통화</div>
              <Input value={accountCurrency} onChange={(e) => setAccountCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
              <div className="flex items-center gap-2" />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>테넌트</TableHead>
                  <TableHead>과금 정보</TableHead>
                  <TableHead>국가/세금</TableHead>
                  <TableHead>통화</TableHead>
                  <TableHead>기본 결제수단</TableHead>
                  <TableHead>업데이트</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountRows.length === 0 && !accountLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      표시할 과금 계정이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {accountLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {accountRows.map((row) => (
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
                      <div className="flex flex-col text-xs">
                        <span>{row.billing_name || "-"}</span>
                        <span className="text-muted-foreground">{row.billing_email || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {row.country_code || "-"} / {row.tax_country_code || "-"}
                    </TableCell>
                    <TableCell className="font-mono">{row.currency}</TableCell>
                    <TableCell className="text-xs font-mono">{row.default_payment_method_id || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openAccountEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">총 {accountTotal}건</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={accountPage <= 0}
                onClick={() => setAccountPage((p) => Math.max(0, p - 1))}
              >
                이전
              </Button>
              <span className="text-muted-foreground">
                {accountPage + 1} / {accountPageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={accountPage + 1 >= accountPageCount}
                onClick={() => setAccountPage((p) => Math.min(accountPageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="methods" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="결제수단 ID/카드/테넌트 검색" value={methodQ} onChange={(e) => setMethodQ(e.target.value)} />
            </div>
            <div className="w-full md:w-64 space-y-1">
              <div className="text-xs text-muted-foreground">과금 계정 ID</div>
              <Input value={methodAccountId} onChange={(e) => setMethodAccountId(e.target.value)} placeholder="billing_account_id" />
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">Provider</div>
              <Select value={methodProvider} onValueChange={setMethodProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="toss">toss</SelectItem>
                  <SelectItem value="stripe">stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select value={methodStatus} onValueChange={setMethodStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="expired">expired</SelectItem>
                  <SelectItem value="deleted">deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-32 space-y-1">
              <div className="text-xs text-muted-foreground">기본</div>
              <Select value={methodDefault} onValueChange={setMethodDefault}>
                <SelectTrigger>
                  <SelectValue placeholder="기본" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="true">기본</SelectItem>
                  <SelectItem value="false">기본 아님</SelectItem>
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
                  <TableHead>결제수단</TableHead>
                  <TableHead>카드</TableHead>
                  <TableHead>기본</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>업데이트</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methodRows.length === 0 && !methodLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      표시할 결제 수단이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {methodLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {methodRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.tenant_name || row.tenant_slug || row.tenant_id || "-"}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {row.billing_account_id.slice(0, 8)}... {row.billing_email ? `(${row.billing_email})` : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {row.provider}/{row.type}
                      <div className="text-muted-foreground">{row.provider_payment_method_id}</div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {row.card_brand || "-"} {row.card_last4 ? `**** ${row.card_last4}` : ""}
                      {row.card_exp_month && row.card_exp_year ? (
                        <div className="text-muted-foreground">
                          {row.card_exp_month}/{row.card_exp_year}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass(row.is_default)}>
                        {row.is_default ? "기본" : "일반"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{row.status}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openMethodEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">총 {methodTotal}건</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={methodPage <= 0}
                onClick={() => setMethodPage((p) => Math.max(0, p - 1))}
              >
                이전
              </Button>
              <span className="text-muted-foreground">
                {methodPage + 1} / {methodPageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={methodPage + 1 >= methodPageCount}
                onClick={() => setMethodPage((p) => Math.min(methodPageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{providerEditing ? "PG 설정 수정" : "PG 설정 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">Provider</div>
              <Select
                value={providerForm.provider}
                onValueChange={(v) => setProviderForm((p) => ({ ...p, provider: v as ProviderForm["provider"] }))}
                disabled={Boolean(providerEditing)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="toss">toss</SelectItem>
                  <SelectItem value="stripe">stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="provider-active"
                checked={providerForm.is_active}
                onCheckedChange={(v) => setProviderForm((p) => ({ ...p, is_active: v }))}
              />
              <Label htmlFor="provider-active">활성</Label>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Config(JSON)</div>
              <Textarea
                rows={6}
                value={providerForm.config}
                onChange={(e) => setProviderForm((p) => ({ ...p, config: e.target.value }))}
                placeholder='예: {"apiKey":"...","webhookSecret":"..."}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProviderDialogOpen(false)} disabled={providerSaving}>
              취소
            </Button>
            <Button onClick={saveProvider} disabled={providerSaving}>
              {providerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={providerSaving ? "ml-2" : ""}>{providerEditing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{accountEditing ? "과금 계정 수정" : "과금 계정 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">테넌트 ID</div>
              <Input value={accountForm.tenant_id} onChange={(e) => setAccountForm((p) => ({ ...p, tenant_id: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">통화</div>
              <Input
                value={accountForm.currency}
                onChange={(e) => setAccountForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                maxLength={3}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">과금 이메일</div>
              <Input value={accountForm.billing_email} onChange={(e) => setAccountForm((p) => ({ ...p, billing_email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">과금 담당자</div>
              <Input value={accountForm.billing_name} onChange={(e) => setAccountForm((p) => ({ ...p, billing_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">국가 코드</div>
              <Input
                value={accountForm.country_code}
                onChange={(e) => setAccountForm((p) => ({ ...p, country_code: e.target.value.toUpperCase() }))}
                maxLength={2}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">세금 국가 코드</div>
              <Input
                value={accountForm.tax_country_code}
                onChange={(e) => setAccountForm((p) => ({ ...p, tax_country_code: e.target.value.toUpperCase() }))}
                maxLength={2}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">세금 ID</div>
              <Input value={accountForm.tax_id} onChange={(e) => setAccountForm((p) => ({ ...p, tax_id: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">기본 결제수단 ID</div>
              <Input
                value={accountForm.default_payment_method_id}
                onChange={(e) => setAccountForm((p) => ({ ...p, default_payment_method_id: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">메타데이터(JSON)</div>
            <Textarea
              rows={4}
              value={accountForm.metadata}
              onChange={(e) => setAccountForm((p) => ({ ...p, metadata: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialogOpen(false)} disabled={accountSaving}>
              취소
            </Button>
            <Button onClick={saveAccount} disabled={accountSaving}>
              {accountSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={accountSaving ? "ml-2" : ""}>{accountEditing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={methodDialogOpen} onOpenChange={setMethodDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{methodEditing ? "결제 수단 수정" : "결제 수단 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">과금 계정 ID</div>
              <Input
                value={methodForm.billing_account_id}
                onChange={(e) => setMethodForm((p) => ({ ...p, billing_account_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Provider</div>
              <Select value={methodForm.provider} onValueChange={(v) => setMethodForm((p) => ({ ...p, provider: v as MethodForm["provider"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="toss">toss</SelectItem>
                  <SelectItem value="stripe">stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">타입</div>
              <Select value={methodForm.type} onValueChange={(v) => setMethodForm((p) => ({ ...p, type: v as MethodForm["type"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">상태</div>
              <Select value={methodForm.status} onValueChange={(v) => setMethodForm((p) => ({ ...p, status: v as MethodForm["status"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="expired">expired</SelectItem>
                  <SelectItem value="deleted">deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Provider Customer ID</div>
              <Input
                value={methodForm.provider_customer_id}
                onChange={(e) => setMethodForm((p) => ({ ...p, provider_customer_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">Provider Payment Method ID</div>
              <Input
                value={methodForm.provider_payment_method_id}
                onChange={(e) => setMethodForm((p) => ({ ...p, provider_payment_method_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">카드 브랜드</div>
              <Input value={methodForm.card_brand} onChange={(e) => setMethodForm((p) => ({ ...p, card_brand: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">카드 마지막 4자리</div>
              <Input value={methodForm.card_last4} onChange={(e) => setMethodForm((p) => ({ ...p, card_last4: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">만료 월</div>
              <Input value={methodForm.card_exp_month} onChange={(e) => setMethodForm((p) => ({ ...p, card_exp_month: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">만료 년도</div>
              <Input value={methodForm.card_exp_year} onChange={(e) => setMethodForm((p) => ({ ...p, card_exp_year: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="method-default"
              checked={methodForm.is_default}
              onCheckedChange={(v) => setMethodForm((p) => ({ ...p, is_default: v }))}
            />
            <Label htmlFor="method-default">기본 결제수단</Label>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">메타데이터(JSON)</div>
            <Textarea
              rows={4}
              value={methodForm.metadata}
              onChange={(e) => setMethodForm((p) => ({ ...p, metadata: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMethodDialogOpen(false)} disabled={methodSaving}>
              취소
            </Button>
            <Button onClick={saveMethod} disabled={methodSaving}>
              {methodSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={methodSaving ? "ml-2" : ""}>{methodEditing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
