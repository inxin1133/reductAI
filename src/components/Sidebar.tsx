import { 
  Bot, 
  Clock, 
  Save, 
  Plus, 
  Trash2, 
  PieChart, 
  Settings, 
  PanelRightOpen, 
  ChevronsUpDown,
  PanelLeftClose,
  BookOpen,
  Share2,
  User,
  Wallet,
  Sun,
  Moon,
  ChevronRight,
  LogOut
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "@/hooks/useTheme"

type SidebarProps = {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const { theme } = useTheme()

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/')
  }

  return (
    <div 
      className={cn(
        "bg-sidebar border-r border-sidebar-border h-full flex flex-col shrink-0 transition-all duration-300 ease-in-out", 
        isOpen ? "w-[200px]" : "w-[50px]",
        className
      )}
    >
      {/* Header - 헤더 */}
      <div className="flex flex-col gap-2 p-2 pt-3.5">
        <div className={cn("flex items-center h-8 px-2", isOpen ? "justify-between" : "justify-center")}>
           {isOpen && <p className="font-black text-base leading-6 text-primary">reduct</p>}
           <div 
             className="size-4 cursor-pointer relative flex items-center justify-center text-sidebar-foreground"
             onClick={() => setIsOpen(!isOpen)}
           >
              {isOpen ? <PanelRightOpen className="size-full" /> : <PanelLeftClose className="size-full" />}
           </div>
        </div>
      </div>

      {/* User Profile - 유저 프로필 */}
      <div className="p-2">
        <Popover open={isProfileOpen} onOpenChange={setIsProfileOpen}>
          <PopoverTrigger asChild>
            <div className={cn("flex items-center gap-2 p-2 cursor-pointer hover:bg-accent/50 rounded-md transition-colors", !isOpen && "justify-center p-0")}>
              <div className="size-8 bg-teal-500 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-white font-semibold text-sm">김</span>
              </div>
              {isOpen && (
                <>
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
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent 
            className="w-64 p-1" 
            align={isOpen ? "start" : "center"}
            side="right"
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
        </Popover>
      </div>

      {/* Menu Items - 메뉴 아이템 */}
      <div className="flex flex-col p-2 gap-1">
         <div className={cn("flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer", !isOpen && "justify-center", "bg-accent")}>
           <div className="size-4 relative shrink-0 flex items-center justify-center text-sidebar-foreground">
             <Bot className="size-full" />
           </div>
           {isOpen && <span className="text-sm text-sidebar-foreground">프론트AI</span>}
         </div>
         <div className={cn("flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50", !isOpen && "justify-center")}>
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
          <div className="flex flex-col p-2 gap-1 mt-4">
             <div className="flex items-center gap-2 px-2 h-8 opacity-70">
                <span className="flex-1 text-left text-xs text-sidebar-foreground">개인 페이지</span>
                <div className="size-4 relative shrink-0 cursor-pointer flex items-center justify-center text-sidebar-foreground">
                    <Plus className="size-full" />
                </div>
             </div>
             <div className="flex items-center gap-2 p-2 h-8 rounded-md cursor-pointer hover:bg-accent/50">
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
          </div>

          {/* Team Pages - 팀 페이지 */}
          <div className="flex flex-col p-2 gap-1 mt-4">
             <div className="flex items-center gap-2 px-2 h-8 opacity-70">
                <span className="flex-1 text-left text-xs text-sidebar-foreground">팀/그룹 페이지</span>
                <div className="size-4 relative shrink-0 cursor-pointer flex items-center justify-center text-sidebar-foreground">
                    <Plus className="size-full" />
                </div>
             </div>
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

