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
  initial?: { input: string; providerSlug: string; model: string; sessionLanguage?: string | null }
}

const TIMELINE_API_BASE = "/api/ai/timeline"

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

function sortByRecent(convs: TimelineConversation[]) {
  return [...convs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export default function Timeline() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true)
  const [isMobile, setIsMobile] = React.useState(false)
  const [conversations, setConversations] = React.useState<TimelineConversation[]>([])
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<Array<{ role: ChatRole; content: string; contentJson?: unknown; model?: string }>>([]);

  // 현재 대화에서 마지막으로 사용한 모델을 유지하여 ChatInterface 드롭다운 초기값으로 사용합니다.
  const [stickySelectedModel, setStickySelectedModel] = React.useState<string | undefined>(undefined)
  const [initialToSend, setInitialToSend] = React.useState<{ input: string; providerSlug: string; model: string; sessionLanguage?: string | null } | null>(null)

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
    setInitialToSend(initial)
    // state consume
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

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
        setMessages([])
      }
    }
    void run()
  }, [activeConversationId, conversations, fetchMessages])

  // initial 질문/응답 생성은 ChatInterface(autoSend)가 /api/ai/chat/run(=DB-driven)을 통해 처리합니다.

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
              initialProviderSlug={initialToSend?.providerSlug}
              autoSendPrompt={initialToSend?.input || null}
              sessionLanguage={initialToSend?.sessionLanguage || undefined}
              conversationId={activeConversationId}
              onConversationId={(id) => {
                setActiveConversationId(id)
                // 첫 질문에서 신규 대화가 생성된 경우: 목록/메시지 즉시 동기화
                void (async () => {
                  try {
                    const refreshed = sortByRecent(await fetchThreads())
                    setConversations(refreshed)
                    const msgs = await fetchMessages(id)
                    setMessages(msgs.map((m) => ({ role: m.role, content: m.content, contentJson: m.contentJson, model: m.model })))
                    const lastModel = [...msgs].reverse().find((m) => m.model)?.model
                    setStickySelectedModel(lastModel)
                  } catch {
                    // ignore
                  } finally {
                    setInitialToSend(null)
                  }
                })()
              }}
               onMessage={(msg) => {
                 // 1) 화면에 표시
                 setMessages((prev) => [...prev, { role: msg.role, content: msg.content, contentJson: msg.contentJson, model: msg.model }])
                // 2) DB 저장은 ChatInterface(/api/ai/chat/run)가 처리합니다. 중복 저장 방지.
                if (msg.model) setStickySelectedModel(msg.model)
               }}
             />
           </div>
        </div>
      </div>
    </div>
  )
}

