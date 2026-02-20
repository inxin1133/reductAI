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
import { AdminPage } from "@/components/layout/AdminPage"

type Purpose = "chat" | "image" | "video" | "audio" | "music" | "multimodal" | "embedding" | "code"

type ProviderRow = {
  id: string
  product_name: string
  slug: string
  api_base_url?: string | null
  provider_family?: string
  logo_key?: string | null
}
type ModelRow = { id: string; display_name: string; model_id: string; provider_id: string; model_type: string }

type ProfileRow = {
  id: string
  provider_id: string
  model_id: string | null
  profile_key: string
  purpose: Purpose
  auth_profile_id?: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
  transport?: unknown
  response_mapping?: unknown
  workflow?: unknown
}

type AuthProfileRow = {
  id: string
  provider_id: string
  profile_key: string
  auth_type: string
  credential_name?: string
  is_active: boolean
}

type ListResponse = { ok: boolean; total: number; limit: number; offset: number; rows: ProfileRow[] }

const API = "/api/ai/model-api-profiles"
const PROVIDERS_API = "/api/ai/providers"
const MODELS_API = "/api/ai/models"
const AUTH_PROFILES_API = "/api/ai/provider-auth-profiles"

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function jsonErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null
  const rec = json as Record<string, unknown>
  return typeof rec.message === "string" ? rec.message : null
}

function isActiveFilterValue(v: string): v is "all" | "true" | "false" {
  return v === "all" || v === "true" || v === "false"
}

function isOkObject(v: unknown): v is { ok: boolean } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false
  const rec = v as Record<string, unknown>
  return typeof rec.ok === "boolean"
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

function normalizePathForProviderBase(args: { baseUrl: string | null | undefined; path: string }) {
  const base = String(args.baseUrl || "").trim().replace(/\/+$/g, "")
  let p = String(args.path || "").trim()
  if (!p) p = "/"
  if (!p.startsWith("/")) p = `/${p}`

  // If provider base ends with /v1, avoid double /v1.
  if (base.toLowerCase().endsWith("/v1") && p.toLowerCase().startsWith("/v1/")) {
    return { normalizedPath: p.slice(3), changed: true }
  }
  return { normalizedPath: p, changed: false }
}

const PURPOSES: Purpose[] = ["chat", "image", "video", "audio", "music", "multimodal", "embedding", "code"]

export default function ModelApiProfiles() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [total, setTotal] = useState(0)

  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [models, setModels] = useState<ModelRow[]>([])
  const [authProfiles, setAuthProfiles] = useState<AuthProfileRow[]>([])
  const [authProfilesLoading, setAuthProfilesLoading] = useState(false)

  const [q, setQ] = useState("")
  const [providerFilter, setProviderFilter] = useState<string>("all")
  const [purposeFilter, setPurposeFilter] = useState<string>("all")
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "true" | "false">("all")
  const [page, setPage] = useState(0)
  const limit = 50

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProfileRow | null>(null)

  // form
  const [providerId, setProviderId] = useState("")
  const [modelId, setModelId] = useState<string>("__all__")
  const [profileKey, setProfileKey] = useState("")
  const [purpose, setPurpose] = useState<Purpose>("chat")
  const [authProfileId, setAuthProfileId] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [transportText, setTransportText] = useState(pretty({ kind: "http_json", method: "POST", path: "/", headers: {}, body: {} }))
  const [responseMappingText, setResponseMappingText] = useState(pretty({ result_type: "text", extract: { text_path: "" } }))
  const [workflowText, setWorkflowText] = useState(pretty({}))

  const providerNameById = useMemo(() => new Map(providers.map((p) => [p.id, `${p.product_name} (${p.slug})`] as const)), [providers])
  const modelNameById = useMemo(() => new Map(models.map((m) => [m.id, `${m.display_name} (${m.model_id})`] as const)), [models])
  const providerById = useMemo(() => new Map(providers.map((p) => [p.id, p] as const)), [providers])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (providerFilter !== "all") params.set("provider_id", providerFilter)
    if (purposeFilter !== "all") params.set("purpose", purposeFilter)
    if (isActiveFilter !== "all") params.set("is_active", isActiveFilter)
    return params.toString()
  }, [isActiveFilter, limit, page, providerFilter, purposeFilter, q])

  async function fetchProviders() {
    const res = await fetch(PROVIDERS_API)
    const json = (await res.json().catch(() => [])) as ProviderRow[]
    if (!res.ok) throw new Error("FAILED_PROVIDERS")
    setProviders((json || []).filter((p) => p && p.id))
  }

  async function fetchModels() {
    const res = await fetch(`${MODELS_API}?status=active`)
    const json = (await res.json().catch(() => [])) as ModelRow[]
    if (!res.ok) throw new Error("FAILED_MODELS")
    setModels((json || []).filter((m) => m && m.id))
  }

  async function fetchAuthProfilesForProvider(pid: string) {
    const provider = pid.trim()
    if (!provider) {
      setAuthProfiles([])
      return
    }
    setAuthProfilesLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("limit", "200")
      params.set("offset", "0")
      params.set("provider_id", provider)
      // include inactive too so existing profiles (even if OFF) can be displayed during edit
      const res = await fetch(`${AUTH_PROFILES_API}?${params.toString()}`)
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: AuthProfileRow[] }
      if (!res.ok || !json.ok) throw new Error("FAILED_AUTH_PROFILES")
      const next = (json.rows || []).filter((r) => r && r.id)
      setAuthProfiles(next)
      // Only clear AFTER we have the list (avoid clearing during the initial loading window).
      setAuthProfileId((cur) => {
        const v = String(cur || "").trim()
        if (!v) return ""
        return next.some((p) => p.id === v) ? v : ""
      })
    } catch (e) {
      console.warn(e)
      setAuthProfiles([])
    } finally {
      setAuthProfilesLoading(false)
    }
  }

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
    const rec = (json && typeof json === "object" && !Array.isArray(json)) ? (json as Record<string, unknown>) : {}
    const row = (rec.row as unknown) as ProfileRow | undefined
    if (!row) throw new Error("FAILED_GET")
    return row
  }

  function resetForm() {
    setEditing(null)
    setProviderId("")
    setModelId("__all__")
    setProfileKey("")
    setPurpose("chat")
    setAuthProfileId("")
    setIsActive(true)
    setTransportText(pretty({ kind: "http_json", method: "POST", path: "/", headers: {}, body: {} }))
    setResponseMappingText(pretty({ result_type: "text", extract: { text_path: "" } }))
    setWorkflowText(pretty({}))
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  async function openEdit(r: ProfileRow) {
    try {
      const full = await fetchDetail(r.id)
      setEditing(full)
      setProviderId(String(full.provider_id || ""))
      setModelId(full.model_id ? String(full.model_id) : "__all__")
      setProfileKey(String(full.profile_key || ""))
      setPurpose((full.purpose as Purpose) || "chat")
      setAuthProfileId(full.auth_profile_id ? String(full.auth_profile_id) : "")
      setIsActive(Boolean(full.is_active))
      setTransportText(pretty(full.transport ?? {}))
      setResponseMappingText(pretty(full.response_mapping ?? {}))
      setWorkflowText(pretty(full.workflow ?? {}))
      setOpen(true)
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  async function save() {
    const pid = providerId.trim()
    const pk = profileKey.trim()
    if (!pid) return alert("provider를 선택해 주세요.")
    if (!pk) return alert("profile_key를 입력해 주세요.")

    const transport = safeParseJsonObject(transportText)
    const response_mapping = safeParseJsonObject(responseMappingText)
    const workflow = safeParseJsonObject(workflowText)
    if (Object.keys(transport).length === 0) return alert("transport는 JSON object여야 합니다.")
    if (Object.keys(response_mapping).length === 0) return alert("response_mapping은 JSON object여야 합니다.")

    // Reduce /v1 confusion: if provider base already includes /v1, and path includes /v1 too, keep only one.
    const providerBaseUrl = providerById.get(pid)?.api_base_url
    if (typeof transport.path === "string") {
      const norm = normalizePathForProviderBase({ baseUrl: providerBaseUrl, path: transport.path })
      if (norm.changed) transport.path = norm.normalizedPath
    }

    const payload = {
      provider_id: pid,
      model_id: modelId === "__all__" ? null : modelId,
      profile_key: pk,
      purpose,
      auth_profile_id: authProfileId.trim() ? authProfileId.trim() : null,
      is_active: isActive,
      transport,
      response_mapping,
      workflow,
    }

    try {
      const isEdit = Boolean(editing?.id)
      const url = isEdit ? `${API}/${editing!.id}` : API
      const method = isEdit ? "PUT" : "POST"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({}))
      await fetchList()
      if (!res.ok || (isOkObject(json) && json.ok === false)) throw new Error(jsonErrorMessage(json) || "저장 실패")
      setOpen(false)
      resetForm()
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  async function remove(r: ProfileRow) {
    const ok = window.confirm(`"${r.profile_key}" 프로필을 삭제합니다. 계속할까요?`)
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
    void (async () => {
      try {
        await Promise.all([fetchProviders(), fetchModels()])
      } catch (e) {
        console.warn(e)
      }
    })()
  }, [])

  // load auth profiles for selected provider while editing/creating
  useEffect(() => {
    if (!open) return
    void fetchAuthProfilesForProvider(providerId)
  }, [open, providerId])

  useEffect(() => {
    void fetchList()
    // fetchList is defined inline and changes every render; we intentionally key this effect off queryString only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  const modelsForProvider = useMemo(() => {
    if (!providerId.trim()) return []
    return models.filter((m) => m.provider_id === providerId.trim())
  }, [models, providerId])

  const selectedProvider = providerById.get(providerId.trim())
  const selectedProviderBaseUrl = selectedProvider?.api_base_url ? String(selectedProvider.api_base_url) : ""
  const transportPreview = useMemo(() => {
    const t = safeParseJsonObject(transportText)
    const rawPath = typeof t.path === "string" ? t.path : ""
    const normalized = normalizePathForProviderBase({ baseUrl: selectedProviderBaseUrl, path: rawPath })
    const base = selectedProviderBaseUrl.trim().replace(/\/+$/g, "")
    const urlPreview = base && normalized.normalizedPath ? `${base}${normalized.normalizedPath}` : ""
    return { providerBaseUrl: selectedProviderBaseUrl, rawPath, normalizedPath: normalized.normalizedPath, changed: normalized.changed, urlPreview }
  }, [selectedProviderBaseUrl, transportText])

  return (
    <AdminPage
      headerContent={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchList()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">프로필 추가</span>
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">AI 서비스 - Model API Profiles</div>
          <div className="text-sm text-muted-foreground">
            Provider/모달리티별 호출(transport)과 응답 매핑(response_mapping)을 DB로 관리합니다. (표준안: <span className="font-mono">document/model_api_profiles_standard.md</span>)
          </div>
        </div>
        <div className="flex gap-2" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setPage(0)
            setQ(e.target.value)
          }}
          placeholder="profile_key 검색"
          className="w-[280px]"
        />
        <Select
          value={providerFilter}
          onValueChange={(v) => {
            setPage(0)
            setProviderFilter(v)
          }}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="provider(전체)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">provider(전체)</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.product_name} ({p.slug})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={purposeFilter}
          onValueChange={(v) => {
            setPage(0)
            setPurposeFilter(v)
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="purpose(전체)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">purpose(전체)</SelectItem>
            {PURPOSES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={isActiveFilter}
          onValueChange={(v) => {
            setPage(0)
            setIsActiveFilter(isActiveFilterValue(v) ? v : "all")
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="활성(전체)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">활성(전체)</SelectItem>
            <SelectItem value="true">활성</SelectItem>
            <SelectItem value="false">비활성</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">Profile Key</TableHead>
              <TableHead className="min-w-[220px]">Provider</TableHead>
              <TableHead className="min-w-[260px]">Model</TableHead>
              <TableHead className="min-w-[120px]">Purpose</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="min-w-[170px]">Updated</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  등록된 프로필이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.profile_key}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.id}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{providerNameById.get(r.provider_id) || r.provider_id}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {r.model_id ? modelNameById.get(r.model_id) || r.model_id : <span className="text-muted-foreground">공용(ALL)</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.purpose}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "ON" : "OFF"}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.updated_at ? new Date(r.updated_at).toLocaleString() : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => void openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => void remove(r)}>
                        <Trash2 className="h-4 w-4" />
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
          <Button variant="outline" disabled={page <= 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            이전
          </Button>
          <Button variant="outline" disabled={(page + 1) * limit >= total || loading} onClick={() => setPage((p) => p + 1)}>
            다음
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Model API Profile 수정" : "Model API Profile 추가"}</DialogTitle>
            <DialogDescription>
              transport/response_mapping JSON은 표준안(v1)에 맞게 작성하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>provider</Label>
              <Select value={providerId || "none"} onValueChange={(v) => setProviderId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="provider 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택</SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.product_name} ({p.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>model (optional)</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger>
                  <SelectValue placeholder="공용(ALL) / 모델 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">공용(ALL)</SelectItem>
                  {modelsForProvider.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name} ({m.model_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">공용 프로필은 model_id를 비워두세요.</div>
            </div>

            <div className="space-y-2">
              <Label>profile_key</Label>
              <Input value={profileKey} onChange={(e) => setProfileKey(e.target.value)} placeholder="예: openai.images.generate.v1" />
            </div>

            <div className="space-y-2">
              <Label>purpose</Label>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as Purpose)}>
                <SelectTrigger>
                  <SelectValue placeholder="purpose" />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>auth_profile_id (optional)</Label>
              <Select value={authProfileId || "__none__"} onValueChange={(v) => setAuthProfileId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="없음(NULL) / 인증 프로필 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">없음(NULL)</SelectItem>
                  {authProfilesLoading ? (
                    authProfileId.trim() ? (
                      <SelectItem value={authProfileId} disabled>
                        현재 선택됨: {authProfileId}
                      </SelectItem>
                    ) : null
                  ) : null}
                  {authProfilesLoading ? (
                    <SelectItem value="__loading__" disabled>
                      로딩 중...
                    </SelectItem>
                  ) : authProfiles.length === 0 ? (
                    <SelectItem value="__empty__" disabled>
                      (해당 provider의 인증 프로필이 없습니다)
                    </SelectItem>
                  ) : (
                    authProfiles.map((ap) => (
                      <SelectItem key={ap.id} value={ap.id} disabled={!ap.is_active && ap.id !== authProfileId}>
                        {ap.profile_key} ({ap.auth_type}
                        {ap.credential_name ? ` / ${ap.credential_name}` : ""})
                        {!ap.is_active ? " [OFF]" : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Google Vertex(SA/OAuth2) 같은 경우 이 값을 설정해야 <span className="font-mono">Bearer {"{{accessToken}}"}</span>이 동작합니다.
                <span className="ml-2">
                  (없으면 <span className="font-mono">api_key</span> 방식만 가능)
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                인증 프로필은 <span className="font-mono">/admin/ai/provider-auth-profiles</span>에서 생성/관리합니다.
              </div>
            </div>

            <div className="space-y-2">
              <Label>is_active</Label>
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={(v) => setIsActive(v)} />
                <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "ON" : "OFF"}</Badge>
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>transport (JSON)</Label>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  provider api_base_url: <span className="font-mono">{transportPreview.providerBaseUrl || "-"}</span>
                </div>
                <div>
                  가이드: base가 <span className="font-mono">/v1</span>로 끝나면 path는 <span className="font-mono">/v1</span> 없이 쓰는 것을 권장합니다.
                </div>
                {transportPreview.rawPath ? (
                  <div>
                    path: <span className="font-mono">{transportPreview.rawPath}</span>
                    {transportPreview.changed ? (
                      <span className="ml-2 text-amber-600">
                        (정규화 미리보기: <span className="font-mono">{transportPreview.normalizedPath}</span>)
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {transportPreview.urlPreview ? (
                  <div>
                    effective url preview: <span className="font-mono">{transportPreview.urlPreview}</span>
                  </div>
                ) : null}
              </div>
              <Textarea value={transportText} onChange={(e) => setTransportText(e.target.value)} className="min-h-[220px]" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>response_mapping (JSON)</Label>
              <Textarea value={responseMappingText} onChange={(e) => setResponseMappingText(e.target.value)} className="min-h-[180px]" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>workflow (JSON)</Label>
              <Textarea value={workflowText} onChange={(e) => setWorkflowText(e.target.value)} className="min-h-[120px]" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void save()}>{editing ? "수정 저장" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}


