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
import { Loader2, Pencil, Plus, Search, Trash2, Link2 } from "lucide-react"

type TenantType = "personal" | "team" | "group"
type AccessStatus = "active" | "inactive" | "suspended"
type AccessLevel = "standard" | "premium" | "enterprise"

interface Model {
  id: string
  provider_id: string
  provider_product_name?: string
  provider_slug?: string
  display_name: string
  model_id: string
  model_type: string
  context_window?: number | null
  status: string
  is_available: boolean
}

interface Credential {
  id: string
  provider_id: string
  credential_name: string
  provider_product_name?: string
  provider_slug?: string
  is_active: boolean
  is_default: boolean
  api_key_masked?: string | null
}

interface TypeModelAccessRow {
  id: string
  tenant_type: TenantType
  model_id: string
  credential_id?: string | null
  status: AccessStatus
  access_level: AccessLevel
  priority: number
  is_preferred: boolean
  rate_limit_per_minute?: number | null
  rate_limit_per_day?: number | null
  max_tokens_per_request?: number | null
  allowed_features?: unknown
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string

  // join 표시용
  model_display_name?: string
  model_api_id?: string
  model_type?: string
  context_window?: number | null
  provider_product_name?: string
  provider_slug?: string
  credential_name?: string | null
}

const MODELS_API_URL = "/api/ai/models"
const CREDENTIALS_API_URL = "/api/ai/credentials"
const TYPE_MODEL_ACCESS_API_URL = "/api/ai/model-access-by-type"
const NONE_SELECT_VALUE = "__none__"

async function tryFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const contentType = res.headers.get("content-type") || ""
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!contentType.includes("application/json")) throw new Error("NOT_JSON")
  return (await res.json()) as T
}

export default function TenantTypeModelAccess() {
  const { setAction } = useAdminHeaderActionContext()

  const [selectedType, setSelectedType] = useState<TenantType>("personal")
  const [models, setModels] = useState<Model[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [rows, setRows] = useState<TypeModelAccessRow[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState("")

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TypeModelAccessRow | null>(null)
  const [allowedFeaturesText, setAllowedFeaturesText] = useState<string>("[]")
  const [metadataText, setMetadataText] = useState<string>("{}")

  const [formData, setFormData] = useState<{
    model_id: string
    credential_id: string
    status: AccessStatus
    access_level: AccessLevel
    priority: string
    is_preferred: boolean
    rate_limit_per_minute: string
    rate_limit_per_day: string
    max_tokens_per_request: string
  }>({
    model_id: "",
    credential_id: "",
    status: "active",
    access_level: "standard",
    priority: "0",
    is_preferred: false,
    rate_limit_per_minute: "",
    rate_limit_per_day: "",
    max_tokens_per_request: "",
  })

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchModels = async () => {
    const data = await tryFetchJson<Model[]>(MODELS_API_URL, { headers: { ...authHeaders() } })
    setModels(data)
  }

  const fetchCredentials = async () => {
    const data = await tryFetchJson<unknown>(CREDENTIALS_API_URL, { headers: { ...authHeaders() } })
    if (!Array.isArray(data)) {
      setCredentials([])
      return
    }
    const normalized: Credential[] = (data as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id || ""),
      provider_id: String(c.provider_id || ""),
      credential_name: String(c.credential_name || ""),
      provider_product_name: typeof c.provider_product_name === "string" ? c.provider_product_name : undefined,
      provider_slug: typeof c.provider_slug === "string" ? c.provider_slug : undefined,
      is_active: Boolean(c.is_active),
      is_default: Boolean(c.is_default),
      api_key_masked: typeof c.api_key_masked === "string" ? c.api_key_masked : null,
    }))
    setCredentials(normalized.filter((c) => c.id && c.provider_id && c.credential_name))
  }

  const fetchRows = async (tenantType: TenantType) => {
    const data = await tryFetchJson<TypeModelAccessRow[]>(
      `${TYPE_MODEL_ACCESS_API_URL}?tenant_type=${encodeURIComponent(tenantType)}`,
      { headers: { ...authHeaders() } }
    )
    setRows(data)
  }

  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      try {
        await Promise.all([fetchModels(), fetchCredentials()])
        await fetchRows(selectedType)
      } finally {
        setIsLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchRows(selectedType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = `${r.provider_product_name || ""} ${r.provider_slug || ""} ${r.model_display_name || ""} ${r.model_api_id || ""} ${r.status} ${r.access_level}`.toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  const selectedModel = useMemo(() => models.find((m) => m.id === formData.model_id) || null, [models, formData.model_id])
  const credentialOptions = useMemo(() => {
    if (!selectedModel) return credentials
    return credentials.filter((c) => c.provider_id === selectedModel.provider_id)
  }, [credentials, selectedModel])

  const handleCreate = () => {
    setEditing(null)
    setFormData({
      model_id: models[0]?.id || "",
      credential_id: "",
      status: "active",
      access_level: "standard",
      priority: "0",
      is_preferred: false,
      rate_limit_per_minute: "",
      rate_limit_per_day: "",
      max_tokens_per_request: "",
    })
    setAllowedFeaturesText("[]")
    setMetadataText("{}")
    setIsDialogOpen(true)
  }

  useEffectReact(() => {
    setAction(
      <Button onClick={handleCreate} size="sm">
        <Plus className="mr-2 h-4 w-4" /> 정책 추가
      </Button>
    )
    return () => setAction(null)
  }, [setAction, models])

  const handleEdit = (row: TypeModelAccessRow) => {
    setEditing(row)
    setFormData({
      model_id: row.model_id,
      credential_id: row.credential_id || "",
      status: row.status,
      access_level: row.access_level,
      priority: String(row.priority ?? 0),
      is_preferred: !!row.is_preferred,
      rate_limit_per_minute: row.rate_limit_per_minute?.toString() ?? "",
      rate_limit_per_day: row.rate_limit_per_day?.toString() ?? "",
      max_tokens_per_request: row.max_tokens_per_request?.toString() ?? "",
    })
    setAllowedFeaturesText(JSON.stringify(row.allowed_features ?? [], null, 2))
    setMetadataText(JSON.stringify(row.metadata ?? {}, null, 2))
    setIsDialogOpen(true)
  }

  const validateJson = () => {
    try {
      const af = JSON.parse(allowedFeaturesText || "[]")
      if (!Array.isArray(af)) return "allowed_features는 JSON 배열이어야 합니다. 예) [\"chat\",\"vision\"]"
    } catch {
      return "allowed_features JSON 형식이 올바르지 않습니다."
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
    if (!formData.model_id) {
      alert("모델을 선택해주세요.")
      return
    }
    const err = validateJson()
    if (err) {
      alert(err)
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        tenant_type: selectedType,
        model_id: formData.model_id,
        credential_id: formData.credential_id || null,
        status: formData.status,
        access_level: formData.access_level,
        priority: Number(formData.priority || 0),
        is_preferred: !!formData.is_preferred,
        rate_limit_per_minute: formData.rate_limit_per_minute ? Number(formData.rate_limit_per_minute) : null,
        rate_limit_per_day: formData.rate_limit_per_day ? Number(formData.rate_limit_per_day) : null,
        max_tokens_per_request: formData.max_tokens_per_request ? Number(formData.max_tokens_per_request) : null,
        allowed_features: JSON.parse(allowedFeaturesText || "[]"),
        metadata: JSON.parse(metadataText || "{}"),
      }

      if (editing) {
        await tryFetchJson(`${TYPE_MODEL_ACCESS_API_URL}/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        })
      } else {
        await tryFetchJson(TYPE_MODEL_ACCESS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        })
      }

      setIsDialogOpen(false)
      await fetchRows(selectedType)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "알 수 없는 오류"
      alert(`저장 실패: ${msg}`)
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (row: TypeModelAccessRow) => {
    if (!confirm(`정말 삭제하시겠습니까?\n- ${row.provider_product_name || ""} / ${row.model_display_name || row.model_id}`)) return
    try {
      await fetch(`${TYPE_MODEL_ACCESS_API_URL}/${row.id}`, { method: "DELETE", headers: { ...authHeaders() } })
      await fetchRows(selectedType)
    } catch (e) {
      console.error(e)
      alert("삭제 중 오류가 발생했습니다.")
    }
  }

  const statusBadge = (status: AccessStatus) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>
      case "suspended":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Suspended</Badge>
    }
  }

  return (
    <div className="space-y-4 bg-background">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            테넌트 개별이 아니라, <b>테넌트 유형(personal/team/group)</b> 별로 제공할 AI 모델 접근 권한을 관리합니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-[220px]">
          <Select value={selectedType} onValueChange={(v: TenantType) => setSelectedType(v)}>
            <SelectTrigger>
              <SelectValue placeholder="테넌트 유형 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">personal</SelectItem>
              <SelectItem value="team">team</SelectItem>
              <SelectItem value="group">group</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="모델/프로바이더/상태 검색..."
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
              <TableHead>제공업체</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>레벨</TableHead>
              <TableHead>우선순위</TableHead>
              <TableHead>Preferred</TableHead>
              <TableHead>Credential</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  등록된 정책이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{r.model_display_name || "-"}</span>
                      <span className="text-xs text-muted-foreground">{r.model_api_id || ""}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {r.provider_slug || "-"}
                    </Badge>
                    <div className="text-xs text-muted-foreground">{r.provider_product_name || ""}</div>
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.access_level}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.priority}</Badge>
                  </TableCell>
                  <TableCell>{r.is_preferred ? <Badge>Yes</Badge> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="max-w-[240px] truncate" title={r.credential_name || ""}>
                    {r.credential_name ? (
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <span>{r.credential_name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">미지정</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(r)}>
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "정책 수정" : "정책 추가"}</DialogTitle>
            <DialogDescription>
              선택한 테넌트 유형에 대해 제공할 모델과 접근 정책을 설정합니다. (Credential은 공용 키만 연결됩니다.)
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="model_id" className="text-right">
                모델
              </Label>
              <Select
                value={formData.model_id}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, model_id: value, credential_id: "" }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="모델 선택" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.provider_product_name} / {m.display_name} ({m.model_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="credential_id" className="text-right">
                Credential
              </Label>
              <Select
                value={formData.credential_id ? formData.credential_id : NONE_SELECT_VALUE}
                onValueChange={(value) =>
                  setFormData((p) => ({ ...p, credential_id: value === NONE_SELECT_VALUE ? "" : value }))
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="(선택) 공용 Credential 연결" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECT_VALUE}>미지정</SelectItem>
                  {credentialOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.credential_name} {c.is_default ? "(default)" : ""} {c.api_key_masked ? `- ${c.api_key_masked}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                상태
              </Label>
              <Select value={formData.status} onValueChange={(value: AccessStatus) => setFormData((p) => ({ ...p, status: value }))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="inactive">inactive</SelectItem>
                  <SelectItem value="suspended">suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="access_level" className="text-right">
                레벨
              </Label>
              <Select value={formData.access_level} onValueChange={(value: AccessLevel) => setFormData((p) => ({ ...p, access_level: value }))}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="레벨 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">standard</SelectItem>
                  <SelectItem value="premium">premium</SelectItem>
                  <SelectItem value="group">group</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priority" className="text-right">
                우선순위
              </Label>
              <Input
                id="priority"
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData((p) => ({ ...p, priority: e.target.value }))}
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_preferred" className="text-right">
                Preferred
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Switch
                  id="is_preferred"
                  checked={formData.is_preferred}
                  onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_preferred: checked }))}
                />
                <span className="text-xs text-muted-foreground">유형별 기본 선택 모델(1개 권장)</span>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rate_limit_per_minute" className="text-right">
                분당 제한
              </Label>
              <Input
                id="rate_limit_per_minute"
                type="number"
                value={formData.rate_limit_per_minute}
                onChange={(e) => setFormData((p) => ({ ...p, rate_limit_per_minute: e.target.value }))}
                className="col-span-3"
                placeholder="선택"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rate_limit_per_day" className="text-right">
                일일 제한
              </Label>
              <Input
                id="rate_limit_per_day"
                type="number"
                value={formData.rate_limit_per_day}
                onChange={(e) => setFormData((p) => ({ ...p, rate_limit_per_day: e.target.value }))}
                className="col-span-3"
                placeholder="선택"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max_tokens_per_request" className="text-right">
                요청당 토큰
              </Label>
              <Input
                id="max_tokens_per_request"
                type="number"
                value={formData.max_tokens_per_request}
                onChange={(e) => setFormData((p) => ({ ...p, max_tokens_per_request: e.target.value }))}
                className="col-span-3"
                placeholder="선택"
              />
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="allowed_features" className="text-right pt-2">
                기능
              </Label>
              <Textarea
                id="allowed_features"
                value={allowedFeaturesText}
                onChange={(e) => setAllowedFeaturesText(e.target.value)}
                className="col-span-3 font-mono text-xs min-h-[110px]"
                placeholder='예: ["chat","completion"]'
              />
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="metadata" className="text-right pt-2">
                Metadata
              </Label>
              <Textarea
                id="metadata"
                value={metadataText}
                onChange={(e) => setMetadataText(e.target.value)}
                className="col-span-3 font-mono text-xs min-h-[110px]"
                placeholder='예: {"notes":"type policy"}'
              />
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
    </div>
  )
}


