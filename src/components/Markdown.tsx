import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"

export type MarkdownProps = {
  markdown: string
  className?: string
}

/**
 * Safe Markdown renderer:
 * - react-markdown 기반
 * - HTML 렌더링 비활성(기본)
 * - rehype-sanitize로 추가 방어
 */
export function Markdown({ markdown, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown || ""}
      </ReactMarkdown>
    </div>
  )
}


