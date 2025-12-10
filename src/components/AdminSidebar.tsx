import { 
  ChevronDown, 
  ChevronsUpDown, 
  PanelLeftClose,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { adminMenuGroups } from "@/config/adminMenu"

type AdminSidebarProps = {
  className?: string
}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const [isOpen, setIsOpen] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  
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

  // 임시 사용자 데이터
  const user = {
    name: "김가나",
    role: "관리자",
    initial: "김"
  }

  const toggleSubmenu = (title: string) => {
    if (!isOpen) setIsOpen(true)
    setExpandedMenus(prev => ({
      ...prev,
      [title]: !prev[title]
    }))
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

  return (
    <div 
      className={cn(
        "bg-sidebar border-r border-sidebar-border h-full flex flex-col shrink-0 transition-all duration-300 ease-in-out", 
        isOpen ? "w-[200px]" : "w-[50px]",
        className
      )}
    >
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
             className="size-4 cursor-pointer relative flex items-center justify-center text-sidebar-foreground"
             onClick={() => setIsOpen(!isOpen)}
           >
              <PanelLeftClose className={cn("size-full transition-transform", !isOpen && "rotate-180")} />
           </div>
        </div>
      </div>

      {/* 사용자 프로필 */}
      <div className={cn("p-2", !isOpen && "flex justify-center")}>
        <div className={cn("flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer", !isOpen && "justify-center p-0")}>
          <div className="size-10 bg-teal-500 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-semibold text-lg">{user.initial}</span>
          </div>
          {isOpen && (
            <>
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
          )}
        </div>
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
                    <div className="pl-6 pr-2 py-0.5 border-l border-sidebar-border ml-3.5 flex flex-col gap-1 animate-in slide-in-from-top-1 duration-200">
                      {menu.items.map((subItem, subIndex) => (
                        <div 
                          key={subIndex} 
                          className={cn(
                            "flex items-center h-7 px-2 rounded-md hover:bg-accent/50 cursor-pointer",
                            isSubActive(subItem.href) && "bg-accent/50 text-accent-foreground font-medium"
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
