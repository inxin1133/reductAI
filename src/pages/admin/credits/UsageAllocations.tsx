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
import { Loader2, RefreshCcw } from "lucide-react"

type UsageAllocationRow = {
  id: string
  usage_log_id: string
  user_id?: string | null
  account_id: string
  amount_credits: string | number
  created_at: string
  usage_created_at?: string | null
  request_id?: string | null
  usage_status?: string | null
  feature_name?: string | null
  modality?: string | null
  total_tokens?: number | null
  total_cost?: string | number | null
  currency?: string | null
  response_time_ms?: number | null
  usage_user_email?: string | null
  model_display_name?: string | null
  model_api_id?: string | null
  provider_slug?: string | null
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
  rows: UsageAllocationRow[]
}

const API_URL = "/api/ai/credits/usage-allocations"
const FILTER_ALL = "__all__"

const MODALITIES = ["text", "image_read", "image_create", "audio", "video", "music"]

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatOwner(row: UsageAllocationRow) {
  if (row.owner_type === "tenant") {
    return row.owner_tenant_name || row.owner_tenant_slug || row.owner_tenant_id || "-"
  }
  if (row.owner_type === "user") {
    return row.owner_user_name || row.owner_user_email || row.owner_user_id || "-"
  }
  return "-"
}

function statusBadge(status?: string | null) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "suspended") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "expired") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

export default function CreditUsageAllocations() {
  const [rows, setRows] = useState<UsageAllocationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [ownerType, setOwnerType] = useState(FILTER_ALL)
  const [creditType, setCreditType] = useState(FILTER_ALL)
  const [modality, setModality] = useState(FILTER_ALL)
  const [providerSlug, setProviderSlug] = useState("")
  const [modelId, setModelId] = useState("")
  const [accountId, setAccountId] = useState("")
  const [usageLogId, setUsageLogId] = useState("")
  const [tenantId, setTenantId] = useState("")
  const [userId, setUserId] = useState("")

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (ownerType !== FILTER_ALL) params.set("owner_type", ownerType)
    if (creditType !== FILTER_ALL) params.set("credit_type", creditType)
    if (modality !== FILTER_ALL) params.set("modality", modality)
    if (providerSlug.trim()) params.set("provider_slug", providerSlug.trim())
    if (modelId.trim()) params.set("model_id", modelId.trim())
    if (accountId.trim()) params.set("account_id", accountId.trim())
    if (usageLogId.trim()) params.set("usage_log_id", usageLogId.trim())
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (userId.trim()) params.set("user_id", userId.trim())
    return params.toString()
  }, [
    accountId,
    creditType,
    limit,
    modality,
    modelId,
    ownerType,
    page,
    providerSlug,
    q,
    tenantId,
    usageLogId,
    userId,
  ])

  async function fetchList() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
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
        <div className="text-xl font-semibold">크레딧 사용 분배</div>
        <div className="text-sm text-muted-foreground">
          LLM 사용 로그별 크레딧 차감 내역을 credit_usage_allocations 기준으로 조회합니다.
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input
            placeholder="테넌트/사용자/모델/요청 ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
        <div className="w-full md:w-32 space-y-1">
          <div className="text-xs text-muted-foreground">모달리티</div>
          <Select value={modality} onValueChange={setModality}>
            <SelectTrigger>
              <SelectValue placeholder="modality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              {MODALITIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-40 space-y-1">
          <div className="text-xs text-muted-foreground">Provider</div>
          <Input value={providerSlug} onChange={(e) => setProviderSlug(e.target.value)} placeholder="provider_slug" />
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
          <div className="text-xs text-muted-foreground">모델 ID</div>
          <Input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="model_id" />
        </div>
        <div className="w-full md:w-60 space-y-1">
          <div className="text-xs text-muted-foreground">계정 ID</div>
          <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="account_id" />
        </div>
        <div className="w-full md:w-60 space-y-1">
          <div className="text-xs text-muted-foreground">사용 로그 ID</div>
          <Input value={usageLogId} onChange={(e) => setUsageLogId(e.target.value)} placeholder="usage_log_id" />
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
              <TableHead>사용 로그</TableHead>
              <TableHead>모델/프로바이더</TableHead>
              <TableHead>모달리티</TableHead>
              <TableHead>할당 크레딧</TableHead>
              <TableHead>계정</TableHead>
              <TableHead>소유자</TableHead>
              <TableHead>사용자</TableHead>
              <TableHead>토큰/비용</TableHead>
              <TableHead>할당 시각</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  표시할 사용 분배 항목이 없습니다.
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
                  <div className="text-sm">{fmtDate(row.usage_created_at || row.created_at)}</div>
                  <div className="text-xs text-muted-foreground">{row.request_id || row.usage_log_id}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.model_display_name || row.model_api_id || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.provider_slug || "-"}</div>
                </TableCell>
                <TableCell className="text-sm">{row.modality || "-"}</TableCell>
                <TableCell className="text-sm">
                  {row.amount_credits}
                  <div className="text-xs text-muted-foreground">{row.credit_type || "-"}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.account_display_name || row.account_id}</div>
                  <div className="text-xs text-muted-foreground">{row.account_id}</div>
                  <Badge variant="outline" className={`mt-1 ${statusBadge(row.account_status)}`}>
                    {row.account_status || "unknown"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{formatOwner(row)}</TableCell>
                <TableCell>
                  <div className="text-sm">{row.usage_user_email || row.user_id || "-"}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.total_tokens ?? "-"}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.total_cost ?? "-"} {row.currency || ""}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{fmtDate(row.created_at)}</div>
                  <div className="text-xs text-muted-foreground">{row.response_time_ms ? `${row.response_time_ms} ms` : "-"}</div>
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
