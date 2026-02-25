import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Box, CirclePause, Coins, Database, Gauge, HardDrive, Menu, PackageOpen, ShieldCheck, UserPlus, UserRoundCheck, Users, UsersRound, X, ChevronsUp, Settings2, HandCoins, EvCharger, } from "lucide-react"
import { cn } from "@/lib/utils"
import { type PlanTier, PLAN_TIER_LABELS, PLAN_TIER_ORDER, PLAN_TIER_STYLES } from "@/lib/planTier"
import { withActiveTenantHeader } from "@/lib/tenantContext"

type TenantSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenPlanDialog?: () => void
}

type MenuId = "info" | "members" | "invitations" | "credits" | "topupCredits" | "usage"

const MENU_ITEMS: Array<{ id: MenuId; label: string; icon: typeof Box }> = [
  { id: "info", label: "테넌트 정보", icon: Box },
  { id: "members", label: "멤버 관리", icon: Users },
  { id: "invitations", label: "멤버 초대 관리", icon: UserPlus },
  { id: "credits", label: "서비스 크레딧 운영", icon: Coins },
  { id: "topupCredits", label: "충전 크레딧 운영", icon: HandCoins },
  { id: "usage", label: "사용내역", icon: Gauge },

]

const TENANT_MENU_STORAGE_KEY = "reductai:tenantSettings:activeMenu"
const TENANT_MENU_IDS = new Set<MenuId>(MENU_ITEMS.map((item) => item.id))

type CurrentTenantProfile = {
  id: string
  name?: string | null
  tenant_type?: string | null
  plan_tier?: string | null
}

type TenantMembership = {
  id: string
  name?: string | null
  tenant_type?: string | null
  plan_tier?: string | null
  member_limit?: number | null
  current_member_count?: number | null
  member_count?: number | null
  role_slug?: string | null
  is_primary?: boolean
}

type CreditSummary = {
  ok?: boolean
  message?: string
  subscription?: {
    grant_monthly?: number | null
    plan_tier?: string | null
  } | null
}

type TenantMemberRow = {
  id: string
  user_id?: string | null
  user_name?: string | null
  user_email?: string | null
  profile_image_asset_id?: string | null
  role_slug?: string | null
  role_name?: string | null
  membership_status?: string | null
  joined_at?: string | null
  left_at?: string | null
}

type TenantInvitationRow = {
  id: string
  tenant_id: string
  invitee_email: string
  invitee_user_id?: string | null
  membership_role?: string | null
  status?: string | null
  expires_at?: string | null
  created_at?: string | null
  inviter_name?: string | null
  inviter_email?: string | null
}

const TENANT_TYPE_LABELS: Record<string, string> = {
  personal: "Personal",
  team: "Team",
  group: "Group",
}

const ROLE_LABELS: Record<string, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
  viewer: "뷰어",
  tenant_owner: "소유자",
  tenant_admin: "관리자",
}

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: "활성",
  pending: "대기",
  suspended: "정지",
  inactive: "비활성",
}

const MEMBERSHIP_STATUS_STYLES: Record<string, string> = {
  active: "text-teal-600 bg-teal-50 ring-teal-500",
  pending: "text-amber-600 bg-amber-50 ring-amber-500",
  suspended: "text-rose-600 bg-rose-50 ring-rose-500",
  inactive: "text-slate-500 bg-slate-50 ring-slate-300",
}

const INVITATION_STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  accepted: "수락",
  rejected: "거절",
  cancelled: "취소",
  expired: "만료",
}

const INVITATION_STATUS_STYLES: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50 ring-amber-500",
  accepted: "text-emerald-600 bg-emerald-50 ring-emerald-500",
  rejected: "text-rose-600 bg-rose-50 ring-rose-500",
  cancelled: "text-slate-500 bg-slate-100 ring-slate-300",
  expired: "text-slate-400 bg-slate-50 ring-slate-200",
}

const INVITATION_ROLE_LABELS: Record<string, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
  viewer: "뷰어",
}

const INVITATION_ROLE_OPTIONS = [
  { value: "admin", label: "관리자" },
  { value: "member", label: "멤버" },
  { value: "viewer", label: "뷰어" },
] as const

const ROLE_OPTIONS = [
  { value: "owner", label: "소유자" },
  { value: "admin", label: "관리자" },
  { value: "member", label: "멤버" },
  { value: "viewer", label: "뷰어" },
] as const

const STATUS_OPTIONS = [
  { value: "active", label: "활성" },
  { value: "pending", label: "대기" },
  { value: "suspended", label: "정지" },
  { value: "inactive", label: "비활성" },
] as const

function normalizePlanTier(value: unknown): PlanTier | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!raw) return null
  if (PLAN_TIER_ORDER.includes(raw as PlanTier)) return raw as PlanTier
  return null
}

function resolveServiceTier(info: { tenant_type?: string | null; plan_tier?: string | null }): PlanTier {
  const tier = normalizePlanTier(info.plan_tier)
  if (tier) return tier
  const type = String(info.tenant_type || "")
  if (type === "personal") return "free"
  if (type === "team" || type === "group") return "premium"
  return "free"
}

const CANONICAL_ROLE_SLUGS = new Set(["owner", "admin", "member", "viewer"])
const MANAGEMENT_ROLE_SLUGS = new Set(["owner", "admin", "tenant_owner", "tenant_admin"])

function normalizeRoleSlug(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (raw === "tenant_owner") return "owner"
  if (raw === "tenant_admin") return "admin"
  if (CANONICAL_ROLE_SLUGS.has(raw)) return raw
  return "member"
}

function normalizeMembershipStatus(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (raw === "pending" || raw === "suspended" || raw === "inactive") return raw
  return "active"
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return "-"
  }
}

function resolveMemberName(row: TenantMemberRow) {
  const name = String(row.user_name || "").trim()
  if (name) return name
  const email = String(row.user_email || "").trim()
  if (email) return email.split("@")[0] || email
  return "사용자"
}

function resolveMemberInitial(row: TenantMemberRow) {
  const base = resolveMemberName(row)
  const trimmed = String(base || "").trim()
  return trimmed ? trimmed.slice(0, 1) : "?"
}

function readTenantMenuFromStorage(): MenuId | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(TENANT_MENU_STORAGE_KEY)
    if (!raw) return null
    return TENANT_MENU_IDS.has(raw as MenuId) ? (raw as MenuId) : null
  } catch {
    return null
  }
}

function writeTenantMenuToStorage(value: MenuId) {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(TENANT_MENU_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

const TenantSettingsSidebarMenu = ({
  activeId,
  onChange,
}: {
  activeId: MenuId
  onChange: (id: MenuId) => void
}) => (
  <div className="flex flex-col p-2">
    <div className="flex h-8 items-center px-2 text-xs text-sidebar-foreground/70">테넌트 관리</div>
    <div className="flex flex-col gap-1">
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground transition-colors hover:bg-accent",
              activeId === item.id && "bg-accent"
            )}
            onClick={() => onChange(item.id)}
          >
            <Icon className="size-5 shrink-0" />
            <span className="text-sm">{item.label}</span>
          </button>
        )
      })}
    </div>
  </div>
)




export function TenantSettingsDialog({ open, onOpenChange, onOpenPlanDialog }: TenantSettingsDialogProps) {
  const [activeMenu, setActiveMenu] = useState<MenuId>(() => readTenantMenuFromStorage() ?? "info")
  const [usagePage, setUsagePage] = useState(1)
  const wasOpenRef = useRef(false)
  const [currentTenant, setCurrentTenant] = useState<CurrentTenantProfile | null>(null)
  const [tenantMemberships, setTenantMemberships] = useState<TenantMembership[]>([])
  const [tenantInfoLoading, setTenantInfoLoading] = useState(false)
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null)
  const [creditLoading, setCreditLoading] = useState(false)
  const [pendingPlanDialogOpen, setPendingPlanDialogOpen] = useState(false)
  const [tenantMembers, setTenantMembers] = useState<TenantMemberRow[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [memberDialogTarget, setMemberDialogTarget] = useState<TenantMemberRow | null>(null)
  const [memberDialogRole, setMemberDialogRole] = useState("member")
  const [memberDialogStatus, setMemberDialogStatus] = useState("active")
  const [memberSaving, setMemberSaving] = useState(false)
  const [memberActionError, setMemberActionError] = useState<string | null>(null)
  const [tenantInvitations, setTenantInvitations] = useState<TenantInvitationRow[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteActionLoadingId, setInviteActionLoadingId] = useState<string | null>(null)
  const [inviteActionError, setInviteActionError] = useState<string | null>(null)

  const activeLabel = useMemo(
    () => MENU_ITEMS.find((item) => item.id === activeMenu)?.label ?? "테넌트 정보",
    [activeMenu]
  )
  const usageRows = useMemo(
    () => [
      { date: "2026-02-10", model: "GPT-5.2", user: "홍길동", usage: "15,400 tokens", credits: "2,120" },
      { date: "2026-02-10", model: "Gemini 3 Pro", user: "김하늘", usage: "8,120 tokens", credits: "1,040" },
      { date: "2026-02-09", model: "Sora 2", user: "박지민", usage: "영상 20초", credits: "980" },
      { date: "2026-02-08", model: "GPT-5.2", user: "이수진", usage: "12,350 tokens", credits: "1,840" },
      { date: "2026-02-07", model: "Gemini 3 Pro", user: "최민호", usage: "입력 5K / 출력 2K", credits: "920" },
      { date: "2026-02-07", model: "GPT-5.2", user: "김하늘", usage: "입력 9K / 출력 3K", credits: "1,420" },
      { date: "2026-02-06", model: "Sora 2", user: "홍길동", usage: "영상 12초", credits: "650" },
      { date: "2026-02-06", model: "Gemini 3 Pro", user: "박지민", usage: "입력 7K / 출력 2K", credits: "980" },
      { date: "2026-02-05", model: "GPT-5.2", user: "이수진", usage: "입력 10K / 출력 4K", credits: "1,760" },
      { date: "2026-02-05", model: "Sora 2", user: "최민호", usage: "영상 18초", credits: "780" },
    ],
    []
  )
  const usagePageSize = 10
  const usageTotalPages = Math.max(1, Math.ceil(usageRows.length / usagePageSize))
  const usagePageSafe = Math.min(usagePage, usageTotalPages)
  const usagePageRows = useMemo(() => {
    const start = (usagePageSafe - 1) * usagePageSize
    return usageRows.slice(start, start + usagePageSize)
  }, [usagePageSafe, usagePageSize, usageRows])
  const authHeaders = useCallback(() => {
    if (typeof window === "undefined") return {}
    const token = window.localStorage.getItem("token")
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return withActiveTenantHeader(headers)
  }, [])

  const loadTenantInfo = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setCurrentTenant(null)
      setTenantMemberships([])
      return
    }
    setTenantInfoLoading(true)
    try {
      const [tenantRes, membershipsRes] = await Promise.all([
        fetch("/api/posts/tenant/current", { headers }),
        fetch("/api/posts/tenant/memberships", { headers }),
      ])
      if (tenantRes.ok) {
        const tenantJson = (await tenantRes.json().catch(() => null)) as CurrentTenantProfile | null
        if (tenantJson?.id) {
          setCurrentTenant({
            id: String(tenantJson.id),
            name: tenantJson.name ?? null,
            tenant_type: tenantJson.tenant_type ?? null,
            plan_tier: tenantJson.plan_tier ?? null,
          })
        } else {
          setCurrentTenant(null)
        }
      } else {
        setCurrentTenant(null)
      }

      if (membershipsRes.ok) {
        const membershipsJson = (await membershipsRes.json().catch(() => [])) as TenantMembership[]
        setTenantMemberships(Array.isArray(membershipsJson) ? membershipsJson : [])
      } else {
        setTenantMemberships([])
      }
    } catch (error) {
      console.error(error)
      setCurrentTenant(null)
      setTenantMemberships([])
    } finally {
      setTenantInfoLoading(false)
    }
  }, [authHeaders])

  const loadCreditSummary = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setCreditSummary(null)
      return
    }
    setCreditLoading(true)
    try {
      const res = await fetch("/api/ai/credits/my/summary", { headers })
      const json = (await res.json().catch(() => null)) as CreditSummary | null
      if (!res.ok || !json?.ok) {
        setCreditSummary(null)
        return
      }
      setCreditSummary(json)
    } catch (error) {
      console.error(error)
      setCreditSummary(null)
    } finally {
      setCreditLoading(false)
    }
  }, [authHeaders])

  const loadTenantMembers = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setTenantMembers([])
      setMembersError("로그인이 필요합니다.")
      return
    }
    setMembersLoading(true)
    setMembersError(null)
    try {
      const res = await fetch("/api/posts/tenant/members", { headers })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; rows?: TenantMemberRow[] } | null
      if (!res.ok || !json?.ok) {
        setMembersError(json?.message || "멤버 정보를 불러오지 못했습니다.")
        setTenantMembers([])
        return
      }
      setTenantMembers(Array.isArray(json.rows) ? json.rows : [])
    } catch (error) {
      console.error(error)
      setMembersError("멤버 정보를 불러오지 못했습니다.")
      setTenantMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [authHeaders])

  const loadTenantInvitations = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setTenantInvitations([])
      setInviteError("로그인이 필요합니다.")
      return
    }
    setInviteLoading(true)
    setInviteError(null)
    try {
      const res = await fetch("/api/posts/tenant/invitations", { headers })
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; rows?: TenantInvitationRow[] }
        | null
      if (!res.ok || !json?.ok) {
        setInviteError(json?.message || "초대 내역을 불러오지 못했습니다.")
        setTenantInvitations([])
        return
      }
      setTenantInvitations(Array.isArray(json.rows) ? json.rows : [])
    } catch (error) {
      console.error(error)
      setInviteError("초대 내역을 불러오지 못했습니다.")
      setTenantInvitations([])
    } finally {
      setInviteLoading(false)
    }
  }, [authHeaders])


  const currentMembership = useMemo(() => {
    if (!currentTenant?.id) return null
    return tenantMemberships.find((item) => String(item.id) === String(currentTenant.id)) ?? null
  }, [currentTenant?.id, tenantMemberships])

  const isOwner = useMemo(() => {
    const roleSlug = String(currentMembership?.role_slug || "").toLowerCase()
    return roleSlug === "owner" || roleSlug === "tenant_owner"
  }, [currentMembership?.role_slug])

  const canManageMembers = useMemo(() => {
    const roleSlug = String(currentMembership?.role_slug || "").toLowerCase()
    return MANAGEMENT_ROLE_SLUGS.has(roleSlug)
  }, [currentMembership?.role_slug])

  const resolvedPlanTier = useMemo(
    () =>
      currentTenant
        ? resolveServiceTier({
            tenant_type: currentTenant.tenant_type,
            plan_tier: currentMembership?.plan_tier ?? currentTenant.plan_tier,
          })
        : null,
    [currentMembership?.plan_tier, currentTenant]
  )

  const tenantNameValue =
    !currentTenant && tenantInfoLoading ? "불러오는 중..." : String(currentTenant?.name || "").trim() || "-"
  const tenantTypeValue =
    !currentTenant && tenantInfoLoading
      ? "불러오는 중..."
      : TENANT_TYPE_LABELS[String(currentTenant?.tenant_type || "")] || "-"
  const planBadge = !currentTenant && tenantInfoLoading ? (
    <span className="text-xs text-muted-foreground">불러오는 중...</span>
  ) : resolvedPlanTier ? (
    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", PLAN_TIER_STYLES[resolvedPlanTier].badge)}>
      {PLAN_TIER_LABELS[resolvedPlanTier]}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">-</span>
  )

  const memberCountRaw = currentMembership?.current_member_count ?? currentMembership?.member_count
  const memberLimitRaw = currentMembership?.member_limit
  const memberCount = typeof memberCountRaw === "number" ? memberCountRaw : 0
  const memberLimit = typeof memberLimitRaw === "number" ? memberLimitRaw : null
  const seatValue =
    !currentMembership && tenantInfoLoading
      ? "불러오는 중..."
      : memberLimit
        ? `${memberCount}/${memberLimit}명`
        : memberCount
          ? `${memberCount}명`
          : "-"

  const monthlyCredits = creditSummary?.subscription?.grant_monthly
  const monthlyCreditsValue = creditLoading
    ? "불러오는 중..."
    : typeof monthlyCredits === "number"
      ? `${monthlyCredits.toLocaleString()} 크레딧`
      : "-"

  const memberStatusCounts = useMemo(() => {
    const counts = { active: 0, pending: 0, suspended: 0, inactive: 0 }
    tenantMembers.forEach((row) => {
      const status = normalizeMembershipStatus(row.membership_status)
      if (status in counts) counts[status as keyof typeof counts] += 1
    })
    return counts
  }, [tenantMembers])

  const membersActiveRows = useMemo(
    () => tenantMembers.filter((row) => normalizeMembershipStatus(row.membership_status) !== "inactive"),
    [tenantMembers]
  )

  const membersInactiveRows = useMemo(
    () => tenantMembers.filter((row) => normalizeMembershipStatus(row.membership_status) === "inactive"),
    [tenantMembers]
  )

  const totalSeatsValue = membersLoading
    ? "-"
    : memberLimit !== null
      ? String(memberLimit)
      : String(memberStatusCounts.active + memberStatusCounts.pending + memberStatusCounts.suspended)

  const invitationStatusCounts = useMemo(() => {
    const counts = { pending: 0, accepted: 0, rejected: 0, cancelled: 0, expired: 0 }
    tenantInvitations.forEach((row) => {
      const key = String(row.status || "").toLowerCase()
      if (key in counts) counts[key as keyof typeof counts] += 1
    })
    return counts
  }, [tenantInvitations])

  const invitationOtherCount =
    invitationStatusCounts.rejected + invitationStatusCounts.cancelled + invitationStatusCounts.expired

  const handleOpenMemberDialog = useCallback(
    (row: TenantMemberRow) => {
      setMemberDialogTarget(row)
      setMemberDialogRole(normalizeRoleSlug(row.role_slug))
      setMemberDialogStatus(normalizeMembershipStatus(row.membership_status))
      setMemberActionError(null)
      setMemberDialogOpen(true)
    },
    []
  )

  const handleSaveMember = useCallback(async () => {
    if (!memberDialogTarget || !canManageMembers) return
    const headers = authHeaders()
    if (!headers.Authorization) {
      setMemberActionError("로그인이 필요합니다.")
      return
    }
    setMemberSaving(true)
    setMemberActionError(null)
    try {
      const res = await fetch(`/api/posts/tenant/members/${encodeURIComponent(memberDialogTarget.id)}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          role_slug: memberDialogRole,
          membership_status: memberDialogStatus,
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => "")
        setMemberActionError(msg || "멤버 정보를 저장하지 못했습니다.")
        return
      }
      setMemberDialogOpen(false)
      await loadTenantMembers()
    } catch (error) {
      console.error(error)
      setMemberActionError("멤버 정보를 저장하지 못했습니다.")
    } finally {
      setMemberSaving(false)
    }
  }, [authHeaders, canManageMembers, loadTenantMembers, memberDialogRole, memberDialogStatus, memberDialogTarget])

  const handleRemoveMember = useCallback(async () => {
    if (!memberDialogTarget || !canManageMembers) return
    const ok = window.confirm("해당 멤버를 테넌트에서 제외할까요?")
    if (!ok) return
    const headers = authHeaders()
    if (!headers.Authorization) {
      setMemberActionError("로그인이 필요합니다.")
      return
    }
    setMemberSaving(true)
    setMemberActionError(null)
    try {
      const res = await fetch(`/api/posts/tenant/members/${encodeURIComponent(memberDialogTarget.id)}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          membership_status: "inactive",
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => "")
        setMemberActionError(msg || "멤버 제외에 실패했습니다.")
        return
      }
      setMemberDialogOpen(false)
      await loadTenantMembers()
    } catch (error) {
      console.error(error)
      setMemberActionError("멤버 제외에 실패했습니다.")
    } finally {
      setMemberSaving(false)
    }
  }, [authHeaders, canManageMembers, loadTenantMembers, memberDialogTarget])

  const handleCreateInvitation = useCallback(async () => {
    if (!canManageMembers) return
    const email = inviteEmail.trim()
    if (!email) {
      setInviteActionError("초대할 이메일을 입력해 주세요.")
      return
    }
    setInviteSaving(true)
    setInviteActionError(null)
    try {
      const headers = authHeaders()
      const res = await fetch("/api/posts/tenant/invitations", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ invitee_email: email, membership_role: inviteRole }),
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null
      if (!res.ok || !json?.ok) {
        setInviteActionError(json?.message || "초대 생성에 실패했습니다.")
        return
      }
      setInviteDialogOpen(false)
      setInviteEmail("")
      setInviteRole("member")
      await loadTenantInvitations()
    } catch (error) {
      console.error(error)
      setInviteActionError("초대 생성에 실패했습니다.")
    } finally {
      setInviteSaving(false)
    }
  }, [authHeaders, canManageMembers, inviteEmail, inviteRole, loadTenantInvitations])

  const handleCancelInvitation = useCallback(
    async (invitationId: string) => {
      if (!canManageMembers) return
      const ok = window.confirm("해당 초대를 취소할까요?")
      if (!ok) return
      setInviteActionLoadingId(invitationId)
      setInviteActionError(null)
      try {
        const headers = authHeaders()
        const res = await fetch(`/api/posts/tenant/invitations/${encodeURIComponent(invitationId)}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        })
        const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null
        if (!res.ok || !json?.ok) {
          setInviteActionError(json?.message || "초대 취소에 실패했습니다.")
          return
        }
        await loadTenantInvitations()
      } catch (error) {
        console.error(error)
        setInviteActionError("초대 취소에 실패했습니다.")
      } finally {
        setInviteActionLoadingId(null)
      }
    },
    [authHeaders, canManageMembers, loadTenantInvitations]
  )

  const handleUpgrade = useCallback(() => {
    if (!onOpenPlanDialog) return
    setPendingPlanDialogOpen(true)
    onOpenChange(false)
  }, [onOpenChange, onOpenPlanDialog])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    const stored = readTenantMenuFromStorage()
    if (stored) setActiveMenu(stored)
  }, [open])

  useEffect(() => {
    writeTenantMenuToStorage(activeMenu)
  }, [activeMenu])
  useEffect(() => {
    if (usagePage > usageTotalPages) setUsagePage(usageTotalPages)
  }, [usagePage, usageTotalPages])
  useEffect(() => {
    if (!open) return
    void loadTenantInfo()
    void loadCreditSummary()
  }, [loadCreditSummary, loadTenantInfo, open])
  useEffect(() => {
    if (!open) return
    if (activeMenu !== "members") return
    void loadTenantMembers()
  }, [activeMenu, loadTenantMembers, open])
  useEffect(() => {
    if (!open) return
    if (activeMenu !== "invitations") return
    void loadTenantInvitations()
  }, [activeMenu, loadTenantInvitations, open])
  useEffect(() => {
    if (memberDialogOpen) return
    setMemberDialogTarget(null)
    setMemberActionError(null)
  }, [memberDialogOpen])
  useEffect(() => {
    if (inviteDialogOpen) return
    setInviteEmail("")
    setInviteRole("member")
    setInviteActionError(null)
  }, [inviteDialogOpen])
  useEffect(() => {
    if (open) return
    if (!pendingPlanDialogOpen) return
    onOpenPlanDialog?.()
    setPendingPlanDialogOpen(false)
  }, [onOpenPlanDialog, open, pendingPlanDialogOpen])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-48px)] overflow-hidden rounded-xl border border-border p-0 shadow-lg sm:max-w-[min(1000px,calc(100%-48px))]"
      >
        <div className="flex h-[700px] max-h-[calc(100vh-2rem)] w-full bg-background">
          <div className="hidden w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            <TenantSettingsSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger
                    className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
                    aria-label="메뉴"
                  >
                    <Menu className="size-4" />
                  </PopoverTrigger>
                  <PopoverContent align="start" side="bottom" sideOffset={8} className="w-56 p-0">
                    <div className="flex flex-col rounded-lg border border-sidebar-border bg-sidebar">
                      <TenantSettingsSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
                    </div>
                  </PopoverContent>
                </Popover>
                <h2 className="text-base font-bold text-foreground">{activeLabel}</h2>
              </div>
              <DialogClose
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </DialogClose>
            </div>

            <div className="mt-6 flex-1 overflow-y-auto pr-2">
              {activeMenu === "info" ? (
                // 테넌트 정보
                <div className="grid gap-4">
                  {/* 테넌트 개요 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">테넌트 개요</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">테넌트 이름</div>
                        <div className="flex items-center gap-2 text-foreground">{tenantNameValue}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">테넌트 유형</div>
                        <div className="flex items-center gap-2 text-foreground">{tenantTypeValue}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">서비스 플랜</div>
                        <div className="flex items-center gap-2 text-foreground">{planBadge}</div>
                      </div>
                    </div>
                  </div>

                  {/* 테넌트 서비스 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">테넌트 서비스</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">월 서비스 크레딧</div>
                        <div className="flex items-center gap-2 text-foreground">{monthlyCreditsValue}</div>
                      </div>
                      {/* <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">스토리지 용량</div>
                        <div className="flex items-center gap-2 text-foreground">50GB</div>
                      </div> */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">좌석 수</div>
                        <div className="flex items-center gap-2 text-foreground">{seatValue}</div>
                      </div>
                    </div>
                  </div>

                  {isOwner ? (
                    <div className="flex justify-end px-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-blue-500 hover:text-blue-600"
                        onClick={handleUpgrade}
                      >
                        <ChevronsUp className="size-4" />업그레이드
                      </Button>
                    </div>
                  ) : null}

                </div>
              ) : null}

              {activeMenu === "members" ? (
                // 멤버 관리
                <div className="grid gap-4">

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">멤버 현황</div>
                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                      {[
                        { label: "총 좌석", value: totalSeatsValue, sub: "명", icon: UsersRound, accent: "text-foreground", bg: "bg-muted/60", ring: "" },
                        {
                          label: "활성",
                          value: membersLoading ? "-" : String(memberStatusCounts.active),
                          sub: "명",
                          icon: UserRoundCheck,
                          accent: "text-teal-600",
                          bg: "bg-teal-50 dark:bg-teal-950/40",
                          ring: "ring-1 ring-teal-200 dark:ring-teal-800",
                        },
                        {
                          label: "대기",
                          value: membersLoading ? "-" : String(memberStatusCounts.pending),
                          sub: "명",
                          icon: ShieldCheck,
                          accent: "text-amber-600",
                          bg: "bg-amber-50 dark:bg-amber-950/40",
                          ring: "ring-1 ring-amber-200 dark:ring-amber-800",
                        },
                        {
                          label: "정지",
                          value: membersLoading ? "-" : String(memberStatusCounts.suspended),
                          sub: "명",
                          icon: CirclePause,
                          accent: "text-rose-600",
                          bg: "bg-rose-50 dark:bg-rose-950/40",
                          ring: "ring-1 ring-rose-200 dark:ring-rose-800",
                        },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className={cn("relative rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <Icon className={cn("size-4 shrink-0", item.accent)} />
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                              <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.value}</span>
                              <span className="text-xs text-muted-foreground">{item.sub}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">멤버 목록</div>
                    {membersError ? (
                      <div className="mt-2 text-xs text-destructive">{membersError}</div>
                    ) : null}
                    <div className="mt-3 overflow-x-auto rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead className="">이름</TableHead>
                            <TableHead className="hidden sm:table-cell">이메일</TableHead>
                            <TableHead className="text-center">역할</TableHead>
                            {/* <TableHead className="w-[60px] text-center">스토리지</TableHead> */}
                            <TableHead className="w-[60px] text-center">상태</TableHead>
                            <TableHead className="hidden text-center sm:table-cell">가입일</TableHead>
                            <TableHead className="w-[40px] text-center">관리</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {membersLoading ? (
                            <TableRow>
                              <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                                멤버 정보를 불러오는 중입니다.
                              </TableCell>
                            </TableRow>
                          ) : membersActiveRows.length ? (
                            membersActiveRows.map((row) => {
                              const roleSlugRaw = String(row.role_slug || "").toLowerCase()
                              const statusKey = normalizeMembershipStatus(row.membership_status)
                              const statusLabel = MEMBERSHIP_STATUS_LABELS[statusKey] || row.membership_status || "-"
                              const statusStyle = MEMBERSHIP_STATUS_STYLES[statusKey] || MEMBERSHIP_STATUS_STYLES.inactive
                              const roleLabel = ROLE_LABELS[roleSlugRaw] || row.role_name || row.role_slug || "-"
                              const initial = resolveMemberInitial(row)
                              return (
                                <TableRow key={row.id} className="hover:bg-accent/40">
                                  <TableCell className="text-foreground">
                                    <div className="flex items-center gap-1">
                                      <div className="flex items-center justify-center gap-2 w-6 h-6 bg-teal-500 rounded-sm">
                                        <span className="text-white font-semibold text-sm">{initial}</span>
                                      </div>
                                      <div className="text-xs truncate">{resolveMemberName(row)}</div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-foreground hidden sm:table-cell">
                                    <span className="text-xs block w-[120px] truncate">{row.user_email || "-"}</span>
                                  </TableCell>
                                  <TableCell className="text-center">{roleLabel}</TableCell>
                                  {/* <TableCell className="text-center">{row.storage}</TableCell> */}
                                  <TableCell className="text-center">
                                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1", statusStyle)}>
                                      {statusLabel}
                                    </span>
                                  </TableCell>
                                  <TableCell className="hidden text-xs text-center sm:table-cell">{formatDate(row.joined_at)}</TableCell>
                                  <TableCell className="text-center">
                                    {canManageMembers && roleSlugRaw !== "owner" && roleSlugRaw !== "tenant_owner" ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-blue-500 hover:text-blue-600"
                                        onClick={() => handleOpenMemberDialog(row)}
                                      >
                                        <Settings2 className="size-4" />
                                      </Button>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                                표시할 멤버가 없습니다.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">제외 멤버 목록</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      제외 멤버는 한번이라도 크레딧 사용 이력이 있는 사용자만 추가가 됩니다. 사용이력이 없을 시 목록에서 완전 제거 됩니다.
                    </p>
                    <div className="mt-3 overflow-x-auto rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead>이름</TableHead>
                            <TableHead>이메일</TableHead>
                            <TableHead className="text-center">제외일</TableHead>
                            <TableHead className="w-[90px] text-center">초대</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {membersLoading ? (
                            <TableRow>
                              <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                                제외 멤버를 불러오는 중입니다.
                              </TableCell>
                            </TableRow>
                          ) : membersInactiveRows.length ? (
                            membersInactiveRows.map((row) => (
                              <TableRow key={row.id} className="hover:bg-accent/40">
                                <TableCell className="text-foreground text-xs">{resolveMemberName(row)}</TableCell>
                                <TableCell className="text-foreground">
                                  <span className="text-xs block w-[160px] truncate">{row.user_email || "-"}</span>
                                </TableCell>
                                <TableCell className="text-center text-xs">{formatDate(row.left_at)}</TableCell>
                                <TableCell className="text-center">
                                  <Button variant="outline" size="sm" className="text-blue-500 hover:text-blue-600">
                                    다시 초대
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                                테넌트에 제외된 멤버가 없습니다.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                </div>
              ) : null}

              {activeMenu === "invitations" ? (
                // 멤버 초대 관리
                <div className="grid gap-4">
                  {/* 초대 현황 요약 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">초대 현황</div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {[
                        {
                          label: "대기 중",
                          value: inviteLoading ? "-" : String(invitationStatusCounts.pending),
                          sub: "건",
                          icon: UserPlus,
                          accent: "text-amber-600",
                          bg: "bg-amber-50 dark:bg-amber-950/40",
                          ring: "ring-1 ring-amber-200 dark:ring-amber-800",
                        },
                        {
                          label: "수락 완료",
                          value: inviteLoading ? "-" : String(invitationStatusCounts.accepted),
                          sub: "건",
                          icon: UserRoundCheck,
                          accent: "text-emerald-600",
                          bg: "bg-emerald-50 dark:bg-emerald-950/40",
                          ring: "ring-1 ring-emerald-200 dark:ring-emerald-800",
                        },
                        {
                          label: "만료/거절/취소",
                          value: inviteLoading ? "-" : String(invitationOtherCount),
                          sub: "건",
                          icon: CirclePause,
                          accent: "text-rose-600",
                          bg: "bg-rose-50 dark:bg-rose-950/40",
                          ring: "ring-1 ring-rose-200 dark:ring-rose-800",
                        },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className={cn("relative rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <Icon className={cn("size-4 shrink-0", item.accent)} />
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                              <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.value}</span>
                              <span className="text-xs text-muted-foreground">{item.sub}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 초대 내역 테이블 */}
                  <div className="px-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">초대 내역</div>
                      {canManageMembers ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                          onClick={() => {
                            setInviteDialogOpen(true)
                            setInviteActionError(null)
                          }}
                        >
                          <UserPlus className="size-3.5" />
                          새 초대
                        </button>
                      ) : null}
                    </div>
                    {inviteError ? (
                      <div className="mt-2 text-xs text-destructive">{inviteError}</div>
                    ) : null}
                    {inviteActionError ? (
                      <div className="mt-2 text-xs text-destructive">{inviteActionError}</div>
                    ) : null}

                    <div className="mt-3 overflow-y-auto rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead className="text-left">이메일</TableHead>
                            <TableHead className="text-center">역할</TableHead>
                            <TableHead className="w-[60px] px-3 py-2 text-center">상태</TableHead>
                            <TableHead className="text-center">초대일</TableHead>
                            <TableHead className="w-[40px] px-3 py-2 text-center">관리</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {inviteLoading ? (
                            <TableRow>
                              <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                                초대 내역을 불러오는 중입니다.
                              </TableCell>
                            </TableRow>
                          ) : tenantInvitations.length ? (
                            tenantInvitations.map((row) => {
                              const statusKey = String(row.status || "").toLowerCase()
                              const statusLabel = INVITATION_STATUS_LABELS[statusKey] || row.status || "-"
                              const statusStyle = INVITATION_STATUS_STYLES[statusKey] || INVITATION_STATUS_STYLES.expired
                              const roleLabel =
                                INVITATION_ROLE_LABELS[String(row.membership_role || "").toLowerCase()] ||
                                row.membership_role ||
                                "-"
                              return (
                                <TableRow key={row.id} className="hover:bg-accent/40">
                                  <TableCell className="text-foreground">
                                    <span className="text-xs block w-[160px] truncate">{row.invitee_email}</span>
                                  </TableCell>
                                  <TableCell className="text-center">{roleLabel}</TableCell>
                                  <TableCell className="text-center">
                                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1", statusStyle)}>
                                      {statusLabel}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center text-xs">{formatDate(row.created_at)}</TableCell>
                                  <TableCell className="text-center">
                                    {canManageMembers && statusKey === "pending" ? (
                                      <button
                                        type="button"
                                        className="text-xs text-destructive hover:underline"
                                        disabled={inviteActionLoadingId === row.id}
                                        onClick={() => handleCancelInvitation(row.id)}
                                      >
                                        {inviteActionLoadingId === row.id ? "처리중" : "취소"}
                                      </button>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                                표시할 초대가 없습니다.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                    <DialogContent className="sm:max-w-[420px]">
                      <DialogHeader>
                        <DialogTitle>새 초대</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">초대 이메일</div>
                          <Input
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="email@example.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">역할</div>
                          <Select value={inviteRole} onValueChange={setInviteRole}>
                            <SelectTrigger>
                              <SelectValue placeholder="역할 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {INVITATION_ROLE_OPTIONS.map(({ value, label }) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="text-xs text-muted-foreground">초대 링크는 7일 동안 유효합니다.</div>
                        <div className="text-xs text-muted-foreground">
                          ※ 카카오/다음 메일은 수신까지 시간이 지연될 수 있습니다. 최대 20분까지 여유 있게 확인해주세요.
                        </div>
                        {inviteActionError ? (
                          <div className="text-xs text-destructive">{inviteActionError}</div>
                        ) : null}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                          취소
                        </Button>
                        <Button onClick={handleCreateInvitation} disabled={inviteSaving}>
                          {inviteSaving ? "발송 중..." : "초대 보내기"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : null}

              {activeMenu === "credits" ? (
                //  서비스 크레딧 운영
                <div className="grid gap-4">

                  <div className="flex items-center px-4 gap-2">
                    {/* 월 선택 */}
                    <div>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="이번달" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">이번달</SelectItem>
                          <SelectItem value="2026-01">2026년 1월</SelectItem>
                          <SelectItem value="2025-12">2025년 12월</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-sm text-muted-foreground">2026-02-19 ~ 2026-03-19</div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">서비스 크레딧 사용 현황</div>
                    <div className="mt-4">
                      {/* 전체 사용량 바 */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">전체 사용량</span>
                        <span className="font-semibold text-foreground">32,320 / 50,000 크레딧</span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: "64.8%" }} />
                      </div>
                      <div className="mt-1 text-right text-xs text-muted-foreground">64.8% 사용 중</div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: "전체 용량", value: 50000, unit: "크레딧", icon: Database, accent: "text-foreground", bg: "bg-muted/60", ring: "" },
                        { label: "사용 중", value: 32320, unit: "크레딧", icon: HardDrive, accent: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40", ring: "ring-1 ring-sky-200 dark:ring-sky-800" },
                        { label: "남은 용량", value: 17680, unit: "크레딧", icon: PackageOpen, accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "ring-1 ring-emerald-200 dark:ring-emerald-800" },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className={cn("relative rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <Icon className={cn("size-4 shrink-0", item.accent)} />
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                              <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.value.toLocaleString()}</span>
                              <span className="text-xs text-muted-foreground">{item.unit}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 멤버별 사용량 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">멤버 크레딧 사용 현황 및 관리</div>
                    <div className="mt-3 overflow-hidden rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead className="w-[44px] text-center">No.</TableHead>
                            <TableHead className="">멤버</TableHead>
                            <TableHead className="w-full hidden sm:table-cell">사용 점유율</TableHead>
                            <TableHead className="text-right">사용량(크레딧)</TableHead>
                            <TableHead className="text-center">상태</TableHead>
                            <TableHead className="w-[40px] text-center">관리</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {[
                            { name: "홍길동", used: 8000, limit: "(제한없음)", percent: 16, is_active: true },
                            { name: "박지민", used: 6200, limit: "(제한없음)", percent: 8.2, is_active: true },
                            { name: "이수진", used: 3800, limit: 10000, percent: 5.2, is_active: true },
                            { name: "김하늘", used: 0, limit: 0, percent: 0, is_active: false },
                            { name: "최민호", used: 0, limit: 0, percent: 0, is_active: false },
                          ].map((row, index) => (
                            <TableRow key={row.name} className="hover:bg-accent/40">
                              <TableCell className="text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="text-foreground">
                                <div className="flex items-center gap-1">
                                  <div className="flex items-center justify-center gap-2 w-6 h-6 bg-teal-500 rounded-sm">
                                    <span className="text-white font-semibold text-sm">이</span>
                                  </div>
                                  <div className="text-xs block max-w-[120px] truncate">{row.name}</div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        row.percent >= 100 ? "bg-destructive" : row.percent >= 80 ? "bg-amber-500" : "bg-primary"
                                      )}
                                      style={{ width: `${Math.min(row.percent, 100)}%` }}
                                    />
                                  </div>
                                  <span className="w-[36px] text-right text-xs">{row.percent}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {row.used.toLocaleString()} / {row.limit.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center text-xs">
                                {row.is_active ? <span className="text-teal-500 border border-teal-500 rounded-full px-2 py-1">사용</span> : <span className="text-destructive border border-destructive rounded-full px-2 py-1">불가</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button variant="outline" size="sm" className="text-blue-500 hover:text-blue-600">
                                  <Settings2 className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                </div>
              ) : null}


              {activeMenu === "topupCredits" ? (
                // 충전 크레딧 운영
                <div className="grid gap-4">

                  <div className="flex items-center px-4 gap-2">
                    {/* 월 선택 */}
                    <div>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="이번달" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">이번달</SelectItem>
                          <SelectItem value="2026-01">2026년 1월</SelectItem>
                          <SelectItem value="2025-12">2025년 12월</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-sm text-muted-foreground">2026-02-19 ~ 2026-03-19</div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">충전 크레딧 사용 현황</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">서비스 크레딧 소진시 자동 사용</span>
                        <Switch id="" defaultChecked={true} />
                      </div>
                    </div>


                    <div className="mt-4">
                      {/* 전체 사용량 바 */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">전체 사용량</span>
                        <span className="font-semibold text-foreground">0 / 980,000 크레딧</span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: "0.0%" }} />
                      </div>
                      <div className="mt-1 text-right text-xs text-muted-foreground">0% 사용 중</div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: "현재 보유량", value: 980000, unit: "크레딧", icon: Database, accent: "text-foreground", bg: "bg-muted/60", ring: "" },
                        { label: "사용량", value: 0, unit: "크레딧", icon: HardDrive, accent: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40", ring: "ring-1 ring-sky-200 dark:ring-sky-800" },
                        { label: "남은 용량", value: 980000, unit: "크레딧", icon: PackageOpen, accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "ring-1 ring-emerald-200 dark:ring-emerald-800" },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className={cn("relative rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <Icon className={cn("size-4 shrink-0", item.accent)} />
                            </div>
                            <div className="mt-2 flex items-baseline justify-between gap-1">
                              <div className="flex items-center gap-1">
                              <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.value.toLocaleString()}</span>
                              <span className="text-xs text-muted-foreground">{item.unit}</span>
                              </div>
                              {item.label === "현재 보유량" ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="outline" size="sm" className="w-8 h-8" aria-label="추가 충전하기">
                                      <EvCharger className="text-blue-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>추가 충전하기</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 멤버별 충전 크레딧 사용 현황 및 관리*/}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">멤버 충전 크레딧 사용 현황 및 관리</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      충전 크레딧은 서비스 크레딧 사용 가능 멤버에 한해서 적용이 가능합니다.
                    </p>
                    <div className="mt-3 overflow-hidden rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead className="w-[44px] text-center">No.</TableHead>
                            <TableHead className="">멤버</TableHead>
                            <TableHead className="text-right">사용량(크레딧)</TableHead>
                            <TableHead className="text-center w-[80px]">허용여부</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {[
                            { name: "홍길동", used: 0, percent: 0.0, is_active: true },
                            { name: "박지민", used: 0, percent: 0.0, is_active: false },
                            { name: "이수진", used: 0, percent: 0.0, is_active: true },
                          ].map((row, index) => (
                            <TableRow key={row.name} className="hover:bg-accent/40">
                              <TableCell className="text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="text-foreground">
                                <div className="flex items-center gap-1">
                                  <div className="flex items-center justify-center gap-2 w-6 h-6 bg-teal-500 rounded-sm">
                                    <span className="text-white font-semibold text-sm">이</span>
                                  </div>
                                  <div className="text-xs block max-w-[120px] truncate">{row.name}</div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {row.used.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center">
                                  <Switch defaultChecked={row.is_active} aria-label={`${row.name} 사용 가능 여부`} />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>


                </div>
              ) : null}



              {activeMenu === "usage" ? (
                // 사용내역
                <div className="flex h-full flex-col min-h-0 gap-4">
                  {/* <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">최근 사용 내역</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      {[
                        ["2026-02-10", "GPT-5.2", "15,400 tokens", "홍길동"],
                        ["2026-02-10", "Gemini 3 Pro", "8,120 tokens", "김하늘"],
                        ["2026-02-09", "Sora 2", "영상 20초", "박지민"],
                      ].map((row) => (
                        <div key={`${row[0]}-${row[1]}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span>{row[0]}</span>
                          <span>{row[1]}</span>
                          <span>{row[2]}</span>
                          <span className="text-foreground">{row[3]}</span>
                        </div>
                      ))}
                    </div>
                  </div> */}

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">상위 사용 모델</div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {[
                        { name: "GPT-5.2", percent: "42%", accent: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/40", ring: "ring-1 ring-violet-200 dark:ring-violet-800", dot: "bg-violet-500" },
                        { name: "Gemini 3 Pro", percent: "33%", accent: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40", ring: "ring-1 ring-sky-200 dark:ring-sky-800", dot: "bg-sky-500" },
                        { name: "Sora 2", percent: "25%", accent: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40", ring: "ring-1 ring-amber-200 dark:ring-amber-800", dot: "bg-amber-500" },
                      ].map((item) => (
                        <div key={item.name} className={cn("rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("size-2 shrink-0 rounded-full", item.dot)} />
                            <span className="text-xs font-medium text-muted-foreground truncate">{item.name}</span>
                          </div>
                          <div className="mt-2">
                            <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.percent}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 사용자별 사용내역 테이블 */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="px-4">
                      <div className="text-sm font-semibold text-foreground">사용자별 사용 내역</div>
                      <div className="mt-3 overflow-x-auto rounded-md border border-border">
                        <Table>
                          <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                            <TableRow className="border-b-0">
                              <TableHead className="text-xs">날짜</TableHead>
                              <TableHead className="text-xs">사용자</TableHead>
                              <TableHead className="text-xs">모델</TableHead>
                              <TableHead className="text-xs">사용량</TableHead>
                              <TableHead className="text-right text-xs">크레딧</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {usagePageRows.map((row) => (
                              <TableRow key={`${row.date}-${row.model}-${row.user}`}>
                                <TableCell className="text-muted-foreground text-xs">{row.date}</TableCell>
                                <TableCell className="text-foreground text-xs">{row.user}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{row.model}</TableCell>
                                <TableCell className="text-muted-foreground text-xs whitespace-normal break-words break-all">{row.usage}</TableCell>
                                <TableCell className="text-right text-foreground text-xs">{row.credits}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                  <div className="sticky bottom-0 mt-3 border-t border-border bg-background pt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        총 {usageRows.length}개 · {usagePageSafe}/{usageTotalPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setUsagePage((prev) => Math.max(1, prev - 1))}
                          disabled={usagePageSafe <= 1}
                        >
                          이전
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setUsagePage((prev) => Math.min(usageTotalPages, prev + 1))}
                          disabled={usagePageSafe >= usageTotalPages}
                        >
                          다음
                        </Button>
                      </div>
                    </div>
                  </div>


                </div>
              ) : null}







            </div>
          </div>
        </div>
      </DialogContent>
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>멤버 설정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <div className="text-foreground font-medium">{memberDialogTarget ? resolveMemberName(memberDialogTarget) : "-"}</div>
              <div>{memberDialogTarget?.user_email || "-"}</div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">역할</div>
              <Select value={memberDialogRole} onValueChange={setMemberDialogRole} disabled={!canManageMembers || memberSaving}>
                <SelectTrigger>
                  <SelectValue placeholder="역할 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">상태</div>
              <Select value={memberDialogStatus} onValueChange={setMemberDialogStatus} disabled={!canManageMembers || memberSaving}>
                <SelectTrigger>
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {memberActionError ? (
              <div className="text-xs text-destructive">{memberActionError}</div>
            ) : null}
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleRemoveMember}
              disabled={memberSaving || !canManageMembers}
            >
              멤버 제외
            </Button>
            <Button onClick={handleSaveMember} disabled={memberSaving || !canManageMembers}>
              {memberSaving ? "저장 중..." : "변경 적용"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog >
  )
}
