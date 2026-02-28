import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Box, CirclePause, Coins, Database, Gauge, HardDrive, Menu, PackageOpen, UserPlus, UserRoundCheck, Users, UsersRound, X, ChevronsUp, Settings2, HandCoins, EvCharger, RotateCw, Armchair } from "lucide-react"
import { cn } from "@/lib/utils"
import { type PlanTier, PLAN_TIER_LABELS, PLAN_TIER_ORDER, PLAN_TIER_STYLES } from "@/lib/planTier"
import { withActiveTenantHeader } from "@/lib/tenantContext"
import { ProfileAvatar } from "@/lib/ProfileAvatar"
import { toast } from "sonner"
import { appendVisited } from "@/lib/billingFlow"
import { fetchBillingPlansWithPrices, fetchTopupProducts, type BillingPlanWithPrices, type TopupProduct } from "@/services/billingService"
import { TopupOptionsDialog } from "@/components/dialog/TopupOptionsDialog"

type TenantSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenPlanDialog?: () => void
}

type SubscriptionSummary = {
  id: string
  plan_id: string
  plan_name?: string | null
  plan_tier?: string | null
  billing_cycle?: "monthly" | "yearly" | string | null
  status?: string | null
}

type SubscriptionResponse = {
  ok?: boolean
  row?: SubscriptionSummary | null
  message?: string
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

type ServiceUsagePeriod = {
  invoice_id?: string | null
  period_start: string
  period_end: string
}

type ServiceUsageSummary = {
  period_start: string
  period_end: string
  plan_slug?: string | null
  plan_tier?: string | null
  billing_cycle?: string | null
  total_credits?: number | null
  used_credits?: number | null
  remaining_credits?: number | null
  usage_percent?: number | null
  account_id?: string | null
}

type ServiceUsageMember = {
  user_id: string
  user_name?: string | null
  user_email?: string | null
  used_credits?: number | string | null
  max_per_period?: number | string | null
  is_active?: boolean | null
  role_slug?: string | null
  joined_at?: string | null
  profile_image_url?: string | null
}

type ServiceUsageResponse = {
  ok?: boolean
  message?: string
  current_period_end?: string | null
  periods?: ServiceUsagePeriod[]
  summary?: ServiceUsageSummary | null
  members?: ServiceUsageMember[]
}

type TopupUsageMember = {
  user_id: string
  user_name?: string | null
  user_email?: string | null
  used_credits?: number | string | null
  is_active?: boolean | null
  role_slug?: string | null
  joined_at?: string | null
  profile_image_url?: string | null
}

type TopupUsageSummary = {
  period_start: string
  period_end: string
  total_credits?: number | null
  used_credits?: number | null
  remaining_credits?: number | null
  usage_percent?: number | null
  account_id?: string | null
}

type TopupUsageTopup = {
  account_id?: string | null
  balance_credits?: number | null
  remaining_credits?: number | null
  expires_at?: string | null
  allow_when_empty?: boolean | null
}

type TopupUsageResponse = {
  ok?: boolean
  message?: string
  current_period_end?: string | null
  periods?: ServiceUsagePeriod[]
  summary?: TopupUsageSummary | null
  topup?: TopupUsageTopup | null
  members?: TopupUsageMember[]
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
  active: "활동",
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
  { value: "admin", label: "관리자" },
  { value: "member", label: "멤버" },
  { value: "viewer", label: "뷰어" },
] as const

const STATUS_OPTIONS = [
  { value: "active", label: "활동" },
  { value: "suspended", label: "정지" },
] as const

const MEMBER_ROLE_PRIORITY: Record<string, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  viewer: 3,
}

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

function resolveUsageMemberName(row: ServiceUsageMember) {
  const name = String(row.user_name || "").trim()
  if (name) return name
  const email = String(row.user_email || "").trim()
  if (email) return email.split("@")[0] || email
  return "사용자"
}

function resolveUsageMemberInitial(row: ServiceUsageMember) {
  const base = resolveUsageMemberName(row)
  const trimmed = String(base || "").trim()
  return trimmed ? trimmed.slice(0, 1) : "?"
}

function formatDateYmd(value?: string | null) {
  if (!value) return "-"
  try {
    return new Date(value).toLocaleDateString("sv-SE")
  } catch {
    return "-"
  }
}

function formatPeriodLabel(periodStart?: string | null, isCurrent?: boolean) {
  if (!periodStart) return "-"
  if (isCurrent) return "이번달"
  const date = new Date(periodStart)
  if (Number.isNaN(date.getTime())) return periodStart
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0"
  const rounded = Math.round(value * 10) / 10
  return rounded % 1 === 0 ? String(Math.trunc(rounded)) : rounded.toFixed(1)
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
  const navigate = useNavigate()
  const [activeMenu, setActiveMenu] = useState<MenuId>(() => readTenantMenuFromStorage() ?? "info")
  const [usagePage, setUsagePage] = useState(1)
  const wasOpenRef = useRef(false)
  const [currentTenant, setCurrentTenant] = useState<CurrentTenantProfile | null>(null)
  const [tenantMemberships, setTenantMemberships] = useState<TenantMembership[]>([])
  const [tenantInfoLoading, setTenantInfoLoading] = useState(false)
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null)
  const [creditLoading, setCreditLoading] = useState(false)
  const [serviceUsage, setServiceUsage] = useState<ServiceUsageResponse | null>(null)
  const [serviceUsageLoading, setServiceUsageLoading] = useState(false)
  const [servicePeriods, setServicePeriods] = useState<ServiceUsagePeriod[]>([])
  const [selectedServicePeriodEnd, setSelectedServicePeriodEnd] = useState("")
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
  const [memberRemoveDialogOpen, setMemberRemoveDialogOpen] = useState(false)
  const [memberRemovePassword, setMemberRemovePassword] = useState("")
  const [memberRemoveError, setMemberRemoveError] = useState<string | null>(null)
  const [resendInviteLoadingId, setResendInviteLoadingId] = useState<string | null>(null)
  const [resendInviteDialogOpen, setResendInviteDialogOpen] = useState(false)
  const [resendInviteTarget, setResendInviteTarget] = useState<TenantMemberRow | null>(null)
  const [tenantInvitations, setTenantInvitations] = useState<TenantInvitationRow[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteActionLoadingId, setInviteActionLoadingId] = useState<string | null>(null)
  const [inviteActionError, setInviteActionError] = useState<string | null>(null)
  const [creditAccessDialogOpen, setCreditAccessDialogOpen] = useState(false)
  const [creditAccessTarget, setCreditAccessTarget] = useState<ServiceUsageMember | null>(null)
  const [creditAccessIsActive, setCreditAccessIsActive] = useState(true)
  const [creditAccessLimitEnabled, setCreditAccessLimitEnabled] = useState(false)
  const [creditAccessLimitValue, setCreditAccessLimitValue] = useState("")
  const [creditAccessLimitError, setCreditAccessLimitError] = useState<string | null>(null)
  const [creditAccessSaving, setCreditAccessSaving] = useState(false)
  const [currentBillingPlan, setCurrentBillingPlan] = useState<BillingPlanWithPrices | null>(null)
  const [billingPlanLoading, setBillingPlanLoading] = useState(false)
  const [seatDialogOpen, setSeatDialogOpen] = useState(false)
  const [topupOptionsDialogOpen, setTopupOptionsDialogOpen] = useState(false)
  const [seatQuantity, setSeatQuantity] = useState(1)
  const [seatDialogError, setSeatDialogError] = useState<string | null>(null)
  const [topupUsage, setTopupUsage] = useState<TopupUsageResponse | null>(null)
  const [topupUsageLoading, setTopupUsageLoading] = useState(false)
  const [topupPeriods, setTopupPeriods] = useState<ServiceUsagePeriod[]>([])
  const [selectedTopupPeriodEnd, setSelectedTopupPeriodEnd] = useState("")
  const [topupAutoUseSaving, setTopupAutoUseSaving] = useState(false)
  const [topupMemberAccessSaving, setTopupMemberAccessSaving] = useState<string | null>(null)
  const [topupProducts, setTopupProducts] = useState<TopupProduct[]>([])
  const [topupProductsLoading, setTopupProductsLoading] = useState(false)

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

  const loadServiceUsage = useCallback(
    async (periodEnd?: string) => {
      const headers = authHeaders()
      if (!headers.Authorization) {
        setServiceUsage(null)
        setServicePeriods([])
        setSelectedServicePeriodEnd("")
        return
      }
      setServiceUsageLoading(true)
      try {
        const params = new URLSearchParams()
        if (periodEnd) params.set("period_end", periodEnd)
        const query = params.toString()
        const res = await fetch(`/api/ai/credits/my/service-usage${query ? `?${query}` : ""}`, { headers })
        const json = (await res.json().catch(() => null)) as ServiceUsageResponse | null
        if (!res.ok || !json?.ok) {
          setServiceUsage(null)
          setServicePeriods([])
          return
        }
        const periods = Array.isArray(json.periods) ? json.periods : []
        const summaryPeriodStart = json.summary?.period_start
        const summaryPeriodEnd = json.summary?.period_end
        const nextPeriods =
          periods.length || !summaryPeriodEnd
            ? periods
            : [{ period_start: summaryPeriodStart || "", period_end: summaryPeriodEnd }]
        setServiceUsage(json)
        setServicePeriods(nextPeriods)
        if (!periodEnd) {
          const nextPeriodEnd = summaryPeriodEnd || nextPeriods[0]?.period_end
          if (nextPeriodEnd) {
            setSelectedServicePeriodEnd((prev) => prev || nextPeriodEnd)
          }
        }
      } catch (error) {
        console.error(error)
        setServiceUsage(null)
        setServicePeriods([])
      } finally {
        setServiceUsageLoading(false)
      }
    },
    [authHeaders]
  )

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

  const loadBillingPlan = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setCurrentBillingPlan(null)
      return
    }
    setBillingPlanLoading(true)
    try {
      const subRes = await fetch("/api/ai/billing/user/subscription", { headers })
      const subData = (await subRes.json().catch(() => null)) as SubscriptionResponse | null
      const subscription = subData?.row ?? null
      if (!subscription?.plan_id) {
        setCurrentBillingPlan(null)
        return
      }
      const plans = await fetchBillingPlansWithPrices()
      const plan = plans.find((item) => item.id === subscription.plan_id) ?? null
      setCurrentBillingPlan(plan)
    } catch (error) {
      console.error(error)
      setCurrentBillingPlan(null)
    } finally {
      setBillingPlanLoading(false)
    }
  }, [authHeaders])

  const loadTopupUsage = useCallback(
    async (periodEnd?: string) => {
      const headers = authHeaders()
      if (!headers.Authorization) {
        setTopupUsage(null)
        setTopupPeriods([])
        setSelectedTopupPeriodEnd("")
        return
      }
      setTopupUsageLoading(true)
      try {
        const params = new URLSearchParams()
        if (periodEnd) params.set("period_end", periodEnd)
        const qs = params.toString()
        const res = await fetch(`/api/ai/credits/my/topup-usage${qs ? `?${qs}` : ""}`, { headers })
        const json = (await res.json().catch(() => null)) as TopupUsageResponse | null
        if (!res.ok || !json?.ok) {
          setTopupUsage(null)
          setTopupPeriods([])
          return
        }
        const periods = Array.isArray(json.periods) ? json.periods : []
        const summaryPeriodStart = json.summary?.period_start
        const summaryPeriodEnd = json.summary?.period_end
        const nextPeriods =
          periods.length || !summaryPeriodEnd
            ? periods
            : [{ period_start: summaryPeriodStart || "", period_end: summaryPeriodEnd }]
        setTopupUsage(json)
        setTopupPeriods(nextPeriods)
        if (!periodEnd) {
          const nextPeriodEnd = summaryPeriodEnd || nextPeriods[0]?.period_end
          if (nextPeriodEnd) {
            setSelectedTopupPeriodEnd((prev) => prev || nextPeriodEnd)
          }
        }
      } catch (error) {
        console.error(error)
        setTopupUsage(null)
        setTopupPeriods([])
      } finally {
        setTopupUsageLoading(false)
      }
    },
    [authHeaders]
  )

  const loadTopupProducts = useCallback(async () => {
    setTopupProductsLoading(true)
    try {
      const products = await fetchTopupProducts()
      setTopupProducts(products)
    } catch (e) {
      console.error(e)
      setTopupProducts([])
    } finally {
      setTopupProductsLoading(false)
    }
  }, [])

  const handleToggleTopupAutoUse = useCallback(
    async (checked: boolean) => {
      const headers = authHeaders()
      if (!headers.Authorization) return
      setTopupAutoUseSaving(true)
      try {
        const res = await fetch("/api/ai/credits/my/topup-auto-use", {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ allow_when_empty: checked }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) {
          toast.error(json?.message || "설정 저장에 실패했습니다.")
          return
        }
        toast.success(checked ? "서비스 크레딧 소진시 자동 사용이 활성화되었습니다." : "자동 사용이 비활성화되었습니다.")
        void loadTopupUsage(selectedTopupPeriodEnd || undefined)
      } catch {
        toast.error("설정 저장 중 오류가 발생했습니다.")
      } finally {
        setTopupAutoUseSaving(false)
      }
    },
    [authHeaders, loadTopupUsage, selectedTopupPeriodEnd]
  )

  const handleToggleTopupMemberAccess = useCallback(
    async (userId: string, checked: boolean) => {
      const headers = authHeaders()
      if (!headers.Authorization) return
      setTopupMemberAccessSaving(userId)
      try {
        const res = await fetch("/api/ai/credits/my/member-topup-credit-access", {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, is_active: checked }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) {
          toast.error(json?.message || "멤버 설정 저장에 실패했습니다.")
          return
        }
        void loadTopupUsage(selectedTopupPeriodEnd || undefined)
      } catch {
        toast.error("멤버 설정 저장 중 오류가 발생했습니다.")
      } finally {
        setTopupMemberAccessSaving(null)
      }
    },
    [authHeaders, loadTopupUsage, selectedTopupPeriodEnd]
  )

  const resolveNextBillingRoute = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) return "/billing/card"
    try {
      const [accountRes, methodsRes] = await Promise.all([
        fetch("/api/ai/billing/user/billing-account", { headers }),
        fetch("/api/ai/billing/user/payment-methods?limit=1", { headers }),
      ])
      let hasInfo = false
      if (accountRes.ok) {
        const data = (await accountRes.json().catch(() => null)) as { row?: { billing_name?: string; billing_email?: string; billing_address1?: string } } | null
        const row = data?.row
        hasInfo = Boolean(row?.billing_name && row?.billing_email && row?.billing_address1)
      }
      let hasCard = false
      if (methodsRes.ok) {
        const data = (await methodsRes.json().catch(() => null)) as { rows?: Array<unknown> } | null
        hasCard = Array.isArray(data?.rows) && data.rows.length > 0
      }
      return !hasCard ? "/billing/card" : !hasInfo ? "/billing/info" : "/billing/confirm"
    } catch (e) {
      console.error(e)
      return "/billing/card"
    }
  }, [authHeaders])

  const handleTopupPurchase = useCallback(
    async (product: TopupProduct) => {
      const headers = authHeaders()
      if (!headers.Authorization) {
        toast.error("로그인이 필요합니다.")
        return
      }
      const target = await resolveNextBillingRoute()
      onOpenChange(false)
      navigate(target, {
        state: {
          topupProductId: product.id,
          topupProductName: product.name,
          topupCredits: Number(product.credits),
          topupPrice: product.price_usd,
          action: "topup",
          flow: appendVisited(undefined, "tenant_settings"),
        },
      })
    },
    [authHeaders, navigate, onOpenChange, resolveNextBillingRoute]
  )


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

  const currentUserId = useMemo(() => {
    if (typeof window === "undefined") return ""
    return String(window.localStorage.getItem("user_id") || "").trim()
  }, [])

  const isCurrentUserAdmin = useMemo(() => {
    const roleSlug = String(currentMembership?.role_slug || "").toLowerCase()
    return roleSlug === "admin" || roleSlug === "tenant_admin"
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
  const planAvatarClass = resolvedPlanTier ? PLAN_TIER_STYLES[resolvedPlanTier].avatar : "bg-primary"

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

  const includedSeats =
    typeof currentBillingPlan?.included_seats === "number" ? Math.floor(currentBillingPlan.included_seats) : null
  const maxSeats =
    typeof currentBillingPlan?.max_seats === "number" ? Math.floor(currentBillingPlan.max_seats) : null
  const extraSeatPrice =
    typeof currentBillingPlan?.extra_seat_price_usd === "number"
      ? Number(currentBillingPlan.extra_seat_price_usd)
      : Number(currentBillingPlan?.extra_seat_price_usd ?? 0)
  const addedSeats =
    memberLimit !== null && includedSeats !== null ? Math.max(0, memberLimit - includedSeats) : 0
  const maxExpandableSeats =
    maxSeats !== null
      ? Math.max(0, maxSeats - (memberLimit ?? includedSeats ?? 0))
      : null
  const currentSeatLimit = memberLimit ?? memberCount
  const extraSeatPriceLabel = extraSeatPrice > 0 ? `$${extraSeatPrice}` : "-"

  const monthlyCredits = creditSummary?.subscription?.grant_monthly
  const monthlyCreditsValue = creditLoading
    ? "불러오는 중..."
    : typeof monthlyCredits === "number"
      ? `${monthlyCredits.toLocaleString()} 크레딧`
      : "-"

  const serviceSummary = serviceUsage?.summary ?? null
  const serviceTotals = useMemo(() => {
    if (!serviceSummary) return null
    const total = Number(serviceSummary.total_credits ?? 0)
    const used = Number(serviceSummary.used_credits ?? 0)
    const remaining = Number(serviceSummary.remaining_credits ?? Math.max(0, total - used))
    const percent = total > 0 ? (used / total) * 100 : 0
    return {
      total,
      used,
      remaining,
      percent,
    }
  }, [serviceSummary])
  const serviceUsageLabel = serviceUsageLoading
    ? "불러오는 중..."
    : serviceTotals
      ? `${serviceTotals.used.toLocaleString()} / ${serviceTotals.total.toLocaleString()} 크레딧`
      : "-"
  const serviceUsagePercentLabel = serviceUsageLoading
    ? "불러오는 중..."
    : serviceTotals
      ? `${formatPercent(serviceTotals.percent)}% 사용 중`
      : "-"
  const serviceUsageProgress = serviceTotals ? Math.min(serviceTotals.percent, 100) : 0

  const serviceMemberRows = useMemo(() => {
    const rows = Array.isArray(serviceUsage?.members) ? serviceUsage.members : []
    const totalUsed = serviceTotals?.used ?? 0
    return rows.map((row) => {
      const usedCredits = Number(row.used_credits ?? 0)
      const maxPerPeriodRaw = row.max_per_period
      const maxPerPeriod =
        maxPerPeriodRaw === null || maxPerPeriodRaw === undefined ? null : Number(maxPerPeriodRaw)
      const percent = totalUsed > 0 ? (usedCredits / totalUsed) * 100 : 0
      return {
        ...row,
        used_credits: usedCredits,
        max_per_period: Number.isFinite(maxPerPeriod as number) ? maxPerPeriod : null,
        is_active: row.is_active !== false,
        percent,
      }
    })
  }, [serviceTotals?.used, serviceUsage?.members])

  const selectedServicePeriod = useMemo(() => {
    if (serviceSummary?.period_start && serviceSummary?.period_end) {
      return { period_start: serviceSummary.period_start, period_end: serviceSummary.period_end }
    }
    if (selectedServicePeriodEnd) {
      return servicePeriods.find((period) => period.period_end === selectedServicePeriodEnd) ?? null
    }
    return null
  }, [selectedServicePeriodEnd, servicePeriods, serviceSummary?.period_end, serviceSummary?.period_start])

  const selectedServicePeriodRange = selectedServicePeriod
    ? `${formatDateYmd(selectedServicePeriod.period_start)} ~ ${formatDateYmd(selectedServicePeriod.period_end)}`
    : "-"

  const topupSummary = topupUsage?.summary ?? null
  const topupTotals = useMemo(() => {
    if (!topupSummary) return null
    const total = Number(topupSummary.total_credits ?? 0)
    const used = Number(topupSummary.used_credits ?? 0)
    const remaining = Number(topupSummary.remaining_credits ?? Math.max(0, total - used))
    const percent = total > 0 ? (used / total) * 100 : 0
    return { total, used, remaining, percent }
  }, [topupSummary])

  const topupAllowWhenEmpty = topupUsage?.topup?.allow_when_empty ?? false
  const topupAutoUseLabel = topupUsageLoading
    ? "불러오는 중..."
    : topupAllowWhenEmpty
      ? "서비스 크레딧 소진시 자동 사용"
      : "테넌트 소유자가 충전 크레딧 사용을 제한 했습니다."
  const hasTopupCredits = (topupTotals?.total ?? 0) > 0
  const canControlTopupAutoUse = isOwner || isCurrentUserAdmin
  const topupAutoUseReasons = useMemo(() => {
    if (topupUsageLoading) return []
    const reasons: string[] = []
    if (!canControlTopupAutoUse) reasons.push("권한 없음")
    if (!topupAllowWhenEmpty) reasons.push("정책 제한")
    if (!hasTopupCredits) reasons.push("잔액 없음")
    return reasons
  }, [canControlTopupAutoUse, hasTopupCredits, topupAllowWhenEmpty, topupUsageLoading])
  const topupAutoUseReasonText =
    topupAutoUseReasons.length > 0 ? `제한 사유: ${topupAutoUseReasons.join(" / ")}` : ""

  const topupMemberRows = useMemo(() => {
    return Array.isArray(topupUsage?.members) ? topupUsage.members : []
  }, [topupUsage?.members])

  const selectedTopupPeriod = useMemo(() => {
    if (topupSummary?.period_start && topupSummary?.period_end) {
      return { period_start: topupSummary.period_start, period_end: topupSummary.period_end }
    }
    if (selectedTopupPeriodEnd) {
      return topupPeriods.find((period) => period.period_end === selectedTopupPeriodEnd) ?? null
    }
    return null
  }, [selectedTopupPeriodEnd, topupPeriods, topupSummary?.period_end, topupSummary?.period_start])

  const selectedTopupPeriodRange = selectedTopupPeriod
    ? `${formatDateYmd(selectedTopupPeriod.period_start)} ~ ${formatDateYmd(selectedTopupPeriod.period_end)}`
    : "-"

  const memberStatusCounts = useMemo(() => {
    const counts = { active: 0, suspended: 0, inactive: 0 }
    tenantMembers.forEach((row) => {
      const status = normalizeMembershipStatus(row.membership_status)
      if (status === "pending") return
      if (status in counts) counts[status as keyof typeof counts] += 1
    })
    return counts
  }, [tenantMembers])

  const membersActiveRows = useMemo(() => {
    const rows = tenantMembers.filter((row) => {
      const status = normalizeMembershipStatus(row.membership_status)
      return status !== "inactive" && status !== "pending"
    })
    return rows.sort((a, b) => {
      const roleA = normalizeRoleSlug(a.role_slug)
      const roleB = normalizeRoleSlug(b.role_slug)
      const rankA = MEMBER_ROLE_PRIORITY[roleA] ?? 99
      const rankB = MEMBER_ROLE_PRIORITY[roleB] ?? 99
      if (rankA !== rankB) return rankA - rankB
      const tA = a.joined_at ? new Date(a.joined_at).getTime() : Number.POSITIVE_INFINITY
      const tB = b.joined_at ? new Date(b.joined_at).getTime() : Number.POSITIVE_INFINITY
      return tA - tB
    })
  }, [tenantMembers])

  const membersInactiveRows = useMemo(() => {
    const rows = tenantMembers.filter((row) => normalizeMembershipStatus(row.membership_status) === "inactive")
    return rows.sort((a, b) => {
      const roleA = normalizeRoleSlug(a.role_slug)
      const roleB = normalizeRoleSlug(b.role_slug)
      const rankA = MEMBER_ROLE_PRIORITY[roleA] ?? 99
      const rankB = MEMBER_ROLE_PRIORITY[roleB] ?? 99
      if (rankA !== rankB) return rankA - rankB
      const tA = a.joined_at ? new Date(a.joined_at).getTime() : Number.POSITIVE_INFINITY
      const tB = b.joined_at ? new Date(b.joined_at).getTime() : Number.POSITIVE_INFINITY
      return tA - tB
    })
  }, [tenantMembers])

  const totalSeatsValue = membersLoading
    ? "-"
    : memberLimit !== null
      ? String(memberLimit)
      : String(memberStatusCounts.active + memberStatusCounts.suspended)

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

  const pendingInviteEmails = useMemo(() => {
    const set = new Set<string>()
    tenantInvitations.forEach((row) => {
      const status = String(row.status || "").toLowerCase()
      if (status !== "pending") return
      const email = String(row.invitee_email || "").trim().toLowerCase()
      if (email) set.add(email)
    })
    return set
  }, [tenantInvitations])

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
    const password = memberRemovePassword.trim()
    if (!password) {
      setMemberRemoveError("비밀번호를 입력해 주세요.")
      return
    }
    const headers = authHeaders()
    if (!headers.Authorization) {
      setMemberRemoveError("로그인이 필요합니다.")
      return
    }
    setMemberSaving(true)
    setMemberRemoveError(null)
    try {
      const res = await fetch(`/api/posts/tenant/members/${encodeURIComponent(memberDialogTarget.id)}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          membership_status: "inactive",
          password,
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => "")
        setMemberRemoveError(msg || "멤버 제외에 실패했습니다.")
        return
      }
      setMemberRemoveDialogOpen(false)
      setMemberDialogOpen(false)
      setMemberRemovePassword("")
      await loadTenantMembers()
    } catch (error) {
      console.error(error)
      setMemberRemoveError("멤버 제외에 실패했습니다.")
    } finally {
      setMemberSaving(false)
    }
  }, [authHeaders, canManageMembers, loadTenantMembers, memberDialogTarget, memberRemovePassword])

  const handleResendInvite = useCallback(
    async (row: TenantMemberRow) => {
      if (!canManageMembers) return
      const email = String(row.user_email || "").trim()
      if (!email) {
        toast.error("초대할 이메일이 없습니다.")
        return false
      }
      const role = normalizeRoleSlug(row.role_slug)
      const nextRole = role === "owner" ? "member" : role
      const headers = authHeaders()
      if (!headers.Authorization) {
        toast.error("로그인이 필요합니다.")
        return false
      }
      setResendInviteLoadingId(row.id)
      try {
        const res = await fetch("/api/posts/tenant/invitations", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ invitee_email: email, membership_role: nextRole }),
        })
        const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null
        if (!res.ok || !json?.ok) {
          toast.error(json?.message || "초대 재발송에 실패했습니다.")
          return false
        }
        await loadTenantInvitations()
        toast.success("초대를 다시 보냈습니다.")
        return true
      } catch (error) {
        console.error(error)
        toast.error("초대 재발송에 실패했습니다.")
        return false
      } finally {
        setResendInviteLoadingId(null)
      }
    },
    [authHeaders, canManageMembers, loadTenantInvitations]
  )

  const handleRefresh = useCallback(() => {
    if (!open) return
    if (activeMenu === "info") {
      void loadTenantInfo()
      void loadCreditSummary()
      return
    }
    if (activeMenu === "members") {
      void loadTenantMembers()
      void loadTenantInvitations()
      void loadBillingPlan()
      return
    }
    if (activeMenu === "invitations") {
      void loadTenantInvitations()
      return
    }
    if (activeMenu === "credits") {
      void loadCreditSummary()
      void loadServiceUsage(selectedServicePeriodEnd || undefined)
      return
    }
    if (activeMenu === "topupCredits" || activeMenu === "usage") {
      void loadCreditSummary()
    }
  }, [
    activeMenu,
    loadCreditSummary,
    loadBillingPlan,
    loadServiceUsage,
    loadTenantInfo,
    loadTenantInvitations,
    loadTenantMembers,
    open,
    selectedServicePeriodEnd,
  ])

  const openCreditAccessDialog = useCallback((member: ServiceUsageMember) => {
    setCreditAccessTarget(member)
    setCreditAccessIsActive(member.is_active !== false)
    const hasLimit = member.max_per_period !== null && member.max_per_period !== undefined
    setCreditAccessLimitEnabled(hasLimit)
    setCreditAccessLimitValue(hasLimit ? String(member.max_per_period) : "")
    setCreditAccessLimitError(null)
    setCreditAccessDialogOpen(true)
  }, [])

  const handleSaveCreditAccess = useCallback(async () => {
    if (!creditAccessTarget) return
    const totalCredits = Number(serviceSummary?.total_credits ?? 0)
    if (creditAccessLimitEnabled) {
      const limitNumber = Number(creditAccessLimitValue)
      if (!Number.isFinite(limitNumber) || limitNumber < 0) {
        setCreditAccessLimitError("제한 한도는 0 이상의 숫자여야 합니다.")
        return
      }
      if (totalCredits > 0 && limitNumber > totalCredits) {
        setCreditAccessLimitError(
          `제한 한도는 전체 크레딧(${totalCredits.toLocaleString()}) 이하로 설정해 주세요.`
        )
        return
      }
    }
    setCreditAccessLimitError(null)
    setCreditAccessSaving(true)
    try {
      const headers = authHeaders()
      if (!headers.Authorization) return
      const limitNumber = creditAccessLimitEnabled ? Number(creditAccessLimitValue) : null
      const body: Record<string, unknown> = {
        user_id: creditAccessTarget.user_id,
        is_active: creditAccessIsActive,
        max_per_period: creditAccessLimitEnabled ? (Number.isFinite(limitNumber) ? limitNumber : 0) : null,
      }
      const res = await fetch("/api/ai/credits/my/member-credit-access", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || "저장에 실패했습니다.")
        return
      }
      toast.success("멤버 크레딧 설정이 저장되었습니다.")
      setCreditAccessDialogOpen(false)
      void loadServiceUsage(selectedServicePeriodEnd || undefined)
    } catch {
      toast.error("저장 중 오류가 발생했습니다.")
    } finally {
      setCreditAccessSaving(false)
    }
  }, [
    authHeaders,
    creditAccessIsActive,
    creditAccessLimitEnabled,
    creditAccessLimitValue,
    creditAccessTarget,
    loadServiceUsage,
    selectedServicePeriodEnd,
    serviceSummary?.total_credits,
  ])

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

  const handleOpenSeatDialog = useCallback(() => {
    if (maxExpandableSeats !== null && maxExpandableSeats <= 0) {
      toast.error("추가 가능한 좌석이 없습니다.")
      return
    }
    setSeatDialogError(null)
    setSeatQuantity(1)
    setSeatDialogOpen(true)
  }, [maxExpandableSeats])

  const handleConfirmSeatAdd = useCallback(async () => {
    if (!seatQuantity || seatQuantity <= 0) {
      setSeatDialogError("추가할 좌석 수를 입력해주세요.")
      return
    }
    if (maxExpandableSeats !== null && seatQuantity > maxExpandableSeats) {
      setSeatDialogError(`최대 ${maxExpandableSeats}명까지 추가할 수 있습니다.`)
      return
    }
    const target = await resolveNextBillingRoute()
    setSeatDialogOpen(false)
    navigate(target, {
      state: {
        action: "seat_add",
        seatQuantity,
        seatUnitPrice: extraSeatPrice,
        seatMax: maxExpandableSeats,
        flow: appendVisited(undefined, "seat_add"),
      },
    })
  }, [extraSeatPrice, maxExpandableSeats, navigate, resolveNextBillingRoute, seatQuantity])

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
    if (activeMenu !== "credits") return
    setSelectedServicePeriodEnd("")
    void loadServiceUsage()
  }, [activeMenu, loadServiceUsage, open])
  useEffect(() => {
    if (!open) return
    if (activeMenu !== "topupCredits") return
    setSelectedTopupPeriodEnd("")
    void loadTopupUsage()
    if (isOwner) void loadTopupProducts()
  }, [activeMenu, isOwner, loadTopupProducts, loadTopupUsage, open])
  useEffect(() => {
    if (!open) return
    if (activeMenu !== "members") return
    void loadTenantMembers()
    void loadTenantInvitations()
    void loadBillingPlan()
  }, [activeMenu, loadBillingPlan, loadTenantMembers, loadTenantInvitations, open])
  useEffect(() => {
    if (!open) return
    if (activeMenu !== "invitations") return
    void loadTenantInvitations()
  }, [activeMenu, loadTenantInvitations, open])
  useEffect(() => {
    if (memberDialogOpen) return
    setMemberDialogTarget(null)
    setMemberActionError(null)
    setMemberRemoveDialogOpen(false)
    setMemberRemovePassword("")
    setMemberRemoveError(null)
  }, [memberDialogOpen])
  useEffect(() => {
    if (memberRemoveDialogOpen) return
    setMemberRemovePassword("")
    setMemberRemoveError(null)
  }, [memberRemoveDialogOpen])
  useEffect(() => {
    if (resendInviteDialogOpen) return
    setResendInviteTarget(null)
  }, [resendInviteDialogOpen])
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="새로고침"
                  onClick={handleRefresh}
                >
                  <RotateCw className="size-4" />
                </button>
                <DialogClose
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </DialogClose>
              </div>
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
                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                      {[
                        { label: "총 좌석", value: totalSeatsValue, sub: "명", icon: UsersRound, accent: "text-foreground", bg: "bg-muted/60", ring: "" },
                        {
                          label: "활동",
                          value: membersLoading ? "-" : String(memberStatusCounts.active),
                          sub: "명",
                          icon: UserRoundCheck,
                          accent: "text-teal-600",
                          bg: "bg-teal-50 dark:bg-teal-950/40",
                          ring: "ring-1 ring-teal-200 dark:ring-teal-800",
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
                              {item.label === "총 좌석" && addedSeats > 0 && includedSeats !== null ? (
                                <span className="text-[11px] text-muted-foreground">
                                  (포함 {includedSeats}명 + 추가 {addedSeats}명)
                                </span>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>



                    <div className="mt-3 flex items-center gap-2">

                      {resolvedPlanTier ? (
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", PLAN_TIER_STYLES[resolvedPlanTier].badge)}>
                          {PLAN_TIER_LABELS[resolvedPlanTier]}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">-</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        최대 좌석 수 {maxSeats !== null ? `${maxSeats}` : "-"} 명
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={handleOpenSeatDialog}
                        disabled={billingPlanLoading || (maxExpandableSeats !== null && maxExpandableSeats <= 0)}
                      >
                        <Armchair className="size-4" />좌석 추가
                      </Button>

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
                              const isSelf = Boolean(currentUserId) && String(row.user_id || "") === String(currentUserId)
                              const disableManage = isSelf && isCurrentUserAdmin
                              const initial = resolveMemberInitial(row)
                              const profileSrc = row.profile_image_asset_id
                                ? `/api/ai/media/assets/${String(row.profile_image_asset_id)}`
                                : ""
                              return (
                                <TableRow key={row.id} className="hover:bg-accent/40">
                                  <TableCell className="text-foreground">
                                    <div className="flex items-center gap-1">
                                      <ProfileAvatar
                                        size={24}
                                        rounded="sm"
                                        src={profileSrc}
                                        name={row.user_name || row.user_email}
                                        initial={initial}
                                        fallbackClassName="bg-teal-500"
                                        textClassName="text-sm"
                                      />
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
                                        disabled={disableManage}
                                        onClick={() => {
                                          if (disableManage) return
                                          handleOpenMemberDialog(row)
                                        }}
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
                    {/* <p className="mt-1 text-xs text-muted-foreground">
                      제외 멤버는 한번이라도 크레딧 사용 이력이 있는 사용자만 추가가 됩니다. 사용이력이 없을 시 목록에서 완전 제거 됩니다.
                    </p> */}
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
                                  {(() => {
                                    const email = String(row.user_email || "").trim().toLowerCase()
                                    const isPending = email ? pendingInviteEmails.has(email) : false
                                    const isLoading = resendInviteLoadingId === row.id
                                    const label = isPending ? "초대 중" : "다시 초대"
                                    return (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-blue-500 hover:text-blue-600"
                                        disabled={!canManageMembers || isPending || isLoading}
                                        onClick={() => {
                                          setResendInviteTarget(row)
                                          setResendInviteDialogOpen(true)
                                        }}
                                      >
                                        {label}
                                      </Button>
                                    )
                                  })()}
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
                      <Select
                        value={selectedServicePeriodEnd}
                        onValueChange={(value) => {
                          setSelectedServicePeriodEnd(value)
                          void loadServiceUsage(value)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="기간 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {servicePeriods.length ? (
                            servicePeriods.map((period) => (
                              <SelectItem key={period.period_end} value={period.period_end}>
                                {formatPeriodLabel(period.period_start, !!serviceUsage?.current_period_end && period.period_end === serviceUsage.current_period_end)}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="__empty__" disabled>
                              기간 정보 없음
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="text-sm text-muted-foreground">{selectedServicePeriodRange}</div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">서비스 크레딧 사용 현황</div>
                    <div className="mt-4">
                      {/* 전체 사용량 바 */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">전체 사용량</span>
                        <span className="font-semibold text-foreground">{serviceUsageLabel}</span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full transition-all", planAvatarClass)}
                          style={{ width: `100-${serviceUsageProgress}%` }}
                        />
                      </div>
                      <div className="mt-1 text-right text-xs text-muted-foreground">{serviceUsagePercentLabel}</div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: "전체 용량", value: serviceTotals?.total ?? null, unit: "크레딧", icon: Database, accent: "text-foreground", bg: "bg-muted/60", ring: "" },
                        { label: "사용 중", value: serviceTotals?.used ?? null, unit: "크레딧", icon: HardDrive, accent: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40", ring: "ring-1 ring-sky-200 dark:ring-sky-800" },
                        { label: "남은 용량", value: serviceTotals?.remaining ?? null, unit: "크레딧", icon: PackageOpen, accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "ring-1 ring-emerald-200 dark:ring-emerald-800" },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className={cn("relative rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <Icon className={cn("size-4 shrink-0", item.accent)} />
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                              <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>
                                {typeof item.value === "number" ? item.value.toLocaleString() : "-"}
                              </span>
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
                          {serviceUsageLoading ? (
                            <TableRow>
                              <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                                크레딧 사용 현황을 불러오는 중입니다.
                              </TableCell>
                            </TableRow>
                          ) : serviceMemberRows.length ? (
                            serviceMemberRows.map((row, index) => {
                              const name = resolveUsageMemberName(row)
                              const percentValue = Math.min(row.percent ?? 0, 100)
                              const percentLabel = formatPercent(row.percent ?? 0)
                              const roleSlug = String(row.role_slug || "").toLowerCase()
                              const isOwner = roleSlug === "owner" || roleSlug === "tenant_owner"
                              const limitLabel =
                                row.max_per_period === null || row.max_per_period === undefined
                                  ? "(제한없음)"
                                  : Number(row.max_per_period).toLocaleString()
                              const roleLabel = ROLE_LABELS[roleSlug] || roleSlug || "-"
                              return (
                                <TableRow key={row.user_id} className="hover:bg-accent/40">
                                  <TableCell className="text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                                  <TableCell className="text-foreground">
                                    <div className="flex items-center gap-1.5">
                                      <ProfileAvatar
                                        size={24}
                                        rounded="sm"
                                        src={row.profile_image_url}
                                        name={row.user_name || row.user_email}
                                        initial={resolveUsageMemberInitial(row)}
                                        fallbackClassName="bg-teal-500"
                                        textClassName="text-sm"
                                      />
                                      <div className="flex flex-col leading-tight">
                                        <span className="text-xs block max-w-[120px] truncate">{name}</span>
                                        <span className="text-[10px] text-muted-foreground">{roleLabel}</span>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell">
                                    <div className="flex items-center gap-2">
                                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                        <div
                                          className={cn(
                                            "h-full rounded-full transition-all",
                                            percentValue >= 100 ? "bg-destructive" : percentValue >= 80 ? "bg-amber-500" : "bg-primary"
                                          )}
                                          style={{ width: `${percentValue}%` }}
                                        />
                                      </div>
                                      <span className="w-[36px] text-right text-xs">{percentLabel}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right text-xs">
                                    {(row.used_credits as number).toLocaleString()} / {limitLabel}
                                  </TableCell>
                                  <TableCell className="text-center text-xs">
                                    {row.is_active ? (
                                      <span className="text-teal-500 border border-teal-500 rounded-full px-2 py-1">사용</span>
                                    ) : (
                                      <span className="text-destructive border border-destructive rounded-full px-2 py-1">불가</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {isOwner ? (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-blue-500 hover:text-blue-600"
                                        onClick={() => openCreditAccessDialog(row)}
                                      >
                                        <Settings2 className="size-4" />
                                      </Button>
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

                </div>
              ) : null}


              {activeMenu === "topupCredits" ? (
                <div className="grid gap-4">
                  {!topupUsageLoading && !hasTopupCredits ? (
                    <div className="px-4 pb-4">
                      <div className="text-sm font-semibold text-foreground">충전 크레딧이 없습니다.</div>
                      {isOwner ? (
                        <div className="mt-4">
                          <div className="text-sm font-semibold text-foreground">
                            충전 옵션 <span className="text-xs text-muted-foreground">(부가세 별도)</span>
                          </div>
                          {topupProductsLoading ? (
                            <div className="mt-3 flex items-center justify-center py-8 text-sm text-muted-foreground">
                              <RotateCw className="mr-2 h-4 w-4 animate-spin" /> 충전 상품을 불러오는 중...
                            </div>
                          ) : topupProducts.length === 0 ? (
                            <div className="mt-3 py-6 text-center text-sm text-muted-foreground">
                              현재 구매 가능한 충전 상품이 없습니다.
                            </div>
                          ) : (
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                              {topupProducts.map((product) => {
                                const totalCredits = Number(product.credits)
                                const unitPrice = totalCredits > 0 ? product.price_usd / totalCredits : 0
                                const isBest =
                                  Boolean(product.metadata && (product.metadata as Record<string, unknown>).best_seller) ||
                                  (topupProducts.length >= 3 && product === topupProducts[Math.floor(topupProducts.length * 0.66)])
                                return (
                                  <Card
                                    key={product.id}
                                    className={cn("gap-1 py-0 transition-shadow hover:shadow-md", isBest && "ring-1 ring-blue-500")}
                                  >
                                    <CardHeader className="px-4 pt-4 pb-1">
                                      <CardTitle className="text-lg font-bold text-foreground">+{totalCredits.toLocaleString()}</CardTitle>
                                      <p className="text-[11px] text-muted-foreground">
                                        크레딧{product.bonus_credits > 0 ? ` (보너스 +${Number(product.bonus_credits).toLocaleString()})` : ""}
                                      </p>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-2">
                                      <div className="text-2xl font-extrabold text-foreground gap-1 flex items-center">
                                        ${product.price_usd}
                                        {isBest ? (
                                          <span className="rounded-full border border-border text-regular px-1.5 py-0.5 text-[10px] text-blue-500">
                                            BEST
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-1 text-[11px] text-muted-foreground">1 Credit = ${unitPrice.toFixed(5)}</p>
                                    </CardContent>
                                    <CardFooter className="px-4 pb-4 pt-1">
                                      <Button
                                        variant={isBest ? "default" : "outline"}
                                        size="sm"
                                        className={cn("w-full text-xs", isBest && "bg-blue-500 hover:bg-blue-600 text-white")}
                                        onClick={() => void handleTopupPurchase(product)}
                                      >
                                        구매하기
                                      </Button>
                                    </CardFooter>
                                  </Card>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center px-4 gap-2">
                        <div>
                          <Select
                            value={selectedTopupPeriodEnd}
                            onValueChange={(value) => {
                              setSelectedTopupPeriodEnd(value)
                              void loadTopupUsage(value)
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={topupUsageLoading ? "불러오는 중..." : "이번달"} />
                            </SelectTrigger>
                            <SelectContent>
                              {topupPeriods.map((period, idx) => {
                                const isCurrent = idx === 0 && topupUsage?.current_period_end === period.period_end
                                return (
                                  <SelectItem key={period.period_end} value={period.period_end}>
                                    {formatPeriodLabel(period.period_start, isCurrent)}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="text-sm text-muted-foreground">{selectedTopupPeriodRange}</div>
                        {topupUsageLoading ? (
                          <RotateCw className="size-4 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>

                      <div className="px-4 pb-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">충전 크레딧 사용 현황</div>
                          <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{topupAutoUseLabel}</span>
                            <Switch
                              checked={topupAllowWhenEmpty}
                            disabled={topupAutoUseSaving || topupUsageLoading || !topupAllowWhenEmpty || !canControlTopupAutoUse}
                              onCheckedChange={handleToggleTopupAutoUse}
                            />
                          </div>
                        </div>
                      {topupAutoUseReasonText ? (
                        <div className="mt-2 text-[11px] text-muted-foreground">{topupAutoUseReasonText}</div>
                      ) : null}

                        <div className="mt-4">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">전체 사용량</span>
                            <span className="font-semibold text-foreground">
                              {topupUsageLoading
                                ? "불러오는 중..."
                                : topupTotals
                                  ? `${topupTotals.used.toLocaleString()} / ${topupTotals.total.toLocaleString()} 크레딧`
                                  : "- / - 크레딧"}
                            </span>
                          </div>
                          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `100-${topupTotals ? Math.min(topupTotals.percent, 100) : 0}%` }}
                            />
                          </div>
                          <div className="mt-1 text-right text-xs text-muted-foreground">
                            {topupUsageLoading ? "불러오는 중..." : topupTotals ? `${formatPercent(topupTotals.percent)}% 사용 중` : "-"}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { label: "현재 보유량", value: topupTotals?.total ?? 0, unit: "크레딧", icon: Database, accent: "text-foreground", bg: "bg-muted/60", ring: "" },
                            { label: "사용량", value: topupTotals?.used ?? 0, unit: "크레딧", icon: HardDrive, accent: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40", ring: "ring-1 ring-sky-200 dark:ring-sky-800" },
                            { label: "남은 용량", value: topupTotals?.remaining ?? 0, unit: "크레딧", icon: PackageOpen, accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "ring-1 ring-emerald-200 dark:ring-emerald-800" },
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
                                    <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>
                                      {topupUsageLoading ? "-" : item.value.toLocaleString()}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{item.unit}</span>
                                  </div>
                                  {item.label === "현재 보유량" && isOwner ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="w-8 h-8"
                                          aria-label="추가 충전하기"
                                          onClick={() => setTopupOptionsDialogOpen(true)}
                                        >
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
                              {topupUsageLoading ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                                    불러오는 중...
                                  </TableCell>
                                </TableRow>
                              ) : topupMemberRows.length > 0 ? (
                                topupMemberRows.map((row, index) => {
                                  const name = resolveUsageMemberName(row as ServiceUsageMember)
                                  const initial = resolveUsageMemberInitial(row as ServiceUsageMember)
                                  const roleSlug = String(row.role_slug || "").toLowerCase()
                                  const isRowOwner = roleSlug === "owner" || roleSlug === "tenant_owner"
                                  const usedCredits = Number(row.used_credits ?? 0)
                                  const autoUseEnabled = topupAllowWhenEmpty
                                  const isActive = autoUseEnabled && row.is_active !== false
                                  const isDisabled =
                                    !autoUseEnabled || topupMemberAccessSaving === row.user_id || topupUsageLoading
                                  return (
                                    <TableRow key={row.user_id} className="hover:bg-accent/40">
                                      <TableCell className="text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                                      <TableCell className="text-foreground">
                                        <div className="flex items-center gap-1">
                                          {row.profile_image_url ? (
                                            <ProfileAvatar src={row.profile_image_url} alt={name} className="w-6 h-6 rounded-sm" />
                                          ) : (
                                            <div className="flex items-center justify-center w-6 h-6 bg-teal-500 rounded-sm">
                                              <span className="text-white font-semibold text-sm">{initial}</span>
                                            </div>
                                          )}
                                          <div className="text-xs block max-w-[120px] truncate">{name}</div>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right text-xs">
                                        {usedCredits.toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div className="flex items-center justify-center">
                                          {isRowOwner ? (
                                            <span className="text-xs text-muted-foreground">-</span>
                                          ) : (
                                            <Switch
                                              checked={isActive}
                                              disabled={isDisabled}
                                              onCheckedChange={(checked) => handleToggleTopupMemberAccess(row.user_id, checked)}
                                              aria-label={`${name} 사용 가능 여부`}
                                            />
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                                    표시할 멤버가 없습니다.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </>
                  )}

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
      <Dialog open={seatDialogOpen} onOpenChange={setSeatDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>좌석 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="flex">
              {resolvedPlanTier ? (
                <span className={cn("px-2 py-0.5 rounded text-xs font-medium", PLAN_TIER_STYLES[resolvedPlanTier].badge)}>
                  {PLAN_TIER_LABELS[resolvedPlanTier]}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">-</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">1 좌석 추가 금액</span>
              <span className="font-semibold text-foreground">월 {extraSeatPriceLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">현재 좌석수</span>
              <span className="font-semibold text-foreground">{currentSeatLimit.toLocaleString()}명</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">최대 좌석 수</span>
              <span className="font-semibold text-foreground">
                {maxSeats !== null ? `${maxSeats}명` : "-"}
              </span>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">추가할 좌석수</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={maxExpandableSeats ?? undefined}
                  value={seatQuantity}
                  style={{ width: "100px" }}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (!Number.isFinite(next)) {
                      setSeatQuantity(1)
                      return
                    }
                    setSeatQuantity(Math.max(1, Math.floor(next)))
                    setSeatDialogError(null)
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  명 / {maxExpandableSeats !== null ? `${maxExpandableSeats}` : "-"}명 까지 가능
                </span>
              </div>
            </div>
            {seatDialogError ? <p className="text-xs text-destructive">{seatDialogError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeatDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleConfirmSeatAdd}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              onClick={() => {
                if (!memberDialogTarget || !canManageMembers) return
                setMemberRemoveError(null)
                setMemberRemovePassword("")
                setMemberRemoveDialogOpen(true)
              }}
              disabled={memberSaving || !canManageMembers || !memberDialogTarget}
            >
              멤버 제외
            </Button>
            <Button onClick={handleSaveMember} disabled={memberSaving || !canManageMembers}>
              {memberSaving ? "저장 중..." : "변경 적용"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={memberRemoveDialogOpen} onOpenChange={setMemberRemoveDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>멤버 제외</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              멤버 제외를 진행하려면 본인 비밀번호를 입력해 주세요.
            </p>
            <Input
              type="password"
              value={memberRemovePassword}
              onChange={(e) => {
                setMemberRemovePassword(e.target.value)
                if (memberRemoveError) setMemberRemoveError(null)
              }}
              placeholder="비밀번호"
              disabled={memberSaving}
            />
            {memberRemoveError ? <div className="text-xs text-destructive">{memberRemoveError}</div> : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemberRemoveDialogOpen(false)}
              disabled={memberSaving}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={memberSaving}
            >
              멤버 제외
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={resendInviteDialogOpen}
        onOpenChange={(openValue) => {
          if (!openValue) setResendInviteDialogOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>다시 초대</AlertDialogTitle>
            <AlertDialogDescription>
              {resendInviteTarget ? (
                <span>
                  {resolveMemberName(resendInviteTarget)}({resendInviteTarget.user_email || "-"})을 초대 하시겠습니까?
                </span>
              ) : (
                "초대를 다시 보내시겠습니까?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResendInviteDialogOpen(false)}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!resendInviteTarget) {
                  setResendInviteDialogOpen(false)
                  return
                }
                const ok = await handleResendInvite(resendInviteTarget)
                if (ok) setResendInviteDialogOpen(false)
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={creditAccessDialogOpen} onOpenChange={setCreditAccessDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>멤버 크레딧 관리</DialogTitle>
          </DialogHeader>
          {creditAccessTarget ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <ProfileAvatar
                  size={40}
                  rounded="md"
                  src={creditAccessTarget.profile_image_url}
                  name={creditAccessTarget.user_name || creditAccessTarget.user_email}
                  initial={resolveUsageMemberInitial(creditAccessTarget)}
                  fallbackClassName="bg-teal-500"
                />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium text-foreground">
                    {resolveUsageMemberName(creditAccessTarget)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {creditAccessTarget.user_email || "-"}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">크레딧 사용 허용</div>
                    <div className="text-xs text-muted-foreground">비활성화 시 이 멤버의 크레딧 사용이 차단됩니다.</div>
                  </div>
                  <Switch checked={creditAccessIsActive} onCheckedChange={setCreditAccessIsActive} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">사용량 제한</div>
                      <div className="text-xs text-muted-foreground">기간당 최대 크레딧 사용량을 설정합니다.</div>
                    </div>
                    <Switch checked={creditAccessLimitEnabled} onCheckedChange={(checked) => {
                      setCreditAccessLimitEnabled(checked)
                      if (!checked) setCreditAccessLimitValue("")
                    }} />
                  </div>
                  {creditAccessLimitEnabled ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={Number(serviceSummary?.total_credits ?? 0) || undefined}
                        value={creditAccessLimitValue}
                        onChange={(e) => {
                          setCreditAccessLimitValue(e.target.value)
                          if (creditAccessLimitError) setCreditAccessLimitError(null)
                        }}
                        placeholder="최대 크레딧"
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">크레딧 / 기간</span>
                    </div>
                  ) : null}
                  {creditAccessLimitEnabled && creditAccessLimitError ? (
                    <div className="text-xs text-destructive">{creditAccessLimitError}</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditAccessDialogOpen(false)} disabled={creditAccessSaving}>
              취소
            </Button>
            <Button onClick={handleSaveCreditAccess} disabled={creditAccessSaving}>
              {creditAccessSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TopupOptionsDialog
        open={topupOptionsDialogOpen}
        onOpenChange={setTopupOptionsDialogOpen}
        onPurchase={(product) => {
          setTopupOptionsDialogOpen(false)
          void handleTopupPurchase(product)
        }}
      />
    </Dialog>
  )
}
