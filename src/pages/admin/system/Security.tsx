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
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCcw, Trash2 } from "lucide-react"

type SessionRow = {
  id: string
  user_id: string
  tenant_id?: string | null
  token_hash: string
  ip_address?: string | null
  user_agent?: string | null
  expires_at: string
  last_activity_at?: string | null
  created_at: string
  user_email?: string | null
  user_name?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  status: "active" | "expired"
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

const API_URL = "/api/ai/system/sessions"
const FILTER_ALL = "__all__"
const STATUSES: SessionRow["status"][] = ["active", "expired"]

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function maskHash(value?: string | null) {
  if (!value) return "-"
  if (value.length <= 14) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function statusBadge(status?: string | null) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "expired") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

export default function SystemSecurity() {
  const [rows, setRows] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [status, setStatus] = useState(FILTER_ALL)
  const [tenantId, setTenantId] = useState("")
  const [userId, setUserId] = useState("")
  const [ip, setIp] = useState("")

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (status !== FILTER_ALL) params.set("status", status)
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (userId.trim()) params.set("user_id", userId.trim())
    if (ip.trim()) params.set("ip", ip.trim())
    return params.toString()
  }, [ip, limit, page, q, status, tenantId, userId])

  async function fetchSessions() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
      const json = (await res.json()) as ListResponse<SessionRow>
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

  async function revokeSession(row: SessionRow) {
    const label = row.user_email || row.user_id
    if (!confirm(`"${label}" 세션을 종료할까요?`)) return
    try {
      const res = await adminFetch(`${API_URL}/${row.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        return alert(json.message || "세션 종료에 실패했습니다.")
      }
      await fetchSessions()
    } catch (e) {
      console.error(e)
      alert("세션 종료 중 오류가 발생했습니다.")
    }
  }

  useEffect(() => {
    fetchSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">보안 정책</div>
        <div className="text-sm text-muted-foreground">
          사용자 세션을 조회하고 강제 로그아웃(세션 종료)할 수 있습니다.
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="사용자/테넌트/토큰/IP" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-32 space-y-1">
          <div className="text-xs text-muted-foreground">상태</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              {STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-52 space-y-1">
          <div className="text-xs text-muted-foreground">테넌트 ID</div>
          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant_id" />
        </div>
        <div className="w-full md:w-52 space-y-1">
          <div className="text-xs text-muted-foreground">사용자 ID</div>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_id" />
        </div>
        <div className="w-full md:w-40 space-y-1">
          <div className="text-xs text-muted-foreground">IP</div>
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="ip" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>세션</TableHead>
              <TableHead>사용자</TableHead>
              <TableHead>테넌트</TableHead>
              <TableHead>IP / User-Agent</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>마지막 활동</TableHead>
              <TableHead>만료</TableHead>
              <TableHead>액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  표시할 세션이 없습니다.
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
                  <div className="text-sm">{fmtDate(row.created_at)}</div>
                  <div className="text-xs text-muted-foreground">{maskHash(row.token_hash)}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.user_email || row.user_name || row.user_id}</div>
                  <div className="text-xs text-muted-foreground">{row.user_id}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.tenant_name || row.tenant_slug || row.tenant_id || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.tenant_id || "-"}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{row.ip_address || "-"}</div>
                  <div className="max-w-[220px] truncate">{row.user_agent || "-"}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadge(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{fmtDate(row.last_activity_at || null)}</TableCell>
                <TableCell className="text-sm">{fmtDate(row.expires_at)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => revokeSession(row)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          총 {total}건 / {page + 1} of {pageCount}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
            이전
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      </div>
    </div>
  )
}
