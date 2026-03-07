import type { ReactNode } from "react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Copy, Loader2, Pencil, Plus, RefreshCcw, Wand2 } from "lucide-react"

const TIER_UNIT_OPTIONS = [
  { value: "", label: "(없음)" },
  { value: "context_tokens", label: "context_tokens" },
  { value: "input_tokens", label: "input_tokens" },
  { value: "output_tokens", label: "output_tokens" },
  { value: "image_tokens", label: "image_tokens" },
  { value: "seconds", label: "seconds" },
  { value: "requests", label: "requests" },
] as const
import { AdminPage } from "@/components/layout/AdminPage"

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
  metadata?: Record<string, unknown> | null
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

type MissingSku = {
  id: string
  sku_code: string
  provider_slug: string
  model_key: string
  model_name: string
  modality: string
  usage_kind: string
  token_category?: string | null
  unit: string
  unit_size: number
  currency: string
  metadata?: Record<string, unknown> | null
}

const RATE_CARDS_API = "/api/ai/pricing/rate-cards"

type ModalityFilter = "all" | "text" | "code" | "image" | "audio" | "video" | "web_search"
type UsageKindFilter = "all" | "input_tokens" | "cached_input_tokens" | "output_tokens" | "image_generation" | "seconds" | "requests"
type TokenCategoryFilter = "all" | "text" | "image"
type TierUnitFilter =
  | "all"
  | "context_tokens"
  | "input_tokens"
  | "output_tokens"
  | "image_tokens"
  | "seconds"
  | "requests"
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

/** metadata JSON을 읽기 쉬운 형태로 포맷 (quality, size, resolution, task 등) */
function formatMetadata(meta: Record<string, unknown> | null | undefined): ReactNode {
  if (!meta || typeof meta !== "object") return null
  const entries = Object.entries(meta).filter(([, v]) => v != null && v !== "")
  if (entries.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <Badge key={k} variant="outline" className="font-normal text-xs">
          {k}: {String(v)}
        </Badge>
      ))}
    </div>
  )
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
  const [modality, setModality] = useState<ModalityFilter>("all")
  const [usageKind, setUsageKind] = useState<UsageKindFilter>("all")
  const [tokenCategory, setTokenCategory] = useState<TokenCategoryFilter>("all")
  const [tierUnitFilter, setTierUnitFilter] = useState<TierUnitFilter>("all")

  const [page, setPage] = useState(0)
  const limit = 50

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<RateRow | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editTierUnit, setEditTierUnit] = useState("")
  const [editTierMin, setEditTierMin] = useState("")
  const [editTierMax, setEditTierMax] = useState("")
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

  const [missingOpen, setMissingOpen] = useState(false)
  const [missingSkus, setMissingSkus] = useState<MissingSku[]>([])
  const [missingLoading, setMissingLoading] = useState(false)
  const [missingRateValues, setMissingRateValues] = useState<Record<string, string>>({})
  const [missingUseTiers, setMissingUseTiers] = useState<Record<string, boolean>>({})
  type TierEntry = { tier_unit: string; tier_min: string; tier_max: string; rate_value: string }
  const [missingTierEntries, setMissingTierEntries] = useState<Record<string, TierEntry[]>>({})
  const [missingSelected, setMissingSelected] = useState<Set<string>>(new Set())
  const [missingSaving, setMissingSaving] = useState(false)

  const [addTierOpen, setAddTierOpen] = useState(false)
  const [addTierRow, setAddTierRow] = useState<RateRow | null>(null)
  const [addTierForm, setAddTierForm] = useState({
    tier_unit: "context_tokens",
    tier_min: "",
    tier_max: "",
    rate_value: "",
  })
  const [addTierSaving, setAddTierSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (providerSlug.trim()) params.set("provider_slug", providerSlug.trim())
    if (modality !== "all") params.set("modality", modality)
    if (usageKind !== "all") params.set("usage_kind", usageKind)
    if (tokenCategory !== "all") params.set("token_category", tokenCategory)
    if (tierUnitFilter !== "all") params.set("tier_unit", tierUnitFilter)
    if (rateCardId) params.set("rate_card_id", rateCardId)
    return params.toString()
  }, [limit, modality, page, providerSlug, q, rateCardId, tierUnitFilter, tokenCategory, usageKind])

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

  function openAddTier(row: RateRow) {
    setAddTierRow(row)
    setAddTierForm({
      tier_unit: "context_tokens",
      tier_min: "",
      tier_max: "",
      rate_value: "",
    })
    setAddTierOpen(true)
  }

  async function saveAddTier() {
    if (!addTierRow || !rateCardId) return
    const raw = addTierForm.rate_value.trim()
    if (!raw) {
      alert("요율 값을 입력해주세요.")
      return
    }
    const rateVal = Number(raw)
    if (!Number.isFinite(rateVal) || rateVal < 0) {
      alert("요율 값은 0 이상의 숫자여야 합니다.")
      return
    }
    if (!addTierForm.tier_unit.trim()) {
      alert("티어 단위를 선택해주세요.")
      return
    }
    const tierMin = addTierForm.tier_min.trim() ? Number(addTierForm.tier_min) : null
    const tierMax = addTierForm.tier_max.trim() ? Number(addTierForm.tier_max) : null
    if (tierMin != null && (!Number.isFinite(tierMin) || tierMin < 0)) {
      alert("tier_min은 0 이상의 숫자여야 합니다.")
      return
    }
    if (tierMax != null && (!Number.isFinite(tierMax) || tierMax < 0)) {
      alert("tier_max는 0 이상의 숫자여야 합니다.")
      return
    }
    if (tierMin != null && tierMax != null && tierMin > tierMax) {
      alert("tier_min은 tier_max보다 작거나 같아야 합니다.")
      return
    }
    try {
      setAddTierSaving(true)
      const res = await adminFetch(`${RATE_CARDS_API}/${rateCardId}/add-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rates: [
            {
              sku_id: addTierRow.sku_id,
              rate_value: rateVal,
              tier_unit: addTierForm.tier_unit.trim(),
              tier_min: tierMin,
              tier_max: tierMax,
            },
          ],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setAddTierOpen(false)
      setAddTierRow(null)
      await fetchRates()
    } catch (e) {
      console.error(e)
      alert("티어 추가에 실패했습니다.")
    } finally {
      setAddTierSaving(false)
    }
  }

  function openEdit(row: RateRow) {
    setEditing(row)
    setEditValue(String(row.rate_value ?? ""))
    setEditTierUnit(row.tier_unit ?? "")
    setEditTierMin(row.tier_min != null ? String(row.tier_min) : "")
    setEditTierMax(row.tier_max != null ? String(row.tier_max) : "")
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

  async function openMissing() {
    if (!rateCardId) {
      alert("Rate Card를 먼저 선택해주세요.")
      return
    }
    setMissingOpen(true)
    setMissingLoading(true)
    setMissingSelected(new Set())
    setMissingRateValues({})
    setMissingUseTiers({})
    setMissingTierEntries({})
    try {
      const res = await adminFetch(`${RATE_CARDS_API}/${rateCardId}/missing-skus`)
      const json = await res.json().catch(() => ({ rows: [] }))
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setMissingSkus(json.rows || [])
    } catch (e) {
      console.error(e)
      setMissingSkus([])
    } finally {
      setMissingLoading(false)
    }
  }

  function toggleMissingSelect(skuId: string) {
    setMissingSelected((prev) => {
      const next = new Set(prev)
      if (next.has(skuId)) next.delete(skuId)
      else next.add(skuId)
      return next
    })
  }

  function toggleMissingAll() {
    if (missingSelected.size === missingSkus.length) {
      setMissingSelected(new Set())
    } else {
      setMissingSelected(new Set(missingSkus.map((s) => s.id)))
    }
  }

  function setMissingUseTiersFor(skuId: string, use: boolean) {
    setMissingUseTiers((p) => ({ ...p, [skuId]: use }))
    if (use && !missingTierEntries[skuId]?.length) {
      setMissingTierEntries((p) => ({
        ...p,
        [skuId]: [{ tier_unit: "context_tokens", tier_min: "", tier_max: "", rate_value: "" }],
      }))
    } else if (!use) {
      setMissingTierEntries((p) => {
        const next = { ...p }
        delete next[skuId]
        return next
      })
    }
  }

  function addMissingTierEntry(skuId: string) {
    setMissingTierEntries((p) => ({
      ...p,
      [skuId]: [...(p[skuId] || []), { tier_unit: "context_tokens", tier_min: "", tier_max: "", rate_value: "" }],
    }))
  }

  function removeMissingTierEntry(skuId: string, idx: number) {
    setMissingTierEntries((p) => {
      const arr = (p[skuId] || []).filter((_, i) => i !== idx)
      if (arr.length === 0) return { ...p, [skuId]: [] }
      return { ...p, [skuId]: arr }
    })
  }

  function updateMissingTierEntry(skuId: string, idx: number, field: keyof TierEntry, value: string) {
    setMissingTierEntries((p) => {
      const arr = [...(p[skuId] || [])]
      if (!arr[idx]) return p
      arr[idx] = { ...arr[idx], [field]: value }
      return { ...p, [skuId]: arr }
    })
  }

  async function saveMissingRates() {
    if (missingSelected.size === 0) {
      alert("추가할 SKU를 선택해주세요.")
      return
    }
    const rates: Array<{
      sku_id: string
      rate_value: number
      tier_unit?: string | null
      tier_min?: number | null
      tier_max?: number | null
    }> = []
    for (const skuId of missingSelected) {
      if (missingUseTiers[skuId]) {
        const entries = missingTierEntries[skuId] || []
        if (entries.length === 0) {
          alert("티어 구간별 설정을 사용할 경우 최소 1개 구간을 입력해주세요.")
          return
        }
      }
    }
    for (const skuId of missingSelected) {
      if (missingUseTiers[skuId] && (missingTierEntries[skuId]?.length ?? 0) > 0) {
        const entries = missingTierEntries[skuId] || []
        for (const e of entries) {
          const rv = Number(e.rate_value)
          if (!Number.isFinite(rv) || rv < 0) {
            alert(`SKU ${skuId}의 요율 값이 올바르지 않습니다.`)
            return
          }
          if (!e.tier_unit?.trim()) {
            alert("티어 구간별 설정 시 tier_unit을 선택해주세요.")
            return
          }
          const tierMin = e.tier_min.trim() ? Number(e.tier_min) : null
          const tierMax = e.tier_max.trim() ? Number(e.tier_max) : null
          rates.push({
            sku_id: skuId,
            rate_value: rv,
            tier_unit: e.tier_unit.trim(),
            tier_min: tierMin,
            tier_max: tierMax,
          })
        }
      } else {
        const raw = String(missingRateValues[skuId] ?? "").trim()
        if (!raw) {
          const sku = missingSkus.find((s) => s.id === skuId)
          alert(`요율을 입력해주세요. (SKU: ${sku?.sku_code ?? skuId})`)
          return
        }
        const rv = Number(raw)
        if (!Number.isFinite(rv) || rv < 0) {
          alert("요율 값은 0 이상의 숫자여야 합니다.")
          return
        }
        rates.push({ sku_id: skuId, rate_value: rv })
      }
    }
    if (rates.length === 0) {
      alert("추가할 요율이 없습니다.")
      return
    }

    try {
      setMissingSaving(true)
      const res = await adminFetch(`${RATE_CARDS_API}/${rateCardId}/add-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setMissingOpen(false)
      await fetchRates()
    } catch (e) {
      console.error(e)
      alert("요율 추가에 실패했습니다.")
    } finally {
      setMissingSaving(false)
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
      const payload: Record<string, unknown> = {
        rate_card_id: rateCardId,
        operation: bulkForm.operation,
        value: valueNum,
      }
      if (q.trim()) payload.q = q.trim()
      if (providerSlug.trim()) payload.provider_slug = providerSlug.trim()
      if (modality !== "all") payload.modality = modality
      if (usageKind !== "all") payload.usage_kind = usageKind
      if (tokenCategory !== "all") payload.token_category = tokenCategory
      if (tierUnitFilter !== "all") payload.tier_unit = tierUnitFilter

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
    const tierMinNum = editTierMin.trim() ? Number(editTierMin) : null
    const tierMaxNum = editTierMax.trim() ? Number(editTierMax) : null
    if (tierMinNum != null && (!Number.isFinite(tierMinNum) || tierMinNum < 0)) {
      alert("tier_min은 0 이상의 숫자여야 합니다.")
      return
    }
    if (tierMaxNum != null && (!Number.isFinite(tierMaxNum) || tierMaxNum < 0)) {
      alert("tier_max는 0 이상의 숫자여야 합니다.")
      return
    }
    if (tierMinNum != null && tierMaxNum != null && tierMinNum > tierMaxNum) {
      alert("tier_min은 tier_max보다 작거나 같아야 합니다.")
      return
    }
    try {
      setSaving(true)
      const payload: Record<string, unknown> = { rate_value: raw }
      if (editTierUnit.trim()) {
        payload.tier_unit = editTierUnit.trim()
        payload.tier_min = tierMinNum
        payload.tier_max = tierMaxNum
      } else {
        payload.tier_unit = null
        payload.tier_min = null
        payload.tier_max = null
      }
      const res = await adminFetch(`${RATES_API}/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      tierUnitFilter !== "all" ? `tier_unit=${tierUnitFilter}` : null,
      q.trim() ? `q=${q.trim()}` : null,
    ].filter(Boolean)
    return parts.length ? parts.join(" · ") : "필터 없음"
  }, [modality, providerSlug, q, selectedRateCard, tierUnitFilter, tokenCategory, usageKind])

  return (
    <AdminPage
      headerContent={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchRates()} disabled={loading}>
            <RefreshCcw className="size-4 mr-2" />
            새로고침
          </Button>
          <Button variant="outline" size="sm" onClick={openClone}>
            <Copy className="size-4 mr-2" />
            버전 복제
          </Button>
          <Button variant="outline" size="sm" onClick={openMissing}>
            <Plus className="size-4 mr-2" />
            누락 SKU 추가
          </Button>
          <Button size="sm" onClick={openBulk}>
            <Wand2 className="size-4 mr-2" />
            일괄 수정
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">가격/요율 관리 - 모델/모달리티 요율표</div>
          <div className="text-sm text-muted-foreground">pricing_skus + pricing_rates 기준</div>
        </div>
        <div className="flex items-center gap-2" />
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
        <Select value={modality} onValueChange={(v) => setModality(v as ModalityFilter)}>
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
        <Select value={usageKind} onValueChange={(v) => setUsageKind(v as UsageKindFilter)}>
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
        <Select value={tokenCategory} onValueChange={(v) => setTokenCategory(v as TokenCategoryFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="토큰 카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">토큰 전체</SelectItem>
            <SelectItem value="text">text</SelectItem>
            <SelectItem value="image">image</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tierUnitFilter} onValueChange={(v) => setTierUnitFilter(v as TierUnitFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="티어 단위" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">티어 전체</SelectItem>
            <SelectItem value="context_tokens">context_tokens</SelectItem>
            <SelectItem value="input_tokens">input_tokens</SelectItem>
            <SelectItem value="output_tokens">output_tokens</SelectItem>
            <SelectItem value="image_tokens">image_tokens</SelectItem>
            <SelectItem value="seconds">seconds</SelectItem>
            <SelectItem value="requests">requests</SelectItem>
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
              <TableHead>Metadata</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">수정</TableHead>
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
                <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
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
                  <TableCell className="max-w-[260px]">
                    {formatMetadata(r.metadata as Record<string, unknown>) || (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{fmtTier(r)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtRate(r.rate_value)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        <Pencil className="size-3 mr-1" />
                        수정
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openAddTier(r)}>
                        <Plus className="size-3 mr-1" />
                        티어
                      </Button>
                    </div>
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
              <div className="space-y-1">
                <div className="text-sm font-medium">요율 값 (rate_value)</div>
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="숫자 (예: 2.0)"
                />
                <div className="text-xs text-muted-foreground">
                  단위: {editing.unit_size} {editing.unit} 기준
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">티어 (선택)</div>
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={editTierUnit || "__none__"}
                    onValueChange={(v) => setEditTierUnit(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="단위" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIER_UNIT_OPTIONS.map((o) => (
                        <SelectItem key={o.value || "none"} value={o.value || "__none__"}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={editTierMin}
                    onChange={(e) => setEditTierMin(e.target.value)}
                    placeholder="tier_min"
                    type="number"
                    min={0}
                  />
                  <Input
                    value={editTierMax}
                    onChange={(e) => setEditTierMax(e.target.value)}
                    placeholder="tier_max"
                    type="number"
                    min={0}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  context_tokens 예: 0–200000, 200001–(비움) = 200K 초과
                </div>
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

      <Dialog open={addTierOpen} onOpenChange={setAddTierOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>티어 구간 추가</DialogTitle>
            <div className="text-sm font-normal text-muted-foreground">
              {addTierRow
                ? `${addTierRow.provider_slug} · ${addTierRow.model_name} · ${addTierRow.usage_kind} — 동일 SKU에 새 구간 추가`
                : ""}
            </div>
          </DialogHeader>
          {addTierRow ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium">티어 단위</div>
                  <Select
                    value={addTierForm.tier_unit}
                    onValueChange={(v) => setAddTierForm((p) => ({ ...p, tier_unit: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIER_UNIT_OPTIONS.filter((o) => o.value).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">요율 값</div>
                  <Input
                    value={addTierForm.rate_value}
                    onChange={(e) => setAddTierForm((p) => ({ ...p, rate_value: e.target.value }))}
                    placeholder="숫자 (예: 2.0)"
                    type="number"
                    step="any"
                    min={0}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium">tier_min</div>
                  <Input
                    value={addTierForm.tier_min}
                    onChange={(e) => setAddTierForm((p) => ({ ...p, tier_min: e.target.value }))}
                    placeholder="0 또는 빈칭"
                    type="number"
                    min={0}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">tier_max</div>
                  <Input
                    value={addTierForm.tier_max}
                    onChange={(e) => setAddTierForm((p) => ({ ...p, tier_max: e.target.value }))}
                    placeholder="200000 또는 빈칭"
                    type="number"
                    min={0}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                예: context_tokens 0–200000 ($2/1M), 200001–(빈칭) ($4/1M)
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTierOpen(false)} disabled={addTierSaving}>
              취소
            </Button>
            <Button onClick={saveAddTier} disabled={addTierSaving}>
              {addTierSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              추가
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

      <Dialog open={missingOpen} onOpenChange={setMissingOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              누락 SKU 추가
              {selectedRateCard ? ` — ${selectedRateCard.name} v${selectedRateCard.version}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-2">
            현재 Rate Card에 요율이 등록되지 않은 활성 SKU 목록입니다. 선택 후 요율을 입력하고 추가하세요.
          </div>
          {missingLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
              로딩 중...
            </div>
          ) : missingSkus.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">누락된 SKU가 없습니다.</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={missingSelected.size === missingSkus.length && missingSkus.length > 0}
                        onCheckedChange={toggleMissingAll}
                      />
                    </TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Modality</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Metadata</TableHead>
                    <TableHead className="w-[50px]">티어</TableHead>
                    <TableHead className="min-w-[200px]">요율 / 티어 구간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingSkus.map((s) => {
                    const useTiers = missingUseTiers[s.id]
                    const entries = missingTierEntries[s.id] || []
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Checkbox
                            checked={missingSelected.has(s.id)}
                            onCheckedChange={() => toggleMissingSelect(s.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono">{s.provider_slug}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{s.model_name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{s.model_key}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{s.modality}</TableCell>
                        <TableCell className="font-mono">{s.usage_kind}</TableCell>
                        <TableCell className="font-mono">{s.token_category || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.unit_size.toLocaleString()} {s.unit}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          {formatMetadata(s.metadata) || (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={!!useTiers}
                            onCheckedChange={(c) => {
                              setMissingUseTiersFor(s.id, !!c)
                              if (!missingSelected.has(s.id)) setMissingSelected((p) => new Set(p).add(s.id))
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {useTiers ? (
                            <div className="space-y-2">
                              {entries.map((e, idx) => (
                                <div key={idx} className="flex flex-wrap items-center gap-1">
                                  <Select
                                    value={e.tier_unit}
                                    onValueChange={(v) => updateMissingTierEntry(s.id, idx, "tier_unit", v)}
                                  >
                                    <SelectTrigger className="h-8 w-[130px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TIER_UNIT_OPTIONS.filter((o) => o.value).map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                          {o.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    min={0}
                                    className="h-8 w-[80px] text-xs"
                                    placeholder="min"
                                    value={e.tier_min}
                                    onChange={(ev) => updateMissingTierEntry(s.id, idx, "tier_min", ev.target.value)}
                                  />
                                  <Input
                                    type="number"
                                    min={0}
                                    className="h-8 w-[80px] text-xs"
                                    placeholder="max"
                                    value={e.tier_max}
                                    onChange={(ev) => updateMissingTierEntry(s.id, idx, "tier_max", ev.target.value)}
                                  />
                                  <Input
                                    type="number"
                                    step="any"
                                    min={0}
                                    className="h-8 w-[90px] text-xs font-mono"
                                    placeholder="rate"
                                    value={e.rate_value}
                                    onChange={(ev) =>
                                      updateMissingTierEntry(s.id, idx, "rate_value", ev.target.value)
                                    }
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => removeMissingTierEntry(s.id, idx)}
                                  >
                                    ×
                                  </Button>
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  addMissingTierEntry(s.id)
                                  if (!missingSelected.has(s.id)) setMissingSelected((p) => new Set(p).add(s.id))
                                }}
                              >
                                + 구간 추가
                              </Button>
                            </div>
                          ) : (
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              className="h-8 text-sm font-mono w-[100px]"
                              value={missingRateValues[s.id] ?? ""}
                              placeholder="0"
                              onChange={(e) =>
                                setMissingRateValues((prev) => ({ ...prev, [s.id]: e.target.value }))
                              }
                              onFocus={() => {
                                if (!missingSelected.has(s.id)) {
                                  setMissingSelected((prev) => new Set(prev).add(s.id))
                                }
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-muted-foreground">
                {missingSkus.length}건 중 {missingSelected.size}건 선택
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMissingOpen(false)} disabled={missingSaving}>
                  취소
                </Button>
                <Button onClick={saveMissingRates} disabled={missingSaving || missingSelected.size === 0}>
                  {missingSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                  선택 항목 추가 ({missingSelected.size}건)
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}

