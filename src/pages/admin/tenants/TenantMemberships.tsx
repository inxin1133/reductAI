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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCcw } from "lucide-react"

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
  { value: "has", label: "소속 있음" },
  { value: "none", label: "소속 없음" },
]

const ROLE_LABELS: Record<string, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
  viewer: "뷰어",
}

const PLAN_TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
  business: "Business",
  enterprise: "Enterprise",
}

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: "활성",
  pending: "대기",
  suspended: "정지",
  inactive: "비활성",
}

const MEMBERSHIP_STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  suspended: "bg-rose-50 text-rose-700 border-rose-200",
  inactive: "bg-slate-50 text-slate-600 border-slate-200",
}

const USER_STATUS_LABELS: Record<string, string> = {
  active: "활성",
  inactive: "비활성",
  suspended: "정지",
  locked: "잠김",
}

const USER_STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-slate-50 text-slate-600 border-slate-200",
  suspended: "bg-rose-50 text-rose-700 border-rose-200",
  locked: "bg-amber-50 text-amber-700 border-amber-200",
}

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
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
    <div className="space-y-4 bg-background">
      <div>
        <p className="text-muted-foreground">회원별 테넌트 소속, 역할, 플랜을 한눈에 확인합니다.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-1">
          <div className="text-xs text-muted-foreground">검색</div>
          <Input placeholder="이메일 또는 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-full md:w-40 space-y-1">
          <div className="text-xs text-muted-foreground">소속 여부</div>
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchMemberships} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>사용자</TableHead>
              <TableHead className="w-[120px]">소속 수</TableHead>
              <TableHead>테넌트/역할/플랜</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  표시할 회원이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => {
              const statusKey = String(row.user.status || "").toLowerCase()
              const userStatusLabel = USER_STATUS_LABELS[statusKey] || row.user.status || "-"
              const userStatusStyle = USER_STATUS_STYLES[statusKey] || "bg-slate-50 text-slate-600 border-slate-200"
              return (
                <TableRow key={row.user.id}>
                  <TableCell>
                    <div className="text-sm text-foreground">{row.user.full_name || row.user.email}</div>
                    <div className="text-xs text-muted-foreground">{row.user.email}</div>
                    {row.user.status ? (
                      <Badge variant="outline" className={`mt-2 ${userStatusStyle}`}>
                        {userStatusLabel}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">{row.membership_count}</TableCell>
                  <TableCell>
                    {row.memberships.length ? (
                      <div className="space-y-2">
                        {row.memberships.map((membership) => {
                          const roleSlug = String(membership.role_slug || "").toLowerCase()
                          const roleLabel = membership.role_name || ROLE_LABELS[roleSlug] || "멤버"
                          const membershipStatusKey = String(membership.membership_status || "active").toLowerCase()
                          const membershipStatusLabel =
                            MEMBERSHIP_STATUS_LABELS[membershipStatusKey] || membership.membership_status || "active"
                          const membershipStatusStyle =
                            MEMBERSHIP_STATUS_STYLES[membershipStatusKey] || MEMBERSHIP_STATUS_STYLES.active
                          const planKey = String(membership.plan_tier || "").toLowerCase()
                          const planLabel = PLAN_TIER_LABELS[planKey] || membership.plan_tier || "-"

                          return (
                            <div
                              key={membership.id}
                              className="flex flex-col gap-2 rounded-md border border-border/60 px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 text-sm text-foreground">
                                    <span className="truncate">
                                      {membership.tenant_name || membership.tenant_slug || membership.tenant_id}
                                    </span>
                                    {membership.is_primary_tenant ? (
                                      <Badge variant="secondary">기본</Badge>
                                    ) : null}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {roleLabel} · {membership.role_scope || "-"} · {membership.tenant_type || "-"}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline">{planLabel}</Badge>
                                  <Badge variant="outline" className={membershipStatusStyle}>
                                    {membershipStatusLabel}
                                  </Badge>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                가입 {fmtDate(membership.joined_at || null)}
                                {membership.expires_at ? ` · 만료 ${fmtDate(membership.expires_at)}` : ""}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">소속 없음</div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
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
    </div>
  )
}
