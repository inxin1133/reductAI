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
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, RefreshCcw, Pencil } from "lucide-react"

type InvitationStatus = "pending" | "accepted" | "rejected" | "expired" | "cancelled"
type InvitationRole = "owner" | "admin" | "member" | "viewer"

type InvitationRow = {
  id: string
  tenant_id: string
  inviter_id: string
  invitee_email: string
  invitee_user_id?: string | null
  invitation_token: string
  membership_role: InvitationRole
  status: InvitationStatus
  expires_at: string
  accepted_at?: string | null
  rejected_at?: string | null
  cancelled_at?: string | null
  created_at: string
  updated_at?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  inviter_email?: string | null
  inviter_name?: string | null
  invitee_name?: string | null
}

type UserOption = {
  id: string
  email: string
  full_name?: string | null
}

type TenantOption = {
  id: string
  name: string
  slug: string
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

const API_URL = "/api/tenants/invitations"
const FILTER_ALL = "__all__"
const STATUSES: InvitationStatus[] = ["pending", "accepted", "rejected", "expired", "cancelled"]
const ROLES: InvitationRole[] = ["owner", "admin", "member", "viewer"]
const ROLE_LABELS: Record<InvitationRole, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
  viewer: "뷰어",
}

const EMPTY_FORM = {
  tenant_id: "",
  invitee_email: "",
  invitee_user_id: "",
  membership_role: "member" as InvitationRole,
  status: "pending" as InvitationStatus,
  expires_at: "",
}

function fmtDate(iso?: string | null) {
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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

function statusBadge(status?: string | null) {
  if (status === "pending") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "accepted") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  if (status === "cancelled") return "bg-slate-100 text-slate-600 border-slate-200"
  if (status === "expired") return "bg-slate-50 text-slate-500 border-slate-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

export default function TenantInvitations() {
  const [rows, setRows] = useState<InvitationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [status, setStatus] = useState(FILTER_ALL)
  const [tenantId, setTenantId] = useState("")
  const [inviteeEmail, setInviteeEmail] = useState("")

  const [users, setUsers] = useState<UserOption[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<InvitationRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (status !== FILTER_ALL) params.set("status", status)
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (inviteeEmail.trim()) params.set("invitee_email", inviteeEmail.trim())
    return params.toString()
  }, [inviteeEmail, limit, page, q, status, tenantId])

  async function fetchInvitations() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
      const json = (await res.json()) as ListResponse<InvitationRow>
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
      setUsers(Array.isArray(json.users) ? json.users : [])
    } catch (e) {
      console.error(e)
      setUsers([])
    }
  }

  async function fetchTenants() {
    try {
      const res = await adminFetch(`/api/tenants?limit=200`)
      if (!res.ok) throw new Error("FAILED")
      const json = await res.json().catch(() => ({}))
      setTenants(Array.isArray(json.tenants) ? json.tenants : [])
    } catch (e) {
      console.error(e)
      setTenants([])
    }
  }

  function openCreate() {
    const next = { ...EMPTY_FORM }
    const defaultExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    next.expires_at = toDateTimeLocal(defaultExpiry.toISOString())
    setEditing(null)
    setForm(next)
    setDialogOpen(true)
  }

  function openEdit(row: InvitationRow) {
    setEditing(row)
    setForm({
      tenant_id: row.tenant_id,
      invitee_email: row.invitee_email,
      invitee_user_id: row.invitee_user_id || "",
      membership_role: row.membership_role,
      status: row.status,
      expires_at: toDateTimeLocal(row.expires_at || null),
    })
    setDialogOpen(true)
  }

  async function saveInvitation() {
    if (!form.tenant_id.trim()) return alert("테넌트를 선택해 주세요.")
    if (!form.invitee_email.trim()) return alert("초대 이메일을 입력해 주세요.")
    if (!form.expires_at) return alert("만료 시각을 입력해 주세요.")

    const payload = {
      tenant_id: form.tenant_id.trim(),
      invitee_email: form.invitee_email.trim(),
      invitee_user_id: form.invitee_user_id.trim() || null,
      membership_role: form.membership_role,
      status: form.status,
      expires_at: new Date(form.expires_at).toISOString(),
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
        return alert(json.message || "저장에 실패했습니다.")
      }
      setDialogOpen(false)
      setEditing(null)
      await fetchInvitations()
    } catch (e) {
      console.error(e)
      alert("저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }

  async function cancelInvitation(row: InvitationRow) {
    if (!confirm("초대를 취소할까요?")) return
    try {
      const res = await adminFetch(`${API_URL}/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        return alert(json.message || "취소에 실패했습니다.")
      }
      await fetchInvitations()
    } catch (e) {
      console.error(e)
      alert("취소 중 오류가 발생했습니다.")
    }
  }

  useEffect(() => {
    fetchInvitations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  useEffect(() => {
    fetchUsers()
    fetchTenants()
  }, [])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchInvitations} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> 초대 추가
          </Button>
        </div>
      }
    >
      <div>
        <p className="text-muted-foreground">테넌트 초대 상태와 만료를 관리합니다.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="테넌트/이메일" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-40 space-y-1">
          <div className="text-xs text-muted-foreground">상태</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              {STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-52 space-y-1">
          <div className="text-xs text-muted-foreground">테넌트 ID</div>
          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="tenant_id" />
        </div>
        <div className="w-full md:w-52 space-y-1">
          <div className="text-xs text-muted-foreground">초대 이메일</div>
          <Input value={inviteeEmail} onChange={(e) => setInviteeEmail(e.target.value)} placeholder="invitee_email" />
        </div>
        <div className="flex items-center gap-2" />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>테넌트</TableHead>
              <TableHead>초대 대상</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>만료</TableHead>
              <TableHead>생성</TableHead>
              <TableHead>관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  표시할 초대가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="text-sm">{row.tenant_name || row.tenant_slug || row.tenant_id}</div>
                  <div className="text-xs text-muted-foreground">{row.tenant_id}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.invitee_email}</div>
                  <div className="text-xs text-muted-foreground">{row.invitee_user_id || "-"}</div>
                </TableCell>
                <TableCell>{ROLE_LABELS[row.membership_role] || row.membership_role}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadge(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{fmtDate(row.expires_at)}</TableCell>
                <TableCell className="text-sm">{fmtDate(row.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {row.status === "pending" ? (
                      <Button variant="outline" size="sm" onClick={() => cancelInvitation(row)}>
                        취소
                      </Button>
                    ) : null}
                  </div>
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
            <DialogTitle>{editing ? "초대 수정" : "초대 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">테넌트</div>
              <Select
                value={form.tenant_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, tenant_id: value }))}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="테넌트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground">테넌트가 없습니다.</div>
                  ) : (
                    tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.slug})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">초대 대상</div>
              <Select
                value={form.invitee_user_id}
                onValueChange={(value) => {
                  const found = users.find((user) => user.id === value)
                  setForm((prev) => ({
                    ...prev,
                    invitee_user_id: value,
                    invitee_email: found?.email || prev.invitee_email,
                  }))
                }}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="사용자 선택 (선택)" />
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
              <Input
                value={form.invitee_email}
                onChange={(e) => setForm((prev) => ({ ...prev, invitee_email: e.target.value }))}
                placeholder="이메일 입력"
                disabled={!!editing}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">역할</div>
              <Select
                value={form.membership_role}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, membership_role: value as InvitationRole }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {ROLE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editing ? (
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">상태</div>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as InvitationStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">만료 시각</div>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm((prev) => ({ ...prev, expires_at: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              닫기
            </Button>
            <Button onClick={saveInvitation} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
