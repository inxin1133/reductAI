import { type ChangeEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ArrowLeft,
  ChevronsUp,
  ClipboardList,
  Coins,
  CreditCard,
  Ellipsis,
  Gauge,
  HandHelping,
  HardDrive,
  Menu,
  MonitorSmartphone,
  NotebookPen,
  Plus,
  ReceiptText,
  Settings2,
  SquareAsterisk,
  SquarePen,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
// cn: 여러 CSS 클래스 이름을 조건이나 배열 등 다양한 형태로 조합해서 하나의 문자열로 반환하는 유틸리티 함수입니다.
// 예를 들어 조건부로 클래스를 추가하거나, 여러 클래스를 가독성 있게 합칠 때 사용합니다.
import { cn } from "@/lib/utils"
import { CardVisa } from "@/components/icons/CardVisa"
import { CardMaster } from "@/components/icons/CardMaster"
import { CardAmex } from "@/components/icons/CardAmex"

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMenu?: SettingsMenuId
}

export type SettingsMenuId =
  | "profile"
  | "password"
  | "credits"
  | "usage"
  | "devices"
  | "storage"
  | "subscription"
  | "invoices"
  | "billing"
  | "payments"
  | "transactions"

const PERSONAL_MENUS = [
  { id: "profile" as const, label: "사용자 정보", icon: User },
  { id: "password" as const, label: "비밀번호 관리", icon: SquareAsterisk },
  { id: "credits" as const, label: "크레딧 관리", icon: Coins },
  { id: "usage" as const, label: "사용내역", icon: Gauge },
  { id: "devices" as const, label: "접속기기", icon: MonitorSmartphone },
  { id: "storage" as const, label: "스토리지", icon: HardDrive },
]

const BILLING_MENUS = [
  { id: "subscription" as const, label: "구독 관리", icon: HandHelping },
  { id: "invoices" as const, label: "청구서", icon: ReceiptText },
  { id: "billing" as const, label: "청구 관리", icon: NotebookPen },
  { id: "payments" as const, label: "결제 수단", icon: CreditCard },
  { id: "transactions" as const, label: "결제 내역", icon: ClipboardList },
]

const SETTINGS_MENU_STORAGE_KEY = "reductai:settings:activeMenu"
const SETTINGS_DIALOG_OPEN_KEY = "reductai:settings:isOpen"
const SETTINGS_MENU_IDS = new Set<SettingsMenuId>([...PERSONAL_MENUS, ...BILLING_MENUS].map((item) => item.id))
const DAUM_POSTCODE_SCRIPT_ID = "daum-postcode-script"
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

type BillingFormState = {
  name: string
  email: string
  postalCode: string
  address1: string
  address2: string
  extraAddress: string
  phone: string
}

type PlanTier = "free" | "pro" | "premium" | "business" | "enterprise"

type CurrentUserProfile = {
  id: string
  email: string
  full_name?: string | null
  profile_image_asset_id?: string | null
  profile_image_url?: string | null
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
  is_primary?: boolean
  role_slug?: string | null
  role_name?: string | null
  role_scope?: string | null
  member_count?: number | null
  plan_tier?: string | null
}

const INITIAL_BILLING_FORM: BillingFormState = {
  name: "홍길동",
  email: "hong@example.com",
  postalCode: "",
  address1: "",
  address2: "",
  extraAddress: "",
  phone: "",
}

const PLAN_TIER_ORDER: PlanTier[] = ["free", "pro", "premium", "business", "enterprise"]
const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
  business: "Business",
  enterprise: "Enterprise",
}
const PLAN_TIER_STYLES: Record<PlanTier, { badge: string; avatar: string }> = {
  free: { badge: "bg-muted text-muted-foreground ring-1 ring-border", avatar: "bg-muted-foreground" },
  pro: { badge: "bg-teal-50 text-teal-600 ring-1 ring-teal-500", avatar: "bg-teal-500" },
  premium: { badge: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500", avatar: "bg-indigo-500" },
  business: { badge: "bg-amber-50 text-amber-600 ring-1 ring-amber-500", avatar: "bg-amber-500" },
  enterprise: { badge: "bg-rose-50 text-rose-600 ring-1 ring-rose-500", avatar: "bg-rose-500" },
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

const SettingsDialogSidebarMenu = ({
  activeId,
  onChange,
}: {
  activeId: SettingsMenuId
  onChange: (id: SettingsMenuId) => void
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
      >
        <ChevronsUp className="size-4" />
        업그레이드
      </Button>
    </div>
  </>
)

export function SettingsDialog({ open, onOpenChange, initialMenu }: SettingsDialogProps) {
  const [activeMenu, setActiveMenu] = useState<SettingsMenuId>(
    () => readSettingsMenuFromStorage() ?? "profile"
  )
  const [billingEditOpen, setBillingEditOpen] = useState(false)
  const [billingForm, setBillingForm] = useState<BillingFormState>(INITIAL_BILLING_FORM)
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const [usagePage, setUsagePage] = useState(1)
  const wasOpenRef = useRef(false)
  const detailAddressRef = useRef<HTMLInputElement | null>(null)
  const userNameInputRef = useRef<HTMLInputElement | null>(null)
  const tenantNameInputRef = useRef<HTMLInputElement | null>(null)

  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null)
  const [currentTenant, setCurrentTenant] = useState<CurrentTenantProfile | null>(null)
  const [tenantMemberships, setTenantMemberships] = useState<TenantMembership[]>([])
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null)
  const [profileImageAssetId, setProfileImageAssetId] = useState<string | null>(null)
  const [profileImageLoading, setProfileImageLoading] = useState(false)
  const [profileImageError, setProfileImageError] = useState<string | null>(null)
  const [profileImageOversizeOpen, setProfileImageOversizeOpen] = useState(false)
  const profileImageInputRef = useRef<HTMLInputElement | null>(null)

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
    const menu =
      PERSONAL_MENUS.find((item) => item.id === activeMenu) ??
      BILLING_MENUS.find((item) => item.id === activeMenu)
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
    if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) return false
    if (!isPasswordValid) return false
    if (!isPasswordMatch) return false
    if (passwordForm.current === passwordForm.next) return false
    return true
  }, [isPasswordMatch, isPasswordValid, passwordForm, passwordSaving])

  const loadProfile = useCallback(async () => {
    const headers = authHeaders()
    if (!headers.Authorization) {
      setProfileError("로그인이 필요합니다.")
      return
    }

    setProfileLoading(true)
    setProfileError(null)
    try {
      const [userRes, tenantRes, membershipsRes] = await Promise.all([
        fetch("/api/posts/user/me", { headers }),
        fetch("/api/posts/tenant/current", { headers }),
        fetch("/api/posts/tenant/memberships", { headers }),
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
          setCurrentUser({
            id: String(userJson.id),
            email: String(userJson.email || ""),
            full_name: userJson.full_name ?? null,
            profile_image_asset_id: nextProfileAssetId,
            profile_image_url: nextProfileUrl,
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
    } catch (error) {
      console.error(error)
      setProfileError("사용자 정보를 불러오지 못했습니다.")
    } finally {
      setProfileLoading(false)
    }
  }, [authHeaders])

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

    if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) {
      setPasswordError("모든 비밀번호 항목을 입력해 주세요.")
      return
    }
    if (passwordForm.current === passwordForm.next) {
      setPasswordError("새 비밀번호는 현재 비밀번호와 달라야 합니다.")
      return
    }
    if (!isPasswordValid) {
      setPasswordError("새 비밀번호 조건을 충족해 주세요.")
      return
    }
    if (!isPasswordMatch) {
      setPasswordError("새 비밀번호가 일치하지 않습니다.")
      return
    }

    const headers = authHeaders()
    if (!headers.Authorization) {
      setPasswordError("로그인이 필요합니다.")
      return
    }

    setPasswordSaving(true)
    try {
      const res = await fetch(`${AUTH_API_BASE}/change-password`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.next,
          confirmPassword: passwordForm.confirm,
        }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => "")
        setPasswordError(msg || "비밀번호 변경에 실패했습니다.")
        return
      }
      setPasswordSuccess("비밀번호가 변경되었습니다.")
      setPasswordForm({ current: "", next: "", confirm: "" })
    } finally {
      setPasswordSaving(false)
    }
  }, [authHeaders, isPasswordMatch, isPasswordValid, passwordForm, passwordSaving])

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
    if (activeMenu !== "billing") setBillingEditOpen(false)
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
    if (activeMenu !== "profile") return
    if (isEditingUserName) userNameInputRef.current?.focus()
  }, [activeMenu, isEditingUserName, open])

  useEffect(() => {
    if (!open) return
    if (activeMenu !== "profile") return
    if (isEditingTenantName) tenantNameInputRef.current?.focus()
  }, [activeMenu, isEditingTenantName, open])

  const loadDaumPostcode = useCallback(() => {
    if (typeof window === "undefined") return Promise.reject(new Error("no-window"))
    if ((window as Window & { daum?: { Postcode?: unknown } }).daum?.Postcode) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(DAUM_POSTCODE_SCRIPT_ID) as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener("error", () => reject(new Error("postcode-load-failed")), { once: true })
        return
      }
      const script = document.createElement("script")
      script.id = DAUM_POSTCODE_SCRIPT_ID
      script.async = true
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("postcode-load-failed"))
      document.body.appendChild(script)
    })
  }, [])

  const handleSearchPostcode = useCallback(async () => {
    if (postcodeLoading) return
    setPostcodeLoading(true)
    try {
      await loadDaumPostcode()
      const PostcodeCtor = (window as Window & { daum?: { Postcode?: new (args: unknown) => { open: () => void } } }).daum
        ?.Postcode
      if (!PostcodeCtor) return
      new PostcodeCtor({
        oncomplete: (data: {
          zonecode?: string
          roadAddress?: string
          jibunAddress?: string
          userSelectedType?: "R" | "J"
          bname?: string
          buildingName?: string
          apartment?: "Y" | "N"
        }) => {
          const address =
            data.userSelectedType === "R" ? data.roadAddress || "" : data.jibunAddress || ""
          let extra = ""
          if (data.userSelectedType === "R") {
            if (data.bname && /[동|로|가]$/g.test(data.bname)) extra += data.bname
            if (data.buildingName && data.apartment === "Y") {
              extra += extra ? `, ${data.buildingName}` : data.buildingName
            }
            if (extra) extra = `(${extra})`
          }
          setBillingForm((prev) => ({
            ...prev,
            postalCode: data.zonecode || "",
            address1: address,
            extraAddress: extra,
          }))
          window.setTimeout(() => detailAddressRef.current?.focus(), 0)
        },
      }).open()
    } finally {
      setPostcodeLoading(false)
    }
  }, [loadDaumPostcode, postcodeLoading])

  useEffect(() => {
    if (usagePage > usageTotalPages) setUsagePage(usageTotalPages)
  }, [usagePage, usageTotalPages])

  useEffect(() => {
    writeSettingsDialogOpenFlag(open)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-48px)] overflow-hidden rounded-xl border border-border p-0 shadow-lg sm:max-w-[min(1000px,calc(100%-48px))]"
      >
        <div className="flex h-[700px] max-h-[calc(100vh-2rem)] w-full bg-background">
          <div className="hidden w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            <SettingsDialogSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {activeMenu === "billing" && billingEditOpen ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => setBillingEditOpen(false)}
                    aria-label="뒤로가기"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                ) : null}
                <Popover>
                  <PopoverTrigger
                    className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
                    aria-label="메뉴"
                  >
                    <Menu className="size-4" />
                  </PopoverTrigger>
                  <PopoverContent align="start" side="bottom" sideOffset={8} className="w-56 p-0">
                    <div className="flex flex-col rounded-lg border border-sidebar-border bg-sidebar">
                      <SettingsDialogSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
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
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">테넌트 정보</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      {tenantMemberships.length ? (
                        tenantMemberships.map((item) => {
                          const roleSlug = String(item.role_slug || "").toLowerCase()
                          const roleLabel = item.role_name || ROLE_LABELS[roleSlug] || "멤버"
                          const memberCount =
                            typeof item.member_count === "number" && Number.isFinite(item.member_count)
                              ? item.member_count
                              : null
                          const canManage = roleSlug === "owner" || roleSlug === "admin"
                          return (
                            <div key={item.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                {item.name || "-"} <span className="text-xs">({roleLabel})</span>
                              </div>
                              <div className="flex items-center gap-2 text-foreground">
                                멤버 {memberCount ?? "-"}명
                                {canManage ? (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Settings2 className="size-3 text-muted-foreground" />
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

                  <div className="p-4">
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
                  </div>

                </div>
              ) : null}

              {activeMenu === "password" ? (
                // 비밀번호 관리
                <div className="grid gap-3">

                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">비밀번호 변경</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
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
                      <div className="grid gap-1">
                        <Label className="text-xs">새 비밀번호</Label>
                        <Input
                          type="password"
                          value={passwordForm.next}
                          onChange={(e) => {
                            setPasswordForm((prev) => ({ ...prev, next: e.target.value }))
                            setPasswordError(null)
                            setPasswordSuccess(null)
                          }}
                          placeholder="새 비밀번호"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">새 비밀번호 확인</Label>
                        <Input
                          type="password"
                          value={passwordForm.confirm}
                          onChange={(e) => {
                            setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))
                            setPasswordError(null)
                            setPasswordSuccess(null)
                          }}
                          placeholder="새 비밀번호 확인"
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
                          {isPasswordMatch ? "새 비밀번호 일치" : "새 비밀번호 불일치"}
                        </div>
                      ) : null}
                    </div>
                    {passwordError ? (
                      <div className="mt-3 text-xs text-destructive">{passwordError}</div>
                    ) : null}
                    {passwordSuccess ? (
                      <div className="mt-3 text-xs text-emerald-500">{passwordSuccess}</div>
                    ) : null}
                    <button
                      className={cn(
                        "mt-4 rounded-md px-4 py-2 text-sm text-primary-foreground",
                        canSubmitPassword ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground"
                      )}
                      type="button"
                      disabled={!canSubmitPassword}
                      onClick={handleChangePassword}
                    >
                      {passwordSaving ? "변경 중..." : "비밀번호 변경"}
                    </button>
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
                          <div className="text-sm font-semibold text-foreground">AA 팀 서비스 크레딧</div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">50,000 크레딧</span>
                            <span className="rounded-full px-3 py-1 text-xs font-semibold bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500">Premium</span>
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                          <div className="h-full w-[50%] rounded-full bg-indigo-500" />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-1 justify-between">
                          <div>이번달 50% 사용 (<span className="text-indigo-500">10,000</span> / 20,000 크레딧)</div>
                          <div>다음 충전일: <span className="text-foreground">2026-03-01</span></div>
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
                          <div>이번달 0% 사용 (<span className="text-primary">0</span> / 42,000 크레딧)</div>
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
                          <div>이번달 10% 사용 (<span className="text-amber-500">9,000</span> / 10,000 크레딧)</div>
                          <div>다음 갱신일: <span className="text-foreground">2026-03-06</span></div>
                        </div>
                      </div>

                      <div className="px-4 py-6">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">충전 크레딧</div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">서비스 크레딧 소진시 자동 사용</span>
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                          <div className="h-full w-[100%] rounded-full bg-primary" />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-1 justify-between">
                          <div>이번달 0% 사용 (<span className="text-primary">0</span> / 5,000 크레딧)</div>
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
                          <div>이번달 20% 사용 (<span className="text-rose-500">4,000</span> / 5,000 크레딧)</div>
                          <div>다음 갱신일: <span className="text-foreground">2026-03-16</span></div>
                        </div>
                      </div>

                      <div className="px-4 py-6">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">충전 크레딧</div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">서비스 크레딧 소진시 자동 사용</span>
                          </div>
                        </div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted">
                          <div className="h-full w-[100%] rounded-full bg-primary" />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-1 justify-between">
                          <div>이번달 0% 사용 (<span className="text-primary">0</span> / 5,000 크레딧)</div>
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

              {activeMenu === "storage" ? (
                // 스토리지 사용량
                <div className="grid gap-3">

                  {/* 스토리지 */}
                  <div className="p-4">
                    <div className="rounded-xl border border-border p-4">
                      <div className="text-sm font-semibold text-foreground">스토리지 사용량</div>
                      <div className="mt-3 h-2 w-full rounded-full bg-muted">
                        <div className="h-full w-[33%] rounded-full bg-blue-500" />
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">33% 사용 (10GB / 30GB)</div>
                    </div>
                  </div>

                  {/* 스토리지 제공목록 */}
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
              ) : null}

              {activeMenu === "subscription" ? (
                // 구독 관리
                <div className="grid gap-4">
                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">현재 구독</div>
                    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                      <span>Premium · 연간</span>
                      <span className="text-foreground">$600 / 년</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">다음 결제일: 2026-07-29</div>
                  </div>
                  <Button variant="outline" className="w-fit">
                    요금제 변경
                  </Button>
                </div>
              ) : null}

              {activeMenu === "invoices" ? (
                // 청구서
                <div className="">
                  <Table className="">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-sm">청구서 번호</TableHead>
                        <TableHead className="text-sm">발행일</TableHead>                        
                        <TableHead className="text-sm">상태</TableHead>
                        <TableHead className="text-sm text-right">금액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ["INV-2026-0201", "2026-02-01", "결제됨", "$50.00"],
                        ["INV-2026-0101", "2026-01-01", "결제됨", "$50.00"],
                        ["INV-2025-1201", "2025-12-01", "결제됨", "$50.00"],
                      ].map((row) => (
                        <TableRow key={row[0]}>
                          <TableCell className="text-muted-foreground">{row[0]}</TableCell>
                          <TableCell className="text-muted-foreground">{row[1]}</TableCell>
                          <TableCell className="text-xs">
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30">
                              {row[2]}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-foreground">{row[3]}</TableCell>
                          
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {activeMenu === "billing" ? (
                // 청구 관리
                <div className="grid gap-3">
                  {!billingEditOpen ? (
                    <>
                      <div className="p-4">
                        <div className="text-sm font-semibold text-foreground border-b border-border pb-2">청구 정보</div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">이름(회사명)</div>
                          <div className="flex items-center gap-2 text-sm text-foreground">홍길동</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">이메일</div>
                          <div className="flex items-center gap-2 text-sm text-foreground">hong@example.com</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">청구주소</div>
                          <div className="flex items-center gap-2 text-sm text-foreground">서울시 강남구 테헤란로 123, 7층</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">전화번호</div>
                          <div className="flex items-center gap-2 text-sm text-foreground">82-10-1234-5678</div>
                        </div>
                      </div>
                      <Button variant="outline" className="w-fit" onClick={() => setBillingEditOpen(true)}>
                        청구 정보 업데이트
                      </Button>
                    </>
                  ) : (

                    <div className="p-4 flex flex-col gap-3">
                      <div className="text-sm font-semibold">청구 정보 수정</div>
                      <div className="mt-4 grid gap-4 text-sm">
                        <div className="grid gap-2">
                          <Label>이름(회사명)</Label>
                          <Input
                            value={billingForm.name}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="예: Reduct AI"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>이메일</Label>
                          <Input
                            type="email"
                            value={billingForm.email}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder="billing@reduct.ai"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>우편번호</Label>
                          <div className="flex items-center gap-2">
                            <Input value={billingForm.postalCode} readOnly placeholder="우편번호" />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={handleSearchPostcode}
                              disabled={postcodeLoading}
                            >
                              {postcodeLoading ? "검색 중..." : "주소 검색"}
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>주소</Label>
                          <Input value={billingForm.address1} readOnly placeholder="도로명/지번 주소" />
                        </div>
                        <div className="grid gap-2">
                          <Label>상세주소</Label>
                          <Input
                            ref={detailAddressRef}
                            value={billingForm.address2}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, address2: e.target.value }))}
                            placeholder="상세주소 입력"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>참고항목</Label>
                          <Input value={billingForm.extraAddress} readOnly placeholder="참고항목" />
                        </div>
                        <div className="grid gap-2">
                          <Label>전화번호</Label>
                          <Input value={billingForm.phone} onChange={(e) => setBillingForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="전화번호" />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" onClick={() => setBillingEditOpen(false)}>
                          취소
                        </Button>
                        <Button onClick={() => setBillingEditOpen(false)}>저장</Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {activeMenu === "payments" ? (
                // 결제 수단
                <div className="grid gap-4">
                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground">등록된 결제 수단</div>
                    <div className="mt-3 grid gap-3">
                      {/* Visa - 기본 */}
                      <div className="flex items-center gap-3 rounded-xl border border-border p-3 bg-card">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#1a1f71]">
                          <CardVisa className="h-6 w-9" />
                        </div>
                        <div className="flex flex-1 flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">Visa •••• 1234</span>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30">기본</span>
                          </div>
                          <span className="text-xs text-muted-foreground">만료 12/28</span>
                        </div>
                      </div>

                      {/* Mastercard - 보조 */}
                      <div className="flex items-center gap-3 rounded-xl border border-border p-3 bg-card">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#f5f5f5] dark:bg-neutral-800">
                          <CardMaster className="h-6 w-9" />
                        </div>
                        <div className="flex flex-1 flex-col min-w-0">
                          <span className="text-sm font-medium text-foreground">Mastercard •••• 5678</span>
                          <span className="text-xs text-muted-foreground">만료 08/27</span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0">
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem className="flex items-center gap-2 text-sm">
                              <Star className="size-4" />
                              기본 카드 설정
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2 text-sm text-destructive">
                              <Trash2 className="size-4" />
                              카드 삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* AMEX - 보조 */}
                      <div className="flex items-center gap-3 rounded-xl border border-border p-3 bg-card">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#006fcf]">
                          <CardAmex className="h-6 w-9" />
                        </div>
                        <div className="flex flex-1 flex-col min-w-0">
                          <span className="text-sm font-medium text-foreground">Amex •••• 9012</span>
                          <span className="text-xs text-muted-foreground">만료 03/26</span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0">
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem className="flex items-center gap-2 text-sm">
                              <Star className="size-4" />
                              기본 카드 설정
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2 text-sm text-destructive">
                              <Trash2 className="size-4" />
                              카드 삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" className="w-fit">
                    <Plus className="size-4 mr-2" />
                    결제 수단 추가
                  </Button>
                </div>
              ) : null}

              {activeMenu === "transactions" ? (
                // 결제 내역
                <div className="">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">날짜</TableHead>
                        <TableHead className="w-[160px]">플랜</TableHead>
                        <TableHead className="w-[140px]">결제 수단</TableHead>
                        <TableHead className="text-right">금액</TableHead>
                        <TableHead className="text-center">상태</TableHead>
                        <TableHead className="w-[70px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {([
                        { date: "2026-02-01", plan: "Premium 연간", card: "visa" as const, last4: "1234", amount: "$600.00", status: "결제됨" },
                        { date: "2025-02-01", plan: "Premium 연간", card: "visa" as const, last4: "1234", amount: "$600.00", status: "결제됨" },
                        { date: "2024-02-01", plan: "Premium 연간", card: "mastercard" as const, last4: "5678", amount: "$600.00", status: "결제됨" },
                        { date: "2023-02-01", plan: "Premium 연간", card: "amex" as const, last4: "9012", amount: "$600.00", status: "결제됨" },
                      ] as const).map((row) => {
                        const CardIcon = row.card === "visa" ? CardVisa : row.card === "mastercard" ? CardMaster : CardAmex
                        const cardLabel = row.card === "visa" ? "Visa" : row.card === "mastercard" ? "Mastercard" : "Amex"
                        return (
                          <TableRow key={`${row.date}-${row.plan}`}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{row.date}</TableCell>
                            <TableCell className="text-xs whitespace-normal break-words break-all">{row.plan}</TableCell>
                            <TableCell className="whitespace-normal break-words">
                              <div className="flex items-center gap-1">
                                <CardIcon className="h-5 w-7 shrink-0 rounded-sm" />
                                <span className="text-xs text-muted-foreground">{cardLabel} · {row.last4}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{row.amount}</TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30">
                                {row.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                영수증
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}


            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
