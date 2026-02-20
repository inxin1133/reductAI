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
import { Textarea } from "@/components/ui/textarea"
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
import { Loader2, Pencil, RefreshCcw } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type AccountRow = {
  id: string
  owner_type: "tenant" | "user"
  owner_tenant_id?: string | null
  owner_user_id?: string | null
  source_tenant_id?: string | null
  credit_type: "subscription" | "topup"
  status: "active" | "suspended" | "expired"
  balance_credits: string | number
  reserved_credits: string | number
  expires_at?: string | null
  display_name?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  owner_tenant_name?: string | null
  owner_tenant_slug?: string | null
  owner_tenant_type?: string | null
  owner_user_email?: string | null
  owner_user_name?: string | null
  source_tenant_name?: string | null
  source_tenant_slug?: string | null
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: AccountRow[]
}

type EditForm = {
  status: AccountRow["status"]
  expires_at: string
  display_name: string
  metadata: string
}

const API_URL = "/api/ai/credits/accounts"
const FILTER_ALL = "__all__"

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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function badgeClass(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "suspended") return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

function formatOwner(row: AccountRow) {
  if (row.owner_type === "tenant") {
    return row.owner_tenant_name || row.owner_tenant_slug || row.owner_tenant_id || "-"
  }
  return row.owner_user_name || row.owner_user_email || row.owner_user_id || "-"
}

export default function CreditAccounts() {
  const [rows, setRows] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [ownerType, setOwnerType] = useState(FILTER_ALL)
  const [creditType, setCreditType] = useState(FILTER_ALL)
  const [status, setStatus] = useState(FILTER_ALL)
  const [tenantId, setTenantId] = useState("")
  const [userId, setUserId] = useState("")
  const [sourceTenantId, setSourceTenantId] = useState("")

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AccountRow | null>(null)
  const [form, setForm] = useState<EditForm>({
    status: "active",
    expires_at: "",
    display_name: "",
    metadata: "",
  })
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (ownerType !== FILTER_ALL) params.set("owner_type", ownerType)
    if (creditType !== FILTER_ALL) params.set("credit_type", creditType)
    if (status !== FILTER_ALL) params.set("status", status)
    if (tenantId.trim()) params.set("tenant_id", tenantId.trim())
    if (userId.trim()) params.set("user_id", userId.trim())
    if (sourceTenantId.trim()) params.set("source_tenant_id", sourceTenantId.trim())
    return params.toString()
  }, [creditType, limit, ownerType, page, q, sourceTenantId, status, tenantId, userId])

  async function fetchAccounts() {
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
    fetchAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function openEdit(row: AccountRow) {
    setEditing(row)
    setForm({
      status: row.status,
      expires_at: toDateTimeLocal(row.expires_at || null),
      display_name: row.display_name || "",
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editing) return
    const metadataValue = parseJson(form.metadata)
    if (metadataValue === null) return alert("메타데이터 JSON 형식이 올바르지 않습니다.")

    try {
      setSaving(true)
      const res = await adminFetch(`${API_URL}/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.status,
          expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
          display_name: form.display_name.trim() || null,
          metadata: metadataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setEditOpen(false)
      setEditing(null)
      await fetchAccounts()
    } catch (e) {
      console.error(e)
      alert("크레딧 계정 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <Button variant="outline" size="sm" onClick={fetchAccounts} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-2">새로고침</span>
        </Button>
      }
    >
      <div className="space-y-1">
        <div className="text-xl font-semibold">크레딧 계정/풀</div>
        <div className="text-sm text-muted-foreground">credit_accounts 기준 계정 풀을 관리합니다.</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="테넌트/사용자 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-32 space-y-1">
          <div className="text-xs text-muted-foreground">소유자</div>
          <Select value={ownerType} onValueChange={setOwnerType}>
            <SelectTrigger>
              <SelectValue placeholder="소유자" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="tenant">tenant</SelectItem>
              <SelectItem value="user">user</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-32 space-y-1">
          <div className="text-xs text-muted-foreground">크레딧 타입</div>
          <Select value={creditType} onValueChange={setCreditType}>
            <SelectTrigger>
              <SelectValue placeholder="타입" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="subscription">subscription</SelectItem>
              <SelectItem value="topup">topup</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-32 space-y-1">
          <div className="text-xs text-muted-foreground">상태</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="suspended">suspended</SelectItem>
              <SelectItem value="expired">expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-56 space-y-1">
          <div className="text-xs text-muted-foreground">테넌트 ID</div>
          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="owner_tenant_id" />
        </div>
        <div className="flex items-center gap-2" />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="w-full md:w-56 space-y-1">
          <div className="text-xs text-muted-foreground">사용자 ID</div>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="owner_user_id" />
        </div>
        <div className="w-full md:w-56 space-y-1">
          <div className="text-xs text-muted-foreground">소스 테넌트 ID</div>
          <Input value={sourceTenantId} onChange={(e) => setSourceTenantId(e.target.value)} placeholder="source_tenant_id" />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>소유자</TableHead>
              <TableHead>타입</TableHead>
              <TableHead>크레딧</TableHead>
              <TableHead>예약</TableHead>
              <TableHead>만료</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>표시 이름</TableHead>
              <TableHead>업데이트</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  표시할 계정이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{formatOwner(row)}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {row.owner_type === "tenant" ? row.owner_tenant_slug : row.owner_user_email}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.owner_type}/{row.credit_type}
                </TableCell>
                <TableCell className="font-mono">{Number(row.balance_credits).toLocaleString()}</TableCell>
                <TableCell className="font-mono">{Number(row.reserved_credits).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(row.expires_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={badgeClass(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{row.display_name || "-"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">총 {total}건</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            이전
          </Button>
          <span className="text-muted-foreground">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            다음
          </Button>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>크레딧 계정 수정</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                {formatOwner(editing)} · {editing.owner_type}/{editing.credit_type}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">상태</div>
                  <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as EditForm["status"] }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="상태" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="suspended">suspended</SelectItem>
                      <SelectItem value="expired">expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">만료 일시</div>
                  <Input
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={(e) => setForm((p) => ({ ...p, expires_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <div className="text-sm font-medium">표시 이름</div>
                  <Input value={form.display_name} onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">메타데이터(JSON)</div>
                <Textarea
                  rows={4}
                  value={form.metadata}
                  onChange={(e) => setForm((p) => ({ ...p, metadata: e.target.value }))}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={saving ? "ml-2" : ""}>저장</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
