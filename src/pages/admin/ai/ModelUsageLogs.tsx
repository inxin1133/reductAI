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
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, RefreshCcw, Search } from "lucide-react"

type UsageStatus = "success" | "failure" | "error" | "timeout" | "rate_limited" | "partial" | "failed"

type UsageLogRow = {
  id: string
  created_at: string
  status: UsageStatus
  feature_name: string
  request_id: string | null
  provider_slug: string
  model_api_id: string
  model_display_name: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  total_cost: string
  currency: string
  response_time_ms: number | null
  error_code?: string | null
  error_message?: string | null
  user_id?: string | null
  user_email?: string | null
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: UsageLogRow[]
}

type DetailResponse = {
  ok: boolean
  row: Record<string, unknown>
}

const API_URL = "/api/ai/usage-logs"

function fmtDt(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}

function statusBadgeVariant(s: UsageStatus) {
  if (s === "success") return "default"
  if (s === "rate_limited" || s === "partial") return "secondary"
  return "destructive"
}

export default function ModelUsageLogs() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<UsageLogRow[]>([])
  const [total, setTotal] = useState(0)

  const [q, setQ] = useState("")
  const [status, setStatus] = useState<UsageStatus | "all">("all")
  const [providerSlug, setProviderSlug] = useState("")
  const [modelId, setModelId] = useState("")
  const [featureName, setFeatureName] = useState("")

  const [page, setPage] = useState(0)
  const limit = 50

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (status !== "all") params.set("status", status)
    if (providerSlug.trim()) params.set("provider_slug", providerSlug.trim())
    if (modelId.trim()) params.set("model_id", modelId.trim())
    if (featureName.trim()) params.set("feature_name", featureName.trim())
    return params.toString()
  }, [featureName, limit, modelId, page, providerSlug, q, status])

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

  async function openDetail(id: string) {
    setSelectedId(id)
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`${API_URL}/${id}`)
      const json = (await res.json()) as DetailResponse
      if (!res.ok || !json.ok) throw new Error("FAILED_DETAIL")
      setDetail(json.row)
    } catch (e) {
      console.error(e)
      setDetail({ error: "상세 조회 실패" })
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">AI 서비스 - 모델 사용 로그</div>
          <div className="text-sm text-muted-foreground">
            모델 호출 기록(토큰/지연/상태)을 조회합니다.
          </div>
        </div>
        <Button variant="outline" onClick={() => fetchList()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-2">새로고침</span>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2">
          <Input
            value={q}
            onChange={(e) => {
              setPage(0)
              setQ(e.target.value)
            }}
            placeholder="검색(request_id / model / provider / error)"
            className="w-[340px]"
          />
          <Button variant="secondary" onClick={() => fetchList()} disabled={loading}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <Select
          value={status}
          onValueChange={(v) => {
            setPage(0)
            setStatus(v as UsageStatus | "all")
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="상태(전체)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">상태(전체)</SelectItem>
            <SelectItem value="success">success</SelectItem>
            <SelectItem value="partial">partial</SelectItem>
            <SelectItem value="failed">failed</SelectItem>
            <SelectItem value="failure">failure</SelectItem>
            <SelectItem value="error">error</SelectItem>
            <SelectItem value="timeout">timeout</SelectItem>
            <SelectItem value="rate_limited">rate_limited</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={providerSlug}
          onChange={(e) => {
            setPage(0)
            setProviderSlug(e.target.value)
          }}
          placeholder="provider_slug (ex: openai)"
          className="w-[220px]"
        />
        <Input
          value={modelId}
          onChange={(e) => {
            setPage(0)
            setModelId(e.target.value)
          }}
          placeholder="model_id (ex: gpt-4.1-mini)"
          className="w-[260px]"
        />
        <Input
          value={featureName}
          onChange={(e) => {
            setPage(0)
            setFeatureName(e.target.value)
          }}
          placeholder="feature_name (ex: chat)"
          className="w-[200px]"
        />
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">시간</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>기능</TableHead>
              <TableHead className="min-w-[120px]">Provider</TableHead>
              <TableHead className="min-w-[260px]">Model</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead className="min-w-[220px]">Request ID</TableHead>
              <TableHead className="min-w-[160px]">User</TableHead>
              <TableHead className="text-right">상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  로그가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtDt(r.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(r.status) as any}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.feature_name}</TableCell>
                  <TableCell className="font-mono">{r.provider_slug}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{r.model_display_name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.model_api_id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.input_tokens}/{r.output_tokens}/{r.total_tokens}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.total_cost} {r.currency}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {typeof r.response_time_ms === "number" ? `${r.response_time_ms}ms` : "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.request_id || "-"}</TableCell>
                  <TableCell className="text-xs">
                    {r.user_email ? <span>{r.user_email}</span> : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openDetail(r.id)}>
                      보기
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          총 {total.toLocaleString()}건 · 페이지 {page + 1}/{pageCount}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            이전
          </Button>
          <Button
            variant="outline"
            disabled={(page + 1) * limit >= total || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>사용 로그 상세</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
              로딩 중...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground font-mono">id: {selectedId}</div>
              <div className="border rounded-md p-3 bg-muted/30 overflow-auto max-h-[60vh]">
                <pre className="text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(detail, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}


