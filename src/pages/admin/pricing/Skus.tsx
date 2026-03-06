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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ChevronsUpDown, Loader2, Pencil, Plus, Power, RefreshCcw, Trash2 } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type SkuRow = {
  id: string
  sku_code: string
  provider_slug: string
  model_id?: string | null
  model_key: string
  model_name: string
  modality: string
  usage_kind: string
  token_category?: string | null
  unit: string
  unit_size: number
  currency: string
  is_active: boolean
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  rates_count?: number
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: SkuRow[]
}

type ModelOption = {
  id: string
  model_id: string
  display_name: string
  provider_slug: string
  model_type?: string
}

type FormState = {
  provider_slug: string
  model_key: string
  model_name: string
  modality: string
  usage_kind: string
  token_category: string
  unit: string
  unit_size: string
  currency: string
  sku_code: string
  metadata_text: string
}

const API_URL = "/api/ai/pricing/skus"
const MODELS_API_URL = "/api/ai/models"
const USERS_API_URL = "/api/users"
const SELECT_ALL = "__all__"
const SELECT_NONE = "__none__"
const MODEL_NONE = "__none__"

const MODALITIES = ["text", "code", "image", "video", "audio", "web_search"] as const

/** ai_models.model_type → pricing_skus.modality 매핑 */
function modelTypeToModality(modelType: string): string {
  const map: Record<string, string> = {
    text: "text",
    code: "code",
    image: "image",
    video: "video",
    audio: "audio",
    music: "audio",
    multimodal: "text",
    embedding: "text",
  }
  return map[modelType] ?? "text"
}
const USAGE_KINDS = ["input_tokens", "cached_input_tokens", "output_tokens", "image_generation", "seconds", "requests"] as const
const TOKEN_CATEGORIES = ["text", "image"] as const
const UNITS = ["tokens", "image", "second", "request"] as const

const EMPTY_FORM: FormState = {
  provider_slug: "",
  model_key: "",
  model_name: "",
  modality: "text",
  usage_kind: "input_tokens",
  token_category: "",
  unit: "tokens",
  unit_size: "1000000",
  currency: "USD",
  sku_code: "",
  metadata_text: "{}",
}

function buildAutoSkuCode(f: FormState): string {
  const base = `${f.provider_slug}.${f.model_key}.${f.modality}.${f.usage_kind}`
  if (f.token_category) return `${base}.${f.token_category}`
  try {
    const meta = JSON.parse(f.metadata_text)
    const parts: string[] = []
    if (meta.quality) parts.push(meta.quality)
    if (meta.size) parts.push(meta.size)
    if (meta.resolution) parts.push(meta.resolution)
    if (meta.task) parts.push(meta.task)
    if (parts.length) return `${base}.${parts.join(".")}`
  } catch { /* ignore */ }
  return base
}

export default function Skus() {
  const [rows, setRows] = useState<SkuRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [listError, setListError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [providerSlug, setProviderSlug] = useState("")
  const [modality, setModality] = useState(SELECT_ALL)
  const [usageKind, setUsageKind] = useState(SELECT_ALL)
  const [tokenCategory, setTokenCategory] = useState(SELECT_ALL)
  const [isActive, setIsActive] = useState<"all" | "true" | "false">("all")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SkuRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string>("")
  const [skuCheckLoading, setSkuCheckLoading] = useState(false)

  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SkuRow | null>(null)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (providerSlug.trim()) params.set("provider_slug", providerSlug.trim())
    if (modality !== SELECT_ALL) params.set("modality", modality)
    if (usageKind !== SELECT_ALL) params.set("usage_kind", usageKind)
    if (tokenCategory !== SELECT_ALL) params.set("token_category", tokenCategory)
    if (isActive !== "all") params.set("is_active", isActive)
    return params.toString()
  }, [isActive, limit, modality, page, providerSlug, q, tokenCategory, usageKind])

  async function fetchList() {
    setLoading(true)
    setListError(null)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
      let json: ListResponse
      try {
        json = (await res.json()) as ListResponse
      } catch {
        setListError(res.ok ? "응답 형식 오류" : `요청 실패 (${res.status})`)
        setRows([])
        setTotal(0)
        return
      }
      if (!res.ok) {
        const err = json as unknown as { message?: string; details?: string }
        const msg = err.details ? `${err.message || "요청 실패"} — ${err.details}` : (err.message || `요청 실패 (${res.status})`)
        setListError(msg)
        setRows([])
        setTotal(0)
        return
      }
      if (!json.ok) {
        setListError((json as unknown as { message?: string }).message || "목록 조회 실패")
        setRows([])
        setTotal(0)
        return
      }
      setRows(json.rows || [])
      setTotal(json.total ?? 0)
    } catch (e) {
      console.error(e)
      setListError(e instanceof Error ? e.message : "목록 조회 중 오류가 발생했습니다.")
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

  useEffect(() => {
    const id = String(localStorage.getItem("user_id") || "").trim()
    if (!id) return
    adminFetch(`${USERS_API_URL}/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        const slug = String(data?.role_slug || "").toLowerCase()
        setIsSuperAdmin(slug === "super-admin")
      })
      .catch(() => setIsSuperAdmin(false))
  }, [])

  async function fetchModels() {
    setModelsLoading(true)
    try {
      const res = await adminFetch(`${MODELS_API_URL}?limit=500&offset=0`)
      const json = (await res.json().catch(() => [])) as unknown
      const list = Array.isArray(json) ? json as Record<string, unknown>[] : []
      const normalized: ModelOption[] = list
        .map((m) => ({
          id: String(m?.id ?? ""),
          model_id: String(m?.model_id ?? ""),
          display_name: String(m?.display_name ?? m?.name ?? ""),
          provider_slug: String(m?.provider_slug ?? ""),
          model_type: String(m?.model_type ?? "text"),
        }))
        .filter((m: ModelOption) => m.id && m.model_id && m.display_name)
      setModels(normalized)
    } catch (e) {
      console.error(e)
      setModels([])
    } finally {
      setModelsLoading(false)
    }
  }

  async function checkSkuCodeExists(skuCode: string, excludeId?: string): Promise<boolean> {
    if (!skuCode.trim()) return false
    try {
      const params = new URLSearchParams({ sku_code: skuCode.trim() })
      if (excludeId) params.set("exclude_id", excludeId)
      const res = await adminFetch(`${API_URL}/check-availability?${params}`)
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; exists?: boolean }
      return Boolean(json.ok && json.exists)
    } catch {
      return false
    }
  }

  async function handleSkuCodeBlur() {
    const effectiveCode = form.sku_code.trim() || (editing ? "" : autoCode)
    if (!effectiveCode) return
    setSkuCheckLoading(true)
    try {
      const exists = await checkSkuCodeExists(effectiveCode, editing?.id)
      if (exists) {
        alert("이미 존재하는 SKU 코드입니다. 다른 코드를 입력해주세요.")
        if (!editing) setForm((p) => ({ ...p, sku_code: "" }))
      }
    } finally {
      setSkuCheckLoading(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSelectedModelId("")
    setDialogOpen(true)
    fetchModels()
  }

  function openEdit(row: SkuRow) {
    setEditing(row)
    setForm({
      provider_slug: row.provider_slug || "",
      model_key: row.model_key || "",
      model_name: row.model_name || "",
      modality: row.modality || "text",
      usage_kind: row.usage_kind || "input_tokens",
      token_category: row.token_category || "",
      unit: row.unit || "tokens",
      unit_size: String(row.unit_size ?? 1000000),
      currency: row.currency || "USD",
      sku_code: row.sku_code || "",
      metadata_text: JSON.stringify(row.metadata || {}, null, 2),
    })
    setSelectedModelId(row.model_id && row.model_id.trim() ? row.model_id : MODEL_NONE)
    setDialogOpen(true)
    fetchModels()
  }

  function buildPayload() {
    let metadata = {}
    try {
      metadata = JSON.parse(form.metadata_text)
    } catch { /* ignore */ }

    if (editing) {
      const payload: Record<string, unknown> = {
        model_name: form.model_name.trim(),
        modality: form.modality,
        usage_kind: form.usage_kind,
        token_category: form.token_category || null,
        unit: form.unit,
        unit_size: Number(form.unit_size),
        currency: form.currency.trim() || "USD",
        metadata,
      }
      if (form.sku_code.trim()) payload.sku_code = form.sku_code.trim()
      if (selectedModelId === MODEL_NONE) {
        payload.model_id = null
        payload.provider_slug = form.provider_slug.trim()
        payload.model_key = form.model_key.trim()
      } else {
        payload.model_id = selectedModelId
        payload.provider_slug = form.provider_slug.trim()
        payload.model_key = form.model_key.trim()
      }
      return payload
    }

    return {
      provider_slug: form.provider_slug.trim(),
      model_key: form.model_key.trim(),
      model_name: form.model_name.trim(),
      modality: form.modality,
      usage_kind: form.usage_kind,
      token_category: form.token_category || null,
      unit: form.unit,
      unit_size: Number(form.unit_size),
      currency: form.currency.trim() || "USD",
      sku_code: form.sku_code.trim() || undefined,
      model_id: selectedModelId && selectedModelId !== MODEL_NONE ? selectedModelId : undefined,
      metadata,
    }
  }

  function validate(): string | null {
    if (selectedModelId === MODEL_NONE) {
      if (!form.provider_slug.trim()) return "provider_slug를 입력해주세요."
      if (!form.model_key.trim()) return "model_key를 입력해주세요."
    } else if (!selectedModelId) {
      return "모델을 선택하거나 '모델 없음'을 선택해주세요."
    } else if (selectedModelId !== MODEL_NONE) {
      if (!form.provider_slug.trim()) return "모델 선택 시 provider_slug가 자동 적용됩니다. 모델을 선택해주세요."
      if (!form.model_key.trim()) return "모델 선택 시 model_key가 자동 적용됩니다. 모델을 선택해주세요."
    }
    if (!form.model_name.trim()) return "model_name을 입력해주세요."
    const unitSize = Number(form.unit_size)
    if (!Number.isFinite(unitSize) || unitSize <= 0) return "unit_size는 양수여야 합니다."
    try {
      JSON.parse(form.metadata_text)
    } catch {
      return "metadata가 유효한 JSON이 아닙니다."
    }
    return null
  }

  async function saveSku() {
    const msg = validate()
    if (msg) {
      alert(msg)
      return
    }

    const payload = buildPayload()
    const effectiveCode = (payload as { sku_code?: string }).sku_code ?? (form.sku_code.trim() || autoCode)
    if (effectiveCode) {
      const exists = await checkSkuCodeExists(effectiveCode, editing?.id)
      if (exists) {
        alert("이미 존재하는 SKU 코드입니다. 다른 코드를 입력해주세요.")
        return
      }
    }
    try {
      setSaving(true)
      const res = await adminFetch(editing ? `${API_URL}/${editing.id}` : API_URL, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        const detail = json.message || json.details || "저장 실패"
        throw new Error(detail)
      }
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await fetchList()
    } catch (e: unknown) {
      console.error(e)
      alert(e instanceof Error ? e.message : "SKU 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function deactivateSku(row: SkuRow) {
    if (!confirm(`"${row.sku_code}" SKU를 비활성화할까요?`)) return
    try {
      const res = await adminFetch(`${API_URL}/${row.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED")
      await fetchList()
    } catch (e) {
      console.error(e)
      alert("비활성화에 실패했습니다.")
    }
  }

  function openDeleteDialog(row: SkuRow) {
    setDeleteTarget(row)
    setDeletePassword("")
    setDeleteError(null)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    if (!deletePassword.trim()) {
      setDeleteError("비밀번호를 입력해주세요.")
      return
    }
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await adminFetch(`${API_URL}/${deleteTarget.id}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_password: deletePassword }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        const msg = (json as { message?: string }).message || "삭제 실패"
        setDeleteError(msg)
        return
      }
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
      setDeletePassword("")
      await fetchList()
    } catch (e) {
      console.error(e)
      setDeleteError(e instanceof Error ? e.message : "삭제에 실패했습니다.")
    } finally {
      setDeleteLoading(false)
    }
  }

  async function reactivateSku(row: SkuRow) {
    try {
      const res = await adminFetch(`${API_URL}/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED")
      await fetchList()
    } catch (e) {
      console.error(e)
      alert("활성화에 실패했습니다.")
    }
  }

  const autoCode = useMemo(() => {
    if (editing) return ""
    if (!form.provider_slug || !form.model_key) return ""
    return buildAutoSkuCode(form)
  }, [editing, form])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchList} disabled={loading}>
            <RefreshCcw className="size-4 mr-2" />
            새로고침
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-2" />
            새 SKU
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">가격/요율 관리 - SKU 관리</div>
          <div className="text-sm text-muted-foreground">pricing_skus: 모델/모달리티별 사용 단위(SKU) 관리</div>
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
          placeholder="provider_slug"
          className="w-[160px]"
        />
        <Select value={modality} onValueChange={setModality}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="모달리티" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_ALL}>모달리티 전체</SelectItem>
            {MODALITIES.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={usageKind} onValueChange={setUsageKind}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="사용 종류" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_ALL}>사용 종류 전체</SelectItem>
            {USAGE_KINDS.map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tokenCategory} onValueChange={setTokenCategory}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="토큰 카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_ALL}>토큰 전체</SelectItem>
            {TOKEN_CATEGORIES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={isActive} onValueChange={(v) => setIsActive(v as "all" | "true" | "false")}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="활성" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">활성 전체</SelectItem>
            <SelectItem value="true">활성</SelectItem>
            <SelectItem value="false">비활성</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU Code</TableHead>
              <TableHead className="w-[120px]">model_id</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Modality</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>활성</TableHead>
              <TableHead className="text-right">작업</TableHead>
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
            ) : listError ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center">
                  <div className="text-destructive font-medium">{listError}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    네트워크, 인증(로그인), 또는 pricing 서비스 연결을 확인해주세요.
                  </div>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchList()}>
                    다시 시도
                  </Button>
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
                <TableRow key={r.id} className={r.is_active ? "" : "opacity-50"}>
                  <TableCell className="font-mono text-xs max-w-[240px] truncate" title={r.sku_code}>
                    {r.sku_code}
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs max-w-[120px] truncate text-muted-foreground"
                    title={r.model_id ?? "null"}
                  >
                    {r.model_id
                      ? r.model_id.length > 12
                        ? `${r.model_id.slice(0, 12)}…`
                        : r.model_id
                      : "null"}
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
                    {(r.unit_size ?? 1).toLocaleString()} {r.unit}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={r.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}
                    >
                      {r.is_active ? "활성" : "비활성"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        <Pencil className="size-3 mr-1" />
                        수정
                      </Button>
                      {r.is_active ? (
                        <Button variant="outline" size="sm" onClick={() => deactivateSku(r)}>
                          <Power className="size-3 mr-1" />
                          비활성화
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => reactivateSku(r)}>
                          활성화
                        </Button>
                      )}
                      {isSuperAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openDeleteDialog(r)}
                          title="SKU를 완전히 삭제합니다 (최고관리자 전용, 비밀번호 확인 필요)"
                        >
                          <Trash2 className="size-3 mr-1" />
                          삭제
                        </Button>
                      )}
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
          <Button variant="outline" disabled={page <= 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            이전
          </Button>
          <Button variant="outline" disabled={(page + 1) * limit >= total || loading} onClick={() => setPage((p) => p + 1)}>
            다음
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "SKU 수정" : "새 SKU 생성"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">모델 선택 *</div>
                <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={modelPopoverOpen}
                      className="w-full justify-between font-normal"
                      disabled={modelsLoading}
                    >
                      {modelsLoading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          모델 로딩 중...
                        </>
                      ) : selectedModelId === MODEL_NONE ? (
                        "모델 없음 (직접 입력)"
                      ) : selectedModelId ? (
                        (() => {
                          const m = models.find((x) => x.id === selectedModelId)
                          return m
                            ? `${m.provider_slug} · ${m.display_name} (${m.model_id})`
                            : "모델 검색 또는 선택..."
                        })()
                      ) : (
                        "모델 검색 또는 선택..."
                      )}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] max-h-[70vh] p-0" align="start">
                    <Command className="flex flex-col max-h-[70vh]">
                      <CommandInput placeholder="모델명/model_id/provider 검색..." />
                      <CommandList className="max-h-[60vh] overflow-y-auto overscroll-contain">
                        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="모델 없음 직접 입력 serper web_search"
                            onSelect={() => {
                              setSelectedModelId(MODEL_NONE)
                              setModelPopoverOpen(false)
                            }}
                          >
                            <span className="text-muted-foreground italic">모델 없음 (Serper 등 직접 입력)</span>
                          </CommandItem>
                          {models.map((m) => (
                            <CommandItem
                              key={m.id}
                              value={`${m.provider_slug} ${m.display_name} ${m.model_id}`}
                              onSelect={() => {
                                setSelectedModelId(m.id)
                                setForm((p) => ({
                                  ...p,
                                  provider_slug: m.provider_slug,
                                  model_key: m.model_id,
                                  model_name: m.display_name,
                                  modality: modelTypeToModality(m.model_type ?? "text"),
                                }))
                                setModelPopoverOpen(false)
                              }}
                            >
                              <span className="font-mono text-muted-foreground">{m.provider_slug}</span>
                              <span className="mx-2">·</span>
                              <span>{m.display_name}</span>
                              <span className="ml-1 text-muted-foreground">({m.model_id})</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {selectedModelId === MODEL_NONE ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Provider</div>
                    <Input
                      value={form.provider_slug}
                      onChange={(e) => setForm((p) => ({ ...p, provider_slug: e.target.value }))}
                      placeholder="예: serper"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Model Key</div>
                    <Input
                      value={form.model_key}
                      onChange={(e) => setForm((p) => ({ ...p, model_key: e.target.value }))}
                      placeholder="예: serper"
                    />
                  </div>
                </div>
              ) : selectedModelId ? (
                <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Provider:</span> {form.provider_slug}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Model Key:</span> {form.model_key}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Model Name (표시명) *</div>
              <Input
                value={form.model_name}
                onChange={(e) => setForm((p) => ({ ...p, model_name: e.target.value }))}
                placeholder="예: GPT-5.2"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Modality</div>
                <Select value={form.modality} onValueChange={(v) => setForm((p) => ({ ...p, modality: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODALITIES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Usage Kind</div>
                <Select value={form.usage_kind} onValueChange={(v) => setForm((p) => ({ ...p, usage_kind: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {USAGE_KINDS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Token Category</div>
                <Select
                  value={form.token_category || SELECT_NONE}
                  onValueChange={(v) => setForm((p) => ({ ...p, token_category: v === SELECT_NONE ? "" : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>없음</SelectItem>
                    {TOKEN_CATEGORIES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Unit</div>
                <Select value={form.unit} onValueChange={(v) => setForm((p) => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Unit Size</div>
                <Input
                  type="number"
                  min={1}
                  value={form.unit_size}
                  onChange={(e) => setForm((p) => ({ ...p, unit_size: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Currency</div>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                  placeholder="USD"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Metadata (JSON)</div>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                rows={3}
                value={form.metadata_text}
                onChange={(e) => setForm((p) => ({ ...p, metadata_text: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">
                SKU Code {editing ? "(수정 가능)" : "(자동 생성, override 가능)"}
              </div>
              <Input
                value={form.sku_code}
                onChange={(e) => setForm((p) => ({ ...p, sku_code: e.target.value }))}
                onBlur={handleSkuCodeBlur}
                placeholder={editing ? editing.sku_code : autoCode || "provider.model.modality.usage_kind"}
                disabled={skuCheckLoading}
              />
              {skuCheckLoading && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  중복 확인 중...
                </div>
              )}
              {!editing && autoCode && !form.sku_code && !skuCheckLoading && (
                <div className="text-xs text-muted-foreground">
                  자동 생성: <span className="font-mono">{autoCode}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={saveSku} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              {editing ? "저장" : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) {
            setDeleteTarget(null)
            setDeletePassword("")
            setDeleteError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>SKU 삭제</DialogTitle>
            <DialogDescription>
              삭제하려면 본인 계정의 비밀번호를 입력해주세요. 이 작업은 되돌릴 수 없으며, 연결된 pricing_rates(요금 정보)도 함께 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="text-sm">
              삭제 대상: <span className="font-mono font-medium">{deleteTarget?.sku_code || "-"}</span>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sku-delete-password">비밀번호</Label>
              <Input
                id="sku-delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                disabled={deleteLoading}
                placeholder="본인 계정 비밀번호"
              />
            </div>
            {deleteError ? <div className="text-sm text-destructive">{deleteError}</div> : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteLoading}
            >
              취소
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              {deleteLoading ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
