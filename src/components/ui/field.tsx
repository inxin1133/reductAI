import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const fieldVariants = cva("space-y-2")

export interface FieldProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof fieldVariants> {}

function Field({ className, ...props }: FieldProps) {
  return (
    <div
      className={cn(fieldVariants(), className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return <Label className={cn(className)} {...props} />
}

function FieldDescription({
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

function FieldError({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    />
  )
}

function FieldHint({
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

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldHint,
  fieldVariants,
}

