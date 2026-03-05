import {
  Mail,
  BookOpen,
  Bot,
  Clock,
  Ellipsis,
  Menu,
  MessageSquareMore,
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
import { type PlanTier, PLAN_TIER_LABELS, PLAN_TIER_ORDER, PLAN_TIER_STYLES } from "@/lib/planTier"
import { getActiveTenantId, setActiveTenantId, withActiveTenantHeader } from "@/lib/tenantContext"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { SidebarProfileBlock } from "@/components/sidebar/SidebarProfileBlock"
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
import { Button } from "@/components/ui/button"
import { useTheme } from "@/hooks/useTheme"
import { IconReduct } from "@/components/icons/IconReduct"
import { LogoGoogle } from "@/components/icons/LogoGoogle"
import { LogoKakao } from "@/components/icons/LogoKakao"
import { LogoNaver } from "@/components/icons/LogoNaver"
import { SettingsDialog, type SettingsMenuId } from "@/components/dialog/SettingsDialog"
import { BillingSettingsDialog } from "@/components/dialog/BillingSettingsDialog"
import { PlanDialog } from "@/components/dialog/PlanDialog"
import { TenantSettingsDialog } from "@/components/dialog/TenantSettingsDialog"
import { ContactDialog } from "@/components/dialog/ContactDialog"
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

type TenantInvitationRow = {
  id: string
  tenant_id: string
  tenant_name?: string | null
  tenant_type?: string | null
  inviter_name?: string | null
  inviter_email?: string | null
  membership_role?: string | null
  expires_at?: string | null
}

const INVITATION_ROLE_LABELS: Record<string, string> = {
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

function formatDateShort(value?: string | null) {
  if (!value) return "-"
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return "-"
  }
}

export function Sidebar({ className }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const SIDEBAR_OPEN_KEY = "reductai:sidebar:isOpen"
  const PERSONAL_OPEN_KEY = "reductai:sidebar:isPersonalOpen"
  const TEAM_OPEN_KEY = "reductai:sidebar:isTeamOpen"
  const MANAGEMENT_OPEN_KEY = "reductai:sidebar:isManagementOpen"
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
  const [isManagementOpen, setIsManagementOpen] = useState(() => getInitialSectionOpen(MANAGEMENT_OPEN_KEY, true))
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
  type TeamCategoryMap = Record<string, TeamCategory[]>
  const TEAM_CATS_CACHE_PREFIX = "reductai:sidebar:teamCategories:v2"
  const buildTeamCatsCacheKey = (tenantId?: string) => {
    const id = String(tenantId || "").trim()
    return id ? `${TEAM_CATS_CACHE_PREFIX}:${id}` : TEAM_CATS_CACHE_PREFIX
  }
  const [teamCategoriesByTenant, setTeamCategoriesByTenant] = useState<TeamCategoryMap>(() => {
    try {
      if (typeof window === "undefined") return {}
      const activeId = getActiveTenantId()
      if (!activeId) return {}
      const raw = window.localStorage.getItem(buildTeamCatsCacheKey(activeId))
      const j = raw ? JSON.parse(raw) : null
      const arr = Array.isArray(j) ? (j as TeamCategory[]) : []
      return arr.length ? { [activeId]: arr } : {}
    } catch {
      return {}
    }
  })
  const [teamCatsLoadingByTenant, setTeamCatsLoadingByTenant] = useState<Record<string, boolean>>({})
  const [openTeamTenantSections, setOpenTeamTenantSections] = useState<Record<string, boolean>>({})
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
  const [tenantPlanTier, setTenantPlanTier] = useState<string>(() => {
    try {
      if (typeof window === "undefined") return ""
      const raw = window.localStorage.getItem(TENANT_INFO_CACHE_KEY)
      const j = raw ? JSON.parse(raw) : null
      const tier = typeof j?.plan_tier === "string" ? String(j.plan_tier).trim() : ""
      return tier
    } catch {
      return ""
    }
  })
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
  const TENANT_MEMBERSHIPS_CACHE_KEY = "reductai:sidebar:tenantMemberships:v1"
  const initialTenantMemberships =
    (() => {
      try {
        if (typeof window === "undefined") return []
        const raw = window.localStorage.getItem(TENANT_MEMBERSHIPS_CACHE_KEY)
        const j = raw ? JSON.parse(raw) : null
        return Array.isArray(j) ? (j as Array<{
          id: string
          name?: string | null
          tenant_type?: string | null
          is_primary?: boolean
          role_slug?: string | null
          role_name?: string | null
          role_scope?: string | null
          plan_tier?: string | null
        }>) : []
      } catch {
        return []
      }
    })()
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
      membership_id?: string | null
      membership_status?: string | null
      user_id?: string | null
    }>
  >(initialTenantMemberships)
  const [tenantMembershipsLoaded, setTenantMembershipsLoaded] = useState(initialTenantMemberships.length > 0)
  const [activeTeamTenantId, setActiveTeamTenantId] = useState<string>(() => getActiveTenantId())
  const [pendingInvitations, setPendingInvitations] = useState<TenantInvitationRow[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [inviteActionLoadingId, setInviteActionLoadingId] = useState<string | null>(null)
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
  const [authProviders, setAuthProviders] = useState<string[]>([])
  const [hasPassword, setHasPassword] = useState(false)
  const [languages, setLanguages] = useState<Language[]>([])
  const [currentLang, setCurrentLang] = useState("")
  const LANGUAGE_STORAGE_KEY = "reductai.language.v1"

  const teamTenants = useMemo(() => {
    return tenantMemberships.filter((t) => {
      const type = String(t.tenant_type || "").toLowerCase()
      return type === "team" || type === "group"
    })
  }, [tenantMemberships])

  useEffect(() => {
    if (!teamTenants.length) {
      setOpenTeamTenantSections({})
      return
    }
    setOpenTeamTenantSections((prev) => {
      let changed = false
      const next: Record<string, boolean> = { ...prev }
      const ids = new Set<string>()
      teamTenants.forEach((tenant) => {
        const id = String(tenant.id || "").trim()
        if (!id) return
        ids.add(id)
        if (!(id in next)) {
          next[id] = true
          changed = true
        }
      })
      Object.keys(next).forEach((key) => {
        if (!ids.has(key)) {
          delete next[key]
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [teamTenants])

  const allTeamCategories = useMemo(() => {
    return Object.values(teamCategoriesByTenant).flat()
  }, [teamCategoriesByTenant])

  const activeTeamTenant = useMemo(() => {
    if (!teamTenants.length) return null
    const matched = teamTenants.find((t) => String(t.id) === String(activeTeamTenantId))
    return matched || teamTenants[0] || null
  }, [activeTeamTenantId, teamTenants])

  const teamCategories = useMemo(() => {
    if (!activeTeamTenantId) return []
    return teamCategoriesByTenant[activeTeamTenantId] || []
  }, [activeTeamTenantId, teamCategoriesByTenant])

  const teamCatsLoading = Boolean(
    activeTeamTenantId ? teamCatsLoadingByTenant[activeTeamTenantId] : false
  )

  const hasTeamTenant = Boolean(activeTeamTenant) || (!tenantMembershipsLoaded && Boolean(activeTeamTenantId))

  const activeTeamStatus = useMemo(() => {
    const raw = String(activeTeamTenant?.membership_status || "").toLowerCase()
    return raw || "active"
  }, [activeTeamTenant?.membership_status])

  const isSuspendedTeamMember = activeTeamStatus === "suspended"
  const isActiveTeamMember = activeTeamStatus === "active"

  const teamPageLabel = useMemo(() => {
    if (!activeTeamTenant) return "팀 페이지"
    const name = String(activeTeamTenant.name || "").trim()
    const base = name ? `${name} 페이지` : String(activeTeamTenant.tenant_type || "") === "group" ? "그룹 페이지" : "팀 페이지"
    return isSuspendedTeamMember ? `(정지) ${base}` : base
  }, [activeTeamTenant, isSuspendedTeamMember])

  const pendingInviteCount = pendingInvitations.length

  const canManageTeamTenant = useMemo(() => {
    if (!activeTeamTenant) return false
    if (!isActiveTeamMember) return false
    const roleSlug = String(activeTeamTenant.role_slug || "").toLowerCase()
    const elevated = new Set(["owner", "admin", "tenant_admin", "tenant_owner"])
    return elevated.has(roleSlug)
  }, [activeTeamTenant, isActiveTeamMember])

  const showTeamManageButton = canManageTeamTenant || isSuspendedTeamMember

  const resolveTenantLabel = (t: { name?: string | null; tenant_type?: string | null }) => {
    if (String(t.tenant_type || "") === "personal") return "개인"
    const name = String(t.name || "").trim()
    return name || "팀/그룹"
  }

  const resolveServiceTier = (t: { tenant_type?: string | null; plan_tier?: string | null }) => {
    const tier = normalizePlanTier(t.plan_tier)
    if (tier) return tier
    const type = String(t.tenant_type || "")
    if (type === "personal") return "free"
    if (type === "team" || type === "group") return "premium"
    return "free"
  }

  const getTenantMembershipStatus = (t: { membership_status?: string | null }) => {
    const raw = String(t.membership_status || "active").toLowerCase()
    return raw || "active"
  }

  const isTenantActiveMember = (t: { membership_status?: string | null }) => {
    return getTenantMembershipStatus(t) === "active"
  }

  const isTenantSuspendedMember = (t: { membership_status?: string | null }) => {
    return getTenantMembershipStatus(t) === "suspended"
  }

  const getTeamTenantLabel = (t: { name?: string | null; tenant_type?: string | null; membership_status?: string | null }) => {
    const name = String(t.name || "").trim()
    const base = name ? `${name} 페이지` : String(t.tenant_type || "") === "group" ? "그룹 페이지" : "팀 페이지"
    return isTenantSuspendedMember(t) ? `(정지) ${base}` : base
  }

  const canManageTenant = (t: { role_slug?: string | null; membership_status?: string | null }) => {
    if (!isTenantActiveMember(t)) return false
    const roleSlug = String(t.role_slug || "").toLowerCase()
    const elevated = new Set(["owner", "admin", "tenant_admin", "tenant_owner"])
    return elevated.has(roleSlug)
  }


const profileBadges = useMemo(() => {
  if (tenantMemberships.length) {
    return tenantMemberships.map((t) => {
      const tier = resolveServiceTier(t)
      const status = String(t.membership_status || "").toLowerCase()
      const prefix = status === "suspended" ? "(정지) " : ""
      return {
        key: String(t.id),
        tier,
        label: `${prefix}${resolveTenantLabel(t)}:${PLAN_TIER_LABELS[tier]}`,
      }
    })
  }
  if (!tenantType) return []
  const fallbackTier = resolveServiceTier({ tenant_type: tenantType, plan_tier: tenantPlanTier })
  return [
    {
      key: tenantType,
      tier: fallbackTier,
      label: `${resolveTenantLabel({ tenant_type: tenantType, name: tenantName })}:${PLAN_TIER_LABELS[fallbackTier]}`,
    },
  ]
}, [tenantMemberships, tenantName, tenantPlanTier, tenantType])

  useEffect(() => {
    if (!tenantMembershipsLoaded) return
    if (!teamTenants.length) {
      if (activeTeamTenantId) {
        setActiveTeamTenantId("")
        setActiveTenantId("")
      }
      return
    }
    const matched = teamTenants.find((t) => String(t.id) === String(activeTeamTenantId))
    const nextId = matched?.id ? String(matched.id) : String(teamTenants[0]?.id || "")
    if (nextId && nextId !== activeTeamTenantId) {
      setActiveTeamTenantId(nextId)
      setActiveTenantId(nextId)
    }
  }, [activeTeamTenantId, teamTenants, tenantMembershipsLoaded])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!teamTenants.length) {
      setTeamCategoriesByTenant({})
      return
    }
    setTeamCategoriesByTenant((prev) => {
      const next: TeamCategoryMap = {}
      for (const tenant of teamTenants) {
        const tenantId = String(tenant.id || "").trim()
        if (!tenantId) continue
        if (prev[tenantId]) {
          next[tenantId] = prev[tenantId]
          continue
        }
        try {
          const raw = window.localStorage.getItem(buildTeamCatsCacheKey(tenantId))
          const j = raw ? JSON.parse(raw) : null
          next[tenantId] = Array.isArray(j) ? (j as TeamCategory[]) : []
        } catch {
          next[tenantId] = []
        }
      }
      return next
    })
  }, [teamTenants])

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

  const [editingCat, setEditingCat] = useState<{
    type: "personal" | "team"
    id: string
    name: string
    tenantId?: string
  } | null>(null)
  const [draggingCat, setDraggingCat] = useState<{
    type: "personal" | "team"
    id: string
    tenantId?: string
  } | null>(null)
  const [categoryDropIndicator, setCategoryDropIndicator] = useState<{
    type: "personal" | "team"
    id: string
    tenantId?: string
    position: "before" | "after"
  } | null>(null)
  const [catIconOpen, setCatIconOpen] = useState<{ type: "personal" | "team"; id: string; tenantId?: string } | null>(null)
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
    e: React.DragEvent<HTMLElement>,
    tenantId?: string
  ) => {
    e.stopPropagation()
    dragBlockClickUntilRef.current = Date.now() + 250
    setDraggingCat({ type, id, tenantId: type === "team" ? tenantId : undefined })
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

      setTeamCategoriesByTenant((prev) => {
        let changed = false
        const next: TeamCategoryMap = {}
        for (const [tenantId, list] of Object.entries(prev)) {
          let listChanged = false
          const updated = deleted
            ? list.filter((c) => {
              const keep = String(c.id) !== id
              if (!keep) listChanged = true
              return keep
            })
            : list.map((c) => {
              if (String(c.id) !== id) return c
              listChanged = true
              return {
                ...c,
                ...(nextName !== undefined ? { name: nextName } : null),
                ...(nextIcon !== undefined ? { icon: nextIcon } : null),
              }
            })
          next[tenantId] = updated
          if (listChanged) {
            changed = true
            try {
              window.localStorage.setItem(buildTeamCatsCacheKey(tenantId), JSON.stringify(updated))
            } catch {
              // ignore
            }
          }
        }
        return changed ? next : prev
      })
    }

    window.addEventListener("reductai:categoryUpdated", onUpdated as EventListener)
    return () => window.removeEventListener("reductai:categoryUpdated", onUpdated as EventListener)
  }, [PERSONAL_CATS_CACHE_KEY])

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
    const hasNonPresetLucide = [...personalCategories, ...allTeamCategories].some((c) => {
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
  }, [LUCIDE_PRESET_MAP, catLucideAll, catLucideLoading, personalCategories, allTeamCategories])

  const saveCategoryIcon = async (args: {
    type: "personal" | "team"
    id: string
    choice: IconChoice | null
    tenantId?: string
  }) => {
    const h = args.type === "team" ? teamHeaders(args.tenantId) : authHeaders()
    if (!h || !h.Authorization) return
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
      const tenantId = String(args.tenantId || "").trim()
      if (tenantId) {
        setTeamCategoriesByTenant((prev) => {
          const nextList = (prev[tenantId] || []).map((c) => (c.id === args.id ? { ...c, icon: nextIcon } : c))
          try {
            window.localStorage.setItem(buildTeamCatsCacheKey(tenantId), JSON.stringify(nextList))
          } catch {
            // ignore
          }
          return { ...prev, [tenantId]: nextList }
        })
      }
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
  const [isBillingSettingsDialogOpen, setIsBillingSettingsDialogOpen] = useState(false)
  const [settingsDialogInitialMenu, setSettingsDialogInitialMenu] = useState<SettingsMenuId | undefined>(undefined)
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false)
  const [isTenantSettingsDialogOpen, setIsTenantSettingsDialogOpen] = useState(false)
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false)
  const [isSuspendedDialogOpen, setIsSuspendedDialogOpen] = useState(false)
  const [suspendedActionBusy, setSuspendedActionBusy] = useState(false)
  const [suspendedActionError, setSuspendedActionError] = useState<string | null>(null)

  const { theme, themeMode, setThemeMode } = useTheme()
  const [userProfileVersion, setUserProfileVersion] = useState(0)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userProfileVersion triggers re-read from localStorage
  }, [userProfileVersion])

  const currentTier = useMemo(
    () => resolveServiceTier({ tenant_type: tenantType, plan_tier: tenantPlanTier }),
    [tenantType, tenantPlanTier]
  )
  const avatarBgClass = PLAN_TIER_STYLES[currentTier]?.avatar || "bg-muted-foreground"

  const authProviderIcons = useMemo(() => {
    const items: Array<{ key: string; node: React.ReactNode }> = []
    const providers = new Set(authProviders.map((p) => String(p || "").toLowerCase()))    
    if (providers.has("google")) {
      items.push({ key: "google", node: <LogoGoogle className="size-4" /> })
    }
    if (providers.has("naver")) {
      items.push({ key: "naver", node: <LogoNaver className="size-4" /> })
    }
    if (providers.has("kakao")) {
      items.push({ key: "kakao", node: <LogoKakao className="size-4" /> })
    }
    if (hasPassword) {
      items.push({
        key: "mail",
        node: <Mail className="size-4 text-muted-foreground" />,
      })
    }
    return items
  }, [authProviders, hasPassword])


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
      window.localStorage.setItem(MANAGEMENT_OPEN_KEY, isManagementOpen ? "1" : "0")
    } catch {
      // ignore
    }
  }, [isPersonalOpen, isTeamOpen, isManagementOpen])

  const handleLogout = () => {
    // 세션/토큰 정리
    localStorage.removeItem('token')
    localStorage.removeItem('token_expires_at')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_id')
    localStorage.removeItem('user_name')
    // Sidebar 캐시 정리 (다음 로그인 시 이전 계정 정보가 보이지 않도록)
    try {
      localStorage.removeItem(TENANT_INFO_CACHE_KEY)
      localStorage.removeItem(PROFILE_IMAGE_CACHE_KEY)
      localStorage.removeItem(TENANT_MEMBERSHIPS_CACHE_KEY)
    } catch {
      // ignore
    }
    // 로그인 페이지(인트로)로 이동
    navigate('/')
  }

  const authHeaders = () => {
    const token = localStorage.getItem("token")
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  const teamHeaders = (tenantId?: string | null) => {
    const h = authHeaders()
    if (!h.Authorization) return null
    const resolvedId = String(tenantId || "").trim()
    if (!resolvedId) return null
    return withActiveTenantHeader(h, resolvedId)
  }

  const loadPendingInvitations = async () => {
    const h = authHeaders()
    if (!h.Authorization) {
      setPendingInvitations([])
      setInviteError(null)
      return
    }
    setInviteLoading(true)
    setInviteError(null)
    try {
      const r = await fetch("/api/posts/user/invitations?status=pending", { headers: h }).catch(() => null)
      if (!r || !r.ok) {
        const msg = r ? await r.text().catch(() => "") : ""
        setInviteError(msg || "초대 정보를 불러오지 못했습니다.")
        setPendingInvitations([])
        return
      }
      const j = (await r.json().catch(() => null)) as { ok?: boolean; rows?: TenantInvitationRow[]; message?: string } | null
      if (!j?.ok) {
        setInviteError(j?.message || "초대 정보를 불러오지 못했습니다.")
        setPendingInvitations([])
        return
      }
      setPendingInvitations(Array.isArray(j.rows) ? j.rows : [])
    } catch (e) {
      console.error(e)
      setInviteError("초대 정보를 불러오지 못했습니다.")
      setPendingInvitations([])
    } finally {
      setInviteLoading(false)
    }
  }

  const handleInvitationAction = async (id: string, action: "accept" | "reject") => {
    const h = authHeaders()
    if (!h.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }
    const target = pendingInvitations.find((row) => row.id === id) || null
    setInviteActionLoadingId(id)
    try {
      const r = await fetch(`/api/posts/user/invitations/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        headers: h,
      }).catch(() => null)
      if (!r || !r.ok) {
        const msg = r ? await r.text().catch(() => "") : ""
        alert(msg || "초대 처리에 실패했습니다.")
        return
      }
      if (action === "accept") {
        const nextTenantId = String(target?.tenant_id || "").trim()
        if (nextTenantId) {
          setActiveTeamTenantId(nextTenantId)
          setActiveTenantId(nextTenantId)
          setIsTeamOpen(true)
        }
        await loadTenantMemberships()
      }
      await loadPendingInvitations()
    } finally {
      setInviteActionLoadingId(null)
    }
  }

  const handleLeaveSuspendedTenant = async () => {
    const membershipId = String(activeTeamTenant?.membership_id || "").trim()
    if (!membershipId) return
    const h = authHeaders()
    if (!h.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }
    setSuspendedActionBusy(true)
    setSuspendedActionError(null)
    try {
      const r = await fetch(`/api/posts/tenant/members/${encodeURIComponent(membershipId)}`, {
        method: "PUT",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ membership_status: "inactive" }),
      }).catch(() => null)
      if (!r || !r.ok) {
        const msg = r ? await r.text().catch(() => "") : ""
        setSuspendedActionError(msg || "멤버 탈퇴에 실패했습니다.")
        return
      }
      setIsSuspendedDialogOpen(false)
      await loadTenantMemberships()
    } catch (error) {
      console.error(error)
      setSuspendedActionError("멤버 탈퇴에 실패했습니다.")
    } finally {
      setSuspendedActionBusy(false)
    }
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
  const [createCategoryTenantId, setCreateCategoryTenantId] = useState("")
  const [createCategoryName, setCreateCategoryName] = useState("")
  const [createCategoryIconChoice, setCreateCategoryIconChoice] = useState<IconChoice | null>(null)
  const [createCategoryTab, setCreateCategoryTab] = useState<"emoji" | "icon">("emoji")
  const [createLucideQuery, setCreateLucideQuery] = useState("")
  const [createLucideAll, setCreateLucideAll] = useState<Record<string, React.ElementType> | null>(null)
  const [createLucideLoading, setCreateLucideLoading] = useState(false)
  const createLucideLoadSeqRef = useRef(0)
  const [createCategoryBusy, setCreateCategoryBusy] = useState(false)

  const openCreateCategoryDialog = (type: "personal" | "team", tenantId?: string) => {
    if (type === "team") {
      const id = String(tenantId || "").trim()
      if (!id) {
        alert("팀/그룹 테넌트를 선택해 주세요.")
        return
      }
      const tenant = teamTenants.find((t) => String(t.id) === id)
      const status = String(tenant?.membership_status || "active").toLowerCase()
      if (status !== "active") {
        setActiveTeamTenantId(id)
        setIsSuspendedDialogOpen(true)
        return
      }
      setCreateCategoryTenantId(id)
    } else {
      setCreateCategoryTenantId("")
    }
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

  const performCreateCategory = async (args: {
    type: "personal" | "team"
    name: string
    icon: IconChoice
    tenantId?: string
  }) => {
    const h = args.type === "team" ? teamHeaders(args.tenantId) : authHeaders()
    if (!h || !h.Authorization) {
      alert("로그인이 필요합니다.")
      return
    }
    if (args.type === "team") {
      const id = String(args.tenantId || "").trim()
      if (!id) return
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
        const tenantId = String(args.tenantId || "").trim()
        if (tenantId) {
          setTeamCategoriesByTenant((prev) => {
            const nextList = [cat as unknown as TeamCategory, ...(prev[tenantId] || [])]
            try {
              window.localStorage.setItem(buildTeamCatsCacheKey(tenantId), JSON.stringify(nextList))
            } catch {
              // ignore
            }
            return { ...prev, [tenantId]: nextList }
          })
        }
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
    if (hasTeamTenant) {
      void loadTenantName()
      teamTenants.forEach((tenant) => {
        if (!isTenantActiveMember(tenant)) return
        const id = String(tenant.id || "").trim()
        if (!id) return
        void loadTeamCategories(id)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isMobileMenuOpen, isPersonalOpen, hasTeamTenant, teamTenants])

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
    if (type) setTenantType(type)
    if (name) setTenantName(name)
    if (planTier) setTenantPlanTier(planTier)
    if (id || type || name) {
      try {
        const cachedRaw = window.localStorage.getItem(TENANT_INFO_CACHE_KEY)
        const cached = cachedRaw ? JSON.parse(cachedRaw) : null
        const cachedPlanTier =
          typeof cached?.plan_tier === "string" ? String(cached.plan_tier).trim() : ""
        const nextPlanTier = planTier || cachedPlanTier
        window.localStorage.setItem(
          TENANT_INFO_CACHE_KEY,
          JSON.stringify({
            id: id || "",
            tenant_type: type || "",
            name: name || "",
            plan_tier: nextPlanTier || "",
          })
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

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tenantId?: string; name?: string }>).detail
      const tenantId = detail?.tenantId
      const name = detail?.name ?? ""
      if (!tenantId) return
      setTenantMemberships((prev) =>
        prev.map((item) => (String(item.id) === String(tenantId) ? { ...item, name } : item))
      )
      try {
        const cachedRaw = window.localStorage.getItem(TENANT_INFO_CACHE_KEY)
        const cached = cachedRaw ? JSON.parse(cachedRaw) : null
        if (cached && String(cached.id) === String(tenantId)) {
          setTenantName(name)
          window.localStorage.setItem(
            TENANT_INFO_CACHE_KEY,
            JSON.stringify({ ...cached, name: name || "" })
          )
        }
        const membershipsRaw = window.localStorage.getItem(TENANT_MEMBERSHIPS_CACHE_KEY)
        const memberships = membershipsRaw ? JSON.parse(membershipsRaw) : null
        if (Array.isArray(memberships)) {
          const next = memberships.map((m: { id?: string; name?: string }) =>
            String(m.id) === String(tenantId) ? { ...m, name } : m
          )
          window.localStorage.setItem(TENANT_MEMBERSHIPS_CACHE_KEY, JSON.stringify(next))
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener("reductai:tenantInfoUpdated", handler as EventListener)
    return () => window.removeEventListener("reductai:tenantInfoUpdated", handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ full_name?: string; profile_image_url?: string | null }>).detail
      if (detail?.full_name !== undefined) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("user_name", String(detail.full_name || ""))
        }
        setUserProfileVersion((v) => v + 1)
      }
      if (detail?.profile_image_url !== undefined) {
        const url = detail.profile_image_url || null
        setProfileImageUrl(url)
        try {
          if (url) {
            window.localStorage.setItem(PROFILE_IMAGE_CACHE_KEY, url)
          } else {
            window.localStorage.removeItem(PROFILE_IMAGE_CACHE_KEY)
          }
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener("reductai:userProfileUpdated", handler as EventListener)
    return () => window.removeEventListener("reductai:userProfileUpdated", handler as EventListener)
  }, [])

  const loadTenantMemberships = async () => {
    const h = authHeaders()
    if (!h.Authorization) {
      setTenantMembershipsLoaded(true)
      return
    }
    try {
      const r = await fetch("/api/posts/tenant/memberships", { headers: h }).catch(() => null)
      if (!r || !r.ok) return
      const rows = (await r.json().catch(() => [])) as Array<{
        id: string
        name?: string | null
        tenant_type?: string | null
        is_primary?: boolean
        plan_tier?: string | null
        role_slug?: string | null
        role_name?: string | null
        role_scope?: string | null
        membership_id?: string | null
        membership_status?: string | null
        user_id?: string | null
      }>
      if (Array.isArray(rows)) {
        setTenantMemberships(rows)
        try {
          window.localStorage.setItem(TENANT_MEMBERSHIPS_CACHE_KEY, JSON.stringify(rows))
        } catch {
          // ignore
        }
      }
    } finally {
      setTenantMembershipsLoaded(true)
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
    setHasPassword(Boolean(j.has_password))
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

  const loadUserProviders = async () => {
    const h = authHeaders()
    if (!h.Authorization) return
    const r = await fetch("/api/posts/user/providers", { headers: h }).catch(() => null)
    if (!r || !r.ok) return
    const rows = (await r.json().catch(() => [])) as Array<{ provider?: string | null }>
    if (!Array.isArray(rows)) return
    const providers = rows
      .map((row) => String(row.provider || "").trim().toLowerCase())
      .filter(Boolean)
    setAuthProviders(Array.from(new Set(providers)))
  }

  useEffect(() => {
    void loadTenantMemberships()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadUserProfile()
    void loadUserProviders()
    void loadPendingInvitations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!isInviteDialogOpen) return
    void loadPendingInvitations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInviteDialogOpen])

  const goToTopCategory = async (kind: "personal" | "team", tenantId?: string) => {
    if (kind === "team") {
      const id = String(tenantId || "").trim()
      if (!id) return
      const tenant = teamTenants.find((t) => String(t.id) === id)
      const status = String(tenant?.membership_status || "active").toLowerCase()
      if (status !== "active") {
        setActiveTeamTenantId(id)
        setIsSuspendedDialogOpen(true)
        return
      }
      const list = teamCategoriesByTenant[id] || []
      const fromState = list.length ? String(list[0]?.id || "") : ""
      if (fromState) {
        setActiveTenantId(id)
        setActiveTeamTenantId(id)
        navigate(`/posts?category=${encodeURIComponent(fromState)}`)
        return
      }
      const h = teamHeaders(id)
      if (!h || !h.Authorization) return
      const r = await fetch("/api/posts/categories/mine?type=team_page", { headers: h }).catch(() => null)
      if (!r || !r.ok) return
      const j = await r.json().catch(() => [])
      const arr = Array.isArray(j) ? (j as Array<{ id?: unknown }>) : []
      const firstId = arr.length ? String(arr[0]?.id || "") : ""
      if (!firstId) return
      setActiveTenantId(id)
      setActiveTeamTenantId(id)
      navigate(`/posts?category=${encodeURIComponent(firstId)}`)
      return
    }

    const list = personalCategories
    const fromState = list.length ? String(list[0]?.id || "") : ""
    if (fromState) {
      navigate(`/posts?category=${encodeURIComponent(fromState)}`)
      return
    }

    const h = authHeaders()
    if (!h || !h.Authorization) return
    const url = "/api/posts/categories/mine"
    const r = await fetch(url, { headers: h }).catch(() => null)
    if (!r || !r.ok) return
    const j = await r.json().catch(() => [])
    const arr = Array.isArray(j) ? (j as Array<{ id?: unknown }>) : []
    const firstId = arr.length ? String(arr[0]?.id || "") : ""
    if (!firstId) return
    navigate(`/posts?category=${encodeURIComponent(firstId)}`)
  }

  const loadTeamCategories = async (tenantId: string) => {
    const id = String(tenantId || "").trim()
    if (!id) return
    const h = teamHeaders(id)
    if (!h || !h.Authorization) return
    setTeamCatsLoadingByTenant((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await fetch("/api/posts/categories/mine?type=team_page", { headers: h })
      if (!r.ok) return
      const j = await r.json().catch(() => [])
      const arr = Array.isArray(j) ? (j as TeamCategory[]) : []
      setTeamCategoriesByTenant((prev) => ({ ...prev, [id]: arr }))
      try {
        window.localStorage.setItem(buildTeamCatsCacheKey(id), JSON.stringify(arr))
      } catch {
        // ignore
      }
    } finally {
      setTeamCatsLoadingByTenant((prev) => ({ ...prev, [id]: false }))
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
                void performCreateCategory({
                  type: createCategoryType,
                  name,
                  icon,
                  tenantId: createCategoryType === "team" ? createCategoryTenantId : undefined,
                }).finally(() => {
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
              void performCreateCategory({
                type: createCategoryType,
                name,
                icon,
                tenantId: createCategoryType === "team" ? createCategoryTenantId : undefined,
              }).finally(() => {
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
    if (!hasTeamTenant) return
    void loadTenantName()
    teamTenants.forEach((tenant) => {
      if (!isTenantActiveMember(tenant)) return
      const id = String(tenant.id || "").trim()
      if (!id) return
      void loadTeamCategories(id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasTeamTenant, teamTenants])

  const renameCategory = async (args: { type: "personal" | "team"; id: string; name: string; tenantId?: string }) => {
    const h = args.type === "team" ? teamHeaders(args.tenantId) : authHeaders()
    if (!h || !h.Authorization) return
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
    if (args.type === "personal") {
      setPersonalCategories((prev) => prev.map((c) => (c.id === args.id ? { ...c, name: next } : c)))
    } else {
      const tenantId = String(args.tenantId || "").trim()
      if (!tenantId) return
      setTeamCategoriesByTenant((prev) => {
        const nextList = (prev[tenantId] || []).map((c) => (c.id === args.id ? { ...c, name: next } : c))
        return { ...prev, [tenantId]: nextList }
      })
    }
    emitCategoryUpdated({ id: String(args.id), name: next })
  }

  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{
    type: "personal" | "team"
    id: string
    name: string
    tenantId?: string
  } | null>(null)
  const [deleteCategoryBusy, setDeleteCategoryBusy] = useState(false)

  const performDeleteCategory = async (args: { type: "personal" | "team"; id: string; tenantId?: string }) => {
    const h = args.type === "team" ? teamHeaders(args.tenantId) : authHeaders()
    if (!h || !h.Authorization) return
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
      const tenantId = String(args.tenantId || "").trim()
      if (tenantId) {
        const prevList = teamCategoriesByTenant[tenantId] || []
        const nextList = prevList.filter((c) => String(c.id) !== deletedId)
        setTeamCategoriesByTenant((prev) => ({ ...prev, [tenantId]: nextList }))
        nextId = nextList.length ? String(nextList[0]?.id || "") : ""
      }
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
              void performDeleteCategory({ type: t.type, id: t.id, tenantId: t.tenantId }).finally(() => {
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
      onOpenPlanDialog={openPlanDialog}
    />
  )
  const billingSettingsDialog = (
    <BillingSettingsDialog
      open={isBillingSettingsDialogOpen}
      onOpenChange={setIsBillingSettingsDialogOpen}
      onOpenPlanDialog={openPlanDialog}
    />
  )
  const planDialog = (
    <PlanDialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen} currentTier={tenantPlanTier} />
  )
  const tenantSettingsDialog = (
    <TenantSettingsDialog
      open={isTenantSettingsDialogOpen}
      onOpenChange={setIsTenantSettingsDialogOpen}
      onOpenPlanDialog={openPlanDialog}
    />
  )
  const contactDialog = (
    <ContactDialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen} />
  )
  const inviteDialog = (
    <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>테넌트 초대 요청</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {inviteError ? (
            <div className="text-xs text-destructive">{inviteError}</div>
          ) : inviteLoading ? (
            <div className="text-xs text-muted-foreground">초대 정보를 불러오는 중입니다.</div>
          ) : pendingInvitations.length ? (
            pendingInvitations.map((row) => {
              const roleLabel =
                INVITATION_ROLE_LABELS[String(row.membership_role || "").toLowerCase()] || row.membership_role || "-"
              return (
                <div key={row.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {row.tenant_name || "테넌트"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        역할: {roleLabel} · 초대한 사람: {row.inviter_name || row.inviter_email || "-"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        만료일: {formatDateShort(row.expires_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={inviteActionLoadingId === row.id}
                        onClick={() => handleInvitationAction(row.id, "reject")}
                      >
                        거절
                      </Button>
                      <Button
                        size="sm"
                        disabled={inviteActionLoadingId === row.id}
                        onClick={() => handleInvitationAction(row.id, "accept")}
                      >
                        승인
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-xs text-muted-foreground">현재 대기 중인 초대가 없습니다.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
  const suspendedDialog = (
    <Dialog open={isSuspendedDialogOpen} onOpenChange={setIsSuspendedDialogOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>정지 안내</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-foreground">
            현재 <span className="font-semibold">{activeTeamTenant?.name || "해당"}</span> 테넌트에서 정지된 상태입니다.
          </div>
          {suspendedActionError ? (
            <div className="text-xs text-destructive">{suspendedActionError}</div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsSuspendedDialogOpen(false)} disabled={suspendedActionBusy}>
            취소
          </Button>
          <Button variant="destructive" onClick={handleLeaveSuspendedTenant} disabled={suspendedActionBusy}>
            멤버 탈퇴
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const reorder = async (args: { type: "personal" | "team"; orderedIds: string[]; tenantId?: string }) => {
    const h = args.type === "team" ? teamHeaders(args.tenantId) : authHeaders()
    if (!h || !h.Authorization) return
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
    setSettingsDialogInitialMenu(undefined)
    setIsSettingsDialogOpen(true)
    setIsProfileOpen(false)
    setIsMobileProfileOpen(false)
  }

  function openPlanDialog() {
    setIsPlanDialogOpen(true)
    setIsProfileOpen(false)
    setIsMobileProfileOpen(false)
  }

  const openBillingSettingsDialog = () => {
    setIsBillingSettingsDialogOpen(true)
    setIsProfileOpen(false)
    setIsMobileProfileOpen(false)
  }

  const openTenantSettingsDialog = () => {
    if (!canManageTeamTenant) return
    setIsTenantSettingsDialogOpen(true)
    setIsProfileOpen(false)
    setIsMobileProfileOpen(false)
  }

  useEffect(() => {
    if (canManageTeamTenant) return
    if (isTenantSettingsDialogOpen) setIsTenantSettingsDialogOpen(false)
  }, [canManageTeamTenant, isTenantSettingsDialogOpen])

  useEffect(() => {
    const handler = () => openSettingsDialogAt("credits")
    window.addEventListener("reductai:open-settings-credits", handler)
    return () => window.removeEventListener("reductai:open-settings-credits", handler)
  }, [])

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
        <SidebarProfileBlock
          variant="mobile"
          open={isMobileProfileOpen}
          onOpenChange={setIsMobileProfileOpen}
          profile={{
            imageUrl: profileImageUrl,
            name: userProfile.name,
            email: userProfile.email || "",
            initial: userProfile.initial,
          }}
          avatarBgClass={avatarBgClass}
          currentTier={currentTier}
          profileBadges={profileBadges}
          authProviderIcons={authProviderIcons}
          onOpenSettings={openSettingsDialog}
          onOpenPlan={openPlanDialog}
          onOpenBilling={openBillingSettingsDialog}
          onLogout={handleLogout}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          theme={theme}
          languages={languages}
          currentLang={currentLang}
          onLanguageChange={(code: string) => {
            setCurrentLang(code)
            localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
            window.dispatchEvent(new CustomEvent("reductai:language", { detail: { lang: code } }))
          }}
          languageStorageKey={LANGUAGE_STORAGE_KEY}
        />
        {CategoryDeleteDialog}
        {CreateCategoryDialog}
        {settingsDialog}
        {billingSettingsDialog}
        {planDialog}
        {tenantSettingsDialog}
        {contactDialog}
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
          <SidebarProfileBlock
            variant="mobile"
            open={isMobileProfileOpen}
            onOpenChange={setIsMobileProfileOpen}
            profile={{
              imageUrl: profileImageUrl,
              name: userProfile.name,
              email: userProfile.email || "",
              initial: userProfile.initial,
            }}
            avatarBgClass={avatarBgClass}
            currentTier={currentTier}
            profileBadges={profileBadges}
            authProviderIcons={authProviderIcons}
            onOpenSettings={openSettingsDialog}
            onOpenPlan={openPlanDialog}
            onOpenBilling={openBillingSettingsDialog}
            onLogout={handleLogout}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
            theme={theme}
            languages={languages}
            currentLang={currentLang}
            onLanguageChange={(code) => {
              setCurrentLang(code)
              localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
              window.dispatchEvent(new CustomEvent("reductai:language", { detail: { lang: code } }))
            }}
            languageStorageKey={LANGUAGE_STORAGE_KEY}
          />
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
            {pendingInviteCount > 0 ? (
              <div
                className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  setIsInviteDialogOpen(true)
                }}
              >
                <div className="size-5 flex items-center justify-center"><Mail className="size-full" /></div>
                <span className="text-base text-foreground flex-1">테넌트 초대 요청</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {pendingInviteCount}
                </span>
              </div>
            ) : null}
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
          {hasTeamTenant ? (
            <div className="flex flex-col gap-1 mb-2">
              <>
                  {teamTenants.map((tenant) => {
                    const tenantId = String(tenant.id || "").trim()
                    if (!tenantId) return null
                    const tenantLabel = getTeamTenantLabel(tenant)
                    const tenantCategories = teamCategoriesByTenant[tenantId] || []
                    const isActiveMember = isTenantActiveMember(tenant)
                    const isSuspendedMember = isTenantSuspendedMember(tenant)
                    const showManage = canManageTenant(tenant) || isSuspendedMember
                    const loading = Boolean(teamCatsLoadingByTenant[tenantId])
                    const isSectionOpen = openTeamTenantSections[tenantId] !== false
                    return (
                      <div key={tenantId} className="mt-1">
                        <div
                          className="flex items-center justify-between px-2 h-8 opacity-70 cursor-pointer"
                          onClick={() =>
                            setOpenTeamTenantSections((prev) => ({
                              ...prev,
                              [tenantId]: !(prev[tenantId] !== false),
                            }))
                          }
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-1">
                            {/* <ChevronRight
                              className={cn("size-4 transition-transform", isSectionOpen ? "rotate-90" : "")}
                            /> */}
                            <span className="truncate text-sm text-foreground">{tenantLabel}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {showManage ? (
                              <button
                                type="button"
                                className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800"
                                title="테넌트 관리"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setActiveTenantId(tenantId)
                                  setActiveTeamTenantId(tenantId)
                                  if (isSuspendedMember) {
                                    setIsSuspendedDialogOpen(true)
                                    return
                                  }
                                  openTenantSettingsDialog()
                                }}
                              >
                                <Settings className="size-4" />
                              </button>
                            ) : null}
                            {isActiveMember ? (
                              <button
                                type="button"
                                className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800"
                                title="카테고리 추가"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setActiveTenantId(tenantId)
                                  setActiveTeamTenantId(tenantId)
                                  openCreateCategoryDialog("team", tenantId)
                                }}
                              >
                                <Plus className="size-4" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {isActiveMember && isSectionOpen ? (
                          <>
                            {/* <div className="px-2 py-1 text-xs text-muted-foreground">공유 페이지</div> */}
                            {loading ? (
                              <div className="px-2 py-1 text-xs text-muted-foreground">Loading…</div>
                            ) : null}
                            {tenantCategories.map((c) => {
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
                                    isActive
                                      ? "bg-neutral-200 dark:bg-neutral-800"
                                      : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                                  )}
                                  onClick={() => {
                                    setActiveTenantId(tenantId)
                                    setActiveTeamTenantId(tenantId)
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
                                setActiveTenantId(tenantId)
                                setActiveTeamTenantId(tenantId)
                                setIsMobileMenuOpen(false)
                                navigate("/files/shared")
                              }}
                            >
                              <Save className="size-5" />
                              <span className="text-base text-foreground">공유 파일</span>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )
                  })}
              </>
            </div>
          ) : null}

          {/* 관리 섹션 */}
          <div className="flex flex-col gap-1 mt-4">
            <div className="flex items-center px-2 h-8 opacity-70">
              <span
                className="text-sm text-foreground w-full cursor-pointer select-none"
                onClick={() => setIsManagementOpen((prev) => !prev)}
              >
                관리
              </span>
              {/* <button
                type="button"
                className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800"
                onClick={() => setIsManagementOpen((prev) => !prev)}
              >
                <ChevronRight className={cn("size-4 transition-transform", isManagementOpen ? "rotate-90" : "")} />
              </button> */}
            </div>
            {isManagementOpen ? (
              <>
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
                <div
                  className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  onClick={() => setIsContactDialogOpen(true)}
                >
                  <MessageSquareMore className="size-5" />
                  <span className="text-base text-foreground">문의</span>
                </div>
              </>
            ) : null}
          </div>
        </div>
        {CategoryDeleteDialog}
        {CreateCategoryDialog}
        {settingsDialog}
        {planDialog}
        {tenantSettingsDialog}
        {contactDialog}
        {inviteDialog}
        {suspendedDialog}
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
        <SidebarProfileBlock
          variant={isOpen ? "expanded" : "collapsed"}
          isSidebarOpen={isOpen}
          open={isProfileOpen}
          onOpenChange={setIsProfileOpen}
          profile={{
            imageUrl: profileImageUrl,
            name: userProfile.name,
            email: userProfile.email || "",
            initial: userProfile.initial,
          }}
          avatarBgClass={avatarBgClass}
          currentTier={currentTier}
          profileBadges={profileBadges}
          authProviderIcons={authProviderIcons}
          onOpenSettings={openSettingsDialog}
          onOpenPlan={openPlanDialog}
          onOpenBilling={openBillingSettingsDialog}
          onLogout={handleLogout}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          theme={theme}
          languages={languages}
          currentLang={currentLang}
          onLanguageChange={(code: string) => {
            setCurrentLang(code)
            localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
            window.dispatchEvent(new CustomEvent("reductai:language", { detail: { lang: code } }))
          }}
          languageStorageKey={LANGUAGE_STORAGE_KEY}
        />
      </div>

      {/* Scrollable area - Menu + Pages */}
      <div className="flex-1 min-h-0 overflow-y-auto">

      {/* Menu Items - 메뉴 아이템 */}
      <div className="flex flex-col p-2 gap-0">
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
        {pendingInviteCount > 0 ? (
          <div
            className={cn(
              "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer",
              !isOpen && "justify-center",
              "hover:bg-accent/50"
            )}
            onClick={() => setIsInviteDialogOpen(true)}
          >
            <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
              <Mail className="size-full" />
            </div>
            {isOpen && <span className="text-sm text-sidebar-foreground flex-1">테넌트 초대 요청</span>}
            {isOpen && (
              <span className="rounded-full bg-primary/10 h-4 w-4 flex items-center justify-center text-[10px] font-semibold text-primary">
                {pendingInviteCount}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {isOpen ? (
        <>
          {/* Personal Pages - 개인 페이지 */}
          <div className="flex flex-col p-2 gap-0">
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
          {hasTeamTenant ? (
            <div className="flex flex-col p-2 gap-1">
              <>
                  {teamTenants.map((tenant) => {
                    const tenantId = String(tenant.id || "").trim()
                    if (!tenantId) return null
                    const tenantLabel = getTeamTenantLabel(tenant)
                    const tenantCategories = teamCategoriesByTenant[tenantId] || []
                    const isActiveMember = isTenantActiveMember(tenant)
                    const isSuspendedMember = isTenantSuspendedMember(tenant)
                    const showManage = canManageTenant(tenant) || isSuspendedMember
                    const loading = Boolean(teamCatsLoadingByTenant[tenantId])
                    const isSectionOpen = openTeamTenantSections[tenantId] !== false
                    return (
                      <div key={tenantId} className="mt-1">
                        <div
                          className="flex items-center gap-2 px-2 h-8 opacity-70 cursor-pointer select-none group"
                          onClick={() =>
                            setOpenTeamTenantSections((prev) => ({
                              ...prev,
                              [tenantId]: !(prev[tenantId] !== false),
                            }))
                          }
                        >
                          {/* <ChevronRight
                            className={cn("size-4 transition-transform", isSectionOpen ? "rotate-90" : "")}
                          /> */}
                          <span className="min-w-0 flex-1 truncate text-left text-xs text-sidebar-foreground">{tenantLabel}</span>
                          {showManage ? (
                            <div
                              className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                              role="button"
                              title="테넌트 관리"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setActiveTenantId(tenantId)
                                setActiveTeamTenantId(tenantId)
                                if (isSuspendedMember) {
                                  setIsSuspendedDialogOpen(true)
                                  return
                                }
                                openTenantSettingsDialog()
                              }}
                            >
                              <Settings className="size-full" />
                            </div>
                          ) : null}
                          {isActiveMember ? (
                            <div
                              className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                              role="button"
                              title="카테고리 추가"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setActiveTenantId(tenantId)
                                setActiveTeamTenantId(tenantId)
                                openCreateCategoryDialog("team", tenantId)
                              }}
                            >
                              <Plus className="size-full" />
                            </div>
                          ) : null}
                        </div>
                        {isActiveMember && isSectionOpen ? (
                          <>
                            {/* <div className="px-2 py-1 text-xs text-sidebar-foreground/60">공유 페이지</div> */}
                            <div
                              className="px-2 py-1 text-xs text-sidebar-foreground/60 h-6 hidden"
                              style={{ visibility: loading ? "visible" : "hidden" }}
                            >
                              Loading…
                            </div>

                            {tenantCategories.map((c) => {
                              const isActive = isPostsActive && activeCategoryId === String(c.id)
                              const isDropTarget =
                                !!categoryDropIndicator &&
                                categoryDropIndicator.type === "team" &&
                                categoryDropIndicator.id === String(c.id) &&
                                categoryDropIndicator.tenantId === tenantId
                              const dropPosition = isDropTarget ? categoryDropIndicator!.position : null
                              return (
                                <div
                                  key={c.id}
                                  className={cn(
                                    "group relative flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer cursor-grab active:cursor-grabbing",
                                    isActive
                                      ? "bg-neutral-200 dark:bg-neutral-800"
                                      : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                                  )}
                                  draggable
                                  onDragStart={(e) => startCategoryDrag("team", c.id, e, tenantId)}
                                  onDragEnd={endCategoryDrag}
                                  onClick={() => {
                                    if (Date.now() < dragBlockClickUntilRef.current) return
                                    if (
                                      editingCat &&
                                      editingCat.type === "team" &&
                                      editingCat.id === c.id &&
                                      editingCat.tenantId === tenantId
                                    )
                                      return
                                    setActiveTenantId(tenantId)
                                    setActiveTeamTenantId(tenantId)
                                    navigate(`/posts?category=${encodeURIComponent(String(c.id))}`)
                                  }}
                                  onDragOver={(e) => {
                                    if (!draggingCat || draggingCat.type !== "team" || draggingCat.tenantId !== tenantId) return
                                    e.preventDefault()
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                    const before = e.clientY < rect.top + rect.height / 2
                                    setCategoryDropIndicator({
                                      type: "team",
                                      id: String(c.id),
                                      tenantId,
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
                                      if (prev.tenantId !== tenantId) return prev
                                      return null
                                    })
                                  }}
                                  onDrop={(e) => {
                                    if (!draggingCat || draggingCat.type !== "team" || draggingCat.tenantId !== tenantId) return
                                    e.preventDefault()
                                    const fromId = draggingCat.id
                                    const toId = c.id
                                    if (!fromId || fromId === toId) return
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                    const before = e.clientY < rect.top + rect.height / 2
                                    setTeamCategoriesByTenant((prev) => {
                                      const current = prev[tenantId] || []
                                      const next = current.slice()
                                      const fromIdx = next.findIndex((x) => x.id === fromId)
                                      if (fromIdx < 0) return prev
                                      const [moved] = next.splice(fromIdx, 1)
                                      const toIdx = next.findIndex((x) => x.id === toId)
                                      if (toIdx < 0) return prev
                                      const insertIdx = toIdx + (before ? 0 : 1)
                                      next.splice(insertIdx, 0, moved)
                                      void reorder({ type: "team", orderedIds: next.map((x) => x.id), tenantId })
                                      return { ...prev, [tenantId]: next }
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
                                    const isDark =
                                      typeof document !== "undefined" && document.documentElement.classList.contains("dark")
                                    const open =
                                      !!catIconOpen &&
                                      catIconOpen.type === "team" &&
                                      catIconOpen.id === String(c.id) &&
                                      catIconOpen.tenantId === tenantId
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
                                      <Popover
                                        open={open}
                                        onOpenChange={(o) =>
                                          setCatIconOpen(o ? { type: "team", id: String(c.id), tenantId } : null)
                                        }
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
                                          <Tabs
                                            value={catIconTab}
                                            onValueChange={(v) => setCatIconTab(v === "icon" ? "icon" : "emoji")}
                                          >
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
                                                    void saveCategoryIcon({
                                                      type: "team",
                                                      id: String(c.id),
                                                      choice: { kind: "emoji", value: native },
                                                      tenantId,
                                                    })
                                                    setCatIconOpen(null)
                                                  }}
                                                />
                                              </div>
                                              <div className="mt-2 flex justify-end">
                                                <button
                                                  type="button"
                                                  className="text-xs px-2 py-1 rounded hover:bg-accent"
                                                  onClick={() => {
                                                    void saveCategoryIcon({ type: "team", id: String(c.id), choice: null, tenantId })
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
                                                                  tenantId,
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
                                                          tenantId,
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
                                                    void saveCategoryIcon({ type: "team", id: String(c.id), choice: null, tenantId })
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

                                  {editingCat &&
                                  editingCat.type === "team" &&
                                  editingCat.id === c.id &&
                                  editingCat.tenantId === tenantId ? (
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
                                          void renameCategory({ type: "team", id: c.id, name: editingCat.name, tenantId })
                                          setEditingCat(null)
                                        } else if (e.key === "Escape") {
                                          e.preventDefault()
                                          setEditingCat(null)
                                        }
                                      }}
                                      onBlur={() => {
                                        if (Date.now() < renameFocusUntilRef.current) return
                                        void renameCategory({ type: "team", id: c.id, name: editingCat.name, tenantId })
                                        setEditingCat(null)
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className="text-sm text-sidebar-foreground truncate flex-1 min-w-0"
                                      draggable
                                      onDragStart={(e) => startCategoryDrag("team", c.id, e, tenantId)}
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
                                            setEditingCat({ type: "team", id: c.id, name: c.name || "", tenantId })
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
                                            setDeleteCategoryTarget({
                                              type: "team",
                                              id: String(c.id),
                                              name: String(c.name || ""),
                                              tenantId,
                                            })
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
                                setActiveTenantId(tenantId)
                                setActiveTeamTenantId(tenantId)
                                navigate("/files/shared")
                              }}
                            >
                              <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                                <Save className="size-full" />
                              </div>
                              <span className="text-sm text-sidebar-foreground">공유 파일</span>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )
                  })}
              </>
            </div>
          ) : null}
        </>
      ) : (
        // Collapsed Menu Icons for Pages
        <div className="flex flex-col p-2 gap-0">
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

          {hasTeamTenant ? (
            <HoverCard
              openDelay={0}
              closeDelay={120}
              open={collapsedTeamHoverOpen}
              onOpenChange={(open) => {
                setCollapsedTeamHoverOpen(open)
                if (open && teamCategories.length === 0 && isActiveTeamMember && activeTeamTenantId) {
                  void loadTeamCategories(String(activeTeamTenantId))
                }
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
                  title={teamPageLabel}
                  onClick={() => {
                    if (!activeTeamTenantId) return
                    void goToTopCategory("team", activeTeamTenantId)
                  }}
                >
                  <Share2 className="size-4 text-sidebar-foreground" />
                </div>
              </HoverCardTrigger>
              <HoverCardContent side="right" align="start" className="w-[280px] p-2">
                <div className="flex min-w-0 items-center justify-between gap-2 px-1 pb-2">
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold">{teamPageLabel}</div>
                  <div className="flex items-center gap-1">
                    {showTeamManageButton ? (
                      <button
                        type="button"
                        className="size-8 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center"
                        title="테넌트 관리"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (isSuspendedTeamMember) {
                            setIsSuspendedDialogOpen(true)
                            return
                          }
                          openTenantSettingsDialog()
                        }}
                      >
                        <Settings className="size-4" />
                      </button>
                    ) : null}
                    {isActiveTeamMember ? (
                      <button
                        type="button"
                        className="size-8 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center"
                        title="카테고리 추가"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          // Shared categories are allowed for team + group (exclude personal).
                          if (!hasTeamTenant) return
                          if (!activeTeamTenantId) return
                          openCreateCategoryDialog("team", activeTeamTenantId)
                        }}
                      >
                        <Plus className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                {isActiveTeamMember ? (
                  <>
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
                  </>
                ) : null}
              </HoverCardContent>
            </HoverCard>
          ) : null}
        </div>
      )}

      </div>{/* end scrollable area */}

      {/* Management - 관리 */}
      <div className="flex flex-col p-2 gap-0 shrink-0">
        {isOpen && (
          <div className="flex items-center gap-2 px-2 h-8 opacity-70 justify-between">
            <div
              className="text-xs text-sidebar-foreground w-full cursor-pointer select-none"
              onClick={() => setIsManagementOpen((prev) => !prev)}
            >
              관리
            </div>
            {/* <button
              type="button"
              className="size-6 flex items-center justify-center rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800"
              onClick={() => setIsManagementOpen((prev) => !prev)}
            >
              <ChevronRight className={cn("size-4 transition-transform", isManagementOpen ? "rotate-90" : "")} />
            </button> */}
          </div>
        )}
        {(!isOpen || isManagementOpen) ? (
          <>
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
              onClick={() => setIsContactDialogOpen(true)}
            >
              <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                <MessageSquareMore className="size-full" />
              </div>
              {isOpen && <span className="text-sm text-sidebar-foreground">문의</span>}
            </div>
          </>
        ) : null}
      </div>
      {CategoryDeleteDialog}
      {CreateCategoryDialog}
      {settingsDialog}
      {billingSettingsDialog}
      {planDialog}
      {tenantSettingsDialog}
      {contactDialog}
      {inviteDialog}
      {suspendedDialog}
    </div>
  )
}
