import { Request, Response } from "express"
import { query } from "../config/db"
import { AuthedRequest } from "../middleware/requireAuth"
import { ensureSystemTenantId } from "../services/systemTenantService"
import crypto from "crypto"
import {
  getProviderBase,
  openaiEditImage,
  openaiGenerateImage,
  openaiSimulateChat,
  openaiTextToSpeech,
  anthropicSimulateChat,
  googleSimulateChat,
} from "../services/providerClients"
import { resolveAuthForModelApiProfile } from "../services/authProfilesService"
import { newAssetId, storeImageDataUrlAsAsset } from "../services/fileServiceClient"
import { normalizeAiContent } from "../utils/normalizeAiContent"
import { getWebSearchPolicy } from "../services/webSearchSettingsService"

type ModelType = "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"

const MODEL_TYPES: ModelType[] = ["text", "image", "audio", "music", "video", "multimodal", "embedding", "code"]
const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL || "http://localhost:3008"

type AudioFormat = "mp3" | "wav" | "opus" | "aac" | "flac"

const ACTIVE_RUNS = new Map<
  string,
  { abortController: AbortController; assistantMessageId: string; userId: string; tenantId: string }
>()
const ACTIVE_RUNS_BY_REQUEST = new Map<
  string,
  { abortController: AbortController; assistantMessageId: string; userId: string; tenantId: string }
>()

function registerActiveRun(args: { conversationId: string; assistantMessageId: string; userId: string; tenantId: string; abortController: AbortController }) {
  ACTIVE_RUNS.set(args.conversationId, {
    abortController: args.abortController,
    assistantMessageId: args.assistantMessageId,
    userId: args.userId,
    tenantId: args.tenantId,
  })
}

function clearActiveRun(conversationId: string, assistantMessageId?: string | null) {
  const cur = ACTIVE_RUNS.get(conversationId)
  if (!cur) return
  if (assistantMessageId && cur.assistantMessageId !== assistantMessageId) return
  ACTIVE_RUNS.delete(conversationId)
}

function registerActiveRunByRequestId(args: { requestId: string; assistantMessageId: string; userId: string; tenantId: string; abortController: AbortController }) {
  ACTIVE_RUNS_BY_REQUEST.set(args.requestId, {
    abortController: args.abortController,
    assistantMessageId: args.assistantMessageId,
    userId: args.userId,
    tenantId: args.tenantId,
  })
}

function clearActiveRunByRequestId(requestId: string, assistantMessageId?: string | null) {
  const cur = ACTIVE_RUNS_BY_REQUEST.get(requestId)
  if (!cur) return
  if (assistantMessageId && cur.assistantMessageId !== assistantMessageId) return
  ACTIVE_RUNS_BY_REQUEST.delete(requestId)
}

function isAudioFormat(v: unknown): v is AudioFormat {
  return v === "mp3" || v === "wav" || v === "opus" || v === "aac" || v === "flac"
}

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function extractUsageFromProviderRaw(raw: any): {
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  total_tokens: number
} {
  const au = raw?.usage
  if (
    au &&
    (typeof au.cache_read_input_tokens === "number" || typeof au.cache_creation_input_tokens === "number") &&
    typeof au.input_tokens === "number"
  ) {
    const input = Number(au.input_tokens || 0)
    const cacheRead = Number(au.cache_read_input_tokens || 0)
    const cacheCreate = Number(au.cache_creation_input_tokens || 0)
    const totalInput = input + cacheRead + cacheCreate
    const output = Number(au.output_tokens || 0)
    const total = totalInput + output
    return { input_tokens: totalInput, cached_input_tokens: cacheRead, output_tokens: output, total_tokens: total }
  }
  const u = raw?.usage
  if (u && (typeof u.input_tokens === "number" || typeof u.output_tokens === "number")) {
    const input = Number(u.input_tokens || 0)
    const output = Number(u.output_tokens || 0)
    const cached = Number(u?.input_tokens_details?.cached_tokens || 0)
    const total = typeof u.total_tokens === "number" ? Number(u.total_tokens) : input + output
    return { input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: total }
  }
  const cu = raw?.usage
  if (cu && (typeof cu.prompt_tokens === "number" || typeof cu.completion_tokens === "number")) {
    const input = Number(cu.prompt_tokens || 0)
    const output = Number(cu.completion_tokens || 0)
    const cached = Number(cu?.prompt_tokens_details?.cached_tokens || 0)
    const total = typeof cu.total_tokens === "number" ? Number(cu.total_tokens) : input + output
    return { input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: total }
  }
  return { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0 }
}

function toLlmModality(modelType: ModelType, hasImageInput: boolean) {
  if (modelType === "image") return hasImageInput ? "image_read" : "image_create"
  if (modelType === "audio") return "audio"
  if (modelType === "music") return "music"
  if (modelType === "video") return "video"
  return "text"
}

function extractStaticContextFromTemplate(templateBody: Record<string, unknown> | null) {
  if (!templateBody) return ""
  const parts: string[] = []

  const instructions = typeof templateBody.instructions === "string" ? templateBody.instructions.trim() : ""
  if (instructions) parts.push(instructions)

  const system = templateBody.system
  if (typeof system === "string" && system.trim()) parts.push(system.trim())
  if (Array.isArray(system)) {
    const sysText = system
      .map((b) => {
        if (!b || typeof b !== "object") return ""
        const bo = b as Record<string, unknown>
        return typeof bo.text === "string" ? bo.text : ""
      })
      .filter(Boolean)
      .join("\n\n")
      .trim()
    if (sysText) parts.push(sysText)
  }

  const msgs = Array.isArray(templateBody.messages) ? (templateBody.messages as Array<Record<string, unknown>>) : []
  for (const m of msgs) {
    const role = typeof m.role === "string" ? m.role : ""
    if (role !== "system" && role !== "developer") continue
    const content = typeof m.content === "string" ? m.content.trim() : ""
    if (content) parts.push(content)
  }

  return parts.filter(Boolean).join("\n\n").trim()
}

function buildPromptCacheKey(args: { providerKey: string; modelApiId: string; staticContext: string }) {
  const ctx = args.staticContext.trim()
  if (!ctx) return null
  const digest = crypto.createHash("sha256").update(ctx).digest("hex").slice(0, 16)
  const providerKey = args.providerKey || "unknown"
  const modelApiId = args.modelApiId || "unknown"
  return `tpl:${providerKey}:${modelApiId}:${digest}`
}

function parseOpenAiImageError(raw: string): {
  status: number | null
  apiRoot: string | null
  error: Record<string, unknown> | null
  requestId: string | null
} | null {
  if (!raw || !raw.includes("OPENAI_IMAGE")) return null
  const jsonIdx = raw.indexOf(":{")
  if (jsonIdx < 0) return null
  const prefix = raw.slice(0, jsonIdx)
  const jsonStr = raw.slice(jsonIdx + 1)
  const metaMatch = prefix.match(/OPENAI_IMAGE(?:_EDIT)?_FAILED_(\d+)@(.+)/)
  const status = metaMatch ? Number(metaMatch[1]) : null
  const apiRoot = metaMatch ? String(metaMatch[2]) : null
  let errorObj: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const err = parsed.error && typeof parsed.error === "object" ? (parsed.error as Record<string, unknown>) : null
      if (err) errorObj = err
    }
  } catch {
    errorObj = null
  }
  const msg = typeof errorObj?.message === "string" ? String(errorObj.message) : ""
  const reqMatch = msg.match(/req_[a-zA-Z0-9]+/)
  const requestId = reqMatch ? reqMatch[0] : null
  return { status, apiRoot, error: errorObj, requestId }
}

function extractTextFromJsonContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!content || typeof content !== "object") return ""
  const c = content as Record<string, unknown>
  if (typeof c.text === "string") return c.text
  if (typeof c.answer === "string") return c.answer
  if (typeof c.message === "string") return c.message
  if (typeof c.reply === "string") return c.reply
  if (typeof c.response === "string") return c.response
  if (typeof c.input === "string") return c.input
  const blocks = Array.isArray(c.blocks) ? (c.blocks as Array<Record<string, unknown>>) : []
  if (blocks.length) {
    const out: string[] = []
    for (const b of blocks) {
      const t = typeof b.type === "string" ? b.type : ""
      if (t === "markdown") {
        const md = typeof b.markdown === "string" ? b.markdown : ""
        if (md) out.push(md)
      } else if (t === "code") {
        const code = typeof b.code === "string" ? b.code : ""
        const lang = typeof b.language === "string" ? b.language : "plain"
        if (code) out.push(`[code:${lang}]\n${code}`)
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
    if (out.length) return out.join("\n\n")
  }
  return ""
}

function detectLanguageCode(text: string): string | null {
  const s = String(text || "")
  // very small heuristic detector (no external deps)
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(s)) return "ko"
  if (/[ぁ-ゔァ-ヴー々〆〤]/.test(s)) return "ja"
  if (/[\u4e00-\u9fff]/.test(s)) return "zh"
  if (/[a-zA-Z]/.test(s)) return "en"
  return null
}

function extractRequestedLanguage(text: string): string | null {
  const s = String(text || "").toLowerCase()
  // minimal patterns; can be extended
  if (s.includes("한국어로") || s.includes("korean")) return "ko"
  if (s.includes("영어로") || s.includes("english")) return "en"
  if (s.includes("일본어로") || s.includes("japanese")) return "ja"
  if (s.includes("중국어로") || s.includes("chinese")) return "zh"
  return null
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function clampText(input: string, maxChars: number) {
  const s = String(input || "").replace(/\s+/g, " ").trim()
  if (!maxChars || maxChars <= 0) return ""
  if (s.length <= maxChars) return s
  return s.slice(0, Math.max(0, maxChars - 1)) + "…"
}

function normLang(x: string) {
  const s = String(x || "").trim().toLowerCase()
  return (s.split(/[-_]/)[0] || "en").slice(0, 8)
}

function normCountry(x: string) {
  const s = String(x || "").trim().toLowerCase()
  return (s || "").replace(/[^a-z]/g, "").slice(0, 2) || ""
}

function normalizeLocaleTag(input: string) {
  const raw = String(input || "").trim()
  if (!raw) return ""
  const cleaned = raw.replace(/_/g, "-")
  if (cleaned.includes("-")) return cleaned
  const lower = cleaned.toLowerCase()
  if (lower === "ko") return "ko-KR"
  if (lower === "ja") return "ja-JP"
  if (lower === "zh") return "zh-CN"
  if (lower === "en") return "en-US"
  return cleaned
}

function resolveLocaleTag(args: { finalLang: string; sessionLang?: string; webSearchLanguages?: string[] | null }) {
  const firstWebLang = Array.isArray(args.webSearchLanguages) ? args.webSearchLanguages[0] : ""
  const raw = String(firstWebLang || args.sessionLang || args.finalLang || "en-US").trim()
  return normalizeLocaleTag(raw) || "en-US"
}

function formatCurrentDateTime(now: Date) {
  const pad2 = (n: number) => String(n).padStart(2, "0")
  const yyyy = now.getFullYear()
  const mm = pad2(now.getMonth() + 1)
  const dd = pad2(now.getDate())
  const hh = pad2(now.getHours())
  const mi = pad2(now.getMinutes())
  const ss = pad2(now.getSeconds())
  const offsetMin = -now.getTimezoneOffset()
  const sign = offsetMin >= 0 ? "+" : "-"
  const abs = Math.abs(offsetMin)
  const offH = pad2(Math.floor(abs / 60))
  const offM = pad2(abs % 60)
  const offset = `${sign}${offH}:${offM}`
  return {
    date: `${yyyy}-${mm}-${dd}`,
    datetime: `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${offset}`,
  }
}

function resolveWebLocale(args: { finalLang: string; web_search_country?: string | null; web_search_languages?: string[] | null }) {
  const lang2 = normLang(args.finalLang)
  const countryFromClient = normCountry(args.web_search_country || "")
  const countryFromLang = lang2 === "ko" ? "kr" : lang2 === "ja" ? "jp" : lang2 === "zh" ? "cn" : "us"
  const gl = countryFromClient || countryFromLang
  const browserLangs = Array.isArray(args.web_search_languages) ? args.web_search_languages : []
  const hl = lang2 || (browserLangs[0] ? normLang(browserLangs[0]) : "en")
  return { gl, hl }
}

function compactSearchResults(organic: unknown, maxChars: number) {
  const list = Array.isArray(organic) ? organic : []
  const out: Array<{ title: string; link: string; snippet: string }> = []
  let remaining = Math.max(0, maxChars)
  for (const raw of list) {
    if (remaining <= 0) break
    if (!raw || typeof raw !== "object") continue
    const rec = raw as Record<string, unknown>
    const title = clampText(String(rec.title || ""), 160)
    const link = clampText(String(rec.link || rec.url || ""), 300)
    const snippet = clampText(String(rec.snippet || rec.content || ""), Math.min(700, remaining))
    const used = title.length + link.length + snippet.length + 10
    if (used > remaining && out.length > 0) break
    out.push({ title, link, snippet })
    remaining -= used
  }
  return out
}

function formatSearchContext(organic: Array<{ title: string; link: string; snippet: string }>) {
  return organic
    .map((o, idx) => {
      const parts = [
        `[${idx + 1}] ${o.title || "Untitled"}`.trim(),
        o.link ? o.link.trim() : "",
        o.snippet ? o.snippet.trim() : "",
      ].filter(Boolean)
      return parts.join("\n")
    })
    .filter(Boolean)
    .join("\n\n")
}

function deepInjectVars(input: unknown, vars: Record<string, unknown>): unknown {
  if (typeof input === "string") {
    // If the entire string is exactly one placeholder, allow scalar coercion
    // so JSON templates can safely carry numbers/booleans (e.g., temperature/maxTokens).
    const exact = input.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/)
    if (exact) {
      const k = exact[1]
      const raw = k in vars ? vars[k] : ""
      if (raw && typeof raw === "object") return raw
      const s = String(raw)
      if (s === "true") return true
      if (s === "false") return false
      // OpenAI videos API expects seconds as string enum ('4'|'8'|'12'), not a number.
      // Keep this placeholder as a string even though it looks numeric.
      if (k === "params_seconds") return s
      if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s)
      return s
    }
    return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => String(k in vars ? vars[k] : ""))
  }
  if (Array.isArray(input)) return input.map((v) => deepInjectVars(v, vars))
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) out[k] = deepInjectVars(v, vars)
    return out
  }
  return input
}

type ModelApiPurpose = "chat" | "image" | "video" | "audio" | "music" | "multimodal" | "embedding" | "code"

type ModelApiProfileRow = {
  id: string
  provider_id: string
  model_id: string | null
  profile_key: string
  purpose: ModelApiPurpose
  auth_profile_id: string | null
  transport: Record<string, unknown>
  response_mapping: Record<string, unknown>
  workflow: Record<string, unknown>
}

function deepMergeJson(a: unknown, b: unknown): unknown {
  // b wins. arrays are replaced.
  if (Array.isArray(a) || Array.isArray(b)) return b ?? a
  if (!a || typeof a !== "object") return b
  if (!b || typeof b !== "object") return b
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) }
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
    const av = out[k]
    out[k] = deepMergeJson(av, v)
  }
  return out
}

function safeObj(v: unknown): Record<string, unknown> {
  if (!v) return {}
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

function safeArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function pickString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  return typeof v === "string" ? v : ""
}

function getByPath(root: unknown, path: string): unknown {
  const p = String(path || "").trim()
  if (!p) return undefined

  // support a single projection segment like "data[].url"
  const parts = p.split(".").filter(Boolean)
  let cur: unknown = root
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part.endsWith("[]")) {
      const name = part.slice(0, -2)
      const curRec = safeObj(cur)
      const arr = name ? curRec[name] : cur
      const rest = parts.slice(i + 1).join(".")
      if (!Array.isArray(arr)) return []
      if (!rest) return arr
      return arr.map((item) => getByPath(item, rest))
    }

    const m = part.match(/^([^[\]]+)(?:\[(\d+)\])?$/)
    if (!m) return undefined
    const key = m[1]
    const idxStr = m[2]
    const rec = safeObj(cur)
    cur = rec[key]
    if (idxStr !== undefined) {
      const idx = Number(idxStr)
      if (!Array.isArray(cur)) return undefined
      cur = cur[idx] as unknown
    }
    if (cur === undefined || cur === null) return cur
  }
  return cur
}

async function loadModelApiProfile(args: {
  tenantId: string
  providerId: string
  modelDbId: string
  purpose: ModelApiPurpose
}): Promise<ModelApiProfileRow | null> {
  const r = await query(
    `
    SELECT id, provider_id, model_id, profile_key, purpose, auth_profile_id, transport, response_mapping, workflow
    FROM model_api_profiles
    WHERE tenant_id = $1
      AND provider_id = $2
      AND purpose = $3
      AND is_active = TRUE
      AND (model_id = $4 OR model_id IS NULL)
    ORDER BY (model_id IS NULL) ASC, updated_at DESC
    LIMIT 1
    `,
    [args.tenantId, args.providerId, args.purpose, args.modelDbId]
  )
  if (r.rows.length === 0) return null
  const row = (r.rows[0] || {}) as Record<string, unknown>
  return {
    id: String(row.id || ""),
    provider_id: String(row.provider_id || ""),
    model_id: row.model_id ? String(row.model_id) : null,
    profile_key: String(row.profile_key || ""),
    purpose: String(row.purpose || "") as ModelApiPurpose,
    auth_profile_id: row.auth_profile_id ? String(row.auth_profile_id) : null,
    transport: safeObj(row.transport),
    response_mapping: safeObj(row.response_mapping),
    workflow: safeObj(row.workflow),
  }
}

async function executeHttpJsonProfile(args: {
  apiBaseUrl: string
  apiKey: string
  accessToken: string | null
  modelApiId: string
  purpose: ModelApiPurpose
  prompt: string
  input: string
  language: string
  maxTokens: number
  history: { shortText: string; longText: string; conversationSummary: string }
  options: Record<string, unknown>
  injectedTemplate: Record<string, unknown> | null
  profile: ModelApiProfileRow
  configVars: Record<string, unknown>
  signal?: AbortSignal
}): Promise<{ output_text: string; raw: unknown; content: Record<string, unknown> }> {
  const transport = safeObj(args.profile.transport)
  const responseMapping = safeObj(args.profile.response_mapping)
  const workflow = safeObj(args.profile.workflow)

  const kind = pickString(transport, "kind") || "http_json"
  if (kind !== "http_json") {
    throw new Error(`MODEL_API_PROFILE_UNSUPPORTED_KIND:${kind}`)
  }

  const method = (pickString(transport, "method") || "POST").toUpperCase()
  const path = pickString(transport, "path") || "/"
  const timeoutMs = Number(transport.timeout_ms || 60000) || 60000

  const vars: Record<string, unknown> = {
    apiKey: args.apiKey,
    accessToken: args.accessToken || "",
    model: args.modelApiId,
    userPrompt: args.prompt,
    input: args.input,
    language: args.language,
    maxTokens: String(args.maxTokens),
    shortHistory: args.history.shortText,
    longSummary: args.history.conversationSummary || args.history.longText,
  }
  for (const [k, v] of Object.entries(args.configVars || {})) vars[k] = v

  // expose request options as template vars: {{params_<key>}}
  // - only primitives are supported (string/number/boolean)
  // - key is sanitized into [a-zA-Z0-9_]
  for (const [k, v] of Object.entries(args.options || {})) {
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue
    const safeKey = String(k).replace(/[^a-zA-Z0-9_]/g, "_")
    if (!safeKey) continue
    // Normalize common UI variants (e.g. "256×256") before template injection.
    if (typeof v === "string" && safeKey === "size") {
      vars[`params_${safeKey}`] = v.trim().replace(/[×*]/g, "x")
      continue
    }
    vars[`params_${safeKey}`] = String(v)
  }

  function normalizeUrlJoin(args2: {
    apiBaseUrl: string
    transportBaseUrl?: string
    path: string
    query: Record<string, unknown>
  }) {
    const baseUrlRaw = (args2.transportBaseUrl || args2.apiBaseUrl || "").trim()
    const base = baseUrlRaw.replace(/\/+$/g, "")
    let p = (args2.path || "/").trim()
    if (!p.startsWith("/")) p = `/${p}`
    if (base.toLowerCase().endsWith("/v1") && p.toLowerCase().startsWith("/v1/")) p = p.slice(3)
    const u = new URL(`${base}${p}`)
    for (const [k, v] of Object.entries(args2.query || {})) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") u.searchParams.set(k, String(v))
    }
    return u
  }

  async function httpCall(args2: {
    transportSpec: Record<string, unknown>
    templateBody: Record<string, unknown> | null
    vars: Record<string, unknown>
    overrideMethod?: string
    overridePath?: string
    overrideQuery?: Record<string, unknown>
    mode: "json" | "binary"
    signal?: AbortSignal
  }): Promise<{ ok: boolean; status: number; url: string; json: unknown; buf: Buffer | null; contentType: string | null }> {
    const tr = args2.transportSpec
    const rawHeaders = safeObj(tr.headers)
    const rawQuery = safeObj(tr.query)
    const rawBody = safeObj(tr.body)

    // If prompt_templates is configured, merge it into the profile body (template wins).
    const mergedBody = (args2.templateBody ? deepMergeJson(rawBody, args2.templateBody) : rawBody) as Record<string, unknown>

    const injectedHeaders = deepInjectVars(rawHeaders, args2.vars) as Record<string, unknown>
    const injectedQuery = deepInjectVars(rawQuery, args2.vars) as Record<string, unknown>
    const injectedBody = deepInjectVars(mergedBody, args2.vars) as Record<string, unknown>

    const trBaseAny = deepInjectVars(tr.base_url, args2.vars)
    const trBase = typeof trBaseAny === "string" && trBaseAny.trim() ? trBaseAny.trim() : ""

    const pathAny = deepInjectVars(args2.overridePath ?? pickString(tr, "path") ?? "/", args2.vars)
    const pathStr = typeof pathAny === "string" ? pathAny : String(pathAny ?? "/")

    const m = (args2.overrideMethod || pickString(tr, "method") || "POST").toUpperCase()
    const timeout = Number(tr.timeout_ms || timeoutMs) || timeoutMs

    const urlObj = normalizeUrlJoin({
      apiBaseUrl: args.apiBaseUrl,
      transportBaseUrl: trBase,
      path: pathStr,
      query: { ...injectedQuery, ...(args2.overrideQuery || {}) },
    })

    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(injectedHeaders)) {
      if (typeof v === "string") headers[k] = v
    }
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type") && args2.mode === "json") {
      headers["Content-Type"] = "application/json"
    }

    const controller = new AbortController()
    const onAbort = () => controller.abort()
    if (args2.signal) {
      if (args2.signal.aborted) controller.abort()
      else args2.signal.addEventListener("abort", onAbort)
    }
    const t = setTimeout(() => controller.abort(), Math.max(1000, timeout))
    let res: globalThis.Response
    try {
      res = await fetch(urlObj.toString(), {
        method: m,
        headers,
        body: m === "GET" || m === "HEAD" ? undefined : JSON.stringify(injectedBody),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(t)
      if (args2.signal) args2.signal.removeEventListener("abort", onAbort)
    }

    const contentType = res.headers.get("content-type")

    if (args2.mode === "binary") {
      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        return { ok: false, status: res.status, url: urlObj.toString(), json: { error: errText }, buf: null, contentType }
      }
      const buf = Buffer.from(await res.arrayBuffer())
      return { ok: true, status: res.status, url: urlObj.toString(), json: {}, buf, contentType }
    }

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, status: res.status, url: urlObj.toString(), json, buf: null, contentType }
    }
    return { ok: true, status: res.status, url: urlObj.toString(), json, buf: null, contentType }
  }

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  const modeRaw = pickString(responseMapping, "mode").toLowerCase()
  const resultType = pickString(responseMapping, "result_type") || "text"
  const extract = safeObj(responseMapping.extract)

  // initial request (json by default; async_job assumes json)
  const initial = await httpCall({
    transportSpec: transport,
    templateBody: args.injectedTemplate,
    vars,
    overrideMethod: method,
    overridePath: path,
    mode: modeRaw === "binary" ? "binary" : "json",
    signal: args.signal,
  })
  if (!initial.ok) {
    throw new Error(`MODEL_API_PROFILE_HTTP_${initial.status}:${JSON.stringify(initial.json)}@${initial.url}`)
  }

  // async job workflow: poll -> download/url
  if (pickString(workflow, "type") === "async_job") {
    const jobIdPath = pickString(workflow, "job_id_path") || pickString(extract, "job_id_path") || pickString(extract, "job_id")
    const jobIdVal = jobIdPath ? getByPath(initial.json, jobIdPath) : undefined
    const jobId = typeof jobIdVal === "string" ? jobIdVal : String(jobIdVal ?? "")
    if (!jobId) throw new Error("ASYNC_JOB_MISSING_JOB_ID")

    vars.job_id = jobId

    const steps = safeArr((workflow as Record<string, unknown>).steps)
    const pollStep = (steps.find((s) => safeObj(s).name === "poll") || steps[0] || {}) as unknown
    const poll = safeObj(pollStep)
    const pollInterval = Math.min(Math.max(Number(poll.interval_ms || 2000) || 2000, 200), 10_000)
    const pollMax = Math.min(Math.max(Number(poll.max_attempts || 60) || 60, 1), 120)
    const statusPath = pickString(poll, "status_path") || pickString(workflow, "status_path") || "status"
    const terminalStatesRaw = safeArr(poll.terminal_states).map((x) => String(x || "")).filter(Boolean)
    const terminalStates = terminalStatesRaw.length ? terminalStatesRaw : ["completed", "failed", "canceled", "cancelled", "error"]

    let lastStatus = ""
    let lastJson: unknown = initial.json

    for (let i = 0; i < pollMax; i++) {
      const pollPath = pickString(poll, "path") || ""
      if (!pollPath) throw new Error("ASYNC_JOB_MISSING_POLL_PATH")
      const polled = await httpCall({
        transportSpec: transport,
        templateBody: null,
        vars,
        overrideMethod: pickString(poll, "method") || "GET",
        overridePath: pollPath,
        mode: "json",
        signal: args.signal,
      })
      if (!polled.ok) throw new Error(`ASYNC_JOB_POLL_FAILED_${polled.status}:${JSON.stringify(polled.json)}@${polled.url}`)
      lastJson = polled.json
      const st = getByPath(polled.json, statusPath)
      lastStatus = typeof st === "string" ? st : String(st ?? "")
      if (terminalStates.includes(String(lastStatus).toLowerCase())) break
      await sleep(pollInterval)
    }

    if (!terminalStates.includes(String(lastStatus).toLowerCase())) {
      throw new Error(`ASYNC_JOB_TIMEOUT:status=${lastStatus || "unknown"}`)
    }

    // download step (optional)
    const downloadStep = (steps.find((s) => safeObj(s).name === "download") || {}) as unknown
    const download = safeObj(downloadStep)
    const downloadPath = pickString(download, "path")
    const downloadMode = (pickString(download, "mode") || "binary").toLowerCase() === "json" ? "json" : "binary"

    if (!downloadPath) {
      // no download step; return job info only
      const blockJson = {
        title: "비디오 생성",
        summary: `job_id=${jobId}, status=${lastStatus}`,
        blocks: [{ type: "markdown", markdown: `작업 상태: ${lastStatus}\njob_id: ${jobId}` }],
      }
      return { output_text: JSON.stringify(blockJson), raw: { initial: initial.json, poll: lastJson }, content: { ...blockJson, job: { id: jobId, status: lastStatus }, raw: { initial: initial.json, poll: lastJson } } }
    }

    const downloaded = await httpCall({
      transportSpec: transport,
      templateBody: null,
      vars,
      overrideMethod: pickString(download, "method") || "GET",
      overridePath: downloadPath,
      mode: downloadMode,
      signal: args.signal,
    })
    if (!downloaded.ok) throw new Error(`ASYNC_JOB_DOWNLOAD_FAILED_${downloaded.status}:${JSON.stringify(downloaded.json)}@${downloaded.url}`)

    if (downloadMode === "binary") {
      const buf = downloaded.buf || Buffer.from("")
      const ct = pickString(download, "content_type") || downloaded.contentType || "application/octet-stream"
      const b64 = buf.toString("base64")
      const dataUrl = `data:${ct};base64,${b64}`
      const blockJson = {
        title: "비디오 생성",
        summary: `job_id=${jobId}, status=${lastStatus}`,
        blocks: [{ type: "markdown", markdown: `비디오가 생성되었습니다. (job_id: ${jobId})` }],
      }
      return {
        output_text: JSON.stringify(blockJson),
        raw: { initial: initial.json, poll: lastJson, download: { bytes: buf.length, content_type: ct } },
        content: { ...blockJson, job: { id: jobId, status: lastStatus }, video: { mime: ct, data_url: dataUrl }, raw: { initial: initial.json, poll: lastJson } },
      }
    }

    // json download: try to extract URL
    const urlPath = pickString(download, "url_path") || pickString(download, "result_url_path")
    const urlVal = urlPath ? getByPath(downloaded.json, urlPath) : undefined
    const urlStr = typeof urlVal === "string" ? urlVal : ""
    const blockJson = {
      title: "비디오 생성",
      summary: `job_id=${jobId}, status=${lastStatus}`,
      blocks: [{ type: "markdown", markdown: urlStr ? `비디오 URL: ${urlStr}` : `비디오 생성 완료. job_id: ${jobId}` }],
    }
    return {
      output_text: JSON.stringify(blockJson),
      raw: { initial: initial.json, poll: lastJson, download: downloaded.json },
      content: { ...blockJson, job: { id: jobId, status: lastStatus }, video: urlStr ? { url: urlStr } : {}, raw: { initial: initial.json, poll: lastJson, download: downloaded.json } },
    }
  }

  // binary mode (direct response)
  if (modeRaw === "binary") {
    const buf = initial.buf || Buffer.from("")
    const ct = pickString(responseMapping, "content_type") || initial.contentType || "application/octet-stream"
    const b64 = buf.toString("base64")
    const dataUrl = `data:${ct};base64,${b64}`

    const title =
      args.purpose === "audio" || resultType.includes("audio") ? "오디오 생성" : args.purpose === "music" ? "음악 생성" : args.purpose === "video" ? "비디오 생성" : "파일 생성"
    const blockJson = { title, summary: "생성이 완료되었습니다.", blocks: [{ type: "markdown", markdown: `${title}이 되었습니다.` }] }

    const key = resultType.includes("video") ? "video" : resultType.includes("audio") || args.purpose === "audio" || args.purpose === "music" ? "audio" : "binary"
    return {
      output_text: JSON.stringify(blockJson),
      raw: { bytes: buf.length, content_type: ct },
      content: { ...blockJson, [key]: { mime: ct, data_url: dataUrl }, raw: { bytes: buf.length, content_type: ct } } as Record<string, unknown>,
    }
  }

  // json_base64 mode: extract base64 + mime then build data_url
  if (modeRaw === "json_base64") {
    const b64Path = pickString(extract, "base64_path") || pickString(extract, "audio_base64_path") || pickString(extract, "video_base64_path")
    const mimePath = pickString(extract, "mime_path") || pickString(extract, "mime_type_path")
    const b64Val = b64Path ? getByPath(initial.json, b64Path) : undefined
    const mimeVal = mimePath ? getByPath(initial.json, mimePath) : undefined
    const b64 = typeof b64Val === "string" ? b64Val : ""
    const mime = typeof mimeVal === "string" ? mimeVal : pickString(responseMapping, "content_type") || "application/octet-stream"
    if (!b64) throw new Error("JSON_BASE64_MISSING_BASE64")
    const dataUrl = `data:${mime};base64,${b64}`
    const title = args.purpose === "music" ? "음악 생성" : args.purpose === "audio" ? "오디오 생성" : args.purpose === "video" ? "비디오 생성" : "파일 생성"
    const blockJson = { title, summary: "생성이 완료되었습니다.", blocks: [{ type: "markdown", markdown: `${title}이 되었습니다.` }] }
    const key = args.purpose === "video" ? "video" : "audio"
    return { output_text: JSON.stringify(blockJson), raw: initial.json, content: { ...blockJson, [key]: { mime, data_url: dataUrl }, raw: initial.json } }
  }

  const json = initial.json

  function extractBestTextFromJsonPayload(payload: unknown): string {
    if (!payload || typeof payload !== "object") return ""
    const root = payload as Record<string, unknown>
    // common direct fields
    if (typeof root.output_text === "string" && root.output_text.trim()) return root.output_text
    if (typeof root.text === "string" && root.text.trim()) return root.text
    // OpenAI responses API shape: { output: [{ content: [{ text | output_text | json | parsed | text: {value} }] }] }
    const output = Array.isArray(root.output) ? (root.output as unknown[]) : []
    for (const item of output) {
      const itemObj = item && typeof item === "object" ? (item as Record<string, unknown>) : null
      const content = Array.isArray(itemObj?.content) ? (itemObj?.content as unknown[]) : []
      for (const c of content) {
        const cObj = c && typeof c === "object" ? (c as Record<string, unknown>) : null
        if (typeof cObj?.output_text === "string" && cObj.output_text.trim()) return cObj.output_text
        if (typeof cObj?.text === "string" && cObj.text.trim()) return cObj.text
        if (cObj?.text && typeof cObj.text === "object") {
          const t = cObj.text as Record<string, unknown>
          if (typeof t.value === "string" && t.value.trim()) return t.value
        }
        if (cObj?.json && typeof cObj.json === "object") return JSON.stringify(cObj.json)
        if (cObj?.parsed && typeof cObj.parsed === "object") return JSON.stringify(cObj.parsed)
      }
    }
    return ""
  }

  if (resultType === "text") {
    const textPath = pickString(extract, "text_path")
    const textVal = textPath ? getByPath(json, textPath) : undefined
    const output_text =
      typeof textVal === "string" && textVal.trim()
        ? textVal
        : extractBestTextFromJsonPayload(json) || JSON.stringify(textVal ?? json)
    return { output_text, raw: json, content: { output_text, raw: json } }
  }

  if (resultType === "image_urls") {
    const urlsPath = pickString(extract, "urls_path")
    const val = urlsPath ? getByPath(json, urlsPath) : []
    // Some image endpoints return objects like {url} or {b64_json} instead of a plain string array.
    const urls: string[] = []
    const dataUrls: string[] = []
    function collectFromArray(arr: unknown[]) {
      for (const v of arr) {
        if (typeof v === "string" && v.trim()) {
          urls.push(v.trim())
          continue
        }
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const obj = v as Record<string, unknown>
          const u =
            (typeof obj.url === "string" && obj.url.trim()) ||
            (typeof obj.image_url === "string" && obj.image_url.trim()) ||
            ""
          if (u) {
            urls.push(String(u).trim())
            continue
          }
          const b =
            (typeof obj.b64_json === "string" && obj.b64_json) ||
            (typeof obj.b64 === "string" && obj.b64) ||
            (typeof obj.base64 === "string" && obj.base64) ||
            (typeof obj.data === "string" && obj.data) ||
            ""
          if (b) {
            const s = String(b).trim()
            dataUrls.push(s.startsWith("data:image/") ? s : `data:image/png;base64,${s}`)
          }
        }
      }
    }

    if (Array.isArray(val)) collectFromArray(val)

    // Fallback: if urls_path produced nothing (common when it points to `data[].url` but API returns `b64_json`),
    // try to read from root.data / root.images directly.
    const root = json && typeof json === "object" ? (json as Record<string, unknown>) : null
    if (!urls.length && !dataUrls.length && root) {
      const data = Array.isArray(root.data) ? (root.data as unknown[]) : null
      const images = Array.isArray(root.images) ? (root.images as unknown[]) : null
      if (data) collectFromArray(data)
      if (!urls.length && !dataUrls.length && images) collectFromArray(images)
    }

    // Prefer real URLs; if API returns base64 only, fall back to data URLs.
    const sourceUrls = urls.length ? urls : dataUrls
    const blocks = sourceUrls.length
      ? sourceUrls.map((u) => ({ type: "markdown", markdown: `![image](${u})` }))
      : [{ type: "markdown", markdown: "이미지 생성 결과를 받지 못했습니다." }]
    const blockJson = { title: "이미지 생성", summary: "요청한 이미지 생성 결과입니다.", blocks }

    // IMPORTANT: do NOT embed giant base64 blobs in DB content/raw.
    // Sanitize raw by omitting b64/base64 blobs (store lengths only).
    let rawSafe: unknown = json
    try {
      if (root) {
        const safe: Record<string, unknown> = { ...root }
        const sanitizeArray = (arr: unknown[]) =>
          arr.map((d) => {
            if (!d || typeof d !== "object" || Array.isArray(d)) return d
            const obj = { ...(d as Record<string, unknown>) }
            if (typeof obj.b64_json === "string") obj.b64_json = `<omitted:${obj.b64_json.length}>`
            if (typeof obj.b64 === "string") obj.b64 = `<omitted:${obj.b64.length}>`
            if (typeof obj.base64 === "string") obj.base64 = `<omitted:${obj.base64.length}>`
            if (typeof obj.data === "string") obj.data = `<omitted:${obj.data.length}>`
            return obj
          })
        if (Array.isArray(safe.data)) safe.data = sanitizeArray(safe.data as unknown[])
        if (Array.isArray(safe.images)) safe.images = sanitizeArray(safe.images as unknown[])
        rawSafe = safe
      }
    } catch {
      rawSafe = json
    }

    return {
      output_text: JSON.stringify(blockJson),
      raw: rawSafe,
      content: { ...blockJson, images: sourceUrls.map((u) => ({ url: u })), raw: rawSafe },
    }
  }

  if (resultType === "audio_data_url") {
    const dataUrlPath = pickString(extract, "data_url_path")
    const val = dataUrlPath ? getByPath(json, dataUrlPath) : ""
    const dataUrl = typeof val === "string" ? val : ""
    const blockJson = {
      title: args.purpose === "music" ? "음악 생성" : "오디오 생성",
      summary: "오디오 생성이 완료되었습니다.",
      blocks: [{ type: "markdown", markdown: "오디오가 생성되었습니다. (재생 UI는 Timeline에서 표시됩니다)" }],
    }
    return {
      output_text: JSON.stringify(blockJson),
      raw: json,
      content: { ...blockJson, audio: { data_url: dataUrl }, raw: json },
    }
  }

  // raw_json (or unknown)
  const output_text = JSON.stringify(json)
  return { output_text, raw: json, content: { output_text, raw: json } }
}

type RuleRow = {
  id: string
  priority: number
  conditions: Record<string, unknown>
  target_model_id: string
  fallback_model_id: string | null
}

function matchCondition(cond: unknown, ctx: Record<string, unknown>): boolean {
  if (!cond || typeof cond !== "object" || Array.isArray(cond)) return false
  const c = cond as Record<string, unknown>
  for (const [k, v] of Object.entries(c)) {
    const cv = ctx[k]
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const op = v as Record<string, unknown>
      const num = Number(cv)
      if ("$lte" in op && !(num <= Number(op.$lte))) return false
      if ("$lt" in op && !(num < Number(op.$lt))) return false
      if ("$gte" in op && !(num >= Number(op.$gte))) return false
      if ("$gt" in op && !(num > Number(op.$gt))) return false
      continue
    }
    if (typeof v === "string") {
      if (String(cv || "") !== v) return false
      continue
    }
    if (typeof v === "number") {
      if (Number(cv) !== v) return false
      continue
    }
    if (typeof v === "boolean") {
      if (Boolean(cv) !== v) return false
      continue
    }
    // unknown types: ignore (non-blocking)
  }
  return true
}

async function pickModelByRouting(args: { tenantId: string; modelType: ModelType; language: string; maxTokens: number }) {
  // scope: GLOBAL + TENANT only (ROLE scope needs role_id context; can be added later)
  const rules = await query(
    `
    SELECT id, priority, conditions, target_model_id, fallback_model_id
    FROM model_routing_rules
    WHERE tenant_id = $1
      AND is_active = TRUE
      AND (
        (scope_type = 'GLOBAL' AND scope_id IS NULL)
        OR (scope_type = 'TENANT' AND scope_id = $1)
      )
    ORDER BY priority DESC, updated_at DESC
    `,
    [args.tenantId]
  )

  const ctx: Record<string, unknown> = {
    feature: "chat",
    model_type: args.modelType,
    language: args.language,
    max_tokens: args.maxTokens,
  }

  for (const r of rules.rows as RuleRow[]) {
    const cond = (r.conditions && typeof r.conditions === "object" && !Array.isArray(r.conditions)) ? (r.conditions as Record<string, unknown>) : {}
    // default feature=chat if absent
    if (!("feature" in cond)) cond.feature = "chat"
    if (!matchCondition(cond, ctx)) continue
    // pick target if available else fallback if available
    const target = await query(
      `SELECT id FROM ai_models WHERE id = $1 AND status = 'active' AND is_available = TRUE LIMIT 1`,
      [r.target_model_id]
    )
    if (target.rows.length > 0) return r.target_model_id
    if (r.fallback_model_id) {
      const fb = await query(
        `SELECT id FROM ai_models WHERE id = $1 AND status = 'active' AND is_available = TRUE LIMIT 1`,
        [r.fallback_model_id]
      )
      if (fb.rows.length > 0) return r.fallback_model_id
    }
  }

  return null
}

async function pickDefaultModel(modelType: ModelType) {
  const r = await query(
    `
    SELECT id
    FROM ai_models
    WHERE model_type = $1
      AND status = 'active'
      AND is_available = TRUE
    ORDER BY is_default DESC, sort_order ASC, created_at DESC
    LIMIT 1
    `,
    [modelType]
  )
  return r.rows[0]?.id ? String(r.rows[0].id) : null
}

async function ensureConversationOwned(args: { tenantId: string; userId: string; conversationId: string }) {
  const r = await query(
    `SELECT id FROM model_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active' LIMIT 1`,
    [args.conversationId, args.tenantId, args.userId]
  )
  return r.rows.length > 0
}

// 모달리티별 임시 제목
function getTempTitle(modelType: ModelType): string {
  switch (modelType) {
    case "text": return "New Chat"
    case "image": return "New Image"
    case "video": return "New Video"
    case "music": return "New Music"
    case "audio": return "New Audio"
    case "code": return "New Code"
    default: return "New Chat"
  }
}

// 응답에 title 없을 때 fallback 제목
function getFallbackTitle(modelType: ModelType, prompt: string): string {
  switch (modelType) {
    case "text":
    case "code":
      return (prompt || "").trim().slice(0, 20) || (modelType === "text" ? "New Chat" : "New Code")
    case "image": return "이미지 생성"
    case "video": return "비디오 생성"
    case "music": return "음악 생성"
    case "audio": return "오디오 생성"
    default: return "New Chat"
  }
}

async function createConversation(args: {
  tenantId: string
  userId: string
  modelDbId: string
  firstMessage: string
  modelType?: ModelType
}) {
  const title = getTempTitle(args.modelType || "text")
  const r = await query(
    `INSERT INTO model_conversations (tenant_id, user_id, model_id, title, status)
     VALUES ($1, $2::uuid, $3, $4, 'active')
     RETURNING id`,
    [args.tenantId, args.userId, args.modelDbId, title]
  )
  return String(r.rows[0].id)
}

async function appendMessage(args: {
  id?: string
  conversationId: string
  role: "user" | "assistant"
  content: Record<string, unknown>
  contentText: string
  summary: string | null
  status: "none" | "in_progress" | "success" | "failed" | "stopped"
  modelApiId: string
  providerSlug: string
  providerKey: string
  providerLogoKey: string | null
}) {
  const maxOrder = await query(`SELECT COALESCE(MAX(message_order), 0)::int AS max FROM model_messages WHERE conversation_id = $1`, [
    args.conversationId,
  ])
  const nextOrder = Number(maxOrder.rows[0]?.max || 0) + 1
  const msgId = args.id ? String(args.id) : null
  const r = await query(
    `
    INSERT INTO model_messages (id, conversation_id, role, content, content_text, summary, status, message_order, metadata)
    VALUES (COALESCE($1::uuid, uuid_generate_v4()), $2,$3,$4::jsonb,$5,$6,$7,$8,$9::jsonb)
    RETURNING id, message_order
    `,
    [
      msgId,
      args.conversationId,
      args.role,
      JSON.stringify(args.content),
      args.contentText || null,
      args.summary,
      args.status,
      nextOrder,
      JSON.stringify({
        model: args.modelApiId,
        provider_slug: args.providerSlug,
        provider_key: args.providerKey,
        provider_logo_key: args.providerLogoKey,
      }),
    ]
  )
  return { id: String(r.rows[0].id), message_order: Number(r.rows[0].message_order) }
}

async function updateMessageStatus(args: { id: string; status: "in_progress" | "success" | "failed" | "stopped" }) {
  const r = await query(
    `
    UPDATE model_messages
    SET status = $2
    WHERE id = $1
      AND status = 'in_progress'
    RETURNING id
    `,
    [args.id, args.status]
  )
  return (r.rowCount ?? 0) > 0
}

async function updateMessageContent(args: {
  id: string
  status: "success" | "failed" | "stopped"
  content: Record<string, unknown>
  contentText: string
  summary: string | null
}) {
  const r = await query(
    `
    UPDATE model_messages
    SET content = $2::jsonb,
        content_text = $3,
        summary = $4,
        status = $5
    WHERE id = $1
      AND status = 'in_progress'
    RETURNING id
    `,
    [args.id, JSON.stringify(args.content), args.contentText || null, args.summary, args.status]
  )
  return (r.rowCount ?? 0) > 0
}

export async function cancelChatRun(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const authHeader = String(req.headers.authorization || "")
    const tenantId = await ensureSystemTenantId()
    const body = (req.body || {}) as { conversation_id?: string; request_id?: string }
    const conversationId = String(body.conversation_id || "").trim()
    const requestId = String(body.request_id || "").trim()
    if (!conversationId && !requestId) return res.status(400).json({ message: "conversation_id or request_id is required" })
    if (conversationId && !isUuid(conversationId)) return res.status(400).json({ message: "conversation_id is invalid" })

    const stopText = "사용자의 요청에 의해 요청 및 답변이 중지 되었습니다."
    if (requestId) {
      const activeByRequest = ACTIVE_RUNS_BY_REQUEST.get(requestId)
      if (activeByRequest) {
        if (activeByRequest.userId !== userId || activeByRequest.tenantId !== tenantId) {
          return res.status(404).json({ message: "Request not found" })
        }
        activeByRequest.abortController.abort()
        await updateMessageContent({
          id: activeByRequest.assistantMessageId,
          status: "stopped",
          content: normalizeAiContent({ output_text: stopText }),
          contentText: stopText,
          summary: null,
        })
        clearActiveRunByRequestId(requestId, activeByRequest.assistantMessageId)
        return res.json({ ok: true, canceled: true })
      }
    }

    if (conversationId) {
      const owns = await ensureConversationOwned({ tenantId, userId, conversationId })
      if (!owns) return res.status(404).json({ message: "Conversation not found" })
    }

    const active = ACTIVE_RUNS.get(conversationId)
    if (active) {
      active.abortController.abort()
      await updateMessageContent({
        id: active.assistantMessageId,
        status: "stopped",
        content: normalizeAiContent({ output_text: stopText }),
        contentText: stopText,
        summary: null,
      })
      clearActiveRun(conversationId, active.assistantMessageId)
      return res.json({ ok: true, canceled: true })
    }

    if (conversationId) {
      const row = await query(
        `SELECT id
         FROM model_messages
         WHERE conversation_id = $1
           AND role = 'assistant'
           AND status = 'in_progress'
         ORDER BY message_order DESC
         LIMIT 1`,
        [conversationId]
      )
      if (row.rows.length > 0) {
        const id = String(row.rows[0].id || "")
        if (id) {
          await updateMessageContent({
            id,
            status: "stopped",
            content: normalizeAiContent({ output_text: stopText }),
            contentText: stopText,
            summary: null,
          })
          return res.json({ ok: true, canceled: true })
        }
      }
    }
    return res.json({ ok: true, canceled: false })
  } catch (e: unknown) {
    console.error("cancelChatRun error:", e)
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ message: "Failed to cancel chat", details: msg })
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function stripRawForDb(content: Record<string, unknown>) {
  if ("raw" in content) {
    // avoid persisting huge provider payloads (often includes base64)
    delete content.raw
  }
}

type PendingAsset = { assetId: string; kind: "image" | "audio" | "video"; dataUrl: string; index: number }
type PendingAttachmentSlot = {
  kind: "image" | "file" | "link"
  name?: string
  mime?: string
  size?: number
  url?: string
  title?: string
  dataUrl?: string
  assetId?: string
}

function rewriteContentWithAssetUrls(content: Record<string, unknown>): { content: Record<string, unknown>; assets: PendingAsset[] } {
  const out = { ...content }
  stripRawForDb(out)

  const assets: PendingAsset[] = []

  // images[]
  const imagesVal = out.images
  if (Array.isArray(imagesVal)) {
    const imgs = imagesVal.map((it) => (isRecord(it) ? { ...it } : null))
    const nextImgs: Record<string, unknown>[] = []
    for (let i = 0; i < imgs.length; i++) {
      const rec = imgs[i]
      if (!rec) continue
      const url = typeof rec.url === "string" ? String(rec.url) : ""
      if (url.startsWith("data:image/")) {
        const assetId = newAssetId()
        const assetUrl = `/api/ai/media/assets/${assetId}`
        assets.push({ assetId, kind: "image", dataUrl: url, index: i })
        nextImgs.push({ ...rec, url: assetUrl, asset_id: assetId })
      } else if (url) {
        nextImgs.push(rec)
      }
    }
    out.images = nextImgs

    // If blocks look like our image-only blocks, rebuild them from image URLs for consistency.
    const blocksVal = out.blocks
    const blocks = Array.isArray(blocksVal) ? (blocksVal as unknown[]) : null
    const allImgMarkdown =
      blocks &&
      blocks.length === nextImgs.length &&
      blocks.every((b) => isRecord(b) && b.type === "markdown" && typeof b.markdown === "string" && String(b.markdown).startsWith("![image]("))
    if (allImgMarkdown) {
      out.blocks = nextImgs.map((im) => ({ type: "markdown", markdown: `![image](${String(im.url || "")})` }))
    }
  }

  // audio/video: keep field name `data_url` but store a normal URL
  for (const k of ["audio", "video"] as const) {
    const obj = out[k]
    if (!isRecord(obj)) continue
    const du = typeof obj.data_url === "string" ? String(obj.data_url) : ""
    if (!du.startsWith("data:")) continue
    const kind = k === "audio" ? "audio" : "video"
    const assetId = newAssetId()
    const assetUrl = `/api/ai/media/assets/${assetId}`
    assets.push({ assetId, kind, dataUrl: du, index: 0 })
    out[k] = { ...obj, data_url: assetUrl, asset_id: assetId }
  }

  return { content: out, assets }
}

const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024

function isHttpUrl(raw: string) {
  return /^https?:\/\//i.test(raw)
}

function inferImageMimeFromUrl(url: string): string | null {
  const m = String(url || "").match(/\.(png|jpe?g|webp|gif|bmp|svg)(?:[?#].*)?$/i)
  if (!m) return null
  const ext = m[1]?.toLowerCase()
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  if (ext === "gif") return "image/gif"
  if (ext === "bmp") return "image/bmp"
  if (ext === "svg") return "image/svg+xml"
  return null
}

async function fetchImageAsDataUrl(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal, headers })
    if (!res.ok) return null
    const ctRaw = String(res.headers.get("content-type") || "")
    const ct = ctRaw.split(";")[0].trim().toLowerCase()
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return null
    if (buf.length > MAX_REMOTE_IMAGE_BYTES) return null
    const mime = ct.startsWith("image/") ? ct : inferImageMimeFromUrl(url)
    if (!mime || !mime.startsWith("image/")) return null
    return `data:${mime};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

async function materializeImageUrlsToDataUrls(urls: string[], signal?: AbortSignal): Promise<string[]> {
  const out: string[] = []
  for (const u of urls) {
    const raw = String(u || "").trim()
    if (!raw) continue
    if (raw.startsWith("data:image/")) {
      out.push(raw)
      continue
    }
    if (raw.startsWith("/api/ai/media/assets/")) {
      out.push(raw)
      continue
    }
    if (isHttpUrl(raw)) {
      const dataUrl = await fetchImageAsDataUrl(raw, signal)
      if (dataUrl) {
        out.push(dataUrl)
      } else {
        out.push(raw)
      }
      continue
    }
    out.push(raw)
  }
  return out
}

async function loadHistory(args: { conversationId: string }) {
  const conv = await query(
    `SELECT conversation_summary, conversation_summary_updated_at, conversation_summary_tokens
     FROM model_conversations WHERE id = $1 LIMIT 1`,
    [args.conversationId]
  )
  const conversationSummary = conv.rows[0]?.conversation_summary ? String(conv.rows[0].conversation_summary) : ""

  // short term: last 16 messages (row 기준)
  const short = await query(
    `SELECT role, content, content_text
     FROM model_messages
     WHERE conversation_id = $1
     ORDER BY message_order DESC
     LIMIT 16`,
    [args.conversationId]
  )
  const shortRows = (short.rows || []).slice().reverse()
  const shortText = shortRows
    .map((m: { role?: unknown; content_text?: unknown; content?: unknown }) => {
      const role = String(m.role || "")
      let t =
        typeof m.content_text === "string" && m.content_text.trim()
          ? String(m.content_text)
          : extractTextFromJsonContent(m.content)

      // Guardrail: never inject massive blobs (e.g., base64 data URLs) into history.
      // This can explode context length and break chat.
      if (t.startsWith("data:") || t.includes("data:image/") || t.includes("base64,")) {
        t = extractTextFromJsonContent(m.content) || "[media]"
      }
      if (t.length > 4000) t = `${t.slice(0, 4000)}…`
      return `${role}: ${t}`
    })
    .join("\n")

  // long term: use summaries (cheap)
  const sums = await query(
    `SELECT role, summary
     FROM model_messages
     WHERE conversation_id = $1
       AND summary IS NOT NULL
       AND summary <> ''
     ORDER BY message_order ASC`,
    [args.conversationId]
  )
  const longText = sums.rows
    .slice(-80) // cap
    .map((m: { role?: unknown; summary?: unknown }) => `${String(m.role || "")}: ${String(m.summary || "")}`)
    .join("\n")

  return { conversationSummary, shortText, longText }
}

export async function getConversationContext(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const authHeader = String(req.headers.authorization || "")
    const tenantId = await ensureSystemTenantId()
    const params = (req.params || {}) as Record<string, string | undefined>
    const conversationId = String(params.id || "").trim()
    if (!isUuid(conversationId)) return res.status(400).json({ message: "Invalid conversation id" })

    const ok = await ensureConversationOwned({ tenantId, userId, conversationId })
    if (!ok) return res.status(404).json({ message: "Conversation not found" })

    // short term: message rows (for UI)
    const short = await query(
      `SELECT id, role, content, content_text, summary, message_order, created_at
       FROM model_messages
       WHERE conversation_id = $1
       ORDER BY message_order DESC
       LIMIT 16`,
      [conversationId]
    )
    const shortRows = (short.rows || []).slice().reverse().map((m: { id?: unknown; role?: unknown; message_order?: unknown; created_at?: unknown; content_text?: unknown; content?: unknown; summary?: unknown }) => {
      const text =
        typeof m.content_text === "string" && m.content_text.trim()
          ? String(m.content_text)
          : extractTextFromJsonContent(m.content)
      return {
        id: String(m.id),
        role: String(m.role || ""),
        message_order: Number(m.message_order || 0),
        created_at: m.created_at,
        content_text: text,
        content: m.content,
        summary: typeof m.summary === "string" ? m.summary : null,
      }
    })

    // long term: conversation_summary + message summaries
    const conv = await query(
      `SELECT conversation_summary, conversation_summary_updated_at, conversation_summary_tokens
       FROM model_conversations
       WHERE id = $1
       LIMIT 1`,
      [conversationId]
    )

    const sums = await query(
      `SELECT id, role, summary, summary_tokens, importance, is_pinned, segment_group, message_order, updated_at, created_at
       FROM model_messages
       WHERE conversation_id = $1
         AND summary IS NOT NULL
         AND summary <> ''
       ORDER BY message_order ASC
       LIMIT 200`,
      [conversationId]
    )
    const summaryRows = (sums.rows || []).slice(-80).map(
      (m: {
        id?: unknown
        role?: unknown
        message_order?: unknown
        summary?: unknown
        summary_tokens?: unknown
        importance?: unknown
        is_pinned?: unknown
        segment_group?: unknown
        updated_at?: unknown
        created_at?: unknown
      }) => ({
        id: String(m.id),
        role: String(m.role || ""),
        message_order: Number(m.message_order || 0),
        summary: String(m.summary || ""),
        summary_tokens: Number(m.summary_tokens || 0),
        importance: Number(m.importance || 0),
        is_pinned: Boolean(m.is_pinned),
        segment_group: typeof m.segment_group === "string" ? m.segment_group : null,
        updated_at: m.updated_at,
        created_at: m.created_at,
      })
    )

    // also provide the exact text context used by runtime, for debugging
    const runtime = await loadHistory({ conversationId })

    return res.json({
      ok: true,
      conversation_id: conversationId,
      content_context: {
        limit: 16,
        rows: shortRows,
      },
      summary_context: {
        conversation_summary: conv.rows[0]?.conversation_summary ? String(conv.rows[0].conversation_summary) : "",
        conversation_summary_updated_at: conv.rows[0]?.conversation_summary_updated_at ?? null,
        conversation_summary_tokens: Number(conv.rows[0]?.conversation_summary_tokens || 0),
        message_summaries: summaryRows,
      },
      runtime_context: runtime,
    })
  } catch (e: unknown) {
    console.error("getConversationContext error:", e)
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ message: "Failed to get conversation context", details: msg })
  }
}

export async function chatRun(req: Request, res: Response) {
  let assistantMessageId: string | null = null
  let responseFinalized = false
  let cleanupActiveRun = () => {}
  let isAborted = () => false
  let clientRequestId = ""
  const runStartedAtMs = Date.now()
  let requestIdForLog = ""
  let usedCredentialId: string | null = null
  let usedProviderId: string | null = null
  let usedModelDbId: string | null = null
  let usedModelApiId: string | null = null
  let usedProviderSlug: string | null = null
  let webSearchCount = 0
  let webQueryCharsTotal = 0
  let webResponseBytesTotal = 0
  let webBudgetCount: number | null = null
  let imageUsage: { count: number; size?: string; quality?: string } | null = null
  let musicUsage: { seconds: number; sample_rate?: number; channels?: string; bit_depth?: number } | null = null
  try {
    const userId = (req as AuthedRequest).userId
    const authHeader = String(req.headers.authorization || "")
    const tenantId = await ensureSystemTenantId()
    const webSearchPolicy = await getWebSearchPolicy(tenantId)

    const {
      model_type,
      conversation_id,
      userPrompt,
      max_tokens,
      session_language,
      // optional: client-selected model override
      model_api_id,
      provider_id,
      provider_slug,
      options,
      attachments,
      // web search toggle (text/chat only)
      web_allowed,
      // browser-derived hints (best-effort)
      web_search_country,
      web_search_languages,
      client_request_id,
    }: {
      model_type?: ModelType
      conversation_id?: string | null
      userPrompt?: string
      max_tokens?: number
      session_language?: string
      model_api_id?: string | null
      provider_id?: string | null
      provider_slug?: string | null
      options?: Record<string, unknown>
      attachments?: unknown[] | null
      web_allowed?: boolean
      web_search_country?: string | null
      web_search_languages?: string[] | null
      client_request_id?: string | null
    } = req.body || {}

    const prompt = String(userPrompt || "").trim()
    clientRequestId = String(client_request_id || "").trim()
    requestIdForLog = clientRequestId || crypto.randomUUID()
    if (!prompt) return res.status(400).json({ message: "userPrompt is required" })

    const mt = (String(model_type || "").trim() as ModelType) || "text"
    if (!MODEL_TYPES.includes(mt)) return res.status(400).json({ message: `Invalid model_type: ${mt}` })

    // 9) language selection priority
    const requestedLang = extractRequestedLanguage(prompt)
    const detectedLang = detectLanguageCode(prompt)
    const sessionLang = typeof session_language === "string" ? session_language.trim() : ""

    // We'll fill history language later if conversation exists.
    let historyLang: string | null = null

    // safe max_tokens
    const maxTokensRequested = clampInt(Number(max_tokens ?? 512) || 512, 16, 8192)

    // 1) routing rule evaluation -> 2) model selection
    let chosenModelDbId: string | null = null

    // if client specifies explicit model_api_id + provider_id, try to resolve that exact model first
    if (model_api_id && provider_id && isUuid(String(provider_id))) {
      const exact = await query(
        `SELECT id FROM ai_models WHERE provider_id = $1 AND model_id = $2 AND status='active' AND is_available=TRUE LIMIT 1`,
        [String(provider_id), String(model_api_id).trim()]
      )
      if (exact.rows.length > 0) chosenModelDbId = String(exact.rows[0].id)
    }
    // allow client to specify provider_slug instead of provider_id (useful for FrontAI/Timeline)
    if (!chosenModelDbId && model_api_id && provider_slug && String(provider_slug).trim()) {
      const exact = await query(
        `
        SELECT m.id
        FROM ai_models m
        JOIN ai_providers p ON p.id = m.provider_id
        WHERE p.slug = $1
          AND m.model_id = $2
          AND m.status = 'active'
          AND m.is_available = TRUE
        LIMIT 1
        `,
        [String(provider_slug).trim(), String(model_api_id).trim()]
      )
      if (exact.rows.length > 0) chosenModelDbId = String(exact.rows[0].id)
    }

    // fallback: if explicit provider lookup failed, try to find ANY active model with this model_api_id
    // (ignores provider mismatch if model ID is unique/valid)
    if (!chosenModelDbId && model_api_id) {
      const anyMatch = await query(
        `SELECT id FROM ai_models WHERE model_id = $1 AND status='active' AND is_available=TRUE ORDER BY is_default DESC, sort_order ASC LIMIT 1`,
        [String(model_api_id).trim()]
      )
      if (anyMatch.rows.length > 0) chosenModelDbId = String(anyMatch.rows[0].id)
    }

    const effectiveLang = requestedLang || detectedLang || sessionLang || "ko"

    if (!chosenModelDbId) {
      chosenModelDbId = await pickModelByRouting({ tenantId, modelType: mt, language: effectiveLang, maxTokens: maxTokensRequested })
    }
    if (!chosenModelDbId) {
      chosenModelDbId = await pickDefaultModel(mt)
    }
    if (!chosenModelDbId) return res.status(404).json({ message: `No available model for model_type=${mt}` })

    // load chosen model + provider
    const chosen = await query(
      `
      SELECT
        m.id,
        m.model_id AS model_api_id,
        m.max_output_tokens,
        m.input_token_cost_per_1k,
        m.output_token_cost_per_1k,
        m.currency,
        m.prompt_template_id,
        m.response_schema_id,
        m.capabilities,
        p.id AS provider_id,
        p.provider_family,
        p.slug AS provider_slug,
        p.logo_key AS provider_logo_key,
        p.product_name AS provider_product_name,
        p.description AS provider_description
      FROM ai_models m
      JOIN ai_providers p ON p.id = m.provider_id
      WHERE m.id = $1
      LIMIT 1
      `,
      [chosenModelDbId]
    )
    if (chosen.rows.length === 0) return res.status(404).json({ message: "Chosen model not found" })
    const row = chosen.rows[0]

    const cap = isRecord(row.capabilities) ? (row.capabilities as Record<string, unknown>) : {}
    const capDefaults = cap && isRecord(cap.defaults) ? (cap.defaults as Record<string, unknown>) : {}
    const mergedOptions = { ...capDefaults, ...(options || {}) }
    let optionsForAssistant: Record<string, unknown> | null = null

    // Incoming attachments (used for image-to-image in image mode)
    const incomingAttachments = Array.isArray(attachments) ? attachments : []
    const incomingImageDataUrls: string[] = []
    const incomingImageUrls: string[] = []
    for (const a of incomingAttachments) {
      if (!a || typeof a !== "object") continue
      const ao = a as Record<string, unknown>
      const kind = typeof ao.kind === "string" ? ao.kind : ""
      if (kind !== "image") continue
      const du = typeof ao.data_url === "string" ? ao.data_url : ""
      if (du && du.startsWith("data:image/")) {
        incomingImageDataUrls.push(du)
        continue
      }
      const url = typeof ao.url === "string" ? ao.url : ""
      if (url) incomingImageUrls.push(url)
    }
    if (incomingImageUrls.length > 0) {
      const headers = authHeader ? { Authorization: authHeader } : undefined
      for (const raw of incomingImageUrls) {
        const absUrl = raw.startsWith("/api/ai/media/assets/") ? `${FILE_SERVICE_URL}${raw}` : raw
        const dataUrl = await fetchImageAsDataUrl(absUrl, undefined, headers)
        if (dataUrl && dataUrl.startsWith("data:image/")) incomingImageDataUrls.push(dataUrl)
      }
    }

    // conversation ownership / creation
    let convId = conversation_id ? String(conversation_id) : ""
    if (convId) {
      const ok = await ensureConversationOwned({ tenantId, userId, conversationId: convId })
      if (!ok) return res.status(404).json({ message: "Conversation not found" })
    } else {
      convId = await createConversation({ tenantId, userId, modelDbId: chosenModelDbId, firstMessage: prompt, modelType: mt })
    }

    // history language (3rd priority): last assistant message
    try {
      const lastA = await query(
        `SELECT content_text, content
         FROM model_messages
         WHERE conversation_id = $1 AND role='assistant'
         ORDER BY message_order DESC
         LIMIT 1`,
        [convId]
      )
      const lastText =
        typeof lastA.rows?.[0]?.content_text === "string"
          ? String(lastA.rows[0].content_text)
          : extractTextFromJsonContent(lastA.rows?.[0]?.content)
      historyLang = detectLanguageCode(lastText)
    } catch {
      historyLang = null
    }

    const finalLang = requestedLang || detectedLang || historyLang || sessionLang || "ko"
    const now = new Date()
    const tz = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone
    const currentTimezone = typeof tz === "string" && tz ? tz : "UTC"
    const currentLocale = resolveLocaleTag({ finalLang, sessionLang, webSearchLanguages: web_search_languages })
    const { date: currentDate, datetime: currentDatetime } = formatCurrentDateTime(now)

    // 6) short-term + long-term context
    const history = await loadHistory({ conversationId: convId })

    // 3) template load
    let templateBody: Record<string, unknown> | null = null
    if (row.prompt_template_id) {
      const t = await query(
        `SELECT body FROM prompt_templates WHERE id = $1 AND is_active = TRUE LIMIT 1`,
        [String(row.prompt_template_id)]
      )
      const b = t.rows?.[0]?.body
      if (b && typeof b === "object" && !Array.isArray(b)) templateBody = b as Record<string, unknown>
    }

    // 3.5) response schema load (openai only will use it)
    let responseSchema: { name: string; schema: Record<string, unknown>; strict?: boolean } | null = null
    if (row.response_schema_id) {
      const r = await query(
        `SELECT name, strict, schema FROM response_schemas WHERE id = $1 AND is_active = TRUE LIMIT 1`,
        [String(row.response_schema_id)]
      )
      const s = r.rows?.[0]?.schema
      if (r.rows?.[0]?.name && s && typeof s === "object" && !Array.isArray(s)) {
        responseSchema = { name: String(r.rows[0].name), strict: Boolean(r.rows[0].strict), schema: s as Record<string, unknown> }
      }
    }

    // Model API id (e.g. "sora-2", "gpt-image-1") is needed during prompt_template injection as well.
    // If prompt_templates.body contains {"model":"{{model}}"} but {{model}} is missing here, it becomes "" and
    // later stages cannot recover (causing provider errors like: Invalid value: '' for param 'model').
    const modelApiIdForTemplate = String(row.model_api_id || "").trim()

    // 4) 변수 주입
    // - prompt 템플릿에서 {{input}} / {{userPrompt}} 등을 쓸 수 있게 합니다.
    // - 또한 options 값들을 {{params_<key>}}로 노출해서 (특히 audio/image) template body에 주입할 수 있게 합니다.
    const templateVars: Record<string, unknown> = {
      model: modelApiIdForTemplate,
      model_api_id: modelApiIdForTemplate,
      userPrompt: prompt,
      input: prompt,
      prompt,
      user_input: prompt,
      language: finalLang,
      current_date: currentDate,
      current_datetime: currentDatetime,
      current_timezone: currentTimezone,
      current_locale: currentLocale,
      shortHistory: history.shortText,
      longSummary: history.conversationSummary || history.longText,
      response_schema_name: responseSchema?.name || "",
      response_schema_json: responseSchema?.schema || {},
      response_schema_strict: responseSchema?.strict !== false,
      // Web search policy defaults (used by prompt_templates if present)
      max_search_calls: webSearchPolicy.max_search_calls,
      max_total_snippet_tokens: webSearchPolicy.max_total_snippet_tokens,
      search_timeout_ms: webSearchPolicy.timeout_ms,
      search_retry_max: webSearchPolicy.retry_max,
      search_retry_base_delay_ms: webSearchPolicy.retry_base_delay_ms,
      search_retry_max_delay_ms: webSearchPolicy.retry_max_delay_ms,
    }
    for (const [k, v] of Object.entries(mergedOptions || {})) {
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue
      const safeKey = String(k).replace(/[^a-zA-Z0-9_]/g, "_")
      if (!safeKey) continue
      if (typeof v === "string" && safeKey === "size") {
        templateVars[`params_${safeKey}`] = v.trim().replace(/[×*]/g, "x")
        continue
      }
      templateVars[`params_${safeKey}`] = String(v)
    }
    const injectedTemplate = templateBody ? (deepInjectVars(templateBody, templateVars) as Record<string, unknown>) : null

    // 5) 안전 조정 (min/max)
    const modelMaxOut = row.max_output_tokens ? Number(row.max_output_tokens) : null
    let safeMaxTokens = modelMaxOut ? clampInt(maxTokensRequested, 16, Math.max(16, modelMaxOut)) : maxTokensRequested
    // OpenAI GPT-5 mini can spend an entire completion budget on reasoning and emit empty visible text.
    // Ensure enough budget so it can produce actual output (especially for structured JSON).
    const providerKeyLowerForBudget = String(row.provider_family || row.provider_slug || "").trim().toLowerCase()
    const modelApiIdForBudget = String(row.model_api_id || "").trim()
    if (providerKeyLowerForBudget === "openai" && /gpt-5.*mini/i.test(modelApiIdForBudget)) {
      safeMaxTokens = Math.max(safeMaxTokens, 4096)
    }

    // 7) 최종 request body 생성 + provider call
    const providerId = String(row.provider_id)
    const base = await getProviderBase(providerId)

    const providerKey = String(row.provider_family || row.provider_slug || "").trim().toLowerCase()
    const modelApiId = String(row.model_api_id || "")
    usedProviderId = providerId
    usedModelDbId = chosenModelDbId
    usedModelApiId = modelApiId
    usedProviderSlug = String(row.provider_slug || "")
    // Prefer DB-provided logo_key; if missing, derive a safe default that matches `providerLogoRegistry.tsx` keys.
    const providerLogoKeyRaw = typeof row.provider_logo_key === "string" && row.provider_logo_key.trim() ? row.provider_logo_key.trim() : null
    const providerSlugLower = String(row.provider_slug || "").trim().toLowerCase()
    const providerLogoKey =
      providerLogoKeyRaw ||
      (providerKey === "openai" || providerSlugLower.startsWith("openai") ? "chatgpt" : null) ||
      (providerKey === "google" || providerSlugLower.startsWith("google") ? "gemini" : null) ||
      (providerKey === "anthropic" || providerSlugLower.startsWith("anthropic") ? "claude" : null)

    // language instruction (server-level)
    const langInstruction = finalLang ? `\n\n(출력 언어: ${finalLang})` : ""
    const input = [
      history.conversationSummary ? `대화 요약:\n${history.conversationSummary}\n` : "",
      history.longText ? `대화 요약(메시지 summary):\n${history.longText}\n` : "",
      history.shortText ? `최근 대화:\n${history.shortText}\n` : "",
      `사용자 요청:\n${prompt}${langInstruction}`,
    ]
      .filter(Boolean)
      .join("\n\n")
    const dynamicContext = input
    const staticContext = extractStaticContextFromTemplate(templateBody)
    const promptCacheKey = buildPromptCacheKey({ providerKey, modelApiId, staticContext })
    const promptCacheRetentionRaw =
      typeof (mergedOptions as Record<string, unknown> | null)?.prompt_cache_retention === "string"
        ? String((mergedOptions as Record<string, unknown>).prompt_cache_retention)
        : ""
    const promptCacheRetention =
      promptCacheRetentionRaw === "24h" ? "24h" : promptCacheRetentionRaw === "in_memory" ? "in_memory" : null

    // ✅ 선생성: user 메시지 + assistant(in_progress) 메시지
    const userMessageId = crypto.randomUUID()
    assistantMessageId = crypto.randomUUID()

    // Attachments (from client): assetize any data_url so DB isn't bloated.
    // Client sends: [{kind:"image"|"file"|"link", ... , data_url? }]
    const attachmentSlots: PendingAttachmentSlot[] = []
    const incoming = Array.isArray(attachments) ? attachments : []
    for (const a of incoming) {
      if (!a || typeof a !== "object") continue
      const ao = a as Record<string, unknown>
      const kind = typeof ao.kind === "string" ? ao.kind : ""
      if (kind === "link") {
        const url = typeof ao.url === "string" ? ao.url : ""
        const title = typeof ao.title === "string" ? ao.title : ""
        if (url) attachmentSlots.push({ kind: "link", url, title })
        continue
      }
      if (kind === "image" || kind === "file") {
        const name = typeof ao.name === "string" ? ao.name : ""
        const mime = typeof ao.mime === "string" ? ao.mime : ""
        const size = typeof ao.size === "number" ? ao.size : Number(ao.size || 0)
        const dataUrl = typeof ao.data_url === "string" ? ao.data_url : ""
        const assetIdRaw =
          typeof (ao as Record<string, unknown>).asset_id === "string"
            ? String((ao as Record<string, unknown>).asset_id)
            : typeof (ao as Record<string, unknown>).assetId === "string"
              ? String((ao as Record<string, unknown>).assetId)
              : ""
        const base: PendingAttachmentSlot = { kind, name, mime, size, assetId: assetIdRaw || undefined }
        if (dataUrl && dataUrl.startsWith("data:")) {
          attachmentSlots.push({ ...base, dataUrl, assetId: base.assetId || newAssetId() })
        } else {
          const url = typeof ao.url === "string" ? ao.url : ""
          if (url) attachmentSlots.push({ ...base, url })
          else attachmentSlots.push(base)
        }
      }
    }

    const initialAttachments = attachmentSlots.map(({ dataUrl, ...rest }) => rest)
    const normalizedUserContent = normalizeAiContent({ text: prompt, options: mergedOptions, attachments: initialAttachments })
    await appendMessage({
      id: userMessageId,
      conversationId: convId,
      role: "user",
      content: normalizedUserContent,
      contentText: extractTextFromJsonContent(normalizedUserContent) || prompt,
      summary: null,
      status: "none",
      modelApiId,
      providerSlug: String(row.provider_slug || ""),
      providerKey: providerKey,
      providerLogoKey,
    })

    if (attachmentSlots.some((a) => a.dataUrl)) {
      const safeAttachments: Record<string, unknown>[] = []
      for (let i = 0; i < attachmentSlots.length; i += 1) {
        const slot = attachmentSlots[i]
        if (slot.kind === "link") {
          if (slot.url) safeAttachments.push({ kind: "link", url: slot.url, title: slot.title || "" })
          continue
        }
        const base: Record<string, unknown> = {
          kind: slot.kind,
          name: slot.name || "",
          mime: slot.mime || "",
          size: typeof slot.size === "number" ? slot.size : 0,
        }
        if (slot.dataUrl) {
          try {
            const stored = await storeImageDataUrlAsAsset({
              conversationId: convId,
              messageId: userMessageId,
              assetId: slot.assetId || newAssetId(),
              dataUrl: slot.dataUrl,
              index: i,
              kind: slot.kind === "image" || slot.kind === "file" ? slot.kind : undefined,
              sourceType: "attachment",
              authHeader,
            })
            safeAttachments.push({ ...base, url: stored.url, asset_id: stored.assetId, bytes: stored.bytes })
          } catch (e) {
            console.warn("[attachments] failed to store data_url; keeping metadata only", e)
            safeAttachments.push(base)
          }
        } else if (slot.url) {
          safeAttachments.push({ ...base, url: slot.url, asset_id: slot.assetId })
        } else {
          safeAttachments.push(base)
        }
      }

      const normalizedUserContentWithUrls = normalizeAiContent({ text: prompt, options: mergedOptions, attachments: safeAttachments })
      await query(
        `
        UPDATE model_messages
        SET content = $2::jsonb,
            content_text = $3
        WHERE id = $1
        `,
        [userMessageId, JSON.stringify(normalizedUserContentWithUrls), extractTextFromJsonContent(normalizedUserContentWithUrls) || prompt]
      )
    }

    const normalizedAssistantPlaceholder = normalizeAiContent({ output_text: "" })
    await appendMessage({
      id: assistantMessageId,
      conversationId: convId,
      role: "assistant",
      content: normalizedAssistantPlaceholder,
      contentText: "",
      summary: null,
      status: "in_progress",
      modelApiId,
      providerSlug: String(row.provider_slug || ""),
      providerKey: providerKey,
      providerLogoKey,
    })

    const requestAbortController = new AbortController()
    const abortSignal = requestAbortController.signal
    const stopText = "사용자의 요청에 의해 요청 및 답변이 중지 되었습니다."
    cleanupActiveRun = () => {
      clearActiveRun(convId, assistantMessageId)
      if (clientRequestId) clearActiveRunByRequestId(clientRequestId, assistantMessageId)
    }
    registerActiveRun({
      conversationId: convId,
      assistantMessageId,
      userId,
      tenantId,
      abortController: requestAbortController,
    })
    if (clientRequestId) {
      registerActiveRunByRequestId({
        requestId: clientRequestId,
        assistantMessageId,
        userId,
        tenantId,
        abortController: requestAbortController,
      })
    }
    isAborted = () => responseFinalized || req.aborted || abortSignal.aborted
    req.on("close", () => {
      if (responseFinalized) return
      responseFinalized = true
      requestAbortController.abort()
      if (assistantMessageId) {
        void updateMessageContent({
          id: assistantMessageId,
          status: "stopped",
          content: normalizeAiContent({ output_text: stopText }),
          contentText: stopText,
          summary: null,
        })
      }
      cleanupActiveRun()
    })

    const failAndRespond = async (statusCode: number, body: { message: string; details?: unknown }) => {
      if (assistantMessageId) {
        const failText = body.message || "요청 처리 중 오류가 발생했습니다."
        const failContent = normalizeAiContent({ output_text: failText })
        await updateMessageContent({
          id: assistantMessageId,
          status: "failed",
          content: failContent,
          contentText: String(failText).slice(0, 4000),
          summary: null,
        })
      }
      cleanupActiveRun()
      responseFinalized = true
      return res.status(statusCode).json(body)
    }

    let out: { output_text: string; raw: unknown; content: Record<string, unknown> } | null = null

    const webPolicyProviders = new Set(
      (webSearchPolicy.enabled_providers || []).map((p: unknown) => String(p || "").toLowerCase()).filter(Boolean)
    )
    const providerAllowsWeb = webPolicyProviders.size ? webPolicyProviders.has(providerKey) : true
    const webAllowed = Boolean(web_allowed) && mt === "text" && webSearchPolicy.enabled && providerAllowsWeb
    const webProvider = webAllowed ? webSearchPolicy.provider : null
    const webSearchMode = webAllowed ? "auto" : "off"
    const forceBuiltinImageEdit = mt === "image" && incomingImageDataUrls.length > 0

    // ✅ DB-driven execution: if a model_api_profile exists for this provider/purpose, try it first.
    // Safe rollout: if profile is missing or fails, we fall back to the existing provider_family-specific code.
    const purpose: ModelApiPurpose = (mt === "text" ? "chat" : mt) as ModelApiPurpose
    let usedProfileKey: string | null = null
    let profileAttempted = false
    let profileError: unknown = null
    // Web-search mode is orchestration-controlled. To guarantee `tools` gating, we skip DB-profile execution for text chats.
    // Image-with-attachment must use /images/edits (built-in path) so the reference image is actually applied.
    if (!webAllowed && !forceBuiltinImageEdit) {
      try {
        const profile = await loadModelApiProfile({ tenantId, providerId, modelDbId: chosenModelDbId, purpose })
        if (profile) {
          usedProfileKey = profile.profile_key
          const isOpenAiResponsesProfile = providerKey === "openai" && /^openai\.responses/i.test(usedProfileKey || "")
          if (isOpenAiResponsesProfile) {
            // Prefer built-in OpenAI Responses path (prompt_cache_key/retention, template->instructions handling).
            profileAttempted = false
            profileError = "BYPASS_OPENAI_RESPONSES_PROFILE"
            out = null
          } else {
            profileAttempted = true
            const auth = await resolveAuthForModelApiProfile({ providerId, authProfileId: profile.auth_profile_id })
            usedCredentialId = auth.credentialId
            out = await executeHttpJsonProfile({
              apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
              apiKey: auth.apiKey,
              accessToken: auth.accessToken,
              modelApiId,
              purpose,
              prompt,
              input,
              language: finalLang,
              maxTokens: safeMaxTokens,
              history,
              options: mergedOptions,
              injectedTemplate,
              profile,
              configVars: auth.configVars,
              signal: abortSignal,
            })
            // Defensive fallback:
            // Some model_api_profiles mappings (especially for OpenAI structured outputs) can yield empty text
            // even though the provider returned a valid JSON payload. In that case, fall back to the built-in
            // provider client (which has richer extraction + schema handling).
            if (!out.output_text || !String(out.output_text).trim()) {
              console.warn("[model_api_profiles] empty output_text -> fallback to provider client:", usedProfileKey)
              out = null
            }
          }
        }
      } catch (e) {
        console.warn("[model_api_profiles] execution failed -> fallback:", usedProfileKey, e)
        profileAttempted = true
        profileError = e
        out = null
      }
    }

    // Video is DB-profile driven. If we have no profile (or the profile errored), don't fall back to a generic legacy "not implemented".
    // Return an actionable error so Admin can add/fix `model_api_profiles(purpose=video)` for the provider.
    if (mt === "video" && out == null) {
      return await failAndRespond(400, {
        message: "Video requires an active model_api_profile (purpose=video) for the selected provider/model.",
        details: {
          provider_id: providerId,
          provider_family: providerKey,
          model_db_id: chosenModelDbId,
          model_api_id: modelApiId,
          purpose,
          profile_key_used: usedProfileKey,
          profile_attempted: profileAttempted,
          error: profileError ? String((profileError as any)?.message || profileError) : null,
          hint:
            "Create/activate a model_api_profiles row with purpose=video for this provider (model_id can be NULL to apply to all video models). " +
            "The built-in executor supports workflow.type=async_job (poll + binary download) and will return content.video.{data_url|url}.",
        },
      })
    }

    if (out == null) {
      const auth = await resolveAuthForModelApiProfile({ providerId, authProfileId: null })
      usedCredentialId = auth.credentialId
      // Fallback: 기존 provider별 하드코딩 실행기
      if (mt === "text") {
        if (providerKey === "openai") {
        if (webAllowed) {
          const serperKey = String(process.env.SERPER_API_KEY || "").trim()
          if (!serperKey) {
            return await failAndRespond(500, {
              message: "Web search is enabled, but SERPER_API_KEY is not configured on ai-agent-service.",
              details: "Set SERPER_API_KEY in ai-agent-service environment (.env) and restart the service.",
            })
          }

          const { serperSearch } = await import("../services/serperSearch")
          const { gl, hl } = resolveWebLocale({ finalLang, web_search_country, web_search_languages })

          const maxSearchCalls = webSearchPolicy.max_search_calls
          const snippetBudgetChars = webSearchPolicy.max_total_snippet_tokens * 4
          webBudgetCount = maxSearchCalls

          const templateMsgs =
            injectedTemplate && typeof injectedTemplate === "object" && !Array.isArray(injectedTemplate)
              ? (injectedTemplate as Record<string, unknown>).messages
              : null
          type ToolCall = { id: string; type?: string; function: { name: string; arguments: string } }
          type ChatMsg =
            | { role: "system" | "developer" | "user" | "assistant"; content: string; tool_calls?: ToolCall[] }
            | { role: "tool"; tool_call_id: string; content: string }

          const systemDevMsgs: ChatMsg[] = Array.isArray(templateMsgs)
            ? templateMsgs
                .map((m: any): ChatMsg | null => {
                  const role = typeof m?.role === "string" ? m.role : ""
                  const content = typeof m?.content === "string" ? m.content : ""
                  if ((role === "system" || role === "developer") && content) {
                    return { role: role as "system" | "developer", content }
                  }
                  return null
                })
                .filter((x): x is ChatMsg => Boolean(x))
            : []

          const tools = [
            {
              type: "function",
              function: {
                name: "search_web",
                description: "Search the web for up-to-date information. Return concise results with titles, links, and snippets.",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Search query" },
                  },
                  required: ["query"],
                },
              },
            },
          ] as const

          const apiRoot = String((auth.endpointUrl || base.apiBaseUrl) || "").replace(/\/$/, "")
          async function postOpenAi(body: Record<string, unknown>) {
            async function doPost(payload: Record<string, unknown>) {
              const r = await fetch(`${apiRoot}/chat/completions`, {
                method: "POST",
                headers: { Authorization: `Bearer ${auth.apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: abortSignal,
              })
              const j = await r.json().catch(() => ({}))
              return { res: r, json: j }
            }

            const first = await doPost(body)
            if (first.res.ok) return first

            const errStr = JSON.stringify(first.json || {})
            const isUnsupportedResponseFormat =
              first.res.status === 400 && /(response_format|json_object|json_schema|Invalid schema|unsupported)/i.test(errStr)
            if (isUnsupportedResponseFormat) {
              const copy = { ...body }
              delete (copy as any).response_format
              const retry = await doPost(copy)
              if (retry.res.ok) return retry
              return retry
            }

            const isUnsupportedMaxCompletion =
              first.res.status === 400 && /max_completion_tokens/i.test(errStr) && /unsupported|unknown/i.test(errStr)
            if (isUnsupportedMaxCompletion) {
              const copy = { ...body }
              const mct = typeof copy.max_completion_tokens === "number" ? copy.max_completion_tokens : undefined
              delete (copy as any).max_completion_tokens
              if (typeof mct === "number") copy.max_tokens = mct
              const retry = await doPost(copy)
              if (retry.res.ok) return retry
              return retry
            }

            return first
          }

          function extractAssistant(json: any): { content: string; tool_calls: ToolCall[] } {
            const msg = json?.choices?.[0]?.message
            const content = typeof msg?.content === "string" ? msg.content : ""
            const tool_calls = Array.isArray(msg?.tool_calls) ? (msg.tool_calls as ToolCall[]) : []
            return { content, tool_calls }
          }

          const messages: ChatMsg[] = [...systemDevMsgs, { role: "user", content: input }]

          let lastRaw: unknown = null
          let finalText = ""

          for (let i = 0; i < maxSearchCalls + 2; i++) {
            const allowTools = webAllowed && i < maxSearchCalls
            const { res: r0, json: j0 } = await postOpenAi({
              model: modelApiId,
              messages,
              ...(allowTools ? { tools, tool_choice: "auto" } : {}),
              // keep JSON-only behavior consistent with existing UI parser
              response_format: { type: "json_object" },
              max_completion_tokens: Math.min(Math.max(safeMaxTokens, 1024), 4096),
            })
            lastRaw = j0
            if (!r0.ok) throw new Error(`OPENAI_TOOL_LOOP_FAILED_${r0.status}@${apiRoot}:${JSON.stringify(j0)}`)

            const a = extractAssistant(j0)
            if (!a.tool_calls.length) {
              finalText = String(a.content || "").trim()
              break
            }

            // IMPORTANT: For OpenAI chat/completions, tool result messages must follow
            // the assistant message that contains `tool_calls`.
            messages.push({ role: "assistant", content: String(a.content || ""), tool_calls: a.tool_calls })

            // Execute tool calls (only the ones we support)
            for (const tc of a.tool_calls) {
              if (!tc?.id || tc.function?.name !== "search_web") continue
              let q = ""
              try {
                const parsed = JSON.parse(tc.function.arguments || "{}")
                q = typeof parsed?.query === "string" ? parsed.query : ""
              } catch {
                q = ""
              }
              q = String(q || "").trim()
              if (!q) {
                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify({ error: "INVALID_QUERY", message: "query is required" }),
                })
                continue
              }
              webSearchCount += 1
              webQueryCharsTotal += q.length
              const result = await serperSearch({
                apiKey: serperKey,
                query: q,
                country: gl,
                language: hl,
                limit: 5,
                timeoutMs: webSearchPolicy.timeout_ms,
                signal: abortSignal,
              })
              try {
                const rawBytes = JSON.stringify(result.raw ?? result).length
                webResponseBytesTotal += rawBytes
              } catch {
                // ignore
              }
              // Keep tool payload compact (raw is kept server-side only if needed)
              const compactOrganic = compactSearchResults(result.organic, snippetBudgetChars)
              messages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({
                  query: result.query,
                  country: result.country,
                  language: result.language,
                  organic: compactOrganic,
                }),
              })
            }
          }

          if (!finalText) {
            // Last resort: ensure UI has something renderable.
            finalText = JSON.stringify({
              title: "응답 생성 실패",
              summary: "도구 루프에서 최종 응답을 받지 못했습니다. 다시 시도해 주세요.",
              blocks: [{ type: "markdown", markdown: "## 실패\n웹검색 도구 처리 중 최종 응답이 비어 있습니다.\n\n- 다시 시도하거나\n- 웹 허용을 끄고 재시도해 보세요." }],
            })
          }

          out = { output_text: finalText, raw: lastRaw, content: { output_text: finalText, raw: lastRaw as any } }
        } else {
          const r = await openaiSimulateChat({
            apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
            apiKey: auth.apiKey,
            model: modelApiId,
            input,
            maxTokens: safeMaxTokens,
            outputFormat: "block_json",
            templateBody: injectedTemplate || undefined,
            responseSchema,
            promptCacheKey,
            promptCacheRetention,
            signal: abortSignal,
          })
          out = { ...r, content: { output_text: r.output_text, raw: r.raw } }
        }
        } else if (providerKey === "anthropic") {
        const r = await anthropicSimulateChat({
          apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
          apiKey: auth.apiKey,
          model: modelApiId,
          input,
          maxTokens: safeMaxTokens,
          templateBody: injectedTemplate || undefined,
          cacheControl: { ttl: undefined },
          staticSystemText: staticContext || null,
          signal: abortSignal,
        })
        out = { ...r, content: { output_text: r.output_text, raw: r.raw } }
        } else if (providerKey === "google") {
        let googleInput = input
        if (webAllowed) {
          const serperKey = String(process.env.SERPER_API_KEY || "").trim()
          if (!serperKey) {
            return await failAndRespond(500, {
              message: "Web search is enabled, but SERPER_API_KEY is not configured on ai-agent-service.",
              details: "Set SERPER_API_KEY in ai-agent-service environment (.env) and restart the service.",
            })
          }
          const { serperSearch } = await import("../services/serperSearch")
          const { gl, hl } = resolveWebLocale({ finalLang, web_search_country, web_search_languages })
          const queryText = clampText(prompt, 500)
          if (queryText) {
            webBudgetCount = webSearchPolicy.max_search_calls
            webSearchCount += 1
            webQueryCharsTotal += queryText.length
            const result = await serperSearch({
              apiKey: serperKey,
              query: queryText,
              country: gl,
              language: hl,
              limit: 5,
              timeoutMs: webSearchPolicy.timeout_ms,
              signal: abortSignal,
            })
            try {
              const rawBytes = JSON.stringify(result.raw ?? result).length
              webResponseBytesTotal += rawBytes
            } catch {
              // ignore
            }
            const snippetBudgetChars = webSearchPolicy.max_total_snippet_tokens * 4
            const compactOrganic = compactSearchResults(result.organic, snippetBudgetChars)
            const webContext = formatSearchContext(compactOrganic)
            if (webContext) {
              googleInput = `웹 검색 결과:\n${webContext}\n\n${input}`
            }
          }
        }
        const r = await googleSimulateChat({
          apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
          apiKey: auth.apiKey,
          model: modelApiId,
          input: googleInput,
          maxTokens: safeMaxTokens,
          templateBody: injectedTemplate || undefined,
          signal: abortSignal,
        })
        out = { ...r, content: { output_text: r.output_text, raw: r.raw } }
        } else {
        return await failAndRespond(400, { message: `Unsupported provider_family/provider_slug: ${providerKey}` })
        }
      } else if (mt === "image") {
      if (providerKey !== "openai") {
        return await failAndRespond(400, { message: `Image is not supported for provider=${providerKey} yet.` })
      }
      const n = typeof mergedOptions?.n === "number" ? clampInt(mergedOptions.n, 1, 10) : 1
      const size = typeof mergedOptions?.size === "string" ? mergedOptions.size : undefined
      const quality = typeof mergedOptions?.quality === "string" ? mergedOptions.quality : undefined
      const style = typeof mergedOptions?.style === "string" ? mergedOptions.style : undefined
      const background = typeof mergedOptions?.background === "string" ? mergedOptions.background : undefined

      // If prompt_templates.body provided a `prompt`, use it (lets Admin enforce ref-image rules).
      const tmpl = injectedTemplate && typeof injectedTemplate === "object" && !Array.isArray(injectedTemplate) ? (injectedTemplate as Record<string, unknown>) : null
      const promptFromTemplate = tmpl && typeof tmpl.prompt === "string" && tmpl.prompt.trim() ? tmpl.prompt.trim() : ""
      const promptForImage = promptFromTemplate || prompt

      let r: { raw?: unknown; urls?: string[]; data_urls?: string[]; b64?: string[] }
      try {
        r =
          incomingImageDataUrls.length > 0
            ? await openaiEditImage({
                apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
                apiKey: auth.apiKey,
                model: modelApiId,
                prompt: promptForImage,
                image_data_url: incomingImageDataUrls[0],
                n,
                size,
                signal: abortSignal,
              })
            : await openaiGenerateImage({
                apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
                apiKey: auth.apiKey,
                model: modelApiId,
                prompt: promptForImage,
                n,
                size,
                quality,
                style,
                background,
                signal: abortSignal,
              })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const parsed = parseOpenAiImageError(msg)
        const err = parsed?.error || null
        const code = typeof err?.code === "string" ? String(err.code) : ""
        const type = typeof err?.type === "string" ? String(err.type) : ""
        const isModeration = code === "moderation_blocked" || type === "image_generation_user_error"
        if (isModeration) {
          const attachmentInfo = {
            received_attachments: Array.isArray(attachments) ? attachments.length : 0,
            received_image_data_urls: incomingImageDataUrls.length,
          }
          return await failAndRespond(400, {
            message:
              incomingImageDataUrls.length > 0
                ? "첨부 이미지는 정상 수신되었으나 안전 정책에 의해 차단되었습니다. 다른 이미지/프롬프트로 다시 시도해 주세요."
                : "요청이 안전 정책에 의해 차단되었습니다. 다른 이미지/프롬프트로 다시 시도해 주세요.",
            details: {
              code,
              type,
              request_id: parsed?.requestId || null,
              ...attachmentInfo,
            },
          })
        }
        return await failAndRespond(500, {
          message: "OpenAI 이미지 요청에 실패했습니다.",
          details: msg,
        })
      }
      const appliedOptions = Object.fromEntries(
        Object.entries(
          incomingImageDataUrls.length > 0
            ? { n, size }
            : { n, size, quality, style, background }
        ).filter(([, v]) => v !== undefined)
      ) as Record<string, unknown>
      optionsForAssistant = appliedOptions
      // Prefer data URLs when available; otherwise download URLs to keep assets permanent.
      const sourceUrls: string[] = (r.data_urls && r.data_urls.length ? r.data_urls : r.urls) || []
      const resolvedUrls = await materializeImageUrlsToDataUrls(sourceUrls, abortSignal)
      imageUsage = {
        count: resolvedUrls.length || n,
        size: typeof size === "string" ? size : undefined,
        quality: typeof quality === "string" ? quality : undefined,
      }
      const blocks = resolvedUrls.length
        ? resolvedUrls.map((u) => ({ type: "markdown", markdown: `![image](${u})` }))
        : [{ type: "markdown", markdown: "이미지 생성 결과를 받지 못했습니다." }]
      const blockJson = {
        title: "이미지 생성",
        summary: incomingImageDataUrls.length > 0 ? "첨부 이미지(참조)를 기반으로 편집한 결과입니다." : "요청한 이미지 생성 결과입니다.",
        blocks,
        options: appliedOptions,
      }
      out = {
        output_text: JSON.stringify(blockJson),
        // NOTE: keep a safe(raw) payload from provider client for debugging (it omits huge base64 strings).
        raw: isRecord(r.raw) ? { ...(r.raw as Record<string, unknown>), _debug: { used_edit: incomingImageDataUrls.length > 0 } } : r.raw,
        content: { ...blockJson, images: resolvedUrls.map((u) => ({ url: u })), raw: r.raw },
      }
      } else if (mt === "audio" || mt === "music") {
      if (providerKey !== "openai") {
        return await failAndRespond(400, { message: `${mt} is not supported for provider=${providerKey} yet.` })
      }
      // Allow prompt_templates.body to override audio request fields.
      const tmpl = injectedTemplate && typeof injectedTemplate === "object" && !Array.isArray(injectedTemplate) ? (injectedTemplate as Record<string, unknown>) : null
      const inputFromTemplate = tmpl && typeof tmpl.input === "string" && tmpl.input.trim() ? tmpl.input.trim() : ""

      const voice =
        (tmpl && typeof tmpl.voice === "string" && tmpl.voice.trim() ? tmpl.voice.trim() : "") ||
        (typeof mergedOptions?.voice === "string" ? mergedOptions.voice : "") ||
        undefined

      const formatRaw =
        ((tmpl && typeof tmpl.format === "string" ? tmpl.format : "") || (typeof mergedOptions?.format === "string" ? mergedOptions.format : "") || "")
          .trim()
          .toLowerCase()
      const format: AudioFormat = isAudioFormat(formatRaw) ? formatRaw : "mp3"
      const speed =
        typeof (tmpl as Record<string, unknown> | null)?.speed === "number"
          ? Number((tmpl as Record<string, unknown>).speed)
          : typeof mergedOptions?.speed === "number"
            ? mergedOptions.speed
            : undefined
      const r = await openaiTextToSpeech({
        apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
        apiKey: auth.apiKey,
        model: modelApiId,
        input: inputFromTemplate || prompt,
        voice,
        format,
        speed,
        signal: abortSignal,
      })
      if (mt === "music") {
        const seconds =
          typeof (mergedOptions as Record<string, unknown> | null)?.seconds === "number"
            ? Number((mergedOptions as Record<string, unknown>).seconds)
            : typeof (mergedOptions as Record<string, unknown> | null)?.duration === "number"
              ? Number((mergedOptions as Record<string, unknown>).duration)
              : 0
        const sampleRate =
          typeof (mergedOptions as Record<string, unknown> | null)?.sample_rate === "number"
            ? Number((mergedOptions as Record<string, unknown>).sample_rate)
            : undefined
        const channels =
          typeof (mergedOptions as Record<string, unknown> | null)?.channels === "string"
            ? String((mergedOptions as Record<string, unknown>).channels)
            : undefined
        const bitDepth =
          typeof (mergedOptions as Record<string, unknown> | null)?.bit_depth === "number"
            ? Number((mergedOptions as Record<string, unknown>).bit_depth)
            : undefined
        musicUsage = { seconds, sample_rate: sampleRate, channels, bit_depth: bitDepth }
      }
      const blockJson = {
        title: mt === "music" ? "음악 생성" : "오디오 생성",
        summary: "오디오 생성이 완료되었습니다.",
        blocks: [{ type: "markdown", markdown: "오디오가 생성되었습니다. (재생 UI는 Timeline에서 표시됩니다)" }],
      }
      out = {
        output_text: JSON.stringify(blockJson),
        raw: r.raw,
        content: { ...blockJson, audio: { mime: r.mime, data_url: r.data_url }, raw: r.raw },
      }
      } else if (mt === "video") {
      return await failAndRespond(400, {
        message: "Video is not implemented yet.",
        details:
          "현재 프로젝트에는 video 생성용 provider client(예: Runway/Pika/Sora)가 아직 없습니다. 어떤 provider_family/endpoint를 사용할지 알려주시면 연동을 구현할 수 있습니다.",
      })
      } else {
      return await failAndRespond(400, { message: `Unsupported model_type=${mt}` })
      }
    }

    if (!optionsForAssistant && mergedOptions && Object.keys(mergedOptions).length > 0) {
      optionsForAssistant = mergedOptions
    }
    if (optionsForAssistant && isRecord(out.content)) {
      out = { ...out, content: { ...(out.content as Record<string, unknown>), options: optionsForAssistant } }
    }

    // Assetize media fields (image/audio/video data URLs) before persisting assistant message.
    const rewritten = rewriteContentWithAssetUrls(out.content)
    const assistantContentInput: Record<string, unknown> = isRecord(rewritten.content) ? { ...rewritten.content } : {}
    const blocks = Array.isArray(assistantContentInput.blocks) ? (assistantContentInput.blocks as unknown[]) : []
    if (blocks.length === 0 && typeof out.output_text === "string" && out.output_text.trim()) {
      assistantContentInput.output_text = out.output_text
    }
    let normalizedAssistantContent = normalizeAiContent(assistantContentInput)
    if (optionsForAssistant && Object.keys(optionsForAssistant).length > 0) {
      normalizedAssistantContent = { ...normalizedAssistantContent, options: optionsForAssistant }
    }
    const normalizedBlocks = Array.isArray(normalizedAssistantContent.blocks) ? (normalizedAssistantContent.blocks as unknown[]) : []
    if (normalizedBlocks.length === 0 && typeof out.output_text === "string" && out.output_text.trim()) {
      normalizedAssistantContent = normalizeAiContent({ output_text: out.output_text })
    }

    // Use a safe, compact content_text for history/context (avoid huge JSON / base64).
    const title = typeof normalizedAssistantContent.title === "string" ? normalizedAssistantContent.title : ""
    const summary = typeof normalizedAssistantContent.summary === "string" ? normalizedAssistantContent.summary : ""
    const imgCount = Array.isArray(normalizedAssistantContent.images) ? (normalizedAssistantContent.images as unknown[]).length : 0
    const hasAudio = isRecord(normalizedAssistantContent.audio)
    const hasVideo = isRecord(normalizedAssistantContent.video)
    const contentTextFromBlocks = extractTextFromJsonContent(normalizedAssistantContent)
    const contentTextForHistory =
      title || summary
        ? `${title || ""}${title && summary ? " - " : ""}${summary || ""}`.slice(0, 4000)
        : imgCount
          ? `이미지 생성 (${imgCount}장)`
          : hasAudio
            ? "오디오 생성"
            : hasVideo
              ? "비디오 생성"
              : String(contentTextFromBlocks || "").slice(0, 4000)

    if (isAborted()) {
      cleanupActiveRun()
      return res.status(499).json({ message: "Client aborted request." })
    }

    const didUpdateAssistant = await updateMessageContent({
      id: assistantMessageId,
      status: "success",
      content: normalizedAssistantContent,
      contentText: contentTextForHistory,
      summary: null,
    })
    cleanupActiveRun()

    // Persist assets (FK requires message row exists).
    if (didUpdateAssistant) {
      for (const a of rewritten.assets) {
        await storeImageDataUrlAsAsset({
          conversationId: convId,
          messageId: assistantMessageId,
          assetId: a.assetId,
          dataUrl: a.dataUrl,
          index: a.index,
          kind: a.kind,
          sourceType: "ai_generated",
          authHeader,
        })
      }
    }

    // Return rewritten (assetized) content to the client as output_text too,
    // so the frontend never receives base64 blobs in output_text.
    out.output_text = JSON.stringify(rewritten.content)

    // best-effort: keep conversation model_id updated to last used model
    if (didUpdateAssistant) {
      await query(`UPDATE model_conversations SET model_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [convId, chosenModelDbId])
    }

    // Update conversation title: use content.title if present, otherwise fallback
    if (didUpdateAssistant) {
      const responseTitle = typeof normalizedAssistantContent.title === "string" && normalizedAssistantContent.title.trim()
        ? normalizedAssistantContent.title.trim()
        : null
      const finalTitle = responseTitle || getFallbackTitle(mt, prompt)
      // Only update if title is still a temp title (to avoid overwriting user-edited titles)
      const tempTitle = getTempTitle(mt)
      await query(
        `UPDATE model_conversations SET title = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND title = $3`,
        [convId, finalTitle, tempTitle]
      )
    }

    // ✅ usage log (best-effort)
    try {
      if (usedProviderId && usedModelDbId && usedModelApiId) {
        const usage = extractUsageFromProviderRaw(out?.raw)
        const inputTokens = usage.input_tokens
        const cachedInputTokens = usage.cached_input_tokens
        const outputTokens = usage.output_tokens
        const totalTokens = usage.total_tokens || inputTokens + outputTokens

        const inputCostPer1k = Number(row.input_token_cost_per_1k || 0)
        const outputCostPer1k = Number(row.output_token_cost_per_1k || 0)
        const costCurrency = String(row.currency || "USD")
        const inputCost = (inputTokens / 1000) * inputCostPer1k
        const cachedInputCost = (cachedInputTokens / 1000) * inputCostPer1k
        const outputCost = (outputTokens / 1000) * outputCostPer1k
        const totalCost = inputCost + outputCost

        const modality = toLlmModality(mt, incomingImageDataUrls.length > 0 || incomingImageUrls.length > 0)
        const featureName = mt === "text" || mt === "code" || mt === "multimodal" ? "chat" : mt
        const requestedModel = model_api_id ? String(model_api_id).trim() : usedModelApiId

        const attachmentStats = { total: incoming.length, images: 0, files: 0, links: 0 }
        for (const a of incoming) {
          if (!a || typeof a !== "object") continue
          const kind = typeof (a as Record<string, unknown>).kind === "string" ? String((a as Record<string, unknown>).kind) : ""
          if (kind === "image") attachmentStats.images += 1
          else if (kind === "file") attachmentStats.files += 1
          else if (kind === "link") attachmentStats.links += 1
        }

        const requestData = {
          provider_slug: usedProviderSlug,
          model_type: mt,
          requested_model: requestedModel,
          resolved_model: usedModelApiId,
          max_tokens: safeMaxTokens,
          input_preview: prompt.slice(0, 500),
          static_context_preview: staticContext ? staticContext.slice(0, 1000) : "",
          dynamic_context_preview: dynamicContext ? dynamicContext.slice(0, 1000) : "",
          prompt_cache_key: promptCacheKey || null,
          prompt_cache_retention: promptCacheRetention || null,
          attachments: attachmentStats,
          web_allowed: Boolean(webAllowed),
          web_search_country: web_search_country || null,
          web_search_languages: web_search_languages || null,
        }
        const responseData = {
          output_text_preview: String(contentTextForHistory || "").slice(0, 1000),
          raw: out?.raw ?? null,
        }
        const modelParams = {
          max_tokens: safeMaxTokens,
          options: mergedOptions,
          profile_key: usedProfileKey,
        }
        const responseTimeMs = Date.now() - runStartedAtMs
        const status = didUpdateAssistant ? "success" : "failed"
        const web_enabled = webAllowed
        const web_provider = webProvider
        const web_search_mode = webSearchMode

        const logRes = await query(
          `
          INSERT INTO llm_usage_logs (
            tenant_id, user_id, provider_id, model_id, credential_id, service_id,
            requested_model, resolved_model, modality, feature_name, request_id,
            conversation_id, model_message_id,
            web_enabled, web_provider, web_search_mode, web_budget_count, web_search_count,
            input_tokens, cached_input_tokens, output_tokens, total_tokens,
            input_cost, cached_input_cost, output_cost, total_cost, currency,
            response_time_ms, status, error_code, error_message,
            request_data, response_data, model_parameters,
            ip_address, user_agent, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13,
            $14, $15, $16, $17, $18,
            $19, $20, $21, $22,
            $23, $24, $25, $26, $27,
            $28, $29, $30, $31,
            $32::jsonb, $33::jsonb, $34::jsonb,
            $35::inet, $36, $37::jsonb
          )
          ON CONFLICT (tenant_id, request_id) DO UPDATE SET
            status = EXCLUDED.status,
            error_code = EXCLUDED.error_code,
            error_message = EXCLUDED.error_message,
            response_time_ms = EXCLUDED.response_time_ms,
            input_tokens = EXCLUDED.input_tokens,
            cached_input_tokens = EXCLUDED.cached_input_tokens,
            output_tokens = EXCLUDED.output_tokens,
            total_tokens = EXCLUDED.total_tokens,
            input_cost = EXCLUDED.input_cost,
            cached_input_cost = EXCLUDED.cached_input_cost,
            output_cost = EXCLUDED.output_cost,
            total_cost = EXCLUDED.total_cost,
            currency = EXCLUDED.currency,
            request_data = EXCLUDED.request_data,
            response_data = EXCLUDED.response_data,
            model_parameters = EXCLUDED.model_parameters,
            model_message_id = COALESCE(llm_usage_logs.model_message_id, EXCLUDED.model_message_id),
            conversation_id = COALESCE(llm_usage_logs.conversation_id, EXCLUDED.conversation_id),
            web_search_count = EXCLUDED.web_search_count
          RETURNING id
          `,
          [
            tenantId,
            userId,
            usedProviderId,
            usedModelDbId,
            usedCredentialId,
            null,
            requestedModel,
            usedModelApiId,
            modality,
            featureName,
            requestIdForLog,
            convId,
            assistantMessageId,
            web_enabled,
            web_provider,
            web_search_mode,
            webBudgetCount,
            webSearchCount,
            inputTokens,
            cachedInputTokens,
            outputTokens,
            totalTokens,
            inputCost,
            cachedInputCost,
            outputCost,
            totalCost,
            costCurrency,
            responseTimeMs,
            status,
            null,
            null,
            JSON.stringify(requestData),
            JSON.stringify(responseData),
            JSON.stringify(modelParams),
            (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || (req.socket.remoteAddress ?? null),
            String(req.headers["user-agent"] || ""),
            JSON.stringify({
              api: "ai-agent-service",
              endpoint: "/api/ai/chat/run",
              client_request_id: clientRequestId || null,
              profile_key: usedProfileKey || null,
              profile_attempted: profileAttempted,
              profile_error: profileError ? String((profileError as any)?.message || profileError) : null,
            }),
          ]
        )

        const usageLogId = logRes.rows[0]?.id as string | undefined
        if (usageLogId) {
          if (inputTokens > 0 || cachedInputTokens > 0 || outputTokens > 0) {
            await query(
              `
              INSERT INTO llm_token_usages (
                usage_log_id, input_tokens, cached_input_tokens, output_tokens, unit
              )
              SELECT $1, $2, $3, $4, 'tokens'
              WHERE NOT EXISTS (
                SELECT 1 FROM llm_token_usages WHERE usage_log_id = $1
              )
              `,
              [usageLogId, inputTokens, cachedInputTokens, outputTokens]
            )
          }

          if (imageUsage) {
            await query(
              `
              INSERT INTO llm_image_usages (
                usage_log_id, image_count, size, quality, unit
              )
              SELECT $1, $2, $3, $4, 'image'
              WHERE NOT EXISTS (
                SELECT 1 FROM llm_image_usages WHERE usage_log_id = $1
              )
              `,
              [usageLogId, imageUsage.count, imageUsage.size || null, imageUsage.quality || null]
            )
          }

          if (musicUsage) {
            await query(
              `
              INSERT INTO llm_music_usages (
                usage_log_id, seconds, sample_rate, channels, bit_depth, unit
              )
              SELECT $1, $2, $3, $4, $5, 'second'
              WHERE NOT EXISTS (
                SELECT 1 FROM llm_music_usages WHERE usage_log_id = $1
              )
              `,
              [usageLogId, musicUsage.seconds, musicUsage.sample_rate || null, musicUsage.channels || null, musicUsage.bit_depth || null]
            )
          }

          if (webSearchCount > 0) {
            await query(
              `
              INSERT INTO llm_web_search_usages (
                usage_log_id, provider, count, query_chars_total, response_bytes_total, status, unit
              )
              SELECT $1, $2, $3, $4, $5, 'success', 'request'
              WHERE NOT EXISTS (
                SELECT 1 FROM llm_web_search_usages WHERE usage_log_id = $1
              )
              `,
              [usageLogId, webProvider || "serper", webSearchCount, webQueryCharsTotal, webResponseBytesTotal]
            )
          }
        }
      }
    } catch (e) {
      console.warn("[usage-log] insert failed:", e)
    }

    responseFinalized = true
    const clientDebug = isRecord(req.body) && isRecord((req.body as any).client_debug) ? ((req.body as any).client_debug as Record<string, unknown>) : null
    return res.json({
      ok: true,
      conversation_id: convId,
      language: finalLang,
      content: normalizedAssistantContent,
      content_text: contentTextForHistory,
      chosen: {
        provider_id: providerId,
        provider_key: providerKey,
        provider_product_name: String(row.provider_product_name || ""),
        provider_description: String(row.provider_description || ""),
        model_db_id: chosenModelDbId,
        model_api_id: modelApiId,
      },
      output_text: out.output_text,
      raw: out.raw,
      debug: {
        received_attachments: Array.isArray(attachments) ? attachments.length : 0,
        received_image_data_urls: incomingImageDataUrls.length,
        used_profile: usedProfileKey || null,
        client_debug: clientDebug,
      },
    })
  } catch (e: unknown) {
    console.error("chatRun error:", e)
    const msg = e instanceof Error ? e.message : String(e)
    if (assistantMessageId && !isAborted()) {
      const failText = `요청 처리 중 오류가 발생했습니다.\n\n${msg}`
      const failContent = normalizeAiContent({ output_text: failText })
      await updateMessageContent({
        id: assistantMessageId,
        status: "failed",
        content: failContent,
        contentText: failText.slice(0, 4000),
        summary: null,
      })
    }
    cleanupActiveRun()
    responseFinalized = true
    return res.status(500).json({ message: "Failed to run chat", details: msg })
  }
}


