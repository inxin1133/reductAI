import { 
  Bot, 
  Clock, 
  Save, 
  Plus, 
  Trash2, 
  PieChart, 
  Settings,   
  ChevronsUpDown,
  PanelLeftClose,
  BookOpen,
  Share2,
  User,
  Wallet,
  Sun,
  Moon,
  ChevronRight,
  LogOut,
  Menu,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "@/hooks/useTheme"
import { IconReduct } from "@/components/icons/IconReduct"

type SidebarProps = {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const SIDEBAR_OPEN_KEY = "reductai:sidebar:isOpen"
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

  // Persist the user's desktop sidebar open/closed preference across route changes and resizes.
  const [isOpen, setIsOpen] = useState<boolean>(() => getInitialIsOpen())
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isPersonalOpen, setIsPersonalOpen] = useState(true)
  const [isTeamOpen, setIsTeamOpen] = useState(true)
  const [isHeaderHover, setIsHeaderHover] = useState(false)
  
  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false)

  const { theme } = useTheme()

  // 현재 페이지에 따라 GNB 메뉴 활성화 표시를 결정
  const isFrontAIActive = location.pathname.startsWith("/front-ai")
  const isTimelineActive = location.pathname.startsWith("/timeline")

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

  const handleLogout = () => {
    // 세션/토큰 정리
    localStorage.removeItem('token')
    localStorage.removeItem('token_expires_at')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_id')
    // 로그인 페이지(인트로)로 이동
    navigate('/')
  }

  // 토큰이 없거나 만료된 경우 접근 차단
  const alertShownRef = useRef(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const expiresAt = Number(localStorage.getItem('token_expires_at') || 0)
    const isExpired = !expiresAt || Date.now() > expiresAt

    if (!token || isExpired) {
      if (!alertShownRef.current) {
        alertShownRef.current = true
        // 보안상 정리 후 경고 표시
        localStorage.removeItem('token')
        localStorage.removeItem('token_expires_at')
        localStorage.removeItem('user_email')
        localStorage.removeItem('user_id')
        alert('로그인이 필요합니다. 인트로(로그인) 페이지로 이동합니다.')
        navigate('/', { replace: true })
      }
      return
    }

    // 토큰이 정상인 경우 경고 상태 초기화
    alertShownRef.current = false
  }, [navigate])

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
          <div className="size-10 bg-teal-500 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-semibold text-lg">김</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <p className="text-lg font-bold text-popover-foreground truncate">김가나</p>
          </div>
        </div>
        <div className="flex gap-1 items-center px-2 py-1.5 rounded-sm">
          <User className="size-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground truncate">abc@naver.com</p>
        </div>
        <div className="flex gap-1 items-center px-2 py-1.5 rounded-sm">
          <div className="flex gap-1 items-center flex-wrap">
            <Badge variant="outline" className="h-[22px] px-2.5 py-0.5 text-xs font-medium">
              개인:Pro
            </Badge>
            <Badge variant="outline" className="h-[22px] px-2.5 py-0.5 text-xs font-medium">
              KIA:Premium
            </Badge>
          </div>
        </div>
      </div>

      <Separator className="my-2" />

      {/* Settings Section - 설정 섹션 */}
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

      {/* Theme & Language Section - 테마 및 언어 섹션 */}
      <div className="flex flex-col gap-0 px-1">
        <div className="flex gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors">
          <div className="flex gap-1 items-center flex-1">
            {theme === 'dark' ? <Moon className="size-4 text-popover-foreground shrink-0" /> : <Sun className="size-4 text-popover-foreground shrink-0" />}
            <p className="text-sm text-popover-foreground">Light</p>
          </div>
          <ChevronRight className="size-4 text-popover-foreground shrink-0" />
        </div>
        <div className="flex gap-2 h-8 items-center px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors">
          <div className="flex gap-1 items-center flex-1">
            <span className="text-sm">🇰🇷</span>
            <p className="text-sm text-popover-foreground">한국어</p>
          </div>
          <ChevronRight className="size-4 text-popover-foreground shrink-0" />
        </div>
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
            <div className="size-8 bg-teal-500 rounded-md flex items-center justify-center shrink-0 cursor-pointer">
               <span className="text-white font-bold text-sm">김</span>
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
           
           {/* Mobile Menu Profile Popover Trigger */}
           <Popover open={isMobileProfileOpen} onOpenChange={setIsMobileProfileOpen}>
             <PopoverTrigger asChild>
               <div className="size-8 bg-teal-500 rounded-md flex items-center justify-center shrink-0 cursor-pointer">
                   <span className="text-white font-bold text-sm">김</span>
               </div>
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
                 isFrontAIActive ? "bg-accent text-accent-foreground font-medium border border-border/10" : "hover:bg-accent/50"
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
                 isTimelineActive ? "bg-accent text-accent-foreground font-medium border border-border/10" : "hover:bg-accent/50"
               )}
               onClick={() => {
                 setIsMobileMenuOpen(false)
                 navigate('/timeline')
               }}
             >
               <div className="size-5 flex items-center justify-center"><Clock className="size-full" /></div>
               <span className="text-base text-foreground">타임라인</span>
             </div>
             <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer">
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
                 <Plus className="size-4" />
              </div>
              {isPersonalOpen && (
                <>
                  <div
                    className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50"
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      navigate("/posts")
                    }}
                  >
                     <BookOpen className="size-5" />
                     <span className="text-base text-foreground">나의 페이지</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer">
                     <Save className="size-5" />
                     <span className="text-base text-foreground">개인 파일</span>
                  </div>
                </>
              )}
           </div>

           {/* 팀/그룹 페이지 */}
           <div className="flex flex-col gap-1 mb-2">
              <div className="flex items-center justify-between px-2 h-8 opacity-70">
                 <span 
                   className="text-sm text-foreground cursor-pointer select-none"
                   onClick={() => setIsTeamOpen(prev => !prev)}
                 >
                   팀/그룹 페이지
                 </span>
                 <Plus className="size-4" />
              </div>
              {isTeamOpen && (
                <>
                  <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer">
                     <Share2 className="size-5" />
                     <span className="text-base text-foreground">공유 페이지</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer">
                     <Save className="size-5" />
                     <span className="text-base text-foreground">공유 파일</span>
                  </div>
                </>
              )}
           </div>

           {/* 관리 섹션 */}
           <div className="flex flex-col gap-1 mt-4">
              <div className="px-2 h-8 opacity-70 flex items-center"><span className="text-sm text-foreground">관리</span></div>
              <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer">
                 <Trash2 className="size-5" />
                 <span className="text-base text-foreground">휴지통</span>
              </div>
              <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer">
                 <PieChart className="size-5" />
                 <span className="text-base text-foreground">대시보드</span>
              </div>
              <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer">
                 <Settings className="size-5" />
                 <span className="text-base text-foreground">서비스</span>
              </div>
           </div>
        </div>
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
                   <div className="size-10 bg-teal-500 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white font-semibold text-lg">김</span>
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <p className="text-sm text-left font-semibold text-sidebar-foreground truncate">김가나</p>
                    <div className="flex items-center text-xs text-muted-foreground">
                       <span>Pro</span>
                       <span className="mx-1">・</span>
                       <span>Premium</span>
                    </div>
                  </div>
                  <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                      <ChevronsUpDown className="size-full" />
                  </div>
                </>
              ) : (
                <div className="size-8 bg-teal-500 rounded-md flex items-center justify-center shrink-0">
                  <span className="text-white font-semibold text-base">김</span>
                </div>
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
             isFrontAIActive ? "bg-accent" : "hover:bg-accent/50"
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
            isTimelineActive ? "bg-accent" : "hover:bg-accent/50"
          )}
          onClick={() => navigate('/timeline')}
         >
           <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
             <Clock className="size-full" />
           </div>
           {isOpen && <span className="text-sm text-sidebar-foreground">타임라인</span>}
         </div>
         <div className={cn("flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50", !isOpen && "justify-center")}>
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
             <div className="flex items-center gap-2 px-2 h-8 opacity-70 cursor-pointer select-none">
                <span className="flex-1 text-left text-xs text-sidebar-foreground" onClick={() => setIsPersonalOpen((prev) => !prev)}>개인 페이지</span>
                <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                    <Plus className="size-full" />
                </div>
             </div>
             {isPersonalOpen && (
               <>
                 <div
                   className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50"
                   onClick={() => navigate("/posts")}
                 >
                    <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                      <BookOpen className="size-full" />
                    </div>
                    <span className="text-sm text-sidebar-foreground">나의 페이지</span>
                 </div>
                 <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50">
                   <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                     <Save className="size-full" />
                   </div>
                   <span className="text-sm text-sidebar-foreground">개인 파일</span>
                 </div>
               </>
             )}
          </div>

          {/* Team Pages - 팀 페이지 */}
          <div className="flex flex-col p-2 gap-1">
             <div className="flex items-center gap-2 px-2 h-8 opacity-70 cursor-pointer select-none">
                <span className="flex-1 text-left text-xs text-sidebar-foreground" onClick={() => setIsTeamOpen((prev) => !prev)}>팀/그룹 페이지</span>
                <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                    <Plus className="size-full" />
                </div>
             </div>
             {isTeamOpen && (
               <>
                 <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50">
                    <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                      <Share2 className="size-full" />
                    </div>
                    <span className="text-sm text-sidebar-foreground">공유 페이지</span>
                 </div>
                 <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50">
                   <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
                     <Save className="size-full" />
                   </div>
                   <span className="text-sm text-sidebar-foreground">공유 파일</span>
                 </div>
               </>
             )}
          </div>
        </>
      ) : (
        // Collapsed Menu Icons for Pages
        <div className="flex flex-col p-2 gap-1">
           <div className="flex items-center justify-center h-8 rounded-md cursor-pointer hover:bg-accent/50">
             <BookOpen className="size-4 text-sidebar-foreground" />
           </div>
           <div className="flex items-center justify-center h-8 rounded-md cursor-pointer hover:bg-accent/50">
             <Share2 className="size-4 text-sidebar-foreground" />
           </div>
        </div>
      )}

       {/* Management - 관리 */}
       <div className="flex flex-col p-2 gap-1 mt-auto">
         {isOpen && (
           <div className="flex items-center gap-2 px-2 h-8 opacity-70">
              <span className="text-xs text-sidebar-foreground">관리</span>
           </div>
         )}
         <div className={cn("flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50", !isOpen && "justify-center")}>
           <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
             <Trash2 className="size-full" />
           </div>
           {isOpen && <span className="text-sm text-sidebar-foreground">휴지통</span>}
         </div>
         <div className={cn("flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50", !isOpen && "justify-center")}>
           <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
             <PieChart className="size-full" />
           </div>
           {isOpen && <span className="text-sm text-sidebar-foreground">대시보드</span>}
         </div>
         <div className={cn("flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50", !isOpen && "justify-center")}>
           <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
             <Settings className="size-full" />
           </div>
           {isOpen && <span className="text-sm text-sidebar-foreground">팀/그룹 관리</span>}
         </div>
      </div>
    </div>
  )
}
