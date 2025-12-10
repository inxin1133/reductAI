import { useTheme } from "@/hooks/useTheme"
import { Eclipse } from "lucide-react"
import { useLocation } from "react-router-dom"
import { adminMenuGroups } from "@/config/adminMenu"
import { useEffect, useState } from "react"
import { useAdminHeaderActionContext } from "@/contexts/AdminHeaderActionContext"

export function AdminHeader() {
  const { toggleTheme } = useTheme()
  const location = useLocation()
  const [title, setTitle] = useState("Dashboard")
  const { action } = useAdminHeaderActionContext()

  useEffect(() => {
    let foundTitle = "Dashboard"
    
    // 경로에 맞는 타이틀 찾기
    for (const group of adminMenuGroups) {
      for (const menu of group.items) {
        if (menu.href === location.pathname) {
          foundTitle = menu.title
          break
        }
        if (menu.items) {
          const subItem = menu.items.find(item => item.href === location.pathname)
          if (subItem) {
            foundTitle = `${menu.title} > ${subItem.title}`
            break
          }
        }
      }
    }
    
    setTitle(foundTitle)
  }, [location.pathname])

  return (
    <div className="h-[60px] flex items-center justify-between px-6 shrink-0">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        {title.split(" > ").map((segment, idx, arr) => (
          <span key={segment} className="flex items-center gap-2">
            <span className={idx === arr.length - 1 ? "text-foreground font-semibold" : ""}>
              {segment}
            </span>
            {idx < arr.length - 1 && <span className="text-border">/</span>}
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-4">
        {action}
        <div 
          className="size-4 cursor-pointer relative flex items-center justify-center text-foreground"
          onClick={toggleTheme}
        >
           <Eclipse className="size-full" />
        </div>
      </div>
    </div>
  )
}
