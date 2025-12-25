import * as React from "react"
import { cn } from "@/lib/utils"

export type CodeBlockProps = {
  code: string
  language?: string
  className?: string
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  return (
    <div className={cn("w-full rounded-md border bg-muted/40 overflow-hidden", className)}>
      {language ? (
        <div className="px-3 py-1 text-xs text-muted-foreground border-b bg-muted/30 font-mono">{language}</div>
      ) : null}
      <pre className="p-3 overflow-x-auto text-sm leading-relaxed">
        <code className="font-mono">{code || ""}</code>
      </pre>
    </div>
  )
}


