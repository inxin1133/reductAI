import {
  BadgeDollarSign,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Ellipsis,
  LogOut,
  Menu,
  MessageSquareMore,
  Monitor,
  Moon,
  PanelLeftClose,
  Pencil,
  PieChart,
  Plus,
  Save,
  Settings,
  Share2,
  Sun,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { handleSessionExpired, isSessionExpired, resetSessionExpiredGuard } from "@/lib/session"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "@/hooks/useTheme"
import { IconReduct } from "@/components/icons/IconReduct"
import { SettingsDialog, type SettingsMenuId } from "@/components/settings/SettingsDialog"
import { PlanDialog } from "@/components/settings/PlanDialog"
import { TenantSettingsDialog } from "@/components/settings/TenantSettingsDialog"
import EmojiPicker, { Theme } from "emoji-picker-react"
import type { EmojiClickData } from "emoji-picker-react"

type CategoryUpdatedDetail = {
  id: string
  name?: string
  icon?: string | null
  deleted?: boolean
}

function emitCategoryUpdated(detail: CategoryUpdatedDetail) {
  try {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("reductai:categoryUpdated", { detail }))
  } catch {
    // ignore
  }
}

type SidebarProps = {
  className?: string
}

type Language = {
  code: string
  name: string
  native_name: string
  is_default: boolean
  flag_emoji: string
  is_active?: boolean
}

type PlanTier = "free" | "pro" | "premium" | "business" | "enterprise"

const PLAN_TIER_ORDER: PlanTier[] = ["free", "pro", "premium", "business", "enterprise"]
const PLAN_TIER_AVATAR_BG: Record<PlanTier, string> = {
  free: "bg-muted-foreground",
  pro: "bg-teal-500",
  premium: "bg-indigo-500",
  business: "bg-amber-500",
  enterprise: "bg-rose-500",
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

export function Sidebar({ className }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const SIDEBAR_OPEN_KEY = "reductai:sidebar:isOpen"
  const PERSONAL_OPEN_KEY = "reductai:sidebar:isPersonalOpen"
  const TEAM_OPEN_KEY = "reductai:sidebar:isTeamOpen"
  const TENANT_INFO_CACHE_KEY = "reductai:sidebar:tenantInfo:v1"
  const getInitialIsOpen = () => {
    try {
      if (typeof window === "undefined") return true
      const v = window.localStorage.getItem(SIDEBAR_OPEN_KEY)
      if (v === "0") return false
      if (v === "1") return true
      return true
    } catch {
      return true
    }
  }
  const getInitialSectionOpen = (key: string, fallback: boolean) => {
    try {
      if (typeof window === "undefined") return fallback
      const v = window.localStorage.getItem(key)
      if (v === "0") return false
      if (v === "1") return true
      if (v === "false") return false
      if (v === "true") return true
      return fallback
    } catch {
      return fallback
    }
  }

  // Persist the user's desktop sidebar open/closed preference across route changes and resizes.
  const [isOpen, setIsOpen] = useState<boolean>(() => getInitialIsOpen())
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isPersonalOpen, setIsPersonalOpen] = useState(() => getInitialSectionOpen(PERSONAL_OPEN_KEY, true))
  const [isTeamOpen, setIsTeamOpen] = useState(() => getInitialSectionOpen(TEAM_OPEN_KEY, true))
  const [isHeaderHover, setIsHeaderHover] = useState(false)

  type IconChoice =
    | { kind: "emoji"; value: string }
    | { kind: "lucide"; value: string }

  const encodeIcon = (choice: IconChoice | null): string | null => {
    if (!choice) return null
    if (choice.kind === "emoji") return `emoji:${choice.value}`
    return `lucide:${choice.value}`
  }

  const decodeIcon = (raw: unknown): IconChoice | null => {
    if (raw == null) return null
    const s = typeof raw === "string" ? raw : ""
    if (!s) return null
    if (s.startsWith("emoji:")) return { kind: "emoji", value: s.slice("emoji:".length) }
    if (s.startsWith("lucide:")) return { kind: "lucide", value: s.slice("lucide:".length) }
    // Back-compat: if it's non-ascii-ish, assume emoji; otherwise assume lucide name.
    if (/[^\w]/.test(s)) return { kind: "emoji", value: s }
    return { kind: "lucide", value: s }
  }

  const LUCIDE_PRESETS = useMemo(
    () => [
      { key: "BookOpen", label: "BookOpen", Icon: BookOpen },
      { key: "Share2", label: "Share2", Icon: Share2 },
      { key: "Bot", label: "Bot", Icon: Bot },
      { key: "Save", label: "Save", Icon: Save },
      { key: "Clock", label: "Clock", Icon: Clock },
      { key: "Trash2", label: "Trash2", Icon: Trash2 },
      { key: "Settings", label: "Settings", Icon: Settings },
      { key: "User", label: "User", Icon: User },
      { key: "Wallet", label: "Wallet", Icon: Wallet },
      { key: "Sun", label: "Sun", Icon: Sun },
      { key: "Moon", label: "Moon", Icon: Moon },
    ],
    []
  )

  const LUCIDE_PRESET_MAP = useMemo(() => {
    return Object.fromEntries(LUCIDE_PRESETS.map((x) => [x.key, x.Icon])) as Record<string, React.ElementType>
  }, [LUCIDE_PRESETS])

  type PersonalCategory = { id: string; name: string; icon?: string | null; display_order?: number }
  const PERSONAL_CATS_CACHE_KEY = "reductai:sidebar:personalCategories:v1"
  const [personalCategories, setPersonalCategories] = useState<PersonalCategory[]>(() => {
    try {
      if (typeof window === "undefined") return []
      const raw = window.localStorage.getItem(PERSONAL_CATS_CACHE_KEY)
      const j = raw ? JSON.parse(raw) : null
      return Array.isArray(j) ? (j as PersonalCategory[]) : []
    } catch {
      return []
    }
  })
  const [personalCatsLoading, setPersonalCatsLoading] = useState(false)

  type TeamCategory = { id: string; name: string; icon?: string | null; display_order?: number }
  const TEAM_CATS_CACHE_KEY = "reductai:sidebar:teamCategories:v1"
  const [teamCategories, setTeamCategories] = useState<TeamCategory[]>(() => {
    try {
      if (typeof window === "undefined") return []
      const raw = window.localStorage.getItem(TEAM_CATS_CACHE_KEY)
      const j = raw ? JSON.parse(raw) : null
      return Array.isArray(j) ? (j as TeamCategory[]) : []
    } catch {
      return []
    }
  })
  const [teamCatsLoading, setTeamCatsLoading] = useState(false)
  const [tenantType, setTenantType] = useState<string>(() => {
    try {
      const raw = window.localStorage.getItem(TENANT_INFO_CACHE_KEY)
      const j = raw ? JSON.parse(raw) : null
      const type = typeof j?.tenant_type === "string" ? String(j.tenant_type) : ""
      return type
    } catch {
      return ""
    }
  }) // personal | team | group (or empty while loading)
  const [tenantId, setTenantId] = useState<string>(() => {
    try {
      const raw = window.localStorage.getItem(TENANT_INFO_CACHE_KEY)
      const j = raw ? JSON.parse(raw) : null
      const id = typeof j?.id === "string" ? String(j.id) : ""
      return id
    } catch {
      return ""
    }
  })
  const [tenantPlanTier, setTenantPlanTier] = useState<string>("")
  const [tenantName, setTenantName] = useState<string>(() => {
    try {
      const raw = window.localStorage.getItem(TENANT_INFO_CACHE_KEY)
      const j = raw ? JSON.parse(raw) : null
      const name = typeof j?.name === "string" ? String(j.name).trim() : ""
      return name
    } catch {
      return ""
    }
  })
  const [tenantMemberships, setTenantMemberships] = useState<
    Array<{
      id: string
      name?: string | null
      tenant_type?: string | null
      is_primary?: boolean
      role_slug?: string | null
      role_name?: string | null
      role_scope?: string | null
      plan_tier?: string | null
    }>
  >([])
  const PROFILE_IMAGE_CACHE_KEY = "reductai.user.profile_image_url.v1"
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = String(window.localStorage.getItem(PROFILE_IMAGE_CACHE_KEY) || "").trim()
      return raw ? raw : null
    } catch {
      return null
    }
  })
  const [languages, setLanguages] = useState<Language[]>([])
  const [currentLang, setCurrentLang] = useState("")
  const LANGUAGE_STORAGE_KEY = "reductai.language.v1"

  const tenantPageLabel = useMemo(() => {
    const name = String(tenantName || "").trim()
    if (name) return `${name} 페이지`
    if (tenantType === "group") return "그룹 페이지"
    return "팀 페이지"
  }, [tenantName, tenantType])

  const canManageTenant = useMemo(() => {
    if (tenantType === "personal") return false
    const targetId = tenantId || tenantMemberships.find((t) => t.is_primary)?.id || ""
    if (!targetId) return false
    const roleSlug = String(
      tenantMemberships.find((t) => String(t.id) === String(targetId))?.role_slug || ""
    ).toLowerCase()
    const elevated = new Set(["owner", "admin", "tenant_admin", "tenant_owner"])
    return elevated.has(roleSlug)
  }, [tenantId, tenantMemberships, tenantType])

  const resolveTenantLabel = (t: { name?: string | null; tenant_type?: string | null }) => {
    if (String(t.tenant_type || "") === "personal") return "개인"
    const name = String(t.name || "").trim()
    return name || "팀/그룹"
  }

  const resolveServiceLabel = (t: { tenant_type?: string | null }) => {
    const type = String(t.tenant_type || "")
    if (type === "personal") return "Pro"
    if (type === "team" || type === "group") return "Premium"
    return "Basic"
  }

  const profileBadges = useMemo(() => {
    if (tenantMemberships.length) {
      return tenantMemberships.map((t) => ({
        key: String(t.id),
        label: `${resolveTenantLabel(t)}:${resolveServiceLabel(t)}`,
      }))
    }
    if (!tenantType) return []
    return [
      {
        key: tenantType,
        label: `${resolveTenantLabel({ tenant_type: tenantType, name: tenantName })}:${resolveServiceLabel({
          tenant_type: tenantType,
        })}`,
      },
    ]
  }, [tenantMemberships, tenantName, tenantType])

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const res = await fetch("/api/i18n/languages")
        if (res.ok) {
          const data = await res.json()
          const activeLangs = (data || []).filter((l: Language) => l.is_active !== false)
          setLanguages(activeLangs)
          if (activeLangs.length > 0) {
            const saved = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").trim()
            const savedValid = saved && activeLangs.some((l: Language) => l.code === saved)
            const def = activeLangs.find((l: Language) => l.is_default)?.code || activeLangs[0].code
            const next = savedValid ? saved : def
            setCurrentLang(next)
            if (next) {
              localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
            }
          }
        }
      } catch {
        // ignore
      }
    }
    void fetchLanguages()
  }, [])

  useEffect(() => {
    const handleStorage = (ev: StorageEvent) => {
      if (ev.key !== LANGUAGE_STORAGE_KEY) return
      const next = String(ev.newValue || "").trim()
      if (!next) return
      setCurrentLang(next)
    }
    const handleCustom = (ev: Event) => {
      const next = (ev as CustomEvent<{ lang?: string }>).detail?.lang
      if (!next) return
      setCurrentLang(String(next))
    }
    window.addEventListener("storage", handleStorage)
    window.addEventListener("reductai:language", handleCustom as EventListener)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("reductai:language", handleCustom as EventListener)
    }
  }, [])

  const [editingCat, setEditingCat] = useState<{ type: "personal" | "team"; id: string; name: string } | null>(null)
  const [draggingCat, setDraggingCat] = useState<{ type: "personal" | "team"; id: string } | null>(null)
  const [categoryDropIndicator, setCategoryDropIndicator] = useState<{
    type: "personal" | "team"
    id: string
    position: "before" | "after"
  } | null>(null)
  const [catIconOpen, setCatIconOpen] = useState<{ type: "personal" | "team"; id: string } | null>(null)
  const [catIconTab, setCatIconTab] = useState<"emoji" | "icon">("emoji")
  const [catLucideQuery, setCatLucideQuery] = useState("")
  const [catLucideAll, setCatLucideAll] = useState<Record<string, React.ElementType> | null>(null)
  const [catLucideLoading, setCatLucideLoading] = useState(false)
  const catLucideLoadSeqRef = useRef(0)
  const [collapsedPersonalHoverOpen, setCollapsedPersonalHoverOpen] = useState(false)
  const [collapsedTeamHoverOpen, setCollapsedTeamHoverOpen] = useState(false)
  const editingInputRef = useRef<HTMLInputElement | null>(null)
  const renameFocusUntilRef = useRef<number>(0)
  const dragBlockClickUntilRef = useRef<number>(0)
  const startCategoryDrag = (
    type: "personal" | "team",
    id: string,
    e: React.DragEvent<HTMLElement>
  ) => {
    e.stopPropagation()
    dragBlockClickUntilRef.current = Date.now() + 250
    setDraggingCat({ type, id })
    setCategoryDropIndicator(null)
    try {
      e.dataTransfer.setData("text/plain", id)
      e.dataTransfer.effectAllowed = "move"
    } catch {
      // ignore
    }
  }
  const endCategoryDrag = () => {
    setDraggingCat(null)
    setCategoryDropIndicator(null)
  }

  // Keep Sidebar category lists in sync with PostEditorPage (and vice versa) without refresh.
  useEffect(() => {
    const onUpdated = (ev: Event) => {
      const ce = ev as CustomEvent<CategoryUpdatedDetail>
      const d = ce?.detail
      const id = d && typeof d.id === "string" ? d.id : ""
      if (!id) return

      const deleted = Boolean(d.deleted)
      const nextName = typeof d.name === "string" ? d.name : undefined
      const nextIcon = "icon" in (d || {}) ? (d.icon as string | null | undefined) : undefined

      setPersonalCategories((prev) => {
        let changed = false
        const next = deleted
          ? prev.filter((c) => {
            const keep = String(c.id) !== id
            if (!keep) changed = true
            return keep
          })
          : prev.map((c) => {
            if (String(c.id) !== id) return c
            const patched = {
              ...c,
              ...(nextName !== undefined ? { name: nextName } : null),
              ...(nextIcon !== undefined ? { icon: nextIcon } : null),
            }
            changed = true
            return patched
          })
        if (changed) {
          try {
            window.localStorage.setItem(PERSONAL_CATS_CACHE_KEY, JSON.stringify(next))
          } catch {
            // ignore
          }
          return next
        }
        return prev
      })

      setTeamCategories((prev) => {
        let changed = false
        const next = deleted
          ? prev.filter((c) => {
            const keep = String(c.id) !== id
            if (!keep) changed = true
            return keep
          })
          : prev.map((c) => {
            if (String(c.id) !== id) return c
            const patched = {
              ...c,
              ...(nextName !== undefined ? { name: nextName } : null),
              ...(nextIcon !== undefined ? { icon: nextIcon } : null),
            }
            changed = true
            return patched
          })
        if (changed) {
          try {
            window.localStorage.setItem(TEAM_CATS_CACHE_KEY, JSON.stringify(next))
          } catch {
            // ignore
          }
          return next
        }
        return prev
      })
    }

    window.addEventListener("reductai:categoryUpdated", onUpdated as EventListener)
    return () => window.removeEventListener("reductai:categoryUpdated", onUpdated as EventListener)
  }, [PERSONAL_CATS_CACHE_KEY, TEAM_CATS_CACHE_KEY])

  // Reset picker UI when closing / switching
  useEffect(() => {
    if (!catIconOpen) {
      setCatIconTab("emoji")
      setCatLucideQuery("")
      catLucideLoadSeqRef.current += 1
      setCatLucideLoading(false)
    }
  }, [catIconOpen])

  // Lazy-load full lucide map only when searching (category icon picker).
  useEffect(() => {
    if (!catIconOpen) return
    if (catIconTab !== "icon") return
    const q = catLucideQuery.trim()
    if (!q) return
    if (catLucideAll || catLucideLoading) return

    const seq = (catLucideLoadSeqRef.current += 1)
    setCatLucideLoading(true)
    void import("lucide-react")
      .then((mod) => {
        if (catLucideLoadSeqRef.current !== seq) return
        const iconsNs = (mod as unknown as Record<string, unknown>)["icons"]
        if (iconsNs && typeof iconsNs === "object") {
          setCatLucideAll(iconsNs as Record<string, React.ElementType>)
          return
        }
        const blacklist = new Set(["default", "createLucideIcon", "Icon", "LucideIcon", "LucideProps", "toKebabCase"])
        const map: Record<string, React.ElementType> = {}
        for (const k of Object.keys(mod)) {
          if (blacklist.has(k)) continue
          if (!/^[A-Z]/.test(k)) continue
          const v = (mod as unknown as Record<string, unknown>)[k]
          if (!v) continue
          const t = typeof v
          if (t !== "function" && t !== "object") continue
          map[k] = v as React.ElementType
        }
        setCatLucideAll(map)
      })
      .finally(() => {
        if (catLucideLoadSeqRef.current === seq) setCatLucideLoading(false)
      })
  }, [catIconOpen, catIconTab, catLucideAll, catLucideLoading, catLucideQuery])

  // If a category uses a non-preset lucide icon, load lucide map so we can render it in the list.
  useEffect(() => {
    if (catLucideAll || catLucideLoading) return
    const hasNonPresetLucide = [...personalCategories, ...teamCategories].some((c) => {
      const raw = typeof c.icon === "string" ? c.icon : ""
      if (!raw.startsWith("lucide:")) return false
      const name = raw.slice("lucide:".length)
      return !LUCIDE_PRESET_MAP[name]
    })
    if (!hasNonPresetLucide) return
    const seq = (catLucideLoadSeqRef.current += 1)
    setCatLucideLoading(true)
    void import("lucide-react")
      .then((mod) => {
        if (catLucideLoadSeqRef.current !== seq) return
        const iconsNs = (mod as unknown as Record<string, unknown>)["icons"]
        if (iconsNs && typeof iconsNs === "object") setCatLucideAll(iconsNs as Record<string, React.ElementType>)
      })
      .finally(() => {
        if (catLucideLoadSeqRef.current === seq) setCatLucideLoading(false)
      })
  }, [LUCIDE_PRESET_MAP, catLucideAll, catLucideLoading, personalCategories, teamCategories])

  const saveCategoryIcon = async (args: { type: "personal" | "team"; id: string; choice: IconChoice | null }) => {
    const h = authHeaders()
    if (!h.Authorization) return
    const nextIcon = encodeIcon(args.choice)
    emitCategoryUpdated({ id: String(args.id), icon: nextIcon })

    if (args.type === "personal") {
      setPersonalCategories((prev) => {
        const next = prev.map((c) => (c.id === args.id ? { ...c, icon: nextIcon } : c))
        try {
          window.localStorage.setItem(PERSONAL_CATS_CACHE_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
    } else {
      setTeamCategories((prev) => {
        const next = prev.map((c) => (c.id === args.id ? { ...c, icon: nextIcon } : c))
        try {
          window.localStorage.setItem(TEAM_CATS_CACHE_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
    }

    const r = await fetch(`/api/posts/categories/${encodeURIComponent(args.id)}`, {
      method: "PATCH",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ icon: nextIcon }),
    }).catch(() => null)
    if (!r || !r.ok) {
      const msg = r ? await r.text().catch(() => "") : ""
      alert(msg || "카테고리 아이콘 변경에 실패했습니다.")
    }
  }

  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [settingsDialogInitialMenu, setSettingsDialogInitialMenu] = useState<SettingsMenuId>("profile")
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false)
  const [isTenantSettingsDialogOpen, setIsTenantSettingsDialogOpen] = useState(false)

  const { theme, themeMode, setThemeMode } = useTheme()
  const userProfile = useMemo(() => {
    if (typeof window === "undefined") {
      return { name: "사용자", email: "", initial: "U" }
    }
    const rawName = String(localStorage.getItem("user_name") || "").trim()
    const rawEmail = String(localStorage.getItem("user_email") || "").trim()
    const nameFromEmail = rawEmail ? rawEmail.split("@")[0] : ""
    const name = rawName || nameFromEmail || "사용자"
    const initial = Array.from(name.trim() || "U")[0] || "U"
    return { name, email: rawEmail, initial }
  }, [])

  const tierCandidates = useMemo(() => {
    const tiers: PlanTier[] = []
    const currentTier = normalizePlanTier(tenantPlanTier)
    if (currentTier) tiers.push(currentTier)
    tenantMemberships.forEach((t) => {
      const tier = normalizePlanTier(t.plan_tier)
      if (tier) tiers.push(tier)
    })
    return tiers
  }, [tenantMemberships, tenantPlanTier])

  const highestTier = useMemo(() => pickHighestTier(tierCandidates), [tierCandidates])
  const avatarBgClass = PLAN_TIER_AVATAR_BG[highestTier]

  const profileImageSrc = useMemo(() => {
    if (!profileImageUrl) return null
    if (typeof window === "undefined") return profileImageUrl
    if (!profileImageUrl.startsWith("/api/ai/media/assets/")) return profileImageUrl
    const token = window.localStorage.getItem("token")
    if (!token) return profileImageUrl
    const sep = profileImageUrl.includes("?") ? "&" : "?"
    return `${profileImageUrl}${sep}token=${encodeURIComponent(token)}`
  }, [profileImageUrl])

  const ProfileAvatar = ({
    sizeClass,
    roundedClass,
    textClass,
    className,
    ...props
  }: {
    sizeClass: string
    roundedClass: string
    textClass: string
    className?: string
  } & React.ComponentProps<"div">) => (
    <div
      className={cn(
        sizeClass,
        roundedClass,
        "flex items-center justify-center shrink-0 overflow-hidden",
        avatarBgClass,
        className
      )}
      {...props}
    >
      {profileImageSrc ? (
        <img src={profileImageSrc} alt="프로필 이미지" className={cn(sizeClass, "object-cover")} />
      ) : (
        <span className={cn("text-white font-semibold", textClass)}>{userProfile.initial}</span>
      )}
    </div>
  )

  // 현재 페이지에 따라 GNB 메뉴 활성화 표시를 결정
  const isFrontAIActive = location.pathname.startsWith("/front-ai")
  const isTimelineActive = location.pathname.startsWith("/timeline")
  const isPostsActive = location.pathname.startsWith("/posts")
  const isTrashActive = location.pathname.startsWith("/trash")
  const isGeneratedFilesActive = location.pathname === "/files"
  const isPersonalFilesActive = location.pathname.startsWith("/files/personal")
  const isSharedFilesActive = location.pathname.startsWith("/files/shared")
  const activeCategoryId = (() => {
    try {
      const qs = new URLSearchParams(location.search || "")
      return String(qs.get("category") || "")
    } catch {
      return ""
    }
  })()

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        // If we resize back to desktop, close any mobile-only overlays/popovers.
        setIsMobileMenuOpen(false)
        setIsMobileProfileOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Persist on desktop only (mobile uses a separate drawer UI).
  useEffect(() => {
    if (typeof window === "undefined") return
    if (isMobile) return
    try {
      window.localStorage.setItem(SIDEBAR_OPEN_KEY, isOpen ? "1" : "0")
    } catch {
      // ignore (storage might be blocked)
    }
  }, [isMobile, isOpen])

  // Persist section open/closed preferences across route changes.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(PERSONAL_OPEN_KEY, isPersonalOpen ? "1" : "0")
      window.localStorage.setItem(TEAM_OPEN_KEY, isTeamOpen ? "1" : "0")
    } catch {
      // ignore
    }
  }, [isPersonalOpen, isTeamOpen])

  const handleLogout = () => {
    // 세션/토큰 정리
    localStorage.removeItem('token')
    localStorage.removeItem('token_expires_at')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_id')
    localStorage.removeItem('user_name')
    // 로그인 페이지(인트로)로 이동
    navigate('/')
  }

  const authHeaders = () => {
    const token = localStorage.getItem("token")
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  const loadPersonalCategories = async () => {
    const h = authHeaders()
    if (!h.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }
    setPersonalCatsLoading(true)
    try {
      const r = await fetch("/api/posts/categories/mine", { headers: h })
      if (!r.ok) {
        const msg = await r.text().catch(() => "")
        alert(msg || "카테고리 목록을 불러오지 못했습니다.")
        return
      }
      const j = await r.json().catch(() => [])
      const arr = Array.isArray(j) ? (j as PersonalCategory[]) : []
      setPersonalCategories(arr)
      try {
        window.localStorage.setItem(PERSONAL_CATS_CACHE_KEY, JSON.stringify(arr))
      } catch {
        // ignore
      }
    } finally {
      setPersonalCatsLoading(false)
    }
  }

  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [createCategoryType, setCreateCategoryType] = useState<"personal" | "team">("personal")
  const [createCategoryName, setCreateCategoryName] = useState("")
  const [createCategoryIconChoice, setCreateCategoryIconChoice] = useState<IconChoice | null>(null)
  const [createCategoryTab, setCreateCategoryTab] = useState<"emoji" | "icon">("emoji")
  const [createLucideQuery, setCreateLucideQuery] = useState("")
  const [createLucideAll, setCreateLucideAll] = useState<Record<string, React.ElementType> | null>(null)
  const [createLucideLoading, setCreateLucideLoading] = useState(false)
  const createLucideLoadSeqRef = useRef(0)
  const [createCategoryBusy, setCreateCategoryBusy] = useState(false)

  const openCreateCategoryDialog = (type: "personal" | "team") => {
    setCreateCategoryType(type)
    setCreateCategoryName("")
    setCreateCategoryIconChoice(null)
    setCreateCategoryTab("emoji")
    setCreateLucideQuery("")
    setCreateCategoryOpen(true)
  }

  // Lazy-load full lucide map only when searching in the "create category" dialog.
  useEffect(() => {
    if (!createCategoryOpen) return
    if (createCategoryTab !== "icon") return
    const q = createLucideQuery.trim().toLowerCase()
    if (!q) return
    if (createLucideAll || createLucideLoading) return

    const seq = (createLucideLoadSeqRef.current += 1)
    setCreateLucideLoading(true)
    void import("lucide-react")
      .then((mod) => {
        if (createLucideLoadSeqRef.current !== seq) return
        const iconsNs = (mod as unknown as Record<string, unknown>)["icons"]
        if (iconsNs && typeof iconsNs === "object") {
          setCreateLucideAll(iconsNs as Record<string, React.ElementType>)
          return
        }
        // Fallback: flatten exports
        const map: Record<string, React.ElementType> = {}
        for (const [k, v] of Object.entries(mod as unknown as Record<string, unknown>)) {
          if (typeof k === "string" && typeof v === "function") map[k] = v as React.ElementType
        }
        setCreateLucideAll(map)
      })
      .finally(() => {
        if (createLucideLoadSeqRef.current === seq) setCreateLucideLoading(false)
      })
  }, [createCategoryOpen, createCategoryTab, createLucideAll, createLucideLoading, createLucideQuery])

  useEffect(() => {
    if (createCategoryOpen) return
    setCreateLucideQuery("")
    createLucideLoadSeqRef.current += 1
    setCreateLucideLoading(false)
  }, [createCategoryOpen])

  const performCreateCategory = async (args: { type: "personal" | "team"; name: string; icon: IconChoice }) => {
    const h = authHeaders()
    if (!h.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }
    try {
      const nextName = String(args.name || "").trim()
      if (!nextName) return
      const nextIcon = encodeIcon(args.icon)
      const r = await fetch("/api/posts/categories", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          icon: nextIcon,
          ...(args.type === "team" ? { type: "team_page" } : null),
        }),
      })
      if (!r.ok) {
        const msg = await r.text().catch(() => "")
        alert(msg || "카테고리 생성에 실패했습니다.")
        return
      }
      const cat = (await r.json().catch(() => null)) as PersonalCategory | null
      if (!cat?.id) return
      // Insert at top (before the default "나의 페이지" entry)
      if (args.type === "personal") {
        setPersonalCategories((prev) => [cat, ...prev])
        if (!isPersonalOpen) setIsPersonalOpen(true)
      } else {
        setTeamCategories((prev) => [cat as unknown as TeamCategory, ...prev])
        if (!isTeamOpen) setIsTeamOpen(true)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!isOpen) return
    if (!isPersonalOpen) return
    void loadPersonalCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPersonalOpen])

  // Mobile: load categories when the mobile menu is opened (desktop effect above won't run when sidebar is collapsed).
  useEffect(() => {
    if (!isMobile) return
    if (!isMobileMenuOpen) return
    if (isPersonalOpen) void loadPersonalCategories()
    if (isTeamOpen && tenantType !== "personal") {
      void loadTenantName()
      void loadTeamCategories()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isMobileMenuOpen, isPersonalOpen, isTeamOpen, tenantType])

  const loadTenantName = async () => {
    const h = authHeaders()
    if (!h.Authorization) return
    const r = await fetch("/api/posts/tenant/current", { headers: h }).catch(() => null)
    if (!r || !r.ok) return
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const id = typeof j.id === "string" ? String(j.id) : ""
    const type = typeof j.tenant_type === "string" ? String(j.tenant_type) : ""
    const name = typeof j.name === "string" ? String(j.name).trim() : ""
    const planTier = typeof j.plan_tier === "string" ? String(j.plan_tier).trim() : ""
    if (id) setTenantId(id)
    if (type) setTenantType(type)
    if (name) setTenantName(name)
    if (planTier) setTenantPlanTier(planTier)
    if (id || type || name) {
      try {
        window.localStorage.setItem(
          TENANT_INFO_CACHE_KEY,
          JSON.stringify({ id: id || "", tenant_type: type || "", name: name || "" })
        )
      } catch {
        // ignore
      }
    }
  }

  // Ensure tenantType is available even when the sidebar is collapsed (isOpen=false),
  // so we can hide/show the team icon correctly.
  useEffect(() => {
    if (tenantType) return
    void loadTenantName()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadTenantMemberships = async () => {
    const h = authHeaders()
    if (!h.Authorization) return
    const r = await fetch("/api/posts/tenant/memberships", { headers: h }).catch(() => null)
    if (!r || !r.ok) return
    const rows = (await r.json().catch(() => [])) as Array<{
      id: string
      name?: string | null
      tenant_type?: string | null
      is_primary?: boolean
      plan_tier?: string | null
    }>
    if (Array.isArray(rows)) {
      setTenantMemberships(rows)
    }
  }

  const loadUserProfile = async () => {
    const h = authHeaders()
    if (!h.Authorization) return
    const r = await fetch("/api/posts/user/me", { headers: h }).catch(() => null)
    if (!r || !r.ok) return
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    const profileUrl =
      typeof j.profile_image_url === "string"
        ? String(j.profile_image_url)
        : typeof j.profile_image_asset_id === "string" && j.profile_image_asset_id
          ? `/api/ai/media/assets/${String(j.profile_image_asset_id)}`
          : ""
    setProfileImageUrl(profileUrl || null)
    try {
      if (profileUrl) {
        window.localStorage.setItem(PROFILE_IMAGE_CACHE_KEY, profileUrl)
      } else {
        window.localStorage.removeItem(PROFILE_IMAGE_CACHE_KEY)
      }
    } catch {
      // ignore storage issues
    }
  }

  useEffect(() => {
    void loadTenantMemberships()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadUserProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goToTopCategory = async (kind: "personal" | "team") => {
    const list = kind === "personal" ? personalCategories : teamCategories
    const fromState = list.length ? String(list[0]?.id || "") : ""
    if (fromState) {
      navigate(`/posts?category=${encodeURIComponent(fromState)}`)
      return
    }

    const h = authHeaders()
    if (!h.Authorization) return
    const url = kind === "personal" ? "/api/posts/categories/mine" : "/api/posts/categories/mine?type=team_page"
    const r = await fetch(url, { headers: h }).catch(() => null)
    if (!r || !r.ok) return
    const j = await r.json().catch(() => [])
    const arr = Array.isArray(j) ? (j as Array<{ id?: unknown }>) : []
    const firstId = arr.length ? String(arr[0]?.id || "") : ""
    if (!firstId) return
    navigate(`/posts?category=${encodeURIComponent(firstId)}`)
  }

  const loadTeamCategories = async () => {
    const h = authHeaders()
    if (!h.Authorization) return
    setTeamCatsLoading(true)
    try {
      const r = await fetch("/api/posts/categories/mine?type=team_page", { headers: h })
      if (!r.ok) return
      const j = await r.json().catch(() => [])
      const arr = Array.isArray(j) ? (j as TeamCategory[]) : []
      setTeamCategories(arr)
      try {
        window.localStorage.setItem(TEAM_CATS_CACHE_KEY, JSON.stringify(arr))
      } catch {
        // ignore
      }
    } finally {
      setTeamCatsLoading(false)
    }
  }

  const CreateCategoryDialog = (
    <Dialog
      open={createCategoryOpen}
      onOpenChange={(o) => {
        if (createCategoryBusy) return
        setCreateCategoryOpen(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            카테고리 추가{createCategoryType === "team" ? " (팀/그룹)" : " (개인)"}
          </DialogTitle>
          <DialogDescription>카테고리 이름과 아이콘/이모지를 설정한 뒤 추가할 수 있어요.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-md border border-border flex items-center justify-center bg-muted/40 shrink-0">
              {createCategoryIconChoice?.kind === "emoji" ? (
                <span className="text-[18px] leading-none">{createCategoryIconChoice.value}</span>
              ) : createCategoryIconChoice?.kind === "lucide" ? (
                (() => {
                  const IconCmp = LUCIDE_PRESET_MAP[createCategoryIconChoice.value] || Share2
                  return <IconCmp className="size-4" />
                })()
              ) : (
                <Plus className="size-4 text-muted-foreground" />
              )}
            </div>
            <Input
              autoFocus
              placeholder="카테고리 이름"
              value={createCategoryName}
              onChange={(e) => setCreateCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return
                e.preventDefault()
                const name = createCategoryName.trim()
                const icon = createCategoryIconChoice
                if (!name || !icon || createCategoryBusy) return
                setCreateCategoryBusy(true)
                void performCreateCategory({ type: createCategoryType, name, icon }).finally(() => {
                  setCreateCategoryBusy(false)
                  setCreateCategoryOpen(false)
                })
              }}
            />
          </div>

          <Tabs value={createCategoryTab} onValueChange={(v) => setCreateCategoryTab(v === "icon" ? "icon" : "emoji")}>
            <TabsList className="w-full">
              <TabsTrigger value="emoji" className="flex-1">
                이모지
              </TabsTrigger>
              <TabsTrigger value="icon" className="flex-1">
                아이콘
              </TabsTrigger>
            </TabsList>
            <TabsContent value="emoji" className="mt-3">
              <div className="rounded-md border border-border overflow-hidden">
                <EmojiPicker
                  theme={Theme.AUTO}
                  height={320}
                  width="100%"
                  onEmojiClick={(d: EmojiClickData) => {
                    const native = typeof d?.emoji === "string" ? d.emoji : ""
                    if (!native) return
                    setCreateCategoryIconChoice({ kind: "emoji", value: native })
                  }}
                />
              </div>
            </TabsContent>
            <TabsContent value="icon" className="mt-3">
              <div className="flex flex-col gap-2">
                <Input
                  value={createLucideQuery}
                  onChange={(e) => setCreateLucideQuery(e.target.value)}
                  placeholder="Lucide 아이콘 검색 (예: calendar, bot, file...)"
                  className="h-9 text-sm"
                />

                {(() => {
                  const q = createLucideQuery.trim().toLowerCase()
                  const presetMatches = !q
                    ? LUCIDE_PRESETS
                    : LUCIDE_PRESETS.filter((it) => it.key.toLowerCase().includes(q) || it.label.toLowerCase().includes(q))

                  const presetKeys = new Set(presetMatches.map((x) => x.key))
                  const extraMatches: Array<{ key: string; Icon: React.ElementType }> = []
                  if (q && createLucideAll) {
                    for (const [k, Icon] of Object.entries(createLucideAll)) {
                      if (extraMatches.length >= 98) break
                      if (presetKeys.has(k)) continue
                      if (!k.toLowerCase().includes(q)) continue
                      extraMatches.push({ key: k, Icon })
                    }
                  }

                  const showLoading = q && !presetMatches.length && createLucideLoading
                  const showHelp = q && (presetMatches.length + extraMatches.length) >= 98
                  const showEmpty = q && !presetMatches.length && !extraMatches.length && !createLucideLoading

                  return (
                    <div className="rounded-md border border-border p-2">
                      {showLoading ? <div className="text-xs text-muted-foreground">Searching…</div> : null}
                      {showEmpty ? <div className="text-xs text-muted-foreground">검색 결과가 없습니다.</div> : null}

                      <div className="max-h-[320px] overflow-auto pr-1">
                        <div className="grid grid-cols-7 gap-1">
                          {presetMatches.map((it) => {
                            const selected = createCategoryIconChoice?.kind === "lucide" && createCategoryIconChoice.value === it.key
                            return (
                              <button
                                key={it.key}
                                type="button"
                                className={cn(
                                  "h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center",
                                  selected ? "bg-accent" : ""
                                )}
                                onClick={() => setCreateCategoryIconChoice({ kind: "lucide", value: it.key })}
                                title={it.label}
                                aria-label={it.label}
                              >
                                <it.Icon className="size-4" />
                              </button>
                            )
                          })}
                          {extraMatches.map((it) => {
                            const selected = createCategoryIconChoice?.kind === "lucide" && createCategoryIconChoice.value === it.key
                            const Icon = it.Icon
                            return (
                              <button
                                key={it.key}
                                type="button"
                                className={cn(
                                  "h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center",
                                  selected ? "bg-accent" : ""
                                )}
                                onClick={() => setCreateCategoryIconChoice({ kind: "lucide", value: it.key })}
                                title={it.key}
                                aria-label={it.key}
                              >
                                <Icon className="size-4" />
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {showHelp ? (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          Showing up to 98 matches. Refine your search to narrow results.
                        </div>
                      ) : null}
                    </div>
                  )
                })()}
              </div>
            </TabsContent>
          </Tabs>

          {!createCategoryName.trim() || !createCategoryIconChoice ? (
            <div className="text-xs text-destructive">이름과 아이콘/이모지를 모두 선택해야 합니다.</div>
          ) : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-border hover:bg-accent text-sm"
            onClick={() => setCreateCategoryOpen(false)}
            disabled={createCategoryBusy}
          >
            취소
          </button>
          <button
            type="button"
            className={cn(
              "h-9 px-3 rounded-md text-sm",
              !createCategoryName.trim() || !createCategoryIconChoice || createCategoryBusy
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            disabled={!createCategoryName.trim() || !createCategoryIconChoice || createCategoryBusy}
            onClick={() => {
              const name = createCategoryName.trim()
              const icon = createCategoryIconChoice
              if (!name || !icon) return
              setCreateCategoryBusy(true)
              void performCreateCategory({ type: createCategoryType, name, icon }).finally(() => {
                setCreateCategoryBusy(false)
                setCreateCategoryOpen(false)
              })
            }}
          >
            추가
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  useEffect(() => {
    if (!isOpen) return
    if (!isTeamOpen) return
    void loadTenantName()
    void loadTeamCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isTeamOpen])

  const renameCategory = async (args: { type: "personal" | "team"; id: string; name: string }) => {
    const h = authHeaders()
    if (!h.Authorization) return
    const next = String(args.name || "").trim()
    if (!next) return
    const r = await fetch(`/api/posts/categories/${encodeURIComponent(args.id)}`, {
      method: "PATCH",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    }).catch(() => null)
    if (!r || !r.ok) {
      alert("카테고리 이름 변경에 실패했습니다.")
      return
    }
    if (args.type === "personal") setPersonalCategories((prev) => prev.map((c) => (c.id === args.id ? { ...c, name: next } : c)))
    else setTeamCategories((prev) => prev.map((c) => (c.id === args.id ? { ...c, name: next } : c)))
    emitCategoryUpdated({ id: String(args.id), name: next })
  }

  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{ type: "personal" | "team"; id: string; name: string } | null>(null)
  const [deleteCategoryBusy, setDeleteCategoryBusy] = useState(false)

  const performDeleteCategory = async (args: { type: "personal" | "team"; id: string }) => {
    const h = authHeaders()
    if (!h.Authorization) return
    const r = await fetch(`/api/posts/categories/${encodeURIComponent(args.id)}`, { method: "DELETE", headers: h }).catch(() => null)
    if (!r) {
      alert("카테고리 삭제에 실패했습니다.")
      return
    }
    if (!r.ok) {
      // If there are still pages inside this category, the server responds 400.
      if (r.status === 400) {
        alert("페이지가 남아 있어 카테고리를 삭제할 수 없습니다. 먼저 페이지를 지워주세요.")
        return
      }
      const msg = await r.text().catch(() => "")
      alert(msg || "카테고리 삭제에 실패했습니다.")
      return
    }
    const deletedId = String(args.id)
    const wasActive = isPostsActive && activeCategoryId === deletedId

    // Remove locally first
    let nextId = ""
    if (args.type === "personal") {
      const nextList = personalCategories.filter((c) => String(c.id) !== deletedId)
      setPersonalCategories(nextList)
      nextId = nextList.length ? String(nextList[0]?.id || "") : ""
    } else {
      const nextList = teamCategories.filter((c) => String(c.id) !== deletedId)
      setTeamCategories(nextList)
      nextId = nextList.length ? String(nextList[0]?.id || "") : ""
    }

    // Notify PostEditorPage (and others) so they don't keep rendering a deleted category.
    emitCategoryUpdated({ id: deletedId, deleted: true })

    // If the user is currently viewing the deleted category, auto-navigate to the top category.
    if (wasActive) {
      if (nextId) navigate(`/posts?category=${encodeURIComponent(nextId)}`, { replace: true })
      else navigate(`/posts/new/edit`, { replace: true })
    }
  }

  const CategoryDeleteDialog = (
    <AlertDialog open={Boolean(deleteCategoryTarget)} onOpenChange={(o) => !o && setDeleteCategoryTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>카테고리를 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            카테고리를 삭제하려면 카테고리 안의 페이지가 모두 삭제된 상태여야 합니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteCategoryBusy}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleteCategoryBusy}
            onClick={() => {
              const t = deleteCategoryTarget
              if (!t) return
              setDeleteCategoryBusy(true)
              void performDeleteCategory({ type: t.type, id: t.id }).finally(() => {
                setDeleteCategoryBusy(false)
                setDeleteCategoryTarget(null)
              })
            }}
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  const settingsDialog = (
    <SettingsDialog
      open={isSettingsDialogOpen}
      onOpenChange={setIsSettingsDialogOpen}
      initialMenu={settingsDialogInitialMenu}
    />
  )
  const planDialog = <PlanDialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen} />
  const tenantSettingsDialog = (
    <TenantSettingsDialog open={isTenantSettingsDialogOpen} onOpenChange={setIsTenantSettingsDialogOpen} />
  )

  const reorder = async (args: { type: "personal" | "team"; orderedIds: string[] }) => {
    const h = authHeaders()
    if (!h.Authorization) return
    const type = args.type === "team" ? "team_page" : "personal_page"
    await fetch("/api/posts/categories/reorder", {
      method: "POST",
      headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ type, orderedIds: args.orderedIds }),
    }).catch(() => null)
  }

  // 토큰이 없거나 만료된 경우 접근 차단
  useEffect(() => {
    if (isSessionExpired()) {
      handleSessionExpired(navigate)
      return
    }
    resetSessionExpiredGuard()
  }, [navigate])

  const openSettingsDialogAt = (menu: SettingsMenuId) => {
    setSettingsDialogInitialMenu(menu)
    setIsSettingsDialogOpen(true)
    setIsProfileOpen(false)
    setIsMobileProfileOpen(false)
  }

  const openSettingsDialog = () => {
    openSettingsDialogAt("profile")
  }

  const openPlanDialog = () => {
    setIsPlanDialogOpen(true)
    setIsProfileOpen(false)
    setIsMobileProfileOpen(false)
  }

  const openTenantSettingsDialog = () => {
    if (!canManageTenant) return
    setIsTenantSettingsDialogOpen(true)
    setIsProfileOpen(false)
    setIsMobileProfileOpen(false)
  }

  useEffect(() => {
    if (canManageTenant) return
    if (isTenantSettingsDialogOpen) setIsTenantSettingsDialogOpen(false)
  }, [canManageTenant, isTenantSettingsDialogOpen])

  // Profile Popover Content (Shared) - 프로필 팝오버 콘텐츠 (공유)
  const ProfilePopoverContent = () => (
    <PopoverContent
      className="w-64 p-1 mx-2 z-[100]"
      align="start"
      side="bottom"
      sideOffset={8}
    >
      {/* User Info Section - 유저 정보 섹션 */}
      <div className="flex flex-col gap-1 px-1 py-1">
        <div className="flex gap-2 items-center px-2 py-1.5 rounded-sm">
          <ProfileAvatar sizeClass="size-10" roundedClass="rounded-lg" textClass="text-lg" />
          <div className="flex flex-col flex-1 min-w-0">
            <p className="text-lg font-bold text-popover-foreground truncate">{userProfile.name}</p>
          </div>
        </div>
        <div className="flex gap-1 items-center px-2 py-1.5 rounded-sm">
          <User className="size-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground truncate">{userProfile.email || "-"}</p>
        </div>
        <div className="flex gap-1 items-center px-2 py-1.5 rounded-sm">
          <div className="flex gap-1 items-center flex-wrap">
            {profileBadges.length ? (
              profileBadges.map((b) => (
                <Badge key={b.key} variant="outline" className="h-[22px] px-2.5 py-0.5 text-xs font-medium">
                  {b.label}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="h-[22px] px-2.5 py-0.5 text-xs font-medium">
                개인:Basic
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Separator className="my-2" />

      {/* Settings Section - 설정 섹션 */}
      <div className="flex flex-col gap-0 px-1">
        <button
          type="button"
          className="flex w-full gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors text-left"
          onClick={openSettingsDialog}
        >
          <Settings className="size-4 text-popover-foreground shrink-0" />
          <p className="text-sm text-popover-foreground flex-1">개인 설정</p>
        </button>
        <button
          type="button"
          className="flex w-full gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors text-left"
          onClick={openPlanDialog}
        >
          <BadgeDollarSign className="size-4 text-popover-foreground shrink-0" />
          <p className="text-sm text-popover-foreground flex-1">요금제</p>
        </button>
        <button
          type="button"
          className="flex w-full gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors text-left"
          onClick={() => openSettingsDialogAt("subscription")}
        >
          <Wallet className="size-4 text-popover-foreground shrink-0" />
          <p className="text-sm text-popover-foreground flex-1">결제 관리</p>
        </button>
      </div>

      <Separator className="my-2" />

      {/* Theme & Language Section - 테마 및 언어 섹션 */}
      <div className="flex flex-col gap-0 px-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors">
              <div className="flex gap-1 items-center flex-1">
                {themeMode === "system" ? (
                  <Monitor className="size-4 text-popover-foreground shrink-0" />
                ) : theme === "dark" ? (
                  <Moon className="size-4 text-popover-foreground shrink-0" />
                ) : (
                  <Sun className="size-4 text-popover-foreground shrink-0" />
                )}
                <p className="text-sm text-popover-foreground">
                  {themeMode === "system" ? "System" : themeMode === "dark" ? "Dark" : "Light"}
                </p>
              </div>
              <ChevronRight className="size-4 text-popover-foreground shrink-0" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" sideOffset={9} className="w-36">
            <DropdownMenuItem onSelect={() => setThemeMode("light")}>
              <span className="flex-1">Light</span>
              {themeMode === "light" ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setThemeMode("dark")}>
              <span className="flex-1">Dark</span>
              {themeMode === "dark" ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setThemeMode("system")}>
              <span className="flex-1">System</span>
              {themeMode === "system" ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors">
              <div className="flex gap-1 items-center flex-1">
                <span className="text-sm">
                  {(() => {
                    const current = languages.find((l: Language) => l.code === currentLang)
                    return current?.flag_emoji || "🌐"
                  })()}
                </span>
                <p className="text-sm text-popover-foreground">
                  {(() => {
                    const current = languages.find((l: Language) => l.code === currentLang)
                    return current?.native_name || "언어 선택"
                  })()}
                </p>
              </div>
              <ChevronRight className="size-4 text-popover-foreground shrink-0" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" sideOffset={9} className="w-44">
            {languages.map((lang) => (
              <DropdownMenuItem
                key={lang.code}
                onSelect={() => {
                  setCurrentLang(lang.code)
                  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang.code)
                  window.dispatchEvent(new CustomEvent("reductai:language", { detail: { lang: lang.code } }))
                }}
              >
                <span className="flex-1">
                  {lang.flag_emoji} {lang.native_name}
                </span>
                {currentLang === lang.code ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator className="my-2" />

      {/* Logout Section - 로그아웃 섹션 */}
      <div className="flex flex-col gap-0 px-1 pb-1">
        <div
          className="flex gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors"
          onClick={handleLogout}
        >
          <LogOut className="size-4 text-popover-foreground shrink-0" />
          <p className="text-sm text-popover-foreground flex-1">Log out</p>
        </div>
      </div>
    </PopoverContent>
  )

  // 모바일 헤더 (축소 상태)
  if (isMobile && !isMobileMenuOpen) {
    return (
      <div className="md:hidden fixed top-0 left-0 right-0 h-[56px] bg-background border-b border-border flex items-center justify-between px-3 z-50">
        <div className="flex items-center gap-3">
          <div
            className="size-6 cursor-pointer flex items-center justify-center"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="size-6" />
          </div>
          <div className="flex items-center gap-2">
            <p className="font-black text-base text-foreground">reduct</p>
          </div>
        </div>

        {/* Mobile Profile Popover Trigger */}
        <Popover open={isMobileProfileOpen} onOpenChange={setIsMobileProfileOpen}>
          <PopoverTrigger asChild>
            <ProfileAvatar sizeClass="size-8" roundedClass="rounded-md" textClass="text-sm font-bold" className="cursor-pointer" />
          </PopoverTrigger>
          <ProfilePopoverContent />
        </Popover>
        {CategoryDeleteDialog}
        {CreateCategoryDialog}
        {settingsDialog}
        {planDialog}
        {tenantSettingsDialog}
      </div>
    )
  }

  // 모바일 메뉴 오버레이 (확장 상태)
  if (isMobile && isMobileMenuOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* 모바일 메뉴 헤더 */}
        <div className="h-[56px] flex items-center justify-between px-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="size-6 cursor-pointer flex items-center justify-center"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="size-6" />
            </div>
            <p className="font-black text-base text-foreground">menu</p>
          </div>

          {/* Mobile Menu Profile Popover Trigger */}
          <Popover open={isMobileProfileOpen} onOpenChange={setIsMobileProfileOpen}>
            <PopoverTrigger asChild>
              <ProfileAvatar sizeClass="size-8" roundedClass="rounded-md" textClass="text-sm font-bold" className="cursor-pointer" />
            </PopoverTrigger>
            <ProfilePopoverContent />
          </Popover>
        </div>

        {/* 모바일 메뉴 콘텐츠 (데스크탑과 동일한 구조지만 전체 너비) */}
        <div className="flex-1 overflow-y-auto p-2 bg-background">
          {/* 메인 메뉴 */}
          <div className="flex flex-col gap-1 mb-2">
            <div
              className={cn(
                "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                isFrontAIActive
                  ? "bg-neutral-200 text-accent-foreground font-medium border border-border/10 dark:bg-neutral-800"
                  : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
              )}
              onClick={() => {
                setIsMobileMenuOpen(false)
                navigate('/front-ai')
              }}
            >
              <div className="size-5 flex items-center justify-center"><Bot className="size-full" /></div>
              <span className="text-base text-foreground">프론트AI</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                isTimelineActive
                  ? "bg-neutral-200 text-accent-foreground font-medium border border-border/10 dark:bg-neutral-800"
                  : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
              )}
              onClick={() => {
                setIsMobileMenuOpen(false)
                navigate('/timeline')
              }}
            >
              <div className="size-5 flex items-center justify-center"><Clock className="size-full" /></div>
              <span className="text-base text-foreground">타임라인</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                isGeneratedFilesActive
                  ? "bg-neutral-200 text-accent-foreground font-medium border border-border/10 dark:bg-neutral-800"
                  : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
              )}
              onClick={() => {
                setIsMobileMenuOpen(false)
                navigate("/files")
              }}
            >
              <div className="size-5 flex items-center justify-center"><Save className="size-full" /></div>
              <span className="text-base text-foreground">생성 파일</span>
            </div>
          </div>

          {/* 개인 페이지 */}
          <div className="flex flex-col gap-1 mb-2">
            <div className="flex items-center justify-between px-2 h-8 opacity-70">
              <span
                className="text-sm text-foreground cursor-pointer select-none"
                onClick={() => setIsPersonalOpen(prev => !prev)}
              >
                개인 페이지
              </span>
              <button
                type="button"
                className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800"
                title="카테고리 추가"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  openCreateCategoryDialog("personal")
                }}
              >
                <Plus className="size-4" />
              </button>
            </div>
            {isPersonalOpen && (
              <>
                {personalCatsLoading ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">Loading…</div>
                ) : null}
                {personalCategories.map((c) => {
                  const isActive = isPostsActive && activeCategoryId === String(c.id)
                  const choice = decodeIcon(c.icon)
                  const DefaultIcon = BookOpen
                  const IconEl = (() => {
                    if (!choice) return <DefaultIcon className="size-5" />
                    if (choice.kind === "emoji") return <span className="text-[18px] leading-none">{choice.value}</span>
                    const Preset = LUCIDE_PRESET_MAP[choice.value]
                    const Dyn = Preset || catLucideAll?.[choice.value]
                    if (!Dyn) return <DefaultIcon className="size-5" />
                    return <Dyn className="size-5" />
                  })()
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                        isActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                      )}
                      onClick={() => {
                        setIsMobileMenuOpen(false)
                        navigate(`/posts?category=${encodeURIComponent(String(c.id))}`)
                      }}
                    >
                      <div className="size-5 flex items-center justify-center">{IconEl}</div>
                      <span className="text-base text-foreground truncate">{c.name || "New category"}</span>
                    </div>
                  )
                })}
                <div
                  className={cn(
                    "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                    isPersonalFilesActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  )}
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    navigate("/files/personal")
                  }}
                >
                  <Save className="size-5" />
                  <span className="text-base text-foreground">개인 파일</span>
                </div>
              </>
            )}
          </div>

          {/* 팀/그룹 페이지 */}
          {tenantType && tenantType !== "personal" ? (
            <div className="flex flex-col gap-1 mb-2">
              <div className="flex items-center justify-between px-2 h-8 opacity-70">
                <span
                  className="text-sm text-foreground cursor-pointer select-none"
                  onClick={() => setIsTeamOpen(prev => !prev)}
                >
                  {tenantPageLabel}
                </span>
                <div className="flex items-center gap-1">
                  {canManageTenant ? (
                    <button
                      type="button"
                      className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800"
                      title="테넌트 관리"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openTenantSettingsDialog()
                      }}
                    >
                      <Settings className="size-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800"
                    title="카테고리 추가"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openCreateCategoryDialog("team")
                    }}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
              {isTeamOpen && (
                <>
                  {teamCatsLoading ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground">Loading…</div>
                  ) : null}
                  {teamCategories.map((c) => {
                    const isActive = isPostsActive && activeCategoryId === String(c.id)
                    const choice = decodeIcon(c.icon)
                    const DefaultIcon = Share2
                    const IconEl = (() => {
                      if (!choice) return <DefaultIcon className="size-5" />
                      if (choice.kind === "emoji") return <span className="text-[18px] leading-none">{choice.value}</span>
                      const Preset = LUCIDE_PRESET_MAP[choice.value]
                      const Dyn = Preset || catLucideAll?.[choice.value]
                      if (!Dyn) return <DefaultIcon className="size-5" />
                      return <Dyn className="size-5" />
                    })()
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                          isActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                        )}
                        onClick={() => {
                          setIsMobileMenuOpen(false)
                          navigate(`/posts?category=${encodeURIComponent(String(c.id))}`)
                        }}
                      >
                        <div className="size-5 flex items-center justify-center">{IconEl}</div>
                        <span className="text-base text-foreground truncate">{c.name || "New category"}</span>
                      </div>
                    )
                  })}
                  <div
                    className={cn(
                      "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                      isSharedFilesActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                    )}
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      navigate("/files/shared")
                    }}
                  >
                    <Save className="size-5" />
                    <span className="text-base text-foreground">공유 파일</span>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* 관리 섹션 */}
          <div className="flex flex-col gap-1 mt-4">
            <div className="px-2 h-8 opacity-70 flex items-center"><span className="text-sm text-foreground">관리</span></div>
            <div
              className={cn(
                "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                isTrashActive
                  ? "bg-neutral-200 text-accent-foreground font-medium border border-border/10 dark:bg-neutral-800"
                  : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
              )}
              onClick={() => {
                setIsMobileMenuOpen(false)
                navigate("/trash")
              }}
            >
              <Trash2 className="size-5" />
              <span className="text-base text-foreground">휴지통</span>
            </div>
            <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800">
              <PieChart className="size-5" />
              <span className="text-base text-foreground">대시보드</span>
            </div>
            <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800">
              <MessageSquareMore className="size-5" />
              <span className="text-base text-foreground">문의</span>
            </div>
          </div>
        </div>
        {CategoryDeleteDialog}
        {CreateCategoryDialog}
        {settingsDialog}
        {planDialog}
        {tenantSettingsDialog}
      </div>
    )
  }

  // 데스크탑 뷰 (기존 구현)
  return (
    <div
      className={cn(
        "bg-sidebar border-r border-sidebar-border h-full flex flex-col shrink-0 transition-all duration-300 ease-in-out hidden md:flex",
        isOpen ? "w-[200px]" : "w-[50px]",
        className
      )}
    >
      {/* Header - 헤더 */}
      <div className="flex flex-col gap-2 p-2 pt-3.5">
        <div className={cn("flex items-center h-8 px-2", isOpen ? "justify-between" : "justify-center")}>
          {isOpen && <p className="font-black text-base leading-6 text-primary">reduct</p>}
          <div
            className={cn(
              "cursor-pointer relative flex items-center justify-center text-sidebar-foreground",
              isOpen ? "size-4" : "size-8" // open: 16px container, closed: 32px container
            )}
            onClick={() => setIsOpen(!isOpen)}
            onMouseEnter={() => setIsHeaderHover(true)}
            onMouseLeave={() => setIsHeaderHover(false)}
          >
            {isOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : isHeaderHover ? (
              <PanelLeftClose className="w-4 h-4 rotate-180 transition-transform" />
            ) : (
              <IconReduct className="w-8 h-8" />
            )}

          </div>
        </div>
      </div>

      {/* User Profile - 유저 프로필 */}
      <div className={cn("p-2", !isOpen && "flex justify-center")}>
        <Popover open={isProfileOpen} onOpenChange={setIsProfileOpen}>
          <PopoverTrigger asChild>
            <div className={cn("flex items-center gap-2 p-2 cursor-pointer hover:bg-accent/50 rounded-md transition-colors", !isOpen && "justify-center p-0")}>
              {isOpen ? (
                <>
                  <ProfileAvatar sizeClass="size-10" roundedClass="rounded-lg" textClass="text-lg" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <p className="text-sm text-left font-semibold text-sidebar-foreground truncate">{userProfile.name}</p>
                    <div className="flex items-center text-xs text-muted-foreground flex-wrap gap-1">
                      {profileBadges.length ? (
                        profileBadges.map((b) => <span key={b.key}>{b.label}</span>)
                      ) : (
                        <span>개인:Basic</span>
                      )}
                    </div>
                  </div>
                  <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                    <ChevronsUpDown className="size-full" />
                  </div>
                </>
              ) : (
                <ProfileAvatar sizeClass="size-8" roundedClass="rounded-md" textClass="text-base" />
              )}
            </div>
          </PopoverTrigger>
          <ProfilePopoverContent />
        </Popover>
      </div>

      {/* Menu Items - 메뉴 아이템 */}
      <div className="flex flex-col p-2 gap-1">
        <div
          className={cn(
            "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
            !isOpen && "justify-center",
            isFrontAIActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
          )}
          onClick={() => navigate('/front-ai')}
        >
          <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
            <Bot className="size-full" />
          </div>
          {isOpen && <span className="text-sm text-sidebar-foreground">프론트AI</span>}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
            !isOpen && "justify-center",
            isTimelineActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
          )}
          onClick={() => navigate('/timeline')}
        >
          <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
            <Clock className="size-full" />
          </div>
          {isOpen && <span className="text-sm text-sidebar-foreground">타임라인</span>}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
            !isOpen && "justify-center",
            isGeneratedFilesActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-accent/50"
          )}
          onClick={() => navigate("/files")}
        >
          <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
            <Save className="size-full" />
          </div>
          {isOpen && <span className="text-sm text-sidebar-foreground">생성 파일</span>}
        </div>
      </div>

      {isOpen ? (
        <>
          {/* Personal Pages - 개인 페이지 */}
          <div className="flex flex-col p-2 gap-1">
            <div className="flex items-center gap-2 px-2 h-8 opacity-70 cursor-pointer select-none group">
              <span className="flex-1 text-left text-xs text-sidebar-foreground" onClick={() => setIsPersonalOpen((prev) => !prev)}>개인 페이지</span>
              <div
                className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                role="button"
                title="카테고리 추가"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  openCreateCategoryDialog("personal")
                }}
              >
                <Plus className="size-full" />
              </div>
            </div>
            {isPersonalOpen && (
              <>
                <div
                  className="px-2 py-1 text-xs text-sidebar-foreground/60 h-6 hidden"
                  style={{ visibility: personalCatsLoading ? "visible" : "hidden" }}
                >
                  Loading…
                </div>

                {personalCategories.map((c) => {
                  const isActive = isPostsActive && activeCategoryId === String(c.id)
                  const isDropTarget =
                    !!categoryDropIndicator &&
                    categoryDropIndicator.type === "personal" &&
                    categoryDropIndicator.id === String(c.id)
                  const dropPosition = isDropTarget ? categoryDropIndicator!.position : null
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "group relative flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer cursor-grab active:cursor-grabbing",
                        isActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                      )}
                      draggable
                      onDragStart={(e) => startCategoryDrag("personal", c.id, e)}
                      onDragEnd={endCategoryDrag}
                      onClick={() => {
                        if (Date.now() < dragBlockClickUntilRef.current) return
                        if (editingCat && editingCat.type === "personal" && editingCat.id === c.id) return
                        navigate(`/posts?category=${encodeURIComponent(String(c.id))}`)
                      }}
                      onDragOver={(e) => {
                        if (!draggingCat || draggingCat.type !== "personal") return
                        e.preventDefault()
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const before = e.clientY < rect.top + rect.height / 2
                        setCategoryDropIndicator({
                          type: "personal",
                          id: String(c.id),
                          position: before ? "before" : "after",
                        })
                      }}
                      onDragLeave={(e) => {
                        // Clear indicator when leaving this row (helps avoid stale line).
                        const related = (e.relatedTarget as Node | null) || null
                        if (related && (e.currentTarget as HTMLElement).contains(related)) return
                        setCategoryDropIndicator((prev) => {
                          if (!prev) return null
                          if (prev.type !== "personal") return prev
                          if (prev.id !== String(c.id)) return prev
                          return null
                        })
                      }}
                      onDrop={(e) => {
                        if (!draggingCat || draggingCat.type !== "personal") return
                        e.preventDefault()
                        const fromId = draggingCat.id
                        const toId = c.id
                        if (!fromId || fromId === toId) return
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const before = e.clientY < rect.top + rect.height / 2
                        setPersonalCategories((prev) => {
                          const next = prev.slice()
                          const fromIdx = next.findIndex((x) => x.id === fromId)
                          if (fromIdx < 0) return prev
                          const [moved] = next.splice(fromIdx, 1)
                          const toIdx = next.findIndex((x) => x.id === toId)
                          if (toIdx < 0) return prev
                          const insertIdx = toIdx + (before ? 0 : 1)
                          next.splice(insertIdx, 0, moved)
                          void reorder({ type: "personal", orderedIds: next.map((x) => x.id) })
                          return next
                        })
                        setDraggingCat(null)
                        setCategoryDropIndicator(null)
                      }}
                    >
                      {isDropTarget ? (
                        <div
                          className={cn(
                            "pointer-events-none absolute left-6 right-2 h-0.5 rounded bg-primary/80",
                            dropPosition === "before" ? "top-0" : "bottom-0"
                          )}
                        />
                      ) : null}
                      {(() => {
                        const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
                        const open = !!catIconOpen && catIconOpen.type === "personal" && catIconOpen.id === String(c.id)
                        const choice = decodeIcon(c.icon)
                        const DefaultIcon = BookOpen
                        const IconEl = (() => {
                          if (!choice) return <DefaultIcon className="size-4" />
                          if (choice.kind === "emoji") return <span className="text-[16px] leading-none">{choice.value}</span>
                          const Preset = LUCIDE_PRESET_MAP[choice.value]
                          const Dyn = Preset || catLucideAll?.[choice.value]
                          if (!Dyn) return <DefaultIcon className="size-4" />
                          return <Dyn className="size-4" />
                        })()

                        return (
                          <Popover
                            open={open}
                            onOpenChange={(o) => setCatIconOpen(o ? { type: "personal", id: String(c.id) } : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="size-6 relative shrink-0 flex items-center justify-center text-sidebar-foreground hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-sm"
                                title="아이콘 변경"
                                draggable={false}
                                onDragStart={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {IconEl}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              sideOffset={6}
                              className="w-[370px] p-3"
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <Tabs value={catIconTab} onValueChange={(v) => setCatIconTab(v === "icon" ? "icon" : "emoji")}>
                                <TabsList>
                                  <TabsTrigger value="emoji">이모지</TabsTrigger>
                                  <TabsTrigger value="icon">아이콘</TabsTrigger>
                                </TabsList>
                                <TabsContent value="emoji">
                                  <div className="max-h-[360px] overflow-auto pr-1">
                                    <EmojiPicker
                                      theme={isDark ? Theme.DARK : Theme.LIGHT}
                                      previewConfig={{ showPreview: false }}
                                      onEmojiClick={(emoji: EmojiClickData) => {
                                        const native = emoji?.emoji ? String(emoji.emoji) : ""
                                        if (!native) return
                                        void saveCategoryIcon({ type: "personal", id: String(c.id), choice: { kind: "emoji", value: native } })
                                        setCatIconOpen(null)
                                      }}
                                    />
                                  </div>
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      className="text-xs px-2 py-1 rounded hover:bg-accent"
                                      onClick={() => {
                                        void saveCategoryIcon({ type: "personal", id: String(c.id), choice: null })
                                        setCatIconOpen(null)
                                      }}
                                    >
                                      Reset
                                    </button>
                                  </div>
                                </TabsContent>
                                <TabsContent value="icon">
                                  <div className="mb-2">
                                    <Input
                                      value={catLucideQuery}
                                      onChange={(e) => setCatLucideQuery(e.target.value)}
                                      placeholder="Search icons (e.g. calendar, bot, file...)"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  {catLucideQuery.trim() ? (
                                    <>
                                      {catLucideLoading && !catLucideAll ? (
                                        <div className="text-xs text-muted-foreground px-1 py-2">Loading icons…</div>
                                      ) : null}
                                      <div className="max-h-[300px] overflow-auto pr-1">
                                        <div className="grid grid-cols-7 gap-1">
                                          {(() => {
                                            const q = catLucideQuery.trim().toLowerCase()
                                            const map = catLucideAll || {}
                                            const keys = Object.keys(map)
                                              .filter((k) => k.toLowerCase().includes(q))
                                              .slice(0, 98)
                                            if (!catLucideLoading && catLucideAll && keys.length === 0) {
                                              return (
                                                <div className="col-span-7 text-xs text-muted-foreground px-1 py-2">
                                                  No matches. Try a different keyword.
                                                </div>
                                              )
                                            }
                                            return keys.map((k) => {
                                              const Cmp = map[k]
                                              return (
                                                <button
                                                  key={k}
                                                  type="button"
                                                  className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                                                  onClick={() => {
                                                    void saveCategoryIcon({
                                                      type: "personal",
                                                      id: String(c.id),
                                                      choice: { kind: "lucide", value: k },
                                                    })
                                                    setCatIconOpen(null)
                                                  }}
                                                  title={k}
                                                  aria-label={k}
                                                >
                                                  <Cmp className="size-4" />
                                                </button>
                                              )
                                            })
                                          })()}
                                        </div>
                                      </div>
                                      <div className="mt-2 text-[11px] text-muted-foreground">
                                        Showing up to 98 matches. Refine your search to narrow results.
                                      </div>
                                    </>
                                  ) : (
                                    <div className="grid grid-cols-7 gap-1">
                                      {LUCIDE_PRESETS.map((it) => (
                                        <button
                                          key={it.key}
                                          type="button"
                                          className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                                          onClick={() => {
                                            void saveCategoryIcon({
                                              type: "personal",
                                              id: String(c.id),
                                              choice: { kind: "lucide", value: it.key },
                                            })
                                            setCatIconOpen(null)
                                          }}
                                          title={it.label}
                                          aria-label={it.label}
                                        >
                                          <it.Icon className="size-4" />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      className="text-xs px-2 py-1 rounded hover:bg-accent"
                                      onClick={() => {
                                        void saveCategoryIcon({ type: "personal", id: String(c.id), choice: null })
                                        setCatIconOpen(null)
                                      }}
                                    >
                                      Reset
                                    </button>
                                  </div>
                                </TabsContent>
                              </Tabs>
                            </PopoverContent>
                          </Popover>
                        )
                      })()}

                      {editingCat && editingCat.type === "personal" && editingCat.id === c.id ? (
                        <input
                          autoFocus
                          ref={editingInputRef}
                          className="flex-1 min-w-0 text-sm bg-background outline-none rounded-sm px-2 py-1 border border-border"
                          value={editingCat.name}
                          onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              void renameCategory({ type: "personal", id: c.id, name: editingCat.name })
                              setEditingCat(null)
                            } else if (e.key === "Escape") {
                              e.preventDefault()
                              setEditingCat(null)
                            }
                          }}
                          onBlur={() => {
                            if (Date.now() < renameFocusUntilRef.current) return
                            void renameCategory({ type: "personal", id: c.id, name: editingCat.name })
                            setEditingCat(null)
                          }}
                        />
                      ) : (
                        <span
                          className="text-sm text-sidebar-foreground truncate flex-1 min-w-0"
                          draggable
                          onDragStart={(e) => startCategoryDrag("personal", c.id, e)}
                          onDragEnd={endCategoryDrag}
                        >
                          {c.name || "New category"}
                        </span>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="size-4 rounded-full flex items-center justify-center hover:bg-neutral-300 dark:hover:bg-neutral-700 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            title="메뉴"
                          >
                            <Ellipsis className="size-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-40"
                          onPointerDown={(e) => e.stopPropagation()}
                          onCloseAutoFocus={(e) => {
                            // Prevent Radix from restoring focus to the trigger button (it steals focus from our rename input).
                            e.preventDefault()
                          }}
                        >
                          <DropdownMenuItem asChild>
                            <button
                              type="button"
                              className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingCat({ type: "personal", id: c.id, name: c.name || "" })
                                renameFocusUntilRef.current = Date.now() + 250
                                window.setTimeout(() => {
                                  editingInputRef.current?.focus()
                                }, 0)
                              }}
                            >
                              <Pencil className="size-4 mr-2" />
                              이름 바꾸기
                            </button>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <button
                              type="button"
                              className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-accent focus:bg-accent"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteCategoryTarget({ type: "personal", id: String(c.id), name: String(c.name || "") })
                              }}
                            >
                              <Trash2 className="size-4 mr-2" />
                              삭제
                            </button>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
                <div
                  className={cn(
                    "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                    isPersonalFilesActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  )}
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    navigate("/files/personal")
                  }}
                >
                  <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                    <Save className="size-full" />
                  </div>
                  <span className="text-sm text-sidebar-foreground">개인 파일</span>
                </div>
              </>
            )}
          </div>

          {/* Team Pages - 팀 페이지 (Team + Enterprise; exclude Personal) */}
          {tenantType !== "personal" ? (
            <div className="flex flex-col p-2 gap-1">
              <div className="flex items-center gap-2 px-2 h-8 opacity-70 cursor-pointer select-none group">
                <span className="flex-1 text-left text-xs text-sidebar-foreground" onClick={() => setIsTeamOpen((prev) => !prev)}>
                  {tenantPageLabel}
                </span>
                {canManageTenant ? (
                  <div
                    className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                    role="button"
                    title="테넌트 관리"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openTenantSettingsDialog()
                    }}
                  >
                    <Settings className="size-full" />
                  </div>
                ) : null}
                <div
                  className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                  role="button"
                  title="카테고리 추가"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openCreateCategoryDialog("team")
                  }}
                >
                  <Plus className="size-full" />
                </div>
              </div>
              {isTeamOpen && (
                <>
                  <div
                    className="px-2 py-1 text-xs text-sidebar-foreground/60 h-6 hidden"
                    style={{ visibility: teamCatsLoading ? "visible" : "hidden" }}
                  >
                    Loading…
                  </div>

                  {teamCategories.map((c) => {
                    const isActive = isPostsActive && activeCategoryId === String(c.id)
                    const isDropTarget =
                      !!categoryDropIndicator &&
                      categoryDropIndicator.type === "team" &&
                      categoryDropIndicator.id === String(c.id)
                    const dropPosition = isDropTarget ? categoryDropIndicator!.position : null
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "group relative flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer cursor-grab active:cursor-grabbing",
                          isActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                        )}
                        draggable
                        onDragStart={(e) => startCategoryDrag("team", c.id, e)}
                        onDragEnd={endCategoryDrag}
                        onClick={() => {
                          if (Date.now() < dragBlockClickUntilRef.current) return
                          if (editingCat && editingCat.type === "team" && editingCat.id === c.id) return
                          navigate(`/posts?category=${encodeURIComponent(String(c.id))}`)
                        }}
                        onDragOver={(e) => {
                          if (!draggingCat || draggingCat.type !== "team") return
                          e.preventDefault()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          const before = e.clientY < rect.top + rect.height / 2
                          setCategoryDropIndicator({
                            type: "team",
                            id: String(c.id),
                            position: before ? "before" : "after",
                          })
                        }}
                        onDragLeave={(e) => {
                          const related = (e.relatedTarget as Node | null) || null
                          if (related && (e.currentTarget as HTMLElement).contains(related)) return
                          setCategoryDropIndicator((prev) => {
                            if (!prev) return null
                            if (prev.type !== "team") return prev
                            if (prev.id !== String(c.id)) return prev
                            return null
                          })
                        }}
                        onDrop={(e) => {
                          if (!draggingCat || draggingCat.type !== "team") return
                          e.preventDefault()
                          const fromId = draggingCat.id
                          const toId = c.id
                          if (!fromId || fromId === toId) return
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          const before = e.clientY < rect.top + rect.height / 2
                          setTeamCategories((prev) => {
                            const next = prev.slice()
                            const fromIdx = next.findIndex((x) => x.id === fromId)
                            if (fromIdx < 0) return prev
                            const [moved] = next.splice(fromIdx, 1)
                            const toIdx = next.findIndex((x) => x.id === toId)
                            if (toIdx < 0) return prev
                            const insertIdx = toIdx + (before ? 0 : 1)
                            next.splice(insertIdx, 0, moved)
                            void reorder({ type: "team", orderedIds: next.map((x) => x.id) })
                            return next
                          })
                          setDraggingCat(null)
                          setCategoryDropIndicator(null)
                        }}
                      >
                        {isDropTarget ? (
                          <div
                            className={cn(
                              "pointer-events-none absolute left-6 right-2 h-0.5 rounded bg-primary/80",
                              dropPosition === "before" ? "top-0" : "bottom-0"
                            )}
                          />
                        ) : null}
                        {(() => {
                          const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
                          const open = !!catIconOpen && catIconOpen.type === "team" && catIconOpen.id === String(c.id)
                          const choice = decodeIcon(c.icon)
                          const DefaultIcon = Share2
                          const IconEl = (() => {
                            if (!choice) return <DefaultIcon className="size-4" />
                            if (choice.kind === "emoji") return <span className="text-[16px] leading-none">{choice.value}</span>
                            const Preset = LUCIDE_PRESET_MAP[choice.value]
                            const Dyn = Preset || catLucideAll?.[choice.value]
                            if (!Dyn) return <DefaultIcon className="size-4" />
                            return <Dyn className="size-4" />
                          })()

                          return (
                            <Popover open={open} onOpenChange={(o) => setCatIconOpen(o ? { type: "team", id: String(c.id) } : null)}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="size-6 relative shrink-0 flex items-center justify-center text-sidebar-foreground hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded-sm"
                                  title="아이콘 변경"
                                  draggable={false}
                                  onDragStart={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                  }}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {IconEl}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                sideOffset={6}
                                className="w-[370px] p-3"
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <Tabs value={catIconTab} onValueChange={(v) => setCatIconTab(v === "icon" ? "icon" : "emoji")}>
                                  <TabsList>
                                    <TabsTrigger value="emoji">이모지</TabsTrigger>
                                    <TabsTrigger value="icon">아이콘</TabsTrigger>
                                  </TabsList>
                                  <TabsContent value="emoji">
                                    <div className="max-h-[360px] overflow-auto pr-1">
                                      <EmojiPicker
                                        theme={isDark ? Theme.DARK : Theme.LIGHT}
                                        previewConfig={{ showPreview: false }}
                                        onEmojiClick={(emoji: EmojiClickData) => {
                                          const native = emoji?.emoji ? String(emoji.emoji) : ""
                                          if (!native) return
                                          void saveCategoryIcon({ type: "team", id: String(c.id), choice: { kind: "emoji", value: native } })
                                          setCatIconOpen(null)
                                        }}
                                      />
                                    </div>
                                    <div className="mt-2 flex justify-end">
                                      <button
                                        type="button"
                                        className="text-xs px-2 py-1 rounded hover:bg-accent"
                                        onClick={() => {
                                          void saveCategoryIcon({ type: "team", id: String(c.id), choice: null })
                                          setCatIconOpen(null)
                                        }}
                                      >
                                        Reset
                                      </button>
                                    </div>
                                  </TabsContent>
                                  <TabsContent value="icon">
                                    <div className="mb-2">
                                      <Input
                                        value={catLucideQuery}
                                        onChange={(e) => setCatLucideQuery(e.target.value)}
                                        placeholder="Search icons (e.g. calendar, bot, file...)"
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                    {catLucideQuery.trim() ? (
                                      <>
                                        {catLucideLoading && !catLucideAll ? (
                                          <div className="text-xs text-muted-foreground px-1 py-2">Loading icons…</div>
                                        ) : null}
                                        <div className="max-h-[300px] overflow-auto pr-1">
                                          <div className="grid grid-cols-7 gap-1">
                                            {(() => {
                                              const q = catLucideQuery.trim().toLowerCase()
                                              const map = catLucideAll || {}
                                              const keys = Object.keys(map)
                                                .filter((k) => k.toLowerCase().includes(q))
                                                .slice(0, 98)
                                              if (!catLucideLoading && catLucideAll && keys.length === 0) {
                                                return (
                                                  <div className="col-span-7 text-xs text-muted-foreground px-1 py-2">
                                                    No matches. Try a different keyword.
                                                  </div>
                                                )
                                              }
                                              return keys.map((k) => {
                                                const Cmp = map[k]
                                                return (
                                                  <button
                                                    key={k}
                                                    type="button"
                                                    className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                                                    onClick={() => {
                                                      void saveCategoryIcon({
                                                        type: "team",
                                                        id: String(c.id),
                                                        choice: { kind: "lucide", value: k },
                                                      })
                                                      setCatIconOpen(null)
                                                    }}
                                                    title={k}
                                                    aria-label={k}
                                                  >
                                                    <Cmp className="size-4" />
                                                  </button>
                                                )
                                              })
                                            })()}
                                          </div>
                                        </div>
                                        <div className="mt-2 text-[11px] text-muted-foreground">
                                          Showing up to 98 matches. Refine your search to narrow results.
                                        </div>
                                      </>
                                    ) : (
                                      <div className="grid grid-cols-7 gap-1">
                                        {LUCIDE_PRESETS.map((it) => (
                                          <button
                                            key={it.key}
                                            type="button"
                                            className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                                            onClick={() => {
                                              void saveCategoryIcon({
                                                type: "team",
                                                id: String(c.id),
                                                choice: { kind: "lucide", value: it.key },
                                              })
                                              setCatIconOpen(null)
                                            }}
                                            title={it.label}
                                            aria-label={it.label}
                                          >
                                            <it.Icon className="size-4" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="mt-2 flex justify-end">
                                      <button
                                        type="button"
                                        className="text-xs px-2 py-1 rounded hover:bg-accent"
                                        onClick={() => {
                                          void saveCategoryIcon({ type: "team", id: String(c.id), choice: null })
                                          setCatIconOpen(null)
                                        }}
                                      >
                                        Reset
                                      </button>
                                    </div>
                                  </TabsContent>
                                </Tabs>
                              </PopoverContent>
                            </Popover>
                          )
                        })()}

                        {editingCat && editingCat.type === "team" && editingCat.id === c.id ? (
                          <input
                            autoFocus
                            ref={editingInputRef}
                            className="flex-1 min-w-0 text-sm bg-background outline-none rounded-sm px-2 py-1 border border-border"
                            value={editingCat.name}
                            onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                void renameCategory({ type: "team", id: c.id, name: editingCat.name })
                                setEditingCat(null)
                              } else if (e.key === "Escape") {
                                e.preventDefault()
                                setEditingCat(null)
                              }
                            }}
                            onBlur={() => {
                              if (Date.now() < renameFocusUntilRef.current) return
                              void renameCategory({ type: "team", id: c.id, name: editingCat.name })
                              setEditingCat(null)
                            }}
                          />
                        ) : (
                          <span
                            className="text-sm text-sidebar-foreground truncate flex-1 min-w-0"
                            draggable
                            onDragStart={(e) => startCategoryDrag("team", c.id, e)}
                            onDragEnd={endCategoryDrag}
                          >
                            {c.name || "New category"}
                          </span>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="size-4 rounded-full flex items-center justify-center hover:bg-neutral-300 dark:hover:bg-neutral-700 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              title="메뉴"
                            >
                              <Ellipsis className="size-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-40"
                            onPointerDown={(e) => e.stopPropagation()}
                            onCloseAutoFocus={(e) => {
                              // Prevent Radix from restoring focus to the trigger button (it steals focus from our rename input).
                              e.preventDefault()
                            }}
                          >
                            <DropdownMenuItem asChild>
                              <button
                                type="button"
                                className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingCat({ type: "team", id: c.id, name: c.name || "" })
                                  renameFocusUntilRef.current = Date.now() + 250
                                  window.setTimeout(() => {
                                    editingInputRef.current?.focus()
                                  }, 0)
                                }}
                              >
                                <Pencil className="size-4 mr-2" />
                                이름 바꾸기
                              </button>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <button
                                type="button"
                                className="flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-accent focus:bg-accent"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteCategoryTarget({ type: "team", id: String(c.id), name: String(c.name || "") })
                                }}
                              >
                                <Trash2 className="size-4 mr-2" />
                                삭제
                              </button>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )
                  })}

                  <div
                    className={cn(
                      "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
                      isSharedFilesActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                    )}
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      navigate("/files/shared")
                    }}
                  >
                    <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                      <Save className="size-full" />
                    </div>
                    <span className="text-sm text-sidebar-foreground">공유 파일</span>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </>
      ) : (
        // Collapsed Menu Icons for Pages
        <div className="flex flex-col p-2 gap-1">
          <HoverCard
            openDelay={0}
            closeDelay={120}
            open={collapsedPersonalHoverOpen}
            onOpenChange={(open) => {
              setCollapsedPersonalHoverOpen(open)
              if (open && personalCategories.length === 0) void loadPersonalCategories()
            }}
          >
            <HoverCardTrigger asChild>
              <div
                className={cn(
                  "flex items-center justify-center h-8 rounded-md cursor-pointer",
                  // active when current category belongs to personal categories
                  isPostsActive && activeCategoryId && personalCategories.some((c) => String(c.id) === String(activeCategoryId))
                    ? "bg-neutral-200 dark:bg-neutral-800"
                    : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                )}
                title="개인 페이지"
                onClick={() => {
                  void goToTopCategory("personal")
                }}
              >
                <BookOpen className="size-4 text-sidebar-foreground" />
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-[280px] p-2">
              <div className="flex items-center justify-between px-1 pb-2 group">
                <div className="text-sm font-semibold">개인 페이지</div>
                <button
                  type="button"
                  className="size-8 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                  title="카테고리 추가"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openCreateCategoryDialog("personal")
                  }}
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <Separator />
              <ScrollArea className="h-[360px]">
                <div className="pt-2">
                  {personalCategories.length === 0 ? (
                    <div className="text-sm text-muted-foreground px-2 py-2">
                      {personalCatsLoading ? "Loading…" : "아직 카테고리가 없습니다."}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {personalCategories.map((c) => {
                        const isActive =
                          isPostsActive && activeCategoryId && String(activeCategoryId) === String(c.id)
                        const choice = decodeIcon(c.icon)
                        const DefaultIcon = BookOpen
                        const IconEl = (() => {
                          if (!choice) return <DefaultIcon className="size-4" />
                          if (choice.kind === "emoji") return <span className="text-[16px] leading-none">{choice.value}</span>
                          const Preset = LUCIDE_PRESET_MAP[choice.value]
                          const Dyn = Preset || catLucideAll?.[choice.value]
                          if (!Dyn) return <DefaultIcon className="size-4" />
                          return <Dyn className="size-4" />
                        })()
                        return (
                          <div
                            key={c.id}
                            className={cn(
                              "flex items-center gap-2 px-2 h-8 rounded-md cursor-pointer",
                              isActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                            )}
                            onClick={() => {
                              setCollapsedPersonalHoverOpen(false)
                              navigate(`/posts?category=${encodeURIComponent(String(c.id))}`)
                            }}
                          >
                            <div className="size-6 shrink-0 flex items-center justify-center text-sidebar-foreground">
                              {IconEl}
                            </div>
                            <span className="text-sm text-sidebar-foreground truncate">{c.name || "New category"}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </HoverCardContent>
          </HoverCard>

          {tenantType && tenantType !== "personal" ? (
            <HoverCard
              openDelay={0}
              closeDelay={120}
              open={collapsedTeamHoverOpen}
              onOpenChange={(open) => {
                setCollapsedTeamHoverOpen(open)
                if (open && teamCategories.length === 0) void loadTeamCategories()
              }}
            >
              <HoverCardTrigger asChild>
                <div
                  className={cn(
                    "flex items-center justify-center h-8 rounded-md cursor-pointer",
                    // active when current category belongs to team categories
                    isPostsActive && activeCategoryId && teamCategories.some((c) => String(c.id) === String(activeCategoryId))
                      ? "bg-neutral-200 dark:bg-neutral-800"
                      : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  )}
                  title={tenantPageLabel}
                  onClick={() => {
                    void goToTopCategory("team")
                  }}
                >
                  <Share2 className="size-4 text-sidebar-foreground" />
                </div>
              </HoverCardTrigger>
              <HoverCardContent side="right" align="start" className="w-[280px] p-2">
                <div className="flex items-center justify-between px-1 pb-2">
                  <div className="text-sm font-semibold">{tenantPageLabel}</div>
                  <div className="flex items-center gap-1">
                    {canManageTenant ? (
                      <button
                        type="button"
                        className="size-8 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center"
                        title="테넌트 관리"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          openTenantSettingsDialog()
                        }}
                      >
                        <Settings className="size-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="size-8 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center"
                      title="카테고리 추가"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        // Shared categories are allowed for team + group (exclude personal).
                        if (tenantType === "personal") return
                        openCreateCategoryDialog("team")
                      }}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
                <Separator />
                <ScrollArea className="h-[360px]">
                  <div className="pt-2">
                    {teamCategories.length === 0 ? (
                      <div className="text-sm text-muted-foreground px-2 py-2">
                        {teamCatsLoading ? "Loading…" : "아직 카테고리가 없습니다."}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {teamCategories.map((c) => {
                          const isActive =
                            isPostsActive && activeCategoryId && String(activeCategoryId) === String(c.id)
                          const choice = decodeIcon(c.icon)
                          const DefaultIcon = Share2
                          const IconEl = (() => {
                            if (!choice) return <DefaultIcon className="size-4" />
                            if (choice.kind === "emoji") return <span className="text-[16px] leading-none">{choice.value}</span>
                            const Preset = LUCIDE_PRESET_MAP[choice.value]
                            const Dyn = Preset || catLucideAll?.[choice.value]
                            if (!Dyn) return <DefaultIcon className="size-4" />
                            return <Dyn className="size-4" />
                          })()
                          return (
                            <div
                              key={c.id}
                              className={cn(
                                "flex items-center gap-2 px-2 h-8 rounded-md cursor-pointer",
                                isActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                              )}
                              onClick={() => {
                                setCollapsedTeamHoverOpen(false)
                                navigate(`/posts?category=${encodeURIComponent(String(c.id))}`)
                              }}
                            >
                              <div className="size-6 shrink-0 flex items-center justify-center text-sidebar-foreground">
                                {IconEl}
                              </div>
                              <span className="text-sm text-sidebar-foreground truncate">{c.name || "New category"}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </HoverCardContent>
            </HoverCard>
          ) : null}
        </div>
      )}

      {/* Management - 관리 */}
      <div className="flex flex-col p-2 gap-1 mt-auto">
        {isOpen && (
          <div className="flex items-center gap-2 px-2 h-8 opacity-70">
            <span className="text-xs text-sidebar-foreground">관리</span>
          </div>
        )}
        <div
          className={cn(
            "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
            !isOpen && "justify-center",
            isTrashActive ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
          )}
          onClick={() => navigate("/trash")}
        >
          <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
            <Trash2 className="size-full" />
          </div>
          {isOpen && <span className="text-sm text-sidebar-foreground">휴지통</span>}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800",
            !isOpen && "justify-center"
          )}
        >
          <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
            <PieChart className="size-full" />
          </div>
          {isOpen && <span className="text-sm text-sidebar-foreground">대시보드</span>}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800",
            !isOpen && "justify-center"
          )}
        >
          <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
            <MessageSquareMore className="size-full" />
          </div>
          {isOpen && <span className="text-sm text-sidebar-foreground">문의</span>}
        </div>
      </div>
      {CategoryDeleteDialog}
      {CreateCategoryDialog}
      {settingsDialog}
      {planDialog}
      {tenantSettingsDialog}
    </div>
  )
}
