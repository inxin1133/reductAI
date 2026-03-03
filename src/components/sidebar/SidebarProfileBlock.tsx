import {
  BadgeDollarSign,
  Check,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  Wallet,
} from "lucide-react"
import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { type PlanTier, PLAN_TIER_LABELS, PLAN_TIER_STYLES } from "@/lib/planTier"
import { ProfileAvatar } from "@/lib/ProfileAvatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"

export type SidebarProfileVariant = "expanded" | "collapsed" | "mobile"

type ProfileBadge = {
  key: string
  tier: PlanTier
  label: string
}

type AuthProviderIcon = {
  key: string
  node: ReactNode
}

type Language = {
  code: string
  name: string
  native_name: string
  is_default: boolean
  flag_emoji: string
  is_active?: boolean
}

export type SidebarProfileBlockProps = {
  variant: SidebarProfileVariant
  isSidebarOpen?: boolean
  profile: {
    imageUrl: string | null
    name: string
    email: string
    initial: string
  }
  avatarBgClass: string
  currentTier: PlanTier
  profileBadges: ProfileBadge[]
  authProviderIcons: AuthProviderIcon[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenSettings: () => void
  onOpenPlan: () => void
  onOpenBilling: () => void
  onLogout: () => void
  themeMode: "light" | "dark" | "system"
  setThemeMode: (mode: "light" | "dark" | "system") => void
  theme: "light" | "dark"
  languages: Language[]
  currentLang: string
  onLanguageChange: (code: string) => void
  languageStorageKey: string
}

export function SidebarProfileBlock({
  variant,
  isSidebarOpen = true,
  profile,
  avatarBgClass,
  currentTier,
  profileBadges,
  authProviderIcons,
  open,
  onOpenChange,
  onOpenSettings,
  onOpenPlan,
  onOpenBilling,
  onLogout,
  themeMode,
  setThemeMode,
  theme,
  languages,
  currentLang,
  onLanguageChange,
  languageStorageKey,
}: SidebarProfileBlockProps) {
  const isExpanded = variant === "expanded"
  const isMobile = variant === "mobile"

  const triggerContent =
    isExpanded ? (
      <>
        <ProfileAvatar
          size={40}
          rounded="lg"
          src={profile.imageUrl}
          name={profile.name}
          initial={profile.initial}
          fallbackClassName={avatarBgClass}
          textClassName="text-lg"
          showBrokenIcon
        />
        <div className="flex flex-col flex-1 min-w-0">
          <p className="text-sm text-left font-semibold text-sidebar-foreground truncate">{profile.name}</p>
          <div className="flex items-center flex-wrap gap-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                PLAN_TIER_STYLES[currentTier]?.badge || PLAN_TIER_STYLES.free.badge
              )}
            >
              {PLAN_TIER_LABELS[currentTier]}
            </span>
          </div>
        </div>
        <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
          <ChevronsUpDown className="size-full" />
        </div>
      </>
    ) : (
      <ProfileAvatar
        size={32}
        rounded="md"
        src={profile.imageUrl}
        name={profile.name}
        initial={profile.initial}
        fallbackClassName={avatarBgClass}
        textClassName={isMobile ? "text-sm font-bold" : "text-base"}
        className="cursor-pointer"
        showBrokenIcon
      />
    )

  const triggerWrapper =
    isMobile ? (
      <button
        type="button"
        className="rounded-md p-1 border-0 bg-transparent cursor-pointer inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-w-[44px] min-h-[44px] touch-manipulation"
        aria-label="프로필 메뉴 열기"
        aria-expanded={open}
      >
        {triggerContent}
      </button>
    ) : isExpanded || variant === "collapsed" ? (
      <div
        className={cn(
          "flex items-center gap-2 p-2 cursor-pointer hover:bg-accent/50 rounded-md transition-colors",
          !isSidebarOpen && "justify-center p-0"
        )}
      >
        {triggerContent}
      </div>
    ) : (
      triggerContent
    )

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{triggerWrapper}</PopoverTrigger>
      <PopoverContent
        className="w-64 p-1 mx-2 z-[100]"
        align={isMobile ? "end" : "start"}
        side="bottom"
        sideOffset={8}
        collisionPadding={isMobile ? 12 : 8}
      >
        {/* User Info Section - 유저 정보 섹션 */}
        <div className="flex flex-col gap-1 px-1 py-1">
          <div className="flex gap-2 items-center px-2 py-1.5 rounded-sm">
            <ProfileAvatar
              size={40}
              rounded="lg"
              src={profile.imageUrl}
              name={profile.name}
              initial={profile.initial}
              fallbackClassName={avatarBgClass}
              textClassName="text-lg"
              showBrokenIcon
            />
            <div className="flex flex-col flex-1 min-w-0">
              <p className="text-lg font-bold text-popover-foreground truncate">{profile.name}</p>
            </div>
          </div>

          <div className="flex gap-2 items-center pl-2 py-1.5 rounded-sm">
            {authProviderIcons.length ? (
              <div className="flex gap-2 shrink-0">
                {authProviderIcons.map((item) => (
                  <span key={item.key} className="inline-flex items-center">
                    {item.node}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground truncate flex-1">{profile.email || "-"}</p>
          </div>
          <div className="flex gap-1 items-center px-2 py-1.5 rounded-sm">
            <div className="flex gap-1 items-center flex-wrap">
              {profileBadges.length ? (
                profileBadges.map((b) => (
                  <span
                    key={b.key}
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      PLAN_TIER_STYLES[b.tier]?.badge || PLAN_TIER_STYLES.free.badge
                    )}
                  >
                    {b.label}
                  </span>
                ))
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    PLAN_TIER_STYLES.free.badge
                  )}
                >
                  개인:{PLAN_TIER_LABELS.free}
                </span>
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
            onClick={onOpenSettings}
          >
            <Settings className="size-4 text-popover-foreground shrink-0" />
            <p className="text-sm text-popover-foreground flex-1">개인 설정</p>
          </button>
          <button
            type="button"
            className="flex w-full gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors text-left"
            onClick={onOpenPlan}
          >
            <BadgeDollarSign className="size-4 text-popover-foreground shrink-0" />
            <p className="text-sm text-popover-foreground flex-1">요금제</p>
          </button>
          <button
            type="button"
            className="flex w-full gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors text-left"
            onClick={onOpenBilling}
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
                      const current = languages.find((l) => l.code === currentLang)
                      return current?.flag_emoji || "🌐"
                    })()}
                  </span>
                  <p className="text-sm text-popover-foreground">
                    {(() => {
                      const current = languages.find((l) => l.code === currentLang)
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
                    onLanguageChange(lang.code)
                    if (typeof window !== "undefined") {
                      localStorage.setItem(languageStorageKey, lang.code)
                      window.dispatchEvent(new CustomEvent("reductai:language", { detail: { lang: lang.code } }))
                    }
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
            onClick={onLogout}
          >
            <LogOut className="size-4 text-popover-foreground shrink-0" />
            <p className="text-sm text-popover-foreground flex-1">Log out</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
