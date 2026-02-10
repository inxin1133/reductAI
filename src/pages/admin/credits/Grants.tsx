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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Pencil, Plus, RefreshCcw } from "lucide-react"

type PlanGrantRow = {
  id: string
  plan_slug: string
  plan_name?: string | null
  plan_tier?: string | null
  billing_cycle: "monthly" | "yearly"
  monthly_credits: string | number
  initial_credits: string | number
  credit_type: "subscription" | "topup"
  expires_in_days?: number | null
  is_active: boolean
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type TransferRow = {
  id: string
  from_account_id: string
  to_account_id: string
  transfer_type: "grant" | "revoke"
  amount_credits: string | number
  status: "pending" | "completed" | "revoked" | "cancelled"
  requested_by?: string | null
  approved_by?: string | null
  reason?: string | null
  created_at: string
  completed_at?: string | null
  from_owner_type?: string | null
  from_owner_tenant_id?: string | null
  from_owner_user_id?: string | null
  from_display_name?: string | null
  from_tenant_name?: string | null
  from_tenant_slug?: string | null
  from_user_email?: string | null
  from_user_name?: string | null
  to_owner_type?: string | null
  to_owner_tenant_id?: string | null
  to_owner_user_id?: string | null
  to_display_name?: string | null
  to_tenant_name?: string | null
  to_tenant_slug?: string | null
  to_user_email?: string | null
  to_user_name?: string | null
  requested_email?: string | null
  requested_name?: string | null
  approved_email?: string | null
  approved_name?: string | null
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

type GrantForm = {
  plan_slug: string
  billing_cycle: "monthly" | "yearly"
  credit_type: "subscription" | "topup"
  monthly_credits: string
  initial_credits: string
  expires_in_days: string
  is_active: boolean
  metadata: string
}

const GRANTS_API = "/api/ai/credits/plan-grants"
const TRANSFERS_API = "/api/ai/credits/transfers"
const FILTER_ALL = "__all__"

const EMPTY_FORM: GrantForm = {
  plan_slug: "",
  billing_cycle: "monthly",
  credit_type: "subscription",
  monthly_credits: "0",
  initial_credits: "0",
  expires_in_days: "31",
  is_active: true,
  metadata: "",
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

function statusBadge(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "pending") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "revoked") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function formatOwner(row: TransferRow, prefix: "from" | "to") {
  const ownerType = row[`${prefix}_owner_type` as const]
  const displayName = row[`${prefix}_display_name` as const]
  if (displayName) return displayName
  if (ownerType === "tenant") {
    return row[`${prefix}_tenant_name` as const] || row[`${prefix}_tenant_slug` as const] || row[`${prefix}_owner_tenant_id` as const] || "-"
  }
  if (ownerType === "user") {
    return row[`${prefix}_user_name` as const] || row[`${prefix}_user_email` as const] || row[`${prefix}_owner_user_id` as const] || "-"
  }
  return "-"
}

export default function CreditGrants() {
  const [grantRows, setGrantRows] = useState<PlanGrantRow[]>([])
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantTotal, setGrantTotal] = useState(0)
  const [grantPage, setGrantPage] = useState(0)
  const grantLimit = 50

  const [grantQ, setGrantQ] = useState("")
  const [planSlug, setPlanSlug] = useState("")
  const [billingCycle, setBillingCycle] = useState(FILTER_ALL)
  const [creditType, setCreditType] = useState(FILTER_ALL)
  const [isActive, setIsActive] = useState(FILTER_ALL)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlanGrantRow | null>(null)
  const [form, setForm] = useState<GrantForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [transferRows, setTransferRows] = useState<TransferRow[]>([])
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferTotal, setTransferTotal] = useState(0)
  const [transferPage, setTransferPage] = useState(0)
  const transferLimit = 50

  const [transferQ, setTransferQ] = useState("")
  const [transferType, setTransferType] = useState(FILTER_ALL)
  const [transferStatus, setTransferStatus] = useState(FILTER_ALL)
  const [transferTenantId, setTransferTenantId] = useState("")
  const [fromAccountId, setFromAccountId] = useState("")
  const [toAccountId, setToAccountId] = useState("")

  const grantQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(grantLimit))
    params.set("offset", String(grantPage * grantLimit))
    if (grantQ.trim()) params.set("q", grantQ.trim())
    if (planSlug.trim()) params.set("plan_slug", planSlug.trim())
    if (billingCycle !== FILTER_ALL) params.set("billing_cycle", billingCycle)
    if (creditType !== FILTER_ALL) params.set("credit_type", creditType)
    if (isActive !== FILTER_ALL) params.set("is_active", isActive)
    return params.toString()
  }, [billingCycle, creditType, grantLimit, grantPage, grantQ, isActive, planSlug])

  const transferQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(transferLimit))
    params.set("offset", String(transferPage * transferLimit))
    if (transferQ.trim()) params.set("q", transferQ.trim())
    if (transferType !== FILTER_ALL) params.set("transfer_type", transferType)
    if (transferStatus !== FILTER_ALL) params.set("status", transferStatus)
    if (transferTenantId.trim()) params.set("tenant_id", transferTenantId.trim())
    if (fromAccountId.trim()) params.set("from_account_id", fromAccountId.trim())
    if (toAccountId.trim()) params.set("to_account_id", toAccountId.trim())
    return params.toString()
  }, [fromAccountId, toAccountId, transferLimit, transferPage, transferQ, transferStatus, transferTenantId, transferType])

  async function fetchGrants() {
    setGrantLoading(true)
    try {
      const res = await fetch(`${GRANTS_API}?${grantQuery}`)
      const json = (await res.json()) as ListResponse<PlanGrantRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setGrantRows(json.rows || [])
      setGrantTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setGrantRows([])
      setGrantTotal(0)
    } finally {
      setGrantLoading(false)
    }
  }

  async function fetchTransfers() {
    setTransferLoading(true)
    try {
      const res = await fetch(`${TRANSFERS_API}?${transferQuery}`)
      const json = (await res.json()) as ListResponse<TransferRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setTransferRows(json.rows || [])
      setTransferTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setTransferRows([])
      setTransferTotal(0)
    } finally {
      setTransferLoading(false)
    }
  }

  useEffect(() => {
    fetchGrants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantQuery])

  useEffect(() => {
    fetchTransfers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferQuery])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(row: PlanGrantRow) {
    setEditing(row)
    setForm({
      plan_slug: row.plan_slug || "",
      billing_cycle: row.billing_cycle,
      credit_type: row.credit_type,
      monthly_credits: String(row.monthly_credits ?? 0),
      initial_credits: String(row.initial_credits ?? 0),
      expires_in_days: row.expires_in_days !== null && row.expires_in_days !== undefined ? String(row.expires_in_days) : "",
      is_active: Boolean(row.is_active),
      metadata: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
    })
    setDialogOpen(true)
  }

  async function saveGrant() {
    if (!form.plan_slug.trim()) return alert("플랜 slug를 입력해주세요.")
    const monthlyCredits = Number(form.monthly_credits)
    const initialCredits = Number(form.initial_credits)
    const expiresInDays = form.expires_in_days.trim() ? Number(form.expires_in_days) : null
    if (!Number.isFinite(monthlyCredits) || monthlyCredits < 0) return alert("월간 크레딧을 확인해주세요.")
    if (!Number.isFinite(initialCredits) || initialCredits < 0) return alert("초기 크레딧을 확인해주세요.")
    if (expiresInDays !== null && (!Number.isFinite(expiresInDays) || expiresInDays < 0)) {
      return alert("만료 일 수를 확인해주세요.")
    }
    const metadataValue = parseJson(form.metadata)
    if (metadataValue === null) return alert("메타데이터 JSON 형식이 올바르지 않습니다.")

    try {
      setSaving(true)
      const res = await fetch(editing ? `${GRANTS_API}/${editing.id}` : GRANTS_API, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_slug: form.plan_slug.trim(),
          billing_cycle: form.billing_cycle,
          credit_type: form.credit_type,
          monthly_credits: Math.floor(monthlyCredits),
          initial_credits: Math.floor(initialCredits),
          expires_in_days: expiresInDays,
          is_active: form.is_active,
          metadata: metadataValue,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error("FAILED_SAVE")
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await fetchGrants()
    } catch (e) {
      console.error(e)
      alert("그랜트 정책 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const grantPageCount = Math.max(1, Math.ceil(grantTotal / grantLimit))
  const transferPageCount = Math.max(1, Math.ceil(transferTotal / transferLimit))

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">그랜트/분배 정책</div>
        <div className="text-sm text-muted-foreground">credit_plan_grants, credit_transfers</div>
      </div>

      <Tabs defaultValue="grants">
        <TabsList>
          <TabsTrigger value="grants">분배 정책</TabsTrigger>
          <TabsTrigger value="transfers">분배 내역</TabsTrigger>
        </TabsList>

        <TabsContent value="grants" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="플랜 slug/이름 검색" value={grantQ} onChange={(e) => setGrantQ(e.target.value)} />
            </div>
            <div className="w-full md:w-48 space-y-1">
              <div className="text-xs text-muted-foreground">플랜 slug</div>
              <Input value={planSlug} onChange={(e) => setPlanSlug(e.target.value)} placeholder="free/pro/..." />
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">주기</div>
              <Select value={billingCycle} onValueChange={setBillingCycle}>
                <SelectTrigger>
                  <SelectValue placeholder="주기" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="monthly">monthly</SelectItem>
                  <SelectItem value="yearly">yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">타입</div>
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
              <Button variant="outline" size="sm" onClick={fetchGrants} disabled={grantLoading}>
                {grantLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                <span className="ml-2">새로고침</span>
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                <span className="ml-2">정책 추가</span>
              </Button>
            </div>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>플랜</TableHead>
                  <TableHead>주기</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>월간</TableHead>
                  <TableHead>초기</TableHead>
                  <TableHead>만료일</TableHead>
                  <TableHead>활성</TableHead>
                  <TableHead>업데이트</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grantRows.length === 0 && !grantLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      표시할 정책이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {grantLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {grantRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.plan_name || row.plan_slug}</span>
                        <span className="text-xs text-muted-foreground font-mono">{row.plan_slug}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{row.billing_cycle}</TableCell>
                    <TableCell className="font-mono">{row.credit_type}</TableCell>
                    <TableCell className="font-mono">{Number(row.monthly_credits).toLocaleString()}</TableCell>
                    <TableCell className="font-mono">{Number(row.initial_credits).toLocaleString()}</TableCell>
                    <TableCell className="font-mono">{row.expires_in_days ?? "-"}</TableCell>
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
            <div className="text-muted-foreground">총 {grantTotal}건</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={grantPage <= 0}
                onClick={() => setGrantPage((p) => Math.max(0, p - 1))}
              >
                이전
              </Button>
              <span className="text-muted-foreground">
                {grantPage + 1} / {grantPageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={grantPage + 1 >= grantPageCount}
                onClick={() => setGrantPage((p) => Math.min(grantPageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transfers" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="테넌트/사용자 검색" value={transferQ} onChange={(e) => setTransferQ(e.target.value)} />
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">유형</div>
              <Select value={transferType} onValueChange={setTransferType}>
                <SelectTrigger>
                  <SelectValue placeholder="유형" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="grant">grant</SelectItem>
                  <SelectItem value="revoke">revoke</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-36 space-y-1">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select value={transferStatus} onValueChange={setTransferStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="completed">completed</SelectItem>
                  <SelectItem value="revoked">revoked</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-56 space-y-1">
              <div className="text-xs text-muted-foreground">테넌트 ID</div>
              <Input value={transferTenantId} onChange={(e) => setTransferTenantId(e.target.value)} placeholder="tenant_id" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchTransfers} disabled={transferLoading}>
                {transferLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                <span className="ml-2">새로고침</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="w-full md:w-60 space-y-1">
              <div className="text-xs text-muted-foreground">From 계정</div>
              <Input value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} placeholder="from_account_id" />
            </div>
            <div className="w-full md:w-60 space-y-1">
              <div className="text-xs text-muted-foreground">To 계정</div>
              <Input value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} placeholder="to_account_id" />
            </div>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>유형</TableHead>
                  <TableHead>수량</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>요청/승인</TableHead>
                  <TableHead>생성/완료</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transferRows.length === 0 && !transferLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      표시할 분배 내역이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {transferLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {transferRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">{row.transfer_type}</TableCell>
                    <TableCell className="font-mono">{Number(row.amount_credits).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{formatOwner(row, "from")}</span>
                        <span className="text-xs text-muted-foreground font-mono">{row.from_account_id.slice(0, 8)}...</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{formatOwner(row, "to")}</span>
                        <span className="text-xs text-muted-foreground font-mono">{row.to_account_id.slice(0, 8)}...</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadge(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{row.requested_name || row.requested_email || "-"}</div>
                      <div className="text-muted-foreground">{row.approved_name || row.approved_email || "-"}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{fmtDate(row.created_at)}</div>
                      <div>{fmtDate(row.completed_at)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">총 {transferTotal}건</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={transferPage <= 0}
                onClick={() => setTransferPage((p) => Math.max(0, p - 1))}
              >
                이전
              </Button>
              <span className="text-muted-foreground">
                {transferPage + 1} / {transferPageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={transferPage + 1 >= transferPageCount}
                onClick={() => setTransferPage((p) => Math.min(transferPageCount - 1, p + 1))}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "분배 정책 수정" : "분배 정책 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-sm font-medium">플랜 slug</div>
              <Input
                value={form.plan_slug}
                onChange={(e) => setForm((p) => ({ ...p, plan_slug: e.target.value }))}
                disabled={Boolean(editing)}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">주기</div>
              <Select
                value={form.billing_cycle}
                onValueChange={(v) => setForm((p) => ({ ...p, billing_cycle: v as GrantForm["billing_cycle"] }))}
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="주기 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">monthly</SelectItem>
                  <SelectItem value="yearly">yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">타입</div>
              <Select
                value={form.credit_type}
                onValueChange={(v) => setForm((p) => ({ ...p, credit_type: v as GrantForm["credit_type"] }))}
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="타입 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscription">subscription</SelectItem>
                  <SelectItem value="topup">topup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">만료 일수</div>
              <Input
                type="number"
                min={0}
                value={form.expires_in_days}
                onChange={(e) => setForm((p) => ({ ...p, expires_in_days: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">월간 크레딧</div>
              <Input
                type="number"
                min={0}
                value={form.monthly_credits}
                onChange={(e) => setForm((p) => ({ ...p, monthly_credits: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">초기 크레딧</div>
              <Input
                type="number"
                min={0}
                value={form.initial_credits}
                onChange={(e) => setForm((p) => ({ ...p, initial_credits: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="grant-active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
            />
            <Label htmlFor="grant-active">활성</Label>
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
            <Button onClick={saveGrant} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className={saving ? "ml-2" : ""}>{editing ? "저장" : "생성"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
