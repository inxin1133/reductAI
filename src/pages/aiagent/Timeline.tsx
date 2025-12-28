import * as React from "react"
import { Sidebar } from "@/components/Sidebar"
import { UserHeader } from "@/components/UserHeader"
import { Button } from "@/components/ui/button"
import { Copy, Volume2, Repeat, ChevronsLeft, PencilLine, GalleryVerticalEnd } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChatInterface } from "@/components/ChatInterface"
import { Markdown } from "@/components/Markdown"
import { CodeBlock } from "@/components/CodeBlock"
import { BlockTable } from "@/components/BlockTable"
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
  createdAt: string // ISO
}

type TimelineConversation = {
  id: string
  title: string
  createdAt: string // ISO
  updatedAt: string // ISO (최근 대화 정렬 기준)
  messages: TimelineMessage[]
}

type TimelineNavState = {
  initial?: { input: string; providerSlug: string; model: string }
}

function nowIso() {
  return new Date().toISOString()
}

function safeUuid() {
  try {
    return crypto.randomUUID()
  } catch {
    return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`
  }
}

function makeAutoTitleFromPrompt(input: string) {
  // 제목 자동 생성 규칙(간단 버전)
  // - 첫 줄 기준
  // - 너무 길면 잘라서 ... 처리
  const firstLine = (input || "").split("\n")[0]?.trim() || "새 대화"
  const trimmed = firstLine.replace(/\s+/g, " ")
  // 요구사항: 15자 이내(한글 기준)
  const max = 15
  if (trimmed.length <= max) return trimmed
  // 15자 이내를 엄격히 지키기 위해 …를 붙이지 않습니다.
  return trimmed.slice(0, max)
}

const TIMELINE_API_BASE = "/api/ai/timeline"

function clampText(input: string, max: number) {
  const s = String(input || "").replace(/\s+/g, " ").trim()
  if (s.length <= max) return s
  return s.slice(0, max)
}

function userSummary(input: string) {
  // 규칙 1) user 메시지 → 그대로 요약, 50자 이내
  return clampText(input, 50)
}

function assistantSummary(input: string) {
  // 규칙 2) assistant 메시지 → 핵심 1문장, 100자 이내, 마침표 1개
  const cleaned = String(input || "").replace(/\s+/g, " ").trim()
  const withoutDots = cleaned.replace(/\./g, "")
  const head = clampText(withoutDots, 99)
  return head ? `${head}.` : "요약."
}

function extractTextFromJsonContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!content || typeof content !== "object") return ""
  const c = content as Record<string, unknown>
  if (typeof c.text === "string") return c.text
  if (typeof c.output_text === "string") return c.output_text
  if (typeof c.input === "string") return c.input
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
      if (t === "markdown" && typeof b.markdown === "string") {
        out.push(String(b.markdown))
      } else if (t === "code") {
        const lang = typeof b.language === "string" ? b.language : "plain"
        const code = typeof b.code === "string" ? b.code : ""
        out.push(`[code:${lang}]\n${code}`)
      } else if (t === "table") {
        const headers = Array.isArray(b.headers) ? (b.headers as unknown[]).map(String) : []
        const rows = Array.isArray(b.rows) ? (b.rows as unknown[]) : []
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

function storageKeyForUser() {
  // "접속한 계정" 기준 분리 저장
  const userId = localStorage.getItem("user_id") || "anon"
  return `timeline_conversations_v1:${userId}`
}

function loadConversations(): TimelineConversation[] {
  const raw = localStorage.getItem(storageKeyForUser())
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as TimelineConversation[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function saveConversations(next: TimelineConversation[]) {
  localStorage.setItem(storageKeyForUser(), JSON.stringify(next))
}

function sortByRecent(convs: TimelineConversation[]) {
  return [...convs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function formatInstructionForChatTab(userPrompt: string) {
  // ChatInterface와 동일한 규칙(초기 메시지도 동일 포맷으로 받기 위함)
  const schema = [
    "{",
    '  "title": "string",',
    '  "summary": "string",',
    '  "blocks": [',
    '    { "type": "markdown", "markdown": "## 제목\\n- 항목" },',
    '    { "type": "code", "language": "java", "code": "System.out.println(\\"hi\\");" },',
    '    { "type": "table", "headers": ["컬럼1","컬럼2"], "rows": [["A","B"],["C","D"]] }',
    "  ]",
    "}",
  ].join("\n")

  const rules = [
    "너는 이제부터 아래 스키마의 JSON 객체만 출력해야 한다.",
    "JSON 외의 어떤 텍스트도 출력하지 마라.",
    "출력은 반드시 '{' 로 시작하고 '}' 로 끝나는 단일 JSON이어야 한다.",
    "출력에 백틱(`) 또는 코드펜스(예: ``` 또는 ```json)를 절대로 포함하지 마라.",
    "규칙:",
    "- JSON만 출력",
    "- code 블록의 code 필드에는 코드만 그대로 넣고, 코드 펜스 같은 마크다운 문법은 절대 넣지 마라",
    "- table 블록은 headers/rows만 사용한다",
    "- markdown은 markdown 블록에서만 사용한다",
  ].join("\n")

  return [rules, "", "스키마:", schema, "", "사용자 요청:", userPrompt].join("\n")
}

function parseBlockJson(text: string): { parsed?: unknown; displayText: string; extractedSummary?: string } {
  let raw = (text || "").trim()
  if (raw.startsWith("```")) {
    const firstNl = raw.indexOf("\n")
    const lastFence = raw.lastIndexOf("```")
    if (firstNl > -1 && lastFence > firstNl) {
      raw = raw.slice(firstNl + 1, lastFence).trim()
    }
  }
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace > -1 && lastBrace > firstBrace) {
    raw = raw.slice(firstBrace, lastBrace + 1)
  }
  if (!raw.startsWith("{")) return { displayText: text }
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    if (!obj || typeof obj !== "object") return { displayText: text }
    const title = typeof obj.title === "string" ? obj.title : ""
    const summary = typeof obj.summary === "string" ? obj.summary : ""
    const out: string[] = []
    if (title) out.push(title)
    if (summary) out.push(summary)
    return { parsed: obj, displayText: out.filter(Boolean).join("\n\n") || text, extractedSummary: summary }
  } catch {
    return { displayText: text }
  }
}

export default function Timeline() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true)
  const [isMobile, setIsMobile] = React.useState(false)
  const [conversations, setConversations] = React.useState<TimelineConversation[]>([])
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<Array<{ role: ChatRole; content: string; contentJson?: unknown; model?: string }>>([]);

  // FrontAI에서 넘어온 "첫 질문"을 1회만 자동 실행하기 위한 ref
  const initialRanRef = React.useRef(false)
  // 현재 대화에서 마지막으로 사용한 모델을 유지하여 ChatInterface 드롭다운 초기값으로 사용합니다.
  const [stickySelectedModel, setStickySelectedModel] = React.useState<string | undefined>(undefined)

  const initial = (location.state as TimelineNavState | null)?.initial

  // 모바일 화면에서는 타임라인(로컬) 사이드바를 기본적으로 축소(닫힘) 상태로 유지합니다.
  // - 모바일: 닫힘(false)
  // - 데스크탑: 열림(true)
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(max-width: 767px)")

    const apply = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      setIsSidebarOpen(!mobile)
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
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messages: [],
    })) as TimelineConversation[]
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
      created_at: string
      message_order?: number
    }>
    return rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: extractTextFromJsonContent(m.content) || "",
      contentJson: m.content,
      model: typeof m.metadata?.model === "string" ? (m.metadata.model as string) : undefined,
      createdAt: m.created_at,
    })) as TimelineMessage[]
  }, [authHeaders])

  const createThreadFromFirstMessage = React.useCallback(async (firstMessage: string) => {
    // [중요] title을 클라이언트에서 결정하지 않고, 서버(OpenAI)가 요약/키워드 기반 제목을 생성하도록 위임합니다.
    // model도 함께 넘겨주면 conversation.model_id 매핑이 정확해집니다.
    const selectedModel = stickySelectedModel || (initial?.model ?? "")
    const res = await fetch(`${TIMELINE_API_BASE}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ first_message: firstMessage, model: selectedModel || null }),
    })
    if (!res.ok) throw new Error("THREAD_CREATE_FAILED")
    const row = (await res.json()) as { id: string; title: string; created_at: string; updated_at: string }
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages: [],
    } as TimelineConversation
  }, [authHeaders, initial?.model, stickySelectedModel])

  const addMessage = React.useCallback(async (threadId: string, msg: { role: ChatRole; content: string; contentJson?: unknown; summary?: string; model?: string }) => {
    const res = await fetch(`${TIMELINE_API_BASE}/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        role: msg.role,
        // DB 저장용 JSON content (없으면 {text: ...}로 보존)
        content: msg.contentJson ?? { text: msg.content },
        summary: msg.summary ?? (msg.role === "assistant" ? assistantSummary(msg.content) : userSummary(msg.content)),
        model: msg.model ?? null,
      }),
    })
    if (!res.ok) throw new Error("MESSAGE_ADD_FAILED")
    return true
  }, [authHeaders])

  // 0) 최초 진입 시 "서버(DB)"에서 대화 목록을 로드하고, "가장 최근 대화"를 자동으로 선택합니다.
  React.useEffect(() => {
    const run = async () => {
      try {
        const loaded = sortByRecent(await fetchThreads())
        setConversations(loaded)

        // FrontAI에서 넘어온 initial이 없으면, 최근 대화를 자동으로 열어줍니다.
        if (!initial && loaded.length > 0) {
          setActiveConversationId(loaded[0].id)
          const msgs = await fetchMessages(loaded[0].id)
          setMessages(msgs.map(m => ({ role: m.role, content: m.content, contentJson: m.contentJson, model: m.model })))
          const lastModel = [...msgs].reverse().find(m => m.model)?.model
          setStickySelectedModel(lastModel)
        }
      } catch (e) {
        // 서버가 아직 준비되지 않았거나 접속 실패 시 localStorage fallback
        const loaded = sortByRecent(loadConversations())
        setConversations(loaded)
        if (!initial && loaded.length > 0) {
          setActiveConversationId(loaded[0].id)
          setMessages(loaded[0].messages.map(m => ({ role: m.role, content: m.content, model: m.model })))
          const lastModel = [...loaded[0].messages].reverse().find(m => m.model)?.model
          setStickySelectedModel(lastModel)
        }
        console.warn("[Timeline] threads API 실패로 localStorage fallback 사용:", e)
      }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 대화 선택 시 메시지/모델 동기화
  React.useEffect(() => {
    if (!activeConversationId) return
    const run = async () => {
      try {
        const msgs = await fetchMessages(activeConversationId)
        setMessages(msgs.map(m => ({ role: m.role, content: m.content, contentJson: m.contentJson, model: m.model })))
        const lastModel = [...msgs].reverse().find(m => m.model)?.model
        setStickySelectedModel(lastModel)
      } catch {
        // fallback: localStorage 데이터로 표시
        const conv = conversations.find(c => c.id === activeConversationId)
        if (!conv) return
        setMessages(conv.messages.map(m => ({ role: m.role, content: m.content, model: m.model })))
        const lastModel = [...conv.messages].reverse().find(m => m.model)?.model
        setStickySelectedModel(lastModel)
      }
    }
    void run()
  }, [activeConversationId, conversations, fetchMessages])

  // 공통: 현재 대화에 메시지 1개를 추가하고 (서버 우선) 저장합니다.
  const appendToActiveConversation = React.useCallback((msg: { role: ChatRole; content: string; contentJson?: unknown; summary?: string; model?: string }) => {
    const run = async () => {
      try {
        let activeId = activeConversationId

        // 활성 스레드가 없으면, "첫 질문" 기준으로 서버에 스레드를 생성합니다.
        if (!activeId) {
          // 첫 메시지(주로 user 질문)를 서버에 전달하여
          // OpenAI가 "요약/키워드" 기반 제목을 생성하도록 합니다.
          const created = await createThreadFromFirstMessage(msg.content)
          activeId = created.id
          setActiveConversationId(created.id)
          setConversations((prev) => sortByRecent([created, ...prev]))
        }

        await addMessage(activeId, msg)

        // 저장 성공 후: 목록을 다시 갱신(최근순 유지)
        const refreshed = sortByRecent(await fetchThreads())
        setConversations(refreshed)
        setActiveConversationId(activeId)
        setStickySelectedModel(msg.model || stickySelectedModel)
      } catch (e) {
        // 서버 실패 시 localStorage fallback
        setConversations((prev) => {
          const t = nowIso()
          let activeId = activeConversationId
          let next = [...prev]
          if (!activeId) {
            const newId = safeUuid()
            const title = msg.role === "user" ? makeAutoTitleFromPrompt(msg.content) : "새 대화"
            const created: TimelineConversation = { id: newId, title, createdAt: t, updatedAt: t, messages: [] }
            next = [created, ...next]
            activeId = newId
            setActiveConversationId(newId)
          }
          const idx = next.findIndex((c) => c.id === activeId)
          if (idx < 0) return prev
          const toAdd: TimelineMessage = { id: safeUuid(), role: msg.role, content: msg.content, model: msg.model, createdAt: t }
          next[idx] = { ...next[idx], updatedAt: t, messages: [...next[idx].messages, toAdd] }
          const sorted = sortByRecent(next)
          saveConversations(sorted)
          setActiveConversationId(activeId)
          setStickySelectedModel(msg.model || stickySelectedModel)
          return sorted
        })
        console.warn("[Timeline] append API 실패로 localStorage fallback 사용:", e)
      }
    }
    void run()
  }, [activeConversationId, stickySelectedModel, addMessage, createThreadFromFirstMessage, fetchThreads])

  React.useEffect(() => {
    if (!initial) return
    if (initialRanRef.current) return
    initialRanRef.current = true

    // [중요] history state 정리(consume)
    // FrontAI → Timeline으로 이동할 때 navigate(state)를 통해 초기 질문을 넘겼습니다.
    // 이 state는 브라우저 히스토리 엔트리에 "그대로" 남기 때문에,
    // 사용자가 뒤로가기/앞으로가기/리로드 등으로 Timeline에 다시 들어오면
    // 같은 initial 값이 다시 들어와 "자동 전송"이 반복될 수 있습니다.
    //
    // 이를 막기 위해: initial을 한 번 읽어서 처리하기 시작한 즉시,
    // Timeline의 현재 URL 엔트리를 replace로 덮어쓰되 state를 비워줍니다.
    // - URL은 그대로(/timeline), state만 제거됩니다.
    // - replace=true 이므로 히스토리 엔트리가 추가되지 않고 현재 엔트리만 갱신됩니다.
    navigate(location.pathname, { replace: true, state: {} })

    // 1) FrontAI의 질문을 기준으로 서버(DB)에 새 스레드를 만들고 제목을 자동 생성합니다.
    // - 이 스레드가 좌측 "타임라인 목록"에 표시되는 단위입니다.
    // - 이후 메시지(user/assistant)를 이 스레드에 계속 append 합니다.
    const run = async () => {
      try {
        const thread = await createThreadFromFirstMessage(initial.input)

        // 스레드를 활성화 + 목록 반영
        setActiveConversationId(thread.id)
        setStickySelectedModel(initial.model)

        const refreshed = sortByRecent(await fetchThreads())
        setConversations(refreshed)

        // 2) 유저 메시지를 서버/화면에 저장
        setMessages([{ role: "user", content: initial.input, contentJson: { text: initial.input }, model: initial.model }])
        await addMessage(thread.id, {
          role: "user",
          content: initial.input,
          contentJson: { text: initial.input },
          summary: userSummary(initial.input),
          model: initial.model,
        })

        // 3) 실제 AI 응답 생성(/api/ai/chat) 후 assistant 메시지를 서버/화면에 저장
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider_slug: initial.providerSlug,
            model: initial.model,
            input: formatInstructionForChatTab(initial.input),
            output_format: "block_json",
            max_tokens: 2048,
          }),
        })

        const raw = await res.text()
        let json: Record<string, unknown> = {}
        try {
          json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        } catch {
          json = {}
        }

        if (!res.ok) {
          const parsed = json as { message?: unknown; details?: unknown }
          const msg = (parsed?.message ? String(parsed.message) : "") || raw || "AI 응답 실패"
          const details = parsed?.details ? `\n${String(parsed.details)}` : ""
          throw new Error(`${msg}${details}`)
        }

        const okJson = json as { output_text?: unknown }
        const out = String(okJson?.output_text || "")
        const parsed = parseBlockJson(out)
        setMessages((prev) => [...prev, { role: "assistant", content: parsed.displayText, contentJson: parsed.parsed ?? { text: out }, model: initial.model }])
        await addMessage(thread.id, {
          role: "assistant",
          content: parsed.displayText,
          contentJson: parsed.parsed ?? { text: out },
          summary: assistantSummary(parsed.extractedSummary || out),
          model: initial.model,
        })

        // 4) updated_at이 갱신되었으므로 목록을 다시 받아 "최근 대화가 위"를 확실히 보장합니다.
        const refreshed2 = sortByRecent(await fetchThreads())
        setConversations(refreshed2)
      } catch (e) {
        // 서버가 준비되지 않은 상황에서는 localStorage fallback로 동작 유지
        console.warn("[Timeline] initial flow API 실패로 localStorage fallback 사용:", e)

        const t = nowIso()
        const newConversationId = safeUuid()
        const title = makeAutoTitleFromPrompt(initial.input)
        const created: TimelineConversation = { id: newConversationId, title, createdAt: t, updatedAt: t, messages: [] }
        const userMsg: TimelineMessage = { id: safeUuid(), role: "user", content: initial.input, model: initial.model, createdAt: t }

        const next = sortByRecent([{ ...created, messages: [userMsg] }, ...loadConversations()])
        saveConversations(next)
        setConversations(next)
        setActiveConversationId(newConversationId)
        setStickySelectedModel(initial.model)
        setMessages([{ role: "user", content: initial.input, contentJson: { text: initial.input }, model: initial.model }])
      }
    }

    void run()
  }, [initial, navigate, location.pathname, createThreadFromFirstMessage, fetchThreads, addMessage])

  return (
    <div className="bg-background w-full h-screen overflow-hidden flex font-sans">
      {/* Global Sidebar */}
      <Sidebar />

      {/* Main Content Area - 메인 컨텐츠 시작 */}
      <div className="flex-1 flex flex-row h-full w-full bg-background relative pt-[56px] md:pt-0">
        
        {/* Timeline Sidebar (Local) - 타임라인 사이드바 (로컬) */}
        {isSidebarOpen && (
          <>
            {/* Mobile: backdrop (컨텐츠를 덮는 오버레이 형태) */}
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
                  // 모바일 오버레이에서는 선택 후 닫아주어 컨텐츠를 바로 볼 수 있게 합니다.
                  if (isMobile) setIsSidebarOpen(false)
                }}
              />
            </div>
          </>
        )}

        {/* Chat Content Area - 채팅 내용 및 입력 영역 */}
        <div className="flex-1 flex flex-col h-full relative w-full">
           {/* Header */}
           <UserHeader 
             leftContent={
               <div className="flex items-end">
                 {/* Sidebar Toggle Button (HoverCard for preview when closed) */}
                 {isSidebarOpen ? (
                   <Button
                     variant="ghost"
                     size="icon"
                     className="size-4 p-0 hover:bg-transparent"
                     onClick={() => setIsSidebarOpen(false)}
                   >
                     <ChevronsLeft className="size-4" />
                   </Button>
                 ) : (
                   // 모바일에서는 hover가 없으므로: 클릭 시 오버레이 사이드바를 열기만 합니다.
                   isMobile ? (
                     <Button
                       variant="ghost"
                       size="icon"
                       className="size-4 p-0 hover:bg-transparent"
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
                           className="size-4 p-0 hover:bg-transparent"
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
                   )
                 )}
               </div>
             }
           >
             {/* Header Center Button: Page Save & Edit */}
             <div className="bg-background border border-border flex items-center justify-center gap-[6px] px-3  h-[32px] rounded-lg shadow-sm cursor-pointer hover:bg-accent/50 transition-colors">
               <PencilLine className="size-4" />
               <span className="text-sm font-medium">페이지 저장 및 편집</span>
             </div>
           </UserHeader>

           {/* Chat Messages Scroll Area */}
           <div className="overflow-y-auto p-6 flex flex-col w-full gap-4 items-center h-full">
             {/* Messages */}
             <div className="w-full max-w-[800px] flex flex-col gap-6 ">
               {messages.length === 0 ? (
                 <div className="text-sm text-muted-foreground text-center py-10">
                   질문을 입력하면 이 영역에 답변이 표시됩니다.
                 </div>
               ) : (
                 messages.map((m, idx) => (
                   m.role === "user" ? (
                     <div key={idx} className="w-full flex justify-end">
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
                     <div key={idx} className="w-full flex lg:flex-row flex-col justify-start gap-4">
                       <div className="size-6 bg-primary rounded-[4px] flex items-center justify-center shrink-0">
                         <span className="text-primary-foreground text-sm font-bold">AI</span>
                       </div>
                       <div className="flex flex-col gap-4 max-w-[720px]">
                        <div className="text-base text-primary whitespace-pre-wrap space-y-3">
                          {(() => {
                            const c = m.contentJson
                            if (c && typeof c === "object") {
                              const obj = c as Record<string, unknown>
                              const blocks = Array.isArray(obj.blocks) ? (obj.blocks as Array<Record<string, unknown>>) : null
                              if (blocks && blocks.length > 0) {
                                return (
                                  <div className="space-y-3">
                                    {blocks.map((b, bIdx) => {
                                      const type = typeof b.type === "string" ? b.type : ""
                                      if (type === "markdown" && typeof b.markdown === "string") {
                                        return (
                                          <Markdown
                                            key={bIdx}
                                            markdown={String(b.markdown)}
                                            className="prose prose-sm max-w-none"
                                          />
                                        )
                                      }
                                      if (type === "code" && typeof b.code === "string") {
                                        return (
                                          <CodeBlock
                                            key={bIdx}
                                            language={typeof b.language === "string" ? b.language : undefined}
                                            code={String(b.code)}
                                          />
                                        )
                                      }
                                      if (type === "table") {
                                        const headers = Array.isArray(b.headers) ? (b.headers as unknown[]).map(String) : []
                                        const rows = Array.isArray(b.rows)
                                          ? (b.rows as unknown[]).map((r) =>
                                              Array.isArray(r) ? (r as unknown[]).map(String) : []
                                            )
                                          : []
                                        return <BlockTable key={bIdx} headers={headers} rows={rows as string[][]} />
                                      }
                                      return null
                                    })}
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

           {/* Bottom Panel - Timeline 하단 패널 (ChatInterface compact 모드로 대체) */}
           <div className="p-4 flex flex-col items-center gap-2 w-full">
             <ChatInterface
               variant="compact"
               // 대화 선택 시 마지막 모델을 초기값으로 반영합니다.
               initialSelectedModel={stickySelectedModel}
               onMessage={(msg) => {
                 // 1) 화면에 표시
                 setMessages((prev) => [...prev, { role: msg.role, content: msg.content, contentJson: msg.contentJson, model: msg.model }])
                 // 2) localStorage(대화 히스토리)에 저장
                 appendToActiveConversation({
                   role: msg.role,
                   content: msg.content,
                   contentJson: msg.contentJson,
                   summary: msg.summary,
                   model: msg.model,
                 })
               }}
             />
           </div>
        </div>
      </div>
    </div>
  )
}

