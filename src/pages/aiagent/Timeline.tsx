import * as React from "react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { Copy, Volume2, Repeat, ChevronsLeft, PencilLine, GalleryVerticalEnd } from "lucide-react"
import { cn } from "@/lib/utils"
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
  onSelect,
}: {
  conversations: TimelineConversation[]
  activeConversationId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {conversations.length === 0 ? (
        <div className="px-2 py-2 text-xs text-muted-foreground">저장된 대화가 없습니다.</div>
      ) : (
        conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "flex items-center px-2 py-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors w-full h-8",
              c.id === activeConversationId ? "bg-accent" : ""
            )}
            onClick={() => onSelect(c.id)}
          >
            <p className="text-sm text-foreground truncate w-full">{c.title}</p>
          </div>
        ))
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

type TimelineMessage = {
  id: string
  role: ChatRole
  content: string
  contentJson?: unknown
  model?: string
  providerSlug?: string
  providerLogoKey?: string | null
  isPending?: boolean
  createdAt: string // ISO
}

type TimelineConversation = {
  id: string
  title: string
  createdAt: string // ISO
  updatedAt: string // ISO (최근 대화 정렬 기준)
  messages: TimelineMessage[]
}

type TimelineUiMessage = {
  role: ChatRole
  id?: string
  content: string
  contentJson?: unknown
  model?: string
  providerSlug?: string
  providerLogoKey?: string | null
  isPending?: boolean
}

type TimelineNavState = {
  initial?: {
    requestId: string
    input: string
    providerSlug: string
    model: string
    modelType?: "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"
    options?: Record<string, unknown> | null
    sessionLanguage?: string | null
  }
}

const TIMELINE_API_BASE = "/api/ai/timeline"

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
    const base = parsed ?? obj
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
  const [conversations, setConversations] = React.useState<TimelineConversation[]>([])
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<TimelineUiMessage[]>([])

  // 현재 대화에서 마지막으로 사용한 모델을 유지하여 ChatInterface 드롭다운 초기값으로 사용합니다.
  const [stickySelectedModel, setStickySelectedModel] = React.useState<string | undefined>(undefined)
  const [stickySelectedProviderSlug, setStickySelectedProviderSlug] = React.useState<string | undefined>(undefined)
  const ACTIVE_CONV_KEY = "reductai.timeline.activeConversationId.v1"
  const [initialToSend, setInitialToSend] = React.useState<{
    input: string
    providerSlug: string
    model: string
    modelType?: "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"
    options?: Record<string, unknown> | null
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

  // 보안: Timeline은 사용자별 히스토리를 다루므로 로그인(토큰)이 없으면 접근 불가
  React.useEffect(() => {
    const token = localStorage.getItem("token")
    const expiresAt = Number(localStorage.getItem("token_expires_at") || 0)
    const isExpired = !expiresAt || Date.now() > expiresAt
    if (!token || isExpired) {
      localStorage.removeItem("token")
      localStorage.removeItem("token_expires_at")
      localStorage.removeItem("user_email")
      localStorage.removeItem("user_id")
      navigate("/", { replace: true })
    }
  }, [navigate])

  // Timeline API는 JWT에서 userId를 추출하므로, 클라이언트는 Authorization 헤더만 보내면 됩니다.
  const authHeaders = React.useCallback((): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const fetchThreads = React.useCallback(async () => {
    const res = await fetch(`${TIMELINE_API_BASE}/threads`, { headers: { ...authHeaders() } })
    if (!res.ok) throw new Error("THREADS_FETCH_FAILED")
    const rows = (await res.json().catch(() => [])) as Array<{
      id: string
      title: string
      created_at: string
      updated_at: string
    }>
    const mapped = rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messages: [],
    })) as TimelineConversation[]
    return sortByRecent(dedupeById(mapped))
  }, [authHeaders])

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
      created_at: string
      message_order?: number
    }>
    const mapped = rows.map((m) => {
      const normalized = normalizeContentJson(m.content)
      return {
      id: m.id,
      role: m.role,
      content: extractTextFromJsonContent(normalized ?? m.content) || "",
      contentJson: normalized ?? m.content,
      model: typeof m.metadata?.model === "string" ? (m.metadata.model as string) : undefined,
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
      createdAt: m.created_at,
      }
    }) as TimelineMessage[]
    return dedupeById(mapped)
  }, [authHeaders])

  // 0) 최초 진입 시 "서버(DB)"에서 대화 목록을 로드하고, "가장 최근 대화"를 자동으로 선택합니다.
  React.useEffect(() => {
    const run = async () => {
      try {
        const loaded = await fetchThreads()
        setConversations(loaded)

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
  }, [])

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
    // state consume
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  // "답변중" 단계 텍스트(실제 chain-of-thought는 제공 불가하므로, 파이프라인 진행 상태를 UX로 제공합니다)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [genPhase, setGenPhase] = React.useState(0)
  const GENERATING_STEPS = React.useMemo(
    () => ["요청 분석 중", "컨텍스트 불러오는 중", "모델 선택 중", "프롬프트 구성 중", "안전 조정 중", "추론/생성 중"],
    []
  )
  React.useEffect(() => {
    if (!isGenerating) return
    const t = window.setInterval(() => setGenPhase((p) => (p + 1) % GENERATING_STEPS.length), 900)
    return () => window.clearInterval(t)
  }, [GENERATING_STEPS.length, isGenerating])

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
            providerSlug: m.providerSlug,
            providerLogoKey: m.providerLogoKey,
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
        setMessages([])
      }
    }
    void run()
  }, [activeConversationId, fetchMessages])

  React.useEffect(() => {
    if (!activeConversationId) return
    try {
      sessionStorage.setItem(ACTIVE_CONV_KEY, activeConversationId)
    } catch {
      // ignore
    }
  }, [activeConversationId])

  // initial 질문/응답 생성은 ChatInterface(autoSend)가 /api/ai/chat/run(=DB-driven)을 통해 처리합니다.

  const initialSelectedModelForChat = initialToSend?.model || stickySelectedModel
  const initialProviderSlugForChat = initialToSend?.providerSlug || stickySelectedProviderSlug
  const initialModelTypeForChat = initialToSend?.modelType
  const initialOptionsForChat = initialToSend?.options || undefined
  const sessionLanguageForChat = initialToSend?.sessionLanguage || undefined

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
            <HoverCard openDelay={0} closeDelay={100}>
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
              <HoverCardContent side="right" align="start" className="w-[200px] p-2">
                <TimelineSidebarList
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelect={(id) => {
                    setActiveConversationId(id)
                    setIsSidebarOpen(true)
                  }}
                />
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
      }
      headerContent={
        <div className="bg-background border border-border flex items-center justify-center gap-[6px] px-3 h-[32px] rounded-lg shadow-sm cursor-pointer hover:bg-accent/50 transition-colors">
          <PencilLine className="size-4" />
          <span className="text-sm font-medium">페이지 저장 및 편집</span>
        </div>
      }
      leftPane={
        <>
          {/* Timeline Sidebar (Local) */}
          {isSidebarOpen && (
            <>
              {isMobile && (
                <div
                  className="fixed inset-0 top-[56px] z-30 bg-black/30"
                  onClick={() => setIsSidebarOpen(false)}
                />
              )}

              <div
                className={cn(
                  "border-r border-border h-full flex flex-col px-2 py-4 bg-background shrink-0",
                  isMobile ? "fixed top-[56px] left-0 bottom-0 z-40 w-[240px] shadow-lg" : "w-[200px]"
                )}
              >
                <TimelineSidebarList
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelect={(id) => {
                    setActiveConversationId(id)
                    if (isMobile) setIsSidebarOpen(false)
                  }}
                />
              </div>
            </>
          )}
        </>
      }
    >
      <div className="flex-1 flex flex-col h-full relative w-full">
        {/* Chat Messages Scroll Area */}
        <div className="overflow-y-auto p-6 flex flex-col w-full gap-4 items-center h-full">
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
                             <p className="text-base text-primary whitespace-pre-wrap">{m.content}</p>
                           </div>
                           <div className="size-6 bg-teal-500 rounded-[4px] flex items-center justify-center shrink-0">
                             <span className="text-white text-sm font-bold">김</span>
                           </div>
                         </div>
                       </div>
                     </div>
                   ) : (
                     <div key={m.id || `a_${idx}`} className="w-full flex lg:flex-row flex-col justify-start gap-4">
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
                       <div className="flex flex-col gap-4 max-w-[720px]">
                        <div className="text-base text-primary whitespace-pre-wrap space-y-3">
                          {(() => {
                            // "답변중" 상태 표시 + 타입라이터 표시
                            if (m.isPending) {
                              const step = GENERATING_STEPS[genPhase] || "답변 생성 중"
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span className="inline-block size-2 rounded-full bg-primary animate-pulse" />
                                    <span>{step}...</span>
                                  </div>
                                  <div className="text-base text-primary">
                                    <span className="opacity-70">답변을 작성하고 있습니다.</span>
                                  </div>
                                </div>
                              )
                            }

                            const normalized = normalizeContentJson(m.contentJson)
                            if (normalized) {
                              const pmDoc = aiJsonToPmDoc(normalized)
                              if (pmDoc) {
                                return (
                                  <div className="space-y-3">
                                    <ProseMirrorViewer docJson={pmDoc} className="pm-viewer--timeline" />
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
                                      <ProseMirrorViewer docJson={pmDoc} className="pm-viewer--timeline" />
                                    </div>
                                  )
                                }
                                const extracted = extractTextFromJsonContent(parsedFromContent)
                                if (extracted) {
                                  const pmDocFromExtracted = markdownToPmDoc(extracted)
                                  if (pmDocFromExtracted) {
                                    return (
                                      <div className="space-y-3">
                                        <ProseMirrorViewer docJson={pmDocFromExtracted} className="pm-viewer--timeline" />
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
                                      <ProseMirrorViewer docJson={pmDoc} className="pm-viewer--timeline" />
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
                                    <ProseMirrorViewer docJson={pmDoc} className="pm-viewer--timeline" />
                                  </div>
                                )
                              }
                            }
                            return <>{m.content}</>
                          })()}
                        </div>
                         <div className="flex gap-3 items-center">
                           <Copy className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                           <Volume2 className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                           <Repeat className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                           <span className="text-sm text-card-foreground">모델: {m.model || "-"}</span>
                         </div>
                       </div>
                     </div>
                   )
                 ))
               )}
             </div>

        </div>

        {/* Bottom Panel */}
        <div className="p-4 flex flex-col items-center gap-2 w-full">
          <ChatInterface
               variant="compact"
               // 대화 선택 시 마지막 모델을 초기값으로 반영합니다.
               initialSelectedModel={initialSelectedModelForChat}
              initialProviderSlug={initialProviderSlugForChat}
              initialModelType={initialModelTypeForChat}
              initialOptions={initialOptionsForChat}
              autoSendPrompt={initialToSend?.input || null}
              sessionLanguage={sessionLanguageForChat}
              conversationId={activeConversationId}
              onConversationId={(id) => {
                setActiveConversationId(id)
                // 첫 질문에서 신규 대화가 생성된 경우: 목록/메시지 즉시 동기화
                void (async () => {
                  try {
                    const refreshed = sortByRecent(await fetchThreads())
                    setConversations(refreshed)
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
                  setIsGenerating(true)
                  setGenPhase(0)
                    const pendingId = `pending_${Date.now()}`
                  setMessages((prev) => [
                    ...prev,
                    { id: `u_${Date.now()}`, role: "user", content: msg.content, contentJson: msg.contentJson, model: msg.model, providerSlug: msg.providerSlug },
                    {
                      id: pendingId,
                      role: "assistant",
                      content: "",
                      providerSlug: msg.providerSlug,
                      model: msg.model,
                      providerLogoKey: null,
                      isPending: true,
                    },
                  ])
                  return
                }

                if (msg.role === "assistant") {
                  setIsGenerating(false)
                  const normalized = normalizeContentJson(msg.contentJson ?? msg.content)
                  let derivedText = extractTextFromJsonContent(normalized ?? msg.content) || String(msg.content || "")
                  if (typeof derivedText === "string" && derivedText.trim().startsWith("{")) {
                    const extracted = extractMessageFromJsonishString(derivedText)
                    if (extracted) derivedText = extracted
                  }
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
                      providerSlug: msg.providerSlug,
                      providerLogoKey: null,
                    }
                    if (realIdx >= 0) next[realIdx] = { ...next[realIdx], ...row, isPending: false }
                    else next.push({ id: `a_${Date.now()}`, ...row })
                    return next
                  })
                  if (msg.model) setStickySelectedModel(msg.model)
                  if (msg.providerSlug) setStickySelectedProviderSlug(msg.providerSlug)

                  // keep sidebar strictly in sync with model_conversations.updated_at ordering - 대화 목록 동기화
                  void (async () => {
                    try {
                      const refreshed = await fetchThreads()
                      setConversations(refreshed)
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
                  },
                ])
               }}
          />
        </div>
      </div>
    </AppShell>
  )
}

