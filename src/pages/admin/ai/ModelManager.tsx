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
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useAdminHeaderActionContext } from "@/contexts/AdminHeaderActionContext"
import { useEffect as useEffectReact } from "react"
import { Loader2, Pencil, Plus, Search, Trash2, RefreshCcw, Play } from "lucide-react"

type ProviderStatus = "active" | "inactive" | "deprecated"
type ModelType = "text" | "image" | "audio" | "video" | "multimodal" | "embedding" | "code"
type ModelStatus = "active" | "inactive" | "deprecated" | "beta"

interface Provider {
  id: string
  product_name: string
  slug: string
  status: ProviderStatus
  api_base_url?: string | null
}

interface AIModel {
  id: string
  provider_id: string
  provider_product_name?: string
  provider_slug?: string
  name: string
  model_id: string
  display_name: string
  description?: string | null
  model_type: ModelType
  prompt_template_id?: string | null
  response_schema_id?: string | null
  capabilities?: unknown
  context_window?: number | null
  max_output_tokens?: number | null
  input_token_cost_per_1k?: number | null
  output_token_cost_per_1k?: number | null
  currency?: string | null
  is_available: boolean
  is_default: boolean
  status: ModelStatus
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const PROVIDERS_API_URL = "/api/ai/providers"
const MODELS_API_URL = "/api/ai/models"
const PROMPT_TEMPLATES_API_URL = "/api/ai/prompt-templates"
const RESPONSE_SCHEMAS_API_URL = "/api/ai/response-schemas"

async function tryFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const contentType = res.headers.get("content-type") || ""
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!contentType.includes("application/json")) throw new Error("NOT_JSON")
  return (await res.json()) as T
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

export default function ModelManager() {
  const { setAction } = useAdminHeaderActionContext()

  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<AIModel[]>([])
  const [promptTemplates, setPromptTemplates] = useState<Array<{ id: string; name: string; purpose: string; version: number; is_active: boolean }>>([])
  const [responseSchemas, setResponseSchemas] = useState<Array<{ id: string; name: string; version: number; strict: boolean; is_active: boolean }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({})

  // 필터
  const [providerFilter, setProviderFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  // CRUD dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AIModel | null>(null)
  const [capabilitiesText, setCapabilitiesText] = useState("[]")
  const [metadataText, setMetadataText] = useState("{}")
  const [formData, setFormData] = useState<{
    provider_id: string
    model_id: string
    display_name: string
    model_type: ModelType
    prompt_template_id: string
    response_schema_id: string
    description: string
    context_window: string
    max_output_tokens: string
    input_token_cost_per_1k: string
    output_token_cost_per_1k: string
    currency: string
    is_available: boolean
    is_default: boolean
    status: ModelStatus
  }>({
    provider_id: "",
    model_id: "",
    display_name: "",
    model_type: "text",
    prompt_template_id: "__none__",
    response_schema_id: "__none__",
    description: "",
    context_window: "",
    max_output_tokens: "",
    input_token_cost_per_1k: "",
    output_token_cost_per_1k: "",
    currency: "USD",
    is_available: true,
    is_default: false,
    status: "active",
  })

  // 시뮬레이터
  const [isSimOpen, setIsSimOpen] = useState(false)
  const [simModel, setSimModel] = useState<AIModel | null>(null)
  const [simInput, setSimInput] = useState("간단한 자기소개를 해줘.")
  const [simMaxTokens, setSimMaxTokens] = useState("128")
  const [simRunning, setSimRunning] = useState(false)
  const [simOutput, setSimOutput] = useState<string>("")
  const [simError, setSimError] = useState<string>("")

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchProviders = async () => {
    const data = await tryFetchJson<Provider[]>(PROVIDERS_API_URL, { headers: { ...authHeaders() } })
    setProviders(data)
    if (!formData.provider_id) setFormData((p) => ({ ...p, provider_id: data[0]?.id || "" }))
  }

  const fetchPromptTemplates = async () => {
    try {
      const res = await fetch(`${PROMPT_TEMPLATES_API_URL}?limit=200&offset=0&is_active=true`, { headers: { ...authHeaders() } })
      const json = (await res.json().catch(() => ({}))) as unknown
      const obj = json as any
      const rows = Array.isArray(obj?.rows) ? obj.rows : []
      const normalized = rows
        .map((r: any) => ({
          id: String(r?.id || ""),
          name: String(r?.name || ""),
          purpose: String(r?.purpose || ""),
          version: Number(r?.version || 1),
          is_active: Boolean(r?.is_active),
        }))
        .filter((r: any) => r.id && r.name)
      setPromptTemplates(normalized)
    } catch {
      setPromptTemplates([])
    }
  }

  const fetchResponseSchemas = async () => {
    try {
      const res = await fetch(`${RESPONSE_SCHEMAS_API_URL}?limit=200&offset=0&is_active=true`, { headers: { ...authHeaders() } })
      const json = (await res.json().catch(() => ({}))) as unknown
      const obj = json as any
      const rows = Array.isArray(obj?.rows) ? obj.rows : []
      const normalized = rows
        .map((r: any) => ({
          id: String(r?.id || ""),
          name: String(r?.name || ""),
          version: Number(r?.version || 1),
          strict: Boolean(r?.strict),
          is_active: Boolean(r?.is_active),
        }))
        .filter((r: any) => r.id && r.name)
      setResponseSchemas(normalized)
    } catch {
      setResponseSchemas([])
    }
  }

  const fetchModels = async () => {
    const params = new URLSearchParams()
    if (providerFilter !== "all") params.set("provider_id", providerFilter)
    if (typeFilter !== "all") params.set("model_type", typeFilter)
    if (statusFilter !== "all") params.set("status", statusFilter)
    if (search.trim()) params.set("q", search.trim())
    const url = params.toString() ? `${MODELS_API_URL}?${params.toString()}` : MODELS_API_URL
    const data = await tryFetchJson<AIModel[]>(url, { headers: { ...authHeaders() } })
    setModels(data)
  }

  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      try {
        await fetchProviders()
        await fetchPromptTemplates()
        await fetchResponseSchemas()
        await fetchModels()
      } finally {
        setIsLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerFilter, typeFilter, statusFilter])

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => {
      const hay = `${m.provider_product_name || ""} ${m.provider_slug || ""} ${m.display_name} ${m.model_id}`.toLowerCase()
      return hay.includes(q)
    })
  }, [models, search])

  const openCreate = () => {
    setEditing(null)
    setFormData({
      provider_id: providers[0]?.id || "",
      model_id: "",
      display_name: "",
      model_type: "text",
      prompt_template_id: "__none__",
      response_schema_id: "__none__",
      description: "",
      context_window: "",
      max_output_tokens: "",
      input_token_cost_per_1k: "",
      output_token_cost_per_1k: "",
      currency: "USD",
      is_available: true,
      is_default: false,
      status: "active",
    })
    setCapabilitiesText("[]")
    setMetadataText("{}")
    setIsDialogOpen(true)
  }

  useEffectReact(() => {
    setAction(
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fetchModels()}>
          <RefreshCcw className="mr-2 h-4 w-4" /> 새로고침
        </Button>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> 모델 추가
        </Button>
      </div>
    )
    return () => setAction(null)
  }, [setAction, providers])

  const openEdit = (m: AIModel) => {
    setEditing(m)
    setFormData({
      provider_id: m.provider_id,
      model_id: m.model_id,
      display_name: m.display_name,
      model_type: m.model_type,
      prompt_template_id: m.prompt_template_id ? String(m.prompt_template_id) : "__none__",
      response_schema_id: m.response_schema_id ? String(m.response_schema_id) : "__none__",
      description: m.description || "",
      context_window: m.context_window?.toString() ?? "",
      max_output_tokens: m.max_output_tokens?.toString() ?? "",
      input_token_cost_per_1k: (m.input_token_cost_per_1k ?? "").toString(),
      output_token_cost_per_1k: (m.output_token_cost_per_1k ?? "").toString(),
      currency: m.currency || "USD",
      is_available: !!m.is_available,
      is_default: !!m.is_default,
      status: m.status,
    })
    setCapabilitiesText(JSON.stringify(m.capabilities ?? [], null, 2))
    setMetadataText(JSON.stringify(m.metadata ?? {}, null, 2))
    setIsDialogOpen(true)
  }

  const validateJson = () => {
    try {
      const c = JSON.parse(capabilitiesText || "[]")
      if (!Array.isArray(c)) return "capabilities는 JSON 배열이어야 합니다. 예) [\"chat\",\"vision\"]"
    } catch {
      return "capabilities JSON 형식이 올바르지 않습니다."
    }
    try {
      const meta = JSON.parse(metadataText || "{}")
      if (meta !== null && typeof meta !== "object") return "metadata는 JSON 객체여야 합니다. 예) {}"
    } catch {
      return "metadata JSON 형식이 올바르지 않습니다."
    }
    return null
  }

  const handleSubmit = async () => {
    const err = validateJson()
    if (err) {
      alert(err)
      return
    }
    if (!formData.provider_id || !formData.model_id.trim() || !formData.display_name.trim()) {
      alert("provider/model_id/display_name은 필수입니다.")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        provider_id: formData.provider_id,
        name: formData.model_id.trim(),
        model_id: formData.model_id.trim(),
        display_name: formData.display_name.trim(),
        description: formData.description.trim() || null,
        model_type: formData.model_type,
        prompt_template_id: formData.prompt_template_id === "__none__" ? null : formData.prompt_template_id,
        response_schema_id: formData.response_schema_id === "__none__" ? null : formData.response_schema_id,
        capabilities: JSON.parse(capabilitiesText || "[]"),
        context_window: formData.context_window ? Number(formData.context_window) : null,
        max_output_tokens: formData.max_output_tokens ? Number(formData.max_output_tokens) : null,
        input_token_cost_per_1k: formData.input_token_cost_per_1k ? Number(formData.input_token_cost_per_1k) : 0,
        output_token_cost_per_1k: formData.output_token_cost_per_1k ? Number(formData.output_token_cost_per_1k) : 0,
        currency: formData.currency || "USD",
        is_available: !!formData.is_available,
        is_default: !!formData.is_default,
        status: formData.status,
        metadata: JSON.parse(metadataText || "{}"),
      }

      if (editing) {
        await tryFetchJson(`${MODELS_API_URL}/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        })
      } else {
        await tryFetchJson(MODELS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        })
      }

      setIsDialogOpen(false)
      await fetchModels()
    } catch (e: unknown) {
      alert(`저장 실패: ${errorMessage(e) || "알 수 없는 오류"}`)
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (m: AIModel) => {
    const ok = confirm(
      [
        "이 모델을 DB에서 영구 삭제합니다.",
        "- 복구할 수 없습니다.",
        "- 이미 대화 기록(model_conversations 등)에 연결된 모델은 삭제가 실패할 수 있습니다.",
        "",
        `대상: ${m.provider_product_name || ""} / ${m.display_name} (${m.model_id})`,
        "",
        "계속하려면 '확인'을 눌러주세요.",
      ].join("\n")
    )
    if (!ok) return
    try {
      await fetch(`${MODELS_API_URL}/${m.id}`, { method: "DELETE", headers: { ...authHeaders() } })
      await fetchModels()
    } catch (e) {
      console.error(e)
      alert("삭제 중 오류가 발생했습니다.")
    }
  }

  const patchModelRow = async (id: string, patch: Partial<Pick<AIModel, "status" | "is_available">>) => {
    setRowSaving((p) => ({ ...p, [id]: true }))
    try {
      await tryFetchJson(`${MODELS_API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(patch),
      })
      // 로컬 반영(즉시 UI 반영) + 서버값 재조회(정합성)
      setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
      await fetchModels()
    } finally {
      setRowSaving((p) => ({ ...p, [id]: false }))
    }
  }

  const openSim = (m: AIModel) => {
    setSimModel(m)
    setSimOutput("")
    setSimError("")
    setIsSimOpen(true)
  }

  const runSim = async () => {
    if (!simModel) return
    setSimRunning(true)
    setSimOutput("")
    setSimError("")
    try {
      const result = await tryFetchJson<{ ok: boolean; output_text?: string; details?: string }>(`${MODELS_API_URL}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          model_id: simModel.id,
          input: simInput,
          max_tokens: Number(simMaxTokens) || 128,
        }),
      })
      setSimOutput(result.output_text || "")
    } catch (e: unknown) {
      setSimError(errorMessage(e) || "시뮬레이터 실행 실패")
      console.error(e)
    } finally {
      setSimRunning(false)
    }
  }

  return (
    <div className="space-y-4 bg-background">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            AI 모델 카탈로그를 관리하고, 선택한 모델로 테스트(시뮬레이터)를 실행할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-[220px]">
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.product_name} ({p.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[160px]">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(["text", "image", "audio", "video", "multimodal", "embedding", "code"] as ModelType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[180px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {(["active", "inactive", "deprecated", "beta"] as ModelStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            fetchModels()
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="검색: display/model_id/provider..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[320px]"
          />
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4 mr-2" /> 검색
          </Button>
        </form>

      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>모델</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Response Schema</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Context</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredModels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  등록된 모델이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredModels.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{m.display_name}</span>
                      <span className="text-xs text-muted-foreground">{m.model_id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {m.provider_slug || "-"}
                    </Badge>
                    <div className="text-xs text-muted-foreground">{m.provider_product_name || ""}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{m.model_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.response_schema_id || "__none__"}
                      onValueChange={(v) => void patchModelRow(m.id, { response_schema_id: v === "__none__" ? null : v })}
                      disabled={!!rowSaving[m.id]}
                    >
                      <SelectTrigger className="h-8 w-[220px]">
                        <SelectValue placeholder="(없음)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">(없음)</SelectItem>
                        {responseSchemas
                          .filter((s) => s.is_active)
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {`${s.name} (v${s.version})${s.strict ? " · strict" : ""}`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.status}
                      onValueChange={(v: ModelStatus) => void patchModelRow(m.id, { status: v })}
                      disabled={!!rowSaving[m.id]}
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["active", "inactive", "deprecated", "beta"] as ModelStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!m.is_available}
                        onCheckedChange={(checked) => void patchModelRow(m.id, { is_available: checked })}
                        disabled={!!rowSaving[m.id]}
                      />
                      <span className="text-xs text-muted-foreground">{m.is_available ? "Yes" : "No"}</span>
                    </div>
                  </TableCell>
                  <TableCell>{m.is_default ? <Badge>Yes</Badge> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.context_window ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openSim(m)}>
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(m)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* CRUD Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "모델 수정" : "모델 추가"}</DialogTitle>
            <DialogDescription>모델 정보를 입력하세요. 동기화로 생성된 모델도 여기서 세부값을 보정할 수 있습니다.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Provider</Label>
              <Select value={formData.provider_id} onValueChange={(value) => setFormData((p) => ({ ...p, provider_id: value }))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Provider 선택" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.product_name} ({p.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">model_id</Label>
              <Input className="col-span-3" value={formData.model_id} onChange={(e) => setFormData((p) => ({ ...p, model_id: e.target.value }))} />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">display_name</Label>
              <Input className="col-span-3" value={formData.display_name} onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">type</Label>
              <Select value={formData.model_type} onValueChange={(value: ModelType) => setFormData((p) => ({ ...p, model_type: value }))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["text", "image", "audio", "video", "multimodal", "embedding", "code"] as ModelType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">prompt_template</Label>
              <Select value={formData.prompt_template_id} onValueChange={(value) => setFormData((p) => ({ ...p, prompt_template_id: value }))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="(선택) 프롬프트 템플릿" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(없음)</SelectItem>
                  {promptTemplates
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {(t.purpose ? `${t.purpose} · ` : "") + `${t.name} (v${t.version})`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">response_schema</Label>
              <Select value={formData.response_schema_id} onValueChange={(value) => setFormData((p) => ({ ...p, response_schema_id: value }))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="(선택) 출력 계약(JSON schema)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(없음)</SelectItem>
                  {responseSchemas
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {`${s.name} (v${s.version})${s.strict ? " · strict" : ""}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">description</Label>
              <Textarea className="col-span-3" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">status</Label>
              <Select value={formData.status} onValueChange={(value: ModelStatus) => setFormData((p) => ({ ...p, status: value }))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["active", "inactive", "deprecated", "beta"] as ModelStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">context_window</Label>
              <Input className="col-span-3" type="number" value={formData.context_window} onChange={(e) => setFormData((p) => ({ ...p, context_window: e.target.value }))} />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">max_output_tokens</Label>
              <Input className="col-span-3" type="number" value={formData.max_output_tokens} onChange={(e) => setFormData((p) => ({ ...p, max_output_tokens: e.target.value }))} />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">input cost / 1k</Label>
              <Input className="col-span-3" type="number" value={formData.input_token_cost_per_1k} onChange={(e) => setFormData((p) => ({ ...p, input_token_cost_per_1k: e.target.value }))} />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">output cost / 1k</Label>
              <Input className="col-span-3" type="number" value={formData.output_token_cost_per_1k} onChange={(e) => setFormData((p) => ({ ...p, output_token_cost_per_1k: e.target.value }))} />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">currency</Label>
              <Input className="col-span-3" value={formData.currency} onChange={(e) => setFormData((p) => ({ ...p, currency: e.target.value }))} />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">available</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Switch checked={formData.is_available} onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_available: checked }))} />
                <span className="text-xs text-muted-foreground">사용 가능 여부</span>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">default</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Switch checked={formData.is_default} onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_default: checked }))} />
                <span className="text-xs text-muted-foreground">같은 타입 내 기본 모델 여부</span>
              </div>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">capabilities</Label>
              <div className="col-span-3 space-y-1">
                <Textarea className="font-mono text-xs min-h-[110px]" value={capabilitiesText} onChange={(e) => setCapabilitiesText(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  예) <span className="font-mono">["chat","vision","tool_calling"]</span> (JSON 배열)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right pt-2">metadata</Label>
              <div className="col-span-3 space-y-1">
                <Textarea className="font-mono text-xs min-h-[110px]" value={metadataText} onChange={(e) => setMetadataText(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  예) <span className="font-mono">{"{"}"family":"gpt-5","tier":"mini","source":"manual_preset"{"}"}</span> (JSON 객체)
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Simulator Dialog */}
      <Dialog open={isSimOpen} onOpenChange={setIsSimOpen}>
        <DialogContent className="sm:max-w-[820px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>모델 시뮬레이터</DialogTitle>
            <DialogDescription>
              선택한 모델로 실제 Provider API 호출을 테스트합니다. (해당 Provider의 공용 Credential이 등록되어 있어야 합니다.)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <span className="font-medium">{simModel?.provider_product_name || ""}</span>
                <span className="mx-2 text-muted-foreground">/</span>
                <span className="font-medium">{simModel?.display_name || ""}</span>
                <span className="mx-2 text-muted-foreground">({simModel?.model_id || ""})</span>
              </div>
              <div className="flex items-center gap-2">
                <Input className="w-[120px]" value={simMaxTokens} onChange={(e) => setSimMaxTokens(e.target.value)} placeholder="max_tokens" />
                <Button onClick={runSim} disabled={simRunning}>
                  {simRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  실행
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>입력</Label>
                <Textarea value={simInput} onChange={(e) => setSimInput(e.target.value)} className="min-h-[180px]" />
              </div>
              <div className="space-y-2">
                <Label>출력</Label>
                <Textarea value={simOutput} readOnly className="min-h-[180px]" />
                {simError ? <p className="text-sm text-destructive whitespace-pre-wrap">{simError}</p> : null}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsSimOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


