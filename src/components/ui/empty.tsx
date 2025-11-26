import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const emptyVariants = cva(
  "flex flex-col items-center justify-center rounded-lg border border-dashed",
  {
    variants: {
      size: {
        default: "p-8",
        sm: "p-6",
        lg: "p-12",
      },
      variant: {
        default: "bg-muted/50",
        outline: "bg-background",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
)

export interface EmptyProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyVariants> {}

function Empty({ className, size, variant, ...props }: EmptyProps) {
  return (
    <div
      className={cn(emptyVariants({ size, variant }), className)}
      {...props}
    />
  )
}

function EmptyHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col items-center text-center", className)}
      {...props}
    />
  )
}

function EmptyIcon({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-4 text-muted-foreground", className)}
      {...props}
    />
  )
}

function EmptyTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  )
}

function EmptyDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("mt-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function EmptyContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-6", className)}
      {...props}
    />
  )
}

function EmptyFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-6 flex items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyIcon,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyFooter,
  emptyVariants,
}

