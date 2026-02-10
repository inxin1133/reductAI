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
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Pencil, Plus, RefreshCcw } from "lucide-react"

type PlanTier = "free" | "pro" | "premium" | "business" | "enterprise"
type TenantType = "personal" | "team" | "group"

type PlanRow = {
  id: string
  slug: string
  name: string
  tier: PlanTier
  tenant_type: TenantType
  description?: string | null
  included_seats: number
  min_seats: number
  max_seats?: number | null
  extra_seat_price_usd?: string | number | null
  storage_limit_mb?: number | null
  is_active: boolean
  sort_order: number
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: PlanRow[]
}

type FormState = {
  slug: string
  name: string
  tier: PlanTier
  tenant_type: TenantType
  description: string
  included_seats: string
  min_seats: string
  max_seats: string
  extra_seat_price_usd: string
  storage_limit_mb: string
  is_active: boolean
  sort_order: string
  metadata: string
}

const API_URL = "/api/ai/billing/plans"
const FILTER_ALL = "__all__"

const EMPTY_FORM: FormState = {
  slug: "",
  name: "",
  tier: "free",
  tenant_type: "personal",
  description: "",
  included_seats: "1",
  min_seats: "1",
  max_seats: "",
  extra_seat_price_usd: "0",
  storage_limit_mb: "",
  is_active: true,
  sort_order: "0",
  metadata: "",
}

function fmtMoney(v: unknown) {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return "-"
  return n.toFixed(2)
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function badgeClass(active: boolean) {
  return active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"
}

export default function BillingPlans() {
  const [rows, setRows] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [tier, setTier] = useState(FILTER_ALL)
  const [tenantType, setTenantType] = useState(FILTER_ALL)
  const [isActive, setIsActive] = useState(FILTER_ALL)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (tier !== FILTER_ALL) params.set("tier", tier)
    if (tenantType !== FILTER_ALL) params.set("tenant_type", tenantType)
    if (isActive !== FILTER_ALL) params.set("is_active", isActive)
    return params.toString()
  }, [isActive, limit, page, q, tenantType, tier])

  async function fetchList() {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}?${queryString}`)
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
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(row: PlanRow) {
    setEditing(row)
    setForm({
      slug: row.slug || "",
      name: row.name || "",
      tier: row.tier,
      tenant_type: row.tenant_type,
      description: row.description || "",
      included_seats: String(row.included_seats ?? 1),
      min_seats: String(row.min_seats ?? 1),
      max_seats: row.max_seats !== null && row.max_seats !== undefined ? String(row.max_seats) : "",
      extra_seat_price_usd: String(row.extra_seat_price_usd ?? 0),
      storage_limit_mb: row.storage_limit_mb !== null && row.storage_limit_mb !== undefined ? String(row.storage_limit_mb) : "",
      is_active: Boolean(row.is_active),
      sort_order: String(row.sort_order ?? 0),
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setDialogOpen(true)
  }

  function parseMetadata(value: string) {
    if (!value.trim()) return {}
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  function buildPayload() {
    const metadata = parseMetadata(form.metadata)
    if (metadata === null) return { error: "메타데이터 JSON 형식이 올바르지 않습니다." }

    const includedSeats = Number(form.included_seats)
    const minSeats = Number(form.min_seats)
    const maxSeats = form.max_seats.trim() ? Number(form.max_seats) : null
    const extraSeatPrice = form.extra_seat_price_usd.trim() ? Number(form.extra_seat_price_usd) : 0
    const storageLimit = form.storage_limit_mb.trim() ? Number(form.storage_limit_mb) : null
    const sortOrder = form.sort_order.trim() ? Number(form.sort_order) : 0

    if (!form.slug.trim()) return { error: "slug를 입력해주세요." }
    if (!form.name.trim()) return { error: "이름을 입력해주세요." }
    if (!Number.isFinite(includedSeats) || includedSeats <= 0) return { error: "포함 좌석 수를 입력해주세요." }
    if (!Number.isFinite(minSeats) || minSeats <= 0) return { error: "최소 좌석 수를 입력해주세요." }
    if (maxSeats !== null && (!Number.isFinite(maxSeats) || maxSeats < 0)) return { error: "최대 좌석 수를 확인해주세요." }
    if (maxSeats !== null && maxSeats < includedSeats) return { error: "최대 좌석 수는 포함 좌석 수 이상이어야 합니다." }
    if (maxSeats !== null && minSeats > maxSeats) return { error: "최소 좌석 수는 최대 좌석 수보다 작아야 합니다." }
    if (!Number.isFinite(extraSeatPrice) || extraSeatPrice < 0) return { error: "추가 좌석 가격을 확인해주세요." }
    if (storageLimit !== null && (!Number.isFinite(storageLimit) || storageLimit < 0)) {
      return { error: "저장소 제한 값을 확인해주세요." }
    }
    if (!Number.isFinite(sortOrder)) return { error: "정렬 순서를 확인해주세요." }

    return {
      payload: {
        slug: form.slug.trim(),
        name: form.name.trim(),
        tier: form.tier,
        tenant_type: form.tenant_type,
        description: form.description.trim() || null,
        included_seats: includedSeats,
        min_seats: minSeats,
        max_seats: maxSeats,
        extra_seat_price_usd: extraSeatPrice,
        storage_limit_mb: storageLimit,
        is_active: form.is_active,
        sort_order: Math.floor(sortOrder),
        metadata,
      },
    }
  }

  async function savePlan() {
    const result = buildPayload()
    if ("error" in result) {
      alert(result.error)
      return
    }

    try {
      setSaving(true)
      const res = await fetch(editing ? `${API_URL}/${editing.id}` : API_URL, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await fetchList()
    } catch (e) {
      console.error(e)
      alert("요금제 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">구독 플랜 관리</div>
        <div className="text-sm text-muted-foreground">billing_plans 기준 요금제를 관리합니다.</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="slug/이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">티어</div>
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger>
              <SelectValue placeholder="티어 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="free">free</SelectItem>
              <SelectItem value="pro">pro</SelectItem>
              <SelectItem value="premium">premium</SelectItem>
              <SelectItem value="business">business</SelectItem>
              <SelectItem value="enterprise">enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-44 space-y-1">
          <div className="text-xs text-muted-foreground">테넌트 타입</div>
          <Select value={tenantType} onValueChange={setTenantType}>
            <SelectTrigger>
              <SelectValue placeholder="타입 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="personal">personal</SelectItem>
              <SelectItem value="team">team</SelectItem>
              <SelectItem value="group">group</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-40 space-y-1">
          <div className="text-xs text-muted-foreground">활성</div>
          <Select value={isActive} onValueChange={setIsActive}>
            <SelectTrigger>
              <SelectValue placeholder="활성 상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>전체</SelectItem>
              <SelectItem value="true">활성</SelectItem>
              <SelectItem value="false">비활성</SelectItem>
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
            <span className="ml-2">새 요금제</span>
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>요금제</TableHead>
              <TableHead>티어</TableHead>
              <TableHead>테넌트</TableHead>
              <TableHead>좌석(포함/최소/최대)</TableHead>
              <TableHead>추가 좌석</TableHead>
              <TableHead>저장소(MB)</TableHead>
              <TableHead>활성</TableHead>
              <TableHead>정렬</TableHead>
              <TableHead>업데이트</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  표시할 요금제가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.slug}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono">{row.tier}</TableCell>
                <TableCell className="font-mono">{row.tenant_type}</TableCell>
                <TableCell className="font-mono text-xs">
                  {row.included_seats}/{row.min_seats}/{row.max_seats ?? "-"}
                </TableCell>
                <TableCell className="font-mono">{fmtMoney(row.extra_seat_price_usd ?? 0)}</TableCell>
                <TableCell className="font-mono">{row.storage_limit_mb ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={badgeClass(row.is_active)}>
                    {row.is_active ? "활성" : "비활성"}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono">{row.sort_order ?? 0}</TableCell>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "요금제 수정" : "요금제 생성"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">Slug</div>
              <Input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">이름</div>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">티어</div>
              <Select value={form.tier} onValueChange={(v) => setForm((p) => ({ ...p, tier: v as PlanTier }))}>
                <SelectTrigger>
                  <SelectValue placeholder="티어 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">free</SelectItem>
                  <SelectItem value="pro">pro</SelectItem>
                  <SelectItem value="premium">premium</SelectItem>
                  <SelectItem value="business">business</SelectItem>
                  <SelectItem value="enterprise">enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">테넌트 타입</div>
              <Select value={form.tenant_type} onValueChange={(v) => setForm((p) => ({ ...p, tenant_type: v as TenantType }))}>
                <SelectTrigger>
                  <SelectValue placeholder="타입 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">personal</SelectItem>
                  <SelectItem value="team">team</SelectItem>
                  <SelectItem value="group">group</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">설명</div>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">포함 좌석</div>
              <Input
                type="number"
                min={1}
                value={form.included_seats}
                onChange={(e) => setForm((p) => ({ ...p, included_seats: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">최소 좌석</div>
              <Input
                type="number"
                min={1}
                value={form.min_seats}
                onChange={(e) => setForm((p) => ({ ...p, min_seats: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">최대 좌석</div>
              <Input
                type="number"
                min={0}
                value={form.max_seats}
                onChange={(e) => setForm((p) => ({ ...p, max_seats: e.target.value }))}
                placeholder="제한 없음"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">추가 좌석 가격(USD)</div>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.extra_seat_price_usd}
                onChange={(e) => setForm((p) => ({ ...p, extra_seat_price_usd: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">저장소 제한(MB)</div>
              <Input
                type="number"
                min={0}
                value={form.storage_limit_mb}
                onChange={(e) => setForm((p) => ({ ...p, storage_limit_mb: e.target.value }))}
                placeholder="제한 없음"
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">정렬 순서</div>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="plan-active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
            />
            <Label htmlFor="plan-active">활성 요금제</Label>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">메타데이터(JSON)</div>
            <Textarea
              rows={4}
              value={form.metadata}
              onChange={(e) => setForm((p) => ({ ...p, metadata: e.target.value }))}
              placeholder='예: {"limits": {"projects": 5}}'
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={savePlan} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={saving ? "ml-2" : ""}>{editing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
