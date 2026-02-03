import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import { defaultSchema } from "hast-util-sanitize"

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
  // Allow data: URIs for <img src> so generated images (base64 data URLs) can render.
  // Keep the rest of sanitize defaults intact.
  const sanitizeSchema = React.useMemo(() => {
    const ds = defaultSchema as any
    const protocols = ds?.protocols || {}
    const srcProtocols: string[] = Array.isArray(protocols.src) ? protocols.src : []
    return {
      ...ds,
      protocols: {
        ...protocols,
        src: Array.from(new Set([...srcProtocols, "data"])),
      },
    }
  }, [])

  const MarkdownImage = ({ src, alt, ...props }: { src?: string; alt?: string }) => {
    const [failed, setFailed] = React.useState(false)
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
    const s = typeof src === "string" ? src : ""
    const nextSrc =
      token && s.startsWith("/api/ai/media/assets/") ? `${s}${s.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : s

    if (!nextSrc || failed) {
      return (
        <div className="md-img-fallback" data-src={nextSrc || ""}>
          <span>{alt || "이미지를 불러올 수 없습니다."}</span>
        </div>
      )
    }

    // eslint-disable-next-line jsx-a11y/alt-text
    return <img src={nextSrc} alt={alt || "image"} onError={() => setFailed(true)} {...props} />
  }

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          img: ({ src, alt, ...props }) => <MarkdownImage src={typeof src === "string" ? src : ""} alt={alt || ""} {...props} />,
        }}
      >
        {markdown || ""}
      </ReactMarkdown>
    </div>
  )
}


