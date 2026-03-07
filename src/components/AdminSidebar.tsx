import { 
  ChevronDown, 
  ChevronsUpDown, 
  PanelLeftClose,
  Menu,
  X,
  User,
  Settings,
  Wallet,
  Sun,
  Moon,
  Monitor,
  Check,
  ChevronRight,
  LogOut
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { adminMenuGroups } from "@/config/adminMenu"
import { IconReduct } from "@/components/icons/IconReduct"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/hooks/useTheme"
import { adminFetch } from "@/lib/adminFetch"

type AdminSidebarProps = {
  className?: string
}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const ADMIN_SIDEBAR_OPEN_KEY = "reductai:adminSidebar:isOpen"
  const ADMIN_SIDEBAR_WIDTH_KEY = "reductai:adminSidebar:width"
  const SIDEBAR_MIN = 200
  const SIDEBAR_MAX = 400

  const getInitialIsOpen = () => {
    try {
      if (typeof window === "undefined") return true
      const v = window.localStorage.getItem(ADMIN_SIDEBAR_OPEN_KEY)
      if (v === "0") return false
      if (v === "1") return true
      return true
    } catch {
      return true
    }
  }

  const getInitialSidebarWidth = () => {
    try {
      if (typeof window === "undefined") return SIDEBAR_MIN
      const v = window.localStorage.getItem(ADMIN_SIDEBAR_WIDTH_KEY)
      const n = Number(v)
      if (Number.isFinite(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) return n
      return SIDEBAR_MIN
    } catch {
      return SIDEBAR_MIN
    }
  }

  // Persist the user's desktop admin sidebar open/closed preference across route changes and resizes.
  const [isOpen, setIsOpen] = useState<boolean>(() => getInitialIsOpen())
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => getInitialSidebarWidth())
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, width: sidebarWidth }
  }, [sidebarWidth])

  useEffect(() => {
    if (!isResizing) return
    const onMove = (e: MouseEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      const delta = e.clientX - start.x
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, start.width + delta))
      setSidebarWidth(next)
      resizeStartRef.current = { x: e.clientX, width: next }
    }
    const onUp = () => {
      const latestWidth = resizeStartRef.current?.width ?? sidebarWidth
      setIsResizing(false)
      resizeStartRef.current = null
      try {
        window.localStorage.setItem(ADMIN_SIDEBAR_WIDTH_KEY, String(latestWidth))
      } catch { /* ignore */ }
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizing, sidebarWidth])

  const navigate = useNavigate()
  const location = useLocation()
  const [isHeaderHover, setIsHeaderHover] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false)

  const { theme, themeMode, setThemeMode } = useTheme()

  // 서브메뉴 토글 상태 관리
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({})

  // 현재 경로에 따라 메뉴 자동 펼치기 및 하이라이트
  useEffect(() => {
    adminMenuGroups.forEach(group => {
      group.items.forEach(menu => {
        if (menu.items) {
          const hasActiveSubItem = menu.items.some(subItem => 
            subItem.href === location.pathname
          )
          if (hasActiveSubItem) {
            setExpandedMenus(prev => ({
              ...prev,
              [menu.title]: true
            }))
          }
        }
      })
    })
  }, [location.pathname])

  // 모바일 감지
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

  // Persist on desktop only (mobile uses a separate overlay UI).
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.innerWidth < 768) return
    try {
      window.localStorage.setItem(ADMIN_SIDEBAR_OPEN_KEY, isOpen ? "1" : "0")
    } catch {
      // ignore (storage might be blocked)
    }
  }, [isOpen])

  // Persist sidebar width on desktop (skip when mobile)
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return
    try {
      window.localStorage.setItem(ADMIN_SIDEBAR_WIDTH_KEY, String(sidebarWidth))
    } catch { /* ignore */ }
  }, [sidebarWidth])

  const [user, setUser] = useState(() => {
    const name = String(localStorage.getItem("user_name") || "").trim() || "관리자"
    const email = String(localStorage.getItem("user_email") || "").trim() || "-"
    const initial = (name || email || "A").trim().charAt(0) || "A"
    return {
      name,
      role: "관리자",
      initial,
      email,
    }
  })

  useEffect(() => {
    const id = String(localStorage.getItem("user_id") || "").trim()
    if (!id) return
    adminFetch(`/api/users/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as {
          email?: string | null
          full_name?: string | null
          role_name?: string | null
          role_slug?: string | null
        }
        const name = String(data.full_name || "").trim() || "관리자"
        const email = String(data.email || "").trim() || "-"
        const role =
          String(data.role_name || "").trim() ||
          String(data.role_slug || "").trim() ||
          "관리자"
        const initial = (name || email || "A").trim().charAt(0) || "A"
        setUser({ name, email, role, initial })
      })
      .catch(() => {
        // ignore fetch errors; fallback to localStorage
      })
  }, [])

  const handleLogout = () => {
    // 세션 및 토큰 정리
    localStorage.removeItem('token')
    localStorage.removeItem('token_expires_at')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_id')
    localStorage.removeItem('user_name')

    // 로그인 페이지로 이동
    navigate('/admin/login')
  }

  const toggleSubmenu = (title: string) => {
    if (!isOpen) setIsOpen(true)
    setExpandedMenus(prev => ({
      ...prev,
      [title]: !prev[title]
    }))
  }

  // 모바일에서는 메뉴 선택 후 자동으로 메뉴를 닫으며 해당 경로로 이동
  const handleNavigate = (href?: string) => {
    if (!href) return
    navigate(href)
    if (isMobile) setIsMobileMenuOpen(false)
  }

  const isActive = (href?: string) => {
    if (!href) return false
    if (href === "/admin" && location.pathname === "/admin") return true
    if (href !== "/admin" && location.pathname.startsWith(href)) return true
    return false
  }

  const isSubActive = (href?: string) => {
    return href === location.pathname
  }

  // Profile Popover Content (Shared) - 프로필 팝오버 콘텐츠 (공유)
  const ProfilePopoverContent = () => (
    <PopoverContent 
      className="w-64 p-1 mx-2 z-[100]" 
      align="start"
      side="bottom"
      sideOffset={8}
    >
      {/* User Info Section */}
      <div className="flex flex-col gap-1 px-1 py-1">
        <div className="flex gap-2 items-center px-2 py-1.5 rounded-sm">
          <div className="size-10 bg-teal-500 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-semibold text-lg">{user.initial}</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <p className="text-lg font-bold text-popover-foreground truncate">{user.name}</p>
          </div>
        </div>
        <div className="flex gap-1 items-center px-2 py-1.5 rounded-sm">
          <User className="size-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <div className="flex gap-1 items-center px-2 py-1.5 rounded-sm">
          <div className="flex gap-1 items-center flex-wrap">
            <Badge variant="outline" className="h-[22px] px-2.5 py-0.5 text-xs font-medium">
              {user.role}
            </Badge>
          </div>
        </div>
      </div>

      <Separator className="my-2" />

      {/* Settings Section */}
      <div className="flex flex-col gap-0 px-1">
        <div className="flex gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors">
          <Settings className="size-4 text-popover-foreground shrink-0" />
          <p className="text-sm text-popover-foreground flex-1">개인정보 관리</p>
        </div>
        <div className="flex gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors">
          <Wallet className="size-4 text-popover-foreground shrink-0" />
          <p className="text-sm text-popover-foreground flex-1">결제 관리</p>
        </div>
      </div>

      <Separator className="my-2" />

      {/* Theme & Language Section */}
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
        {/* <div className="flex gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors">
          <div className="flex gap-1 items-center flex-1">
            <span className="text-sm">🇰🇷</span>
            <p className="text-sm text-popover-foreground">한국어</p>
          </div>
          <ChevronRight className="size-4 text-popover-foreground shrink-0" />
        </div> */}
      </div>

      <Separator className="my-2" />

      {/* Logout Section */}
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
          <div className="flex items-center gap-1">
             <p className="font-black text-base leading-6 text-primary">reduct</p>
             <p className="font-normal text-base leading-6 text-primary">admin</p>
          </div>
        </div>
        
        {/* Mobile Profile Popover */}
        <Popover open={isMobileProfileOpen} onOpenChange={setIsMobileProfileOpen}>
          <PopoverTrigger asChild>
            <div className="size-8 bg-teal-500 rounded-md flex items-center justify-center shrink-0 cursor-pointer">
               <span className="text-white font-bold text-bsae">{user.initial}</span>
            </div>
          </PopoverTrigger>
          <ProfilePopoverContent />
        </Popover>
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
           
           {/* Mobile Menu Profile Popover */}
           <Popover open={isMobileProfileOpen} onOpenChange={setIsMobileProfileOpen}>
             <PopoverTrigger asChild>
               <div className="size-8 bg-teal-500 rounded-md flex items-center justify-center shrink-0 cursor-pointer">
                   <span className="text-white font-bold text-base">{user.initial}</span>
               </div>
             </PopoverTrigger>
             <ProfilePopoverContent />
           </Popover>
        </div>

        {/* 모바일 메뉴 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-2 bg-background">
          {/* 메뉴 아이템 */}
          {adminMenuGroups.map((group, groupIndex) => (
             <div key={groupIndex} className={cn("flex flex-col", groupIndex > 0 && "mt-4")}>
               {group.title !== "일반" && (
                  <div className="px-2 pb-1 opacity-70">
                    <p className="text-sm text-left font-medium text-sidebar-foreground">{group.title}</p>
                  </div>
               )}
               
               {group.items.map((menu, menuIndex) => (
                 <div key={menuIndex} className="flex flex-col gap-1">
                    <div 
                      className={cn(
                        "flex items-center gap-2 p-2 h-10 rounded-md cursor-pointer hover:bg-accent/50 transition-colors", 
                        isActive(menu.href) && "bg-accent text-accent-foreground font-medium"
                      )}
                      onClick={() => menu.items ? toggleSubmenu(menu.title) : handleNavigate(menu.href)}
                    >
                      <div className="size-5 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                        <menu.icon className="size-full" />
                      </div>
                      <span className="flex-1 text-base text-sidebar-foreground text-left">{menu.title}</span>
                      {menu.items && (
                        <ChevronDown className={cn("size-5 text-sidebar-foreground transition-transform", expandedMenus[menu.title] && "rotate-180")} />
                      )}
                    </div>
                    
                    {/* 서브메뉴 */}
                    {menu.items && expandedMenus[menu.title] && (
                      <div className="pl-9 pr-2 py-0.5 flex flex-col gap-1">
                        {menu.items.map((subItem, subIndex) => (
                          <div 
                            key={subIndex} 
                            className={cn(
                              "flex items-center h-9 px-2 rounded-md hover:bg-accent/50 cursor-pointer",
                              isSubActive(subItem.href) && "bg-accent text-accent-foreground font-medium"
                            )}
                            onClick={() => handleNavigate(subItem.href)}
                          >
                            <span className="text-base text-sidebar-foreground truncate">{subItem.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                 </div>
               ))}
             </div>
           ))}
        </div>
      </div>
    )
  }

  // 데스크탑 뷰
  return (
    <div 
      className={cn(
        "bg-sidebar border-r border-sidebar-border h-full flex flex-col shrink-0 hidden md:flex relative",
        !isResizing && "transition-[width] duration-300 ease-in-out",
        className
      )}
      style={{ width: isOpen ? sidebarWidth : 50 }}
    >
      {/* 리사이즈 핸들: 열린 상태에서만 오른쪽 가장자리 드래그 */}
      {isOpen && (
        <div
          role="separator"
          aria-orientation="vertical"
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10 flex items-center justify-center group"
          onMouseDown={handleResizeStart}
        >
          <div className="w-0.5 h-12 rounded-full bg-border group-hover:bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
      {/* 헤더 (로고 & 토글) */}
      <div className="flex flex-col gap-2 p-2 pt-3.5">
        <div className={cn("flex items-center h-8 px-2", isOpen ? "justify-between" : "justify-center")}>
           {isOpen && (
             <div className="flex items-center gap-1">
               <p className="font-black text-base leading-6 text-primary">reduct</p>
               <p className="font-normal text-base leading-6 text-primary">admin</p>
             </div>
           )}
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

      {/* 관리자 프로필 */}
      <div className={cn("p-2", !isOpen && "flex justify-center")}>
        <Popover open={isProfileOpen} onOpenChange={setIsProfileOpen}>
          <PopoverTrigger asChild>
            <div className={cn("flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer", !isOpen && "justify-center p-0")}>
              
              {isOpen ? (
                <>
                  <div className="size-10 bg-teal-500 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white font-semibold text-lg">{user.initial}</span>
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <p className="text-sm text-left font-semibold text-sidebar-foreground truncate">{user.name}</p>
                    <div className="flex items-center text-xs text-muted-foreground">
                       <span>{user.role}</span>
                    </div>
                  </div>
                  <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                      <ChevronsUpDown className="size-full" />
                  </div>
                </>
              ) : (
                <div className="size-8 bg-teal-500 rounded-md flex items-center justify-center shrink-0">
                  <span className="text-white font-semibold text-base">{user.initial}</span>
                </div>
              )}
            </div>
          </PopoverTrigger>
          <ProfilePopoverContent />
        </Popover>
      </div>

      {/* 메뉴 아이템 */}
      <div className="flex flex-col p-2 gap-1 overflow-y-auto flex-1">
         {adminMenuGroups.map((group, groupIndex) => (
           <div key={groupIndex} className={cn("flex flex-col", groupIndex > 0 && "mt-4")}>
             {isOpen && group.title !== "일반" && (
                <div className="px-2 pb-1 opacity-70">
                  <p className="text-xs text-left font-medium text-sidebar-foreground">{group.title}</p>
                </div>
             )}
             
             {group.items.map((menu, menuIndex) => (
               <div key={menuIndex} className="flex flex-col gap-1">
                  <div 
                    className={cn(
                      "flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50 transition-colors", 
                      !isOpen && "justify-center",
                      isActive(menu.href) && "bg-accent text-accent-foreground font-medium"
                    )}
                    onClick={() => menu.items ? toggleSubmenu(menu.title) : navigate(menu.href || '#')}
                  >
                    <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                      <menu.icon className="size-full" />
                    </div>
                    {isOpen && (
                      <>
                        <span className="flex-1 text-sm text-sidebar-foreground text-left">{menu.title}</span>
                        {menu.items && (
                          <ChevronDown className={cn("size-4 text-sidebar-foreground transition-transform", expandedMenus[menu.title] && "rotate-180")} />
                        )}
                      </>
                    )}
                  </div>
                  
                  {/* 서브메뉴 */}
                  {isOpen && menu.items && expandedMenus[menu.title] && (
                    <div className="px-2 py-0.5 border-l border-sidebar-border ml-3.5 flex flex-col gap-1 animate-in slide-in-from-top-1 duration-200">
                      {menu.items.map((subItem, subIndex) => (
                        <div 
                          key={subIndex} 
                          className={cn(
                            "flex items-center h-7 px-2 rounded-md hover:bg-accent cursor-pointer",
                            isSubActive(subItem.href) && "bg-accent text-accent-foreground font-medium"
                          )}
                          onClick={() => navigate(subItem.href || '#')}
                        >
                          <span className="text-sm text-sidebar-foreground truncate">{subItem.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
               </div>
             ))}
           </div>
         ))}
      </div>
    </div>
  )
}
