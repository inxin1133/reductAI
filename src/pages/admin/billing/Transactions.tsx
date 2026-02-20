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
import { AdminPage } from "@/components/layout/AdminPage"

type TransactionRow = {
  id: string
  invoice_id?: string | null
  billing_account_id: string
  payment_method_id?: string | null
  provider: "toss" | "stripe"
  transaction_type: "charge" | "refund" | "adjustment"
  status: "pending" | "succeeded" | "failed" | "refunded" | "cancelled"
  amount_usd: string | number
  currency: string
  amount_local?: string | number | null
  local_currency?: string | null
  provider_transaction_id?: string | null
  related_transaction_id?: string | null
  failure_reason?: string | null
  processed_at?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  invoice_number?: string | null
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

type EditForm = {
  status: TransactionRow["status"]
  transaction_type: TransactionRow["transaction_type"]
  processed_at: string
  failure_reason: string
  metadata: string
}

const API_URL = "/api/ai/billing/transactions"
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
  if (status === "succeeded") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "failed") return "bg-rose-50 text-rose-700 border-rose-200"
  if (status === "refunded") return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

function transactionLabel(row: TransactionRow) {
  if (row.metadata?.source === "service_provision") return "서비스 제공"
  return `${row.provider}/${row.transaction_type}`
}

export default function BillingTransactions() {
  const [rows, setRows] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [status, setStatus] = useState(FILTER_ALL)
  const [provider, setProvider] = useState(FILTER_ALL)
  const [transactionType, setTransactionType] = useState(FILTER_ALL)
  const [tenantId, setTenantId] = useState("")
  const [invoiceId, setInvoiceId] = useState("")
  const [billingAccountId, setBillingAccountId] = useState("")
  const [paymentMethodId, setPaymentMethodId] = useState("")

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [form, setForm] = useState<EditForm>({
    status: "pending",
    transaction_type: "charge",
    processed_at: "",
    failure_reason: "",
    metadata: "",
  })
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (status !== FILTER_ALL) params.set("status", status)
    if (provider !== FILTER_ALL) params.set("provider", provider)
    if (transactionType !== FILTER_ALL) params.set("transaction_type", transactionType)
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (invoiceId.trim()) params.set("invoice_id", invoiceId.trim())
    if (billingAccountId.trim()) params.set("billing_account_id", billingAccountId.trim())
    if (paymentMethodId.trim()) params.set("payment_method_id", paymentMethodId.trim())
    return params.toString()
  }, [billingAccountId, invoiceId, limit, page, paymentMethodId, provider, q, status, tenantId, transactionType])

  async function fetchTransactions() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
      const json = (await res.json()) as ListResponse<TransactionRow>
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
    fetchTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function openEdit(row: TransactionRow) {
    setEditing(row)
    setForm({
      status: row.status,
      transaction_type: row.transaction_type,
      processed_at: toDateTimeLocal(row.processed_at || null),
      failure_reason: row.failure_reason || "",
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editing) return
    const metadataValue = parseJson(form.metadata)
    if (metadataValue === null) return alert("메타데이터 JSON 형식이 올바르지 않습니다.")

    try {
      setSaving(true)
      const res = await adminFetch(`${API_URL}/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          transaction_type: form.transaction_type,
          processed_at: form.processed_at ? new Date(form.processed_at).toISOString() : null,
          failure_reason: form.failure_reason.trim() || null,
          metadata: metadataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setEditOpen(false)
      setEditing(null)
      await fetchTransactions()
    } catch (e) {
      console.error(e)
      alert("결제 내역 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <Button variant="outline" size="sm" onClick={fetchTransactions} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-2">새로고침</span>
        </Button>
      }
    >
      <div className="space-y-1">
        <div className="text-xl font-semibold">결제 내역(Transactions)</div>
        <div className="text-sm text-muted-foreground">payment_transactions 기준 거래 내역을 확인합니다.</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="거래 ID/테넌트/청구서 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-36 space-y-1">
          <div className="text-xs text-muted-foreground">상태</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="pending">pending</SelectItem>
              <SelectItem value="succeeded">succeeded</SelectItem>
              <SelectItem value="failed">failed</SelectItem>
              <SelectItem value="refunded">refunded</SelectItem>
              <SelectItem value="cancelled">cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-36 space-y-1">
          <div className="text-xs text-muted-foreground">Provider</div>
          <Select value={provider} onValueChange={setProvider}>
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
          <div className="text-xs text-muted-foreground">거래 유형</div>
          <Select value={transactionType} onValueChange={setTransactionType}>
            <SelectTrigger>
              <SelectValue placeholder="유형" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="charge">charge</SelectItem>
              <SelectItem value="refund">refund</SelectItem>
              <SelectItem value="adjustment">adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-48 space-y-1">
          <div className="text-xs text-muted-foreground">테넌트 ID</div>
          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant_id" />
        </div>
        <div className="flex items-center gap-2" />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="w-full md:w-60 space-y-1">
          <div className="text-xs text-muted-foreground">청구서 ID</div>
          <Input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="invoice_id" />
        </div>
        <div className="w-full md:w-60 space-y-1">
          <div className="text-xs text-muted-foreground">과금 계정 ID</div>
          <Input value={billingAccountId} onChange={(e) => setBillingAccountId(e.target.value)} placeholder="billing_account_id" />
        </div>
        <div className="w-full md:w-60 space-y-1">
          <div className="text-xs text-muted-foreground">결제 수단 ID</div>
          <Input value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} placeholder="payment_method_id" />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>거래</TableHead>
              <TableHead>테넌트</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>금액</TableHead>
              <TableHead>현지 통화</TableHead>
              <TableHead>처리 시간</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  표시할 결제 내역이 없습니다.
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
                    <span className="font-medium">{row.provider_transaction_id || row.id.slice(0, 8)}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.invoice_number || "-"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.tenant_name || row.tenant_slug || "-"}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.tenant_slug || ""}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono">{transactionLabel(row)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadge(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono">{fmtMoney(row.amount_usd, row.currency)}</TableCell>
                <TableCell className="font-mono">
                  {row.amount_local ? fmtMoney(row.amount_local, row.local_currency || "KRW") : "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(row.processed_at)}</TableCell>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>결제 내역 수정</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {editing.provider} · {editing.transaction_type} · {editing.provider_transaction_id || editing.id}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">상태</div>
                  <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as EditForm["status"] }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="상태" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">pending</SelectItem>
                      <SelectItem value="succeeded">succeeded</SelectItem>
                      <SelectItem value="failed">failed</SelectItem>
                      <SelectItem value="refunded">refunded</SelectItem>
                      <SelectItem value="cancelled">cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">거래 유형</div>
                  <Select
                    value={form.transaction_type}
                    onValueChange={(v) => setForm((p) => ({ ...p, transaction_type: v as EditForm["transaction_type"] }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="유형" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="charge">charge</SelectItem>
                      <SelectItem value="refund">refund</SelectItem>
                      <SelectItem value="adjustment">adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">처리 시간</div>
                  <Input
                    type="datetime-local"
                    value={form.processed_at}
                    onChange={(e) => setForm((p) => ({ ...p, processed_at: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">실패 사유</div>
                <Input value={form.failure_reason} onChange={(e) => setForm((p) => ({ ...p, failure_reason: e.target.value }))} />
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
    </AdminPage>
  )
}
