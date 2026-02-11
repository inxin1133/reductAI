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
import { Loader2, Pencil, Plus, RefreshCcw } from "lucide-react"

type RateCardRow = {
  id: string
  name: string
  version: number
  status: "draft" | "active" | "retired"
  effective_at: string
  description?: string | null
  created_at: string
  updated_at: string
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: RateCardRow[]
}

type FormState = {
  name: string
  version: string
  status: RateCardRow["status"]
  effective_at: string
  description: string
}

const API_URL = "/api/ai/pricing/rate-cards"
const STATUS_ALL = "__all__"

const STATUS_LABELS: Record<RateCardRow["status"], string> = {
  draft: "초안",
  active: "활성",
  retired: "종료",
}

function fmtDt(iso?: string | null) {
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

function nowLocal() {
  return toDateTimeLocal(new Date().toISOString())
}

function statusBadgeClass(status: RateCardRow["status"]) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "retired") return "bg-amber-50 text-amber-700 border-amber-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

const defaultForm = (): FormState => ({
  name: "",
  version: "1",
  status: "draft",
  effective_at: nowLocal(),
  description: "",
})

export default function RateCards() {
  const [rows, setRows] = useState<RateCardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [statusFilter, setStatusFilter] = useState(STATUS_ALL)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RateCardRow | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm())
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (statusFilter !== STATUS_ALL) params.set("status", statusFilter)
    return params.toString()
  }, [limit, page, q, statusFilter])

  async function fetchList() {
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
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  function openCreate() {
    setEditing(null)
    setForm(defaultForm())
    setDialogOpen(true)
  }

  function openEdit(row: RateCardRow) {
    setEditing(row)
    setForm({
      name: row.name || "",
      version: String(row.version ?? 1),
      status: row.status || "draft",
      effective_at: toDateTimeLocal(row.effective_at),
      description: row.description || "",
    })
    setDialogOpen(true)
  }

  function buildPayload() {
    const payload: Record<string, any> = {
      name: form.name.trim(),
      status: form.status,
      effective_at: form.effective_at ? new Date(form.effective_at).toISOString() : null,
      description: form.description.trim() || null,
    }
    if (!editing) {
      payload.version = Number.parseInt(form.version, 10)
    }
    return payload
  }

  function validatePayload(payload: Record<string, any>) {
    if (!payload.name) return "이름을 입력해주세요."
    if (!payload.status) return "상태를 선택해주세요."
    if (!payload.effective_at) return "유효 시간을 입력해주세요."
    if (!editing) {
      if (!Number.isFinite(payload.version) || payload.version <= 0) return "버전을 입력해주세요."
    }
    return null
  }

  async function saveRateCard() {
    const payload = buildPayload()
    const msg = validatePayload(payload)
    if (msg) {
      alert(msg)
      return
    }

    try {
      setSaving(true)
      const res = await adminFetch(editing ? `${API_URL}/${editing.id}` : API_URL, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setDialogOpen(false)
      setEditing(null)
      setForm(defaultForm())
      await fetchList()
    } catch (e) {
      console.error(e)
      alert("Rate Card 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">Rate Card/버전 관리</div>
        <div className="text-sm text-muted-foreground">요율 스냅샷(버전)과 유효일을 관리합니다.</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="이름/설명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="w-full md:w-48 space-y-1">
          <div className="text-xs text-muted-foreground">상태</div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STATUS_ALL}>전체</SelectItem>
              <SelectItem value="draft">초안</SelectItem>
              <SelectItem value="active">활성</SelectItem>
              <SelectItem value="retired">종료</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchList} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">새 Rate Card</span>
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>버전</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>유효 시간</TableHead>
              <TableHead>설명</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  표시할 Rate Card가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>v{row.version}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusBadgeClass(row.status)}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </Badge>
                </TableCell>
                <TableCell>{fmtDt(row.effective_at)}</TableCell>
                <TableCell className="max-w-[320px] truncate">{row.description || "-"}</TableCell>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Rate Card 수정" : "새 Rate Card 생성"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">이름</div>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium">버전</div>
                <Input
                  type="number"
                  min={1}
                  value={form.version}
                  disabled={Boolean(editing)}
                  onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">상태</div>
                <Select value={form.status} onValueChange={(v) => setForm((prev) => ({ ...prev, status: v as RateCardRow["status"] }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">초안</SelectItem>
                    <SelectItem value="active">활성</SelectItem>
                    <SelectItem value="retired">종료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">유효 시간</div>
              <Input
                type="datetime-local"
                value={form.effective_at}
                onChange={(e) => setForm((prev) => ({ ...prev, effective_at: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">설명</div>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={saveRateCard} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={saving ? "ml-2" : ""}>{editing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
