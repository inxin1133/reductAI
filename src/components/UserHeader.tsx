import { useTheme } from "@/hooks/useTheme"
import { Eclipse } from "lucide-react"
import { cn } from "@/lib/utils"

interface UserHeaderProps {
  className?: string;
  children?: React.ReactNode;
  leftContent?: React.ReactNode;
}

export function UserHeader({ className, children, leftContent }: UserHeaderProps) {
  const { toggleTheme } = useTheme()

  return (
    <div className={cn("h-[60px] w-full flex items-center px-6 gap-4 shrink-0 border-b border-border/10", className)}>
       {/* Left Content (e.g., Sidebar Toggle) */}
       {leftContent}

       <div className="flex-1" />
       
       {/* Center/Custom Content (e.g., Language Selector, Action Buttons) */}
       {children}
       
       <div 
         className="size-4 relative shrink-0 flex items-center justify-center cursor-pointer"
         onClick={toggleTheme}
       >
         <Eclipse className="size-full text-foreground" />
       </div>
    </div>
  )
}
