import { useTheme } from "@/hooks/useTheme"
import { Eclipse, ChevronDown } from "lucide-react"

export function UserHeader() {
  const { toggleTheme } = useTheme()

  return (
    <div className="h-[60px] flex items-center px-6 gap-4 shrink-0 border-b border-border/10">
       <div className="flex-1" />
       <div className="bg-background border border-border flex items-center justify-between px-3 py-2 rounded-md shadow-sm w-[120px] h-9">
          <span className="text-sm text-muted-foreground">한국어</span>
          <ChevronDown className="size-4 relative shrink-0" />
       </div>
       <div className="flex gap-[10px] items-center justify-end relative shrink-0">
          <ChevronDown className="size-full" />
       </div>
       <div 
         className="size-4 relative shrink-0 flex items-center justify-center cursor-pointer"
         onClick={toggleTheme}
       >
         <Eclipse className="size-full text-foreground" />
       </div>
    </div>
  )
}

