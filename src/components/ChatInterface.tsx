import * as React from "react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  Image as ImageIcon,
  Link2,
  MessageSquare,
  Paperclip,
  Settings2,
  Plus,
  ArrowUp,
  X,
  Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { ProviderLogo } from "@/components/icons/providerLogoRegistry"
import { ModelOptionsPanel } from "@/components/ModelOptionsPanel"

type PaidTokenProps = { className?: string }

function PaidToken({ className }: PaidTokenProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="bg-primary flex gap-[10px] items-center justify-center px-[12px] py-[6px] rounded-full shadow-sm shrink-0">
        <p className="font-medium leading-[20px] text-primary-foreground text-[14px]">개인:Pro</p>
        <div className="bg-primary-foreground flex flex-col gap-[10px] h-[20px] items-center justify-center px-[4px] py-[2px] rounded-full shrink-0">
          <p className="font-medium leading-[16px] text-primary text-[12px] font-mono">20.000</p>
        </div>
      </div>
    </div>
  )
}

export interface ChatInterfaceProps {
  className?: string
  variant?: "default" | "compact"
  onMessage?: (msg: {
    role: "user" | "assistant" | "tool"
    content: string
    contentJson?: unknown
    summary?: string
    providerSlug?: string
    model?: string
  }) => void
  submitMode?: "send" | "emit"
  onSubmit?: (payload: { input: string; providerSlug: string; model: string; modelType: ModelType; options?: Record<string, unknown> }) => void
  initialSelectedModel?: string
  initialProviderSlug?: string
  initialModelType?: ModelType
  initialOptions?: Record<string, unknown>
  autoSendPrompt?: string | null
  conversationId?: string | null
  onConversationId?: (id: string) => void
  sessionLanguage?: string
  onSelectionChange?: (selection: { modelType: ModelType; providerSlug: string | null; modelApiId: string | null }) => void
  forceSelectionSync?: boolean
  selectionOverride?: { modelType?: ModelType; providerSlug?: string; modelApiId?: string }
}

type ModelType = "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"

type UiModel = {
  id: string
  model_type: ModelType
  model_api_id: string
  display_name: string
  description?: string
  is_available: boolean
  is_default: boolean
  sort_order: number
  capabilities?: Record<string, unknown>
}

type UiProviderGroup = {
  model_type: ModelType
  provider: {
    id: string
    product_name: string
    description: string
    logo_key?: string | null
    slug: string
    provider_family?: string
  }
  models: UiModel[]
}

type ChatUiConfig = {
  ok: boolean
  model_types: ModelType[]
  providers_by_type: Record<string, UiProviderGroup[]>
}

const CHAT_UI_CONFIG_API = "/api/ai/chat-ui/config"
const CHAT_PROMPT_SUGGESTIONS_API = "/api/ai/chat-ui/prompt-suggestions"
const CHAT_RUN_API = "/api/ai/chat/run"
const FRONT_AI_LAST_SELECTION_KEY = "reductai.frontai.lastSelection.v1"

function tabLabel(t: ModelType) {
  const map: Record<ModelType, string> = {
    text: "채팅",
    image: "이미지",
    video: "영상",
    music: "음악",
    audio: "음성",
    multimodal: "멀티모달",
    embedding: "임베딩",
    code: "코드",
  }
  return map[t] || t
}

function clampText(input: string, max: number) {
  const s = String(input || "").replace(/\s+/g, " ").trim()
  if (s.length <= max) return s
  return s.slice(0, max)
}

type LlmBlock =
  | { type: "markdown"; markdown: string }
  | { type: "code"; language: string; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function safeString(v: unknown): string | null {
  return typeof v === "string" ? v : null
}

function buildMarkdownFromLooseObject(obj: Record<string, unknown>): string {
  const parts: string[] = []
  const title = safeString(obj.title)
  const topic = safeString(obj.topic)
  const quote = safeString(obj.quote)
  const source = safeString(obj.source)
  const message = safeString(obj.message)
  const reply = safeString(obj.reply)
  const outputText = safeString(obj.output_text) ?? safeString(obj.text)

  if (title) parts.push(`## ${title}`)
  if (topic) parts.push(`### ${topic}`)
  if (quote) {
    const quoteLines = source ? `${quote}\n\n— ${source}` : quote
    parts.push(quoteLines.split("\n").map((line) => `> ${line}`).join("\n"))
  } else if (source) {
    parts.push(`_${source}_`)
  }
  if (message) parts.push(message)
  if (reply) parts.push(reply)
  if (outputText) parts.push(outputText)

  return parts.join("\n\n").trim()
}

function coerceBlockJsonFromAny(obj: Record<string, unknown>): Record<string, unknown> | null {
  if (obj.type === "doc") return obj
  if (Array.isArray(obj.blocks)) return obj
  const markdown = buildMarkdownFromLooseObject(obj)
  if (!markdown) return null
  return { blocks: [{ type: "markdown", markdown }] }
}

function extractTextFromJsonContent(content: Record<string, unknown>): string {
  if (typeof content.text === "string") return content.text
  if (typeof content.output_text === "string") return content.output_text
  if (typeof content.input === "string") return content.input
  const title = typeof content.title === "string" ? content.title : ""
  const summary = typeof content.summary === "string" ? content.summary : ""
  const blocks = Array.isArray(content.blocks) ? (content.blocks as Array<Record<string, unknown>>) : []
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

function parseBlockJson(text: string): { parsed?: Record<string, unknown>; displayText: string } {
  let raw = (text || "").trim()
  if (raw.startsWith("```")) {
    const firstNl = raw.indexOf("\n")
    const lastFence = raw.lastIndexOf("```")
    if (firstNl > -1 && lastFence > firstNl) raw = raw.slice(firstNl + 1, lastFence).trim()
  }
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace > -1 && lastBrace > firstBrace) raw = raw.slice(firstBrace, lastBrace + 1)
  if (!raw.startsWith("{")) return { displayText: text }

  function repairJsonForNewlines(input: string) {
    // Fix common "JSON-ish" outputs where models include raw newlines/tabs inside quoted strings.
    // This makes JSON.parse possible without adding a dependency like json5.
    let out = ""
    let inString = false
    let escaped = false
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i]
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
    return out
  }

  try {
    const parsedUnknown: unknown = JSON.parse(raw)
    if (!isRecord(parsedUnknown)) return { displayText: text }
    const obj = parsedUnknown
    const blocksUnknown = obj.blocks
    const topMarkdown = typeof obj.markdown === "string" ? obj.markdown : ""
    if (!Array.isArray(blocksUnknown)) {
      if (topMarkdown) {
        return { parsed: obj, displayText: topMarkdown || text }
      }
      const coerced = coerceBlockJsonFromAny(obj)
      if (coerced) {
        const displayText = extractTextFromJsonContent(coerced)
        return { parsed: coerced, displayText: displayText || text }
      }
      return { displayText: text }
    }

    const title = typeof obj.title === "string" ? obj.title : ""
    const summary = typeof obj.summary === "string" ? obj.summary : ""
    const blocks: LlmBlock[] = []

    for (const bUnknown of blocksUnknown) {
      if (!isRecord(bUnknown)) continue
      const type = safeString(bUnknown.type)
      if (!type) continue

      if (type === "markdown") {
        const markdown = safeString(bUnknown.markdown) ?? safeString(bUnknown.content)
        if (markdown !== null) blocks.push({ type: "markdown", markdown })
        continue
      }
      if (type === "code") {
        const language = safeString(bUnknown.language) ?? "plain"
        const code = safeString(bUnknown.code) ?? safeString(bUnknown.content) ?? ""
        blocks.push({ type: "code", language, code })
        continue
      }
      if (type === "table") {
        const contentObj = isRecord(bUnknown.content) ? (bUnknown.content as Record<string, unknown>) : null
        const headersRaw = bUnknown.headers ?? contentObj?.headers
        const rowsRaw = bUnknown.rows ?? contentObj?.rows
        const headers = Array.isArray(headersRaw) ? headersRaw.map((h) => String(h)) : []
        const rows = Array.isArray(rowsRaw)
          ? rowsRaw.map((r) => (Array.isArray(r) ? r.map((c) => String(c)) : [])).filter((r) => r.length > 0)
          : []
        blocks.push({ type: "table", headers, rows })
        continue
      }
    }

    const out: string[] = []
    if (title) out.push(title)
    if (summary) out.push(summary)
    for (const b of blocks) {
      if (b.type === "markdown") out.push(b.markdown)
      else if (b.type === "code") out.push(`[code:${String(b.language || "plain")}]\n${String(b.code || "")}`)
      else if (b?.type === "table") {
        out.push(`[table]\n${b.headers.join(" | ")}\n${b.rows.map((r) => r.join(" | ")).join("\n")}`)
      }
    }
    // Keep the original JSON object so media fields (audio/video/images/...) are not lost. 
    // 미디어 필드(audio/video/images/...)가 손실되지 않도록 원본 JSON 객체를 그대로 유지합니다.
    return { parsed: obj as Record<string, unknown>, displayText: out.filter(Boolean).join("\n\n") || text }
  } catch {
    const msgMatch = raw.match(/"(message|reply)"\s*:\s*"([\s\S]*?)"\s*(?:[},]|$)/)
    if (msgMatch) {
      const msg = msgMatch[2]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .trim()
      if (msg) return { displayText: msg }
    }
    // Retry with a repaired version for common invalid JSON outputs.
    try {
      const repaired = repairJsonForNewlines(raw)
      const parsedUnknown2: unknown = JSON.parse(repaired)
      if (!isRecord(parsedUnknown2)) return { displayText: text }
      const obj = parsedUnknown2
      const blocksUnknown = obj.blocks
      const topMarkdown = typeof obj.markdown === "string" ? obj.markdown : ""
      if (!Array.isArray(blocksUnknown)) {
        if (topMarkdown) return { parsed: obj, displayText: topMarkdown || text }
        const coerced = coerceBlockJsonFromAny(obj)
        if (coerced) {
          const displayText = extractTextFromJsonContent(coerced)
          return { parsed: coerced, displayText: displayText || text }
        }
        return { displayText: text }
      }
      return { parsed: obj, displayText: extractTextFromJsonContent(obj) || text }
    } catch {
      return { displayText: text }
    }
  }
}

function normalizeAiContent(rawText: string, content: unknown): { parsed?: Record<string, unknown>; displayText: string } {
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>
    const outputText = typeof obj.output_text === "string" ? obj.output_text : ""
    if (outputText) {
      const parsedFromOutput = parseBlockJson(outputText)
      if (parsedFromOutput.parsed && isRecord(parsedFromOutput.parsed)) {
        const normalizedParsed = normalizeBlockJson(parsedFromOutput.parsed)
        const displayText = extractTextFromJsonContent(normalizedParsed)
        return { parsed: normalizedParsed, displayText: displayText || parsedFromOutput.displayText || rawText }
      }
    }
    const coerced = coerceBlockJsonFromAny(obj)
    const normalizedParsed = normalizeBlockJson((coerced ?? obj) as Record<string, unknown>)
    const displayText = extractTextFromJsonContent(normalizedParsed)
    return { parsed: normalizedParsed, displayText: displayText || rawText }
  }
  return parseBlockJson(rawText)
}

function normalizeBlockJson(content: Record<string, unknown>): Record<string, unknown> {
  const blocks = Array.isArray(content.blocks) ? (content.blocks as Array<Record<string, unknown>>) : null
  if (!blocks) {
    const topMarkdown = typeof content.markdown === "string" ? content.markdown : null
    if (topMarkdown) {
      return { ...content, blocks: [{ type: "markdown", markdown: topMarkdown }] }
    }
    return content
  }
  const normalized = blocks.map((b) => {
    const t = typeof b.type === "string" ? b.type.toLowerCase() : ""
    if (t === "markdown") {
      const md = typeof b.markdown === "string" ? b.markdown : typeof b.content === "string" ? b.content : ""
      const rest = { ...b }
      delete (rest as { content?: unknown }).content
      delete (rest as { markdown?: unknown }).markdown
      return md ? { ...rest, type: "markdown", markdown: md } : { ...rest, type: "markdown" }
    }
    if (t === "code") {
      const code = typeof b.code === "string" ? b.code : typeof b.content === "string" ? b.content : ""
      const rest = { ...b }
      delete (rest as { content?: unknown }).content
      delete (rest as { code?: unknown }).code
      return code
        ? { ...rest, type: "code", language: typeof b.language === "string" ? b.language : "plain", code }
        : { ...rest, type: "code", language: typeof b.language === "string" ? b.language : "plain" }
    }
    if (t === "table") {
      const contentObj = isRecord((b as { content?: unknown }).content) ? ((b as { content?: unknown }).content as Record<string, unknown>) : null
      const headers = Array.isArray(b.headers) ? b.headers.map(String) : Array.isArray(contentObj?.headers) ? (contentObj.headers as unknown[]).map(String) : []
      const rows = Array.isArray(b.rows) ? b.rows : Array.isArray(contentObj?.rows) ? (contentObj.rows as unknown[]) : []
      const data = Array.isArray((b as { data?: unknown }).data) ? ((b as { data?: unknown }).data as unknown[]) : []
      if (!headers.length && rows.length === 0 && data.length > 0) {
        const firstRow = Array.isArray(data[0]) ? (data[0] as unknown[]).map(String) : []
        const bodyRows = data.slice(1).map((r) => (Array.isArray(r) ? r.map(String) : []))
        return { type: "table", headers: firstRow, rows: bodyRows }
      }
      if (!headers.length && data.length > 0 && rows.length === 0) {
        return { type: "table", headers: [], rows: data.map((r) => (Array.isArray(r) ? r.map(String) : [])) }
      }
      if (headers.length && rows.length === 0 && data.length > 0) {
        return { type: "table", headers, rows: data.map((r) => (Array.isArray(r) ? r.map(String) : [])) }
      }
      return { type: "table", headers, rows: rows.map((r) => (Array.isArray(r) ? r.map(String) : [])) }
    }
    return b
  })
  return { ...content, blocks: normalized }
}

export function ChatInterface({
  className,
  variant = "default",
  onMessage,
  submitMode = "send",
  onSubmit,
  initialSelectedModel,
  initialProviderSlug,
  initialModelType,
  initialOptions,
  autoSendPrompt,
  conversationId,
  onConversationId,
  sessionLanguage,
  onSelectionChange,
  forceSelectionSync = false,
  selectionOverride,
}: ChatInterfaceProps) {
  const isCompact = variant === "compact"

  const authHeaders = React.useCallback((): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const [uiLoading, setUiLoading] = React.useState(false)
  const [uiConfig, setUiConfig] = React.useState<ChatUiConfig | null>(null)

  // (2) 모드 탭: ai_models.model_type 기준
  const [selectedType, setSelectedType] = React.useState<ModelType>(() => {
    // forceSelectionSync가 true이고 selectionOverride가 있으면 그걸 초기값으로 사용
    if (forceSelectionSync && selectionOverride?.modelType) {
      return selectionOverride.modelType as ModelType
    }
    return (initialModelType as ModelType) || "text"
  })
  // provider group 선택
  const [selectedProviderId, setSelectedProviderId] = React.useState("")
  // (4) dropdown 대상: status=active는 서버에서, is_available=true만 클라에서 필터
  const [selectedSubModel, setSelectedSubModel] = React.useState(() => {
    // forceSelectionSync가 true이고 selectionOverride가 있으면 그걸 초기값으로 사용
    if (forceSelectionSync && selectionOverride?.modelApiId) {
      return selectionOverride.modelApiId
    }
    return initialSelectedModel || ""
  })

  // (8) capabilities.options/defaults 기반 옵션 상태
  const [runtimeOptions, setRuntimeOptions] = React.useState<Record<string, unknown>>({})
  const [isOptionExpanded, setIsOptionExpanded] = React.useState(true)

  const promptInputRef = React.useRef<HTMLTextAreaElement>(null)

  // 모델별 옵션 유지(세션 유지): in-memory + sessionStorage
  const [runtimeOptionsByModel, setRuntimeOptionsByModel] = React.useState<Record<string, Record<string, unknown>>>({})
  const STORAGE_KEY = "reductai.chat.runtimeOptionsByModel.v1"

  // scroll
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = React.useState(false)
  const [showRightArrow, setShowRightArrow] = React.useState(false)

  const [prompt, setPrompt] = React.useState("")
  const [compactPromptMode, setCompactPromptMode] = React.useState<"single" | "multi">(isCompact ? "single" : "multi")
  const compactSingleTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const promptRef = React.useRef("")
  const pendingCaretToEndRef = React.useRef(false)
  const compactUpgradedAtRef = React.useRef(0)
  const pendingSelectionRef = React.useRef<{ start: number; end: number } | null>(null)

  type ChatAttachment =
    | { id: string; kind: "file"; name: string; size: number; mime: string; file: File }
    | { id: string; kind: "image"; name: string; size: number; mime: string; file: File; previewUrl: string }
    | { id: string; kind: "link"; url: string; title?: string }

  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([])
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const imageInputRef = React.useRef<HTMLInputElement | null>(null)

  const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false)
  const [linkUrl, setLinkUrl] = React.useState("")
  const [linkTitle, setLinkTitle] = React.useState("")

  const addFiles = React.useCallback((files: FileList | null, mode: "mixed" | "image_only") => {
    if (!files || files.length === 0) return
    const next: ChatAttachment[] = []
    for (const f of Array.from(files)) {
      const mime = String(f.type || "")
      const isImg = mime.startsWith("image/")
      if (mode === "image_only" && !isImg) continue
      if (isImg) {
        const previewUrl = URL.createObjectURL(f)
        next.push({
          id: `img_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          kind: "image",
          name: f.name || "image",
          size: Number(f.size || 0),
          mime,
          file: f,
          previewUrl,
        })
      } else {
        next.push({
          id: `file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          kind: "file",
          name: f.name || "file",
          size: Number(f.size || 0),
          mime,
          file: f,
        })
      }
    }
    if (!next.length) return
    setAttachments((prev) => [...prev, ...next])
  }, [])

  const removeAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target && target.kind === "image" && target.previewUrl) {
        try {
          URL.revokeObjectURL(target.previewUrl)
        } catch {
          // ignore
        }
      }
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const clearAttachments = React.useCallback(() => {
    setAttachments((prev) => {
      for (const a of prev) {
        if (a.kind === "image" && a.previewUrl) {
          try {
            URL.revokeObjectURL(a.previewUrl)
          } catch {
            // ignore
          }
        }
      }
      return []
    })
  }, [])

  const buildAttachmentContext = React.useCallback((items: ChatAttachment[]) => {
    if (!items.length) return ""
    const lines: string[] = []
    lines.push("### 첨부")
    for (const a of items) {
      if (a.kind === "link") {
        const title = (a.title || "").trim()
        lines.push(`- 링크: ${title ? `${title} - ` : ""}${a.url}`)
      } else if (a.kind === "image") {
        lines.push(`- 이미지: ${a.name}`)
      } else {
        lines.push(`- 파일: ${a.name}`)
      }
    }
    return lines.join("\n")
  }, [])
  const isComposingRef = React.useRef(false)
  const handleSendInFlightRef = React.useRef<Set<string>>(new Set())
  const selectionDirtyRef = React.useRef(false)
  const [isCompactPanelOpen, setIsCompactPanelOpen] = React.useState(false)
  const compactPanelRef = React.useRef<HTMLDivElement | null>(null)
  const compactPanelTriggerRef = React.useRef<HTMLDivElement | null>(null)
  const compactPanelFloatingRef = React.useRef<HTMLDivElement | null>(null)

  const [promptSuggestions, setPromptSuggestions] = React.useState<
    Array<{ id: string; model_type: ModelType | null; model_id: string | null; title: string | null; text: string; sort_order: number; metadata?: Record<string, unknown> }>
  >([])

  const userSummary = React.useCallback((input: string) => clampText(input, 50), [])
  const assistantSummary = React.useCallback((input: string) => {
    const cleaned = String(input || "").replace(/\s+/g, " ").trim()
    const withoutDots = cleaned.replace(/\./g, "")
    const head = clampText(withoutDots, 99)
    return head ? `${head}.` : "요약."
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setUiLoading(true)
      try {
        const res = await fetch(CHAT_UI_CONFIG_API, { signal: controller.signal })
        const json = (await res.json().catch(() => ({}))) as ChatUiConfig
        if (!res.ok || !json.ok) throw new Error("CHAT_UI_CONFIG_FAILED")
        setUiConfig(json)
        const desired = typeof initialModelType === "string" ? initialModelType : null
        const allowed = new Set<ModelType>((json.model_types || []) as ModelType[])
        const first = (json.model_types?.[0] as ModelType | undefined) || "text"
        setSelectedType(desired && allowed.has(desired) ? desired : first)
      } catch {
        setUiConfig(null)
      } finally {
        setUiLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [initialModelType])

  const currentProviderGroups = React.useMemo(() => {
    const map = uiConfig?.providers_by_type || {}
    // (3) provider grid: active 모델이 있는 provider만 (서버에서 이미 필터)
    return (map[selectedType] || []) as UiProviderGroup[]
  }, [uiConfig, selectedType])

  const normalizeProviderSlug = React.useCallback((slug: string) => {
    const raw = slug.trim().toLowerCase()
    if (!raw) return raw
    // NOTE: DB에 저장된 provider slug(예: google-gemini/openai-chatgpt)를 우선합니다.
    // saved 값이 family 형태로 들어와도 복원되도록 canonical 형태로 맞춥니다.
    if (raw.includes("gemini")) return "google-gemini"
    if (raw.includes("openai") || raw.includes("chatgpt")) return "openai-chatgpt"
    if (raw.includes("claude") || raw.includes("anthropic")) return "anthropic-claude"
    return raw
  }, [])

  const findSelectionByModel = React.useCallback(
    (modelApiId: string) => {
      if (!uiConfig) return null
      const apiId = modelApiId.trim()
      if (!apiId) return null
      const entries = Object.entries(uiConfig.providers_by_type || {})
      for (const [typeKey, groups] of entries) {
        const typeGroups = groups as UiProviderGroup[]
        // NOTE: 복원/탐색 용도이므로 is_available을 강제하지 않습니다.
        const group = typeGroups.find((g) => (g.models || []).some((m) => m.model_api_id === apiId))
        if (group) {
          return {
            modelType: typeKey as ModelType,
            providerId: group.provider.id,
            providerSlug: group.provider.slug,
          }
        }
      }
      return null
    },
    [uiConfig]
  )

  const findSelectionByProviderSlug = React.useCallback(
    (slug: string) => {
      if (!uiConfig) return null
      const wanted = slug.trim()
      if (!wanted) return null
      const entries = Object.entries(uiConfig.providers_by_type || {})
      for (const [typeKey, groups] of entries) {
        const typeGroups = groups as UiProviderGroup[]
        const group = typeGroups.find((g) => g.provider.slug === wanted)
        if (group) {
          return {
            modelType: typeKey as ModelType,
            providerId: group.provider.id,
            providerSlug: group.provider.slug,
          }
        }
      }
      const normalized = normalizeProviderSlug(wanted)
      if (normalized && normalized !== wanted) {
        for (const [typeKey, groups] of entries) {
          const typeGroups = groups as UiProviderGroup[]
          const group = typeGroups.find((g) => g.provider.slug === normalized)
          if (group) {
            return {
              modelType: typeKey as ModelType,
              providerId: group.provider.id,
              providerSlug: group.provider.slug,
            }
          }
        }
      }
      return null
    },
    [normalizeProviderSlug, uiConfig]
  )

  const currentProviderGroup = React.useMemo(() => {
    if (!currentProviderGroups.length) return null
    const byId = selectedProviderId ? currentProviderGroups.find((g) => g.provider.id === selectedProviderId) : null
    return byId || currentProviderGroups[0]
  }, [currentProviderGroups, selectedProviderId])

  const selectableModels = React.useMemo(() => {
    const list = currentProviderGroup?.models || []
    return list.filter((m) => m.is_available && String(m.model_api_id || "").trim())
  }, [currentProviderGroup])

  const selectedModel = React.useMemo(() => {
    if (!selectableModels.length) return null
    const picked = selectableModels.find((m) => m.model_api_id === selectedSubModel) || null
    return picked
  }, [selectableModels, selectedSubModel])

  const selectedModelLabel = React.useMemo(() => {
    if (!selectedModel) return "모델이 선택되지 않았습니다."
    const name = String(selectedModel.display_name || "").trim()
    const desc = String(selectedModel.description || "").trim()
    if (!name) return "모델이 선택되지 않았습니다."
    return desc ? `${name} - ${desc}` : name
  }, [selectedModel])

  const selectedModelDbId = React.useMemo(() => {
    const picked = selectableModels.find((m) => m.model_api_id === selectedSubModel) || selectableModels[0]
    return picked?.id ? String(picked.id) : ""
  }, [selectableModels, selectedSubModel])

  const effectiveModelApiId = React.useMemo(() => {
    if (selectedSubModel && selectableModels.some((m) => m.model_api_id === selectedSubModel)) {
      return selectedSubModel
    }
    return selectableModels[0]?.model_api_id || ""
  }, [selectableModels, selectedSubModel])

  const useSelectionOverride =
    !!forceSelectionSync &&
    !!selectionOverride &&
    (Boolean(selectionOverride.modelApiId) || Boolean(selectionOverride.providerSlug) || Boolean(selectionOverride.modelType))

  const uiSelectedType = (useSelectionOverride
    ? (selectionOverride?.modelType as ModelType | undefined)
    : undefined) || selectedType

  const uiProviderGroups = React.useMemo(() => {
    return useSelectionOverride ? ((uiConfig?.providers_by_type?.[uiSelectedType] || []) as UiProviderGroup[]) : currentProviderGroups
  }, [currentProviderGroups, uiConfig?.providers_by_type, uiSelectedType, useSelectionOverride])

  const uiProviderGroup = React.useMemo(() => {
    if (!uiProviderGroups.length) return null
    if (!useSelectionOverride) return currentProviderGroup
    const wantedModel = String(selectionOverride?.modelApiId || "").trim()
    if (wantedModel) {
      // NOTE: 새로고침/복원 시에는 is_available 변동이 있을 수 있으므로, provider 매칭은 availability를 강제하지 않습니다.
      const byModel = uiProviderGroups.find((g) => (g.models || []).some((m) => m.model_api_id === wantedModel))
      if (byModel) return byModel
    }
    const wantedSlug = String(selectionOverride?.providerSlug || "").trim()
    if (wantedSlug) {
      const bySlug = uiProviderGroups.find((g) => g.provider.slug === wantedSlug)
      if (bySlug) return bySlug
      // fuzzy match (예: google-gemini ↔ gemini / openai-chatgpt ↔ openai)
      const wantLower = wantedSlug.toLowerCase()
      const byContains =
        uiProviderGroups.find((g) => {
          const slug = String(g.provider.slug || "").toLowerCase()
          if (!slug) return false
          return slug.includes(wantLower) || wantLower.includes(slug)
        }) || null
      if (byContains) return byContains

      const normalized = normalizeProviderSlug(wantedSlug)
      if (normalized && normalized !== wantedSlug) {
        const byNorm = uiProviderGroups.find((g) => String(g.provider.slug || "").toLowerCase() === normalized.toLowerCase()) || null
        if (byNorm) return byNorm
      }

      // family-based fallback
      if (wantLower.includes("gemini")) {
        const g = uiProviderGroups.find((gg) => String(gg.provider.slug || "").toLowerCase().includes("gemini")) || null
        if (g) return g
      }
      if (wantLower.includes("openai") || wantLower.includes("chatgpt")) {
        const g = uiProviderGroups.find((gg) => {
          const s = String(gg.provider.slug || "").toLowerCase()
          return s.includes("openai") || s.includes("chatgpt")
        }) || null
        if (g) return g
      }
      if (wantLower.includes("claude") || wantLower.includes("anthropic")) {
        const g = uiProviderGroups.find((gg) => {
          const s = String(gg.provider.slug || "").toLowerCase()
          return s.includes("claude") || s.includes("anthropic")
        }) || null
        if (g) return g
      }
    }
    return uiProviderGroups[0]
  }, [currentProviderGroup, normalizeProviderSlug, selectionOverride?.modelApiId, selectionOverride?.providerSlug, uiProviderGroups, useSelectionOverride])

  const uiSelectableModels = useSelectionOverride
    ? (uiProviderGroup?.models || []).filter((m) => m.is_available && String(m.model_api_id || "").trim())
    : selectableModels

  const uiSelectedModelApiId = useSelectionOverride
    ? (() => {
        const wanted = String(selectionOverride?.modelApiId || "").trim()
        if (wanted && uiSelectableModels.some((m) => m.model_api_id === wanted)) return wanted
        return uiSelectableModels[0]?.model_api_id || ""
      })()
    : effectiveModelApiId

  const uiSelectedModel = useSelectionOverride
    ? uiSelectableModels.find((m) => m.model_api_id === uiSelectedModelApiId) || null
    : selectedModel

  const uiSelectedModelDbId = useSelectionOverride
    ? (uiSelectableModels.find((m) => m.model_api_id === uiSelectedModelApiId) || uiSelectableModels[0])?.id || ""
    : selectedModelDbId

  const uiSelectedModelLabel = useSelectionOverride
    ? (() => {
        if (!uiSelectedModel) return "모델이 선택되지 않았습니다."
        const name = String(uiSelectedModel.display_name || "").trim()
        const desc = String(uiSelectedModel.description || "").trim()
        if (!name) return "모델이 선택되지 않았습니다."
        return desc ? `${name} - ${desc}` : name
      })()
    : selectedModelLabel

  React.useEffect(() => {
    if (!onSelectionChange) return
    const providerSlug = currentProviderGroup?.provider?.slug ? String(currentProviderGroup.provider.slug) : null
    const modelApiId = effectiveModelApiId ? String(effectiveModelApiId) : null
    if (!providerSlug || !modelApiId) return
    if (selectionOverride && !selectionDirtyRef.current) return
    onSelectionChange({ modelType: selectedType, providerSlug, modelApiId })
  }, [currentProviderGroup?.provider?.slug, effectiveModelApiId, onSelectionChange, selectedType, selectionOverride])

  const persistFrontAiSelection = React.useCallback(
    (providerSlug: string, modelApiId: string, modelType: ModelType) => {
      if (submitMode !== "emit") return
      try {
        const payload = JSON.stringify({ providerSlug, modelApiId, modelType })
        localStorage.setItem(FRONT_AI_LAST_SELECTION_KEY, payload)
        sessionStorage.setItem(FRONT_AI_LAST_SELECTION_KEY, payload)
      } catch {
        // ignore storage issues
      }
    },
    [submitMode]
  )

  React.useEffect(() => {
    if (forceSelectionSync) return
    if (submitMode !== "emit") return
    if (!selectionDirtyRef.current) return
    const providerSlug = (useSelectionOverride ? uiProviderGroup?.provider?.slug : currentProviderGroup?.provider?.slug) || ""
    const modelApiId = (useSelectionOverride ? uiSelectedModelApiId : effectiveModelApiId) || ""
    if (!providerSlug || !modelApiId) return
    persistFrontAiSelection(String(providerSlug), String(modelApiId), useSelectionOverride ? uiSelectedType : selectedType)
  }, [
    currentProviderGroup?.provider?.slug,
    effectiveModelApiId,
    forceSelectionSync,
    persistFrontAiSelection,
    selectedType,
    submitMode,
    uiProviderGroup?.provider?.slug,
    uiSelectedModelApiId,
    uiSelectedType,
    useSelectionOverride,
  ])

  const resolveProviderGroupByModelApiId = React.useCallback(
    (modelApiId?: string | null) => {
      const apiId = String(modelApiId || "").trim()
      if (!apiId) return null
      const byType = uiConfig?.providers_by_type as Record<string, unknown> | undefined
      if (!byType) return null
      // Scan ALL types, not just uiSelectedType.
      // This prevents accidentally pairing a model_api_id (e.g., "sora-2") with the wrong provider group
      // when UI state/type is out of sync or selection override is active.
      for (const groupsUnknown of Object.values(byType)) {
        const groups = Array.isArray(groupsUnknown) ? (groupsUnknown as UiProviderGroup[]) : []
        const hit = groups.find((g) => (g.models || []).some((m) => m.is_available && m.model_api_id === apiId)) || null
        if (hit) return hit
      }
      return null
    },
    [uiConfig?.providers_by_type]
  )

  const selectedCapabilities = React.useMemo(() => {
    return selectedModel?.capabilities ?? {}
  }, [selectedModel?.capabilities])

  React.useEffect(() => {
    // load from sessionStorage once
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setRuntimeOptionsByModel(parsed as Record<string, Record<string, unknown>>)
      }
    } catch {
      // ignore
    }
  }, [])

  // Prompt focus + stable switching between compact single-line and multi-line modes.
  React.useEffect(() => {
    promptRef.current = String(prompt || "")
  }, [prompt])

  React.useEffect(() => {
    if (!isCompact) {
      setCompactPromptMode("multi")
      return
    }
    // compact defaults on entry (do not react to prompt changes; it causes flicker)
    const initial = promptRef.current.includes("\n") ? "multi" : "single"
    setCompactPromptMode(initial)
  }, [isCompact])

  React.useEffect(() => {
    if (!isCompact) return
    if (compactPromptMode === "single") {
      window.setTimeout(() => compactSingleTextareaRef.current?.focus(), 0)
    } else {
      window.setTimeout(() => {
        const el = promptInputRef.current
        el?.focus()
        if (el && pendingSelectionRef.current) {
          const sel = pendingSelectionRef.current
          pendingSelectionRef.current = null
          pendingCaretToEndRef.current = false
          try {
            el.setSelectionRange(sel.start, sel.end)
          } catch {
            // ignore
          }
          return
        }
        if (el && pendingCaretToEndRef.current) {
          pendingCaretToEndRef.current = false
          pendingSelectionRef.current = null
          try {
            const end = el.value.length
            el.setSelectionRange(end, end)
          } catch {
            // ignore
          }
        }
      }, 0)
    }
  }, [compactPromptMode, isCompact])

  React.useEffect(() => {
    // persist lightweight per-session (not cookies)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(runtimeOptionsByModel))
    } catch {
      // ignore (storage quota / privacy mode)
    }
  }, [runtimeOptionsByModel])

  const resizePromptTextarea = React.useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    // auto-grow up to 12 lines; then scroll
    try {
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 24 * 12)}px`
    } catch {
      // ignore
    }
  }, [])

  // Ensure textarea auto-resize also works for paste/programmatic prompt changes (not only typing).
  React.useLayoutEffect(() => {
    if (isCompact && compactPromptMode !== "multi") return
    const el = promptInputRef.current
    if (!el) return
    // defer to next frame to ensure DOM has applied the latest value/layout
    window.requestAnimationFrame(() => resizePromptTextarea(el))
  }, [compactPromptMode, isCompact, prompt, resizePromptTextarea])

  const applyRuntimeOptions = React.useCallback(
    (next: Record<string, unknown>) => {
      setRuntimeOptions(next)
      if (!selectedModelDbId) return
      setRuntimeOptionsByModel((prev) => ({ ...prev, [selectedModelDbId]: next }))
    },
    [selectedModelDbId]
  )

  // In Timeline, the parent passes "last used model" as initial props.
  // Once the user manually changes the selection, we must not keep forcing those initial props,
  // otherwise the UI will snap back. But when the conversation changes, we do want to re-apply
  // the new conversation's initial selection.
  React.useEffect(() => {
    selectionDirtyRef.current = false
  }, [conversationId])

  React.useEffect(() => {
    if (!currentProviderGroups.length) return
    if (forceSelectionSync) return
    if (selectionDirtyRef.current) return

    const wantedModel = (selectionOverride?.modelApiId || initialSelectedModel || "").trim()
    const wantedProviderSlug = (selectionOverride?.providerSlug || initialProviderSlug || "").trim()

    const findGroupByModel = wantedModel
      ? currentProviderGroups.find((g) => (g.models || []).some((m) => m.is_available && m.model_api_id === wantedModel))
      : null
    const findGroupBySlug = wantedProviderSlug ? currentProviderGroups.find((g) => g.provider.slug === wantedProviderSlug) : null
    const desiredProviderId = (findGroupByModel || findGroupBySlug)?.provider.id
    if (desiredProviderId && desiredProviderId !== selectedProviderId) {
      setSelectedProviderId(desiredProviderId)
      return
    }

    // If current selected provider is valid, keep it; otherwise fallback to first.
    if (selectedProviderId && currentProviderGroups.some((g) => g.provider.id === selectedProviderId)) {
      return
    }
    const nextProviderId = currentProviderGroups[0]?.provider.id
    if (nextProviderId && nextProviderId !== selectedProviderId) setSelectedProviderId(nextProviderId)
  }, [currentProviderGroups, forceSelectionSync, initialProviderSlug, initialSelectedModel, selectedProviderId, selectionOverride])

  React.useEffect(() => {
    if (!uiConfig) return
    if (forceSelectionSync) return
    if (selectionDirtyRef.current) return
    const wantedModel = (selectionOverride?.modelApiId || initialSelectedModel || "").trim()
    const wantedProviderSlug = (selectionOverride?.providerSlug || initialProviderSlug || "").trim()
    const wantedType = ((selectionOverride?.modelType as ModelType) || (initialModelType as ModelType) || "").trim() as ModelType

    const byModel = wantedModel ? findSelectionByModel(wantedModel) : null
    const bySlug = !byModel && wantedProviderSlug ? findSelectionByProviderSlug(wantedProviderSlug) : null
    const allowed = new Set<ModelType>((uiConfig.model_types || []) as ModelType[])
    const nextType = byModel?.modelType || bySlug?.modelType || (allowed.has(wantedType) ? wantedType : null)

    if (nextType && nextType !== selectedType) {
      setSelectedType(nextType)
    }

    if (nextType) {
      const groups = (uiConfig.providers_by_type?.[nextType] || []) as UiProviderGroup[]
      const nextProviderId =
        (wantedModel && groups.find((g) => (g.models || []).some((m) => m.model_api_id === wantedModel))?.provider.id) ||
        (wantedProviderSlug && groups.find((g) => g.provider.slug === wantedProviderSlug)?.provider.id) ||
        groups[0]?.provider.id ||
        ""
      if (nextProviderId && nextProviderId !== selectedProviderId) {
        setSelectedProviderId(nextProviderId)
      }
      if (wantedModel && groups.some((g) => (g.models || []).some((m) => m.model_api_id === wantedModel))) {
        setSelectedSubModel(wantedModel)
      }
    }
  }, [
    findSelectionByModel,
    findSelectionByProviderSlug,
    forceSelectionSync,
    initialModelType,
    initialProviderSlug,
    initialSelectedModel,
    selectedProviderId,
    selectedType,
    selectionOverride?.modelApiId,
    selectionOverride?.modelType,
    selectionOverride?.providerSlug,
    uiConfig,
  ])

  React.useEffect(() => {
    if (!forceSelectionSync) return
    if (!uiConfig) return
    const wantedModel = (selectionOverride?.modelApiId || initialSelectedModel || "").trim()
    const wantedProviderSlug = (selectionOverride?.providerSlug || initialProviderSlug || "").trim()
    const wantedType = ((selectionOverride?.modelType as ModelType) || (initialModelType as ModelType) || "").trim() as ModelType
    const allowed = new Set<ModelType>((uiConfig.model_types || []) as ModelType[])

    const byModel = wantedModel ? findSelectionByModel(wantedModel) : null
    const bySlug = !byModel && wantedProviderSlug ? findSelectionByProviderSlug(wantedProviderSlug) : null
    const nextType = byModel?.modelType || bySlug?.modelType || (allowed.has(wantedType) ? wantedType : null)

    const typeToUse = nextType || selectedType
    if (nextType && nextType !== selectedType) {
      setSelectedType(nextType)
    }

    const groups = (uiConfig.providers_by_type?.[typeToUse] || []) as UiProviderGroup[]
    if (!groups.length) return

    const desiredGroup =
      (wantedModel && groups.find((g) => (g.models || []).some((m) => m.is_available && m.model_api_id === wantedModel))) ||
      (wantedProviderSlug && groups.find((g) => g.provider.slug === wantedProviderSlug)) ||
      null
    if (desiredGroup && desiredGroup.provider.id !== selectedProviderId) {
      setSelectedProviderId(desiredGroup.provider.id)
    }
    if (wantedModel) {
      setSelectedSubModel(wantedModel)
    }
  }, [
    findSelectionByModel,
    findSelectionByProviderSlug,
    forceSelectionSync,
    initialModelType,
    initialProviderSlug,
    initialSelectedModel,
    selectedProviderId,
    selectedType,
    selectionOverride,
    uiConfig,
  ])

  React.useLayoutEffect(() => {
    if (!forceSelectionSync) return
    if (!uiConfig) return
    const wantedModel = (selectionOverride?.modelApiId || initialSelectedModel || "").trim()
    const wantedProviderSlug = (selectionOverride?.providerSlug || initialProviderSlug || "").trim()
    const wantedType = ((selectionOverride?.modelType as ModelType) || (initialModelType as ModelType) || "").trim() as ModelType
    const allowed = new Set<ModelType>((uiConfig.model_types || []) as ModelType[])

    const byModel = wantedModel ? findSelectionByModel(wantedModel) : null
    const bySlug = !byModel && wantedProviderSlug ? findSelectionByProviderSlug(wantedProviderSlug) : null
    const targetType = byModel?.modelType || bySlug?.modelType || (allowed.has(wantedType) ? wantedType : null)

    if (targetType && targetType !== selectedType) {
      setSelectedType(targetType)
      return
    }

    const typeToUse = targetType || selectedType
    const groups = (uiConfig.providers_by_type?.[typeToUse] || []) as UiProviderGroup[]
    if (!groups.length) return

    const desiredGroup =
      (wantedModel && groups.find((g) => (g.models || []).some((m) => m.is_available && m.model_api_id === wantedModel))) ||
      (wantedProviderSlug && groups.find((g) => g.provider.slug === wantedProviderSlug)) ||
      null
    const desiredProviderId = desiredGroup?.provider.id || groups[0]?.provider.id || ""
    if (desiredProviderId && desiredProviderId !== selectedProviderId) {
      setSelectedProviderId(desiredProviderId)
    }

    let desiredModelId = ""
    if (wantedModel && groups.some((g) => (g.models || []).some((m) => m.is_available && m.model_api_id === wantedModel))) {
      desiredModelId = wantedModel
    } else if (desiredGroup) {
      desiredModelId = desiredGroup.models.find((m) => m.is_default)?.model_api_id || desiredGroup.models[0]?.model_api_id || ""
    }
    if (desiredModelId && desiredModelId !== selectedSubModel) {
      setSelectedSubModel(desiredModelId)
    }
  }, [
    findSelectionByModel,
    findSelectionByProviderSlug,
    forceSelectionSync,
    initialModelType,
    initialProviderSlug,
    initialSelectedModel,
    selectedProviderId,
    selectedSubModel,
    selectedType,
    selectionOverride,
    uiConfig,
  ])

  React.useEffect(() => {
    if (!selectableModels.length) return
    // If the user has interacted with selection controls (tabs/provider/model),
    // do not auto-reset their choice just because provider/type changed and `selectableModels` recomputed.
    if (selectionDirtyRef.current) return
    if (forceSelectionSync) return
    const initial = (initialSelectedModel || "").trim()
    const picked =
      (initial && selectableModels.find((m) => m.model_api_id === initial)) ||
      selectableModels.find((m) => m.is_default) ||
      selectableModels[0] ||
      null
    setSelectedSubModel(picked?.model_api_id || "")
  }, [forceSelectionSync, initialSelectedModel, selectableModels])

  // Apply FrontAI->Timeline initial options once (best-effort), before auto-send triggers.
  const initialOptionsAppliedRef = React.useRef(false)
  React.useEffect(() => {
    if (initialOptionsAppliedRef.current) return
    if (!initialOptions || typeof initialOptions !== "object") return
    if (!selectedModelDbId) return
    initialOptionsAppliedRef.current = true
    applyRuntimeOptions(initialOptions)
  }, [applyRuntimeOptions, initialOptions, selectedModelDbId])

  // 항상 "선택된 모델"이 유지되도록 강제 (선택값이 현재 목록에 없으면 default/첫번째로 복구)
  React.useEffect(() => {
    if (!selectableModels.length) {
      setSelectedSubModel("")
      return
    }
    if (selectedSubModel && selectableModels.some((m) => m.model_api_id === selectedSubModel)) return
    const picked = selectableModels.find((m) => m.is_default) || selectableModels[0]
    setSelectedSubModel(picked.model_api_id)
  }, [selectableModels, selectedSubModel])

  // 모델이 바뀌면: 이전에 선택했던 옵션이 있으면 복원, 없으면 defaults 적용
  React.useEffect(() => {
    if (!selectedModelDbId) return
    const saved = runtimeOptionsByModel[selectedModelDbId]
    if (saved && typeof saved === "object") {
      setRuntimeOptions(saved)
      return
    }
    const cap = selectedCapabilities
    const defaults = cap && isRecord(cap.defaults) ? (cap.defaults as Record<string, unknown>) : {}
    setRuntimeOptions(defaults)
  }, [runtimeOptionsByModel, selectedCapabilities, selectedModelDbId])

  React.useEffect(() => {
    const controller = new AbortController()
    async function loadSuggestions() {
      try {
        const qs = new URLSearchParams()
        qs.set("limit", "24")
        qs.set("model_type", useSelectionOverride ? uiSelectedType : selectedType)
        const res = await fetch(`${CHAT_PROMPT_SUGGESTIONS_API}?${qs.toString()}`, {
          signal: controller.signal,
          headers: { ...authHeaders() },
        })
        const rawJson: unknown = await res.json().catch(() => ({}))
        const json = isRecord(rawJson) ? rawJson : {}
        if (!res.ok || json.ok !== true) throw new Error("PROMPT_SUGGESTIONS_FAILED")
        const rows = Array.isArray(json.rows) ? json.rows : []
        setPromptSuggestions(
          rows
            .map((r): { id: string; model_type: ModelType | null; model_id: string | null; title: string | null; text: string; sort_order: number; metadata?: Record<string, unknown> } => {
              const rr = isRecord(r) ? r : {}
              const id = String(rr.id || "")
              const model_type = safeString(rr.model_type) as ModelType | null
              const model_id = rr.model_id ? String(rr.model_id) : null
              const title = typeof rr.title === "string" && rr.title.trim() ? rr.title.trim() : null
              const text = String(rr.text || "")
              const sort_order = Number(rr.sort_order || 0)
              const metadata = rr.metadata && isRecord(rr.metadata) ? rr.metadata : undefined
              return { id, model_type: model_type || null, model_id, title, text, sort_order, metadata }
            })
            .filter((r) => Boolean(r.id) && Boolean(r.text))
        )
      } catch {
        setPromptSuggestions([])
      }
    }
    void loadSuggestions()
    return () => controller.abort()
  }, [authHeaders, selectedType, uiSelectedType, useSelectionOverride])

  const updateScrollButtons = React.useCallback(() => {
    if (!scrollContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
    setShowLeftArrow(scrollLeft > 0)
    setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1)
  }, [])

  React.useEffect(() => {
    updateScrollButtons()
    window.addEventListener("resize", updateScrollButtons)
    return () => window.removeEventListener("resize", updateScrollButtons)
  }, [currentProviderGroups, updateScrollButtons])

  React.useEffect(() => {
    if (!isCompact || !isCompactPanelOpen) return
    const t = window.setTimeout(() => updateScrollButtons(), 0)
    return () => window.clearTimeout(t)
  }, [isCompact, isCompactPanelOpen, updateScrollButtons])

  // Timeline compact top panel: close on outside click
  React.useEffect(() => {
    if (!isCompact) return
    if (!isCompactPanelOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      const trigger = compactPanelTriggerRef.current
      const floating = compactPanelFloatingRef.current
      if (!target) return

      // Ignore clicks inside Radix popper portals (dropdowns, etc.)
      if (target.closest?.('[data-radix-popper-content-wrapper]')) return

      if (trigger?.contains(target)) return
      if (floating?.contains(target)) return
      setIsCompactPanelOpen(false)
    }

    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [isCompact, isCompactPanelOpen])

  const scrollLeft = () => scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" })
  const scrollRight = () => scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" })

  const hasOptions = ["image", "video", "audio", "music"].includes(uiSelectedType)

  const handleSend = React.useCallback(
    async (overrideInput?: string, overrideModelApiId?: string) => {
      const baseInput = (overrideInput ?? prompt).trim()
      const attachmentCtx = buildAttachmentContext(attachments)
      const input = `${baseInput}${attachmentCtx ? `\n\n${attachmentCtx}` : ""}`.trim()
      if (!input) return

      // Prevent accidental double-send (e.g. Enter + click, or repeated key events).
      const sendModelType = useSelectionOverride ? uiSelectedType : selectedType
      const sendModelApiId = String(overrideModelApiId || (useSelectionOverride ? uiSelectedModelApiId : effectiveModelApiId) || "").trim()
      const sendKey = `${conversationId || ""}::${sendModelType}::${sendModelApiId}::${input}`
      if (handleSendInFlightRef.current.has(sendKey)) return
      handleSendInFlightRef.current.add(sendKey)

      const capDefaults = selectedCapabilities && isRecord(selectedCapabilities.defaults) ? (selectedCapabilities.defaults as Record<string, unknown>) : {}
      const finalOptions = { ...capDefaults, ...(runtimeOptions || {}) }

      const requestedModelApiId = String(overrideModelApiId || (useSelectionOverride ? uiSelectedModelApiId : effectiveModelApiId) || "").trim()
      const providerGroup = resolveProviderGroupByModelApiId(requestedModelApiId) || (useSelectionOverride ? uiProviderGroup : currentProviderGroup)
      const providerSlug = providerGroup?.provider.slug
      const providerId = providerGroup?.provider.id
      // Keep the requested model_api_id if present.
      // Do NOT silently replace it with providerGroup's first model, otherwise we can end up sending the wrong model/provider pair.
      const modelApiId =
        requestedModelApiId ||
        (providerGroup?.models || []).find((m) => m.is_available && String(m.model_api_id || "").trim())?.model_api_id ||
        ""
      if (!providerSlug || !providerId || !modelApiId) {
        alert("사용 가능한 모델이 없습니다. Admin에서 모델/제공업체 설정을 확인해주세요.")
        return
      }

      persistFrontAiSelection(providerSlug, modelApiId, sendModelType)

      onMessage?.({
        role: "user",
        content: input,
        contentJson: { text: input, options: finalOptions, attachments: attachments.map((a) => (a.kind === "link" ? { kind: "link", url: a.url, title: a.title || "" } : { kind: a.kind, name: a.name, mime: a.mime, size: a.size })) },
        summary: userSummary(baseInput),
        providerSlug,
        model: modelApiId,
      })
      setPrompt("")
      clearAttachments()

      if (submitMode === "emit") {
        onSubmit?.({ input, providerSlug, model: modelApiId, modelType: sendModelType, options: finalOptions })
        return
      }

      try {
        const maxTokens = sendModelType === "text" ? 2048 : 512
        const res = await fetch(CHAT_RUN_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            model_type: sendModelType,
            conversation_id: conversationId || null,
            userPrompt: input,
            max_tokens: maxTokens,
            session_language: sessionLanguage || null,
            provider_id: providerId,
            provider_slug: providerSlug,
            model_api_id: modelApiId,
            options: finalOptions,
          }),
        })

        const raw = await res.text()
        let jsonUnknown: unknown = {}
        try {
          jsonUnknown = raw ? (JSON.parse(raw) as unknown) : {}
        } catch {
          jsonUnknown = {}
        }
        const json = isRecord(jsonUnknown) ? jsonUnknown : {}

        if (!res.ok) {
          const msg = (typeof json.message === "string" ? String(json.message) : "") || raw || "AI 응답 실패"
          const details = typeof json.details === "string" ? `\n${String(json.details)}` : ""
          throw new Error(`${msg}${details}`)
        }

        const outText = String(json.output_text || "")
        const conv = json.conversation_id ? String(json.conversation_id) : ""
        if (conv && conv !== (conversationId || "")) onConversationId?.(conv)
        const chosenObj = isRecord(json.chosen) ? json.chosen : {}
        const chosenModel = chosenObj.model_api_id ? String(chosenObj.model_api_id) : modelApiId

        // Always attempt to parse block-json so non-text modes can render rich results too.
        const parsed = normalizeAiContent(outText, isRecord(json.content) ? json.content : null)
        // If parsing failed (often because the model returned JSON-ish text that isn't strict JSON),
        // keep it under `output_text` so Timeline can still normalize/parse it for ProseMirrorViewer.
        const normalizedContent =
          parsed.parsed && isRecord(parsed.parsed) ? normalizeBlockJson(parsed.parsed) : ({ output_text: outText } as Record<string, unknown>)
        onMessage?.({
          role: "assistant",
          content: parsed.displayText,
          contentJson: normalizedContent,
          summary: assistantSummary(typeof parsed.parsed?.summary === "string" ? parsed.parsed.summary : outText),
          providerSlug,
          model: chosenModel,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        onMessage?.({
          role: "assistant",
          content: `요청 처리 중 오류가 발생했습니다.\n\n${msg}`,
          contentJson: { text: msg },
          summary: assistantSummary(msg),
          providerSlug,
          model: modelApiId,
        })
      } finally {
        handleSendInFlightRef.current.delete(sendKey)
      }
    },
    [
      assistantSummary,
      authHeaders,
      attachments,
      buildAttachmentContext,
      clearAttachments,
      conversationId,
      currentProviderGroup,
      effectiveModelApiId,
      persistFrontAiSelection,
      uiProviderGroup,
      uiSelectedModelApiId,
      uiSelectedType,
      useSelectionOverride,
      resolveProviderGroupByModelApiId,
      onConversationId,
      onMessage,
      onSubmit,
      prompt,
      runtimeOptions,
      selectedCapabilities,
      selectedType,
      sessionLanguage,
      submitMode,
      userSummary,
    ]
  )

  // Timeline/FrontAI initial prompt auto-send (once)
  const autoSentRef = React.useRef<string>("")
  React.useEffect(() => {
    if (submitMode !== "send") return
    const p = String(autoSendPrompt || "").trim()
    if (!p) return
    if (!uiConfig) return
    if (!currentProviderGroup?.provider?.id && !effectiveModelApiId) return

    // If an initial provider/model is specified (FrontAI -> Timeline), wait until
    // the UI selection has actually applied before auto-sending.
    const desiredProviderSlug = String(initialProviderSlug || "").trim()
    const desiredModelApiId = String(initialSelectedModel || "").trim()
    if (desiredProviderSlug && currentProviderGroup?.provider?.slug && currentProviderGroup.provider.slug !== desiredProviderSlug) return
    if (desiredModelApiId) {
      const desiredGroup = resolveProviderGroupByModelApiId(desiredModelApiId)
      if (!desiredGroup) return
    }

    if (autoSentRef.current === p) return
    autoSentRef.current = p
    void handleSend(p, desiredModelApiId || undefined)
  }, [
    autoSendPrompt,
    currentProviderGroup?.provider?.id,
    currentProviderGroup?.provider?.slug,
    handleSend,
    initialProviderSlug,
    initialSelectedModel,
    effectiveModelApiId,
    resolveProviderGroupByModelApiId,
    submitMode,
    uiConfig,
  ])

  const ModeTabs = () => (
    <div className="flex flex-col gap-[10px] items-start relative shrink-0 w-full">
      <div className="bg-muted box-border flex h-[36px] items-center justify-center p-[3px] relative rounded-[8px] shrink-0 w-full">
        {(uiConfig?.model_types || []).map((t) => (
          <div
            key={t}
            className={cn(
              "box-border flex flex-[1_0_0] flex-col gap-[10px] h-[29px] items-center justify-center px-[8px] py-[4px] relative rounded-[6px] shrink-0 cursor-pointer transition-colors",
              uiSelectedType === t ? "bg-background border border-border shadow-sm" : "hover:bg-background/50"
            )}
            onClick={() => {
              // 같은 타입을 다시 누르면 상태를 초기화하지 않습니다 (드롭다운 선택 유지)
              if (uiSelectedType === t) return
              selectionDirtyRef.current = true
              setSelectedType(t)
              setSelectedProviderId("")
              setSelectedSubModel("")
              setRuntimeOptions({})
              const groups = (uiConfig?.providers_by_type?.[t] || []) as UiProviderGroup[]
              const firstGroup = groups[0]
              const firstModel = firstGroup?.models?.find((m) => m.is_available)?.model_api_id || ""
              if (firstGroup?.provider?.slug && firstModel) {
                persistFrontAiSelection(String(firstGroup.provider.slug), String(firstModel), t)
              }
            }}
          >
            <p className={cn("font-medium leading-[20px] text-[14px]", uiSelectedType === t ? "text-foreground" : "text-muted-foreground")}>{tabLabel(t)}</p>
          </div>
        ))}
      </div>
    </div>
  )

  const ModelGrid = () => (
    <div className="relative w-full group">
      {showLeftArrow && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 -ml-4 hidden sm:block">
          <Button variant="ghost" size="icon" className="rounded-full bg-background shadow-md border hover:bg-accent h-8 w-8" onClick={scrollLeft}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
      {/* 모델 그리드 선택 영역 */}
      <div ref={scrollContainerRef} onScroll={updateScrollButtons} className="flex flex-row gap-3 items-start justify-start relative w-full overflow-x-auto scrollbar-hide px-2 py-2">
        {uiProviderGroups.map((g) => (
          <div
            key={g.provider.id}
            className={cn(
              "bg-card border border-border flex flex-col items-start p-2 lg:p-4 rounded-md shrink-0 min-w-[100px] w-[120px] lg:w-[160px] cursor-pointer transition-all hover:shadow-md",
              uiProviderGroup?.provider.id === g.provider.id ? "border-1 border-primary bg-accent" : ""
            )}
            onClick={() => {
              selectionDirtyRef.current = true
              setSelectedProviderId(g.provider.id)
              const firstModel = g.models?.find((m) => m.is_available)?.model_api_id || ""
              if (g.provider.slug && firstModel) {
                persistFrontAiSelection(g.provider.slug, String(firstModel), uiSelectedType)
              }
            }}
          >
            <div className="flex w-full justify-between items-center">
              <div
                className={cn(
                  "size-[40px] flex items-center justify-center rounded-full",
                  uiProviderGroup?.provider.id === g.provider.id ? "bg-primary" : "bg-muted border border-border"
                )}
              >
                <ProviderLogo
                  logoKey={g.provider.logo_key || undefined}
                  className={cn("size-[24px]", uiProviderGroup?.provider.id === g.provider.id ? "text-primary-foreground" : "text-foreground")}
                />
              </div>
              <div className="flex flex-col items-center justify-center relative shrink-0">
                {uiProviderGroup?.provider.id === g.provider.id ? (
                  <div className="border border-ring rounded-full shadow-sm shrink-0 size-[16px] relative flex items-center justify-center">
                    <div className="size-[8px] rounded-full bg-primary" />
                  </div>
                ) : (
                  <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-[16px]" />
                )}
              </div>
            </div>
            <div className="flex w-full flex-col items-start relative shrink-0 mt-2">
              <div className="flex w-full justify-between items-center">
                <p className="font-medium text-card-foreground text-[14px] truncate">{g.provider.product_name}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showRightArrow && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 -mr-4 hidden sm:block">
          <Button variant="ghost" size="icon" className="rounded-full bg-background shadow-md border hover:bg-accent h-8 w-8" onClick={scrollRight}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )

  const providerTitle = uiProviderGroup?.provider.product_name || ""
  const providerDesc = uiProviderGroup?.provider.description || ""

  const visiblePromptSuggestions = React.useMemo(() => {
    // model_id 지정된 suggestion은 현재 선택 모델에만 노출
    const list = promptSuggestions || []
    const filtered = list.filter((s) => !s.model_id || !uiSelectedModelDbId || s.model_id === uiSelectedModelDbId)
    return filtered.slice(0, 8)
  }, [promptSuggestions, uiSelectedModelDbId])

  if (uiLoading && !uiConfig) {
    return <div className={cn("w-full max-w-[800px] p-6 text-sm text-muted-foreground", className)}>모델 설정을 불러오는 중...</div>
  }

  return (
    <div className="flex flex-row gap-4 items-center justify-center w-full">
      <div className={`flex flex-col gap-[16px] items-center relative shrink-0 w-full max-w-[800px] ${className || ""}`}>
        {!isCompact && (
          <div className="w-full flex items-center gap-4">
            <PaidToken />
          </div>
        )}

        <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
          {!isCompact ? (
            <>
              <ModeTabs />
              <ModelGrid />
            </>
          ) : (
            <div className="w-full" ref={compactPanelRef}>
              {/* 타임라인 컴팩트 모드 상단 설정 부분 (패널 트리거만) */}
              {!isCompactPanelOpen && (
                <div ref={compactPanelTriggerRef} className="w-full">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-4 cursor-pointer select-none w-full text-left"
                    onClick={() => setIsCompactPanelOpen(true)}
                  >
                    <ChevronRight className={cn("size-5 transition-transform", isCompactPanelOpen ? "rotate-90" : "")} />
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1">
                        <MessageSquare className="size-4" />
                        <span className="text-sm">{tabLabel(uiSelectedType)}</span>
                      </div>
                      {uiProviderGroup && (
                        <div className="flex items-center gap-1">
                          <div className={cn("size-4 rounded-full bg-primary flex items-center justify-center")}>
                            <ProviderLogo logoKey={uiProviderGroup.provider.logo_key || undefined} className="size-3 text-primary-foreground" />
                          </div>
                          <span className="text-sm">{uiProviderGroup.provider.product_name}</span>
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-[16px] items-start relative shrink-0 w-full">
            <div className="flex flex-[1_0_0] flex-col gap-[16px] items-start h-full relative shrink-0">
              {/* (5) provider product_name / description 표시 - compact에서는 생략 */}
              {!isCompact && uiProviderGroup && (
                // 프로바이더 설명 부분
                <div className="flex gap-[10px] items-center justify-start w-full">
                  <p className="font-medium leading-[20px] text-card-foreground text-[14px] whitespace-nowrap">{providerTitle}</p>
                  <p className="font-normal leading-[20px] text-muted-foreground text-[14px] line-clamp-1 text-ellipsis overflow-hidden">{providerDesc}</p>
                </div>
              )}

              {uiProviderGroup && (
                // 채팅창 영역 부분
                <div className="bg-background border border-border box-border flex flex-col gap-0 items-center justify-between py-3 px-4 relative rounded-2xl shadow-sm shrink-0 w-full h-full">
                  {/* Compact mode floating panel: overlays above the chat card, does NOT affect layout height */}
                  {isCompact && isCompactPanelOpen ? (
                    <div ref={compactPanelFloatingRef} className="absolute left-0 right-0 bottom-full mb-2 z-50">
                      <div className="bg-background/75 rounded-md p-4 pt-2 backdrop-blur supports-[backdrop-filter]:bg-backgronund/75 ">
                        <div className="flex items-center gap-2 mb-3">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md hover:bg-accent/60 transition-colors p-1"
                            aria-label="접기"
                            onClick={() => setIsCompactPanelOpen(false)}
                          >
                            <ChevronDown className="size-5" />
                          </button>
                          <PaidToken />
                        </div>
                        <ModeTabs />
                        <div className="max-h-[320px] overflow-y-auto mt-3">
                          <ModelGrid />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className={cn("flex flex-1 gap-2 items-start justify-start w-full flex-wrap", attachments.length ? "" : "hidden")}>
                    {/* 첨부파일 및 미디어 삽입영역 */}
                    {attachments.map((a) => (
                      <Card key={a.id} className="group relative flex items-center gap-2 px-2 py-1 rounded-md border bg-muted/40">
                        {a.kind === "image" ? (
                          <img src={a.previewUrl} alt={a.name} className="size-7 rounded object-cover border" />
                        ) : a.kind === "link" ? (
                          <div className="size-7 rounded border bg-background flex items-center justify-center">
                            <Link2 className="size-4 text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="size-7 rounded border bg-background flex items-center justify-center">
                            <Paperclip className="size-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate max-w-[220px]">
                            {a.kind === "link" ? (a.title || a.url) : a.name}
                          </p>
                          {a.kind === "link" ? (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">{a.url}</p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                              {a.kind === "image" ? "이미지" : "파일"}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 size-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-background border"
                          onClick={() => removeAttachment(a.id)}
                        >
                          <X className="size-3" />
                        </Button>
                      </Card>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 items-center justify-center relative shrink-0 w-full">
                    {/* FrontAI(default): textarea always. Timeline(compact): textarea only when multi-line mode. */}
                    {/* FrontAI 프롬프트 입력창 */}
                    {!isCompact || compactPromptMode === "multi" ? (
                      <textarea
                        ref={promptInputRef}
                        placeholder={uiSelectedModelLabel}
                        className="w-full border-none outline-none text-[16px] placeholder:text-muted-foreground bg-transparent resize-none overflow-y-auto leading-6"
                        value={prompt}
                        rows={1}
                        style={{ maxHeight: 24 * 12 }}
                        onChange={(e) => {
                          setPrompt(e.target.value)
                          const el = e.currentTarget
                          resizePromptTextarea(el)

                          if (isCompact) {
                            // Switch back to compact single input when it becomes single-line again.
                            const v = String(e.target.value || "")
                            if (!v.includes("\n")) {
                                // Prevent flicker: once upgraded to multi, keep it for a short cooldown,
                                // and only downgrade when the content is clearly short enough.
                                const cooldownMs = 500
                                const sinceUpgraded = Date.now() - (compactUpgradedAtRef.current || 0)
                                if (sinceUpgraded < cooldownMs) return
                                if (v.trim().length > 40) return
                                // use scrollHeight as a cheap line-count proxy (best-effort)
                                const oneLine = el.scrollHeight <= 24 * 1.6
                                if (oneLine) setCompactPromptMode("single")
                            }
                          }
                        }}
                        onPaste={() => {
                          // Sometimes scrollHeight isn't stable until after paste is applied.
                          window.requestAnimationFrame(() => resizePromptTextarea(promptInputRef.current))
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return
                          if ((e.nativeEvent as { isComposing?: boolean })?.isComposing) return
                          if (isComposingRef.current) return

                          // Shift+Enter: newline
                          if (e.shiftKey) return

                          // Enter: send
                          e.preventDefault()
                          void handleSend(e.currentTarget.value)
                        }}
                        onCompositionStart={() => (isComposingRef.current = true)}
                        onCompositionEnd={() => (isComposingRef.current = false)}
                      />
                    ) : null}
                    {!isCompact && !prompt.trim() && (
                      <p className="text-xs text-left w-full text-muted-foreground">Shift + Enter로 줄바꿈</p>
                    )}
                  </div>

                 
                  {/* 채팅창 안 하단 옵션 부분 - +버튼, 웹검색, 모델선택 드롭다운  */}
                  <div className="flex gap-0 items-center relative shrink-0 w-full flex-between mt-auto">

                    <div className="flex flex-1 gap-2 items-center relative shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="rounded-full">
                            <Plus className="size-6" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel>첨부</DropdownMenuLabel>
                          <DropdownMenuGroup>
                            {/* text / video / music / audio / code: 파일 및 이미지 첨부 */}
                            {(["text", "video", "music", "audio", "code"] as ModelType[]).includes(uiSelectedType as ModelType) ? (
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  fileInputRef.current?.click()
                                }}
                              >
                                <Paperclip className="mr-2 size-4" />
                                파일 및 이미지 첨부
                              </DropdownMenuItem>
                            ) : null}

                            {/* image: 이미지 첨부 */}
                            {uiSelectedType === "image" ? (
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  imageInputRef.current?.click()
                                }}
                              >
                                <ImageIcon className="mr-2 size-4" />
                                이미지 첨부
                              </DropdownMenuItem>
                            ) : null}

                            {/* audio / text / code: 링크추가 */}
                            {(["text", "audio", "code"] as ModelType[]).includes(uiSelectedType as ModelType) ? (
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  setIsLinkDialogOpen(true)
                                }}
                              >
                                <Link2 className="mr-2 size-4" />
                                링크추가
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1"><span className="text-sm hidden md:block text-muted-foreground">웹검색</span><Globe className="size-4 md:hidden text-muted-foreground" /><Switch /></div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>웹검색을 통해 최신 정보를 반영합니다.</p>
                        </TooltipContent>
                      </Tooltip>
                      {/* Timeline compact: single-line prompt textarea (looks like input, switches to multi textarea when it wraps) */}
                      {/* 타임라인 컴팩트: 한 줄 프롬프트 입력창(인풋처럼 보이며, 줄이 바뀔 때 멀티라인 텍스트에어리어로 전환됨) */}
                      <div className={cn("flex flex-1 items-center", isCompact && compactPromptMode === "single" ? "" : "hidden")}>
                        <textarea
                          ref={compactSingleTextareaRef}
                          value={prompt}
                          rows={1}
                          wrap="off"
                          placeholder="프롬프트를 입력해주세요"
                          className="w-full border-none outline-none leading-6 px-0 py-2 bg-transparent text-4 placeholder:text-muted-foreground resize-none overflow-hidden"
                          onChange={(e) => {
                            const v = e.currentTarget.value
                            setPrompt(v)
                            // If it would wrap (or contains newline), upgrade to multi textarea.
                            const el = e.currentTarget
                            // Defer measurement to next frame so scrollWidth reflects updated layout.
                            window.requestAnimationFrame(() => {
                              const shouldMulti = v.includes("\n") || el.scrollWidth > el.clientWidth + 2
                              if (shouldMulti) {
                                // Preserve caret position when switching to multi textarea.
                                try {
                                  const start = typeof el.selectionStart === "number" ? el.selectionStart : v.length
                                  const end = typeof el.selectionEnd === "number" ? el.selectionEnd : v.length
                                  pendingSelectionRef.current = { start, end }
                                } catch {
                                  pendingSelectionRef.current = { start: v.length, end: v.length }
                                }
                                compactUpgradedAtRef.current = Date.now()
                                setCompactPromptMode("multi")
                              }
                            })
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return
                            if ((e.nativeEvent as { isComposing?: boolean })?.isComposing) return
                            if (isComposingRef.current) return

                            // Shift+Enter: upgrade to textarea and insert newline
                            if (e.shiftKey) {
                              e.preventDefault()
                              pendingCaretToEndRef.current = true
                              pendingSelectionRef.current = null
                              compactUpgradedAtRef.current = Date.now()
                              setCompactPromptMode("multi")
                              setPrompt((p) => `${p}\n`)
                              return
                            }

                            // Enter: send
                            e.preventDefault()
                            void handleSend(e.currentTarget.value)
                          }}
                        />
                      </div>
                    </div>


                    <div className="flex gap-[10px] items-center relative shrink-0" >
                      {/* 모델 선택 드롭다운 */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant={isCompact ? "outline" : "ghost"} className={cn(isCompact ? "h-[36px] rounded-lg gap-2 px-3" : "h-[36px] rounded-[8px] gap-2 px-4")}>
                          {String(uiSelectedModel?.display_name || "").trim() || "-"}
                          <ChevronDown className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[160px]" align="start">
                        <DropdownMenuLabel>모델 선택</DropdownMenuLabel>
                        <DropdownMenuGroup>
                          {uiSelectableModels.map((m) => (
                            <DropdownMenuItem
                              key={m.model_api_id}
                              onClick={() => {
                                selectionDirtyRef.current = true
                                setSelectedSubModel(m.model_api_id)
                                if (uiProviderGroup?.provider?.slug && m.model_api_id) {
                                  persistFrontAiSelection(String(uiProviderGroup.provider.slug), String(m.model_api_id), uiSelectedType)
                                }
                              }}
                            >
                              {m.display_name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button className="rounded-full h-[36px] w-[36px] p-0" onClick={() => void handleSend()} disabled={!prompt.trim()}>
                      <ArrowUp className="size-4" />
                    </Button>   
                    </div>

                  </div>

                  {/* Hidden pickers */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={(e) => {
                      addFiles(e.currentTarget.files, "mixed")
                      e.currentTarget.value = ""
                    }}
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      addFiles(e.currentTarget.files, "image_only")
                      e.currentTarget.value = ""
                    }}
                  />

                  {/* Link dialog */}
                  <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>링크 추가</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">URL</p>
                          <Input
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            placeholder="https://example.com"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">표시 이름(선택)</p>
                          <Input
                            value={linkTitle}
                            onChange={(e) => setLinkTitle(e.target.value)}
                            placeholder="예: 참고 자료"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsLinkDialogOpen(false)
                          }}
                        >
                          취소
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            const raw = String(linkUrl || "").trim()
                            if (!raw) return
                            const url = /^(https?:)?\/\//i.test(raw) ? raw : `https://${raw}`
                            setAttachments((prev) => [
                              ...prev,
                              { id: `link_${Date.now()}_${Math.random().toString(16).slice(2)}`, kind: "link", url, title: String(linkTitle || "").trim() || undefined },
                            ])
                            setLinkUrl("")
                            setLinkTitle("")
                            setIsLinkDialogOpen(false)
                          }}
                        >
                          추가
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
 
                  
                

                 
                </div>

              )}
            </div>


            
          </div>
        </div>
        {/* 모드탭, 모델그리드, 채팅창 종료 */}




         {/* 아래 내용 예시 프롬프트 제안 및  줄어들었을 때 옵션 표시 - 좁은 화면에서 나타남 */}
         <div className="flex gap-[16px] items-start relative shrink-0 w-full">
          
              <div className="flex flex-wrap gap-2 w-full">
              {/* 예시 프롬프트 제안 표시 */}
              {visiblePromptSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 w-full">
                  {visiblePromptSuggestions.map((s) => {
                    const label = s.title || clampText(s.text, 24)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-accent transition-colors"
                        onClick={() => {
                          setPrompt(s.text)
                          // focus after state update
                          window.setTimeout(() => promptInputRef.current?.focus(), 0)
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
              </div>

              {/* 옵션창 - 아래 있는 옵션 */}
              {/* - compact(Timeline 하단)에서는 화면 크기와 무관하게 항상 노출(드로어) */}
              {/* - default(FrontAI)에서는 좁은 화면에서만 노출(xl:hidden) */}
                {hasOptions && (
                  <div className={cn("w-full lg:w-[420px] block", isCompact ? "" : "xl:hidden")}>
                    <Drawer>
                      <DrawerTrigger asChild>
                        <div className="bg-card border border-border flex gap-2 items-center p-2 rounded-md w-full cursor-pointer hover:bg-accent/50 transition-colors">
                          <Settings2 className="size-4" />
                          <p className="text-sm font-medium text-card-foreground truncate text-ellipsis line-clamp-1 w-full">옵션</p>
                          <div className="size-[16px] flex items-center justify-center relative shrink-0">
                            <ChevronsUp className="size-4" />
                          </div>
                        </div>
                      </DrawerTrigger>
                      <DrawerContent>
                        <DrawerHeader>
                          <DrawerTitle>옵션</DrawerTitle>
                          {/* <DrawerDescription>ai_models.capabilities.options/defaults 기반</DrawerDescription> */}
                        </DrawerHeader>        
                        <div className="flex flex-1 flex-row">
                          <div className="flex flex-1"></div>                
                          <div className="flex p-0 min-w-[360px] max-w-[360px] pb-0 flex justify-center">
                            <ModelOptionsPanel
                              key={selectedModelDbId || "no-model"}
                              capabilities={selectedCapabilities}
                              value={runtimeOptions}
                              onApply={applyRuntimeOptions}
                            />
                          </div>                      
                          <div className="flex flex-1"></div>
                        </div>
                        <DrawerFooter>
                          <DrawerClose asChild>
                            <div className="w-full flex items-center justify-center">
                              <Button variant="outline" className="w-full min-w-[360px] max-w-[360px]">
                                닫기
                              </Button>
                            </div>
                          </DrawerClose>
                        </DrawerFooter>
                      </DrawerContent>
                    </Drawer>
                  </div>
                )}

              {!isCompact && hasOptions && !isOptionExpanded && (
                <div className="hidden xl:flex bg-card border border-border flex-col gap-2 items-center p-2 rounded-md max-w-[200px] w-full min-w-[120px] cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setIsOptionExpanded(true)}>
                  <div className="flex items-center w-full gap-[10px]">
                    <Settings2 className="size-6" />
                    <p className="text-[14px] font-medium text-card-foreground truncate w-full">옵션</p>
                    <div className="size-[16px] flex items-center justify-center relative shrink-0">
                      <ChevronsRight className="size-4" />
                    </div>
                  </div>
                </div>
              )}  

          </div>    
          {/* 아래 영역 종료 */}


      </div>
       {/* 메인 컨테이너 종료 */}


      {/* 옵션창 - 밖에 있는 옵션 - 넓은 화면에서 나타남 */}
      {!isCompact && hasOptions && isOptionExpanded && (
        <div className="hidden xl:flex bg-card border border-border flex-col gap-[16px] items-start p-3 rounded-md relative shrink-0 w-[260px] animate-in fade-in slide-in-from-left-4 duration-300">
          <div className="flex items-center gap-[10px] w-full cursor-pointer" onClick={() => setIsOptionExpanded(false)}>
            <div className="size-[16px] flex items-center justify-center relative shrink-0">
              <Settings2 className="size-full" />
            </div>
            <p className="text-sm font-medium text-card-foreground truncate w-full">옵션</p>
            <div className="size-[16px] flex items-center justify-center relative shrink-0">
              <ChevronsLeft className="size-full" />
            </div>
          </div>
          <ModelOptionsPanel
            key={selectedModelDbId || "no-model"}
            capabilities={selectedCapabilities}
            value={runtimeOptions}
            onApply={applyRuntimeOptions}
          />
        </div>
      )}

      
    </div> 
    // 전체 레이아웃 컴포넌트 종료
  )
}


