import type { ReactNode } from "react"

import { AdminHeader } from "@/components/AdminHeader"
import { cn } from "@/lib/utils"

type AdminPageProps = {
  headerContent?: ReactNode
  headerTitle?: string
  className?: string
  children: ReactNode
}

export function AdminPage({ headerContent, headerTitle, className, children }: AdminPageProps) {
  return (
    <div className={cn("space-y-4 bg-background", className)}>
      <AdminHeader title={headerTitle}>{headerContent}</AdminHeader>
      {children}
    </div>
  )
}
