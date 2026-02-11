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
import { Copy, Loader2, Pencil, RefreshCcw, Wand2 } from "lucide-react"

type RateCardStatus = "draft" | "active" | "retired"

type RateCard = {
  id: string
  name: string
  version: number
  status: RateCardStatus
  effective_at: string
}

type RateRow = {
  id: string
  rate_card_id: string
  rate_card_name: string
  rate_card_version: number
  rate_card_status: string
  rate_card_effective_at: string
  sku_id: string
  sku_code: string
  provider_slug: string
  model_key: string
  model_name: string
  modality: string
  usage_kind: string
  token_category?: string | null
  unit: string
  unit_size: number
  rate_value: string | number
  tier_unit?: string | null
  tier_min?: number | null
  tier_max?: number | null
}

type RateListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: RateRow[]
}

type RateCardResponse = {
  ok: boolean
  rows: RateCard[]
}

const RATE_CARDS_API = "/api/ai/pricing/rate-cards"
const RATES_API = "/api/ai/pricing/rates"
const BULK_UPDATE_API = "/api/ai/pricing/rates/bulk-update"

type CloneForm = {
  source_id: string
  name: string
  version: string
  status: RateCardStatus
  effective_at: string
  description: string
}

type BulkForm = {
  operation: "percent" | "multiply" | "set"
  value: string
}

function toNumber(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

function fmtRate(v: unknown) {
  const n = toNumber(v)
  const fixed = n.toFixed(6)
  return fixed.replace(/\.?0+$/, "")
}

function fmtTier(row: RateRow) {
  if (!row.tier_unit) return "-"
  if (typeof row.tier_min === "number" && typeof row.tier_max === "number") {
    return `${row.tier_unit} ${row.tier_min}-${row.tier_max}`
  }
  if (typeof row.tier_min === "number") return `${row.tier_unit} ≥${row.tier_min}`
  if (typeof row.tier_max === "number") return `${row.tier_unit} ≤${row.tier_max}`
  return row.tier_unit
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

export default function Rates() {
  const [rateCards, setRateCards] = useState<RateCard[]>([])
  const [rateCardId, setRateCardId] = useState("")

  const [rows, setRows] = useState<RateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)

  const [q, setQ] = useState("")
  const [providerSlug, setProviderSlug] = useState("")
  const [modality, setModality] = useState<"all" | "text" | "code" | "image" | "audio" | "video" | "web_search">("all")
  const [usageKind, setUsageKind] = useState<
    "all" | "input_tokens" | "cached_input_tokens" | "output_tokens" | "image_generation" | "seconds" | "requests"
  >("all")
  const [tokenCategory, setTokenCategory] = useState<"all" | "text" | "image">("all")

  const [page, setPage] = useState(0)
  const limit = 50

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<RateRow | null>(null)
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)

  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneForm, setCloneForm] = useState<CloneForm>({
    source_id: "",
    name: "",
    version: "1",
    status: "draft",
    effective_at: "",
    description: "",
  })
  const [cloneSaving, setCloneSaving] = useState(false)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkForm, setBulkForm] = useState<BulkForm>({
    operation: "percent",
    value: "",
  })
  const [bulkSaving, setBulkSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (providerSlug.trim()) params.set("provider_slug", providerSlug.trim())
    if (modality !== "all") params.set("modality", modality)
    if (usageKind !== "all") params.set("usage_kind", usageKind)
    if (tokenCategory !== "all") params.set("token_category", tokenCategory)
    if (rateCardId) params.set("rate_card_id", rateCardId)
    return params.toString()
  }, [limit, modality, page, providerSlug, q, rateCardId, tokenCategory, usageKind])

  async function fetchRateCards() {
    try {
      const res = await adminFetch(`${RATE_CARDS_API}?limit=200&offset=0`)
      const json = (await res.json()) as RateCardResponse
      if (!res.ok || !json.ok) throw new Error("FAILED_RATE_CARDS")
      const cards = json.rows || []
      setRateCards(cards)
      if (!rateCardId && cards.length > 0) {
        const active = cards.find((c) => c.status === "active") || cards[0]
        setRateCardId(active.id)
      }
    } catch (e) {
      console.error(e)
      setRateCards([])
    }
  }

  async function fetchRates() {
    setLoading(true)
    try {
      const res = await adminFetch(`${RATES_API}?${queryString}`)
      const json = (await res.json()) as RateListResponse
      if (!res.ok || !json.ok) throw new Error("FAILED_RATES")
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
    fetchRateCards()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchRates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const selectedRateCard = useMemo(() => rateCards.find((c) => c.id === rateCardId) || null, [rateCardId, rateCards])

  function openEdit(row: RateRow) {
    setEditing(row)
    setEditValue(String(row.rate_value ?? ""))
    setEditOpen(true)
  }

  function openClone() {
    const sourceId = rateCardId || rateCards[0]?.id || ""
    if (!sourceId) {
      alert("Rate Card를 먼저 선택해주세요.")
      return
    }
    const source = rateCards.find((c) => c.id === sourceId)
    setCloneForm({
      source_id: sourceId,
      name: source?.name || "",
      version: String((source?.version ?? 0) + 1 || 1),
      status: "draft",
      effective_at: nowLocal(),
      description: "",
    })
    setCloneOpen(true)
  }

  function updateCloneSource(sourceId: string) {
    const source = rateCards.find((c) => c.id === sourceId)
    setCloneForm((prev) => ({
      ...prev,
      source_id: sourceId,
      name: prev.name || source?.name || "",
      version: prev.version || String((source?.version ?? 0) + 1 || 1),
    }))
  }

  async function saveClone() {
    if (!cloneForm.source_id) {
      alert("원본 Rate Card를 선택해주세요.")
      return
    }
    if (!cloneForm.name.trim()) {
      alert("이름을 입력해주세요.")
      return
    }
    const versionNum = Number(cloneForm.version)
    if (!Number.isFinite(versionNum) || versionNum <= 0) {
      alert("버전을 입력해주세요.")
      return
    }
    if (!cloneForm.effective_at) {
      alert("유효 시간을 입력해주세요.")
      return
    }

    try {
      setCloneSaving(true)
      const res = await adminFetch(`${RATE_CARDS_API}/${cloneForm.source_id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cloneForm.name.trim(),
          version: Math.floor(versionNum),
          status: cloneForm.status,
          effective_at: new Date(cloneForm.effective_at).toISOString(),
          description: cloneForm.description.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_CLONE")
      setCloneOpen(false)
      await fetchRateCards()
      if (json.rate_card?.id) {
        setRateCardId(json.rate_card.id)
      }
    } catch (e) {
      console.error(e)
      alert("Rate Card 복제에 실패했습니다.")
    } finally {
      setCloneSaving(false)
    }
  }

  function openBulk() {
    if (!rateCardId) {
      alert("Rate Card를 먼저 선택해주세요.")
      return
    }
    setBulkForm({ operation: "percent", value: "" })
    setBulkOpen(true)
  }

  async function saveBulk() {
    if (!rateCardId) {
      alert("Rate Card를 먼저 선택해주세요.")
      return
    }
    const valueNum = Number(bulkForm.value)
    if (!Number.isFinite(valueNum)) {
      alert("숫자 값을 입력해주세요.")
      return
    }

    const opLabel =
      bulkForm.operation === "percent"
        ? `퍼센트 증감 (${valueNum}%)`
        : bulkForm.operation === "multiply"
          ? `배수 곱 (${valueNum})`
          : `고정값 설정 (${valueNum})`

    const targetSummary = [
      selectedRateCard ? `${selectedRateCard.name} v${selectedRateCard.version}` : "Rate Card",
      providerSlug.trim() ? `provider_slug=${providerSlug.trim()}` : null,
      modality !== "all" ? `modality=${modality}` : null,
      usageKind !== "all" ? `usage_kind=${usageKind}` : null,
      tokenCategory !== "all" ? `token_category=${tokenCategory}` : null,
      q.trim() ? `q=${q.trim()}` : null,
    ]
      .filter(Boolean)
      .join(" · ")

    if (!confirm(`다음 조건으로 일괄 수정할까요?\n${opLabel}\n${targetSummary}`)) return

    try {
      setBulkSaving(true)
      const payload: Record<string, any> = {
        rate_card_id: rateCardId,
        operation: bulkForm.operation,
        value: valueNum,
      }
      if (q.trim()) payload.q = q.trim()
      if (providerSlug.trim()) payload.provider_slug = providerSlug.trim()
      if (modality !== "all") payload.modality = modality
      if (usageKind !== "all") payload.usage_kind = usageKind
      if (tokenCategory !== "all") payload.token_category = tokenCategory

      const res = await adminFetch(BULK_UPDATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_BULK")
      setBulkOpen(false)
      await fetchRates()
    } catch (e) {
      console.error(e)
      alert("일괄 수정에 실패했습니다.")
    } finally {
      setBulkSaving(false)
    }
  }

  async function saveEdit() {
    if (!editing) return
    const raw = editValue.trim()
    if (!raw) {
      alert("요율 값을 입력해주세요.")
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      alert("숫자 형식으로 입력해주세요.")
      return
    }
    try {
      setSaving(true)
      const res = await adminFetch(`${RATES_API}/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_value: raw }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_UPDATE")
      setEditOpen(false)
      setEditing(null)
      await fetchRates()
    } catch (e) {
      console.error(e)
      alert("요율 업데이트에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  const bulkScopeText = useMemo(() => {
    const parts = [
      selectedRateCard ? `${selectedRateCard.name} v${selectedRateCard.version}` : null,
      providerSlug.trim() ? `provider_slug=${providerSlug.trim()}` : null,
      modality !== "all" ? `modality=${modality}` : null,
      usageKind !== "all" ? `usage_kind=${usageKind}` : null,
      tokenCategory !== "all" ? `token_category=${tokenCategory}` : null,
      q.trim() ? `q=${q.trim()}` : null,
    ].filter(Boolean)
    return parts.length ? parts.join(" · ") : "필터 없음"
  }, [modality, providerSlug, q, selectedRateCard, tokenCategory, usageKind])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">가격/요율 관리 - 모델/모달리티 요율표</div>
          <div className="text-sm text-muted-foreground">pricing_skus + pricing_rates 기준</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchRates()} disabled={loading}>
            <RefreshCcw className="size-4 mr-2" />
            새로고침
          </Button>
          <Button variant="outline" size="sm" onClick={openClone}>
            <Copy className="size-4 mr-2" />
            버전 복제
          </Button>
          <Button size="sm" onClick={openBulk}>
            <Wand2 className="size-4 mr-2" />
            일괄 수정
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="모델명/모델키/SKU 검색"
          className="w-[220px]"
        />
        <Input
          value={providerSlug}
          onChange={(e) => setProviderSlug(e.target.value)}
          placeholder="provider_slug (예: openai, google)"
          className="w-[200px]"
        />
        <Select value={rateCardId} onValueChange={setRateCardId}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Rate Card 선택" />
          </SelectTrigger>
          <SelectContent>
            {rateCards.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} v{c.version} ({c.status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modality} onValueChange={(v) => setModality(v as any)}>
          <SelectTrigger className="w-[140px]">
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
        <Select value={usageKind} onValueChange={(v) => setUsageKind(v as any)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="사용 종류" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">사용 종류 전체</SelectItem>
            <SelectItem value="input_tokens">input_tokens</SelectItem>
            <SelectItem value="cached_input_tokens">cached_input_tokens</SelectItem>
            <SelectItem value="output_tokens">output_tokens</SelectItem>
            <SelectItem value="image_generation">image_generation</SelectItem>
            <SelectItem value="seconds">seconds</SelectItem>
            <SelectItem value="requests">requests</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tokenCategory} onValueChange={(v) => setTokenCategory(v as any)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="토큰 카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">토큰 전체</SelectItem>
            <SelectItem value="text">text</SelectItem>
            <SelectItem value="image">image</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rate Card</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Modality</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">수정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  결과가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.rate_card_name} v{r.rate_card_version}
                  </TableCell>
                  <TableCell className="font-mono">{r.provider_slug}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{r.model_name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.model_key}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{r.modality}</TableCell>
                  <TableCell className="font-mono">{r.usage_kind}</TableCell>
                  <TableCell className="font-mono">{r.token_category || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.unit_size} {r.unit}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{fmtTier(r)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtRate(r.rate_value)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                      <Pencil className="size-3 mr-1" />
                      수정
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>요율 수정</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {editing.provider_slug} · {editing.model_name} · {editing.usage_kind}
              </div>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="rate_value (숫자)"
              />
              <div className="text-xs text-muted-foreground">
                단위: {editing.unit_size} {editing.unit} 기준
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rate Card 버전 복제</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              선택한 Rate Card의 요율을 그대로 복제하여 새 버전을 생성합니다.
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">원본 Rate Card</div>
              <Select value={cloneForm.source_id} onValueChange={updateCloneSource}>
                <SelectTrigger>
                  <SelectValue placeholder="원본 Rate Card 선택" />
                </SelectTrigger>
                <SelectContent>
                  {rateCards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} v{c.version} ({c.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">이름</div>
              <Input value={cloneForm.name} onChange={(e) => setCloneForm((p) => ({ ...p, name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">버전</div>
                <Input
                  type="number"
                  min={1}
                  value={cloneForm.version}
                  onChange={(e) => setCloneForm((p) => ({ ...p, version: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">상태</div>
                <Select
                  value={cloneForm.status}
                  onValueChange={(v) => setCloneForm((p) => ({ ...p, status: v as RateCardStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="상태 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">초안</SelectItem>
                    <SelectItem value="active">활성</SelectItem>
                    <SelectItem value="retired">종료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">유효 시간</div>
              <Input
                type="datetime-local"
                value={cloneForm.effective_at}
                onChange={(e) => setCloneForm((p) => ({ ...p, effective_at: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">설명</div>
              <Textarea
                rows={3}
                value={cloneForm.description}
                onChange={(e) => setCloneForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)} disabled={cloneSaving}>
              취소
            </Button>
            <Button onClick={saveClone} disabled={cloneSaving}>
              {cloneSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              복제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>요율 일괄 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">대상: {bulkScopeText}</div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">변경 방식</div>
                <Select
                  value={bulkForm.operation}
                  onValueChange={(v) => setBulkForm((p) => ({ ...p, operation: v as BulkForm["operation"] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="방식 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">퍼센트 증감</SelectItem>
                    <SelectItem value="multiply">배수 곱</SelectItem>
                    <SelectItem value="set">고정값 설정</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">값</div>
                <Input
                  type="number"
                  value={bulkForm.value}
                  onChange={(e) => setBulkForm((p) => ({ ...p, value: e.target.value }))}
                  placeholder={bulkForm.operation === "percent" ? "예: 10 (10%)" : "예: 1.1 또는 0.003"}
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              {bulkForm.operation === "percent"
                ? "현재 요율에 퍼센트만큼 증감합니다. (예: 10 → +10%, -5 → -5%)"
                : bulkForm.operation === "multiply"
                  ? "현재 요율에 배수를 곱합니다. (예: 1.1 → +10%)"
                  : "선택된 요율을 입력한 고정값으로 설정합니다."}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>
              취소
            </Button>
            <Button onClick={saveBulk} disabled={bulkSaving}>
              {bulkSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

