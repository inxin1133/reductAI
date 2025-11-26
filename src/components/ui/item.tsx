import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const itemVariants = cva(
  "flex items-center gap-4 rounded-lg transition-colors",
  {
    variants: {
      variant: {
        default: "bg-background",
        outline: "border bg-background",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "p-4",
        sm: "p-3",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof itemVariants> {
  asChild?: boolean
}

function Item({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ItemProps) {
  const Comp = asChild ? Slot : "div"
  return (
    <Comp
      className={cn(itemVariants({ variant, size }), className)}
      {...props}
    />
  )
}

function ItemContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex-1 space-y-1", className)}
      {...props}
    />
  )
}

function ItemTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function ItemDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function ItemActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

function ItemIcon({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      {...props}
    />
  )
}

export {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemIcon,
  itemVariants,
}

