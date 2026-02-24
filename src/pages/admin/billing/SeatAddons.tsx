import { useEffect, useMemo, useState } from "react"
import { adminFetch } from "@/lib/adminFetch"
import { fmtDate } from "@/lib/datetime"
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
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Pencil, Plus, RefreshCcw } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type SeatAddonRow = {
  id: string
  subscription_id: string
  tenant_id: string
  quantity: number | string
  status: "active" | "scheduled_cancel" | "cancelled" | string
  effective_at?: string | null
  cancel_at_period_end?: boolean | null
  cancelled_at?: string | null
  unit_price_usd?: number | string | null
  currency?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  plan_id?: string | null
  plan_name?: string | null
  plan_slug?: string | null
  plan_tier?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

type SeatAddonForm = {
  tenant_id: string
  subscription_id: string
  quantity: string
  status: "active" | "scheduled_cancel" | "cancelled"
  effective_at: string
  cancel_at_period_end: boolean
  cancelled_at: string
  unit_price_usd: string
  currency: string
  metadata: string
}

const API_URL = "/api/ai/billing/seat-addons"
const FILTER_ALL = "__all__"

const EMPTY_FORM: SeatAddonForm = {
  tenant_id: "",
  subscription_id: "",
  quantity: "1",
  status: "active",
  effective_at: "",
  cancel_at_period_end: false,
  cancelled_at: "",
  unit_price_usd: "0",
  currency: "USD",
  metadata: "",
}

function badgeClass(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "scheduled_cancel") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "cancelled") return "bg-slate-50 text-slate-600 border-slate-200"
  return "bg-slate-50 text-slate-600 border-slate-200"
}

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function BillingSeatAddons() {
  const [rows, setRows] = useState<SeatAddonRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [status, setStatus] = useState(FILTER_ALL)
  const [tenantId, setTenantId] = useState("")
  const [subscriptionId, setSubscriptionId] = useState("")
  const [planId, setPlanId] = useState("")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SeatAddonRow | null>(null)
  const [form, setForm] = useState<SeatAddonForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (status !== FILTER_ALL) params.set("status", status)
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (subscriptionId.trim()) params.set("subscription_id", subscriptionId.trim())
    if (planId.trim()) params.set("plan_id", planId.trim())
    return params.toString()
  }, [limit, page, planId, q, status, subscriptionId, tenantId])

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
      const json = (await res.json()) as ListResponse<SeatAddonRow>
      if (!res.ok || !json.ok) throw new Error("FAILED_FETCH")
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
    fetchRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(row: SeatAddonRow) {
    setEditing(row)
    setForm({
      tenant_id: row.tenant_id || "",
      subscription_id: row.subscription_id || "",
      quantity: String(row.quantity ?? 1),
      status: (row.status as SeatAddonForm["status"]) || "active",
      effective_at: row.effective_at ? String(row.effective_at) : "",
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      cancelled_at: row.cancelled_at ? String(row.cancelled_at) : "",
      unit_price_usd: row.unit_price_usd !== null && row.unit_price_usd !== undefined ? String(row.unit_price_usd) : "0",
      currency: row.currency ? String(row.currency) : "USD",
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setDialogOpen(true)
  }

  async function saveRow() {
    if (!form.subscription_id.trim()) return alert("subscription_id를 입력해주세요.")
    if (!form.tenant_id.trim()) return alert("tenant_id를 입력해주세요.")
    const quantity = Number(form.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return alert("좌석 수량을 확인해주세요.")
    const unitPrice = form.unit_price_usd.trim() ? Number(form.unit_price_usd) : 0
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return alert("좌석 단가를 확인해주세요.")
    const metadataValue = parseJson(form.metadata)
    if (metadataValue === null) return alert("메타데이터 JSON 형식이 올바르지 않습니다.")

    try {
      setSaving(true)
      const payload = {
        tenant_id: form.tenant_id.trim(),
        subscription_id: form.subscription_id.trim(),
        quantity: Math.floor(quantity),
        status: form.status,
        effective_at: form.effective_at || null,
        cancel_at_period_end: form.cancel_at_period_end,
        cancelled_at: form.cancelled_at || null,
        unit_price_usd: unitPrice,
        currency: form.currency.trim().toUpperCase(),
        metadata: metadataValue,
      }
      const res = await adminFetch(editing ? `${API_URL}/${editing.id}` : API_URL, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await fetchRows()
    } catch (e) {
      console.error(e)
      alert("좌석 추가 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">좌석 추가</span>
          </Button>
        </div>
      }
      headerTitle="좌석 추가 구매"
    >
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">billing_subscription_seat_addons 기준 관리</div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="테넌트/구독/플랜 검색" value={q} onChange={(e) => setQ(e.target.value)} />
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
              <SelectItem value="scheduled_cancel">scheduled_cancel</SelectItem>
              <SelectItem value="cancelled">cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-64 space-y-1">
          <div className="text-xs text-muted-foreground">tenant_id</div>
          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant_id" />
        </div>
        <div className="w-full md:w-64 space-y-1">
          <div className="text-xs text-muted-foreground">subscription_id</div>
          <Input value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} placeholder="subscription_id" />
        </div>
        <div className="w-full md:w-64 space-y-1">
          <div className="text-xs text-muted-foreground">plan_id</div>
          <Input value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="plan_id" />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>테넌트</TableHead>
              <TableHead>플랜</TableHead>
              <TableHead>수량</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>적용/해지</TableHead>
              <TableHead>단가</TableHead>
              <TableHead>업데이트</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.tenant_name || row.tenant_slug || row.tenant_id}</span>
                      <span className="text-xs text-muted-foreground font-mono">{row.tenant_id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.plan_name || row.plan_slug || row.plan_id}</span>
                      <span className="text-xs text-muted-foreground font-mono">{row.subscription_id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{row.quantity}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={badgeClass(row.status)}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>적용: {fmtDate(row.effective_at)}</div>
                    <div>예약해지: {row.cancel_at_period_end ? "예" : "아니오"}</div>
                    <div>해지일: {fmtDate(row.cancelled_at)}</div>
                  </TableCell>
                  <TableCell className="font-mono">
                    {row.unit_price_usd ?? 0} {row.currency || "USD"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
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
            <DialogTitle>{editing ? "좌석 추가 수정" : "좌석 추가 등록"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">tenant_id</div>
              <Input
                value={form.tenant_id}
                onChange={(e) => setForm((p) => ({ ...p, tenant_id: e.target.value }))}
                disabled={Boolean(editing)}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">subscription_id</div>
              <Input
                value={form.subscription_id}
                onChange={(e) => setForm((p) => ({ ...p, subscription_id: e.target.value }))}
                disabled={Boolean(editing)}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">좌석 수</div>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">상태</div>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as SeatAddonForm["status"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="scheduled_cancel">scheduled_cancel</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">적용 시작</div>
              <Input
                type="datetime-local"
                value={form.effective_at}
                onChange={(e) => setForm((p) => ({ ...p, effective_at: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">해지 예약</div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.cancel_at_period_end}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, cancel_at_period_end: Boolean(v) }))}
                />
                <Label className="text-sm">기간 종료 시 해지</Label>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">해지일</div>
              <Input
                type="datetime-local"
                value={form.cancelled_at}
                onChange={(e) => setForm((p) => ({ ...p, cancelled_at: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">좌석 단가(USD)</div>
              <Input
                type="number"
                min={0}
                value={form.unit_price_usd}
                onChange={(e) => setForm((p) => ({ ...p, unit_price_usd: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">통화</div>
              <Input
                value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">메타데이터(JSON)</div>
            <Textarea value={form.metadata} onChange={(e) => setForm((p) => ({ ...p, metadata: e.target.value }))} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={saveRow} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
