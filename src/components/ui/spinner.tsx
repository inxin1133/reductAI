import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const spinnerVariants = cva(
  "animate-spin rounded-full border-2 border-current border-t-transparent",
  {
    variants: {
      size: {
        default: "size-4",
        sm: "size-3",
        lg: "size-6",
        xl: "size-8",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string
}

function Spinner({ className, size, label, ...props }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label || "Loading"}
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    >
      <div className={cn(spinnerVariants({ size }))} />
      {label && (
        <span className="sr-only ml-2 text-sm text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  )
}

export { Spinner, spinnerVariants }

