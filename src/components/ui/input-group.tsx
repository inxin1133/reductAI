import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const inputGroupVariants = cva(
  "inline-flex w-full items-center overflow-hidden rounded-md border border-input bg-background text-sm ring-offset-background transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
  {
    variants: {
      size: {
        default: "h-9",
        sm: "h-8",
        lg: "h-10",
      },
      variant: {
        default: "",
        error: "border-destructive focus-within:ring-destructive",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
)

export interface InputGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof inputGroupVariants> {}

function InputGroup({
  className,
  size,
  variant,
  ...props
}: InputGroupProps) {
  return (
    <div
      className={cn(inputGroupVariants({ size, variant }), className)}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        "h-full border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-center border-l border-input bg-muted px-3 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-full rounded-none border-l border-input",
        className
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
  inputGroupVariants,
}

