import { useEffect, useMemo, useState } from "react"
import { adminFetch } from "@/lib/adminFetch"
import { AdminPage } from "@/components/layout/AdminPage"
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
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react"

type UserProviderRow = {
  id: string
  user_id: string
  provider: "google" | "kakao" | "naver" | "local"
  provider_user_id: string
  extra_data?: Record<string, unknown> | null
  created_at: string
  user_email?: string | null
  user_name?: string | null
}

type UserOption = {
  id: string
  email: string
  full_name?: string | null
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

const API_URL = "/api/users/providers"
const FILTER_ALL = "__all__"
const PROVIDERS: UserProviderRow["provider"][] = ["google", "kakao", "naver", "local"]
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  kakao: "Kakao",
  naver: "Naver",
  local: "Email",
}

const EMPTY_FORM = {
  user_id: "",
  provider: "google" as UserProviderRow["provider"],
  provider_user_id: "",
  extra_data: "",
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatJsonPreview(value: unknown) {
  if (!value) return "-"
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value)
    return raw.length > 60 ? `${raw.slice(0, 60)}...` : raw
  } catch {
    return "-"
  }
}

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function UserProviders() {
  const [rows, setRows] = useState<UserProviderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [provider, setProvider] = useState(FILTER_ALL)
  const [userId, setUserId] = useState("")

  const [users, setUsers] = useState<UserOption[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (provider !== FILTER_ALL) params.set("provider", provider)
    if (userId.trim()) params.set("user_id", userId.trim())
    return params.toString()
  }, [limit, page, provider, q, userId])

  async function fetchProviders() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
      const json = (await res.json()) as ListResponse<UserProviderRow>
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

  async function fetchUsers() {
    try {
      const res = await adminFetch(`/api/users?limit=200`)
      if (!res.ok) throw new Error("FAILED")
      const json = await res.json().catch(() => ({}))
      const next = Array.isArray(json.users) ? json.users : []
      setUsers(next)
    } catch (e) {
      console.error(e)
      setUsers([])
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  async function saveProvider() {
    const extraDataValue = parseJson(form.extra_data)
    if (extraDataValue === null) return alert("Extra data JSON 형식이 올바르지 않습니다.")
    if (!form.user_id.trim()) return alert("사용자를 선택해 주세요.")
    if (!form.provider_user_id.trim()) return alert("Provider User ID를 입력해 주세요.")

    try {
      setSaving(true)
      const res = await adminFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: form.user_id.trim(),
          provider: form.provider,
          provider_user_id: form.provider_user_id.trim(),
          extra_data: extraDataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        return alert(json.message || "저장에 실패했습니다.")
      }
      setDialogOpen(false)
      await fetchProviders()
    } catch (e) {
      console.error(e)
      alert("저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function removeProvider(row: UserProviderRow) {
    const label = row.user_email || row.user_id
    if (!confirm(`"${label}" 연동을 해제할까요?`)) return
    try {
      const res = await adminFetch(`${API_URL}/${row.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        return alert(json.message || "삭제에 실패했습니다.")
      }
      await fetchProviders()
    } catch (e) {
      console.error(e)
      alert("삭제 중 오류가 발생했습니다.")
    }
  }

  useEffect(() => {
    fetchProviders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  useEffect(() => {
    fetchUsers()
  }, [])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchProviders} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> 연동 추가
          </Button>
        </div>
      }
    >
      <div>
        <p className="text-muted-foreground">회원 SSO/로그인 연동 정보를 관리합니다.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="이메일/이름/Provider ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-40 space-y-1">
          <div className="text-xs text-muted-foreground">Provider</div>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger>
              <SelectValue placeholder="provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              {PROVIDERS.map((item) => (
                <SelectItem key={item} value={item}>
                  {PROVIDER_LABELS[item] || item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-52 space-y-1">
          <div className="text-xs text-muted-foreground">사용자 ID</div>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_id" />
        </div>
        <div className="flex items-center gap-2" />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>사용자</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Provider User ID</TableHead>
              <TableHead>Extra Data</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead>관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  표시할 연동 정보가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="text-sm">{row.user_email || row.user_name || row.user_id}</div>
                  <div className="text-xs text-muted-foreground">{row.user_id}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{PROVIDER_LABELS[row.provider] || row.provider}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.provider_user_id}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatJsonPreview(row.extra_data)}</TableCell>
                <TableCell className="text-sm">{fmtDate(row.created_at)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => removeProvider(row)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          총 {total}건 / {page + 1} of {pageCount}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
            이전
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>연동 추가</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">사용자</div>
              <Select
                value={form.user_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, user_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="사용자 선택" />
                </SelectTrigger>
                <SelectContent>
                  {users.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground">사용자가 없습니다.</div>
                  ) : (
                    users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.email} ({user.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">Provider</div>
              <Select
                value={form.provider}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, provider: value as UserProviderRow["provider"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PROVIDER_LABELS[item] || item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">Provider User ID</div>
              <Input
                value={form.provider_user_id}
                onChange={(e) => setForm((prev) => ({ ...prev, provider_user_id: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">Extra Data (JSON)</div>
              <Textarea
                value={form.extra_data}
                onChange={(e) => setForm((prev) => ({ ...prev, extra_data: e.target.value }))}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              닫기
            </Button>
            <Button onClick={saveProvider} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
