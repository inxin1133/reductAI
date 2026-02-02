import * as React from "react"

import { Sidebar } from "@/components/Sidebar"
import { UserHeader } from "@/components/UserHeader"
import { cn } from "@/lib/utils"

type Props = {
  className?: string
  bodyClassName?: string
  leftPane?: React.ReactNode
  leftPaneClassName?: string
  headerLeftContent?: React.ReactNode
  headerContent?: React.ReactNode
  children: React.ReactNode
}

export function AppShell({
  className,
  bodyClassName,
  leftPane,
  leftPaneClassName,
  headerLeftContent,
  headerContent,
  children,
}: Props) {
  return (
    <div className={cn("bg-background w-full h-screen overflow-hidden flex font-sans", className)}>
      {/* Global Sidebar (GNB) */}
      <Sidebar />

      {/* App Content Area: [optional left pane] + [main column (header + body)] */}
      <div className="flex-1 flex flex-row h-full w-full bg-background relative pt-[56px] md:pt-0 overflow-hidden">
        {leftPane ? (
          <div className={cn("h-full shrink-0", leftPaneClassName)}>{leftPane}</div>
        ) : null}

        <div className="flex-1 flex flex-col h-full w-full overflow-hidden relative">
          <UserHeader
            className="absolute top-0 left-0 right-0 z-50"
            leftContent={headerLeftContent}
          >
            {headerContent}
          </UserHeader>
          <div className={cn("flex-1 h-full w-full overflow-hidden", bodyClassName)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}


