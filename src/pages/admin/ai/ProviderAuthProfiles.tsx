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

type AuthType = "api_key" | "oauth2_service_account" | "aws_sigv4" | "azure_ad"

type ProviderRow = { id: string; product_name: string; slug: string }
type CredentialRow = { id: string; provider_id: string; credential_name: string; api_key_masked?: string | null }

type AuthProfileRow = {
  id: string
  provider_id: string
  profile_key: string
  auth_type: AuthType
  credential_id: string
  token_cache_key?: string | null
  config?: unknown
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type ListResponse = { ok: boolean; total: number; limit: number; offset: number; rows: AuthProfileRow[] }

const API = "/api/ai/provider-auth-profiles"
const PROVIDERS_API = "/api/ai/providers"
const CREDENTIALS_API = "/api/ai/credentials"

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

const AUTH_TYPES: AuthType[] = ["api_key", "oauth2_service_account", "aws_sigv4", "azure_ad"]

export default function ProviderAuthProfiles() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<AuthProfileRow[]>([])
  const [total, setTotal] = useState(0)

  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [credentials, setCredentials] = useState<CredentialRow[]>([])

  const [q, setQ] = useState("")
  const [providerFilter, setProviderFilter] = useState<string>("all")
  const [authTypeFilter, setAuthTypeFilter] = useState<string>("all")
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "true" | "false">("all")
  const [page, setPage] = useState(0)
  const limit = 50

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AuthProfileRow | null>(null)

  // form
  const [providerId, setProviderId] = useState("")
  const [profileKey, setProfileKey] = useState("")
  const [authType, setAuthType] = useState<AuthType>("api_key")
  const [credentialId, setCredentialId] = useState("")
  const [tokenCacheKey, setTokenCacheKey] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [configText, setConfigText] = useState(pretty({}))

  const providerNameById = useMemo(() => new Map(providers.map((p) => [p.id, `${p.product_name} (${p.slug})`] as const)), [providers])
  const credentialNameById = useMemo(
    () => new Map(credentials.map((c) => [c.id, `${c.credential_name}${c.api_key_masked ? ` (${c.api_key_masked})` : ""}`] as const)),
    [credentials]
  )

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (providerFilter !== "all") params.set("provider_id", providerFilter)
    if (authTypeFilter !== "all") params.set("auth_type", authTypeFilter)
    if (isActiveFilter !== "all") params.set("is_active", isActiveFilter)
    return params.toString()
  }, [authTypeFilter, isActiveFilter, limit, page, providerFilter, q])

  async function fetchProviders() {
    const res = await fetch(PROVIDERS_API)
    const json = (await res.json().catch(() => [])) as ProviderRow[]
    if (!res.ok) throw new Error("FAILED_PROVIDERS")
    setProviders((json || []).filter((p) => p && p.id))
  }

  async function fetchCredentials() {
    const res = await fetch(CREDENTIALS_API)
    const json = (await res.json().catch(() => [])) as CredentialRow[]
    if (!res.ok) throw new Error("FAILED_CREDENTIALS")
    setCredentials((json || []).filter((c) => c && c.id))
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
    const row = (json as any)?.row as AuthProfileRow | undefined
    if (!row) throw new Error("FAILED_GET")
    return row
  }

  function resetForm() {
    setEditing(null)
    setProviderId("")
    setProfileKey("")
    setAuthType("api_key")
    setCredentialId("")
    setTokenCacheKey("")
    setIsActive(true)
    setConfigText(pretty({}))
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  async function openEdit(r: AuthProfileRow) {
    try {
      const full = await fetchDetail(r.id)
      setEditing(full)
      setProviderId(String(full.provider_id || ""))
      setProfileKey(String(full.profile_key || ""))
      setAuthType((full.auth_type as AuthType) || "api_key")
      setCredentialId(String(full.credential_id || ""))
      setTokenCacheKey(String(full.token_cache_key || ""))
      setIsActive(Boolean(full.is_active))
      setConfigText(pretty(full.config ?? {}))
      setOpen(true)
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  async function save() {
    const pid = providerId.trim()
    const pk = profileKey.trim()
    const cid = credentialId.trim()
    if (!pid) return alert("provider를 선택해 주세요.")
    if (!pk) return alert("profile_key를 입력해 주세요.")
    if (!cid) return alert("credential을 선택해 주세요.")

    const config = safeParseJsonObject(configText)

    const payload = {
      provider_id: pid,
      profile_key: pk,
      auth_type: authType,
      credential_id: cid,
      token_cache_key: tokenCacheKey.trim() ? tokenCacheKey.trim() : null,
      is_active: isActive,
      config,
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

  async function remove(r: AuthProfileRow) {
    const ok = window.confirm(`"${r.profile_key}" 인증 프로필을 삭제합니다. 계속할까요?`)
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
        await Promise.all([fetchProviders(), fetchCredentials()])
      } catch (e) {
        console.warn(e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  const credentialsForProvider = useMemo(() => {
    if (!providerId.trim()) return []
    return credentials.filter((c) => c.provider_id === providerId.trim())
  }, [credentials, providerId])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">AI 서비스 - Provider Auth Profiles</div>
          <div className="text-sm text-muted-foreground">
            provider_api_credentials 위에 인증 방식을 프로필로 관리합니다. (v1: api_key / oauth2_service_account)
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchList()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">인증 프로필 추가</span>
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
          value={authTypeFilter}
          onValueChange={(v) => {
            setPage(0)
            setAuthTypeFilter(v)
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="auth_type(전체)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">auth_type(전체)</SelectItem>
            {AUTH_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
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
              <TableHead className="min-w-[260px]">Profile Key</TableHead>
              <TableHead className="min-w-[220px]">Provider</TableHead>
              <TableHead className="min-w-[200px]">Auth Type</TableHead>
              <TableHead className="min-w-[280px]">Credential</TableHead>
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
                  등록된 인증 프로필이 없습니다.
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
                    <Badge variant="secondary">{r.auth_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{credentialNameById.get(r.credential_id) || r.credential_id}</div>
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "인증 프로필 수정" : "인증 프로필 추가"}</DialogTitle>
            <DialogDescription>
              oauth2_service_account의 경우 credential에는 “서비스 계정 JSON 문자열”이 저장되어 있어야 하며, config에 scopes/token_url 등을 넣습니다.
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
              <Label>auth_type</Label>
              <Select value={authType} onValueChange={(v) => setAuthType(v as AuthType)}>
                <SelectTrigger>
                  <SelectValue placeholder="auth_type" />
                </SelectTrigger>
                <SelectContent>
                  {AUTH_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>profile_key</Label>
              <Input value={profileKey} onChange={(e) => setProfileKey(e.target.value)} placeholder="예: google_vertex_sa_v1" />
            </div>

            <div className="space-y-2">
              <Label>credential</Label>
              <Select value={credentialId || "none"} onValueChange={(v) => setCredentialId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="credential 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택</SelectItem>
                  {credentialsForProvider.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.credential_name} {c.api_key_masked ? `(${c.api_key_masked})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">provider에 속한 credential만 표시합니다.</div>
            </div>

            <div className="space-y-2">
              <Label>token_cache_key (optional)</Label>
              <Input value={tokenCacheKey} onChange={(e) => setTokenCacheKey(e.target.value)} placeholder="예: google_vertex_sa_default" className="font-mono" />
            </div>

            <div className="space-y-2">
              <Label>is_active</Label>
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={(v) => setIsActive(v)} />
                <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "ON" : "OFF"}</Badge>
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>config (JSON)</Label>
              <div className="text-xs text-muted-foreground">
                예: <span className="font-mono">{"{\"scopes\":[\"https://www.googleapis.com/auth/cloud-platform\"],\"token_url\":\"https://oauth2.googleapis.com/token\"}"}</span>
              </div>
              <Textarea value={configText} onChange={(e) => setConfigText(e.target.value)} className="min-h-[180px]" />
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
    </div>
  )
}


