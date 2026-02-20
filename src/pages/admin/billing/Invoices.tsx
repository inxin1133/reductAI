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
import { Loader2, Pencil, RefreshCcw } from "lucide-react"

type InvoiceRow = {
  id: string
  tenant_id: string
  subscription_id?: string | null
  billing_account_id: string
  invoice_number: string
  status: "draft" | "open" | "paid" | "void" | "uncollectible"
  currency: string
  subtotal_usd: string | number
  tax_usd: string | number
  discount_usd: string | number
  total_usd: string | number
  local_currency?: string | null
  local_total?: string | number | null
  period_start: string
  period_end: string
  issue_date?: string | null
  due_date?: string | null
  paid_at?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  plan_name?: string | null
  plan_slug?: string | null
  plan_tier?: string | null
  subscription_status?: string | null
  subscription_billing_cycle?: string | null
}

type LineItemRow = {
  id: string
  invoice_id: string
  line_type: "subscription" | "seat_overage" | "topup" | "adjustment" | "refund"
  description: string
  quantity: string | number
  unit_price_usd: string | number
  amount_usd: string | number
  currency: string
  metadata?: Record<string, unknown> | null
  created_at: string
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

type EditForm = {
  status: InvoiceRow["status"]
  issue_date: string
  due_date: string
  paid_at: string
  metadata: string
}

const INVOICES_API = "/api/ai/billing/invoices"
const LINE_ITEMS_API = "/api/ai/billing/invoice-line-items"
const FILTER_ALL = "__all__"

function fmtMoney(v: unknown, currency?: string) {
  const n = Number(v ?? 0)
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

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function statusBadge(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "open") return "bg-blue-50 text-blue-700 border-blue-200"
  if (status === "void" || status === "uncollectible") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

function lineTypeLabel(item: LineItemRow) {
  if (item.metadata?.source === "service_provision") return "서비스 제공"
  return item.line_type
}

export default function BillingInvoices() {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [status, setStatus] = useState(FILTER_ALL)
  const [tenantId, setTenantId] = useState("")
  const [subscriptionId, setSubscriptionId] = useState("")
  const [billingAccountId, setBillingAccountId] = useState("")

  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<InvoiceRow | null>(null)
  const [lineItems, setLineItems] = useState<LineItemRow[]>([])
  const [lineLoading, setLineLoading] = useState(false)
  const [lineTotal, setLineTotal] = useState(0)

  const [form, setForm] = useState<EditForm>({
    status: "draft",
    issue_date: "",
    due_date: "",
    paid_at: "",
    metadata: "",
  })
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (status !== FILTER_ALL) params.set("status", status)
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (subscriptionId.trim()) params.set("subscription_id", subscriptionId.trim())
    if (billingAccountId.trim()) params.set("billing_account_id", billingAccountId.trim())
    return params.toString()
  }, [billingAccountId, limit, page, q, status, subscriptionId, tenantId])

  async function fetchInvoices() {
    setLoading(true)
    try {
      const res = await adminFetch(`${INVOICES_API}?${queryString}`)
      const json = (await res.json()) as ListResponse<InvoiceRow>
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

  async function fetchLineItems(invoiceId: string) {
    setLineLoading(true)
    try {
      const res = await adminFetch(`${LINE_ITEMS_API}?invoice_id=${encodeURIComponent(invoiceId)}`)
      const json = (await res.json()) as ListResponse<LineItemRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setLineItems(json.rows || [])
      setLineTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setLineItems([])
      setLineTotal(0)
    } finally {
      setLineLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function openDetail(row: InvoiceRow) {
    setSelected(row)
    setForm({
      status: row.status,
      issue_date: toDateTimeLocal(row.issue_date || null),
      due_date: toDateTimeLocal(row.due_date || null),
      paid_at: toDateTimeLocal(row.paid_at || null),
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setDetailOpen(true)
    fetchLineItems(row.id)
  }

  async function saveInvoice() {
    if (!selected) return
    const metadataValue = parseJson(form.metadata)
    if (metadataValue === null) return alert("메타데이터 JSON 형식이 올바르지 않습니다.")

    try {
      setSaving(true)
      const res = await adminFetch(`${INVOICES_API}/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          issue_date: form.issue_date ? new Date(form.issue_date).toISOString() : null,
          due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
          paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : null,
          metadata: metadataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setDetailOpen(false)
      setSelected(null)
      await fetchInvoices()
    } catch (e) {
      console.error(e)
      alert("청구서 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">청구서(Invoices)</div>
        <div className="text-sm text-muted-foreground">billing_invoices, invoice_line_items</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="청구서 번호/테넌트/플랜 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">상태</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="상태 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="draft">draft</SelectItem>
              <SelectItem value="open">open</SelectItem>
              <SelectItem value="paid">paid</SelectItem>
              <SelectItem value="void">void</SelectItem>
              <SelectItem value="uncollectible">uncollectible</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-56 space-y-1">
          <div className="text-xs text-muted-foreground">테넌트 ID</div>
          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant_id" />
        </div>
        <div className="w-full md:w-56 space-y-1">
          <div className="text-xs text-muted-foreground">구독 ID</div>
          <Input value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} placeholder="subscription_id" />
        </div>
        <div className="w-full md:w-56 space-y-1">
          <div className="text-xs text-muted-foreground">과금 계정 ID</div>
          <Input value={billingAccountId} onChange={(e) => setBillingAccountId(e.target.value)} placeholder="billing_account_id" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchInvoices} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>청구서</TableHead>
              <TableHead>테넌트</TableHead>
              <TableHead>플랜</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>청구 기간</TableHead>
              <TableHead>금액(USD)</TableHead>
              <TableHead>현지 통화</TableHead>
              <TableHead>발행</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  표시할 청구서가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.invoice_number}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.id.slice(0, 8)}...</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.tenant_name || row.tenant_slug || row.tenant_id}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.tenant_slug || ""}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.plan_name || row.plan_slug || "-"}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.plan_tier || "-"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadge(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fmtDate(row.period_start)} ~ {fmtDate(row.period_end)}
                </TableCell>
                <TableCell className="font-mono">{fmtMoney(row.total_usd, row.currency)}</TableCell>
                <TableCell className="font-mono">
                  {row.local_total ? fmtMoney(row.local_total, row.local_currency || "KRW") : "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(row.issue_date)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openDetail(row)}>
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>청구서 상세</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {selected.invoice_number} · {selected.tenant_name || selected.tenant_slug || selected.tenant_id}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">상태</div>
                  <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as EditForm["status"] }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="상태" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">draft</SelectItem>
                      <SelectItem value="open">open</SelectItem>
                      <SelectItem value="paid">paid</SelectItem>
                      <SelectItem value="void">void</SelectItem>
                      <SelectItem value="uncollectible">uncollectible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">발행일</div>
                  <Input
                    type="datetime-local"
                    value={form.issue_date}
                    onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">결제 기한</div>
                  <Input
                    type="datetime-local"
                    value={form.due_date}
                    onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">결제 완료</div>
                  <Input
                    type="datetime-local"
                    value={form.paid_at}
                    onChange={(e) => setForm((p) => ({ ...p, paid_at: e.target.value }))}
                  />
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

              <div className="space-y-2">
                <div className="text-sm font-medium">청구 항목 ({lineTotal})</div>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>유형</TableHead>
                        <TableHead>설명</TableHead>
                        <TableHead>수량</TableHead>
                        <TableHead>단가</TableHead>
                        <TableHead>금액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.length === 0 && !lineLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            항목이 없습니다.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {lineLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                            로딩 중...
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {lineItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs">{lineTypeLabel(item)}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="font-mono text-xs">{Number(item.quantity).toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{fmtMoney(item.unit_price_usd, item.currency)}</TableCell>
                          <TableCell className="font-mono text-xs">{fmtMoney(item.amount_usd, item.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)} disabled={saving}>
              닫기
            </Button>
            <Button onClick={saveInvoice} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={saving ? "ml-2" : ""}>저장</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
