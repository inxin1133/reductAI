import * as React from "react"
import { cn } from "@/lib/utils"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  MessageSquare,
  Settings2,
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
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
  onSubmit?: (payload: { input: string; providerSlug: string; model: string }) => void
  initialSelectedModel?: string
  initialProviderSlug?: string
  autoSendPrompt?: string | null
  conversationId?: string | null
  onConversationId?: (id: string) => void
  sessionLanguage?: string
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

function tabLabel(t: ModelType) {
  const map: Record<ModelType, string> = {
    text: "채팅",
    image: "이미지",
    video: "영상",
    music: "음악",
    audio: "오디오",
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

type LlmBlockResponse = { title: string; summary: string; blocks: LlmBlock[] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function safeString(v: unknown): string | null {
  return typeof v === "string" ? v : null
}

function parseBlockJson(text: string): { parsed?: LlmBlockResponse; displayText: string } {
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

  try {
    const parsedUnknown: unknown = JSON.parse(raw)
    if (!isRecord(parsedUnknown)) return { displayText: text }
    const obj = parsedUnknown
    const blocksUnknown = obj.blocks
    if (!Array.isArray(blocksUnknown)) return { displayText: text }

    const title = typeof obj.title === "string" ? obj.title : ""
    const summary = typeof obj.summary === "string" ? obj.summary : ""
    const blocks: LlmBlock[] = []

    for (const bUnknown of blocksUnknown) {
      if (!isRecord(bUnknown)) continue
      const type = safeString(bUnknown.type)
      if (!type) continue

      if (type === "markdown") {
        const markdown = safeString(bUnknown.markdown)
        if (markdown !== null) blocks.push({ type: "markdown", markdown })
        continue
      }
      if (type === "code") {
        const language = safeString(bUnknown.language) ?? "plain"
        const code = safeString(bUnknown.code) ?? ""
        blocks.push({ type: "code", language, code })
        continue
      }
      if (type === "table") {
        const headersRaw = bUnknown.headers
        const rowsRaw = bUnknown.rows
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
    return { parsed: { title, summary, blocks }, displayText: out.filter(Boolean).join("\n\n") || text }
  } catch {
    return { displayText: text }
  }
}

export function ChatInterface({
  className,
  variant = "default",
  onMessage,
  submitMode = "send",
  onSubmit,
  initialSelectedModel,
  initialProviderSlug,
  autoSendPrompt,
  conversationId,
  onConversationId,
  sessionLanguage,
}: ChatInterfaceProps) {
  const isCompact = variant === "compact"

  const authHeaders = React.useCallback((): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const [uiLoading, setUiLoading] = React.useState(false)
  const [uiConfig, setUiConfig] = React.useState<ChatUiConfig | null>(null)

  // (2) 모드 탭: ai_models.model_type 기준
  const [selectedType, setSelectedType] = React.useState<ModelType>("text")
  // provider group 선택
  const [selectedProviderId, setSelectedProviderId] = React.useState("")
  // (4) dropdown 대상: status=active는 서버에서, is_available=true만 클라에서 필터
  const [selectedSubModel, setSelectedSubModel] = React.useState("")

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
  const isComposingRef = React.useRef(false)
  const [isCompactPanelOpen, setIsCompactPanelOpen] = React.useState(false)

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
        const first = (json.model_types?.[0] as ModelType | undefined) || "text"
        setSelectedType(first)
      } catch {
        setUiConfig(null)
      } finally {
        setUiLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  const currentProviderGroups = React.useMemo(() => {
    const map = uiConfig?.providers_by_type || {}
    // (3) provider grid: active 모델이 있는 provider만 (서버에서 이미 필터)
    return (map[selectedType] || []) as UiProviderGroup[]
  }, [uiConfig, selectedType])

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

  React.useEffect(() => {
    // persist lightweight per-session (not cookies)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(runtimeOptionsByModel))
    } catch {
      // ignore (storage quota / privacy mode)
    }
  }, [runtimeOptionsByModel])

  const applyRuntimeOptions = React.useCallback(
    (next: Record<string, unknown>) => {
      setRuntimeOptions(next)
      if (!selectedModelDbId) return
      setRuntimeOptionsByModel((prev) => ({ ...prev, [selectedModelDbId]: next }))
    },
    [selectedModelDbId]
  )

  React.useEffect(() => {
    if (!currentProviderGroups.length) return

    // Fix: If current selected provider is valid in this group, keep it.
    // This prevents reverting to default/initial when user manually selects a different provider.
    if (selectedProviderId && currentProviderGroups.some((g) => g.provider.id === selectedProviderId)) {
      return
    }

    const wantedModel = (initialSelectedModel || "").trim()
    const wantedProviderSlug = (initialProviderSlug || "").trim()

    const findGroupByModel = wantedModel
      ? currentProviderGroups.find((g) => (g.models || []).some((m) => m.is_available && m.model_api_id === wantedModel))
      : null
    const findGroupBySlug = wantedProviderSlug ? currentProviderGroups.find((g) => g.provider.slug === wantedProviderSlug) : null
    const nextProviderId = (findGroupByModel || findGroupBySlug || currentProviderGroups[0])?.provider.id
    if (nextProviderId && nextProviderId !== selectedProviderId) setSelectedProviderId(nextProviderId)
  }, [currentProviderGroups, initialProviderSlug, initialSelectedModel, selectedProviderId])

  React.useEffect(() => {
    if (!selectableModels.length) return
    const initial = (initialSelectedModel || "").trim()
    const picked =
      (initial && selectableModels.find((m) => m.model_api_id === initial)) ||
      selectableModels.find((m) => m.is_default) ||
      selectableModels[0] ||
      null
    setSelectedSubModel(picked?.model_api_id || "")
  }, [initialSelectedModel, selectableModels])

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
        qs.set("model_type", selectedType)
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
  }, [authHeaders, selectedType])

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

  const scrollLeft = () => scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" })
  const scrollRight = () => scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" })

  const hasOptions = ["image", "video", "audio", "music"].includes(selectedType)
  const OptionPanelContent = () => (
    <ModelOptionsPanel
      key={selectedModelDbId || "no-model"}
      capabilities={selectedCapabilities}
      value={runtimeOptions}
      onApply={applyRuntimeOptions}
    />
  )

  const handleSend = React.useCallback(
    async (overrideInput?: string) => {
      const input = (overrideInput ?? prompt).trim()
      if (!input) return

      const providerSlug = currentProviderGroup?.provider.slug
      const providerId = currentProviderGroup?.provider.id
      const modelApiId = selectedSubModel
      if (!providerSlug || !providerId || !modelApiId) {
        alert("사용 가능한 모델이 없습니다. Admin에서 모델/제공업체 설정을 확인해주세요.")
        return
      }

      onMessage?.({
        role: "user",
        content: input,
        contentJson: { text: input, options: runtimeOptions || {} },
        summary: userSummary(input),
        providerSlug,
        model: modelApiId,
      })
      setPrompt("")

      if (submitMode === "emit") {
        onSubmit?.({ input, providerSlug, model: modelApiId })
        return
      }

      try {
        const maxTokens = selectedType === "text" ? 2048 : 512
        const res = await fetch(CHAT_RUN_API, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            model_type: selectedType,
            conversation_id: conversationId || null,
            userPrompt: input,
            max_tokens: maxTokens,
            session_language: sessionLanguage || null,
            provider_id: providerId,
            provider_slug: providerSlug,
            model_api_id: modelApiId,
            options: runtimeOptions || {},
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
        const parsed = parseBlockJson(outText)
        onMessage?.({
          role: "assistant",
          content: parsed.displayText,
          contentJson: parsed.parsed ?? { text: outText },
          summary: assistantSummary(parsed.parsed?.summary || outText),
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
      }
    },
    [
      assistantSummary,
      authHeaders,
      conversationId,
      currentProviderGroup?.provider.id,
      currentProviderGroup?.provider.slug,
      onConversationId,
      onMessage,
      onSubmit,
      prompt,
      runtimeOptions,
      selectedSubModel,
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
    if (!currentProviderGroup?.provider?.id) return
    if (!selectedSubModel) return

    // If an initial provider/model is specified (FrontAI -> Timeline), wait until
    // the UI selection has actually applied before auto-sending.
    const desiredProviderSlug = String(initialProviderSlug || "").trim()
    const desiredModelApiId = String(initialSelectedModel || "").trim()
    if (desiredProviderSlug && currentProviderGroup.provider.slug !== desiredProviderSlug) return
    if (desiredModelApiId && selectedSubModel !== desiredModelApiId) return

    if (autoSentRef.current === p) return
    autoSentRef.current = p
    void handleSend(p)
  }, [
    autoSendPrompt,
    currentProviderGroup?.provider?.id,
    currentProviderGroup?.provider?.slug,
    handleSend,
    initialProviderSlug,
    initialSelectedModel,
    selectedSubModel,
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
              selectedType === t ? "bg-background border border-border shadow-sm" : "hover:bg-background/50"
            )}
            onClick={() => {
              // 같은 타입을 다시 누르면 상태를 초기화하지 않습니다 (드롭다운 선택 유지)
              if (selectedType === t) return
              setSelectedType(t)
              setSelectedProviderId("")
              setSelectedSubModel("")
              setRuntimeOptions({})
            }}
          >
            <p className={cn("font-medium leading-[20px] text-[14px]", selectedType === t ? "text-foreground" : "text-muted-foreground")}>{tabLabel(t)}</p>
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

      <div ref={scrollContainerRef} onScroll={updateScrollButtons} className="flex flex-row gap-3 items-start justify-start relative w-full overflow-x-auto scrollbar-hide px-2 py-2">
        {currentProviderGroups.map((g) => (
          <div
            key={g.provider.id}
            className={cn(
              "bg-card border border-border flex flex-col items-start p-4 rounded-[20px] shrink-0 w-[160px] sm:w-[180px] cursor-pointer transition-all hover:shadow-md",
              currentProviderGroup?.provider.id === g.provider.id ? "ring-2 ring-primary border-primary/50" : ""
            )}
            onClick={() => setSelectedProviderId(g.provider.id)}
          >
            <div className="flex w-full justify-between items-center">
              <div
                className={cn(
                  "size-[40px] flex items-center justify-center rounded-full",
                  currentProviderGroup?.provider.id === g.provider.id ? "bg-primary" : "bg-muted border border-border"
                )}
              >
                <ProviderLogo
                  logoKey={g.provider.logo_key || undefined}
                  className={cn("size-[24px]", currentProviderGroup?.provider.id === g.provider.id ? "text-primary-foreground" : "text-foreground")}
                />
              </div>
              <div className="flex flex-col items-center justify-center relative shrink-0">
                {currentProviderGroup?.provider.id === g.provider.id ? (
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

  const providerTitle = currentProviderGroup?.provider.product_name || ""
  const providerDesc = currentProviderGroup?.provider.description || ""

  const visiblePromptSuggestions = React.useMemo(() => {
    // model_id 지정된 suggestion은 현재 선택 모델에만 노출
    const list = promptSuggestions || []
    const filtered = list.filter((s) => !s.model_id || !selectedModelDbId || s.model_id === selectedModelDbId)
    return filtered.slice(0, 8)
  }, [promptSuggestions, selectedModelDbId])

  if (uiLoading && !uiConfig) {
    return <div className={cn("w-full max-w-[800px] p-6 text-sm text-muted-foreground", className)}>모델 설정을 불러오는 중...</div>
  }

  return (
    <div className="flex flex-row gap-4 items-end justify-center w-full">
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
            <div className="w-full">
              {!isCompactPanelOpen && (
                <button type="button" className="flex items-center gap-2 px-4 cursor-pointer select-none w-full text-left" onClick={() => setIsCompactPanelOpen(true)}>
                  <ChevronRight className={cn("size-5 transition-transform", isCompactPanelOpen ? "rotate-90" : "")} />
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="size-4" />
                      <span className="text-sm">{tabLabel(selectedType)}</span>
                    </div>
                    {currentProviderGroup && (
                      <div className="flex items-center gap-1">
                        <div className={cn("size-4 rounded-full bg-primary flex items-center justify-center")}>
                          <ProviderLogo logoKey={currentProviderGroup.provider.logo_key || undefined} className="size-3 text-primary-foreground" />
                        </div>
                        <span className="text-sm">{currentProviderGroup.provider.product_name}</span>
                      </div>
                    )}
                  </div>
                </button>
              )}

              <div className={cn("overflow-hidden transition-[max-height,opacity] duration-200 ease-out", isCompactPanelOpen ? "max-h-[520px]" : "max-h-0 opacity-0 mt-0 pointer-events-none")}>
                <div className="w-full">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <button type="button" className="inline-flex items-center justify-center rounded-md hover:bg-accent/60 transition-colors p-1" aria-label="접기" onClick={() => setIsCompactPanelOpen(false)}>
                        <ChevronDown className="size-5" />
                      </button>
                      <PaidToken />
                    </div>
                    <ModeTabs />
                    <div className="max-h-[320px] overflow-y-auto">
                      <ModelGrid />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-[16px] items-start relative shrink-0 w-full">
            <div className="flex flex-[1_0_0] flex-col gap-[16px] items-start h-full relative shrink-0">
              {/* (5) provider product_name / description 표시 - compact에서는 생략 */}
              {!isCompact && currentProviderGroup && (
                <div className="flex gap-[10px] items-center justify-start w-full">
                  <p className="font-medium leading-[20px] text-card-foreground text-[14px] whitespace-nowrap">{providerTitle}</p>
                  <p className="font-normal leading-[20px] text-muted-foreground text-[14px] line-clamp-1 text-ellipsis overflow-hidden">{providerDesc}</p>
                </div>
              )}

              {currentProviderGroup && (
                <div className="bg-background border border-border box-border flex flex-col gap-[10px] items-start justify-between pb-[12px] pt-[16px] px-[16px] relative rounded-[24px] shadow-sm shrink-0 w-full h-full">
                  <div className="flex flex-col gap-[10px] items-start justify-center relative shrink-0 w-full">
                    <textarea
                      ref={promptInputRef}
                      placeholder={selectedModelLabel}
                      className="w-full border-none outline-none text-[16px] placeholder:text-muted-foreground bg-transparent resize-none overflow-y-auto leading-6"
                      value={prompt}
                      rows={1}
                      style={{ maxHeight: 24 * 12 }}
                      onChange={(e) => {
                        setPrompt(e.target.value)
                        // auto-grow up to 12 lines; then scroll
                        const el = e.currentTarget
                        el.style.height = "auto"
                        el.style.height = `${Math.min(el.scrollHeight, 24 * 12)}px`
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
                    {!prompt.trim() && (
                      <p className="text-xs text-muted-foreground">Shift + Enter로 줄바꿈</p>
                    )}
                  </div>

                 

                  <div className="flex gap-[16px] items-center relative shrink-0 w-full mt-auto">
                    <div className="flex flex-[1_0_0] gap-[10px] items-center relative shrink-0" />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant={isCompact ? "outline" : "ghost"} className={cn(isCompact ? "h-[36px] rounded-lg gap-2 px-3" : "h-[36px] rounded-[8px] gap-2 px-4")}>
                          {selectedSubModel || "-"}
                          <ChevronDown className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-72" align="start">
                        <DropdownMenuLabel>모델 선택(활성+사용가능)</DropdownMenuLabel>
                        <DropdownMenuGroup>
                          {selectableModels.map((m) => (
                            <DropdownMenuItem key={m.model_api_id} onClick={() => setSelectedSubModel(m.model_api_id)}>
                              {m.display_name} <span className="ml-2 text-xs text-muted-foreground">{m.model_api_id}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button className="rounded-full h-[36px] w-[36px] p-0" onClick={() => void handleSend()} disabled={!prompt.trim()}>
                      ↑
                    </Button>
                  </div>

                 
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

              {/* 옵션창 - 아래 있는 옵션 - 좁은 화면에서 나타남 */}
                {/* (8) image/video/audio/music 타입 옵션 패널 */}
                {hasOptions && (
                  <div className="w-full lg:w-[420px] xl:hidden block">
                    <Drawer>
                      <DrawerTrigger asChild>
                        <div className="bg-card border border-border flex gap-2 items-center p-2 rounded-[8px] w-full cursor-pointer hover:bg-accent/50 transition-colors">
                          <Settings2 className="size-4" />
                          <p className="text-sm font-medium text-card-foreground truncate text-ellipsis line-clamp-1 w-full">옵션</p>
                          <div className="size-[16px] flex items-center justify-center relative shrink-0">
                            <ChevronsUp className="size-4" />
                          </div>
                        </div>
                      </DrawerTrigger>
                      <DrawerContent>
                        <DrawerHeader>
                          <DrawerTitle>생성 옵션</DrawerTitle>
                          <DrawerDescription>ai_models.capabilities.options/defaults 기반</DrawerDescription>
                        </DrawerHeader>
                        <div className="p-4 pb-0 w-full flex justify-center">
                          <OptionPanelContent />
                        </div>
                        <DrawerFooter>
                          <DrawerClose asChild>
                            <div className="w-full flex items-center justify-center">
                              <Button variant="outline" className="w-full max-w-[360px]">
                                확인
                              </Button>
                            </div>
                          </DrawerClose>
                        </DrawerFooter>
                      </DrawerContent>
                    </Drawer>
                  </div>
                )}

              {!isCompact && hasOptions && !isOptionExpanded && (
                <div className="hidden xl:flex bg-card border border-border flex-col gap-2 items-center p-[16px] rounded-[8px] max-w-[200px] w-full min-w-[120px] cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setIsOptionExpanded(true)}>
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
        <div className="hidden xl:flex bg-card border border-border flex-col gap-[16px] items-start p-[16px] rounded-[8px] relative shrink-0 w-[260px] animate-in fade-in slide-in-from-left-4 duration-300">
          <div className="flex items-center gap-[10px] w-full cursor-pointer" onClick={() => setIsOptionExpanded(false)}>
            <div className="size-[16px] flex items-center justify-center relative shrink-0">
              <Settings2 className="size-full" />
            </div>
            <p className="text-sm font-medium text-card-foreground truncate w-full">옵션</p>
            <div className="size-[16px] flex items-center justify-center relative shrink-0">
              <ChevronsLeft className="size-full" />
            </div>
          </div>
          <OptionPanelContent />
        </div>
      )}

      
    </div> 
    // 전체 레이아웃 컴포넌트 종료
  )
}


