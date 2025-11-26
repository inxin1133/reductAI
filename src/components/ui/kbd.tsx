import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const kbdVariants = cva(
  "pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100",
  {
    variants: {
      variant: {
        default: "border-border",
        outline: "border-border bg-background",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface KbdProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof kbdVariants> {}

function Kbd({ className, variant, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(kbdVariants({ variant }), className)}
      {...props}
    />
  )
}

function KbdGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup, kbdVariants }

