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
import { Loader2, RefreshCcw } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type PriceRow = {
  provider_slug: string
  model_key: string
  model_name: string
  modality: string
  tier_unit?: string | null
  tier_min?: number | null
  tier_max?: number | null
  input_cost_per_1k?: string | number | null
  output_cost_per_1k?: string | number | null
  avg_cost_per_1k?: string | number | null
  margin_percent?: string | number | null
  avg_cost_per_1k_with_margin?: string | number | null
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: PriceRow[]
}

const API_URL = "/api/ai/pricing/public-prices"

function toNumber(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

function fmtMoney(v: unknown) {
  const n = toNumber(v)
  const fixed = n.toFixed(6)
  return fixed.replace(/\.?0+$/, "")
}

function fmtPercent(v: unknown) {
  const n = toNumber(v)
  const fixed = n.toFixed(2)
  return fixed.replace(/\.?0+$/, "")
}

function formatTier(row: PriceRow) {
  if (!row.tier_unit) return "-"
  const min = row.tier_min
  const max = row.tier_max
  if (typeof min === "number" && typeof max === "number") return `${row.tier_unit} ${min}-${max}`
  if (typeof min === "number") return `${row.tier_unit} ≥${min}`
  if (typeof max === "number") return `${row.tier_unit} ≤${max}`
  return row.tier_unit
}

export default function PublicPrices() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PriceRow[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState("")
  const [providerSlug, setProviderSlug] = useState("")
  const [modality, setModality] = useState<"all" | "text" | "code" | "image" | "audio" | "video" | "web_search">("all")

  const [page, setPage] = useState(0)
  const limit = 50

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (providerSlug.trim()) params.set("provider_slug", providerSlug.trim())
    if (modality !== "all") params.set("modality", modality)
    return params.toString()
  }, [limit, modality, page, providerSlug, q])

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
    <AdminPage
      headerContent={
        <Button variant="outline" size="sm" onClick={() => fetchList()} disabled={loading}>
          <RefreshCcw className="size-4 mr-2" />
          새로고침
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">가격/요율 관리 - 사용자 공개 요금표</div>
          <div className="text-sm text-muted-foreground">pricing_model_cost_summaries 기준 조회</div>
        </div>
        <div className="flex items-center gap-2" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="모델명/모델키/Provider 검색"
          className="w-[240px]"
        />
        <Input
          value={providerSlug}
          onChange={(e) => setProviderSlug(e.target.value)}
          placeholder="provider_slug (예: openai, google)"
          className="w-[220px]"
        />
        <Select value={modality} onValueChange={(v) => setModality(v as any)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="모달리티" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모달리티 전체</SelectItem>
            <SelectItem value="text">text</SelectItem>
            <SelectItem value="code">code</SelectItem>
            <SelectItem value="image">image</SelectItem>
            <SelectItem value="audio">audio</SelectItem>
            <SelectItem value="video">video</SelectItem>
            <SelectItem value="web_search">web_search</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Modality</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Input $/1K</TableHead>
              <TableHead className="text-right">Output $/1K</TableHead>
              <TableHead className="text-right">Avg $/1K</TableHead>
              <TableHead className="text-right">Margin %</TableHead>
              <TableHead className="text-right">Avg+Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  결과가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, idx) => (
                <TableRow key={`${r.provider_slug}-${r.model_key}-${r.tier_unit ?? "none"}-${r.tier_min ?? 0}-${idx}`}>
                  <TableCell className="font-mono">{r.provider_slug || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{r.model_name || "-"}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.model_key || "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{r.modality || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{formatTier(r)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtMoney(r.input_cost_per_1k)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtMoney(r.output_cost_per_1k)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtMoney(r.avg_cost_per_1k)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtPercent(r.margin_percent)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtMoney(r.avg_cost_per_1k_with_margin)}</TableCell>
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
    </AdminPage>
  )
}

