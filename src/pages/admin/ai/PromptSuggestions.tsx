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
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Loader2, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react"

type ScopeType = "GLOBAL" | "TENANT" | "ROLE"
type ModelType = "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"

type AIModelRow = {
  id: string
  display_name: string
  model_id: string
  model_type: string
  provider_product_name?: string
}

type PromptSuggestionRow = {
  id: string
  scope_type: ScopeType
  scope_id: string | null
  model_type: ModelType | null
  model_id: string | null
  title: string | null
  text: string
  sort_order: number
  is_active: boolean
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: PromptSuggestionRow[]
}

const API = "/api/ai/prompt-suggestions"

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function jsonErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null
  const rec = json as Record<string, unknown>
  return typeof rec.message === "string" ? rec.message : null
}

function pretty(obj: unknown) {
  try {
    return JSON.stringify(obj ?? {}, null, 2)
  } catch {
    return "{}"
  }
}

function safeParseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export default function PromptSuggestions() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PromptSuggestionRow[]>([])
  const [total, setTotal] = useState(0)

  const [q, setQ] = useState("")
  const [modelTypeFilter, setModelTypeFilter] = useState<string>("all")
  const [scopeTypeFilter, setScopeTypeFilter] = useState<string>("all")
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "true" | "false">("all")
  const [page, setPage] = useState(0)
  const limit = 50

  const [models, setModels] = useState<AIModelRow[]>([])

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PromptSuggestionRow | null>(null)

  // form
  const [scopeType, setScopeType] = useState<ScopeType>("TENANT")
  const [scopeId, setScopeId] = useState("")
  const [modelType, setModelType] = useState<string>("all")
  const [modelId, setModelId] = useState<string>("all")
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [metadataText, setMetadataText] = useState(pretty({}))

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (modelTypeFilter !== "all") params.set("model_type", modelTypeFilter)
    if (scopeTypeFilter !== "all") params.set("scope_type", scopeTypeFilter)
    if (isActiveFilter !== "all") params.set("is_active", isActiveFilter)
    return params.toString()
  }, [isActiveFilter, limit, modelTypeFilter, page, q, scopeTypeFilter])

  async function fetchList() {
    setLoading(true)
    try {
      const res = await fetch(`${API}?${queryString}`)
      const json = (await res.json().catch(() => ({}))) as ListResponse
      if (!res.ok || !json.ok) throw new Error(jsonErrorMessage(json) || "FAILED_LIST")
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

  async function fetchDetail(id: string) {
    const res = await fetch(`${API}/${id}`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(jsonErrorMessage(json) || "FAILED_GET")
    const row = (json as { row?: PromptSuggestionRow })?.row
    if (!row) throw new Error("FAILED_GET")
    return row
  }

  async function fetchModels() {
    try {
      const qs = new URLSearchParams({ limit: "500", offset: "0" })
      const res = await fetch(`/api/ai/models?${qs.toString()}`)
      const json = await res.json().catch(() => [])
      if (!res.ok || !Array.isArray(json)) return
      const normalized = (json as any[]).map((m) => ({
        id: String(m.id || ""),
        display_name: String(m.display_name || ""),
        model_id: String(m.model_id || ""),
        model_type: String(m.model_type || ""),
        provider_product_name: typeof m.provider_product_name === "string" ? m.provider_product_name : undefined,
      }))
      setModels(normalized.filter((m) => m.id && m.model_id))
    } catch {
      // ignore
    }
  }

  function resetForm() {
    setEditing(null)
    setScopeType("TENANT")
    setScopeId("")
    setModelType("all")
    setModelId("all")
    setTitle("")
    setText("")
    setSortOrder(0)
    setIsActive(true)
    setMetadataText(pretty({}))
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  async function openEdit(r: PromptSuggestionRow) {
    try {
      const full = await fetchDetail(r.id)
      setEditing(full)
      setScopeType(full.scope_type)
      setScopeId(String(full.scope_id || ""))
      setModelType(full.model_type || "all")
      setModelId(full.model_id || "all")
      setTitle(String(full.title || ""))
      setText(String(full.text || ""))
      setSortOrder(Number(full.sort_order || 0))
      setIsActive(Boolean(full.is_active))
      setMetadataText(pretty(full.metadata ?? {}))
      setOpen(true)
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  async function save() {
    const t = text.trim()
    if (!t) return alert("text(예시 프롬프트)를 입력해 주세요.")

    const st = scopeType
    const sid = scopeId.trim()
    if (st === "GLOBAL") {
      if (sid) return alert("GLOBAL 스코프에서는 scope_id가 비어 있어야 합니다.")
    } else {
      if (!sid) return alert("TENANT/ROLE 스코프에서는 scope_id(UUID)가 필요합니다.")
    }

    const meta = safeParseJsonObject(metadataText)

    const payload = {
      scope_type: st,
      scope_id: st === "GLOBAL" ? null : sid,
      model_type: modelType === "all" ? null : modelType,
      model_id: modelId === "all" ? null : modelId,
      title: title.trim() || null,
      text: t,
      sort_order: Number(sortOrder || 0) || 0,
      is_active: isActive,
      metadata: meta,
    }

    try {
      const isEdit = Boolean(editing?.id)
      const url = isEdit ? `${API}/${editing!.id}` : API
      const method = isEdit ? "PUT" : "POST"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(jsonErrorMessage(json) || "저장 실패")
      setOpen(false)
      resetForm()
      await fetchList()
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  async function remove(r: PromptSuggestionRow) {
    const label = r.title ? `${r.title} - ${r.text}` : r.text
    const ok = window.confirm(`예시 프롬프트를 삭제합니다. 계속할까요?\n\n${label}`)
    if (!ok) return
    try {
      const res = await fetch(`${API}/${r.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(jsonErrorMessage(json) || "삭제 실패")
      await fetchList()
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  useEffect(() => {
    fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))
  const modelTypeOptions = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.model_type || "")).filter(Boolean))
    return Array.from(set).sort()
  }, [rows])

  const modelOptionsForForm = useMemo(() => {
    const mt = modelType === "all" ? "" : modelType
    const list = mt ? models.filter((m) => m.model_type === mt) : models
    return list
  }, [modelType, models])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">AI 서비스 - 예시 프롬프트(Prompt Suggestions)</div>
          <div className="text-sm text-muted-foreground">
            채팅 입력창 하단 등에서 클릭하면 입력창에 채워지는 예시 프롬프트를 관리합니다. (model_type 기준 필터링 가능)
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchList()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">예시 추가</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setPage(0)
            setQ(e.target.value)
          }}
          placeholder="title/text 검색"
          className="w-[280px]"
        />
        <Select
          value={modelTypeFilter}
          onValueChange={(v) => {
            setPage(0)
            setModelTypeFilter(v)
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="model_type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 model_type</SelectItem>
            {modelTypeOptions.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
            {modelTypeOptions.length === 0 &&
              (["text", "image", "audio", "music", "video", "multimodal", "embedding", "code"] as ModelType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={scopeTypeFilter}
          onValueChange={(v) => {
            setPage(0)
            setScopeTypeFilter(v)
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="scope_type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 scope</SelectItem>
            <SelectItem value="TENANT">TENANT</SelectItem>
            <SelectItem value="ROLE">ROLE</SelectItem>
            <SelectItem value="GLOBAL">GLOBAL</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={isActiveFilter}
          onValueChange={(v) => {
            setPage(0)
            setIsActiveFilter(v as any)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="활성" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="true">활성</SelectItem>
            <SelectItem value="false">비활성</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto text-sm text-muted-foreground">
          총 <span className="font-medium text-foreground">{total}</span>개 · 페이지{" "}
          <span className="font-medium text-foreground">{page + 1}</span>/{pageCount}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">활성</TableHead>
              <TableHead className="w-[120px]">scope</TableHead>
              <TableHead className="w-[120px]">model_type</TableHead>
              <TableHead>title / text</TableHead>
              <TableHead className="w-[110px]">정렬</TableHead>
              <TableHead className="w-[140px]">연결 모델</TableHead>
              <TableHead className="w-[140px]">수정</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const model = r.model_id ? models.find((m) => m.id === r.model_id) : undefined
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.is_active ? <Badge>ON</Badge> : <Badge variant="secondary">OFF</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{r.scope_type}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]">
                      {r.scope_id || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{r.model_type || "-"}</TableCell>
                  <TableCell>
                    {r.title ? <div className="font-medium">{r.title}</div> : <div className="text-muted-foreground">-</div>}
                    <div className="text-sm text-muted-foreground line-clamp-2">{r.text}</div>
                  </TableCell>
                  <TableCell className="font-mono">{r.sort_order}</TableCell>
                  <TableCell>
                    {model ? (
                      <div>
                        <div className="text-xs text-muted-foreground">{model.provider_product_name || ""}</div>
                        <div className="text-sm">{model.display_name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{model.model_id}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => remove(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          페이지 이동:
          <Button
            className="ml-2"
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            이전
          </Button>
          <Button
            className="ml-2"
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            다음
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">limit={limit}</div>
      </div>

      <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
        <DialogContent className="max-w-[900px]">
          <DialogHeader>
            <DialogTitle>{editing ? "예시 프롬프트 수정" : "예시 프롬프트 추가"}</DialogTitle>
            <DialogDescription>
              scope_type/scope_id로 노출 범위를 제어하고, model_type/model_id로 탭/모델에 맞춰 노출을 제한할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4 space-y-2">
              <Label>scope_type</Label>
              <Select value={scopeType} onValueChange={(v) => setScopeType(v as ScopeType)}>
                <SelectTrigger>
                  <SelectValue placeholder="scope_type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TENANT">TENANT</SelectItem>
                  <SelectItem value="ROLE">ROLE</SelectItem>
                  <SelectItem value="GLOBAL">GLOBAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 md:col-span-8 space-y-2">
              <Label>scope_id (UUID)</Label>
              <Input
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder={scopeType === "GLOBAL" ? "(GLOBAL은 비워두세요)" : "예: tenant_id 또는 role_id UUID"}
                disabled={scopeType === "GLOBAL"}
              />
            </div>

            <div className="col-span-12 md:col-span-4 space-y-2">
              <Label>model_type</Label>
              <Select value={modelType} onValueChange={(v) => setModelType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="model_type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">(전체)</SelectItem>
                  {(["text", "image", "audio", "music", "video", "multimodal", "embedding", "code"] as ModelType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 md:col-span-8 space-y-2">
              <Label>model_id (특정 모델에만 노출, 선택)</Label>
              <Select value={modelId} onValueChange={(v) => setModelId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="model_id" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">(선택 안 함)</SelectItem>
                  {modelOptionsForForm.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.provider_product_name ? `${m.provider_product_name} · ` : ""}
                      {m.display_name} ({m.model_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-6 space-y-2">
              <Label>title (선택)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 심층 리서치" />
            </div>
            <div className="col-span-12 md:col-span-3 space-y-2">
              <Label>sort_order</Label>
              <Input
                value={String(sortOrder)}
                onChange={(e) => setSortOrder(Number(e.target.value || 0) || 0)}
                placeholder="0"
              />
            </div>
            <div className="col-span-12 md:col-span-3 space-y-2">
              <Label>is_active</Label>
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={(v) => setIsActive(Boolean(v))} />
                <span className="text-sm text-muted-foreground">{isActive ? "활성" : "비활성"}</span>
              </div>
            </div>

            <div className="col-span-12 space-y-2">
              <Label>text</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="예: 심층 리서치를 작성해줘" />
            </div>

            <div className="col-span-12 space-y-2">
              <Label>metadata (JSON object)</Label>
              <Textarea value={metadataText} onChange={(e) => setMetadataText(e.target.value)} rows={6} className="font-mono text-xs" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={save}>{editing ? "저장" : "생성"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


