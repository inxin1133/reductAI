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
  billing_cycle: "monthly" | "yearly"
  price_usd?: string | number | null
  currency: string
  version: number
  effective_at: string
  status: "active" | "draft" | "retired"
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  plan_slug?: string
  plan_name?: string
  plan_tier?: string
  plan_tenant_type?: string
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: PlanPriceRow[]
}

type PlanListResponse = {
  ok: boolean
  rows: PlanOption[]
}

type FormState = {
  plan_id: string
  billing_cycle: "monthly" | "yearly"
  price_usd: string
  currency: string
  version: string
  effective_at: string
  status: "active" | "draft" | "retired"
  metadata: string
}

const PLAN_PRICES_API = "/api/ai/billing/plan-prices"
const PLANS_API = "/api/ai/billing/plans"
const FILTER_ALL = "__all__"

const EMPTY_FORM: FormState = {
  plan_id: "",
  billing_cycle: "monthly",
  price_usd: "",
  currency: "USD",
  version: "1",
  effective_at: "",
  status: "draft",
  metadata: "",
}

function fmtMoney(v: unknown, currency?: string) {
  if (v === null || v === undefined || v === "") return "-"
  const n = Number(v)
  if (!Number.isFinite(n)) return "-"
  return `${currency || "USD"} ${n.toFixed(2)}`
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

function statusBadgeClass(status: PlanPriceRow["status"]) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "retired") return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

export default function PlanPrices() {
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [rows, setRows] = useState<PlanPriceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [planId, setPlanId] = useState(FILTER_ALL)
  const [billingCycle, setBillingCycle] = useState(FILTER_ALL)
  const [status, setStatus] = useState(FILTER_ALL)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlanPriceRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (planId !== FILTER_ALL) params.set("plan_id", planId)
    if (billingCycle !== FILTER_ALL) params.set("billing_cycle", billingCycle)
    if (status !== FILTER_ALL) params.set("status", status)
    return params.toString()
  }, [billingCycle, limit, page, planId, q, status])

  async function fetchPlans() {
    try {
      const res = await adminFetch(`${PLANS_API}?limit=200&offset=0`)
      const json = (await res.json()) as PlanListResponse | any
      if (res.ok && json?.ok && Array.isArray(json.rows)) {
        setPlans(json.rows)
      } else if (Array.isArray(json)) {
        setPlans(json)
      } else if (Array.isArray(json?.rows)) {
        setPlans(json.rows)
      } else {
        setPlans([])
      }
    } catch (e) {
      console.error(e)
      setPlans([])
    }
  }

  async function fetchList() {
    setLoading(true)
    try {
      const res = await adminFetch(`${PLAN_PRICES_API}?${queryString}`)
      const json = (await res.json()) as ListResponse
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

  useEffect(() => {
    fetchPlans()
  }, [])

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function openCreate() {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      effective_at: nowLocal(),
    })
    setDialogOpen(true)
  }

  function openEdit(row: PlanPriceRow) {
    setEditing(row)
    setForm({
      plan_id: row.plan_id || "",
      billing_cycle: row.billing_cycle,
      price_usd: row.price_usd === null || row.price_usd === undefined ? "" : String(row.price_usd),
      currency: row.currency || "USD",
      version: String(row.version ?? 1),
      effective_at: toDateTimeLocal(row.effective_at),
      status: row.status,
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setDialogOpen(true)
  }

  function parseMetadata(value: string) {
    if (!value.trim()) return {}
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  function buildPayload() {
    const metadata = parseMetadata(form.metadata)
    if (metadata === null) return { error: "메타데이터 JSON 형식이 올바르지 않습니다." }
    if (!form.plan_id) return { error: "요금제를 선택해주세요." }
    if (!form.version.trim()) return { error: "버전을 입력해주세요." }
    const version = Number(form.version)
    if (!Number.isFinite(version) || version <= 0) return { error: "버전 값이 올바르지 않습니다." }
    if (!form.effective_at) return { error: "유효 시간을 입력해주세요." }

    const priceUsd = form.price_usd.trim() ? Number(form.price_usd) : null
    if (priceUsd !== null && (!Number.isFinite(priceUsd) || priceUsd < 0)) {
      return { error: "가격 값을 확인해주세요." }
    }

    const currency = form.currency.trim() || "USD"
    if (currency.length !== 3) return { error: "통화 코드를 확인해주세요." }

    return {
      payload: {
        plan_id: form.plan_id,
        billing_cycle: form.billing_cycle,
        price_usd: priceUsd,
        currency: currency.toUpperCase(),
        version: Math.floor(version),
        effective_at: new Date(form.effective_at).toISOString(),
        status: form.status,
        metadata,
      },
    }
  }

  async function savePrice() {
    const result = buildPayload()
    if ("error" in result) {
      alert(result.error)
      return
    }

    try {
      setSaving(true)
      const res = await adminFetch(editing ? `${PLAN_PRICES_API}/${editing.id}` : PLAN_PRICES_API, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await fetchList()
    } catch (e) {
      console.error(e)
      alert("플랜 가격 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchList} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">새 가격</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-1">
        <div className="text-xl font-semibold">플랜 가격/버전</div>
        <div className="text-sm text-muted-foreground">billing_plan_prices 기준 가격 버전을 관리합니다.</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="요금제 slug/이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-56 space-y-1">
          <div className="text-xs text-muted-foreground">요금제</div>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="요금제 선택" />
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
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">결제 주기</div>
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
        <div className="w-full md:w-36 space-y-1">
          <div className="text-xs text-muted-foreground">상태</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="draft">draft</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="retired">retired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2" />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>요금제</TableHead>
              <TableHead>주기</TableHead>
              <TableHead>버전</TableHead>
              <TableHead>가격</TableHead>
              <TableHead>유효 시간</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>업데이트</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  표시할 가격 버전이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.plan_name || row.plan_slug || row.plan_id}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {row.plan_slug} {row.plan_tier ? `(${row.plan_tier}/${row.plan_tenant_type || "-"})` : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-mono">{row.billing_cycle}</TableCell>
                <TableCell className="font-mono">v{row.version}</TableCell>
                <TableCell className="font-mono">{fmtMoney(row.price_usd, row.currency)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(row.effective_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadgeClass(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "플랜 가격 수정" : "플랜 가격 생성"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">요금제</div>
              <Select
                value={form.plan_id || ""}
                onValueChange={(v) => setForm((p) => ({ ...p, plan_id: v }))}
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="요금제 선택" />
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
              <div className="text-sm font-medium">결제 주기</div>
              <Select
                value={form.billing_cycle}
                onValueChange={(v) => setForm((p) => ({ ...p, billing_cycle: v as FormState["billing_cycle"] }))}
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="주기 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">monthly</SelectItem>
                  <SelectItem value="yearly">yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">버전</div>
              <Input
                type="number"
                min={1}
                value={form.version}
                onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))}
                disabled={Boolean(editing)}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">상태</div>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as FormState["status"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="retired">retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">가격(USD)</div>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.price_usd}
                onChange={(e) => setForm((p) => ({ ...p, price_usd: e.target.value }))}
                placeholder="무료면 비워두기 또는 0"
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">통화</div>
              <Input
                value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                placeholder="USD"
                maxLength={3}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">유효 시간</div>
            <Input
              type="datetime-local"
              value={form.effective_at}
              onChange={(e) => setForm((p) => ({ ...p, effective_at: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">메타데이터(JSON)</div>
            <Textarea
              rows={4}
              value={form.metadata}
              onChange={(e) => setForm((p) => ({ ...p, metadata: e.target.value }))}
              placeholder='예: {"discount": {"coupon": "NEWYEAR"}}'
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={savePrice} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={saving ? "ml-2" : ""}>{editing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
