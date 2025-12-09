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
  Share2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

type SidebarProps = {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true)

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
        <div className={cn("flex items-center gap-2 p-2", !isOpen && "justify-center p-0")}>
          <div className="size-8 bg-teal-500 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-semibold text-sm">김</span>
          </div>
          {isOpen && (
            <>
              <div className="flex flex-col flex-1 min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">김가나</p>
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
                <span className="flex-1 text-xs text-sidebar-foreground">개인 페이지</span>
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
                <span className="flex-1 text-xs text-sidebar-foreground">팀/그룹 페이지</span>
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

