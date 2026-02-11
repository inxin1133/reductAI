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
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Pencil, Plus, RefreshCcw } from "lucide-react"

type TopupRow = {
  id: string
  sku_code: string
  name: string
  price_usd: string | number
  credits: string | number
  bonus_credits: string | number
  currency: string
  is_active: boolean
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: TopupRow[]
}

type FormState = {
  sku_code: string
  name: string
  price_usd: string
  credits: string
  bonus_credits: string
  currency: string
  is_active: boolean
  metadata: string
}

const API_URL = "/api/ai/credits/topup-products"
const FILTER_ALL = "__all__"

const EMPTY_FORM: FormState = {
  sku_code: "",
  name: "",
  price_usd: "",
  credits: "",
  bonus_credits: "0",
  currency: "USD",
  is_active: true,
  metadata: "",
}

function fmtMoney(v: unknown, currency?: string) {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return "-"
  return `${currency || "USD"} ${n.toFixed(2)}`
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

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function TopupProducts() {
  const [rows, setRows] = useState<TopupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [currency, setCurrency] = useState("")
  const [isActive, setIsActive] = useState(FILTER_ALL)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TopupRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (currency.trim()) params.set("currency", currency.trim().toUpperCase())
    if (isActive !== FILTER_ALL) params.set("is_active", isActive)
    return params.toString()
  }, [currency, isActive, limit, page, q])

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
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(row: TopupRow) {
    setEditing(row)
    setForm({
      sku_code: row.sku_code || "",
      name: row.name || "",
      price_usd: String(row.price_usd ?? ""),
      credits: String(row.credits ?? ""),
      bonus_credits: String(row.bonus_credits ?? 0),
      currency: row.currency || "USD",
      is_active: Boolean(row.is_active),
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setDialogOpen(true)
  }

  async function saveProduct() {
    if (!form.sku_code.trim()) return alert("상품 코드를 입력해주세요.")
    if (!form.name.trim()) return alert("상품 이름을 입력해주세요.")
    const priceUsd = Number(form.price_usd)
    if (!Number.isFinite(priceUsd) || priceUsd < 0) return alert("가격을 확인해주세요.")
    const credits = Number(form.credits)
    if (!Number.isFinite(credits) || credits <= 0) return alert("크레딧 수량을 입력해주세요.")
    const bonusCredits = form.bonus_credits.trim() ? Number(form.bonus_credits) : 0
    if (!Number.isFinite(bonusCredits) || bonusCredits < 0) return alert("보너스 크레딧을 확인해주세요.")
    if (!form.currency.trim() || form.currency.trim().length !== 3) return alert("통화 코드를 입력해주세요.")
    const metadataValue = parseJson(form.metadata)
    if (metadataValue === null) return alert("메타데이터 JSON 형식이 올바르지 않습니다.")

    try {
      setSaving(true)
      const res = await adminFetch(editing ? `${API_URL}/${editing.id}` : API_URL, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_code: form.sku_code.trim(),
          name: form.name.trim(),
          price_usd: priceUsd,
          credits: Math.floor(credits),
          bonus_credits: Math.floor(bonusCredits),
          currency: form.currency.trim().toUpperCase(),
          is_active: form.is_active,
          metadata: metadataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await fetchList()
    } catch (e) {
      console.error(e)
      alert("충전 상품 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">충전 상품 관리</div>
        <div className="text-sm text-muted-foreground">credit_topup_products 기준 충전 상품을 관리합니다.</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="SKU/이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-28 space-y-1">
          <div className="text-xs text-muted-foreground">통화</div>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" maxLength={3} />
        </div>
        <div className="w-full md:w-32 space-y-1">
          <div className="text-xs text-muted-foreground">활성</div>
          <Select value={isActive} onValueChange={setIsActive}>
            <SelectTrigger>
              <SelectValue placeholder="활성" />
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
            <span className="ml-2">상품 추가</span>
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>상품명</TableHead>
              <TableHead>가격</TableHead>
              <TableHead>크레딧</TableHead>
              <TableHead>보너스</TableHead>
              <TableHead>통화</TableHead>
              <TableHead>활성</TableHead>
              <TableHead>업데이트</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  표시할 상품이 없습니다.
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
                <TableCell className="font-mono">{row.sku_code}</TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="font-mono">{fmtMoney(row.price_usd, row.currency)}</TableCell>
                <TableCell className="font-mono">{Number(row.credits).toLocaleString()}</TableCell>
                <TableCell className="font-mono">{Number(row.bonus_credits || 0).toLocaleString()}</TableCell>
                <TableCell className="font-mono">{row.currency}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={badgeClass(row.is_active)}>
                    {row.is_active ? "활성" : "비활성"}
                  </Badge>
                </TableCell>
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
            <DialogTitle>{editing ? "충전 상품 수정" : "충전 상품 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">SKU 코드</div>
              <Input value={form.sku_code} onChange={(e) => setForm((p) => ({ ...p, sku_code: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">상품명</div>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">가격(USD)</div>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.price_usd}
                onChange={(e) => setForm((p) => ({ ...p, price_usd: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">크레딧</div>
              <Input
                type="number"
                min={1}
                value={form.credits}
                onChange={(e) => setForm((p) => ({ ...p, credits: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">보너스 크레딧</div>
              <Input
                type="number"
                min={0}
                value={form.bonus_credits}
                onChange={(e) => setForm((p) => ({ ...p, bonus_credits: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">통화</div>
              <Input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="topup-active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
            />
            <Label htmlFor="topup-active">활성</Label>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">메타데이터(JSON)</div>
            <Textarea
              rows={4}
              value={form.metadata}
              onChange={(e) => setForm((p) => ({ ...p, metadata: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={saveProduct} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={saving ? "ml-2" : ""}>{editing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
