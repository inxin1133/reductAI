import { useEffect, useMemo, useState } from "react"
import { adminFetch } from "@/lib/adminFetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCcw } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"
import { type PlanTier, PLAN_TIER_LABELS, PLAN_TIER_STYLES } from "@/lib/planTier"

type MembershipStatus = "active" | "inactive" | "suspended" | "pending"

type MembershipItem = {
  id: string
  tenant_id: string
  membership_status: MembershipStatus
  joined_at?: string | null
  left_at?: string | null
  is_primary_tenant?: boolean | null
  expires_at?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
  current_member_count?: number | null
  member_limit?: number | null
  included_seats?: number | null
  max_seats?: number | null
  plan_tier?: string | null
  role_name?: string | null
  role_slug?: string | null
  role_scope?: string | null
}

type UserRow = {
  id: string
  email: string
  full_name?: string | null
  status?: string | null
  email_verified?: boolean
  created_at?: string | null
}

type UserMembershipRow = {
  user: UserRow
  membership_count: number
  memberships: MembershipItem[]
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

const API_URL = "/api/users/tenant-memberships"
const FILTER_ALL = "__all__"

const MEMBERSHIP_FILTERS = [
  { value: FILTER_ALL, label: "전체" },
  { value: "single", label: "소속 1개만" },
  { value: "multi", label: "소속 2개 이상" },
]

const ROLE_LABELS: Record<string, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
  viewer: "뷰어",
}

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: "활성",
  pending: "대기",
  suspended: "정지",
  inactive: "비활성",
}

const MEMBERSHIP_STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500",
  pending: "bg-amber-50 text-amber-600 ring-1 ring-amber-500",
  suspended: "bg-rose-50 text-rose-600 ring-1 ring-rose-500",
  inactive: "bg-slate-50 text-slate-600 ring-1 ring-slate-300",
}

const USER_STATUS_LABELS: Record<string, string> = {
  active: "활성",
  inactive: "비활성",
  suspended: "정지",
  locked: "잠김",
}

const USER_STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500",
  inactive: "bg-slate-50 text-slate-600 ring-1 ring-slate-300",
  suspended: "bg-rose-50 text-rose-600 ring-1 ring-rose-500",
  locked: "bg-amber-50 text-amber-600 ring-1 ring-amber-500",
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

function normalizeSeatValue(value?: number | null) {
  if (!Number.isFinite(value)) return null
  return Math.max(0, Number(value))
}

function formatSeatSummary(current?: number | null, included?: number | null, max?: number | null) {
  const safeCurrent = normalizeSeatValue(current) ?? 0
  const safeMax = normalizeSeatValue(max)
  const safeIncluded = normalizeSeatValue(included) ?? safeMax ?? 1
  const maxLabel = safeMax === null ? "∞" : String(safeMax)
  return `${safeCurrent}/${safeIncluded}/${maxLabel}`
}

function planTierBadge(tier?: string | null) {
  const key = (tier || "").toLowerCase() as PlanTier
  const label = PLAN_TIER_LABELS[key] || tier || "-"
  const style = PLAN_TIER_STYLES[key]
  if (!style) {
    return <Badge variant="outline">{label}</Badge>
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}>
      {label}
    </span>
  )
}

export default function TenantMemberships() {
  const [rows, setRows] = useState<UserMembershipRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const limit = 50

  const [q, setQ] = useState("")
  const [membershipFilter, setMembershipFilter] = useState(FILTER_ALL)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (membershipFilter !== FILTER_ALL) params.set("membership", membershipFilter)
    return params.toString()
  }, [limit, page, q, membershipFilter])

  async function fetchMemberships() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}?${queryString}`)
      const json = (await res.json()) as ListResponse<UserMembershipRow>
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
    fetchMemberships()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminPage
      headerContent={
        <Button variant="outline" size="sm" onClick={fetchMemberships} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-2">새로고침</span>
        </Button>
      }
    >
      <div>
        <p className="text-muted-foreground">회원별 테넌트 소속, 역할, 플랜을 한눈에 확인합니다.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="이메일 또는 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-40 space-y-1">
          <div className="text-xs text-muted-foreground">소속 구분</div>
          <Select value={membershipFilter} onValueChange={setMembershipFilter}>
            <SelectTrigger>
              <SelectValue placeholder="membership" />
            </SelectTrigger>
            <SelectContent>
              {MEMBERSHIP_FILTERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          로딩 중...
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          표시할 회원이 없습니다.
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => {
            const statusKey = (row.user.status || "").toLowerCase()
            const userStatusLabel = USER_STATUS_LABELS[statusKey] || row.user.status || "-"
            const userStatusStyle = USER_STATUS_STYLES[statusKey] || USER_STATUS_STYLES.inactive

            return (
              <div
                key={row.user.id}
                className="rounded-xl border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-foreground truncate">
                    {row.user.full_name || row.user.email}
                  </h3>
                  <span className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${userStatusStyle}`}>
                    {userStatusLabel}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{row.user.email}</p>

                {row.memberships.length === 0 ? (
                  <p className="text-xs text-muted-foreground">소속 없음</p>
                ) : (
                  <div className="space-y-3">
                    {row.memberships.map((m) => {
                      const roleSlug = (m.role_slug || "").toLowerCase()
                      const roleLabel = m.role_name || ROLE_LABELS[roleSlug] || "멤버"
                      const msKey = (m.membership_status || "active").toLowerCase()
                      const msLabel = MEMBERSHIP_STATUS_LABELS[msKey] || m.membership_status || "active"
                      const msStyle = MEMBERSHIP_STATUS_STYLES[msKey] || MEMBERSHIP_STATUS_STYLES.active

                      return (
                        <div
                          key={m.id}
                          className="rounded-lg border border-border/60 bg-background p-3.5"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="text-sm font-semibold text-foreground truncate">
                              {m.tenant_name || m.tenant_slug || m.tenant_id}
                            </h4>
                            <span className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${msStyle}`}>
                              {msLabel}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {roleLabel} · {m.tenant_type ? (m.tenant_type.charAt(0).toUpperCase() + m.tenant_type.slice(1)) : "-"} · 좌석{" "}
                            {formatSeatSummary(m.current_member_count, m.included_seats, m.max_seats)}
                          </p>
                          <p className="text-xs text-muted-foreground mb-2">
                            가입 {fmtDate(m.joined_at || null)}
                            {m.expires_at ? ` · 만료 ${fmtDate(m.expires_at)}` : ""}
                          </p>
                          {planTierBadge(m.plan_tier)}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

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
    </AdminPage>
  )
}
