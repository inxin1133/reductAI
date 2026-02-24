import { type ChangeEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type PlanTier, PLAN_TIER_ORDER, PLAN_TIER_LABELS, PLAN_TIER_STYLES } from "@/lib/planTier"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TenantSettingsDialog } from "@/components/settings/TenantSettingsDialog"
import {
  ChevronsUp,
  Coins,
  Gauge,
  Menu,
  MonitorSmartphone,
  Settings2,
  SquareAsterisk,
  SquarePen,
  User,
  X,
  EvCharger,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
// cn: 여러 CSS 클래스 이름을 조건이나 배열 등 다양한 형태로 조합해서 하나의 문자열로 반환하는 유틸리티 함수입니다.
// 예를 들어 조건부로 클래스를 추가하거나, 여러 클래스를 가독성 있게 합칠 때 사용합니다.
import { cn } from "@/lib/utils"
import { ProviderBadge } from "@/lib/providerBadge"
import { LogoGoogle } from "@/components/icons/LogoGoogle"
import { LogoKakao } from "@/components/icons/LogoKakao"
import { LogoNaver } from "@/components/icons/LogoNaver"

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMenu?: SettingsMenuId
  onOpenPlanDialog?: () => void
}

export type SettingsMenuId =
  | "profile"
  | "password"
  | "credits"
  | "usage"
  | "devices"
  | "storage"

const PERSONAL_MENUS = [
  { id: "profile" as const, label: "사용자 정보", icon: User },
  { id: "password" as const, label: "비밀번호 관리", icon: SquareAsterisk },
  { id: "credits" as const, label: "크레딧 관리", icon: Coins },
  { id: "usage" as const, label: "사용내역", icon: Gauge },
  { id: "devices" as const, label: "접속기기", icon: MonitorSmartphone },
  // { id: "storage" as const, label: "스토리지", icon: HardDrive }, // 차후 구현 예정임
]

const SETTINGS_MENU_STORAGE_KEY = "reductai:settings:activeMenu"
const SETTINGS_DIALOG_OPEN_KEY = "reductai:settings:isOpen"
const SETTINGS_MENU_IDS = new Set<SettingsMenuId>([...PERSONAL_MENUS].map((item) => item.id))
const AUTH_API_BASE = "http://localhost:3001/auth"
const PROFILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024

function readSettingsMenuFromStorage(): SettingsMenuId | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(SETTINGS_MENU_STORAGE_KEY)
    if (!raw) return null
    return SETTINGS_MENU_IDS.has(raw as SettingsMenuId) ? (raw as SettingsMenuId) : null
  } catch {
    return null
  }
}

function writeSettingsMenuToStorage(value: SettingsMenuId) {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(SETTINGS_MENU_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

function readSettingsDialogOpenFlag() {
  try {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(SETTINGS_DIALOG_OPEN_KEY) === "1"
  } catch {
    return false
  }
}

function writeSettingsDialogOpenFlag(open: boolean) {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(SETTINGS_DIALOG_OPEN_KEY, open ? "1" : "0")
  } catch {
    // ignore
  }
}

type CurrentUserProfile = {
  id: string
  email: string
  full_name?: string | null
  profile_image_asset_id?: string | null
  profile_image_url?: string | null
  has_password?: boolean
}

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
  current_member_count?: number | null
  membership_status?: string | null
  joined_at?: string | null
  expires_at?: string | null
  is_primary?: boolean
  role_slug?: string | null
  role_name?: string | null
  role_scope?: string | null
  member_count?: number | null
  member_limit?: number | null
  plan_tier?: string | null
}

type UserProvider = {
  id: string
  provider: string
  provider_user_id?: string | null
  created_at?: string | null
}

type CreditSummary = {
  tenant_id: string
  subscription: {
    subscription_id?: string | null
    plan_slug?: string | null
    plan_tier?: string | null
    billing_cycle?: string | null
    period_start?: string | null
    period_end?: string | null
    next_charge_at?: string | null
    expires_at?: string | null
    grant_monthly?: number | null
    grant_initial?: number | null
    account_id?: string | null
    balance_credits?: number | null
    reserved_credits?: number | null
    remaining_credits?: number | null
    used_credits?: number | null
    user_used_credits?: number | null
  } | null
  topup: {
    account_id?: string | null
    balance_credits?: number | null
    reserved_credits?: number | null
    remaining_credits?: number | null
    expires_at?: string | null
  }
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
}

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: "활성",
  pending: "대기",
  suspended: "정지",
  inactive: "비활성",
}

const MEMBERSHIP_STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600 ring-emerald-500",
  pending: "bg-amber-50 text-amber-600 ring-amber-500",
  suspended: "bg-rose-50 text-rose-600 ring-rose-500",
  inactive: "bg-slate-50 text-slate-500 ring-slate-300",
}

const SSO_PROVIDERS_BY_EMAIL: { test: (email: string) => boolean; provider: string; label: string; Logo: React.ComponentType<React.SVGProps<SVGSVGElement>>; bg: string; text: string }[] = [
  { test: (e) => e.endsWith("@naver.com"), provider: "naver", label: "네이버 연동", Logo: LogoNaver, bg: "bg-[#03C75A] hover:bg-[#02b351]", text: "text-white" },
  { test: (e) => e.endsWith("@kakao.com"), provider: "kakao", label: "카카오 연동", Logo: LogoKakao, bg: "bg-[#FEE500] hover:bg-[#e6cf00]", text: "text-black" },
  { test: (e) => /@g(oogle|mail)\b/.test(e), provider: "google", label: "구글 연동", Logo: LogoGoogle, bg: "bg-[#4285F4] hover:bg-[#3b78e0]", text: "text-white" },
]

function normalizePlanTier(value: unknown): PlanTier | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!raw) return null
  if (PLAN_TIER_ORDER.includes(raw as PlanTier)) return raw as PlanTier
  return null
}

function pickHighestTier(tiers: PlanTier[]): PlanTier {
  if (!tiers.length) return "free"
  return tiers.reduce((best, tier) => (PLAN_TIER_ORDER.indexOf(tier) > PLAN_TIER_ORDER.indexOf(best) ? tier : best), "free")
}

function formatDateTime(value?: string | null) {
  if (!value) return "-"
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function formatCredits(value?: number | null) {
  if (value === null || value === undefined) return "-"
  if (!Number.isFinite(value)) return "-"
  return Math.floor(value).toLocaleString()
}

const SettingsDialogSidebarMenu = ({
  activeId,
  onChange,
  onUpgrade,
}: {
  activeId: SettingsMenuId
  onChange: (id: SettingsMenuId) => void
  onUpgrade?: () => void
}) => (
  <>
    <div className="p-2">
      <div className="flex h-8 items-center px-2 text-xs text-sidebar-foreground/70">개인 설정</div>
      <div className="flex flex-col gap-1">
        {PERSONAL_MENUS.map((item) => {
          const Icon = item.icon
          const isActive = activeId === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground transition-colors hover:bg-accent",
                isActive && "bg-accent"
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

    <div className="mt-auto p-2">
      <Button
        variant="outline"
        size="sm"
        className="text-blue-500 hover:text-blue-600 w-full"
        onClick={onUpgrade}
      >
        <ChevronsUp className="size-4" />
        업그레이드
      </Button>
    </div>
  </>
)

export function SettingsDialog({ open, onOpenChange, initialMenu, onOpenPlanDialog }: SettingsDialogProps) {
  const [activeMenu, setActiveMenu] = useState<SettingsMenuId>(
    () => readSettingsMenuFromStorage() ?? "profile"
  )
  const [tenantSettingsOpen, setTenantSettingsOpen] = useState(false)
  const [pendingTenantSettingsOpen, setPendingTenantSettingsOpen] = useState(false)
  const [usagePage, setUsagePage] = useState(1)
  const wasOpenRef = useRef(false)
  const userNameInputRef = useRef<HTMLInputElement | null>(null)
  const tenantNameInputRef = useRef<HTMLInputElement | null>(null)

  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null)
  const [currentTenant, setCurrentTenant] = useState<CurrentTenantProfile | null>(null)
  const [tenantMemberships, setTenantMemberships] = useState<TenantMembership[]>([])
  const [userProviders, setUserProviders] = useState<UserProvider[]>([])
  const [creditSummary, setCreditSummary] = useState<CreditSummary | null>(null)
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null)
  const [profileImageAssetId, setProfileImageAssetId] = useState<string | null>(null)
  const [profileImageLoading, setProfileImageLoading] = useState(false)
  const [profileImageError, setProfileImageError] = useState<string | null>(null)
  const [profileImageOversizeOpen, setProfileImageOversizeOpen] = useState(false)
  const profileImageInputRef = useRef<HTMLInputElement | null>(null)
  const handleUpgrade = useCallback(() => {
    onOpenPlanDialog?.()
    onOpenChange(false)
  }, [onOpenPlanDialog, onOpenChange])

  const handleOpenTenantSettings = useCallback(() => {
    setPendingTenantSettingsOpen(true)
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open && pendingTenantSettingsOpen) {
      setTenantSettingsOpen(true)
      setPendingTenantSettingsOpen(false)
    }
  }, [open, pendingTenantSettingsOpen])

  const [isEditingUserName, setIsEditingUserName] = useState(false)
  const [isSavingUserName, setIsSavingUserName] = useState(false)
  const [userNameDraft, setUserNameDraft] = useState("")

  const [isEditingTenantName, setIsEditingTenantName] = useState(false)
  const [isSavingTenantName, setIsSavingTenantName] = useState(false)
  const [tenantNameDraft, setTenantNameDraft] = useState("")

  const [passwordForm, setPasswordForm] = useState({
    current: "",
    next: "",
    confirm: "",
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordCreateMode, setPasswordCreateMode] = useState(false)
  const usageRows = useMemo(
    () => [
      ["2026-02-10 10:12", "GPT-5.2", "입력 12K / 출력 4K", "3.20"],
      ["2026-02-09 15:30", "Gemini 3 Pro", "입력 6K / 출력 2K", "1.15"],
      ["2026-02-08 18:45", "Sora 2", "영상 20초", "2.80"],
    ],
    []
  )
  const usagePageSize = 20
  const usageTotalPages = Math.max(1, Math.ceil(usageRows.length / usagePageSize))
  const usagePageSafe = Math.min(usagePage, usageTotalPages)
  const usagePageRows = useMemo(() => {
    const start = (usagePageSafe - 1) * usagePageSize
    return usageRows.slice(start, start + usagePageSize)
  }, [usagePageSafe, usagePageSize, usageRows])

  const activeLabel = useMemo(() => {
    const menu = PERSONAL_MENUS.find((item) => item.id === activeMenu)
    return menu?.label ?? "사용자 정보"
  }, [activeMenu])

  const authHeaders = useCallback(() => {
    if (typeof window === "undefined") return {}
    const token = window.localStorage.getItem("token")
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }, [])

  const resolvedUserName = useMemo(() => {
    const name = String(currentUser?.full_name || "").trim()
    if (name) return name
    if (typeof window === "undefined") return "사용자"
    const storedName = String(window.localStorage.getItem("user_name") || "").trim()
    if (storedName) return storedName
    const storedEmail = String(window.localStorage.getItem("user_email") || "").trim()
    if (storedEmail) return storedEmail.split("@")[0] || "사용자"
    return "사용자"
  }, [currentUser?.full_name])

  const resolvedUserEmail = useMemo(() => {
    const email = String(currentUser?.email || "").trim()
    if (email) return email
    if (typeof window === "undefined") return "-"
    return String(window.localStorage.getItem("user_email") || "").trim() || "-"
  }, [currentUser?.email])

  const userInitial = useMemo(() => {
    const base = resolvedUserName || resolvedUserEmail
    const trimmed = String(base || "").trim()
    if (!trimmed) return "?"
    return trimmed.slice(0, 1).toUpperCase()
  }, [resolvedUserEmail, resolvedUserName])

  const profileImageSrc = useMemo(() => {
    if (!profileImageUrl) return null
    if (typeof window === "undefined") return profileImageUrl
    if (!profileImageUrl.startsWith("/api/ai/media/assets/")) return profileImageUrl
    const token = window.localStorage.getItem("token")
    if (!token) return profileImageUrl
    const sep = profileImageUrl.includes("?") ? "&" : "?"
    return `${profileImageUrl}${sep}token=${encodeURIComponent(token)}`
  }, [profileImageUrl])

  const tierCandidates = useMemo(() => {
    const tiers: PlanTier[] = []
    const fromTenant = normalizePlanTier(currentTenant?.plan_tier)
    if (fromTenant) tiers.push(fromTenant)
    for (const item of tenantMemberships) {
      const tier = normalizePlanTier(item.plan_tier)
      if (tier) tiers.push(tier)
    }
    return tiers
  }, [currentTenant?.plan_tier, tenantMemberships])

  const highestTier = useMemo(() => pickHighestTier(tierCandidates), [tierCandidates])

  const tiersToDisplay = useMemo(() => {
    const set = new Set<PlanTier>()
    tierCandidates.forEach((tier) => set.add(tier))
    if (!set.size) set.add("free")
    return Array.from(set).sort((a, b) => PLAN_TIER_ORDER.indexOf(a) - PLAN_TIER_ORDER.indexOf(b))
  }, [tierCandidates])

  const displayTenantType = useMemo(() => {
    const raw = String(currentTenant?.tenant_type || "").trim().toLowerCase()
    return TENANT_TYPE_LABELS[raw] || "-"
  }, [currentTenant?.tenant_type])

  const isTeamTenant = useMemo(() => {
    const raw = String(currentTenant?.tenant_type || "").trim().toLowerCase()
    return raw === "team" || raw === "group"
  }, [currentTenant?.tenant_type])

  const creditCard = useMemo(() => {
    const subscription = creditSummary?.subscription ?? null
    const planTier =
      normalizePlanTier(subscription?.plan_tier ?? currentTenant?.plan_tier) ?? "free"
    const totalRaw = Number(subscription?.grant_monthly ?? 0)
    const usedRaw = Number(subscription?.used_credits ?? 0)
    const remainingRaw =
      subscription?.remaining_credits !== null && subscription?.remaining_credits !== undefined
        ? Number(subscription?.remaining_credits ?? 0)
        : Math.max(0, totalRaw - usedRaw)
    const total = Number.isFinite(totalRaw) ? totalRaw : 0
    const used = Number.isFinite(usedRaw) ? Math.max(0, usedRaw) : 0
    const remaining = Number.isFinite(remainingRaw) ? Math.max(0, remainingRaw) : 0
    const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
    return {
      subscription,
      planTier,
      planLabel: PLAN_TIER_LABELS[planTier],
      planStyle: PLAN_TIER_STYLES[planTier],
      total,
      used,
      remaining,
      percent,
      nextChargeAt: subscription?.next_charge_at || subscription?.period_end || null,
      userUsed: subscription?.user_used_credits ?? null,
    }
  }, [creditSummary?.subscription, currentTenant?.plan_tier])

  const passwordChecks = useMemo(() => {
    const next = passwordForm.next
    return {
      length: next.length >= 8,
      letter: /[A-Za-z]/.test(next),
      number: /\d/.test(next),
      special: /[^A-Za-z0-9]/.test(next),
    }
  }, [passwordForm.next])

  const isPasswordValid = useMemo(() => {
    return passwordChecks.length && passwordChecks.letter && passwordChecks.number && passwordChecks.special
  }, [passwordChecks])

  const isPasswordMatch = useMemo(() => {
    if (!passwordForm.next || !passwordForm.confirm) return false
    return passwordForm.next === passwordForm.confirm
  }, [passwordForm.confirm, passwordForm.next])

  const canSubmitPassword = useMemo(() => {
    if (passwordSaving) return false
    if (!passwordForm.next || !passwordForm.confirm) return false
    if (!isPasswordValid) return false
    if (!isPasswordMatch) return false
    if (!passwordCreateMode) {
      if (!passwordForm.current) return false
      if (passwordForm.current === passwordForm.next) return false
    }
    return true
  }, [isPasswordMatch, isPasswordValid, passwordCreateMode, passwordForm, passwordSaving])

  const loadProfile = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setProfileError("로그인이 필요합니다.")
      return
    }

    setProfileLoading(true)
    setProfileError(null)
    try {
      const [userRes, tenantRes, membershipsRes, providersRes] = await Promise.all([
        fetch("/api/posts/user/me", { headers }),
        fetch("/api/posts/tenant/current", { headers }),
        fetch("/api/posts/tenant/memberships", { headers }),
        fetch("/api/posts/user/providers", { headers }),
      ])

      if (userRes.ok) {
        const userJson = (await userRes.json().catch(() => null)) as CurrentUserProfile | null
        if (userJson?.id) {
          const nextProfileAssetId = userJson.profile_image_asset_id
            ? String(userJson.profile_image_asset_id)
            : null
          const nextProfileUrl = userJson.profile_image_url
            ? String(userJson.profile_image_url)
            : nextProfileAssetId
              ? `/api/ai/media/assets/${nextProfileAssetId}`
              : null
          const hasPasswordRaw = (userJson as { has_password?: unknown })?.has_password
          const hasPassword =
            typeof hasPasswordRaw === "boolean"
              ? hasPasswordRaw
              : typeof hasPasswordRaw === "number"
                ? hasPasswordRaw === 1
                : undefined

          setCurrentUser({
            id: String(userJson.id),
            email: String(userJson.email || ""),
            full_name: userJson.full_name ?? null,
            profile_image_asset_id: nextProfileAssetId,
            profile_image_url: nextProfileUrl,
            has_password: hasPassword,
          })
          setProfileImageAssetId(nextProfileAssetId)
          setProfileImageUrl(nextProfileUrl)
          setUserNameDraft(String(userJson.full_name || ""))
          if (typeof window !== "undefined") {
            if (userJson.email) window.localStorage.setItem("user_email", String(userJson.email))
            if (userJson.full_name) window.localStorage.setItem("user_name", String(userJson.full_name))
            if (userJson.id) window.localStorage.setItem("user_id", String(userJson.id))
          }
        }
      }

      if (tenantRes.ok) {
        const tenantJson = (await tenantRes.json().catch(() => null)) as CurrentTenantProfile | null
        if (tenantJson?.id) {
          const nextTenant = {
            id: String(tenantJson.id),
            name: tenantJson.name ?? null,
            tenant_type: tenantJson.tenant_type ?? null,
            plan_tier: tenantJson.plan_tier ?? null,
          }
          setCurrentTenant(nextTenant)
          setTenantNameDraft(String(tenantJson.name || ""))
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(
                "reductai:sidebar:tenantInfo:v1",
                JSON.stringify({
                  id: nextTenant.id,
                  tenant_type: nextTenant.tenant_type || "",
                  name: nextTenant.name || "",
                })
              )
            } catch {
              // ignore
            }
          }
        }
      }

      if (membershipsRes.ok) {
        const membershipsJson = (await membershipsRes.json().catch(() => [])) as TenantMembership[]
        setTenantMemberships(Array.isArray(membershipsJson) ? membershipsJson : [])
      }
      if (providersRes.ok) {
        const providersJson = (await providersRes.json().catch(() => [])) as UserProvider[]
        setUserProviders(Array.isArray(providersJson) ? providersJson : [])
      }
    } catch (error) {
      console.error(error)
      setProfileError("사용자 정보를 불러오지 못했습니다.")
    } finally {
      setProfileLoading(false)
    }
  }, [authHeaders])

  const loadCreditSummary = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setCreditError("로그인이 필요합니다.")
      return
    }
    setCreditLoading(true)
    setCreditError(null)
    try {
      const res = await fetch("/api/ai/credits/my/summary", { headers })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } & CreditSummary | null
      if (!res.ok || !json?.ok) {
        setCreditError(json?.message || "크레딧 정보를 불러오지 못했습니다.")
        setCreditSummary(null)
        return
      }
      setCreditSummary(json)

      if (!currentTenant) {
        const tenantRes = await fetch("/api/posts/tenant/current", { headers })
        if (tenantRes.ok) {
          const tenantJson = (await tenantRes.json().catch(() => null)) as CurrentTenantProfile | null
          if (tenantJson?.id) {
            const nextTenant = {
              id: String(tenantJson.id),
              name: tenantJson.name ?? null,
              tenant_type: tenantJson.tenant_type ?? null,
              plan_tier: tenantJson.plan_tier ?? null,
            }
            setCurrentTenant(nextTenant)
            setTenantNameDraft(String(tenantJson.name || ""))
          }
        }
      }
    } catch (error) {
      console.error(error)
      setCreditError("크레딧 정보를 불러오지 못했습니다.")
      setCreditSummary(null)
    } finally {
      setCreditLoading(false)
    }
  }, [authHeaders, currentTenant])

  const startEditUserName = useCallback(() => {
    if (isSavingUserName) return
    setUserNameDraft(resolvedUserName)
    setIsEditingUserName(true)
  }, [isSavingUserName, resolvedUserName])

  const cancelEditUserName = useCallback(() => {
    if (isSavingUserName) return
    setIsEditingUserName(false)
    setUserNameDraft(resolvedUserName)
  }, [isSavingUserName, resolvedUserName])

  const commitUserName = useCallback(async () => {
    if (isSavingUserName) return
    const nextName = userNameDraft.trim()
    if (!nextName || nextName === resolvedUserName) {
      setIsEditingUserName(false)
      setUserNameDraft(resolvedUserName)
      return
    }

    const headers = authHeaders()
    if (!headers.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }

    setIsSavingUserName(true)
    try {
      const res = await fetch("/api/posts/user/me", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: nextName }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => "")
        alert(msg || "이름 변경에 실패했습니다.")
        return
      }
      const updated = (await res.json().catch(() => null)) as CurrentUserProfile | null
      if (updated?.id) {
        const nextProfileAssetId = updated.profile_image_asset_id
          ? String(updated.profile_image_asset_id)
          : profileImageAssetId
        const nextProfileUrl = updated.profile_image_url
          ? String(updated.profile_image_url)
          : nextProfileAssetId
            ? `/api/ai/media/assets/${nextProfileAssetId}`
            : profileImageUrl
        setCurrentUser({
          id: String(updated.id),
          email: String(updated.email || ""),
          full_name: updated.full_name ?? null,
          profile_image_asset_id: nextProfileAssetId,
          profile_image_url: nextProfileUrl,
        })
        if (nextProfileAssetId !== profileImageAssetId) {
          setProfileImageAssetId(nextProfileAssetId ?? null)
          setProfileImageUrl(nextProfileUrl ?? null)
        }
        setUserNameDraft(String(updated.full_name || ""))
        if (typeof window !== "undefined") {
          if (updated.full_name) window.localStorage.setItem("user_name", String(updated.full_name))
        }
      }
      setIsEditingUserName(false)
    } finally {
      setIsSavingUserName(false)
    }
  }, [authHeaders, isSavingUserName, profileImageAssetId, profileImageUrl, resolvedUserName, userNameDraft])

  const startEditTenantName = useCallback(() => {
    if (isSavingTenantName) return
    setTenantNameDraft(String(currentTenant?.name || ""))
    setIsEditingTenantName(true)
  }, [currentTenant?.name, isSavingTenantName])

  const cancelEditTenantName = useCallback(() => {
    if (isSavingTenantName) return
    setIsEditingTenantName(false)
    setTenantNameDraft(String(currentTenant?.name || ""))
  }, [currentTenant?.name, isSavingTenantName])

  const commitTenantName = useCallback(async () => {
    if (isSavingTenantName) return
    const nextName = tenantNameDraft.trim()
    if (!currentTenant?.id || !nextName || nextName === String(currentTenant?.name || "")) {
      setIsEditingTenantName(false)
      setTenantNameDraft(String(currentTenant?.name || ""))
      return
    }

    const headers = authHeaders()
    if (!headers.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }

    setIsSavingTenantName(true)
    try {
      const res = await fetch(`/api/posts/tenant/${encodeURIComponent(currentTenant.id)}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => "")
        alert(msg || "테넌트 이름 변경에 실패했습니다.")
        return
      }
      const updated = (await res.json().catch(() => null)) as CurrentTenantProfile | null
      if (updated?.id) {
        const nextTenant = {
          id: String(updated.id),
          name: updated.name ?? null,
          tenant_type: updated.tenant_type ?? currentTenant.tenant_type ?? null,
          plan_tier: currentTenant.plan_tier ?? null,
        }
        setCurrentTenant(nextTenant)
        setTenantNameDraft(String(updated.name || ""))
        setTenantMemberships((prev) =>
          prev.map((item) => (String(item.id) === String(updated.id) ? { ...item, name: updated.name } : item))
        )
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              "reductai:sidebar:tenantInfo:v1",
              JSON.stringify({
                id: nextTenant.id,
                tenant_type: nextTenant.tenant_type || "",
                name: nextTenant.name || "",
              })
            )
          } catch {
            // ignore
          }
        }
      }
      setIsEditingTenantName(false)
    } finally {
      setIsSavingTenantName(false)
    }
  }, [authHeaders, currentTenant, isSavingTenantName, tenantNameDraft])

  const openProfileImagePicker = useCallback(() => {
    if (profileImageLoading) return
    profileImageInputRef.current?.click()
  }, [profileImageLoading])

  const handleProfileImageSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ""
      if (!file) return

      setProfileImageError(null)
      setProfileError(null)

      if (!["image/jpeg", "image/png"].includes(file.type)) {
        setProfileImageError("JPG/PNG 파일만 업로드할 수 있습니다.")
        return
      }
      if (file.size > PROFILE_IMAGE_MAX_BYTES) {
        setProfileImageOversizeOpen(true)
        return
      }

      const headers = authHeaders()
      if (!headers.Authorization) {
        setProfileImageError("로그인이 필요합니다.")
        return
      }

      const prevAssetId = profileImageAssetId

      setProfileImageLoading(true)
      try {
        const uploadRes = await fetch("/api/ai/media/profile-image", {
          method: "POST",
          headers: { ...headers, "Content-Type": file.type },
          body: file,
        })
        if (!uploadRes.ok) {
          const msg = await uploadRes.text().catch(() => "")
          setProfileImageError(msg || "프로필 이미지를 업로드하지 못했습니다.")
          return
        }

        const uploaded = (await uploadRes.json().catch(() => null)) as {
          assetId?: string
          id?: string
          url?: string
        } | null
        const assetId = String(uploaded?.assetId || uploaded?.id || "").trim()
        const url = uploaded?.url ? String(uploaded.url) : assetId ? `/api/ai/media/assets/${assetId}` : ""
        if (!assetId || !url) {
          setProfileImageError("업로드 결과를 확인할 수 없습니다.")
          return
        }

        const updateRes = await fetch("/api/posts/user/me", {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ profile_image_asset_id: assetId }),
        })
        if (!updateRes.ok) {
          const msg = await updateRes.text().catch(() => "")
          setProfileImageError(msg || "프로필 이미지 저장에 실패했습니다.")
          return
        }

        setProfileImageAssetId(assetId)
        setProfileImageUrl(url)
        setCurrentUser((prev) =>
          prev
            ? { ...prev, profile_image_asset_id: assetId, profile_image_url: url }
            : {
                id: currentUser?.id || "",
                email: currentUser?.email || "",
                full_name: currentUser?.full_name ?? null,
                profile_image_asset_id: assetId,
                profile_image_url: url,
              }
        )

        if (prevAssetId && prevAssetId !== assetId) {
          await fetch(`/api/ai/media/assets/${encodeURIComponent(prevAssetId)}`, {
            method: "DELETE",
            headers,
          }).catch(() => null)
        }
      } finally {
        setProfileImageLoading(false)
      }
    },
    [authHeaders, currentUser, profileImageAssetId]
  )

  const handleRemoveProfileImage = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!profileImageAssetId || profileImageLoading) return

      const headers = authHeaders()
      if (!headers.Authorization) {
        setProfileImageError("로그인이 필요합니다.")
        return
      }

      setProfileImageLoading(true)
      setProfileImageError(null)
      try {
        const updateRes = await fetch("/api/posts/user/me", {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ profile_image_asset_id: null }),
        })
        if (!updateRes.ok) {
          const msg = await updateRes.text().catch(() => "")
          setProfileImageError(msg || "프로필 이미지 삭제에 실패했습니다.")
          return
        }

        const deleteId = profileImageAssetId
        setProfileImageAssetId(null)
        setProfileImageUrl(null)
        setCurrentUser((prev) =>
          prev ? { ...prev, profile_image_asset_id: null, profile_image_url: null } : prev
        )

        if (deleteId) {
          await fetch(`/api/ai/media/assets/${encodeURIComponent(deleteId)}`, {
            method: "DELETE",
            headers,
          }).catch(() => null)
        }
      } finally {
        setProfileImageLoading(false)
      }
    },
    [authHeaders, profileImageAssetId, profileImageLoading]
  )

  const handleChangePassword = useCallback(async () => {
    if (passwordSaving) return
    setPasswordError(null)
    setPasswordSuccess(null)

    if (!passwordCreateMode && !passwordForm.current) {
      setPasswordError("현재 비밀번호를 입력해 주세요.")
      return
    }
    if (!passwordForm.next || !passwordForm.confirm) {
      setPasswordError("비밀번호를 입력해 주세요.")
      return
    }
    if (!passwordCreateMode && passwordForm.current === passwordForm.next) {
      setPasswordError("새 비밀번호는 현재 비밀번호와 달라야 합니다.")
      return
    }
    if (!isPasswordValid) {
      setPasswordError("비밀번호 조건을 충족해 주세요.")
      return
    }
    if (!isPasswordMatch) {
      setPasswordError("비밀번호가 일치하지 않습니다.")
      return
    }

    const headers = authHeaders()
    if (!headers.Authorization) {
      setPasswordError("로그인이 필요합니다.")
      return
    }

    setPasswordSaving(true)
    try {
      const endpoint = passwordCreateMode ? "set-password" : "change-password"
      const payload: Record<string, string> = {
        newPassword: passwordForm.next,
        confirmPassword: passwordForm.confirm,
      }
      if (!passwordCreateMode) payload.currentPassword = passwordForm.current

      const res = await fetch(`${AUTH_API_BASE}/${endpoint}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = (body as { message?: string })?.message
        if (
          passwordCreateMode &&
          typeof message === "string" &&
          message.includes("이미 비밀번호가 설정")
        ) {
          setPasswordCreateMode(false)
          setCurrentUser((prev) => (prev ? { ...prev, has_password: true } : prev))
          setPasswordError("이미 비밀번호가 설정되어 있어 비밀번호 변경 화면으로 전환했습니다.")
          return
        }
        setPasswordError(message || "비밀번호 설정에 실패했습니다.")
        return
      }
      setPasswordSuccess(passwordCreateMode ? "비밀번호가 생성되었습니다." : "비밀번호가 변경되었습니다.")
      setPasswordForm({ current: "", next: "", confirm: "" })
      if (passwordCreateMode) {
        setPasswordCreateMode(false)
        setCurrentUser((prev) => prev ? { ...prev, has_password: true } : prev)
      }
    } finally {
      setPasswordSaving(false)
    }
  }, [authHeaders, isPasswordMatch, isPasswordValid, passwordCreateMode, passwordForm, passwordSaving])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    const wasAlreadyOpen = readSettingsDialogOpenFlag()
    if (!wasAlreadyOpen && initialMenu) {
      setActiveMenu(initialMenu)
      return
    }
    const stored = readSettingsMenuFromStorage()
    if (stored) setActiveMenu(stored)
  }, [open, initialMenu])

  useEffect(() => {
    writeSettingsMenuToStorage(activeMenu)
  }, [activeMenu])

  useEffect(() => {
    if (open && activeMenu === "profile") return
    setIsEditingUserName(false)
    setIsEditingTenantName(false)
  }, [activeMenu, open])

  useEffect(() => {
    if (!open) return
    if (activeMenu !== "profile") return
    void loadProfile()
  }, [activeMenu, loadProfile, open])

  useEffect(() => {
    if (!open) return
    if (activeMenu !== "credits") return
    void loadCreditSummary()
  }, [activeMenu, loadCreditSummary, open])

  useEffect(() => {
    if (!open) return
    if (activeMenu !== "profile") return
    if (isEditingUserName) userNameInputRef.current?.focus()
  }, [activeMenu, isEditingUserName, open])

  useEffect(() => {
    if (!open) return
    if (activeMenu !== "profile") return
    if (isEditingTenantName) tenantNameInputRef.current?.focus()
  }, [activeMenu, isEditingTenantName, open])

  useEffect(() => {
    if (usagePage > usageTotalPages) setUsagePage(usageTotalPages)
  }, [usagePage, usageTotalPages])

  useEffect(() => {
    writeSettingsDialogOpenFlag(open)
  }, [open])

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-48px)] overflow-hidden rounded-xl border border-border p-0 shadow-lg sm:max-w-[min(1000px,calc(100%-48px))]"
      >
        <div className="flex h-[700px] max-h-[calc(100vh-2rem)] w-full bg-background">
          <div className="hidden w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            <SettingsDialogSidebarMenu activeId={activeMenu} onChange={setActiveMenu} onUpgrade={handleUpgrade} />
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
                      <SettingsDialogSidebarMenu activeId={activeMenu} onChange={setActiveMenu} onUpgrade={handleUpgrade} />
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

            <div className="mt-3 min-w-0 flex-1 overflow-y-auto pr-2">
              {activeMenu === "profile" ? (
                // 사용자 정보
                <div className="grid gap-3">
                  {profileError ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {profileError}
                    </div>
                  ) : null}
                  <AlertDialog open={profileImageOversizeOpen} onOpenChange={setProfileImageOversizeOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>업로드 용량 초과</AlertDialogTitle>
                      </AlertDialogHeader>
                      <div className="text-sm text-muted-foreground">
                        프로필 이미지는 최대 10MB 이하 파일만 업로드할 수 있습니다.
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogAction>확인</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0 group">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={openProfileImagePicker}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault()
                                  openProfileImagePicker()
                                }
                              }}
                              className={cn(
                                "size-10 rounded-lg flex items-center justify-center overflow-hidden transition",
                                PLAN_TIER_STYLES[highestTier].avatar,
                                profileImageLoading ? "cursor-wait opacity-70" : "cursor-pointer hover:brightness-95"
                              )}
                              aria-label="프로필 이미지 변경"
                            >
                              {profileImageSrc ? (
                                <img
                                  src={profileImageSrc}
                                  alt="프로필 이미지"
                                  className="size-10 object-cover"
                                />
                              ) : (
                                <span className="text-white font-semibold text-lg">{userInitial}</span>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>{profileImageSrc ? "프로필 이미지 변경" : "프로필 이미지 삽입"}</p>
                          </TooltipContent>
                        </Tooltip>
                        {profileImageSrc ? (
                          <button
                            type="button"
                            className="absolute -top-2 -right-2 z-10 flex size-5 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition group-hover:opacity-100 shadow-sm"
                            onClick={handleRemoveProfileImage}
                            aria-label="프로필 이미지 삭제"
                          >
                            <X className="size-3" />
                          </button>
                        ) : null}
                        <input
                          ref={profileImageInputRef}
                          type="file"
                          accept="image/jpeg,image/png"
                          className="hidden"
                          onChange={handleProfileImageSelected}
                        />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        {isEditingUserName ? (
                          <Input
                            ref={userNameInputRef}
                            value={userNameDraft}
                            onChange={(e) => setUserNameDraft(e.target.value)}
                            onBlur={() => void commitUserName()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                void commitUserName()
                                return
                              }
                              if (e.key === "Escape") {
                                e.preventDefault()
                                cancelEditUserName()
                              }
                            }}
                            className="h-8 text-base font-semibold text-sidebar-foreground"
                            disabled={isSavingUserName}
                          />
                        ) : (
                          <p className="text-base text-left font-semibold text-sidebar-foreground truncate">
                            {resolvedUserName}
                          </p>
                        )}
                        {isEditingUserName ? (
                          <p className="pt-1 pl-2  text-xs text-left text-muted-foreground truncate">
                            {isSavingUserName ? "저장 중..." : "내용 변경후 Enter로 저장 또는 인풋 밖 클릭 (변경 내용 없을 시 취소)"}
                          </p>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-left text-blue-500 truncate hover:text-blue-600"
                            onClick={startEditUserName}
                          >
                            이름변경
                          </button>
                        )}
                      </div>
                    </div>
                    {profileImageError ? (
                      <p className="mt-2 text-xs text-destructive">{profileImageError}</p>
                    ) : null}
                  </div>

                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">기본 정보</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">이메일</div>
                        <div className="flex items-center gap-2 text-foreground">{resolvedUserEmail}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">테넌트 유형</div>
                        <div className="flex items-center gap-2 text-foreground">{displayTenantType}</div>
                      </div>
                      {isTeamTenant ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">테넌트 이름</div>
                          <div className="flex items-center gap-2 text-foreground min-w-0">
                            {isEditingTenantName ? (
                              <Input
                                ref={tenantNameInputRef}
                                value={tenantNameDraft}
                                onChange={(e) => setTenantNameDraft(e.target.value)}
                                onBlur={() => void commitTenantName()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault()
                                    void commitTenantName()
                                    return
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault()
                                    cancelEditTenantName()
                                  }
                                }}
                                className="h-7 text-sm"
                                disabled={isSavingTenantName}
                              />
                            ) : (
                              <span className="truncate">{currentTenant?.name || "-"}</span>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="shrink-0"
                                  onClick={startEditTenantName}
                                  disabled={isSavingTenantName}
                                  aria-label="테넌트 이름 변경"
                                >
                                  <SquarePen className="size-3 text-blue-500" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>이름 변경</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">서비스 등급</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {tiersToDisplay.map((tier) => (
                            <span
                              key={tier}
                              className={cn("rounded-full px-3 py-1 text-xs font-semibold", PLAN_TIER_STYLES[tier].badge)}
                            >
                              {PLAN_TIER_LABELS[tier]}
                            </span>
                          ))}
                          {/* <Button
                            variant="ghost"                            
                            className="text-emerald-500 hover:text-emerald-600 text-xs px-2 py-0.5"
                          >
                            <ChevronsUp className="size-3" />
                            업그레이드
                          </Button> */}
                        </div>                        
                      </div>                      
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">연동 계정</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      {userProviders.length ? (
                        userProviders.map((provider) => (
                          <div key={provider.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ProviderBadge provider={provider.provider} />
                              {provider.provider_user_id ? (
                                <span className="text-xs text-muted-foreground">{provider.provider_user_id}</span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(provider.created_at)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="flex flex-col gap-2">
                          {profileLoading ? (
                            <span className="text-xs text-muted-foreground">불러오는 중...</span>
                          ) : (() => {
                            const email = resolvedUserEmail.toLowerCase()
                            const match = SSO_PROVIDERS_BY_EMAIL.find((s) => s.test(email))
                            return match ? (
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-muted-foreground">연동된 계정이 없습니다. {email}는 연동 가능계정입니다.</span>
                                <Button
                                  size="xs"
                                  className={cn("gap-1.5 border-0 shadow-sm", match.bg, match.text)}
                                  onClick={() => { window.location.href = `${AUTH_API_BASE}/${match.provider}` }}
                                >
                                  <match.Logo className="size-4" />
                                  {match.label}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">연동된 계정이 없습니다<div className="12"></div></span>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {isTeamTenant ? (                    
                    <div className="p-4">
                      <div className="text-sm font-semibold text-foreground border-b border-border pb-2">테넌트 정보</div>
                      <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                        {tenantMemberships.length ? (
                          tenantMemberships.map((item) => {
                            const roleSlug = String(item.role_slug || "").toLowerCase()
                            const roleLabel = item.role_name || ROLE_LABELS[roleSlug] || "멤버"
                            const statusKey = String(item.membership_status || "active").toLowerCase()
                            const statusLabel = MEMBERSHIP_STATUS_LABELS[statusKey] || "활성"
                            const statusStyle = MEMBERSHIP_STATUS_STYLES[statusKey] || MEMBERSHIP_STATUS_STYLES.active
                            const memberCountRaw =
                              typeof item.current_member_count === "number" && Number.isFinite(item.current_member_count)
                                ? item.current_member_count
                                : typeof item.member_count === "number" && Number.isFinite(item.member_count)
                                  ? item.member_count
                                  : null
                            const memberLimit =
                              typeof item.member_limit === "number" && Number.isFinite(item.member_limit)
                                ? item.member_limit
                                : null
                            const canManage = roleSlug === "owner" || roleSlug === "admin"
                            return (
                              <div key={item.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span>{item.name || "-"}</span>
                                  <span className="text-xs">({roleLabel})</span>
                                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", statusStyle)}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-foreground">
                                  {item.expires_at ? (
                                    <span className="text-xs text-muted-foreground">만료 {formatDateTime(item.expires_at)}</span>
                                  ) : null}
                                  멤버 {memberCountRaw ?? "-"}/{memberLimit ?? "-"}
                                  {canManage ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                                          onClick={handleOpenTenantSettings}
                                        >
                                          <Settings2 className="size-3" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>설정 바로가기</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {profileLoading ? "불러오는 중..." : "가입된 테넌트가 없습니다."}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* 계정 삭제 부분 숨김 처리 */}
                  {/* <div className="p-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">계정</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">내 계정 삭제</div>
                        <div className="flex items-center gap-2 text-foreground">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            계정 삭제하기
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div> */}

                </div>
              ) : null}

              {activeMenu === "password" ? (
                // 비밀번호 관리
                <div className="grid gap-3">
                  <div className="p-4">
                    {(currentUser?.has_password === false ||
                      (currentUser?.has_password == null && userProviders.length > 0)) &&
                    !passwordCreateMode ? (
                      <>
                        <div className="text-sm font-semibold text-foreground border-b border-border pb-2">비밀번호 설정</div>
                        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4 grid gap-2">
                          <p className="text-sm text-foreground font-medium">SSO로 생성된 계정이라 비밀번호 설정이 안되어있습니다.</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            비밀번호 설정을 하면 SSO 로그인은 물론 추가로 계정(이메일) + 비밀번호로 로그인 할 수 있습니다.
                          </p>
                          <div className="mt-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                setPasswordCreateMode(true)
                                setPasswordForm({ current: "", next: "", confirm: "" })
                                setPasswordError(null)
                                setPasswordSuccess(null)
                              }}
                            >
                              <SquareAsterisk className="size-4" />
                              비밀번호 생성
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-foreground border-b border-border pb-2">
                          {passwordCreateMode ? "비밀번호 생성" : "비밀번호 변경"}
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                          {!passwordCreateMode ? (
                            <div className="grid gap-1">
                              <Label className="text-xs">현재 비밀번호</Label>
                              <Input
                                type="password"
                                value={passwordForm.current}
                                onChange={(e) => {
                                  setPasswordForm((prev) => ({ ...prev, current: e.target.value }))
                                  setPasswordError(null)
                                  setPasswordSuccess(null)
                                }}
                                placeholder="현재 비밀번호"
                              />
                            </div>
                          ) : null}
                          <div className="grid gap-1">
                            <Label className="text-xs">{passwordCreateMode ? "비밀번호" : "새 비밀번호"}</Label>
                            <Input
                              type="password"
                              value={passwordForm.next}
                              onChange={(e) => {
                                setPasswordForm((prev) => ({ ...prev, next: e.target.value }))
                                setPasswordError(null)
                                setPasswordSuccess(null)
                              }}
                              placeholder={passwordCreateMode ? "비밀번호" : "새 비밀번호"}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">{passwordCreateMode ? "비밀번호 확인" : "새 비밀번호 확인"}</Label>
                            <Input
                              type="password"
                              value={passwordForm.confirm}
                              onChange={(e) => {
                                setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))
                                setPasswordError(null)
                                setPasswordSuccess(null)
                              }}
                              placeholder={passwordCreateMode ? "비밀번호 확인" : "새 비밀번호 확인"}
                            />
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground grid gap-1">
                          <div className={cn(passwordChecks.length ? "text-emerald-500" : "text-muted-foreground")}>
                            8자 이상
                          </div>
                          <div className={cn(passwordChecks.letter ? "text-emerald-500" : "text-muted-foreground")}>
                            영문 포함
                          </div>
                          <div className={cn(passwordChecks.number ? "text-emerald-500" : "text-muted-foreground")}>
                            숫자 포함
                          </div>
                          <div className={cn(passwordChecks.special ? "text-emerald-500" : "text-muted-foreground")}>
                            특수문자 포함
                          </div>
                          {passwordForm.confirm ? (
                            <div className={cn(isPasswordMatch ? "text-emerald-500" : "text-destructive")}>
                              {isPasswordMatch ? "비밀번호 일치" : "비밀번호 불일치"}
                            </div>
                          ) : null}
                        </div>
                        {passwordError ? (
                          <div className="mt-3 text-xs text-destructive">{passwordError}</div>
                        ) : null}
                        {passwordSuccess ? (
                          <div className="mt-3 text-xs text-emerald-500">{passwordSuccess}</div>
                        ) : null}
                        <div className="mt-4 flex items-center gap-2">
                          <button
                            className={cn(
                              "rounded-md px-4 py-2 text-sm text-primary-foreground",
                              canSubmitPassword ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground"
                            )}
                            type="button"
                            disabled={!canSubmitPassword}
                            onClick={handleChangePassword}
                          >
                            {passwordSaving
                              ? (passwordCreateMode ? "생성 중..." : "변경 중...")
                              : (passwordCreateMode ? "비밀번호 생성" : "비밀번호 변경")}
                          </button>
                          {passwordCreateMode ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setPasswordCreateMode(false)
                                setPasswordForm({ current: "", next: "", confirm: "" })
                                setPasswordError(null)
                                setPasswordSuccess(null)
                              }}
                            >
                              취소
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {activeMenu === "credits" ? (
                // 크레딧 관리
                <div className="grid gap-3">

                  {/* 나의 크레딧 */}
                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground">나의 크레딧</div>
                    <div className="mt-3 rounded-xl border border-border">
                      <div className="border-b border-border px-4 py-6">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">
                            {currentTenant?.name || "테넌트"} 서비스 크레딧
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {creditCard.subscription ? `${formatCredits(creditCard.total)} 크레딧` : "-"}
                            </span>
                            {creditCard.subscription ? (
                              <span
                                className={cn(
                                  "rounded-full px-3 py-1 text-xs font-semibold",
                                  creditCard.planStyle.badge
                                )}
                              >
                                {creditCard.planLabel}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {creditLoading ? (
                          <div className="mt-2 text-xs text-muted-foreground">불러오는 중...</div>
                        ) : creditError ? (
                          <div className="mt-2 text-xs text-destructive">{creditError}</div>
                        ) : null}
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", creditCard.planStyle.avatar)}
                            style={{ width: `${creditCard.percent}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-1 justify-between">
                          <div>
                            {creditCard.subscription
                              ? `이번달 ${creditCard.percent}% 사용 (${formatCredits(creditCard.used)} 사용 / ${formatCredits(creditCard.remaining)} 남음 / 전체 ${formatCredits(creditCard.total)} 크레딧)`
                              : "구독 크레딧 정보가 없습니다."}
                          </div>
                          <div>
                            다음 충전일:{" "}
                            <span className="text-foreground">{formatDateTime(creditCard.nextChargeAt)}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex text-sm text-foreground flex-1 items-center gap-2">
                          <span className="font-bold">나의 사용</span>
                          <span className="">
                            {creditCard.subscription
                              ? `${formatCredits(creditCard.userUsed)} 크레딧`
                              : "-"}
                          </span>
                        </div>
                      </div>

                      <div className="px-4 py-6">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">충전 크레딧</div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">서비스 크레딧 소진시 자동 사용</span>
                            <Switch id="" />
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                          <div className="h-full w-[100%] rounded-full bg-primary" />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-1 justify-between">
                          <div>이번달 0% 사용 (0 사용 / 42,000 남음 / 전체 42,000 크레딧)</div> 
                          <div>마지막 충전일: <span className="text-foreground">2026-01-29</span></div>
                        </div>                        
                      </div>
                    </div>
                  </div>

                   {/* 충전 옵션 */}
                   <div className="p-4">
                    <div className="text-sm font-semibold text-foreground">충전 옵션 <span className="text-xs text-muted-foreground">(부가세 별도)</span></div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {[
                        { credits: "10,000", price: "$10", unit: "1 Credit = $0.001", accent: false },
                        { credits: "21,000", price: "$20", unit: "1 Credit = $0.00095", accent: false },
                        { credits: "55,000", price: "$50", unit: "1 Credit = $0.00091", accent: true },
                        { credits: "120,000", price: "$100", unit: "1 Credit = $0.00083", accent: false },
                      ].map((opt) => (
                        <Card
                          key={opt.credits}
                          className={cn(
                            "gap-1 py-0 transition-shadow hover:shadow-md",
                            opt.accent && "ring-1 ring-blue-500"
                          )}
                        >
                          <CardHeader className="px-4 pt-4 pb-1">
                            <CardTitle className="text-lg font-bold text-foreground">+{opt.credits}</CardTitle>
                            <p className="text-[11px] text-muted-foreground">크레딧</p>
                          </CardHeader>
                          <CardContent className="px-4 pb-2">
                            <div className="text-2xl font-extrabold text-foreground gap-1 flex items-center">{opt.price}
                              {opt.accent ? <span className="rounded-full border border-border text-regular px-1.5 py-0.5 text-[10px] text-blue-500">BEST</span> : ""}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">{opt.unit}</p>
                          </CardContent>
                          <CardFooter className="px-4 pb-4 pt-1">
                            <Button
                              variant={opt.accent ? "default" : "outline"}
                              size="sm"
                              className={cn("w-full text-xs", opt.accent && "bg-blue-500 hover:bg-blue-600 text-white")}
                            >
                              구매하기
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  </div>


                  {/* 제공 받은 크레딧 */}
                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground">제공 받은 크레딧</div>

                    <div className="mt-3 rounded-xl border border-border">
                      <div className="border-b border-border px-4 py-6">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">BB 팀 서비스 크레딧</div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full px-3 py-1 text-xs font-semibold bg-amber-50 text-amber-600 ring-1 ring-amber-500">Business</span>
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                          <div className="h-full w-[90%] rounded-full bg-amber-500" />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-1 justify-between">
                          <div>이번달 10% 사용 (5,000 사용 / 45,000 남음 / 테넌트 전체 50,000 크레딧)</div>
                          <div>다음 갱신일: <span className="text-foreground">2026-03-06</span></div>
                        </div>
                        <div className="mt-2 text-xs text-foreground flex flex-1 items-center gap-2">                          
                          <div className="text-sm text-teal-500">사용 제한 없음</div> 
                          <div className="text-xs text-muted-foreground"><span className="text-foreground">1,000 사용</span> / 테넌트 전체 50,000 크레딧 내에서 사용 가능</div>
                        </div>
                        <div className="mt-3 text-xs text-foreground flex flex-1 items-center gap-1">                          
                          <EvCharger className="size-4" /><span className="text-sm font-bold">서비스 크레딧 소진시 충전 크레딧 자동 사용 허용됨 </span>
                        </div>
                      </div>                      
                    </div>

                    <div className="mt-3 rounded-xl border border-border">
                      <div className="border-b border-border px-4 py-6">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">CC 그룹 서비스 크레딧</div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full px-3 py-1 text-xs font-semibold bg-rose-50 text-rose-600 ring-1 ring-rose-500">Enterprise</span>
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                          <div className="h-full w-[80%] rounded-full bg-rose-500" />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-1 justify-between">
                          <div>이번달 20% 사용 (20,000 사용 / 80,000 남음 / 테넌트 전체 100,000 크레딧)</div>                          
                          <div>다음 갱신일: <span className="text-foreground">2026-03-16</span></div>
                        </div>
                        <div className="mt-2 text-xs text-foreground flex flex-1 items-center gap-2">                          
                          <div className="text-sm text-rose-500">사용 제한 있음</div> <div className="text-xs text-muted-foreground"><span className="text-foreground">2,000 사용</span> / 8,000 남음 / 최대 10,000 크레딧 사용 가능</div> 
                        </div>
                      </div>                     
                    </div>

                  </div>




                 


                </div>
              ) : null}

              {activeMenu === "usage" ? (
                // 사용내역
                <div className="flex h-full flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto">
                    <Table className="">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">날짜</TableHead>
                          <TableHead className="text-xs">모델</TableHead>
                          <TableHead className="text-xs">사용량</TableHead>
                          <TableHead className="text-right text-xs">크레딧</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usagePageRows.map((row) => (
                          <TableRow key={row[0]}>
                            <TableCell className="text-muted-foreground text-xs">{row[0]}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{row[1]}</TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-normal break-words break-all">{row[2]}</TableCell>
                            <TableCell className="text-right text-foreground text-xs">{row[3]}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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

              {activeMenu === "devices" ? (
                // 접속 기기 현황
                <div className="p-4">
                  <div className="text-sm font-semibold text-foreground">접속 기기 현황</div>
                  <div className="mt-3 grid text-sm text-muted-foreground border border-border rounded-lg shadow-sm shadow-muted-foreground/10">
                    {[
                      { title: "MacBook Pro · Chrome", location: "서울, KR", status: "현재 사용 중", isCurrent: true },
                      { title: "iPhone 16 · Safari", location: "부산, KR", status: "2일 전", isCurrent: false },
                      { title: "Windows · Edge", location: "도쿄, JP", status: "7일 전", isCurrent: false },
                    ].map((row, idx, arr) => (
                      <div
                        key={row.title}
                        className={cn(
                          "flex items-center justify-between px-3 py-3",
                          idx < arr.length - 1 && "border-b border-border"
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-foreground">{row.title}</span>
                            {row.isCurrent ? (
                              <span className="text-xs font-semibold text-blue-500">이 기기</span>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{row.location}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{row.status}</span>
                          {!row.isCurrent ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-muted-foreground hover:text-foreground h-6 px-2"
                            >
                              로그아웃
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}


              {/* 스토리지는 차후 구현 예정임 */}
              {/* {activeMenu === "storage" ? (
                // 스토리지 사용량
                <div className="grid gap-3">

                  
                  <div className="p-4">
                    <div className="rounded-xl border border-border p-4">
                      <div className="text-sm font-semibold text-foreground">스토리지 사용량</div>
                      <div className="mt-3 h-2 w-full rounded-full bg-muted">
                        <div className="h-full w-[33%] rounded-full bg-blue-500" />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">33% 사용 (10GB / 30GB)</div>
                    </div>
                  </div>

                  
                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground">스토리지 제공목록</div>
                    <div className="mt-3 border border-border rounded-lg shadow-sm shadow-muted-foreground/10">
                      <Table className="">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">테넌트이름</TableHead>
                            <TableHead className="text-xs">서비스 등급</TableHead>
                            <TableHead className="text-xs">테넌트 역할</TableHead>
                            <TableHead className="text-right text-xs">제공용량</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            ["AA 팀", "Premium", "소유자", "10GB"],
                            ["BB 팀", "Business", "멤버", "10GB"],
                            ["CC 그룹", "Enterprise", "관리자", "10GB"],
                          ].map((row) => (
                            <TableRow key={row[0]}>
                              <TableCell className="text-muted-foreground text-xs">{row[0]}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{row[1]}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">{row[2]}</TableCell>
                              <TableCell className="text-right text-foreground text-xs">{row[3]}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={3}>총 제공량</TableCell>
                            <TableCell className="text-right">30GB</TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </div>
                </div>
              ) : null} */}



            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <TenantSettingsDialog
      open={tenantSettingsOpen}
      onOpenChange={setTenantSettingsOpen}
    />
    </>
  )
}
