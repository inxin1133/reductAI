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
import { Loader2, Pencil, Plus, Search, Trash2, ShieldCheck, ShieldAlert } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"
import { ProviderLogo, PROVIDER_LOGO_OPTIONS } from "@/components/icons/providerLogoRegistry"

type ProviderStatus = "active" | "inactive" | "deprecated"

interface AIProvider {
  id: string
  name: string
  product_name: string
  slug: string
  logo_key?: string | null
  description?: string | null
  website_url?: string | null
  api_base_url?: string | null
  documentation_url?: string | null
  status: ProviderStatus
  is_verified: boolean
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const API_URL = "/api/ai/providers"
const LOCAL_STORAGE_KEY = "admin_ai_providers"

function nowIso() {
  return new Date().toISOString()
}

function safeUuid() {
  try {
    return crypto.randomUUID()
  } catch {
    // 구형 브라우저 대응(임시 UUID)
    return `tmp_${Math.random().toString(16).slice(2)}_${Date.now()}`
  }
}

function seedProviders(): AIProvider[] {
  const t = nowIso()
  return [
    {
      id: safeUuid(),
      name: "openai",
      product_name: "OpenAI",
      slug: "openai",
      logo_key: "chatgpt",
      description: "OpenAI API 제공업체",
      website_url: "https://openai.com",
      api_base_url: "https://api.openai.com/v1",
      documentation_url: "https://platform.openai.com/docs",
      status: "active",
      is_verified: true,
      metadata: { provider_type: "llm" },
      created_at: t,
      updated_at: t,
    },
    {
      id: safeUuid(),
      name: "anthropic",
      product_name: "Anthropic",
      slug: "anthropic",
      logo_key: "claude",
      description: "Claude 모델 제공업체",
      website_url: "https://www.anthropic.com",
      api_base_url: "https://api.anthropic.com",
      documentation_url: "https://docs.anthropic.com",
      status: "active",
      is_verified: true,
      metadata: { provider_type: "llm" },
      created_at: t,
      updated_at: t,
    },
    {
      id: safeUuid(),
      name: "google",
      product_name: "Google",
      slug: "google",
      logo_key: "google",
      description: "Gemini 모델 제공업체",
      website_url: "https://ai.google.dev",
      api_base_url: "https://generativelanguage.googleapis.com",
      documentation_url: "https://ai.google.dev/docs",
      status: "active",
      is_verified: true,
      metadata: { provider_type: "llm" },
      created_at: t,
      updated_at: t,
    },
  ]
}

function loadFromLocalStorage(): AIProvider[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
  if (!raw) {
    const seeded = seedProviders()
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      // 과거(localStorage)에 display_name으로 저장된 데이터를 product_name으로 자동 변환
      const normalized = (parsed as Array<Record<string, unknown>>).map((p) => ({
        ...(p as any),
        product_name:
          typeof (p as any).product_name === "string"
            ? (p as any).product_name
            : typeof (p as any).display_name === "string"
              ? (p as any).display_name
              : "",
      })) as AIProvider[]
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized))
      return normalized
    }
  } catch {
    // 파싱 실패 시 초기화
  }
  const seeded = seedProviders()
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seeded))
  return seeded
}

function saveToLocalStorage(next: AIProvider[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next))
}

async function tryFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const contentType = res.headers.get("content-type") || ""
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!contentType.includes("application/json")) throw new Error("NOT_JSON")
  return (await res.json()) as T
}

export default function Providers() {

  const [providers, setProviders] = useState<AIProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // 검색(클라이언트 필터)
  const [search, setSearch] = useState("")

  // Dialog 상태
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null)
  const [metadataText, setMetadataText] = useState<string>("{}")
  const [formData, setFormData] = useState<{
    name: string
    product_name: string
    slug: string
    logo_key: string
    description: string
    website_url: string
    api_base_url: string
    documentation_url: string
    status: ProviderStatus
    is_verified: boolean
  }>({
    name: "",
    product_name: "",
    slug: "",
    logo_key: "__none__",
    description: "",
    website_url: "",
    api_base_url: "",
    documentation_url: "",
    status: "active",
    is_verified: false,
  })

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchProviders = async () => {
    setIsLoading(true)
    try {
      // 우선 API를 시도하고, 실패하면 localStorage로 fallback
      const data = await tryFetchJson<AIProvider[]>(API_URL, { headers: { ...authHeaders() } })
      setProviders(data)
    } catch (e) {
      // 백엔드가 아직 없거나(404), 프록시 미설정인 경우에도 화면/기능이 동작하도록 localStorage를 사용
      const local = loadFromLocalStorage()
      setProviders(local)
      console.warn("[Admin Providers] API 연결 실패로 localStorage fallback 사용:", e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProviders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return providers
    return providers.filter((p) => {
      const hay = `${p.name} ${p.product_name} ${p.slug} ${p.api_base_url || ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [providers, search])

  const handleCreate = () => {
    setEditingProvider(null)
    setFormData({
      name: "",
      product_name: "",
      slug: "",
      logo_key: "__none__",
      description: "",
      website_url: "",
      api_base_url: "",
      documentation_url: "",
      status: "active",
      is_verified: false,
    })
    setMetadataText("{}")
    setIsDialogOpen(true)
  }

  const handleEdit = (provider: AIProvider) => {
    setEditingProvider(provider)
    setFormData({
      name: provider.name,
      product_name: provider.product_name,
      slug: provider.slug,
      logo_key: provider.logo_key || "__none__",
      description: provider.description || "",
      website_url: provider.website_url || "",
      api_base_url: provider.api_base_url || "",
      documentation_url: provider.documentation_url || "",
      status: provider.status,
      is_verified: provider.is_verified,
    })
    setMetadataText(JSON.stringify(provider.metadata || {}, null, 2))
    setIsDialogOpen(true)
  }

  const validateForm = (nextList: AIProvider[]) => {
    // 필수값 검증
    if (!formData.name.trim()) return "name(내부 이름)을 입력해주세요."
    if (!formData.product_name.trim()) return "product_name(표시 이름)을 입력해주세요."
    if (!formData.slug.trim()) return "slug를 입력해주세요."

    // slug 중복 체크 (수정 시 자기 자신 제외)
    const slugLower = formData.slug.trim().toLowerCase()
    const exists = nextList.some((p) => p.slug.toLowerCase() === slugLower && p.id !== editingProvider?.id)
    if (exists) return "이미 사용 중인 slug 입니다."

    // metadata JSON 파싱 체크
    try {
      const parsed = JSON.parse(metadataText || "{}")
      if (parsed !== null && typeof parsed !== "object") {
        return "metadata는 JSON 객체 형태여야 합니다. 예) {}"
      }
    } catch {
      return "metadata JSON 형식이 올바르지 않습니다."
    }

    return null
  }

  const handleSubmit = async () => {
    setIsSaving(true)
    try {
      // metadata 파싱(검증은 validateForm에서 이미 수행)
      const parsedMeta = JSON.parse(metadataText || "{}") as Record<string, unknown>

      // 서버 우선 저장 시도 (실패 시 localStorage fallback)
      const payload = {
        name: formData.name.trim(),
        product_name: formData.product_name.trim(),
        slug: formData.slug.trim(),
        logo_key: formData.logo_key === "__none__" ? null : formData.logo_key,
        description: formData.description.trim() || null,
        website_url: formData.website_url.trim() || null,
        api_base_url: formData.api_base_url.trim() || null,
        documentation_url: formData.documentation_url.trim() || null,
        status: formData.status,
        is_verified: formData.is_verified,
        metadata: parsedMeta,
      }

      // localStorage 기준 검증용 리스트(현재 providers)
      const validationError = validateForm(providers)
      if (validationError) {
        alert(validationError)
        return
      }

      if (editingProvider) {
        try {
          await tryFetchJson<AIProvider>(`${API_URL}/${editingProvider.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(payload),
          })
          setIsDialogOpen(false)
          fetchProviders()
          return
        } catch (e) {
          // fallback: localStorage 업데이트
          const next = providers.map((p) =>
            p.id === editingProvider.id
              ? {
                  ...p,
                  ...payload,
                  updated_at: nowIso(),
                }
              : p
          )
          setProviders(next)
          saveToLocalStorage(next)
          setIsDialogOpen(false)
          console.warn("[Admin Providers] PUT 실패로 localStorage fallback 사용:", e)
          return
        }
      }

      // Create
      try {
        await tryFetchJson<AIProvider>(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
        })
        setIsDialogOpen(false)
        fetchProviders()
        return
      } catch (e) {
        const t = nowIso()
        const created: AIProvider = {
          id: safeUuid(),
          ...payload,
          created_at: t,
          updated_at: t,
        }
        const next = [created, ...providers]
        setProviders(next)
        saveToLocalStorage(next)
        setIsDialogOpen(false)
        console.warn("[Admin Providers] POST 실패로 localStorage fallback 사용:", e)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (provider: AIProvider) => {
    if (!confirm(`정말 삭제하시겠습니까?\n- ${provider.product_name} (${provider.slug})`)) return

    try {
      await fetch(`${API_URL}/${provider.id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      // ok/404 여부와 관계 없이 UI 동기화를 위해 재조회
      fetchProviders()
    } catch (e) {
      // fallback: localStorage 삭제
      const next = providers.filter((p) => p.id !== provider.id)
      setProviders(next)
      saveToLocalStorage(next)
      console.warn("[Admin Providers] DELETE 실패로 localStorage fallback 사용:", e)
    }
  }

  const statusBadge = (status: ProviderStatus) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>
      case "deprecated":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Deprecated</Badge>
    }
  }

  return (
    <AdminPage
      headerContent={
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" /> 제공업체 추가
        </Button>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            AI 제공업체(OpenAI/Anthropic 등) 정보를 관리합니다. (현재는 백엔드 미연동 시 localStorage로도 동작합니다.)
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
            placeholder="이름/Slug/Base URL 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[360px]"
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
              <TableHead>제품/업체 이름</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Logo</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>검증</TableHead>
              <TableHead>수정일</TableHead>
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
            ) : filteredProviders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  등록된 제공업체가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredProviders.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {p.is_verified ? (
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex flex-col">
                        <span className="flex items-center gap-2">
                          <ProviderLogo logoKey={p.logo_key} className="h-4 w-4 text-muted-foreground" />
                          {p.product_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{p.name}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {p.slug}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{p.logo_key || "-"}</span>
                  </TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="max-w-[360px] truncate" title={p.api_base_url || ""}>
                    {p.api_base_url || "-"}
                  </TableCell>
                  <TableCell>
                    {p.is_verified ? (
                      <span className="text-xs font-medium text-emerald-700">Verified</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unverified</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.updated_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p)}>
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
        <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProvider ? "제공업체 수정" : "제공업체 추가"}</DialogTitle>
            <DialogDescription>
              제공업체 기본 정보와 엔드포인트를 입력하세요. (API Key는 별도 메뉴에서 관리하는 것을 권장합니다.)
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                업체 이름
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                placeholder="예: openai"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="product_name" className="text-right">
                제품 이름
              </Label>
              <Input
                id="product_name"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                className="col-span-3"
                placeholder="예: OpenAI"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slug" className="text-right">
                Slug
              </Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="col-span-3"
                placeholder="예: openai"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="logo_key" className="text-right">
                로고
              </Label>
              <div className="col-span-3 flex items-center gap-3">
                <Select value={formData.logo_key} onValueChange={(value) => setFormData({ ...formData, logo_key: value })}>
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="(없음)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">(없음)</SelectItem>
                    {PROVIDER_LOGO_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ProviderLogo
                    logoKey={formData.logo_key === "__none__" ? null : formData.logo_key}
                    className="h-4 w-4"
                  />
                  <span className="font-mono">{formData.logo_key === "__none__" ? "-" : formData.logo_key}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                상태
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value: ProviderStatus) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="inactive">inactive</SelectItem>
                  <SelectItem value="deprecated">deprecated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_verified" className="text-right">
                검증됨
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Switch
                  id="is_verified"
                  checked={formData.is_verified}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_verified: checked })}
                />
                <span className="text-xs text-muted-foreground">운영에서 검증된 제공업체 여부</span>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="api_base_url" className="text-right">
                Base URL
              </Label>
              <Input
                id="api_base_url"
                value={formData.api_base_url}
                onChange={(e) => setFormData({ ...formData, api_base_url: e.target.value })}
                className="col-span-3"
                placeholder="예: https://api.openai.com/v1"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="website_url" className="text-right">
                Website
              </Label>
              <Input
                id="website_url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                className="col-span-3"
                placeholder="예: https://openai.com"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="documentation_url" className="text-right">
                Docs
              </Label>
              <Input
                id="documentation_url"
                value={formData.documentation_url}
                onChange={(e) => setFormData({ ...formData, documentation_url: e.target.value })}
                className="col-span-3"
                placeholder="예: https://platform.openai.com/docs"
              />
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right pt-2">
                설명
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="col-span-3"
                placeholder="제공업체 설명을 입력하세요."
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
                placeholder='예: {"provider_type":"llm"}'
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
    </AdminPage>
  )
}


