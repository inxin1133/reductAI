import { useTheme } from "@/hooks/useTheme"
import { Eclipse } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

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
       
       <Button         
         variant="ghost"
         className="size-8 shrink-0 hover:bg-accent"
         onClick={toggleTheme}
         aria-label="Toggle theme"
       >
         <Eclipse className="size-4 text-foreground" />
       </Button>
    </div>
  )
}
