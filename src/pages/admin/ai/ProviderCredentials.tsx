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
import { Loader2, Pencil, Plus, Search, Trash2, KeyRound } from "lucide-react"

type ProviderStatus = "active" | "inactive" | "deprecated"

interface AIProvider {
  id: string
  name: string
  display_name: string
  slug: string
  status: ProviderStatus
  is_verified: boolean
  api_base_url?: string | null
}

interface ProviderCredential {
  id: string
  tenant_id?: string
  provider_id: string
  credential_name: string
  // ⚠️ 백엔드에서는 반드시 암호화 저장해야 합니다. (schema_models.sql 참고)
  // - API 연동 시: 서버가 평문을 내려주지 않으므로 api_key_masked만 내려옵니다.
  // - localStorage fallback 시: 데모/개발 편의를 위해 api_key를 저장합니다(운영에서는 금지).
  api_key?: string
  api_key_masked?: string | null
  api_key_last4?: string | null
  endpoint_url?: string | null
  organization_id?: string | null
  is_active: boolean
  is_default: boolean
  rate_limit_per_minute?: number | null
  rate_limit_per_day?: number | null
  metadata?: Record<string, unknown> | null
  expires_at?: string | null
  created_at: string
  updated_at: string

  // 서버 응답(join 결과)에서만 존재할 수 있는 표시용 필드
  tenant_name?: string
  tenant_slug?: string
  provider_display_name?: string
  provider_slug?: string
}

const PROVIDERS_API_URL = "/api/ai/providers"
const CREDENTIALS_API_URL = "/api/ai/credentials"

const LOCAL_STORAGE_PROVIDERS_KEY = "admin_ai_providers"
const LOCAL_STORAGE_CREDENTIALS_KEY = "admin_provider_api_credentials"

function nowIso() {
  return new Date().toISOString()
}

function safeUuid() {
  try {
    return crypto.randomUUID()
  } catch {
    return `tmp_${Math.random().toString(16).slice(2)}_${Date.now()}`
  }
}

async function tryFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const contentType = res.headers.get("content-type") || ""
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!contentType.includes("application/json")) throw new Error("NOT_JSON")
  return (await res.json()) as T
}

function seedProviders(): AIProvider[] {
  return [
    { id: safeUuid(), name: "openai", display_name: "OpenAI", slug: "openai", status: "active", is_verified: true, api_base_url: "https://api.openai.com/v1" },
    { id: safeUuid(), name: "anthropic", display_name: "Anthropic", slug: "anthropic", status: "active", is_verified: true, api_base_url: "https://api.anthropic.com" },
    { id: safeUuid(), name: "google", display_name: "Google", slug: "google", status: "active", is_verified: true, api_base_url: "https://generativelanguage.googleapis.com" },
  ]
}

function loadProvidersFromLocalStorage(): AIProvider[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_PROVIDERS_KEY)
  if (!raw) {
    const seeded = seedProviders()
    localStorage.setItem(LOCAL_STORAGE_PROVIDERS_KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as AIProvider[]
  } catch {
    // ignore
  }
  const seeded = seedProviders()
  localStorage.setItem(LOCAL_STORAGE_PROVIDERS_KEY, JSON.stringify(seeded))
  return seeded
}

function loadCredentialsFromLocalStorage(): ProviderCredential[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_CREDENTIALS_KEY)
  if (!raw) {
    localStorage.setItem(LOCAL_STORAGE_CREDENTIALS_KEY, JSON.stringify([]))
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as ProviderCredential[]
  } catch {
    // ignore
  }
  localStorage.setItem(LOCAL_STORAGE_CREDENTIALS_KEY, JSON.stringify([]))
  return []
}

function saveCredentialsToLocalStorage(next: ProviderCredential[]) {
  localStorage.setItem(LOCAL_STORAGE_CREDENTIALS_KEY, JSON.stringify(next))
}

function maskApiKey(key: string) {
  const k = key || ""
  if (k.length <= 4) return "••••"
  return `••••••••••${k.slice(-4)}`
}

function displayMaskedKey(c: ProviderCredential) {
  if (c.api_key_masked) return c.api_key_masked
  if (c.api_key) return maskApiKey(c.api_key)
  return "••••"
}

type CredentialUpsertPayload = {
  provider_id: string
  credential_name: string
  api_key?: string
  endpoint_url: string | null
  organization_id: string | null
  is_active: boolean
  is_default: boolean
  rate_limit_per_minute: number | null
  rate_limit_per_day: number | null
  expires_at: string | null
  metadata: Record<string, unknown>
}

export default function ProviderCredentials() {
  const { setAction } = useAdminHeaderActionContext()

  const [providers, setProviders] = useState<AIProvider[]>([])
  const [credentials, setCredentials] = useState<ProviderCredential[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // 검색(클라이언트 필터)
  const [search, setSearch] = useState("")

  // Dialog 상태
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCredential, setEditingCredential] = useState<ProviderCredential | null>(null)
  const [metadataText, setMetadataText] = useState<string>("{}")

  // api_key는 보안상 리스트/상태에 오래 들고 있지 않도록 별도 상태로 관리
  const [apiKeyInput, setApiKeyInput] = useState<string>("")

  const [formData, setFormData] = useState<{
    provider_id: string
    credential_name: string
    endpoint_url: string
    organization_id: string
    is_active: boolean
    is_default: boolean
    rate_limit_per_minute: string
    rate_limit_per_day: string
    expires_at: string
  }>({
    provider_id: "",
    credential_name: "",
    endpoint_url: "",
    organization_id: "",
    is_active: true,
    is_default: false,
    rate_limit_per_minute: "",
    rate_limit_per_day: "",
    expires_at: "",
  })

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchProviders = async () => {
    try {
      const data = await tryFetchJson<AIProvider[]>(PROVIDERS_API_URL, { headers: { ...authHeaders() } })
      setProviders(data)
    } catch (e) {
      setProviders(loadProvidersFromLocalStorage())
      console.warn("[Admin Credentials] providers API 실패로 localStorage fallback 사용:", e)
    }
  }

  const fetchCredentials = async () => {
    try {
      // API 우선: ai-agent-service에서 provider_api_credentials를 조회
      const data = await tryFetchJson<ProviderCredential[]>(CREDENTIALS_API_URL, {
        headers: { ...authHeaders() },
      })
      setCredentials(data)
    } catch (e) {
      // API 미연동/실패 시 localStorage fallback 사용
      const local = loadCredentialsFromLocalStorage()
      setCredentials(local)
      console.warn("[Admin Credentials] credentials API 실패로 localStorage fallback 사용:", e)
    }
  }

  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      await Promise.all([fetchProviders()])
      await fetchCredentials()
      setIsLoading(false)
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const providerNameById = useMemo(() => {
    const map = new Map<string, string>()
    providers.forEach((p) => map.set(p.id, p.display_name))
    return map
  }, [providers])

  const providerSlugById = useMemo(() => {
    const map = new Map<string, string>()
    providers.forEach((p) => map.set(p.id, p.slug))
    return map
  }, [providers])

  const filteredCredentials = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return credentials
    return credentials.filter((c) => {
      const providerName = providerNameById.get(c.provider_id) || ""
      const providerSlug = providerSlugById.get(c.provider_id) || ""
      const hay = `${providerName} ${providerSlug} ${c.credential_name} ${c.endpoint_url || ""} ${c.organization_id || ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [credentials, providerNameById, providerSlugById, search])

  const handleCreate = () => {
    setEditingCredential(null)
    setFormData({
      provider_id: providers[0]?.id || "",
      credential_name: "",
      endpoint_url: "",
      organization_id: "",
      is_active: true,
      is_default: false,
      rate_limit_per_minute: "",
      rate_limit_per_day: "",
      expires_at: "",
    })
    setApiKeyInput("")
    setMetadataText("{}")
    setIsDialogOpen(true)
  }

  // 헤더 액션 등록 (API Key 추가 버튼)
  useEffectReact(() => {
    setAction(
      <Button onClick={handleCreate} size="sm">
        <Plus className="mr-2 h-4 w-4" /> API Key 추가
      </Button>
    )
    return () => setAction(null)
  }, [setAction, providers])

  const handleEdit = (cred: ProviderCredential) => {
    setEditingCredential(cred)
    setFormData({
      provider_id: cred.provider_id,
      credential_name: cred.credential_name,
      endpoint_url: cred.endpoint_url || "",
      organization_id: cred.organization_id || "",
      is_active: cred.is_active,
      is_default: cred.is_default,
      rate_limit_per_minute: cred.rate_limit_per_minute?.toString() ?? "",
      rate_limit_per_day: cred.rate_limit_per_day?.toString() ?? "",
      expires_at: cred.expires_at ? cred.expires_at.slice(0, 10) : "",
    })
    // 수정 시에는 보안을 위해 api_key를 미리 채우지 않습니다.
    setApiKeyInput("")
    setMetadataText(JSON.stringify(cred.metadata || {}, null, 2))
    setIsDialogOpen(true)
  }

  const validateForm = () => {
    if (!formData.provider_id) return "제공업체를 선택해주세요."
    if (!formData.credential_name.trim()) return "인증 정보 이름(credential_name)을 입력해주세요."

    // 생성 시에는 API Key 필수
    if (!editingCredential && !apiKeyInput.trim()) return "API Key를 입력해주세요."

    // metadata JSON 검증
    try {
      const parsed = JSON.parse(metadataText || "{}")
      if (parsed !== null && typeof parsed !== "object") return "metadata는 JSON 객체여야 합니다. 예) {}"
    } catch {
      return "metadata JSON 형식이 올바르지 않습니다."
    }

    // 같은 tenant+provider에서 is_default는 1개만 허용(스키마 제약 반영)
    if (formData.is_default) {
      const existsOtherDefault = credentials.some(
        (c) =>
          c.provider_id === formData.provider_id &&
          c.is_default &&
          c.id !== editingCredential?.id
      )
      if (existsOtherDefault) {
        // UX상 자동으로 기존 default를 해제하는 방식으로 처리할 수도 있지만,
        // 의도치 않은 변경을 막기 위해 사용자 확인을 받습니다.
        if (!confirm("같은 테넌트/제공업체에 이미 기본(Default) 인증 정보가 있습니다.\n기존 Default를 해제하고 현재 항목을 Default로 설정할까요?")) {
          return "Default 설정을 취소했습니다."
        }
      }
    }

    return null
  }

  // 공용 키이므로 provider 단위로만 default 1개를 유지합니다.
  const applyDefaultUniqueness = (list: ProviderCredential[], nextDefaultId: string, providerId: string) => {
    return list.map((c) => {
      if (c.provider_id === providerId) {
        return { ...c, is_default: c.id === nextDefaultId }
      }
      return c
    })
  }

  const handleSubmit = async () => {
    const err = validateForm()
    if (err) {
      // "Default 설정을 취소했습니다." 같은 메시지는 alert로 보여주기 애매하니 그냥 종료
      if (err !== "Default 설정을 취소했습니다.") alert(err)
      return
    }

    setIsSaving(true)
    try {
      const meta = JSON.parse(metadataText || "{}") as Record<string, unknown>

      // API에 보낼 payload (백엔드는 api_key를 받으면 암호화 저장)
      const basePayload: CredentialUpsertPayload = {
        provider_id: formData.provider_id,
        credential_name: formData.credential_name.trim(),
        endpoint_url: formData.endpoint_url.trim() || null,
        organization_id: formData.organization_id.trim() || null,
        is_active: formData.is_active,
        is_default: formData.is_default,
        rate_limit_per_minute: formData.rate_limit_per_minute ? Number(formData.rate_limit_per_minute) : null,
        rate_limit_per_day: formData.rate_limit_per_day ? Number(formData.rate_limit_per_day) : null,
        expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
        metadata: meta,
      }

      // 수정 시 api_key는 "입력했을 때만" 전송 (미입력 시 기존 키 유지)
      if (apiKeyInput.trim()) {
        basePayload.api_key = apiKeyInput.trim()
      }

      // --- API 우선 저장 시도 ---
      try {
        if (editingCredential) {
          await tryFetchJson<ProviderCredential>(`${CREDENTIALS_API_URL}/${editingCredential.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(basePayload),
          })
        } else {
          // 생성 시에는 api_key 필수
          if (!basePayload.api_key) {
            alert("API Key를 입력해주세요.")
            return
          }
          await tryFetchJson<ProviderCredential>(CREDENTIALS_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(basePayload),
          })
        }

        setIsDialogOpen(false)
        // 서버 기준으로 목록 갱신
        await fetchCredentials()
        return
      } catch (e) {
        // --- API 실패 시 localStorage fallback ---
        console.warn("[Admin Credentials] 저장 API 실패로 localStorage fallback 사용:", e)
      }

      // --- localStorage fallback 저장 ---
      if (editingCredential) {
        const next = credentials.map((c) => {
          if (c.id !== editingCredential.id) return c
          return {
            ...c,
            ...basePayload,
            api_key: apiKeyInput.trim() ? apiKeyInput.trim() : c.api_key,
            updated_at: nowIso(),
          } as ProviderCredential
        })

        const nextWithDefault =
          basePayload.is_default
            ? applyDefaultUniqueness(next, editingCredential.id, basePayload.provider_id)
            : next

        setCredentials(nextWithDefault)
        saveCredentialsToLocalStorage(nextWithDefault)
        setIsDialogOpen(false)
        return
      }

      // Create (fallback)
      const t = nowIso()
      const created: ProviderCredential = {
        id: safeUuid(),
        ...basePayload,
        api_key: apiKeyInput.trim(),
        created_at: t,
        updated_at: t,
      }

      let next = [created, ...credentials]
      if (basePayload.is_default) {
        next = applyDefaultUniqueness(next, created.id, basePayload.provider_id)
      }

      setCredentials(next)
      saveCredentialsToLocalStorage(next)
      setIsDialogOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (cred: ProviderCredential) => {
    const providerName = providerNameById.get(cred.provider_id) || cred.provider_id
    if (!confirm(`정말 삭제하시겠습니까?\n- ${providerName}\n- ${cred.credential_name}`)) return

    // API 우선 삭제 시도
    try {
      await fetch(`${CREDENTIALS_API_URL}/${cred.id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      await fetchCredentials()
      return
    } catch (e) {
      console.warn("[Admin Credentials] 삭제 API 실패로 localStorage fallback 사용:", e)
      const next = credentials.filter((c) => c.id !== cred.id)
      setCredentials(next)
      saveCredentialsToLocalStorage(next)
    }
  }

  const statusBadge = (isActive: boolean) => {
    return isActive ? (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
    ) : (
      <Badge variant="secondary">Inactive</Badge>
    )
  }

  return (
    <div className="space-y-4 bg-background">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            서비스 전체에서 공용으로 사용할 AI 제공업체 API Key(credential)를 관리합니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="제공업체/이름/엔드포인트 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[420px]"
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
              <TableHead>제공업체</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>API Key</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>만료</TableHead>
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
            ) : filteredCredentials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  등록된 인증 정보가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredCredentials.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {c.provider_slug || providerSlugById.get(c.provider_id) || c.provider_id}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {c.provider_display_name || providerNameById.get(c.provider_id) || ""}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={c.credential_name}>
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      {c.credential_name}
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(c.is_active)}</TableCell>
                  <TableCell>{c.is_default ? <Badge>Default</Badge> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="font-mono text-xs">{displayMaskedKey(c)}</TableCell>
                  <TableCell className="max-w-[260px] truncate" title={c.endpoint_url || ""}>
                    {c.endpoint_url || "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(c)}>
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
        <DialogContent className="sm:max-w-[680px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCredential ? "API Key 수정" : "API Key 추가"}</DialogTitle>
            <DialogDescription>
              서비스 전체 공용 인증 정보를 등록합니다. (API Key는 보안을 위해 화면에 마스킹 처리됩니다.)
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="provider_id" className="text-right">
                제공업체
              </Label>
              <Select
                value={formData.provider_id}
                onValueChange={(value) => setFormData({ ...formData, provider_id: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="제공업체 선택" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name} ({p.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="credential_name" className="text-right">
                이름
              </Label>
              <Input
                id="credential_name"
                value={formData.credential_name}
                onChange={(e) => setFormData({ ...formData, credential_name: e.target.value })}
                className="col-span-3"
                placeholder="예: Production Key"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="api_key" className="text-right">
                API Key
              </Label>
              <div className="col-span-3 space-y-1">
                <Input
                  id="api_key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={editingCredential ? "(변경 시에만 입력)" : "예: sk-..."}
                />
                <p className="text-xs text-muted-foreground">
                  {/* 백엔드 구현 시 보안 메모 */}
                  백엔드 연동 시에는 API Key를 반드시 암호화하여 저장해야 합니다. (schema_models.sql: api_key_encrypted)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endpoint_url" className="text-right">
                Endpoint URL
              </Label>
              <Input
                id="endpoint_url"
                value={formData.endpoint_url}
                onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
                className="col-span-3"
                placeholder="커스텀 엔드포인트 (선택)"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="organization_id" className="text-right">
                Org ID
              </Label>
              <Input
                id="organization_id"
                value={formData.organization_id}
                onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                className="col-span-3"
                placeholder="OpenAI Organization ID 등 (선택)"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_active" className="text-right">
                활성
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <span className="text-xs text-muted-foreground">사용 가능한 인증 정보 여부</span>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_default" className="text-right">
                Default
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <span className="text-xs text-muted-foreground">
                  같은 테넌트/제공업체 내에서 기본 인증 정보는 1개만 가능합니다.
                </span>
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
                onChange={(e) => setFormData({ ...formData, rate_limit_per_minute: e.target.value })}
                className="col-span-3"
                placeholder="예: 60 (선택)"
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
                onChange={(e) => setFormData({ ...formData, rate_limit_per_day: e.target.value })}
                className="col-span-3"
                placeholder="예: 10000 (선택)"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expires_at" className="text-right">
                만료일
              </Label>
              <Input
                id="expires_at"
                type="date"
                value={formData.expires_at}
                onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                className="col-span-3"
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
                className="col-span-3 font-mono text-xs min-h-[140px]"
                placeholder='예: {"environment":"prod"}'
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


