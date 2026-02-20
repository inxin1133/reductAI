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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type ModelOption = {
  id: string
  display_name: string
  model_id: string
}

type MarkupRow = {
  id: string
  name: string
  scope_type: "global" | "modality" | "model" | "model_usage"
  model_id?: string | null
  model_display_name?: string | null
  model_api_id?: string | null
  modality?: string | null
  usage_kind?: string | null
  token_category?: string | null
  margin_percent?: string | number | null
  priority?: number | null
  is_active: boolean
  effective_at?: string | null
  created_at: string
  updated_at: string
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: MarkupRow[]
}

const API_URL = "/api/ai/pricing/markups"
const MODELS_API_URL = "/api/ai/models"
const SELECT_ALL = "__all__"
const SELECT_NONE = "__none__"

function toNumber(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

function fmtPercent(v: unknown) {
  const n = toNumber(v)
  const fixed = n.toFixed(2)
  return fixed.replace(/\.?0+$/, "")
}

function fmtDt(iso?: string | null) {
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

type FormState = {
  name: string
  scope_type: "global" | "modality" | "model" | "model_usage"
  model_id: string
  modality: string
  usage_kind: string
  token_category: string
  margin_percent: string
  priority: string
  is_active: boolean
  effective_at: string
}

const EMPTY_FORM: FormState = {
  name: "",
  scope_type: "global",
  model_id: "",
  modality: "",
  usage_kind: "",
  token_category: "",
  margin_percent: "",
  priority: "0",
  is_active: true,
  effective_at: "",
}

export default function Markups() {
  const [models, setModels] = useState<ModelOption[]>([])
  const [rows, setRows] = useState<MarkupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [scopeType, setScopeType] = useState<"all" | MarkupRow["scope_type"]>("all")
  const [modality, setModality] = useState<"all" | "text" | "code" | "image" | "audio" | "video" | "web_search">("all")
  const [usageKind, setUsageKind] = useState<
    "all" | "input_tokens" | "cached_input_tokens" | "output_tokens" | "image_generation" | "seconds" | "requests"
  >("all")
  const [tokenCategory, setTokenCategory] = useState<"all" | "text" | "image">("all")
  const [isActive, setIsActive] = useState<"all" | "true" | "false">("all")
  const [modelId, setModelId] = useState(SELECT_ALL)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MarkupRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (scopeType !== "all") params.set("scope_type", scopeType)
    if (modality !== "all") params.set("modality", modality)
    if (usageKind !== "all") params.set("usage_kind", usageKind)
    if (tokenCategory !== "all") params.set("token_category", tokenCategory)
    if (isActive !== "all") params.set("is_active", isActive)
    if (modelId && modelId !== SELECT_ALL) params.set("model_id", modelId)
    return params.toString()
  }, [isActive, limit, modality, modelId, page, q, scopeType, tokenCategory, usageKind])

  async function fetchModels() {
    try {
      const res = await adminFetch(`${MODELS_API_URL}?limit=2000&offset=0`)
      const json = (await res.json().catch(() => [])) as any
      const list = Array.isArray(json) ? json : []
      const normalized = list
        .map((m: any) => ({
          id: String(m.id || ""),
          display_name: String(m.display_name || m.name || ""),
          model_id: String(m.model_id || ""),
        }))
        .filter((m: ModelOption) => m.id && m.display_name)
      setModels(normalized)
    } catch (e) {
      console.error(e)
      setModels([])
    }
  }

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
    fetchModels()
  }, [])

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(row: MarkupRow) {
    setEditing(row)
    setForm({
      name: row.name || "",
      scope_type: row.scope_type,
      model_id: row.model_id || "",
      modality: row.modality || "",
      usage_kind: row.usage_kind || "",
      token_category: row.token_category || "",
      margin_percent: String(row.margin_percent ?? ""),
      priority: String(row.priority ?? 0),
      is_active: Boolean(row.is_active),
      effective_at: toDateTimeLocal(row.effective_at || null),
    })
    setDialogOpen(true)
  }

  function buildPayload() {
    const payload: Record<string, any> = {
      name: form.name.trim(),
      scope_type: form.scope_type,
      margin_percent: form.margin_percent.trim(),
      priority: form.priority.trim(),
      is_active: form.is_active,
      effective_at: form.effective_at ? new Date(form.effective_at).toISOString() : null,
    }

    const modelIdValue = form.model_id || null
    const modalityValue = form.modality || null
    const usageKindValue = form.usage_kind || null
    const tokenCategoryValue = form.token_category || null

    if (form.scope_type === "global") {
      payload.model_id = null
      payload.modality = null
      payload.usage_kind = null
      payload.token_category = null
    } else if (form.scope_type === "modality") {
      payload.model_id = null
      payload.modality = modalityValue
      payload.usage_kind = null
      payload.token_category = tokenCategoryValue
    } else if (form.scope_type === "model") {
      payload.model_id = modelIdValue
      payload.modality = null
      payload.usage_kind = null
      payload.token_category = null
    } else if (form.scope_type === "model_usage") {
      payload.model_id = modelIdValue
      payload.modality = null
      payload.usage_kind = usageKindValue
      payload.token_category = tokenCategoryValue
    }

    return payload
  }

  function validatePayload(payload: Record<string, any>) {
    if (!payload.name) return "이름을 입력해주세요."
    if (!payload.scope_type) return "스코프를 선택해주세요."
    if (!payload.margin_percent) return "마진 퍼센트를 입력해주세요."
    if (payload.scope_type === "model" && !payload.model_id) return "모델을 선택해주세요."
    if (payload.scope_type === "model_usage" && (!payload.model_id || !payload.usage_kind)) {
      return "모델과 usage_kind를 선택해주세요."
    }
    if (payload.scope_type === "modality" && !payload.modality) return "모달리티를 선택해주세요."
    return null
  }

  async function saveMarkup() {
    const payload = buildPayload()
    const msg = validatePayload(payload)
    if (msg) {
      alert(msg)
      return
    }

    try {
      setSaving(true)
      const res = await adminFetch(editing ? `${API_URL}/${editing.id}` : API_URL, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await fetchList()
    } catch (e) {
      console.error(e)
      alert("마진 정책 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteMarkup(row: MarkupRow) {
    if (!confirm(`"${row.name}" 정책을 삭제할까요?`)) return
    try {
      const res = await adminFetch(`${API_URL}/${row.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_DELETE")
      await fetchList()
    } catch (e) {
      console.error(e)
      alert("삭제에 실패했습니다.")
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchList()} disabled={loading}>
            <RefreshCcw className="size-4 mr-2" />
            새로고침
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-2" />
            새 정책
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">가격/요율 관리 - 마진 정책</div>
          <div className="text-sm text-muted-foreground">pricing_markup_rules 기준</div>
        </div>
        <div className="flex gap-2" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="정책명/모델 검색"
          className="w-[200px]"
        />
        <Select value={scopeType} onValueChange={(v) => setScopeType(v as any)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="스코프" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">스코프 전체</SelectItem>
            <SelectItem value="global">global</SelectItem>
            <SelectItem value="modality">modality</SelectItem>
            <SelectItem value="model">model</SelectItem>
            <SelectItem value="model_usage">model_usage</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modality} onValueChange={(v) => setModality(v as any)}>
          <SelectTrigger className="w-[150px]">
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
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="토큰 카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">토큰 전체</SelectItem>
            <SelectItem value="text">text</SelectItem>
            <SelectItem value="image">image</SelectItem>
          </SelectContent>
        </Select>
        <Select value={isActive} onValueChange={(v) => setIsActive(v as any)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="활성" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">활성 전체</SelectItem>
            <SelectItem value="true">활성</SelectItem>
            <SelectItem value="false">비활성</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modelId} onValueChange={setModelId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="모델" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_ALL}>모델 전체</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name} ({m.model_id})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>정책명</TableHead>
              <TableHead>스코프</TableHead>
              <TableHead>대상</TableHead>
              <TableHead className="text-right">마진(%)</TableHead>
              <TableHead className="text-right">우선순위</TableHead>
              <TableHead>활성</TableHead>
              <TableHead>효력</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  결과가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="font-mono">{r.scope_type}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col">
                      {r.model_display_name ? (
                        <>
                          <span className="font-medium">
                            {r.model_display_name}
                            {r.model_api_id ? ` (${r.model_api_id})` : ""}
                          </span>
                        </>
                      ) : null}
                      {r.modality ? <span className="text-muted-foreground">{r.modality}</span> : null}
                      {r.usage_kind ? <span className="text-muted-foreground">{r.usage_kind}</span> : null}
                      {r.token_category ? <span className="text-muted-foreground">{r.token_category}</span> : null}
                      {!r.model_display_name && !r.modality && !r.usage_kind && !r.token_category ? (
                        <span className="text-muted-foreground">-</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtPercent(r.margin_percent)}</TableCell>
                  <TableCell className="text-right font-mono">{r.priority ?? 0}</TableCell>
                  <TableCell>{r.is_active ? "활성" : "비활성"}</TableCell>
                  <TableCell className="text-xs">{fmtDt(r.effective_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        <Pencil className="size-3 mr-1" />
                        수정
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => deleteMarkup(r)}>
                        <Trash2 className="size-3 mr-1" />
                        삭제
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "마진 정책 수정" : "마진 정책 생성"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>정책명</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="정책 이름"
              />
            </div>
            <div className="space-y-1">
              <Label>스코프</Label>
              <Select
                value={form.scope_type}
                onValueChange={(v) => setForm((p) => ({ ...p, scope_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="스코프 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">global</SelectItem>
                  <SelectItem value="modality">modality</SelectItem>
                  <SelectItem value="model">model</SelectItem>
                  <SelectItem value="model_usage">model_usage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>모델</Label>
                <Select
                  value={form.model_id}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, model_id: v === SELECT_NONE ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="모델 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>선택 안함</SelectItem>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.display_name} ({m.model_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>모달리티</Label>
                <Select
                  value={form.modality}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, modality: v === SELECT_NONE ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="모달리티 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>선택 안함</SelectItem>
                    <SelectItem value="text">text</SelectItem>
                    <SelectItem value="code">code</SelectItem>
                    <SelectItem value="image">image</SelectItem>
                    <SelectItem value="audio">audio</SelectItem>
                    <SelectItem value="video">video</SelectItem>
                    <SelectItem value="web_search">web_search</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>사용 종류</Label>
                <Select
                  value={form.usage_kind}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, usage_kind: v === SELECT_NONE ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="usage_kind" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>선택 안함</SelectItem>
                    <SelectItem value="input_tokens">input_tokens</SelectItem>
                    <SelectItem value="cached_input_tokens">cached_input_tokens</SelectItem>
                    <SelectItem value="output_tokens">output_tokens</SelectItem>
                    <SelectItem value="image_generation">image_generation</SelectItem>
                    <SelectItem value="seconds">seconds</SelectItem>
                    <SelectItem value="requests">requests</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>토큰 카테고리</Label>
                <Select
                  value={form.token_category}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, token_category: v === SELECT_NONE ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="token_category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE}>선택 안함</SelectItem>
                    <SelectItem value="text">text</SelectItem>
                    <SelectItem value="image">image</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>마진 %</Label>
                <Input
                  value={form.margin_percent}
                  onChange={(e) => setForm((p) => ({ ...p, margin_percent: e.target.value }))}
                  placeholder="예: 30"
                />
              </div>
              <div className="space-y-1">
                <Label>우선순위</Label>
                <Input
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>효력 시작일</Label>
              <Input
                type="datetime-local"
                value={form.effective_at}
                onChange={(e) => setForm((p) => ({ ...p, effective_at: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))}
              />
              <span className="text-sm">활성</span>
            </div>
            <div className="text-xs text-muted-foreground">
              global: 전체 적용, modality: 모달리티별, model: 모델별, model_usage: 모델+usage_kind
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={saveMarkup} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}

