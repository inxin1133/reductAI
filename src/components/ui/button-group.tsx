import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const buttonGroupVariants = cva(
  "inline-flex items-center",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical: "flex-col",
      },
      variant: {
        default: "",
        outline: "",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
      variant: "default",
    },
  }
)

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof buttonGroupVariants> {}

function ButtonGroup({
  className,
  orientation,
  variant,
  ...props
}: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(buttonGroupVariants({ orientation, variant }), className)}
      {...props}
    />
  )
}

function ButtonGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        "rounded-none first:rounded-l-md last:rounded-r-md [&:not(:first-child)]:border-l-0 [&:not(:first-child)]:shadow-none",
        className
      )}
      {...props}
    />
  )
}

export { ButtonGroup, ButtonGroupItem, buttonGroupVariants }

