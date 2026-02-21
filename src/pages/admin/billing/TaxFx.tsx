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
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, Pencil, Plus, RefreshCcw } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type TaxRateRow = {
  id: string
  name: string
  country_code: string
  rate_percent: string | number
  source?: "manual" | "market" | string
  effective_at: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type FxRateRow = {
  id: string
  base_currency: string
  quote_currency: string
  rate: string | number
  source: "operating" | "market"
  effective_at: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type SyncStatusRow = {
  sync_key: string
  is_enabled: boolean
  last_run_at?: string | null
  last_success_at?: string | null
  last_error?: string | null
  last_source?: string | null
  last_record_count?: number | null
  created_at?: string | null
  updated_at?: string | null
}

type SyncStatusResponse = {
  ok: boolean
  row?: SyncStatusRow | null
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

type TaxForm = {
  name: string
  country_code: string
  rate_percent: string
  effective_at: string
  is_active: boolean
}

type FxForm = {
  base_currency: string
  quote_currency: string
  rate: string
  source: "operating" | "market"
  effective_at: string
  is_active: boolean
}

const TAX_API = "/api/ai/billing/tax-rates"
const FX_API = "/api/ai/billing/fx-rates"
const TAX_SYNC_API = "/api/ai/billing/tax-rates/sync"
const FX_SYNC_API = "/api/ai/billing/fx-rates/sync"
const TAX_SYNC_STATUS_API = "/api/ai/billing/tax-rates/sync-status"
const FX_SYNC_STATUS_API = "/api/ai/billing/fx-rates/sync-status"
const FILTER_ALL = "__all__"

const TAX_EMPTY: TaxForm = {
  name: "",
  country_code: "",
  rate_percent: "",
  effective_at: "",
  is_active: true,
}

const FX_EMPTY: FxForm = {
  base_currency: "USD",
  quote_currency: "KRW",
  rate: "",
  source: "operating",
  effective_at: "",
  is_active: true,
}

function fmtPercent(v: unknown) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "-"
  return `${n.toFixed(2)}%`
}

function fmtRate(v: unknown) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "-"
  return n.toFixed(6).replace(/\.?0+$/, "")
}

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

function nowLocal() {
  return toDateTimeLocal(new Date().toISOString())
}

function badgeClass(active: boolean) {
  return active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"
}

export default function TaxFx() {
  const [taxRows, setTaxRows] = useState<TaxRateRow[]>([])
  const [taxLoading, setTaxLoading] = useState(false)
  const [taxTotal, setTaxTotal] = useState(0)
  const [taxPage, setTaxPage] = useState(0)
  const taxLimit = 50

  const [taxQ, setTaxQ] = useState("")
  const [taxCountry, setTaxCountry] = useState("")
  const [taxActive, setTaxActive] = useState(FILTER_ALL)

  const [taxDialogOpen, setTaxDialogOpen] = useState(false)
  const [taxEditing, setTaxEditing] = useState<TaxRateRow | null>(null)
  const [taxForm, setTaxForm] = useState<TaxForm>(TAX_EMPTY)
  const [taxSaving, setTaxSaving] = useState(false)
  const [taxSyncStatus, setTaxSyncStatus] = useState<SyncStatusRow | null>(null)
  const [taxSyncLoading, setTaxSyncLoading] = useState(false)
  const [taxSyncing, setTaxSyncing] = useState(false)
  const [taxSyncSaving, setTaxSyncSaving] = useState(false)

  const [fxRows, setFxRows] = useState<FxRateRow[]>([])
  const [fxLoading, setFxLoading] = useState(false)
  const [fxTotal, setFxTotal] = useState(0)
  const [fxPage, setFxPage] = useState(0)
  const fxLimit = 50

  const [fxBase, setFxBase] = useState("")
  const [fxQuote, setFxQuote] = useState("")
  const [fxSource, setFxSource] = useState(FILTER_ALL)
  const [fxActive, setFxActive] = useState(FILTER_ALL)

  const [fxDialogOpen, setFxDialogOpen] = useState(false)
  const [fxEditing, setFxEditing] = useState<FxRateRow | null>(null)
  const [fxForm, setFxForm] = useState<FxForm>(FX_EMPTY)
  const [fxSaving, setFxSaving] = useState(false)
  const [fxSyncStatus, setFxSyncStatus] = useState<SyncStatusRow | null>(null)
  const [fxSyncLoading, setFxSyncLoading] = useState(false)
  const [fxSyncing, setFxSyncing] = useState(false)
  const [fxSyncSaving, setFxSyncSaving] = useState(false)

  const taxQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(taxLimit))
    params.set("offset", String(taxPage * taxLimit))
    if (taxQ.trim()) params.set("q", taxQ.trim())
    if (taxCountry.trim()) params.set("country_code", taxCountry.trim().toUpperCase())
    if (taxActive !== FILTER_ALL) params.set("is_active", taxActive)
    return params.toString()
  }, [taxActive, taxCountry, taxLimit, taxPage, taxQ])

  const fxQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(fxLimit))
    params.set("offset", String(fxPage * fxLimit))
    if (fxBase.trim()) params.set("base_currency", fxBase.trim().toUpperCase())
    if (fxQuote.trim()) params.set("quote_currency", fxQuote.trim().toUpperCase())
    if (fxSource !== FILTER_ALL) params.set("source", fxSource)
    if (fxActive !== FILTER_ALL) params.set("is_active", fxActive)
    return params.toString()
  }, [fxActive, fxBase, fxLimit, fxPage, fxQuote, fxSource])

  async function fetchTaxRates() {
    setTaxLoading(true)
    try {
      const res = await adminFetch(`${TAX_API}?${taxQuery}`)
      const json = (await res.json()) as ListResponse<TaxRateRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setTaxRows(json.rows || [])
      setTaxTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setTaxRows([])
      setTaxTotal(0)
    } finally {
      setTaxLoading(false)
    }
  }

  async function fetchFxRates() {
    setFxLoading(true)
    try {
      const res = await adminFetch(`${FX_API}?${fxQuery}`)
      const json = (await res.json()) as ListResponse<FxRateRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setFxRows(json.rows || [])
      setFxTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setFxRows([])
      setFxTotal(0)
    } finally {
      setFxLoading(false)
    }
  }

  async function fetchTaxSyncStatus() {
    setTaxSyncLoading(true)
    try {
      const res = await adminFetch(TAX_SYNC_STATUS_API)
      const json = (await res.json()) as SyncStatusResponse
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setTaxSyncStatus(json.row ?? null)
    } catch (e) {
      console.error(e)
      setTaxSyncStatus(null)
    } finally {
      setTaxSyncLoading(false)
    }
  }

  async function updateTaxSyncEnabled(nextEnabled: boolean) {
    try {
      setTaxSyncSaving(true)
      const res = await adminFetch(TAX_SYNC_STATUS_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: nextEnabled }),
      })
      const json = (await res.json()) as SyncStatusResponse
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setTaxSyncStatus(json.row ?? null)
    } catch (e) {
      console.error(e)
      alert("세율 자동 동기화 설정에 실패했습니다.")
    } finally {
      setTaxSyncSaving(false)
    }
  }

  async function runTaxSync() {
    try {
      setTaxSyncing(true)
      const res = await adminFetch(TAX_SYNC_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      })
      const json = (await res.json()) as { ok?: boolean; message?: string }
      if (!res.ok || !json?.ok) throw new Error(json?.message || "FAILED")
      await Promise.all([fetchTaxRates(), fetchTaxSyncStatus()])
    } catch (e) {
      console.error(e)
      alert("세율 동기화에 실패했습니다.")
    } finally {
      setTaxSyncing(false)
    }
  }

  async function fetchFxSyncStatus() {
    setFxSyncLoading(true)
    try {
      const res = await adminFetch(FX_SYNC_STATUS_API)
      const json = (await res.json()) as SyncStatusResponse
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setFxSyncStatus(json.row ?? null)
    } catch (e) {
      console.error(e)
      setFxSyncStatus(null)
    } finally {
      setFxSyncLoading(false)
    }
  }

  async function updateFxSyncEnabled(nextEnabled: boolean) {
    try {
      setFxSyncSaving(true)
      const res = await adminFetch(FX_SYNC_STATUS_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: nextEnabled }),
      })
      const json = (await res.json()) as SyncStatusResponse
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setFxSyncStatus(json.row ?? null)
    } catch (e) {
      console.error(e)
      alert("환율 자동 동기화 설정에 실패했습니다.")
    } finally {
      setFxSyncSaving(false)
    }
  }

  async function runFxSync() {
    try {
      setFxSyncing(true)
      const res = await adminFetch(FX_SYNC_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      })
      const json = (await res.json()) as { ok?: boolean; message?: string }
      if (!res.ok || !json?.ok) throw new Error(json?.message || "FAILED")
      await Promise.all([fetchFxRates(), fetchFxSyncStatus()])
    } catch (e) {
      console.error(e)
      alert("환율 동기화에 실패했습니다.")
    } finally {
      setFxSyncing(false)
    }
  }

  useEffect(() => {
    fetchTaxRates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxQuery])

  useEffect(() => {
    fetchFxRates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxQuery])

  useEffect(() => {
    fetchTaxSyncStatus()
    fetchFxSyncStatus()
  }, [])

  function openTaxCreate() {
    setTaxEditing(null)
    setTaxForm({ ...TAX_EMPTY, effective_at: nowLocal() })
    setTaxDialogOpen(true)
  }

  function openTaxEdit(row: TaxRateRow) {
    setTaxEditing(row)
    setTaxForm({
      name: row.name || "",
      country_code: row.country_code || "",
      rate_percent: String(row.rate_percent ?? ""),
      effective_at: toDateTimeLocal(row.effective_at),
      is_active: Boolean(row.is_active),
    })
    setTaxDialogOpen(true)
  }

  async function saveTax() {
    if (!taxForm.name.trim()) return alert("이름을 입력해주세요.")
    if (!taxForm.country_code.trim() || taxForm.country_code.trim().length !== 2) {
      return alert("국가 코드를 입력해주세요. (2자리)")
    }
    const rate = Number(taxForm.rate_percent)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return alert("세율을 0~100 범위로 입력해주세요.")
    if (!taxForm.effective_at) return alert("유효 시간을 입력해주세요.")

    try {
      setTaxSaving(true)
      const res = await adminFetch(taxEditing ? `${TAX_API}/${taxEditing.id}` : TAX_API, {
        method: taxEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: taxForm.name.trim(),
          country_code: taxForm.country_code.trim().toUpperCase(),
          rate_percent: rate,
          effective_at: new Date(taxForm.effective_at).toISOString(),
          is_active: taxForm.is_active,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setTaxDialogOpen(false)
      setTaxEditing(null)
      setTaxForm(TAX_EMPTY)
      await fetchTaxRates()
    } catch (e) {
      console.error(e)
      alert("세율 저장에 실패했습니다.")
    } finally {
      setTaxSaving(false)
    }
  }

  function openFxCreate() {
    setFxEditing(null)
    setFxForm({ ...FX_EMPTY, effective_at: nowLocal() })
    setFxDialogOpen(true)
  }

  function openFxEdit(row: FxRateRow) {
    setFxEditing(row)
    setFxForm({
      base_currency: row.base_currency || "USD",
      quote_currency: row.quote_currency || "KRW",
      rate: String(row.rate ?? ""),
      source: row.source,
      effective_at: toDateTimeLocal(row.effective_at),
      is_active: Boolean(row.is_active),
    })
    setFxDialogOpen(true)
  }

  async function saveFx() {
    const base = fxForm.base_currency.trim().toUpperCase()
    const quote = fxForm.quote_currency.trim().toUpperCase()
    if (!base || base.length !== 3) return alert("기준 통화를 입력해주세요. (3자리)")
    if (!quote || quote.length !== 3) return alert("대상 통화를 입력해주세요. (3자리)")
    const rate = Number(fxForm.rate)
    if (!Number.isFinite(rate) || rate <= 0) return alert("환율 값을 입력해주세요.")
    if (!fxForm.effective_at) return alert("유효 시간을 입력해주세요.")

    try {
      setFxSaving(true)
      const res = await adminFetch(fxEditing ? `${FX_API}/${fxEditing.id}` : FX_API, {
        method: fxEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_currency: base,
          quote_currency: quote,
          rate,
          source: fxForm.source,
          effective_at: new Date(fxForm.effective_at).toISOString(),
          is_active: fxForm.is_active,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setFxDialogOpen(false)
      setFxEditing(null)
      setFxForm(FX_EMPTY)
      await fetchFxRates()
    } catch (e) {
      console.error(e)
      alert("환율 저장에 실패했습니다.")
    } finally {
      setFxSaving(false)
    }
  }

  const taxPageCount = Math.max(1, Math.ceil(taxTotal / taxLimit))
  const fxPageCount = Math.max(1, Math.ceil(fxTotal / fxLimit))
  const taxLastSyncAt = taxSyncStatus?.last_success_at ?? taxSyncStatus?.last_run_at
  const fxLastSyncAt = fxSyncStatus?.last_success_at ?? fxSyncStatus?.last_run_at
  const taxLastSyncLabel = taxSyncLoading ? "로딩 중..." : taxLastSyncAt ? fmtDate(taxLastSyncAt) : "-"
  const fxLastSyncLabel = fxSyncLoading ? "로딩 중..." : fxLastSyncAt ? fmtDate(fxLastSyncAt) : "-"
  const taxSourceLabel = taxSyncLoading ? "로딩 중..." : taxSyncStatus?.last_source ?? "-"
  const fxSourceLabel = fxSyncLoading ? "로딩 중..." : fxSyncStatus?.last_source ?? "-"

  return (
    <AdminPage
      headerContent={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTaxRates} disabled={taxLoading}>
            {taxLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">세율 새로고침</span>
          </Button>
          <Button size="sm" onClick={openTaxCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">세율 추가</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchFxRates} disabled={fxLoading}>
            {fxLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">환율 새로고침</span>
          </Button>
          <Button size="sm" onClick={openFxCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">환율 추가</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-1">
        <div className="text-xl font-semibold">세금/환율 관리</div>
        <div className="text-sm text-muted-foreground">tax_rates, fx_rates 기준 관리 화면</div>
      </div>

      <Tabs defaultValue="tax">
        <TabsList>
          <TabsTrigger value="tax">세금(VAT)</TabsTrigger>
          <TabsTrigger value="fx">환율(FX)</TabsTrigger>
        </TabsList>

        <TabsContent value="tax" className="space-y-4">
          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">동기화 상태</div>
                <div className="text-xs text-muted-foreground">마지막 동기화: {taxLastSyncLabel}</div>
                <div className="text-xs text-muted-foreground">소스: {taxSourceLabel}</div>
                <div className="text-xs text-muted-foreground">동기화 주기: 24시간</div>
                {taxSyncStatus?.last_error ? (
                  <div className="text-xs text-red-600">실패: {taxSyncStatus.last_error}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="tax-sync-enabled"
                    checked={Boolean(taxSyncStatus?.is_enabled ?? true)}
                    disabled={taxSyncSaving || taxSyncLoading}
                    onCheckedChange={(v) => updateTaxSyncEnabled(v)}
                  />
                  <Label htmlFor="tax-sync-enabled">자동 동기화</Label>
                </div>
                <Button variant="outline" size="sm" onClick={runTaxSync} disabled={taxSyncing}>
                  {taxSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  <span className="ml-2">지금 동기화</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="이름/국가 코드 검색" value={taxQ} onChange={(e) => setTaxQ(e.target.value)} />
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">국가 코드</div>
              <Input
                value={taxCountry}
                onChange={(e) => setTaxCountry(e.target.value.toUpperCase())}
                placeholder="KR"
                maxLength={2}
              />
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">활성</div>
              <Select value={taxActive} onValueChange={setTaxActive}>
                <SelectTrigger>
                  <SelectValue placeholder="활성 상태" />
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
                  <TableHead>이름</TableHead>
                  <TableHead>국가</TableHead>
                  <TableHead>세율</TableHead>
                  <TableHead>소스</TableHead>
                  <TableHead>유효 시간</TableHead>
                  <TableHead>활성</TableHead>
                  <TableHead>업데이트</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxRows.length === 0 && !taxLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      표시할 세율이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {taxLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {taxRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-mono">{row.country_code}</TableCell>
                    <TableCell className="font-mono">{fmtPercent(row.rate_percent)}</TableCell>
                    <TableCell className="font-mono">{row.source || "manual"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.effective_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass(row.is_active)}>
                        {row.is_active ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openTaxEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">총 {taxTotal}건</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={taxPage <= 0}
                onClick={() => setTaxPage((p) => Math.max(0, p - 1))}
              >
                이전
              </Button>
              <span className="text-muted-foreground">
                {taxPage + 1} / {taxPageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={taxPage + 1 >= taxPageCount}
                onClick={() => setTaxPage((p) => Math.min(taxPageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="fx" className="space-y-4">
          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-foreground">동기화 상태</div>
                <div className="text-xs text-muted-foreground">마지막 동기화: {fxLastSyncLabel}</div>
                <div className="text-xs text-muted-foreground">소스: {fxSourceLabel}</div>
                <div className="text-xs text-muted-foreground">동기화 주기: 24시간</div>
                {fxSyncStatus?.last_error ? (
                  <div className="text-xs text-red-600">실패: {fxSyncStatus.last_error}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="fx-sync-enabled"
                    checked={Boolean(fxSyncStatus?.is_enabled ?? true)}
                    disabled={fxSyncSaving || fxSyncLoading}
                    onCheckedChange={(v) => updateFxSyncEnabled(v)}
                  />
                  <Label htmlFor="fx-sync-enabled">자동 동기화</Label>
                </div>
                <Button variant="outline" size="sm" onClick={runFxSync} disabled={fxSyncing}>
                  {fxSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  <span className="ml-2">지금 동기화</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="w-full md:w-32 space-y-1">
              <div className="text-xs text-muted-foreground">기준 통화</div>
              <Input value={fxBase} onChange={(e) => setFxBase(e.target.value.toUpperCase())} placeholder="USD" maxLength={3} />
            </div>
            <div className="w-full md:w-32 space-y-1">
              <div className="text-xs text-muted-foreground">대상 통화</div>
              <Input value={fxQuote} onChange={(e) => setFxQuote(e.target.value.toUpperCase())} placeholder="KRW" maxLength={3} />
            </div>
            <div className="w-full md:w-40 space-y-1">
              <div className="text-xs text-muted-foreground">소스</div>
              <Select value={fxSource} onValueChange={setFxSource}>
                <SelectTrigger>
                  <SelectValue placeholder="소스" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="operating">operating</SelectItem>
                  <SelectItem value="market">market</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">활성</div>
              <Select value={fxActive} onValueChange={setFxActive}>
                <SelectTrigger>
                  <SelectValue placeholder="활성 상태" />
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
                  <TableHead>통화쌍</TableHead>
                  <TableHead>환율</TableHead>
                  <TableHead>소스</TableHead>
                  <TableHead>유효 시간</TableHead>
                  <TableHead>활성</TableHead>
                  <TableHead>업데이트</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fxRows.length === 0 && !fxLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      표시할 환율이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {fxLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {fxRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">
                      {row.base_currency}/{row.quote_currency}
                    </TableCell>
                    <TableCell className="font-mono">{fmtRate(row.rate)}</TableCell>
                    <TableCell className="font-mono">{row.source}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.effective_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeClass(row.is_active)}>
                        {row.is_active ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openFxEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">총 {fxTotal}건</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={fxPage <= 0}
                onClick={() => setFxPage((p) => Math.max(0, p - 1))}
              >
                이전
              </Button>
              <span className="text-muted-foreground">
                {fxPage + 1} / {fxPageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={fxPage + 1 >= fxPageCount}
                onClick={() => setFxPage((p) => Math.min(fxPageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={taxDialogOpen} onOpenChange={setTaxDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{taxEditing ? "세율 수정" : "세율 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">이름</div>
              <Input value={taxForm.name} onChange={(e) => setTaxForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">국가 코드</div>
                <Input
                  value={taxForm.country_code}
                  onChange={(e) => setTaxForm((p) => ({ ...p, country_code: e.target.value.toUpperCase() }))}
                  maxLength={2}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">세율(%)</div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={taxForm.rate_percent}
                  onChange={(e) => setTaxForm((p) => ({ ...p, rate_percent: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">유효 시간</div>
              <Input
                type="datetime-local"
                value={taxForm.effective_at}
                onChange={(e) => setTaxForm((p) => ({ ...p, effective_at: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="tax-active"
                checked={taxForm.is_active}
                onCheckedChange={(v) => setTaxForm((p) => ({ ...p, is_active: v }))}
              />
              <Label htmlFor="tax-active">활성</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaxDialogOpen(false)} disabled={taxSaving}>
              취소
            </Button>
            <Button onClick={saveTax} disabled={taxSaving}>
              {taxSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={taxSaving ? "ml-2" : ""}>{taxEditing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fxDialogOpen} onOpenChange={setFxDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{fxEditing ? "환율 수정" : "환율 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">기준 통화</div>
                <Input
                  value={fxForm.base_currency}
                  onChange={(e) => setFxForm((p) => ({ ...p, base_currency: e.target.value.toUpperCase() }))}
                  maxLength={3}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">대상 통화</div>
                <Input
                  value={fxForm.quote_currency}
                  onChange={(e) => setFxForm((p) => ({ ...p, quote_currency: e.target.value.toUpperCase() }))}
                  maxLength={3}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">환율</div>
                <Input
                  type="number"
                  min={0}
                  step="0.000001"
                  value={fxForm.rate}
                  onChange={(e) => setFxForm((p) => ({ ...p, rate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">소스</div>
                <Select value={fxForm.source} onValueChange={(v) => setFxForm((p) => ({ ...p, source: v as FxForm["source"] }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="소스 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operating">operating</SelectItem>
                    <SelectItem value="market">market</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">유효 시간</div>
              <Input
                type="datetime-local"
                value={fxForm.effective_at}
                onChange={(e) => setFxForm((p) => ({ ...p, effective_at: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="fx-active"
                checked={fxForm.is_active}
                onCheckedChange={(v) => setFxForm((p) => ({ ...p, is_active: v }))}
              />
              <Label htmlFor="fx-active">활성</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFxDialogOpen(false)} disabled={fxSaving}>
              취소
            </Button>
            <Button onClick={saveFx} disabled={fxSaving}>
              {fxSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={fxSaving ? "ml-2" : ""}>{fxEditing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
