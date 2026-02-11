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
import { Loader2, RefreshCcw } from "lucide-react"

type AuditRow = {
  id: string
  tenant_id?: string | null
  user_id?: string | null
  service_id?: string | null
  action: string
  resource_type: string
  resource_id?: string | null
  status: "success" | "failure" | "error"
  ip_address?: string | null
  user_agent?: string | null
  request_data?: Record<string, unknown> | null
  response_data?: Record<string, unknown> | null
  error_message?: string | null
  created_at: string
  user_email?: string | null
  user_name?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  service_name?: string | null
  service_slug?: string | null
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

const API_URL = "/api/ai/system/audit-logs"
const FILTER_ALL = "__all__"
const STATUSES: AuditRow["status"][] = ["success", "failure", "error"]

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function statusBadge(status?: string | null) {
  if (status === "success") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "failure") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "error") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

function formatJson(value: unknown) {
  if (!value) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function previewText(value: unknown) {
  if (!value) return "-"
  const raw = typeof value === "string" ? value : JSON.stringify(value)
  return raw.length > 60 ? `${raw.slice(0, 60)}...` : raw
}

export default function SystemAudit() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [status, setStatus] = useState(FILTER_ALL)
  const [action, setAction] = useState("")
  const [resourceType, setResourceType] = useState("")
  const [tenantId, setTenantId] = useState("")
  const [userId, setUserId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<AuditRow | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (status !== FILTER_ALL) params.set("status", status)
    if (action.trim()) params.set("action", action.trim())
    if (resourceType.trim()) params.set("resource_type", resourceType.trim())
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (userId.trim()) params.set("user_id", userId.trim())
    if (serviceId.trim()) params.set("service_id", serviceId.trim())
    if (from) params.set("from", new Date(from).toISOString())
    if (to) params.set("to", new Date(to).toISOString())
    return params.toString()
  }, [action, from, limit, page, q, resourceType, serviceId, status, tenantId, to, userId])

  async function fetchAuditLogs() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
      const json = (await res.json()) as ListResponse<AuditRow>
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
    fetchAuditLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function openDetail(row: AuditRow) {
    setSelected(row)
    setDetailOpen(true)
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">감사 로그(Audit)</div>
        <div className="text-sm text-muted-foreground">관리자 작업 및 시스템 이벤트 로그를 조회합니다.</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="사용자/테넌트/서비스/에러" value={q} onChange={(e) => setQ(e.target.value)} />
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
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">Action</div>
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="action" />
        </div>
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">리소스</div>
          <Input value={resourceType} onChange={(e) => setResourceType(e.target.value)} placeholder="resource_type" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="w-full md:w-52 space-y-1">
          <div className="text-xs text-muted-foreground">테넌트 ID</div>
          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant_id" />
        </div>
        <div className="w-full md:w-52 space-y-1">
          <div className="text-xs text-muted-foreground">사용자 ID</div>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_id" />
        </div>
        <div className="w-full md:w-52 space-y-1">
          <div className="text-xs text-muted-foreground">서비스 ID</div>
          <Input value={serviceId} onChange={(e) => setServiceId(e.target.value)} placeholder="service_id" />
        </div>
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">From</div>
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">To</div>
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>시간</TableHead>
              <TableHead>액션</TableHead>
              <TableHead>리소스</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>사용자</TableHead>
              <TableHead>테넌트</TableHead>
              <TableHead>서비스</TableHead>
              <TableHead>에러</TableHead>
              <TableHead>상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  표시할 감사 로그가 없습니다.
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
                <TableCell className="text-sm">{fmtDate(row.created_at)}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{row.action}</div>
                  <div className="text-xs text-muted-foreground">{row.resource_type}</div>
                </TableCell>
                <TableCell className="text-sm">{row.resource_id || "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadge(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.user_email || row.user_name || row.user_id || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.user_id || "-"}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.tenant_name || row.tenant_slug || row.tenant_id || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.tenant_id || "-"}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.service_name || row.service_slug || row.service_id || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.service_id || "-"}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{previewText(row.error_message)}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => openDetail(row)}>
                    보기
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>감사 로그 상세</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">액션</div>
                <Input value={`${selected.action} (${selected.resource_type})`} readOnly />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs text-muted-foreground">리소스 ID</div>
                  <Input value={selected.resource_id || "-"} readOnly />
                </div>
                <div className="grid gap-2">
                  <div className="text-xs text-muted-foreground">상태</div>
                  <Input value={selected.status} readOnly />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs text-muted-foreground">사용자</div>
                  <Input value={selected.user_email || selected.user_name || selected.user_id || "-"} readOnly />
                </div>
                <div className="grid gap-2">
                  <div className="text-xs text-muted-foreground">테넌트</div>
                  <Input value={selected.tenant_name || selected.tenant_slug || selected.tenant_id || "-"} readOnly />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-xs text-muted-foreground">서비스</div>
                  <Input value={selected.service_name || selected.service_slug || selected.service_id || "-"} readOnly />
                </div>
                <div className="grid gap-2">
                  <div className="text-xs text-muted-foreground">IP / User-Agent</div>
                  <Input value={`${selected.ip_address || "-"} / ${selected.user_agent || "-"}`} readOnly />
                </div>
              </div>
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">요청 데이터</div>
                <Textarea value={formatJson(selected.request_data)} readOnly rows={6} />
              </div>
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">응답 데이터</div>
                <Textarea value={formatJson(selected.response_data)} readOnly rows={6} />
              </div>
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">에러 메시지</div>
                <Textarea value={selected.error_message || ""} readOnly rows={3} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
