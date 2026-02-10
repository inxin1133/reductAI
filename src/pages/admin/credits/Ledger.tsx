import { useEffect, useMemo, useState } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCcw } from "lucide-react"

type LedgerRow = {
  id: string
  account_id: string
  entry_type: string
  amount_credits: string | number
  balance_after?: string | number | null
  usage_log_id?: string | null
  transfer_id?: string | null
  subscription_id?: string | null
  invoice_id?: string | null
  payment_transaction_id?: string | null
  expires_at?: string | null
  occurred_at: string
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown> | null
  owner_type?: string | null
  credit_type?: string | null
  account_status?: string | null
  account_display_name?: string | null
  owner_tenant_id?: string | null
  owner_user_id?: string | null
  owner_tenant_name?: string | null
  owner_tenant_slug?: string | null
  owner_user_email?: string | null
  owner_user_name?: string | null
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: LedgerRow[]
}

const API_URL = "/api/ai/credits/ledger-entries"
const FILTER_ALL = "__all__"

const ENTRY_TYPES = [
  "subscription_grant",
  "topup_purchase",
  "transfer_in",
  "transfer_out",
  "usage",
  "adjustment",
  "expiry",
  "refund",
  "reversal",
]

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function statusBadge(status?: string | null) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "suspended") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "expired") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

function formatOwner(row: LedgerRow) {
  if (row.owner_type === "tenant") {
    return row.owner_tenant_name || row.owner_tenant_slug || row.owner_tenant_id || "-"
  }
  if (row.owner_type === "user") {
    return row.owner_user_name || row.owner_user_email || row.owner_user_id || "-"
  }
  return "-"
}

export default function CreditLedger() {
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [entryType, setEntryType] = useState(FILTER_ALL)
  const [ownerType, setOwnerType] = useState(FILTER_ALL)
  const [creditType, setCreditType] = useState(FILTER_ALL)
  const [accountId, setAccountId] = useState("")
  const [tenantId, setTenantId] = useState("")
  const [userId, setUserId] = useState("")

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (entryType !== FILTER_ALL) params.set("entry_type", entryType)
    if (ownerType !== FILTER_ALL) params.set("owner_type", ownerType)
    if (creditType !== FILTER_ALL) params.set("credit_type", creditType)
    if (accountId.trim()) params.set("account_id", accountId.trim())
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (userId.trim()) params.set("user_id", userId.trim())
    return params.toString()
  }, [accountId, creditType, entryType, limit, ownerType, page, q, tenantId, userId])

  async function fetchList() {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}?${queryString}`)
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
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">크레딧 원장(ledger)</div>
        <div className="text-sm text-muted-foreground">credit_ledger_entries 기준 변경 이력을 조회합니다.</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="테넌트/사용자 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">엔트리 타입</div>
          <Select value={entryType} onValueChange={setEntryType}>
            <SelectTrigger>
              <SelectValue placeholder="entry_type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              {ENTRY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-32 space-y-1">
          <div className="text-xs text-muted-foreground">소유자</div>
          <Select value={ownerType} onValueChange={setOwnerType}>
            <SelectTrigger>
              <SelectValue placeholder="owner_type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="tenant">tenant</SelectItem>
              <SelectItem value="user">user</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-32 space-y-1">
          <div className="text-xs text-muted-foreground">크레딧 타입</div>
          <Select value={creditType} onValueChange={setCreditType}>
            <SelectTrigger>
              <SelectValue placeholder="credit_type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="subscription">subscription</SelectItem>
              <SelectItem value="topup">topup</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchList} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="w-full md:w-60 space-y-1">
          <div className="text-xs text-muted-foreground">계정 ID</div>
          <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="account_id" />
        </div>
        <div className="w-full md:w-60 space-y-1">
          <div className="text-xs text-muted-foreground">테넌트 ID</div>
          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant_id" />
        </div>
        <div className="w-full md:w-60 space-y-1">
          <div className="text-xs text-muted-foreground">사용자 ID</div>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_id" />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>소유자</TableHead>
              <TableHead>타입</TableHead>
              <TableHead>엔트리</TableHead>
              <TableHead>크레딧</TableHead>
              <TableHead>잔액</TableHead>
              <TableHead>연결</TableHead>
              <TableHead>발생</TableHead>
              <TableHead>만료</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  표시할 원장 항목이 없습니다.
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
                    <span className="font-medium">{formatOwner(row)}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.account_id.slice(0, 8)}...</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.owner_type}/{row.credit_type}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.entry_type}</TableCell>
                <TableCell className="font-mono">
                  {Number(row.amount_credits).toLocaleString()}
                </TableCell>
                <TableCell className="font-mono">
                  {row.balance_after !== null && row.balance_after !== undefined
                    ? Number(row.balance_after).toLocaleString()
                    : "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.transfer_id ? "transfer" : row.subscription_id ? "subscription" : row.usage_log_id ? "usage" : row.invoice_id ? "invoice" : row.payment_transaction_id ? "payment" : "-"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(row.occurred_at)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(row.expires_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadge(row.account_status)}>
                    {row.account_status || "-"}
                  </Badge>
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
    </div>
  )
}
