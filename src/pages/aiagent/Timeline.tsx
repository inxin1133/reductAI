import * as React from "react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
// (delete confirm removed; keep toast-only UX)
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Copy, Volume2, Repeat, ChevronsLeft, PencilLine, GalleryVerticalEnd, MoreHorizontal, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { handleSessionExpired, isSessionExpired, resetSessionExpiredGuard } from "@/lib/session"
import { ChatInterface } from "@/components/ChatInterface"
import { ProseMirrorViewer } from "@/components/post/ProseMirrorViewer"
import { aiJsonToPmDoc } from "@/components/post/aiBlocksToPmDoc"
import { parseMarkdownToPmDoc } from "@/editor/serializers/markdown"
import { editorSchema } from "@/editor/schema"
import { ProviderLogo } from "@/components/icons/providerLogoRegistry"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { useLocation, useNavigate } from "react-router-dom"


/**
 * Timeline Sidebar List Component
 * - 렌더링 최적화 및 재사용을 위해 분리
 */
function TimelineSidebarList({
  conversations,
  activeConversationId,
  ellipsis,
  showCreatingThread,
  onSelect,
  onRename,
  onDelete,
  onReorder,
  onMenuOpenChange,
  onRenameStart,
}: {
  conversations: TimelineConversation[]
  activeConversationId: string | null
  ellipsis: string
  showCreatingThread: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void | Promise<void>
  onDelete: (c: TimelineConversation) => void
  onReorder: (orderedIds: string[]) => void
  onMenuOpenChange?: (open: boolean) => void
  onRenameStart?: () => void
}) {
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportHeight, setViewportHeight] = React.useState(0)
  const ITEM_HEIGHT = 32
  const ITEM_GAP = 4
  const ITEM_PITCH = ITEM_HEIGHT + ITEM_GAP
  const HEADER_OFFSET = showCreatingThread ? ITEM_PITCH : 0
  const OVERSCAN = 6

  // Drag & Drop state
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = React.useState<{ id: string; position: "before" | "after" } | null>(null)
  const dragBlockClickUntilRef = React.useRef<number>(0)

  // Inline rename state (same UX as page/category trees)
  const [renameTargetId, setRenameTargetId] = React.useState<string>("")
  const [renameValue, setRenameValue] = React.useState("")
  const renameInputRef = React.useRef<HTMLInputElement | null>(null)
  const renameFocusUntilRef = React.useRef<number>(0)
  const suppressMenuAutoFocusRef = React.useRef(false)

  const startRename = (c: TimelineConversation) => {
    setRenameTargetId(c.id)
    setRenameValue(c.title || "")
    renameFocusUntilRef.current = Date.now() + 400
    suppressMenuAutoFocusRef.current = true
    onRenameStart?.()
    window.setTimeout(() => {
      const input = renameInputRef.current
      if (!input) return
      input.focus()
      const len = input.value.length
      input.setSelectionRange(len, len)
    }, 0)
  }

  const cancelRename = () => {
    setRenameTargetId("")
    setRenameValue("")
    onMenuOpenChange?.(false)
  }

  const commitRename = async () => {
    const id = String(renameTargetId || "").trim()
    const next = String(renameValue || "").trim()
    if (!id) return
    if (!next) {
      cancelRename()
      return
    }
    try {
      await onRename(id, next)
    } catch (e) {
      console.warn("[Timeline] inline rename failed:", e)
    } finally {
      cancelRename()
      onMenuOpenChange?.(false)
    }
  }

  const startDrag = (id: string, e: React.DragEvent<HTMLElement>) => {
    dragBlockClickUntilRef.current = Date.now() + 250
    setDraggingId(id)
    setDropIndicator(null)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
  }

  const endDrag = () => {
    setDraggingId(null)
    setDropIndicator(null)
  }

  React.useEffect(() => {
    const el = listRef.current
    if (!el) return
    const update = () => setViewportHeight(el.clientHeight)
    update()

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    }

    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const effectiveScrollTop = Math.max(0, scrollTop - HEADER_OFFSET)
  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / ITEM_PITCH) - OVERSCAN)
  const endIndex = Math.min(
    conversations.length,
    Math.ceil((effectiveScrollTop + viewportHeight) / ITEM_PITCH) + OVERSCAN
  )
  const visibleConversations = conversations.slice(startIndex, endIndex)
  const totalHeight = conversations.length * ITEM_PITCH

  return (
    <div
      ref={listRef}
      className="flex flex-col gap-1 w-full flex-1 overflow-y-auto"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      {showCreatingThread ? (
        <div className="flex items-center px-2 py-2 rounded-md w-full h-8 bg-accent/60">
          <span className="inline-block size-2 rounded-full bg-primary animate-pulse mr-2" />
          <p className="text-sm text-foreground truncate w-full animate-pulse">대화 생성 중{ellipsis}</p>
        </div>
      ) : null}
      {conversations.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">저장된 대화가 없습니다.</div>
      ) : (
        <div className="relative w-full" style={{ height: totalHeight }}>
          {visibleConversations.map((c, i) => {
            const index = startIndex + i
            const isDropTarget = dropIndicator?.id === c.id
            const dropPosition = isDropTarget ? dropIndicator?.position : null
            return (
              <div
                key={c.id}
                draggable={renameTargetId !== c.id}
                onDragStart={(e) => startDrag(c.id, e)}
                onDragEnd={endDrag}
                onDragOver={(e) => {
                  if (!draggingId || draggingId === c.id) return
                  e.preventDefault()
                  const rect = e.currentTarget.getBoundingClientRect()
                  const y = e.clientY - rect.top
                  setDropIndicator({ id: c.id, position: y < rect.height / 2 ? "before" : "after" })
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  setDropIndicator((prev) => (prev?.id === c.id ? null : prev))
                }}
                onDrop={(e) => {
                  if (!draggingId || draggingId === c.id) return
                  e.preventDefault()
                  const fromId = draggingId
                  const toId = c.id
                  const pos = dropIndicator?.position || "after"
                  const fromIdx = conversations.findIndex((x) => x.id === fromId)
                  const toIdx = conversations.findIndex((x) => x.id === toId)
                  if (fromIdx < 0 || toIdx < 0) return
                  const next = conversations.filter((x) => x.id !== fromId)
                  const insertAt = pos === "before" ? toIdx : toIdx + 1
                  const adjustedInsert = fromIdx < toIdx ? insertAt - 1 : insertAt
                  next.splice(adjustedInsert, 0, conversations[fromIdx])
                  onReorder(next.map((x) => x.id))
                  setDraggingId(null)
                  setDropIndicator(null)
                }}
                className={cn(
                  "group flex items-center px-2 py-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors w-full h-8 relative",
                  c.id === activeConversationId ? "bg-accent" : "",
                  draggingId === c.id ? "opacity-50" : ""
                )}
                style={{ position: "absolute", top: index * ITEM_PITCH, left: 0, right: 0 }}
                onClick={() => {
                  if (renameTargetId === c.id) return
                  if (Date.now() < dragBlockClickUntilRef.current) return
                  onSelect(c.id)
                }}
              >
                {isDropTarget && (
                  <div
                    className={cn(
                      "absolute left-0 right-0 h-0.5 bg-primary z-10",
                      dropPosition === "before" ? "top-0" : "bottom-0"
                    )}
                  />
                )}
                <div className="flex items-center gap-2 min-w-0 w-full">
                  {!c.isGenerating && c.hasUnread ? (
                    <span className="inline-block size-2 rounded-full bg-red-500 shrink-0" />
                  ) : null}
                  {renameTargetId === c.id ? (
                    <input
                      ref={renameInputRef}
                      className="min-w-0 w-full flex-1 bg-background outline-none rounded-sm px-1 py-0.5 text-sm border border-border"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === "Enter") {
                          e.preventDefault()
                          void commitRename()
                        } else if (e.key === "Escape") {
                          e.preventDefault()
                          cancelRename()
                        }
                      }}
                      onBlur={() => {
                        if (Date.now() < renameFocusUntilRef.current) {
                          window.setTimeout(() => {
                            renameInputRef.current?.focus()
                          }, 0)
                          return
                        }
                        void commitRename()
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-sm text-foreground truncate w-full" title={c.title || ""}>
                      {c.isGenerating ? `답변 작성중${ellipsis}` : c.title}
                    </p>
                  )}
                </div>
                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu onOpenChange={(open) => onMenuOpenChange?.(open)}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-4 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700"
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                      >
                        <MoreHorizontal className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="z-[200]"
                      onClick={(e) => e.stopPropagation()}
                      onCloseAutoFocus={(e) => {
                        if (suppressMenuAutoFocusRef.current) {
                          e.preventDefault()
                          suppressMenuAutoFocusRef.current = false
                          window.setTimeout(() => {
                            renameInputRef.current?.focus()
                          }, 0)
                        }
                      }}
                    >
                      <DropdownMenuItem onSelect={() => startRename(c)}>
                        이름 바꾸기
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(event) => {
                          event.preventDefault()
                          onDelete(c)
                        }}
                      >
                        휴지통으로 이동
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Timeline(대화 히스토리) 저장 정책
 * - ai-agent-service(DB) 기반으로 저장/조회합니다.
 * - 이유: 브라우저(localStorage)만 쓰면 기기/브라우저가 바뀌면 히스토리가 사라지고,
 *   특정 환경(스토리지 차단 등)에서는 저장 자체가 실패할 수 있습니다.
 * - 개발/데모 편의를 위해: 서버가 죽어있을 때만 localStorage fallback을 사용합니다.
 */

type ChatRole = "user" | "assistant" | "tool"

type MessageStatus = "none" | "in_progress" | "success" | "failed" | "stopped"

type TimelineMessage = {
  id: string
  role: ChatRole
  content: string
  contentJson?: unknown
  model?: string
  modelDisplayName?: string
  providerSlug?: string
  providerLogoKey?: string | null
  isPending?: boolean
  status?: MessageStatus
  createdAt: string // ISO
}

type TimelineConversation = {
  id: string
  title: string
  createdAt: string // ISO
  updatedAt: string // ISO (최근 대화 정렬 기준)
  lastMessageRole?: string | null
  lastMessageOrder?: number | null
  lastMessageCreatedAt?: string | null
  lastAssistantOrder?: number | null
  lastAssistantCreatedAt?: string | null
  isGenerating?: boolean
  hasUnread?: boolean
  messages: TimelineMessage[]
}

type TimelineUiMessage = {
  role: ChatRole
  id?: string
  content: string
  contentJson?: unknown
  model?: string
  modelDisplayName?: string
  providerSlug?: string
  providerLogoKey?: string | null
  isPending?: boolean
  status?: MessageStatus
  createdAt?: string // ISO
}

type TimelineNavState = {
  initial?: {
    requestId: string
    input: string
    providerSlug: string
    model: string
    modelType?: "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"
    options?: Record<string, unknown> | null
    attachments?: Array<Record<string, unknown>> | null
    sessionLanguage?: string | null
  }
}

const TIMELINE_API_BASE = "/api/ai/timeline"
const CHAT_UI_CONFIG_API = "/api/ai/chat-ui/config"

function parseJsonLikeString(input: string): Record<string, unknown> | null {
  let raw = String(input || "").trim()
  if (!raw) return null

  // If the whole thing is a JSON-stringified string, decode once.
  // e.g. "\"{\\\"title\\\":...}\""
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const decoded = JSON.parse(raw)
      if (typeof decoded === "string") raw = decoded.trim()
    } catch {
      // ignore
    }
  }

  if (raw.startsWith("```")) {
    const firstNl = raw.indexOf("\n")
    const lastFence = raw.lastIndexOf("```")
    if (firstNl > -1 && lastFence > firstNl) raw = raw.slice(firstNl + 1, lastFence).trim()
  }
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace > -1 && lastBrace > firstBrace) raw = raw.slice(firstBrace, lastBrace + 1)
  if (!raw.startsWith("{")) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // Some DB copy/export formats produce doubled quotes, like {""title"":""...""}
    if (raw.includes('""')) {
      try {
        const fixed = raw.replace(/""/g, '"')
        const parsed2: unknown = JSON.parse(fixed)
        if (parsed2 && typeof parsed2 === "object" && !Array.isArray(parsed2)) return parsed2 as Record<string, unknown>
      } catch {
        // ignore
      }
    }
    // Retry by escaping raw newlines/tabs inside quoted strings (common "JSON-ish" model outputs)
    try {
      let out = ""
      let inString = false
      let escaped = false
      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i]
        if (escaped) {
          out += ch
          escaped = false
          continue
        }
        if (ch === "\\") {
          out += ch
          escaped = true
          continue
        }
        if (ch === '"') {
          out += ch
          inString = !inString
          continue
        }
        if (inString) {
          if (ch === "\n") {
            out += "\\n"
            continue
          }
          if (ch === "\r") {
            out += "\\r"
            continue
          }
          if (ch === "\t") {
            out += "\\t"
            continue
          }
        }
        out += ch
      }
      const parsed3: unknown = JSON.parse(out)
      if (parsed3 && typeof parsed3 === "object" && !Array.isArray(parsed3)) return parsed3 as Record<string, unknown>
    } catch {
      // ignore
    }
  }
  return null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function normalizeContentJson(content: unknown): Record<string, unknown> | null {
  if (!content) return null
  if (typeof content === "string") {
    const parsed = parseJsonLikeString(content)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const text = typeof (parsed as { text?: unknown }).text === "string" ? String((parsed as { text?: unknown }).text) : ""
      const reply = typeof (parsed as { reply?: unknown }).reply === "string" ? String((parsed as { reply?: unknown }).reply) : ""
      const message = typeof (parsed as { message?: unknown }).message === "string" ? String((parsed as { message?: unknown }).message) : ""
      const blocks = Array.isArray((parsed as { blocks?: unknown }).blocks) ? ((parsed as { blocks?: unknown }).blocks as unknown[]) : null
      if (!blocks) {
        const seed = text || reply || message
        if (seed) return { ...parsed, blocks: [{ type: "markdown", markdown: seed }] }
      }
    }
    if (parsed) return parsed
    const extracted = extractMessageFromJsonishString(content)
    if (extracted) return { blocks: [{ type: "markdown", markdown: extracted }] }
    return null
  }
  if (typeof content === "object" && !Array.isArray(content)) {
    const obj = content as Record<string, unknown>
    const outText = typeof obj.output_text === "string" ? obj.output_text : ""
    const parsed = outText ? parseJsonLikeString(outText) : null
    let base = (parsed ?? obj) as Record<string, unknown>
    if (isRecord(obj.options) && !isRecord(base.options)) {
      base = { ...base, options: obj.options }
    }
    if (base && typeof base === "object" && !Array.isArray(base)) {
      const text = typeof (base as { text?: unknown }).text === "string" ? String((base as { text?: unknown }).text) : ""
      const reply = typeof (base as { reply?: unknown }).reply === "string" ? String((base as { reply?: unknown }).reply) : ""
      const message = typeof (base as { message?: unknown }).message === "string" ? String((base as { message?: unknown }).message) : ""
      const blocks = Array.isArray((base as { blocks?: unknown }).blocks) ? ((base as { blocks?: unknown }).blocks as unknown[]) : null
      if (!blocks) {
        const seed = text || reply || message
        if (seed) {
          return { ...base, blocks: [{ type: "markdown", markdown: seed }] }
        }
      }
    }
    return base
  }
  return null
}

function getAppliedOptionsSummary(content: unknown): string | null {
  const normalized = normalizeContentJson(content)
  if (!normalized) return null
  const raw = (normalized as { options?: unknown }).options
  if (!isRecord(raw)) return null
  const entries = Object.entries(raw)
    .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    .map(([k, v]) => ({ key: k, value: String(v) }))
  if (!entries.length) return null
  entries.sort((a, b) => a.key.localeCompare(b.key))
  const text = entries.map((e) => `${e.key}: ${e.value}`).join(", ")
  return text || null
}

function TimelineAttachmentThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false)
  const raw = String(src || "")

  const token = typeof window !== "undefined" ? window.localStorage.getItem("token") : null
  const nextSrc =
    token && raw.startsWith("/api/ai/media/assets/")
      ? `${raw}${raw.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
      : raw

  React.useEffect(() => {
    setFailed(false)
  }, [nextSrc])

  if (!nextSrc || failed) {
    return (
      <div className="h-20 w-20 rounded-md border border-dashed bg-muted/20 text-muted-foreground flex items-center justify-center text-[10px] leading-tight text-center px-1">
        이미지를 불러올 수 없습니다. <br /> (원본 삭제됨)
      </div>
    )
  }

  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      src={nextSrc}
      alt={alt || "attachment"}
      className="h-20 w-20 object-cover rounded-md border"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function looksLikeMarkdown(input: string): boolean {
  const s = String(input || "")
  if (!s.trim()) return false
  return /(^|\n)(#{1,6}\s)|(^|\n)\s*[-*+]\s|(\|.+\|)|(^|\n)---\s*$/.test(s)
}

function extractMessageFromJsonishString(input: string): string | null {
  const s = String(input || "")
  // very lightweight fallback: try to pull {"message":"..."} or {"reply":"..."} from JSON-ish output even if JSON.parse fails
  const m = s.match(/\\"?(message|reply)\\"?\s*:\s*\\"?([\s\S]*?)\\"?\s*(?:[},]|$)/)
  if (!m) return null
  const raw = m[2] || ""
  // unescape minimal sequences
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .trim()
}

function markdownToPmDoc(markdown: string) {
  try {
    const doc = parseMarkdownToPmDoc(editorSchema, markdown)
    return doc?.toJSON() as { type: "doc"; content: Array<Record<string, unknown>> } | null
  } catch {
    return null
  }
}

function extractTextFromJsonContent(content: unknown): string {
  if (typeof content === "string") {
    const parsed = parseJsonLikeString(content)
    if (parsed) return extractTextFromJsonContent(parsed)
    return content
  }
  if (!content || typeof content !== "object") return ""
  const c = content as Record<string, unknown>
  if (typeof c.text === "string") return c.text
  if (typeof c.output_text === "string") return c.output_text
  if (typeof c.input === "string") return c.input
  if (typeof c.message === "string") return c.message
  if (typeof c.reply === "string") return c.reply
  // block-json 형태(title/summary/blocks) 렌더링
  const title = typeof c.title === "string" ? c.title : ""
  const summary = typeof c.summary === "string" ? c.summary : ""
  const blocks = Array.isArray(c.blocks) ? (c.blocks as Array<Record<string, unknown>>) : []
  if (title || summary || blocks.length) {
    const out: string[] = []
    if (title) out.push(title)
    if (summary) out.push(summary)
    for (const b of blocks) {
      const t = typeof b.type === "string" ? b.type : ""
      if (t === "markdown") {
        const md = typeof b.markdown === "string" ? b.markdown : typeof b.content === "string" ? b.content : ""
        if (md) out.push(String(md))
      } else if (t === "code") {
        const lang = typeof b.language === "string" ? b.language : "plain"
        const code = typeof b.code === "string" ? b.code : typeof b.content === "string" ? b.content : ""
        if (code) out.push(`[code:${lang}]\n${code}`)
      } else if (t === "table") {
        const headers = Array.isArray(b.headers) ? (b.headers as unknown[]).map(String) : []
        const rows = Array.isArray(b.rows) ? (b.rows as unknown[]) : Array.isArray((b as { data?: unknown }).data) ? ((b as { data?: unknown }).data as unknown[]) : []
        out.push(
          `[table]\n${headers.join(" | ")}\n${rows
            .map((r) => (Array.isArray(r) ? (r as unknown[]).map(String).join(" | ") : ""))
            .join("\n")}`
        )
      }
    }
    return out.filter(Boolean).join("\n\n")
  }
  return ""
}

function sortByRecent(convs: TimelineConversation[]) {
  return [...convs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const map = new Map<string, T>()
  for (const it of items) {
    const id = String(it.id || "").trim()
    if (!id) continue
    map.set(id, it)
  }
  return Array.from(map.values())
}

function mergeThreadsPreserveOrder(prev: TimelineConversation[], refreshed: TimelineConversation[]) {
  const byId = new Map<string, TimelineConversation>()
  for (const c of refreshed) byId.set(String(c.id), c)

  const next: TimelineConversation[] = []
  const seen = new Set<string>()

  // Keep existing order
  for (const p of prev) {
    const id = String(p.id)
    const r = byId.get(id)
    if (r) {
      next.push({ ...p, ...r, messages: p.messages || [] })
      seen.add(id)
    } else {
      next.push(p)
      seen.add(id)
    }
  }

  // Prepend newly created threads (not seen before) to the top
  const newOnes: TimelineConversation[] = []
  for (const r of refreshed) {
    const id = String(r.id)
    if (!seen.has(id)) newOnes.push(r)
  }
  return [...newOnes, ...next]
}

function providerSlugToLogoKeyFallback(slug?: string | null): string | null {
  // Fallback only. Prefer provider_logo_key from the server.
  const s = String(slug || "").trim().toLowerCase()
  if (!s) return null
  if (s === "openai" || s.startsWith("openai-")) return "chatgpt"
  if (s === "anthropic" || s.startsWith("anthropic-")) return "claude"
  if (s === "google" || s.startsWith("google-")) return "gemini"
  return s
}

export default function Timeline() {
  const location = useLocation()
  const navigate = useNavigate()
  const TIMELINE_SIDEBAR_OPEN_KEY = "reductai:timeline:isSidebarOpen"
  const SIDEBAR_WIDTH_MIN = 220
  const SIDEBAR_WIDTH_MAX = 380
  const SIDEBAR_WIDTH_DEFAULT = 260

  const clampSidebarWidth = React.useCallback(
    (w: number) => Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, Math.round(w))),
    [SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX]
  )

  const getSidebarWidthStorageKey = React.useCallback(() => {
    try {
      const uid = String(window?.localStorage?.getItem("user_id") || "anon").trim() || "anon"
      return `reductai.timeline.sidebarWidth.v1:${uid}`
    } catch {
      return "reductai.timeline.sidebarWidth.v1:anon"
    }
  }, [])

  const readSidebarWidthFromStorage = React.useCallback(() => {
    try {
      if (typeof window === "undefined") return SIDEBAR_WIDTH_DEFAULT
      const key = getSidebarWidthStorageKey()
      const raw = window.localStorage.getItem(key)
      const n = raw ? Number(raw) : NaN
      if (!Number.isFinite(n)) return SIDEBAR_WIDTH_DEFAULT
      return clampSidebarWidth(n)
    } catch {
      return SIDEBAR_WIDTH_DEFAULT
    }
  }, [SIDEBAR_WIDTH_DEFAULT, clampSidebarWidth, getSidebarWidthStorageKey])

  const getInitialDesktopSidebarOpen = () => {
    try {
      if (typeof window === "undefined") return true
      const v = window.localStorage.getItem(TIMELINE_SIDEBAR_OPEN_KEY)
      if (v === "0") return false
      if (v === "1") return true
      return true
    } catch {
      return true
    }
  }

  // NOTE:
  // - Desktop: persist the user's preference (open/closed)
  // - Mobile: always start closed (overlay drawer), but never overwrite the desktop preference
  const [isSidebarOpen, setIsSidebarOpen] = React.useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return getInitialDesktopSidebarOpen()
    const mobile = window.matchMedia("(max-width: 767px)").matches
    return mobile ? false : getInitialDesktopSidebarOpen()
  })
  const [isMobile, setIsMobile] = React.useState(false)
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(() => readSidebarWidthFromStorage())
  const resizeStateRef = React.useRef<{ startX: number; startW: number; lastW: number; dragging: boolean }>({
    startX: 0,
    startW: SIDEBAR_WIDTH_DEFAULT,
    lastW: SIDEBAR_WIDTH_DEFAULT,
    dragging: false,
  })
  const [conversations, setConversations] = React.useState<TimelineConversation[]>([])
  const conversationsRef = React.useRef<TimelineConversation[]>([])
  const ORDER_STORAGE_KEY = "reductai.timeline.order.v1"
  const localGeneratingIdsRef = React.useRef<Set<string>>(new Set())
  const STOPPED_BY_CONV_KEY = "reductai.timeline.stoppedByConversationId.v1"
  const readStoppedByConversationFromStorage = React.useCallback((): Record<string, number> => {
    try {
      const raw = sessionStorage.getItem(STOPPED_BY_CONV_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const n = Number(v)
        if (Number.isFinite(n)) out[String(k)] = n
      }
      return out
    } catch {
      return {}
    }
  }, [])
  const writeStoppedByConversationToStorage = React.useCallback((next: Record<string, number>) => {
    try {
      const keys = Object.keys(next)
      if (!keys.length) sessionStorage.removeItem(STOPPED_BY_CONV_KEY)
      else sessionStorage.setItem(STOPPED_BY_CONV_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }, [])
  const stoppedByConversationRef = React.useRef<Record<string, number>>(readStoppedByConversationFromStorage())
  const pendingStopRef = React.useRef<{ at: number; text: string } | null>(null)
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<TimelineUiMessage[]>([])
  const lastSendConversationIdRef = React.useRef<string | null>(null)

  // Chat scroll anchoring (keep the viewport on the generating reply)
  const messagesScrollRef = React.useRef<HTMLDivElement | null>(null)
  const bottomAnchorRef = React.useRef<HTMLDivElement | null>(null)
  const isNearBottomRef = React.useRef(true)
  const forceScrollToBottomRef = React.useRef(false)
  const forceScrollToLatestAssistantTopRef = React.useRef(false)
  const assistantElByIdRef = React.useRef(new Map<string, HTMLDivElement>())

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "auto") => {
    bottomAnchorRef.current?.scrollIntoView({ block: "end", behavior })
  }, [])

  // Keep a ref to latest conversations to avoid over-broad effect dependencies.
  React.useEffect(() => {
    conversationsRef.current = conversations
    try {
      const ids = conversations.map((c) => String(c.id || "")).filter(Boolean)
      if (ids.length) sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids))
    } catch {
      // ignore
    }
  }, [conversations])

  const applySavedOrder = React.useCallback((items: TimelineConversation[]) => {
    if (!items.length) return items
    try {
      const raw = sessionStorage.getItem(ORDER_STORAGE_KEY)
      const saved = raw ? (JSON.parse(raw) as unknown) : null
      const order = Array.isArray(saved) ? saved.map((id) => String(id)) : []
      if (!order.length) return items
      const byId = new Map(items.map((c) => [String(c.id), c]))
      const ordered: TimelineConversation[] = []
      for (const id of order) {
        const row = byId.get(id)
        if (row) {
          ordered.push(row)
          byId.delete(id)
        }
      }
      // Keep any new conversations at the top (do not reorder existing ones).
      const remaining = Array.from(byId.values())
      return remaining.length ? [...remaining, ...ordered] : ordered
    } catch {
      return items
    }
  }, [])

  const applyLocalGeneratingOverride = React.useCallback((items: TimelineConversation[]) => {
    if (!items.length) return items
    const ids = localGeneratingIdsRef.current
    if (!ids.size) return items
    return items.map((c) => (ids.has(String(c.id)) ? { ...c, isGenerating: true } : c))
  }, [])

  const applyStoppedOverride = React.useCallback((items: TimelineConversation[]) => {
    const stopped = stoppedByConversationRef.current
    const keys = Object.keys(stopped || {})
    if (!items.length || !keys.length) return items
    return items.map((c) => (stopped[String(c.id)] ? { ...c, isGenerating: false } : c))
  }, [])

  const STOP_MESSAGE_TEXT = "사용자의 요청에 의해 요청 및 답변이 중지 되었습니다."
  const buildStopMessage = React.useCallback(
    (conversationId: string, stoppedAt: number): TimelineMessage => ({
      id: `stop_${String(conversationId)}_${stoppedAt}`,
      role: "assistant",
      content: STOP_MESSAGE_TEXT,
      contentJson: { text: STOP_MESSAGE_TEXT, stopped: true },
      providerLogoKey: null,
      createdAt: new Date(stoppedAt).toISOString(),
    }),
    [STOP_MESSAGE_TEXT]
  )

  const markConversationStopped = React.useCallback(
    (conversationId: string, stoppedAt: number) => {
      const id = String(conversationId || "").trim()
      if (!id) return
      stoppedByConversationRef.current = { ...stoppedByConversationRef.current, [id]: stoppedAt }
      writeStoppedByConversationToStorage(stoppedByConversationRef.current)
    },
    [writeStoppedByConversationToStorage]
  )

  const clearConversationStopped = React.useCallback(
    (conversationId: string) => {
      const id = String(conversationId || "").trim()
      if (!id) return
      if (!stoppedByConversationRef.current[id]) return
      const next = { ...stoppedByConversationRef.current }
      delete next[id]
      stoppedByConversationRef.current = next
      writeStoppedByConversationToStorage(next)
    },
    [writeStoppedByConversationToStorage]
  )

  const applyStopFilter = React.useCallback(
    (conversationId: string, items: TimelineMessage[]): TimelineMessage[] => {
      const id = String(conversationId || "").trim()
      if (!id) return items
      const stoppedAt = stoppedByConversationRef.current[id]
      if (!stoppedAt) return items
      const filtered = items.filter((m) => {
        const t = Date.parse(String(m.createdAt || ""))
        if (!Number.isFinite(t)) return true
        return t <= stoppedAt
      })
      return [...filtered, buildStopMessage(id, stoppedAt)]
    },
    [buildStopMessage]
  )

  // delete confirm UI removed (toast+undo only)

  // Save to Post modal state
  type CategoryOption = { id: string; name: string; icon?: string | null; categoryType?: "personal" | "team" }
  const [savePostModalOpen, setSavePostModalOpen] = React.useState(false)
  const [savePostCategories, setSavePostCategories] = React.useState<CategoryOption[]>([])
  const [savePostCategoryId, setSavePostCategoryId] = React.useState<string>("")
  const [savePostIncludeQuestions, setSavePostIncludeQuestions] = React.useState(true)
  const [savePostLoading, setSavePostLoading] = React.useState(false)
  const [savePostCategoriesLoading, setSavePostCategoriesLoading] = React.useState(false)

  // 현재 대화에서 마지막으로 사용한 모델을 유지하여 ChatInterface 드롭다운 초기값으로 사용합니다.
  const [stickySelectedModel, setStickySelectedModel] = React.useState<string | undefined>(undefined)
  const [stickySelectedProviderSlug, setStickySelectedProviderSlug] = React.useState<string | undefined>(undefined)

  const safeCssAttrValue = React.useCallback((v: string) => {
    // minimal escape for use in querySelector attribute selectors
    return String(v || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  }, [])

  const copyToClipboard = React.useCallback(async (text: string) => {
    const t = String(text || "")
    if (!t.trim()) {
      toast("복사할 내용이 없습니다.")
      return
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(t)
      } else {
        // Fallback for older browsers / restricted clipboard contexts
        const ta = document.createElement("textarea")
        ta.value = t
        ta.style.position = "fixed"
        ta.style.left = "-9999px"
        ta.style.top = "0"
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      toast("복사되었습니다.")
    } catch {
      toast("복사에 실패했습니다.")
    }
  }, [])

  const copyAssistantMessage = React.useCallback(
    async (m: TimelineUiMessage) => {
      // Prefer copying HTML (like drag-select copy) so pasting into ProseMirrorEditor preserves tables/headings.
      const fromJson = m.contentJson ? extractTextFromJsonContent(m.contentJson) : ""
      const fromText = typeof m.content === "string" ? m.content : String(m.content || "")
      const plain = String(fromJson || fromText || "").trim()

      // Try to grab rendered ProseMirrorViewer HTML for this message.
      let html = ""
      try {
        const root = document.querySelector(`[data-timeline-message-id="${safeCssAttrValue(String(m.id || ""))}"]`) as HTMLElement | null
        const viewer = root?.querySelector(".pm-viewer--timeline") as HTMLElement | null
        if (viewer) {
          // Use innerHTML to avoid copying the outer chrome.
          html = `<div>${viewer.innerHTML}</div>`
        }
      } catch {
        // ignore
      }

      try {
        const canWriteRich =
          typeof navigator !== "undefined" &&
          !!navigator.clipboard &&
          typeof (navigator.clipboard as unknown as { write?: unknown }).write === "function" &&
          typeof (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined"

        if (canWriteRich && html) {
          const ClipboardItemCtor = (globalThis as unknown as { ClipboardItem: typeof ClipboardItem }).ClipboardItem
          const item = new ClipboardItemCtor({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          })
          await (navigator.clipboard as unknown as { write: (items: ClipboardItem[]) => Promise<void> }).write([item])
          toast("복사되었습니다.")
          return
        }
      } catch {
        // fallback below
      }

      await copyToClipboard(plain)
    },
    [copyToClipboard, safeCssAttrValue]
  )
  const ACTIVE_CONV_KEY = "reductai.timeline.activeConversationId.v1"
  const [isCreatingThread, setIsCreatingThread] = React.useState(false)
  const [initialToSend, setInitialToSend] = React.useState<{
    requestId?: string
    input: string
    providerSlug: string
    model: string
    modelType?: "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"
    options?: Record<string, unknown> | null
    attachments?: Array<Record<string, unknown>> | null
    sessionLanguage?: string | null
  } | null>(null)

  const initial = (location.state as TimelineNavState | null)?.initial

  // Responsive behavior:
  // - Entering mobile: close the overlay UI, but DO NOT overwrite the user's desktop preference.
  // - Returning to desktop: restore the persisted desktop preference.
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(max-width: 767px)")

    const apply = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      if (mobile) {
        setIsSidebarOpen(false)
      } else {
        setIsSidebarOpen(getInitialDesktopSidebarOpen())
      }
    }

    apply()
    // Safari 구버전 호환
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply)
      return () => mq.removeEventListener("change", apply)
    }
    mq.addListener(apply)
    return () => mq.removeListener(apply)
  }, [])

  // Persist the desktop preference only (mobile uses overlay drawer UI).
  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (isMobile) return
    try {
      window.localStorage.setItem(TIMELINE_SIDEBAR_OPEN_KEY, isSidebarOpen ? "1" : "0")
    } catch {
      // ignore (storage might be blocked)
    }
  }, [isMobile, isSidebarOpen])

  // Keep the sidebar width stable per-user (desktop only).
  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (isMobile) return
    // In case user_id becomes available after initial render, re-sync once on desktop.
    const w = readSidebarWidthFromStorage()
    setSidebarWidth(w)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])

  const persistSidebarWidth = React.useCallback(
    (w: number) => {
      if (typeof window === "undefined") return
      if (isMobile) return
      try {
        const key = getSidebarWidthStorageKey()
        window.localStorage.setItem(key, String(clampSidebarWidth(w)))
      } catch {
        // ignore
      }
    },
    [clampSidebarWidth, getSidebarWidthStorageKey, isMobile]
  )

  const onSidebarResizePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isMobile) return
      e.preventDefault()
      e.stopPropagation()

      resizeStateRef.current = { startX: e.clientX, startW: sidebarWidth, lastW: sidebarWidth, dragging: true }

      const prevUserSelect = document.body.style.userSelect
      const prevCursor = document.body.style.cursor
      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"

      const onMove = (ev: PointerEvent) => {
        if (!resizeStateRef.current.dragging) return
        const dx = ev.clientX - resizeStateRef.current.startX
        const next = clampSidebarWidth(resizeStateRef.current.startW + dx)
        resizeStateRef.current.lastW = next
        setSidebarWidth(next)
      }

      const onUp = () => {
        resizeStateRef.current.dragging = false
        window.removeEventListener("pointermove", onMove)
        document.body.style.userSelect = prevUserSelect
        document.body.style.cursor = prevCursor
        persistSidebarWidth(resizeStateRef.current.lastW)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp, { once: true })
    },
    [clampSidebarWidth, isMobile, persistSidebarWidth, sidebarWidth]
  )

  // 보안: Timeline은 사용자별 히스토리를 다루므로 로그인(토큰)이 없으면 접근 불가
  React.useEffect(() => {
    if (isSessionExpired()) {
      handleSessionExpired(navigate)
      return
    }
    resetSessionExpiredGuard()
  }, [navigate])

  // Timeline API는 JWT에서 userId를 추출하므로, 클라이언트는 Authorization 헤더만 보내면 됩니다.
  const authHeaders = React.useCallback((): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  // Model display_name lookup (for showing ai_models.display_name instead of raw model_id)
  const modelDisplayNameByIdRef = React.useRef<Record<string, string>>({})
  React.useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(CHAT_UI_CONFIG_API, { headers: { ...authHeaders() } })
        if (!res.ok) return
        const json: unknown = await res.json().catch(() => null)
        const out: Record<string, string> = {}
        const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null
        const providersByType = obj && typeof obj.providers_by_type === "object" ? (obj.providers_by_type as Record<string, unknown>) : null
        if (providersByType) {
          for (const key of Object.keys(providersByType)) {
            const groups = Array.isArray(providersByType[key]) ? (providersByType[key] as unknown[]) : []
            for (const g of groups) {
              const rec = g && typeof g === "object" ? (g as Record<string, unknown>) : null
              const models = rec && Array.isArray(rec.models) ? (rec.models as unknown[]) : []
              for (const m of models) {
                const mr = m && typeof m === "object" ? (m as Record<string, unknown>) : null
                const id = mr && typeof mr.model_api_id === "string" ? String(mr.model_api_id).trim() : ""
                const dn = mr && typeof mr.display_name === "string" ? String(mr.display_name).trim() : ""
                if (id && dn) out[id] = dn
              }
            }
          }
        }
        modelDisplayNameByIdRef.current = out
      } catch {
        // ignore
      }
    }
    void run()
  }, [authHeaders])

  // Sidebar "답변 작성중..." ellipsis animation
  const [ellipsisPhase, setEllipsisPhase] = React.useState(0)
  const ellipsis = ellipsisPhase % 3 === 0 ? "." : ellipsisPhase % 3 === 1 ? ".." : "..."
  React.useEffect(() => {
    const anyGenerating = conversations.some((c) => Boolean(c.isGenerating))
    if (!anyGenerating) return
    const t = window.setInterval(() => setEllipsisPhase((p) => (p + 1) % 3), 700)
    return () => window.clearInterval(t)
  }, [conversations])

  const markThreadSeen = React.useCallback(
    async (threadId: string) => {
      const id = String(threadId || "").trim()
      if (!id) return
      try {
        await fetch(`${TIMELINE_API_BASE}/threads/${id}/seen`, { method: "POST", headers: { ...authHeaders() } })
      } catch {
        // ignore
      }
    },
    [authHeaders]
  )

  const fetchThreads = React.useCallback(async () => {
    const res = await fetch(`${TIMELINE_API_BASE}/threads`, { headers: { ...authHeaders() } })
    if (!res.ok) throw new Error("THREADS_FETCH_FAILED")
    const rows = (await res.json().catch(() => [])) as Array<{
      id: string
      title: string
      created_at: string
      updated_at: string
      last_message_role?: string | null
      last_message_order?: number | null
      last_message_created_at?: string | null
      last_assistant_order?: number | null
      last_assistant_created_at?: string | null
      has_unread?: boolean | null
      is_generating?: boolean | null
    }>
    const mapped = rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastMessageRole: r.last_message_role ?? null,
      lastMessageOrder: typeof r.last_message_order === "number" ? r.last_message_order : r.last_message_order ? Number(r.last_message_order) : null,
      lastMessageCreatedAt: r.last_message_created_at ?? null,
      lastAssistantOrder: typeof r.last_assistant_order === "number" ? r.last_assistant_order : r.last_assistant_order ? Number(r.last_assistant_order) : null,
      lastAssistantCreatedAt: r.last_assistant_created_at ?? null,
      isGenerating: Boolean(r.is_generating),
      hasUnread: Boolean(r.has_unread),
      messages: [],
    })) as TimelineConversation[]
    // Note: sortByRecent is used as fallback; DB now returns user_sort_order first
    return dedupeById(mapped)
  }, [authHeaders])

  const reorderThreads = React.useCallback(
    async (orderedIds: string[]) => {
      // Optimistic update
      setConversations((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]))
        return orderedIds.map((id) => byId.get(id)).filter(Boolean) as TimelineConversation[]
      })
      try {
        await fetch(`${TIMELINE_API_BASE}/threads/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ orderedIds }),
        })
      } catch {
        // Revert on error by refreshing
        const refreshed = await fetchThreads()
        setConversations(applyStoppedOverride(applyLocalGeneratingOverride(refreshed)))
      }
    },
    [applyLocalGeneratingOverride, applyStoppedOverride, authHeaders, fetchThreads]
  )

  const fetchMessages = React.useCallback(async (threadId: string) => {
    const res = await fetch(`${TIMELINE_API_BASE}/threads/${threadId}/messages`, { headers: { ...authHeaders() } })
    if (!res.ok) throw new Error("MESSAGES_FETCH_FAILED")
    const rows = (await res.json().catch(() => [])) as Array<{
      id: string
      role: ChatRole
      content: unknown
      summary?: string | null
      metadata?: Record<string, unknown> | null
      provider_logo_key?: string | null
      provider_slug_resolved?: string | null
      model_display_name?: string | null
      status?: MessageStatus | null
      created_at: string
      message_order?: number
    }>
    const mapped = rows.map((m) => {
      const normalized = normalizeContentJson(m.content)
      const modelApiId = typeof m.metadata?.model === "string" ? String(m.metadata.model) : ""
      const modelDisplayName =
        typeof m.model_display_name === "string" && m.model_display_name.trim()
          ? String(m.model_display_name)
          : modelApiId && modelDisplayNameByIdRef.current[modelApiId]
            ? modelDisplayNameByIdRef.current[modelApiId]
            : undefined
      const status = (m.status || undefined) as MessageStatus | undefined
      const contentText = extractTextFromJsonContent(normalized ?? m.content) || ""
      return {
      id: m.id,
      role: m.role,
      content: contentText,
      contentJson: normalized ?? m.content,
      model: modelApiId || undefined,
      modelDisplayName,
      providerSlug:
        typeof m.provider_slug_resolved === "string" && m.provider_slug_resolved.trim()
          ? m.provider_slug_resolved
          : typeof m.metadata?.provider_slug === "string"
            ? (m.metadata.provider_slug as string)
            : typeof m.metadata?.provider_key === "string"
              ? (m.metadata.provider_key as string)
              : undefined,
      providerLogoKey:
        typeof m.provider_logo_key === "string" && m.provider_logo_key.trim() ? m.provider_logo_key : null,
      status,
      isPending: status === "in_progress",
      createdAt: m.created_at,
      }
    }) as TimelineMessage[]
    const deduped = dedupeById(mapped)
    return applyStopFilter(threadId, deduped)
  }, [applyStopFilter, authHeaders])

  const renameThread = React.useCallback(
    async (id: string, title: string) => {
      const res = await fetch(`${TIMELINE_API_BASE}/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error("THREAD_RENAME_FAILED")
      const row = (await res.json().catch(() => null)) as { id?: string; title?: string } | null
      const nextTitle = typeof row?.title === "string" ? row.title : title
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: nextTitle } : c)))
    },
    [authHeaders]
  )

  const deleteThread = React.useCallback(
    async (id: string) => {
      const res = await fetch(`${TIMELINE_API_BASE}/threads/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      if (!res.ok) throw new Error("THREAD_DELETE_FAILED")

      // If active thread was deleted, switch to next most recent (after removal) or clear.
      let nextActive: string | null = null
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id)
        if (activeConversationId === id) {
          nextActive = next[0]?.id || null
        }
        return next
      })
      if (activeConversationId === id) {
        setMessages([])
        setStickySelectedModel(undefined)
        setStickySelectedProviderSlug(undefined)
        setActiveConversationId(nextActive)
        if (nextActive) {
          try {
            const msgs = await fetchMessages(nextActive)
            setMessages(
              msgs.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                contentJson: m.contentJson,
                model: m.model,
                providerSlug: m.providerSlug,
                providerLogoKey: m.providerLogoKey,
                status: m.status,
                isPending: m.status === "in_progress",
                createdAt: m.createdAt,
              }))
            )
            const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant")
            const lastAssistantModel = lastAssistant?.model
            const lastAnyModel = [...msgs].reverse().find((m) => m.model)?.model
            setStickySelectedModel(lastAssistantModel || lastAnyModel)
            const lastAssistantProvider = lastAssistant?.providerSlug
            const lastAnyProvider = [...msgs].reverse().find((m) => m.providerSlug)?.providerSlug
            setStickySelectedProviderSlug(lastAssistantProvider || lastAnyProvider || undefined)
          } catch {
            // ignore
          }
        }
      }

      try {
        const saved = sessionStorage.getItem(ACTIVE_CONV_KEY)
        if (saved === id) sessionStorage.removeItem(ACTIVE_CONV_KEY)
      } catch {
        // ignore
      }
    },
    [ACTIVE_CONV_KEY, activeConversationId, authHeaders, fetchMessages]
  )

  const restoreThread = React.useCallback(
    async (id: string) => {
      const res = await fetch(`${TIMELINE_API_BASE}/threads/${id}/restore`, {
        method: "POST",
        headers: { ...authHeaders() },
      })
      if (!res.ok) throw new Error("THREAD_RESTORE_FAILED")
      // refresh sidebar list (restored thread becomes active again in DB)
      try {
        const refreshed = sortByRecent(await fetchThreads())
        setConversations((prev) =>
          applyStoppedOverride(applyLocalGeneratingOverride(mergeThreadsPreserveOrder(prev, refreshed)))
        )
      } catch {
        // ignore
      }
    },
    [applyLocalGeneratingOverride, applyStoppedOverride, authHeaders, fetchThreads]
  )

  const trashThreadWithToast = React.useCallback(
    async (c: TimelineConversation) => {
      try {
        await deleteThread(c.id)
        toast("대화가 삭제되어 휴지통으로 이동되었습니다.", {
          action: {
            label: "undo",
            onClick: () => {
              void (async () => {
                try {
                  await restoreThread(c.id)
                } catch (e) {
                  console.warn("[Timeline] restore failed:", e)
                }
              })()
            },
          },
        })
      } catch (e) {
        console.warn("[Timeline] delete failed:", e)
      }
    },
    [deleteThread, restoreThread]
  )

  // If any conversation is in "generating" state (last message is user), keep the sidebar fresh.
  React.useEffect(() => {
    const anyGenerating = conversations.some((c) => Boolean(c.isGenerating))
    if (!anyGenerating) return
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const refreshed = applySavedOrder(await fetchThreads())
          setConversations((prev) =>
            applyStoppedOverride(applyLocalGeneratingOverride(mergeThreadsPreserveOrder(prev, refreshed)))
          )
        } catch {
          // ignore
        }
      })()
    }, 1500)
    return () => window.clearInterval(t)
  }, [applyLocalGeneratingOverride, applyStoppedOverride, applySavedOrder, conversations, fetchThreads])

  // 0) 최초 진입 시 "서버(DB)"에서 대화 목록을 로드하고, "가장 최근 대화"를 자동으로 선택합니다.
  React.useEffect(() => {
    const run = async () => {
      try {
        const loaded = applySavedOrder(await fetchThreads())
        setConversations(applyStoppedOverride(applyLocalGeneratingOverride(loaded)))

        // FrontAI에서 넘어온 initial이 없으면, 최근 대화를 자동으로 열어줍니다.
        if (!initial && loaded.length > 0) {
          let nextId = loaded[0].id
          try {
            const saved = sessionStorage.getItem(ACTIVE_CONV_KEY)
            if (saved && loaded.some((c) => c.id === saved)) nextId = saved
          } catch {
            // ignore
          }
          setActiveConversationId(nextId)
          const msgs = await fetchMessages(nextId)
          setMessages(
            msgs.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              contentJson: m.contentJson,
              model: m.model,
              providerSlug: m.providerSlug,
              providerLogoKey: m.providerLogoKey,
              status: m.status,
              isPending: m.status === "in_progress",
              createdAt: m.createdAt,
            }))
          )
          const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant")
          const lastAssistantModel = lastAssistant?.model
          const lastAnyModel = [...msgs].reverse().find((m) => m.model)?.model
          setStickySelectedModel(lastAssistantModel || lastAnyModel)
          const lastAssistantProvider = lastAssistant?.providerSlug
          const lastAnyProvider = [...msgs].reverse().find((m) => m.providerSlug)?.providerSlug
          setStickySelectedProviderSlug(lastAssistantProvider || lastAnyProvider || undefined)
        }
      } catch (e) {
        setConversations([])
        console.warn("[Timeline] threads API 실패:", e)
      }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySavedOrder])

  // FrontAI → Timeline initial payload는 1회만 consume해서 ChatInterface(autoSend)로 넘깁니다.
  React.useEffect(() => {
    if (!initial) return
    // dev(StrictMode)/리마운트에서도 중복 autoSend를 막기 위해 requestId로 1회만 consume
    const rid = String(initial.requestId || "").trim()
    if (rid) {
      const k = `reductai.timeline.initialConsumed.${rid}`
      try {
        if (sessionStorage.getItem(k) === "1") {
          // already consumed
          navigate(location.pathname, { replace: true, state: {} })
          return
        }
        sessionStorage.setItem(k, "1")
      } catch {
        // ignore storage issues
      }
    }

    setInitialToSend(initial)
    setIsCreatingThread(true)
    // state consume
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  // "답변중" 단계 텍스트(실제 chain-of-thought는 제공 불가하므로, 파이프라인 진행 상태를 UX로 제공합니다)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [genPhase, setGenPhase] = React.useState(0)
  const GENERATING_STEPS = React.useMemo(
    () => ["요청 분석 중", "안전 조정 중", "추론/생성 중", "답변 작성 중.", "답변 작성 중..", "답변 작성 중...", "추가 검토중", "답변 작성 중"],
    // () => ["요청 분석 중", "컨텍스트 불러오는 중", "모델 선택 중", "프롬프트 구성 중", "안전 조정 중", "추론/생성 중"],
    []
  )
  React.useEffect(() => {
    if (!isGenerating) return
    const t = window.setInterval(() => setGenPhase((p) => (p + 1) % GENERATING_STEPS.length), 3000)
    return () => window.clearInterval(t)
  }, [GENERATING_STEPS.length, isGenerating])

  // Auto-scroll:
  // - When the user sends a message: force jump to the generating reply.
  // - While generating: follow only if the user is already near the bottom.
  React.useEffect(() => {
    if (!messages.length) return
    if (!isGenerating && !forceScrollToBottomRef.current) return

    const shouldForce = forceScrollToBottomRef.current
    const shouldFollow = isGenerating && isNearBottomRef.current
    if (!shouldForce && !shouldFollow) return

    const raf = window.requestAnimationFrame(() => {
      scrollToBottom(shouldForce ? "auto" : "smooth")
      forceScrollToBottomRef.current = false
    })
    return () => window.cancelAnimationFrame(raf)
  }, [isGenerating, messages.length, scrollToBottom])

  // When user clicks an "unread" conversation: scroll to the TOP of the latest assistant reply (so they can read from start).
  React.useEffect(() => {
    if (!forceScrollToLatestAssistantTopRef.current) return
    if (!messages.length) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.isPending)
    if (!lastAssistant?.id) return
    const el = assistantElByIdRef.current.get(String(lastAssistant.id))
    if (!el) return
    const raf = window.requestAnimationFrame(() => {
      el.scrollIntoView({ block: "start", behavior: "auto" })
      forceScrollToLatestAssistantTopRef.current = false
    })
    return () => window.cancelAnimationFrame(raf)
  }, [messages])

  // 대화 선택 시 메시지/모델 동기화
  React.useEffect(() => {
    if (!activeConversationId) return
    const run = async () => {
      try {
        const msgs = await fetchMessages(activeConversationId)
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            contentJson: m.contentJson,
            model: m.model,
            modelDisplayName: m.modelDisplayName,
            providerSlug: m.providerSlug,
            providerLogoKey: m.providerLogoKey,
            status: m.status,
            isPending: m.status === "in_progress",
            createdAt: m.createdAt,
          }))
        )
        // Mark as seen in DB (unread indicator across devices).
        const target = conversationsRef.current.find((c) => c.id === activeConversationId)
        if (target?.hasUnread) {
          setConversations((prev) => prev.map((c) => (c.id === activeConversationId ? { ...c, hasUnread: false } : c)))
          void markThreadSeen(activeConversationId)
        }
        const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant")
        const lastAssistantModel = lastAssistant?.model
        const lastAnyModel = [...msgs].reverse().find((m) => m.model)?.model
        setStickySelectedModel(lastAssistantModel || lastAnyModel)
        const lastAssistantProvider = lastAssistant?.providerSlug
        const lastAnyProvider = [...msgs].reverse().find((m) => m.providerSlug)?.providerSlug
        setStickySelectedProviderSlug(lastAssistantProvider || lastAnyProvider || undefined)
      } catch {
        setMessages([])
      }
    }
    void run()
  }, [activeConversationId, fetchMessages, markThreadSeen])

  React.useEffect(() => {
    if (!activeConversationId) return
    try {
      sessionStorage.setItem(ACTIVE_CONV_KEY, activeConversationId)
    } catch {
      // ignore
    }
  }, [activeConversationId])

  // "읽음" 처리: 실제로 답변(assistant)이 화면에 들어온 순간에만 처리합니다.
  React.useEffect(() => {
    if (!activeConversationId) return
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return
    const active = conversations.find((c) => c.id === activeConversationId)
    if (!active?.hasUnread) return

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.isPending)
    const lastAssistantId = lastAssistant?.id ? String(lastAssistant.id) : ""
    if (!lastAssistantId) return
    const el = assistantElByIdRef.current.get(lastAssistantId)
    if (!el) return

    let done = false
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry || !entry.isIntersecting || done) return
        done = true
        setConversations((prev) => prev.map((c) => (c.id === activeConversationId ? { ...c, hasUnread: false } : c)))
        void markThreadSeen(activeConversationId)
        obs.disconnect()
      },
      { root: messagesScrollRef.current || null, threshold: 0.6 }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [activeConversationId, conversations, markThreadSeen, messages])

  // initial 질문/응답 생성은 ChatInterface(autoSend)가 /api/ai/chat/run(=DB-driven)을 통해 처리합니다.

  const initialSelectedModelForChat = initialToSend?.model || stickySelectedModel
  const initialProviderSlugForChat = initialToSend?.providerSlug || stickySelectedProviderSlug
  const initialModelTypeForChat = initialToSend?.modelType
  const initialOptionsForChat = initialToSend?.options || undefined
  const sessionLanguageForChat = initialToSend?.sessionLanguage || undefined

  // Load categories when modal opens (personal + team)
  const loadCategoriesForSavePost = React.useCallback(async () => {
    setSavePostCategoriesLoading(true)
    try {
      // Load personal categories
      const personalRes = await fetch("/api/posts/categories/mine", { headers: { ...authHeaders() } })
      const personalRows = personalRes.ok
        ? ((await personalRes.json().catch(() => [])) as Array<{ id: string; name: string; icon?: string | null }>)
        : []

      // Load team categories
      const teamRes = await fetch("/api/posts/categories/mine?type=team_page", { headers: { ...authHeaders() } })
      const teamRows = teamRes.ok
        ? ((await teamRes.json().catch(() => [])) as Array<{ id: string; name: string; icon?: string | null }>)
        : []

      // Combine with type indicator
      const combined: CategoryOption[] = [
        ...personalRows.map((c) => ({ ...c, categoryType: "personal" as const })),
        ...teamRows.map((c) => ({ ...c, categoryType: "team" as const })),
      ]

      setSavePostCategories(combined)
      if (combined.length && !savePostCategoryId) {
        setSavePostCategoryId(combined[0].id)
      }
    } catch {
      setSavePostCategories([])
    } finally {
      setSavePostCategoriesLoading(false)
    }
  }, [authHeaders, savePostCategoryId])

  React.useEffect(() => {
    if (savePostModalOpen) {
      void loadCategoriesForSavePost()
    }
  }, [savePostModalOpen, loadCategoriesForSavePost])

  // Build ProseMirror document from timeline messages
  const buildPmDocFromMessages = React.useCallback((msgs: TimelineUiMessage[], includeQuestions: boolean) => {
    const content: Array<Record<string, unknown>> = []

    // Filter out pending messages
    const validMsgs = msgs.filter((m) => !m.isPending)
    console.log("[Timeline] buildPmDocFromMessages: msgs count =", validMsgs.length, "includeQuestions =", includeQuestions)

    const hasMoreUserAfter = (fromIndex: number) => {
      for (let i = fromIndex + 1; i < validMsgs.length; i += 1) {
        if (validMsgs[i]?.role === "user") return true
      }
      return false
    }

    for (let idx = 0; idx < validMsgs.length; idx += 1) {
      const m = validMsgs[idx]
      if (m.role === "user" && !includeQuestions) continue

      if (m.role === "user") {
        // Preserve the user's original formatting as paragraph blocks.
        const questionText = String(m.content || "").trim()
        if (questionText) {
          const lines = questionText.split(/\r?\n/)
          let paragraphLines: string[] = []
          let listItems: string[] = []
          let inAttachmentSection = false
          let emojiInserted = false

          const flushParagraph = () => {
            if (!paragraphLines.length) return
            const inline: Array<Record<string, unknown>> = []
            paragraphLines.forEach((line, i) => {
              inline.push({ type: "text", text: line })
              if (i < paragraphLines.length - 1) inline.push({ type: "hard_break" })
            })
            content.push({ type: "paragraph", content: inline })
            paragraphLines = []
          }

          const flushList = () => {
            if (!listItems.length) return
            content.push({
              type: "bullet_list",
              content: listItems.map((item) => ({
                type: "list_item",
                content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
              })),
            })
            listItems = []
          }

          for (const raw of lines) {
            const line = raw.replace(/\s+$/g, "")
            const trimmed = line.trim()
            if (trimmed === "### 첨부") {
              flushParagraph()
              flushList()
              content.push({
                type: "heading",
                attrs: { level: 3 },
                content: [{ type: "text", text: "첨부" }],
              })
              inAttachmentSection = true
              continue
            }
            if (inAttachmentSection && trimmed.startsWith("- ")) {
              listItems.push(trimmed.slice(2).trim())
              continue
            }
            if (trimmed === "") {
              flushParagraph()
              if (inAttachmentSection) {
                flushList()
                inAttachmentSection = false
              }
              continue
            }
            if (inAttachmentSection && !trimmed.startsWith("- ")) {
              flushList()
              inAttachmentSection = false
            }
            if (!emojiInserted) {
              paragraphLines.push(`💬 ${line}`)
              emojiInserted = true
            } else {
              paragraphLines.push(line)
            }
          }
          flushParagraph()
          flushList()
        }
        // Add separator between question and answer
        content.push({ type: "horizontal_rule" })
        continue
      }

      if (m.role === "assistant") {
        console.log("[Timeline] assistant message:", { content: m.content?.slice(0, 100), contentJson: m.contentJson })

        // Try multiple approaches to extract content
        let added = false

        // Approach 1: Try contentJson with aiJsonToPmDoc
        if (m.contentJson) {
          const normalized = normalizeContentJson(m.contentJson)
          console.log("[Timeline] normalized contentJson:", normalized)
          if (normalized) {
            const pmDoc = aiJsonToPmDoc(normalized)
            console.log("[Timeline] aiJsonToPmDoc result:", pmDoc)
            if (pmDoc && typeof pmDoc === "object" && "content" in pmDoc) {
              const docContent = (pmDoc as { content: unknown }).content
              if (Array.isArray(docContent) && docContent.length > 0) {
                content.push(...(docContent as Array<Record<string, unknown>>))
                added = true
              }
            }
          }
        }

        // Approach 2: Try content string as markdown
        if (!added && typeof m.content === "string" && m.content.trim()) {
          const mdDoc = markdownToPmDoc(m.content)
          console.log("[Timeline] markdownToPmDoc result:", mdDoc)
          if (mdDoc && typeof mdDoc === "object" && "content" in mdDoc) {
            const docContent = (mdDoc as { content: unknown }).content
            if (Array.isArray(docContent) && docContent.length > 0) {
              content.push(...(docContent as Array<Record<string, unknown>>))
              added = true
            }
          }
        }

        // Approach 3: Plain text fallback
        if (!added && typeof m.content === "string" && m.content.trim()) {
          // Split by paragraphs
          const paragraphs = m.content.split(/\n\n+/).filter((p) => p.trim())
          for (const p of paragraphs) {
            content.push({
              type: "paragraph",
              content: [{ type: "text", text: p.trim() }],
            })
          }
          added = true
        }

        if (!added) {
          console.warn("[Timeline] Could not extract content from assistant message")
        }
        // Add separator between Q/A pairs (only when another user message exists)
        if (hasMoreUserAfter(idx)) {
          content.push({ type: "paragraph" })
          content.push({ type: "horizontal_rule" })
          content.push({ type: "paragraph" })
        }
        continue
      }
    }

    if (!content.length) {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: "(대화 내용이 없습니다)" }],
      })
    }

    console.log("[Timeline] Final PM doc content nodes:", content.length)
    return { type: "doc", content }
  }, [])

  // Save conversation as post
  const saveConversationAsPost = React.useCallback(async () => {
    if (!activeConversationId) {
      toast.error("저장할 대화를 선택해주세요.")
      return
    }

    setSavePostLoading(true)
    try {
      // Get conversation title
      const conv = conversations.find((c) => c.id === activeConversationId)
      const title = conv?.title || "AI 대화"

      // Build PM doc from messages
      const pmDoc = buildPmDocFromMessages(messages, savePostIncludeQuestions)
      console.log("[Timeline] saveConversationAsPost: pmDoc =", JSON.stringify(pmDoc, null, 2))

      // Normalize category_id (handle "__none__" as null)
      const effectiveCategoryId = savePostCategoryId === "__none__" ? null : savePostCategoryId || null

      // Step 1: Create post via API
      const createRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title,
          page_type: "page",
          status: "draft",
          visibility: "private",
          category_id: effectiveCategoryId,
        }),
      })

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => "")
        throw new Error(errText || "POST_CREATE_FAILED")
      }

      const createJson = await createRes.json().catch(() => ({}))
      const newPostId = String(createJson.id || "")
      if (!newPostId) throw new Error("POST_CREATE_FAILED_NO_ID")

      // Step 2: Save content via separate API
      const contentRes = await fetch(`/api/posts/${newPostId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          docJson: pmDoc,
          version: 0,
          pmSchemaVersion: 1,
        }),
      })

      if (!contentRes.ok) {
        const errText = await contentRes.text().catch(() => "")
        console.warn("[Timeline] savePostContent failed:", errText, "status:", contentRes.status)
        // Don't throw - the post was created, just navigate even if content save partially failed
      } else {
        const contentJson = await contentRes.json().catch(() => ({}))
        console.log("[Timeline] savePostContent success:", contentJson)
      }

      toast.success("페이지가 생성되었습니다.")
      setSavePostModalOpen(false)

      // Navigate to the created post
      const categoryParam = effectiveCategoryId ? `?category=${encodeURIComponent(effectiveCategoryId)}` : ""
      navigate(`/posts/${newPostId}/edit${categoryParam}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`페이지 생성 실패: ${msg}`)
    } finally {
      setSavePostLoading(false)
    }
  }, [activeConversationId, authHeaders, buildPmDocFromMessages, conversations, messages, navigate, savePostCategoryId, savePostIncludeQuestions])

  const STOP_TEXT = "사용자의 요청에 의해 요청 및 답변이 중지 되었습니다."
  const applyStopMessage = React.useCallback(
    (prev: TimelineUiMessage[], stopText: string) => {
      const next = [...prev]
      const idx = [...next].reverse().findIndex((m) => m.role === "assistant" && m.isPending)
      const realIdx = idx >= 0 ? next.length - 1 - idx : -1
      const row: TimelineUiMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: stopText,
        contentJson: { text: stopText, stopped: true },
        providerSlug: undefined,
        providerLogoKey: null,
        status: "stopped",
        isPending: false,
        createdAt: new Date().toISOString(),
      }
      if (realIdx >= 0) next[realIdx] = { ...next[realIdx], ...row }
      else next.push(row)
      return next
    },
    []
  )

  const handleStop = React.useCallback(() => {
    const stoppedAt = Date.now()
    setIsGenerating(false)
    setGenPhase(0)
    if (activeConversationId) {
      markConversationStopped(activeConversationId, stoppedAt)
      localGeneratingIdsRef.current.delete(String(activeConversationId))
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversationId ? { ...c, isGenerating: false } : c))
      )
      setMessages((prev) => applyStopMessage(prev, STOP_TEXT))
      return
    }
    pendingStopRef.current = { at: stoppedAt, text: STOP_TEXT }
    setIsCreatingThread(false)
    setMessages((prev) => applyStopMessage(prev, STOP_TEXT))
    if (initialToSend?.requestId) {
      void fetch("/api/ai/chat/run/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ request_id: initialToSend.requestId }),
      }).catch(() => null)
    }
  }, [STOP_TEXT, activeConversationId, applyStopMessage, authHeaders, initialToSend?.requestId, markConversationStopped])

  const [hoverCardOpen, setHoverCardOpen] = React.useState(false)
  const [hoverMenuOpen, setHoverMenuOpen] = React.useState(false)
  const [hoverRenameOpen, setHoverRenameOpen] = React.useState(false)

  return (
    <AppShell
      headerLeftContent={
        <div className="flex items-end">
          {isSidebarOpen ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 hover:bg-accent"
              onClick={() => setIsSidebarOpen(false)}
            >
              <ChevronsLeft className="size-4" />
            </Button>
          ) : isMobile ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 hover:bg-accent"
              onClick={() => setIsSidebarOpen(true)}
            >
              <GalleryVerticalEnd className="size-4" />
            </Button>
          ) : (
            <HoverCard
              openDelay={0}
              closeDelay={100}
              open={hoverCardOpen || hoverMenuOpen || hoverRenameOpen}
              onOpenChange={setHoverCardOpen}
            >
              <HoverCardTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 hover:bg-accent"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  <GalleryVerticalEnd className="size-4" />
                </Button>
              </HoverCardTrigger>
              <HoverCardContent side="right" align="start" className="w-[220px] h-[600px] pl-2 pr-1 flex flex-col">
                <TimelineSidebarList
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  ellipsis={ellipsis}
                  showCreatingThread={isCreatingThread}
                  onMenuOpenChange={setHoverMenuOpen}
                  onRenameStart={() => setHoverRenameOpen(true)}
                  onSelect={(id) => {
                    // unread인 대화를 클릭하면: 블릿 제거 + 답변 위치로 앵커 이동
                    const target = conversations.find((c) => c.id === id)
                    if (target?.hasUnread) {
                      forceScrollToLatestAssistantTopRef.current = true
                      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, hasUnread: false } : c)))
                      void markThreadSeen(id)
                    }
                    setActiveConversationId(id)
                    setIsSidebarOpen(true)
                  }}
                  onRename={(id, title) => void renameThread(id, title)}
                  onDelete={(c) => {
                    void trashThreadWithToast(c)
                  }}
                  onReorder={(orderedIds) => void reorderThreads(orderedIds)}
                />
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
      }
      headerContent={
        <div
          className="bg-background border border-border flex items-center justify-center gap-[6px] px-3 h-[32px] rounded-lg shadow-sm cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => {
            if (!activeConversationId || messages.length === 0) {
              toast("저장할 대화 내용이 없습니다.")
              return
            }
            setSavePostModalOpen(true)
          }}
        >
          <PencilLine className="size-4" />
          <span className="text-sm font-medium">페이지 저장 및 편집</span>
        </div>
      }
      leftPane={
        <>
          {/* Timeline Sidebar (Local) - 왼쪽 사이드바 대화목록 */}
          {isSidebarOpen && (
            <>
              {isMobile && (
                <div
                  className="fixed inset-0 top-[56px] z-50 bg-black/30"
                  onClick={() => setIsSidebarOpen(false)}
                />
              )}

              <div
                className={cn(
                  "border-r border-border h-full flex flex-col pl-2 pr-1 py-4 bg-background shrink-0 relative",
                  isMobile ? "fixed top-[56px] left-0 bottom-0 z-60 w-[240px] shadow-lg" : "min-w-[220px] max-w-[380px]"
                )}
                style={isMobile ? undefined : { width: sidebarWidth }}
              >
                <TimelineSidebarList
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  ellipsis={ellipsis}
                  showCreatingThread={isCreatingThread}
                  onMenuOpenChange={(open) => {
                    if (!open) return
                  }}
                  onRenameStart={() => setHoverRenameOpen(true)}
                  onSelect={(id) => {
                    const target = conversations.find((c) => c.id === id)
                    if (target?.hasUnread) {
                      forceScrollToLatestAssistantTopRef.current = true
                      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, hasUnread: false } : c)))
                      void markThreadSeen(id)
                    }
                    setActiveConversationId(id)
                    if (isMobile) setIsSidebarOpen(false)
                  }}
                  onRename={(id, title) => void renameThread(id, title)}
                  onDelete={(c) => {
                    void trashThreadWithToast(c)
                  }}
                  onReorder={(orderedIds) => void reorderThreads(orderedIds)}
                />

                {/* Resize handle (desktop only) */}
                {!isMobile ? (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                    onPointerDown={onSidebarResizePointerDown}
                    className={cn(
                      "absolute top-0 right-0 h-full w-1 cursor-col-resize",
                      "hover:bg-accent/60 active:bg-accent/80"
                    )}
                  />
                ) : null}
              </div>
            </>
          )}
        </>
      }
    >
      {/* Save to Post Dialog */}
      <Dialog open={savePostModalOpen} onOpenChange={setSavePostModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>페이지로 저장</DialogTitle>
            <DialogDescription>
              현재 대화 내용을 페이지로 저장합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {/* Category Selection */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">카테고리 선택</Label>
              <Select
                value={savePostCategoryId}
                onValueChange={setSavePostCategoryId}
                disabled={savePostCategoriesLoading}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={savePostCategoriesLoading ? "불러오는 중..." : "카테고리 선택"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">카테고리 없음</SelectItem>
                  {(() => {
                    const personalCats = savePostCategories.filter((c) => c.categoryType === "personal" || !c.categoryType)
                    const teamCats = savePostCategories.filter((c) => c.categoryType === "team")
                    return (
                      <>
                        {personalCats.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">나의 페이지</div>
                            {personalCats.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {teamCats.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1">팀 페이지</div>
                            {teamCats.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </>
                    )
                  })()}
                </SelectContent>
              </Select>
            </div>

            {/* Include Questions Checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-questions"
                checked={savePostIncludeQuestions}
                onCheckedChange={(checked) => setSavePostIncludeQuestions(checked === true)}
              />
              <Label htmlFor="include-questions" className="cursor-pointer">
                내 질문도 함께 저장
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSavePostModalOpen(false)}
              disabled={savePostLoading}
            >
              취소
            </Button>
            <Button
              onClick={() => void saveConversationAsPost()}
              disabled={savePostLoading}
            >
              {savePostLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  생성 중...
                </>
              ) : (
                "페이지 생성"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1 flex flex-col h-full relative w-full">
        {/* Chat Messages Scroll Area 사이드바 대화목록 구역 */}
        <div
          ref={messagesScrollRef}
          className="overflow-y-auto px-6 pb-6 pt-[84px] flex flex-col w-full gap-4 items-center h-full"
          onScroll={() => {
            const el = messagesScrollRef.current
            if (!el) return
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
            isNearBottomRef.current = distanceFromBottom < 140
          }}
        >
             {/* Messages - 메시지 */}
             <div className="w-full max-w-[800px] flex flex-col gap-6 ">
               {messages.length === 0 ? (
                 <div className="text-sm text-muted-foreground text-center py-10">
                   질문을 입력하면 이 영역에 답변이 표시됩니다.
                 </div>
               ) : (
                 messages.map((m, idx) => (
                   m.role === "user" ? (
                     <div key={m.id || `u_${idx}`} className="w-full flex justify-end">
                       <div className="flex items-end gap-2 lg:w-full">
                         <div className="flex lg:flex-row flex-col-reverse gap-4 w-full justify-end items-end lg:items-start">
                          <div className="bg-secondary p-3 rounded-lg max-w-[720px]">
                            {(() => {
                              const normalized = normalizeContentJson(m.contentJson)
                              type UserAttachment = {
                                kind?: string
                                url?: string
                                preview_url?: string
                                name?: string
                              }
                              const atts = (() => {
                                if (!normalized || typeof normalized !== "object") return [] as UserAttachment[]
                                const raw = (normalized as { attachments?: unknown }).attachments
                                if (!Array.isArray(raw)) return [] as UserAttachment[]
                                return raw as UserAttachment[]
                              })()
                              const images = atts.filter(
                                (a) =>
                                  a &&
                                  a.kind === "image" &&
                                  ((typeof a.url === "string" && a.url) || (typeof a.preview_url === "string" && a.preview_url))
                              )
                              if (!images.length) return null
                              return (
                                <div className="mb-2 flex flex-wrap gap-2 justify-end">
                                  {images.slice(0, 4).map((a, i) => (
                                    <TimelineAttachmentThumb
                                      key={`${m.id || idx}_att_${i}`}
                                      src={String(a.url || a.preview_url || "")}
                                      alt={typeof a.name === "string" ? a.name : "attachment"}
                                    />
                                  ))}
                                </div>
                              )
                            })()}
                            <p className="text-base text-primary whitespace-pre-wrap">{m.content}</p>
                          </div>
                           <div className="size-6 bg-teal-500 rounded-[4px] flex items-center justify-center shrink-0">
                             <span className="text-white text-sm font-bold">김</span>
                           </div>
                         </div>
                       </div>
                     </div>
                  ) : (
                    <div
                      key={m.id || `a_${idx}`}
                      ref={(el) => {
                        const id = m.id ? String(m.id) : ""
                        if (!id) return
                        if (m.isPending) return
                        if (m.role !== "assistant") return
                        if (el) assistantElByIdRef.current.set(id, el)
                        else assistantElByIdRef.current.delete(id)
                      }}
                      data-timeline-message-id={m.id ? String(m.id) : undefined}
                      className="w-full flex lg:flex-row flex-col justify-start gap-4"
                    >
                       <div className="size-6 bg-primary rounded-[4px] flex items-center justify-center shrink-0">
                        {(() => {
                          const logoKey = m.providerLogoKey || providerSlugToLogoKeyFallback(m.providerSlug)
                          return logoKey ? (
                            <ProviderLogo logoKey={logoKey} className="size-4 text-primary-foreground" />
                          ) : (
                            <span className="text-primary-foreground text-sm font-bold">AI</span>
                          )
                        })()}
                       </div>
                       <div className="flex flex-col gap-4 max-w-[720px] ">
                        <div className="text-base text-primary whitespace-pre-wrap space-y-3">
                          {(() => {
                            const optionsSummary = getAppliedOptionsSummary(m.contentJson)
                            if (!optionsSummary) return null
                            return (
                              <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-2 py-1 inline-block">
                                옵션: {optionsSummary}
                              </div>
                            )
                          })()}
                          {(() => {
                            // "답변중" 상태 표시 + 타입라이터 표시
                            if (m.isPending || m.status === "in_progress") {
                              const step = GENERATING_STEPS[genPhase] || "답변 생성 중"
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span className="inline-block size-2 rounded-full bg-primary animate-pulse" />
                                    <span>{step}...</span>
                                  </div>
                                  <div className="p-3 space-y-2 w-[300px]">
                                    <Skeleton className="h-4 w-[38%]" />
                                    <Skeleton className="h-4 w-[92%]" />
                                    <Skeleton className="h-4 w-[84%]" />
                                    <Skeleton className="h-4 w-[64%]" />
                                    <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-2 py-1 inline-block">
                                      🧑‍💻 답변 생성 중입니다. 이 페이지에서 기다리실 필요 없이, 원하시면 다른 메뉴로 이동해도 괜찮아요, 여러분의 시간은 소중하니 LLM 응답이 오면 바로 알려드릴께요.
                                    </div>
                                  </div>
                                </div>
                              )
                            }
                            const statusNotice =
                              m.status === "stopped"
                                ? "사용자의 요청에 의해 요청 및 답변이 중지 되었습니다."
                                : m.status === "failed"
                                  ? "응답 생성 실패. 잠시 후 다시 시도해 주세요."
                                  : ""

                            if (statusNotice) {
                              return <span className="text-sm text-muted-foreground">{statusNotice}</span>
                            }

                            const normalized = normalizeContentJson(m.contentJson)
                            if (normalized) {
                              const pmDoc = aiJsonToPmDoc(normalized)
                              if (pmDoc) {
                                return (
                                  <div className="space-y-3">
                                    <ProseMirrorViewer docJson={pmDoc} className="pm-viewer--timeline" viewerKey={m.id ? String(m.id) : undefined} />
                                  </div>
                                )
                              }
                            }
                            if (typeof m.content === "string") {
                              const parsedFromContent = parseJsonLikeString(m.content)
                              if (parsedFromContent) {
                                const pmDoc = aiJsonToPmDoc(parsedFromContent)
                                if (pmDoc) {
                                  return (
                                    <div className="space-y-3">
                                      <ProseMirrorViewer docJson={pmDoc} className="pm-viewer--timeline" viewerKey={m.id ? String(m.id) : undefined} />
                                    </div>
                                  )
                                }
                                const extracted = extractTextFromJsonContent(parsedFromContent)
                                if (extracted) {
                                  const pmDocFromExtracted = markdownToPmDoc(extracted)
                                  if (pmDocFromExtracted) {
                                    return (
                                      <div className="space-y-3">
                                        <ProseMirrorViewer docJson={pmDocFromExtracted} className="pm-viewer--timeline" viewerKey={m.id ? String(m.id) : undefined} />
                                      </div>
                                    )
                                  }
                                }
                              }
                            }
                            // Fallback: if the model returned JSON-ish {"message":"..."} (and parsing failed),
                            // render just the message as markdown so the UI never shows raw JSON.
                            if (typeof m.content === "string" && m.content.trim().startsWith("{")) {
                              const msgText = extractMessageFromJsonishString(m.content)
                              if (msgText) {
                                const pmDoc = markdownToPmDoc(msgText)
                                if (pmDoc) {
                                  return (
                                    <div className="space-y-3">
                                      <ProseMirrorViewer docJson={pmDoc} className="pm-viewer--timeline" viewerKey={m.id ? String(m.id) : undefined} />
                                    </div>
                                  )
                                }
                              }
                            }
                            if (typeof m.content === "string" && looksLikeMarkdown(m.content)) {
                              const pmDoc = markdownToPmDoc(m.content)
                              if (pmDoc) {
                                return (
                                  <div className="space-y-3">
                                    <ProseMirrorViewer docJson={pmDoc} className="pm-viewer--timeline" viewerKey={m.id ? String(m.id) : undefined} />
                                  </div>
                                )
                              }
                            }
                            return <>{m.content}</>
                          })()}
                        </div>
                         <div className="flex gap-3 items-center">
                           <Copy
                             className="size-4 cursor-pointer text-muted-foreground hover:text-foreground"
                             onClick={() => {
                               void copyAssistantMessage(m)
                             }}
                           />
                           <Volume2 className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                           <Repeat className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                          <span className="text-sm text-card-foreground">모델: {m.modelDisplayName || (m.model ? modelDisplayNameByIdRef.current[m.model] : "") || m.model || "-"}</span>
                         </div>
                       </div>
                     </div>
                   )
                 ))
               )}
             </div>

             {/* Anchor for scroll-to-bottom */}
             <div ref={bottomAnchorRef} />
        </div>

        {/* Bottom Panel 채팅창 */}
        <div className="p-4 pt-2 flex flex-col items-center gap-2 w-full">
          <ChatInterface
               variant="compact"
               // 대화 선택 시 마지막 모델을 초기값으로 반영합니다.
               initialSelectedModel={initialSelectedModelForChat}
              initialProviderSlug={initialProviderSlugForChat}
              initialModelType={initialModelTypeForChat}
              initialOptions={initialOptionsForChat}
              autoSendPrompt={initialToSend?.input || null}
              autoSendAttachments={initialToSend?.attachments || null}
              clientRequestId={initialToSend?.requestId || null}
              sessionLanguage={sessionLanguageForChat}
              conversationId={activeConversationId}
              notifyOnAssistantComplete
              onStop={handleStop}
              onConversationId={(id) => {
                setActiveConversationId(id)
                setIsCreatingThread(false)
                if (lastSendConversationIdRef.current === "__pending__") {
                  lastSendConversationIdRef.current = String(id || "")
                }
                // 첫 질문에서 신규 대화가 생성된 경우: 목록/메시지 즉시 동기화
                void (async () => {
                  try {
                    const refreshed = sortByRecent(await fetchThreads())
                    setConversations((prev) =>
                      applyStoppedOverride(applyLocalGeneratingOverride(mergeThreadsPreserveOrder(prev, refreshed)))
                    )
                    if (pendingStopRef.current) {
                      const { at: stoppedAt, text: stopText } = pendingStopRef.current
                      pendingStopRef.current = null
                      markConversationStopped(id, stoppedAt)
                      localGeneratingIdsRef.current.delete(String(id))
                      setIsGenerating(false)
                      setGenPhase(0)
                      setInitialToSend(null)
                      setIsCreatingThread(false)
                      setMessages((prev) => applyStopMessage(prev, stopText))
                      void fetch("/api/ai/chat/run/cancel", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...authHeaders() },
                        body: JSON.stringify({ conversation_id: id }),
                      }).catch(() => null)
                      return
                    }
                    const msgs = await fetchMessages(id)
                    setMessages(
                      msgs.map((m) => ({
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        contentJson: m.contentJson,
                        model: m.model,
                        providerSlug: m.providerSlug,
                        providerLogoKey: m.providerLogoKey,
                        status: m.status,
                        isPending: m.status === "in_progress",
                        createdAt: m.createdAt,
                      }))
                    )
                    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant")
                    const lastAssistantModel = lastAssistant?.model
                    const lastAnyModel = [...msgs].reverse().find((m) => m.model)?.model
                    setStickySelectedModel(lastAssistantModel || lastAnyModel)
                    const lastAssistantProvider = lastAssistant?.providerSlug
                    const lastAnyProvider = [...msgs].reverse().find((m) => m.providerSlug)?.providerSlug
                    setStickySelectedProviderSlug(lastAssistantProvider || lastAnyProvider || undefined)
                  } catch {
                    // ignore
                  } finally {
                    setInitialToSend(null)
                  }
                })()
              }}
               onMessage={(msg) => {
                // 1) 화면에 표시 + "답변중"/타입라이터 UX
                if (msg.role === "user") {
                  lastSendConversationIdRef.current = activeConversationId || "__pending__"
                  forceScrollToBottomRef.current = true
                  setIsGenerating(true)
                  setGenPhase(0)
                  pendingStopRef.current = null
                    const pendingId = `pending_${Date.now()}`
                  const userModelApiId = msg.model ? String(msg.model) : ""
                  const userModelDisplayName = userModelApiId ? modelDisplayNameByIdRef.current[userModelApiId] : ""
                  // Optimistic: mark this conversation as "generating" in the sidebar immediately.
                  if (activeConversationId) {
                    clearConversationStopped(activeConversationId)
                    localGeneratingIdsRef.current.add(String(activeConversationId))
                    setConversations((prev) =>
                      prev.map((c) => (c.id === activeConversationId ? { ...c, isGenerating: true } : c))
                    )
                  }
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `u_${Date.now()}`,
                      role: "user",
                      content: msg.content,
                      contentJson: msg.contentJson,
                      model: msg.model,
                      modelDisplayName: userModelDisplayName || undefined,
                      providerSlug: msg.providerSlug,
                      createdAt: new Date().toISOString(),
                    },
                    {
                      id: pendingId,
                      role: "assistant",
                      content: "",
                      providerSlug: msg.providerSlug,
                      model: msg.model,
                      modelDisplayName: userModelDisplayName || undefined,
                      providerLogoKey: null,
                      isPending: true,
                      status: "in_progress",
                      createdAt: new Date().toISOString(),
                    },
                  ])
                  return
                }

                if (msg.role === "assistant") {
                  const targetConversationId = lastSendConversationIdRef.current || activeConversationId
                  if (targetConversationId) {
                    localGeneratingIdsRef.current.delete(String(targetConversationId))
                    setConversations((prev) =>
                      prev.map((c) => (c.id === targetConversationId ? { ...c, isGenerating: false } : c))
                    )
                  }
                  if (
                    targetConversationId &&
                    targetConversationId !== activeConversationId &&
                    !(targetConversationId === "__pending__" && !activeConversationId)
                  ) {
                    lastSendConversationIdRef.current = null
                    return
                  }

                  setIsGenerating(false)

                  const normalized = normalizeContentJson(msg.contentJson ?? msg.content)
                  const isStopped =
                    (normalized && typeof (normalized as Record<string, unknown>).stopped === "boolean" && Boolean((normalized as Record<string, unknown>).stopped)) ||
                    String(msg.content || "") === "사용자의 요청에 의해 요청 및 답변이 중지 되었습니다."
                  let derivedText = extractTextFromJsonContent(normalized ?? msg.content) || String(msg.content || "")
                  if (typeof derivedText === "string" && derivedText.trim().startsWith("{")) {
                    const extracted = extractMessageFromJsonishString(derivedText)
                    if (extracted) derivedText = extracted
                  }
                  const aModelApiId = msg.model ? String(msg.model) : ""
                  const aModelDisplayName = aModelApiId ? modelDisplayNameByIdRef.current[aModelApiId] : ""
                  setMessages((prev) => {
                    const next = [...prev]
                    // If we receive the same assistant message twice (can happen in some edge flows),
                    // drop the duplicate to avoid double-render in the Timeline UI.
                    const lastAssistant = [...next].reverse().find((m) => m.role === "assistant" && !m.isPending)
                    if (lastAssistant && String(lastAssistant.content || "") === String(derivedText || "")) {
                      return next
                    }
                    const idx = [...next].reverse().findIndex((m) => m.role === "assistant" && m.isPending)
                    const realIdx = idx >= 0 ? next.length - 1 - idx : -1
                    const row = {
                      role: "assistant" as const,
                      content: derivedText,
                      contentJson: normalized ?? msg.contentJson,
                      model: msg.model,
                      modelDisplayName: aModelDisplayName || undefined,
                      providerSlug: msg.providerSlug,
                      providerLogoKey: null,
                      status: (isStopped ? "stopped" : "success") as MessageStatus,
                      createdAt: new Date().toISOString(),
                    }
                    if (realIdx >= 0) next[realIdx] = { ...next[realIdx], ...row, isPending: false }
                    else next.push({ id: `a_${Date.now()}`, ...row })
                    return next
                  })
                  lastSendConversationIdRef.current = null
                  if (msg.model) setStickySelectedModel(msg.model)
                  if (msg.providerSlug) setStickySelectedProviderSlug(msg.providerSlug)

                  // keep sidebar strictly in sync with model_conversations.updated_at ordering - 대화 목록 동기화
                  void (async () => {
                    try {
                      const refreshed = applySavedOrder(await fetchThreads())
                      setConversations((prev) =>
                        applyStoppedOverride(applyLocalGeneratingOverride(mergeThreadsPreserveOrder(prev, refreshed)))
                      )
                    } catch {
                      // ignore
                    }
                  })()
                  return
                }

                setMessages((prev) => [
                  ...prev,
                  {
                    id: `${msg.role}_${Date.now()}`,
                    role: msg.role,
                    content: msg.content,
                    contentJson: msg.contentJson,
                    model: msg.model,
                    providerSlug: msg.providerSlug,
                    providerLogoKey: null,
                    createdAt: new Date().toISOString(),
                  },
                ])
               }}
          />
        </div>
      </div>
    </AppShell>
  )
}

