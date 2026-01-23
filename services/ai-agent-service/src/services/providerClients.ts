import { query } from "../config/db"
import { ensureSystemTenantId } from "./systemTenantService"
import { decryptApiKey } from "./cryptoService"

type ProviderSlug = "openai" | "anthropic" | "google"

type OpenAiJsonSchema = {
  name: string
  schema: Record<string, unknown>
  strict?: boolean
}

function deepMerge(a: unknown, b: unknown): unknown {
  // b wins. arrays are replaced.
  if (Array.isArray(a) || Array.isArray(b)) return b ?? a
  if (!a || typeof a !== "object") return b
  if (!b || typeof b !== "object") return b
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) }
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
    const av = out[k]
    out[k] = deepMerge(av, v)
  }
  return out
}

function openAiBlockJsonSchema(): OpenAiJsonSchema {
  // LLM block response schema (server-level enforcement)
  return {
    name: "llm_block_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "blocks"],
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        blocks: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["type", "markdown"],
                properties: { type: { const: "markdown" }, markdown: { type: "string" } },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["type", "language", "code"],
                properties: {
                  type: { const: "code" },
                  language: { type: "string" },
                  code: { type: "string" },
                },
              },
              {
                type: "object",
                additionalProperties: false,
                required: ["type", "headers", "rows"],
                properties: {
                  type: { const: "table" },
                  headers: { type: "array", items: { type: "string" } },
                  rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                },
              },
            ],
          },
        },
      },
    },
  }
}

// OpenAI base URL은 Admin에서 잘못 입력될 수 있어 방어적으로 정규화합니다.
// 예) https://api.openai.com/v1/chat/completions → https://api.openai.com/v1
function normalizeOpenAiBaseUrl(input: string) {
  const cleaned = (input || "")
    .trim()
    // 가끔 복사/붙여넣기 과정에서 들어오는 zero-width space 제거
    .replace(/\u200b/g, "")
    .replace(/\/+$/g, "")

  if (!cleaned) return ""

  // 사용자가 "엔드포인트 전체"를 넣는 경우가 많아 base(v1)로 정규화합니다.
  // - https://api.openai.com            -> https://api.openai.com/v1
  // - https://api.openai.com/v1/        -> https://api.openai.com/v1
  // - https://api.openai.com/v1/responses -> https://api.openai.com/v1
  // - https://api.openai.com/v1/chat/completions -> https://api.openai.com/v1
  // - https://api.openai.com/chat/completions -> https://api.openai.com/v1 (방어)
  try {
    const u = new URL(cleaned)

    // known endpoint suffix trim
    u.pathname = u.pathname
      .replace(/\/v1\/chat\/completions$/i, "/v1")
      .replace(/\/v1\/responses$/i, "/v1")
      .replace(/\/chat\/completions$/i, "")
      .replace(/\/responses$/i, "")

    // ensure /v1 for official OpenAI host
    if (u.host.toLowerCase() === "api.openai.com") {
      if (!u.pathname || u.pathname === "/" || !u.pathname.toLowerCase().startsWith("/v1")) {
        u.pathname = "/v1"
      } else if (u.pathname.toLowerCase() !== "/v1") {
        // keep only the base prefix for safety
        u.pathname = "/v1"
      }
    }

    // drop any query/hash user might have pasted
    u.search = ""
    u.hash = ""
    return u.toString().replace(/\/+$/g, "")
  } catch {
    // non-standard URL: keep best-effort trimming only
    if (cleaned.endsWith("/chat/completions")) return cleaned.replace(/\/chat\/completions$/, "")
    return cleaned
  }
}

export async function openaiGenerateImage(args: {
  apiBaseUrl: string
  apiKey: string
  model: string
  prompt: string
  // common options (best-effort)
  n?: number
  size?: string
  quality?: string
  style?: string
  background?: string
}) {
  const normalized = normalizeOpenAiBaseUrl(args.apiBaseUrl)
  const base = normalized || "https://api.openai.com/v1"
  const apiRoot = base.replace(/\/$/, "")

  // NOTE:
  // Some environments/providers (or newer OpenAI image endpoints) reject `response_format`.
  // We prefer URLs when possible, but must be robust.
  const bodyWithResponseFormat: Record<string, unknown> = {
    model: args.model,
    prompt: args.prompt,
    response_format: "url",
  }
  if (Number.isFinite(args.n as number)) bodyWithResponseFormat.n = args.n
  if (typeof args.size === "string" && args.size.trim()) {
    // Normalize common UI variants: "256*256" or "256×256" -> "256x256"
    const normalizedSize = args.size.trim().replace(/[×*]/g, "x")
    bodyWithResponseFormat.size = normalizedSize
  }
  if (typeof args.quality === "string" && args.quality.trim()) bodyWithResponseFormat.quality = args.quality.trim()
  if (typeof args.style === "string" && args.style.trim()) bodyWithResponseFormat.style = args.style.trim()
  if (typeof args.background === "string" && args.background.trim()) bodyWithResponseFormat.background = args.background.trim()

  const bodyNoResponseFormat: Record<string, unknown> = { ...bodyWithResponseFormat }
  delete bodyNoResponseFormat.response_format
  const retryableUnknownParams = new Set(["response_format", "style", "quality", "background"])

  async function post(body: Record<string, unknown>) {
    const res = await fetch(`${apiRoot}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  // 1) Try with response_format=url for best compatibility with our URL renderer.
  // 2) If API rejects an optional param as unknown, retry by removing it (up to a few attempts).
  let r = await post(bodyWithResponseFormat)
  let bodyToRetry: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 4 && !r.res.ok; attempt++) {
    const root = r.json && typeof r.json === "object" ? (r.json as Record<string, unknown>) : null
    const err = root?.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : null
    const msg = typeof err?.message === "string" ? err.message : ""
    const param = typeof err?.param === "string" ? err.param : ""
    const isUnknown =
      r.res.status === 400 &&
      typeof msg === "string" &&
      msg.toLowerCase().includes("unknown parameter") &&
      typeof param === "string" &&
      retryableUnknownParams.has(param)

    if (!isUnknown) break

    // first fallback: drop response_format if that's the issue
    if (param === "response_format") {
      bodyToRetry = { ...bodyNoResponseFormat }
    } else {
      bodyToRetry = { ...(bodyToRetry || bodyWithResponseFormat) }
      delete bodyToRetry[param]
      // also drop response_format if we haven't already, since some environments reject it too
      delete bodyToRetry.response_format
    }
    r = await post(bodyToRetry)
  }
  if (!r.res.ok) {
    throw new Error(`OPENAI_IMAGE_FAILED_${r.res.status}@${apiRoot}:${JSON.stringify(r.json)}`)
  }
  const json = r.json

  const root = json && typeof json === "object" ? (json as Record<string, unknown>) : null

  // Some gateways may return 200 with an embedded error object.
  // Treat that as an error so callers can surface the actual reason (policy, invalid prompt, etc).
  try {
    const err = root?.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : null
    const msg = typeof err?.message === "string" ? err.message : ""
    if (msg && msg.trim()) {
      throw new Error(`OPENAI_IMAGE_FAILED_200@${apiRoot}:${JSON.stringify(root)}`)
    }
  } catch (e) {
    // If this throws, it will be caught by the outer try/caller; rethrow to preserve behavior.
    if (e instanceof Error) throw e
    throw new Error(String(e))
  }

  // OpenAI(and compatible gateways) can return slightly different shapes/field names:
  // - { data: [{ url }, { b64_json }] }
  // - { images: [...] }
  // - nested url objects, or alternative base64 keys (b64/base64/data)
  const data =
    (Array.isArray(root?.data) ? (root?.data as unknown[]) : null) ||
    (Array.isArray(root?.images) ? (root?.images as unknown[]) : null) ||
    []

  const urls = data
    .map((d) => {
      if (!d || typeof d !== "object") return ""
      const obj = d as Record<string, unknown>
      const direct = typeof obj.url === "string" ? obj.url : ""
      if (direct) return String(direct)
      const nestedUrl = obj.url && typeof obj.url === "object" ? (obj.url as Record<string, unknown>) : null
      if (nestedUrl && typeof nestedUrl.url === "string") return String(nestedUrl.url)
      const imageUrl = typeof obj.image_url === "string" ? obj.image_url : ""
      if (imageUrl) return String(imageUrl)
      return ""
    })
    .filter(Boolean)

  const b64 = data
    .map((d) => {
      if (!d || typeof d !== "object") return ""
      const obj = d as Record<string, unknown>
      const v =
        (typeof obj.b64_json === "string" && obj.b64_json) ||
        (typeof obj.b64 === "string" && obj.b64) ||
        (typeof obj.base64 === "string" && obj.base64) ||
        (typeof obj.data === "string" && obj.data) ||
        ""
      return v ? String(v) : ""
    })
    .filter(Boolean)

  // If the API returns base64 only, convert it to data URLs so the frontend can render without saving files.
  // OpenAI image generations commonly return PNG bytes; default to image/png if unknown.
  const data_urls = b64.map((s) => `data:image/png;base64,${s}`)

  function looksLikeUrl(s: string) {
    const t = s.trim()
    if (!t) return false
    if (t.startsWith("data:image/")) return true
    if (!/^https?:\/\//i.test(t)) return false
    // allow signed urls without extensions; reject clearly non-image urls only if obvious
    return true
  }

  function deepCollect(node: unknown, depth: number, out: { urls: string[]; b64: string[] }) {
    if (!node || depth <= 0) return
    if (typeof node === "string") {
      const s = node.trim()
      if (s.startsWith("data:image/")) out.urls.push(s)
      else if (looksLikeUrl(s)) out.urls.push(s)
      return
    }
    if (Array.isArray(node)) {
      for (const it of node) deepCollect(it, depth - 1, out)
      return
    }
    if (typeof node !== "object") return
    const obj = node as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase()
      if (typeof v === "string") {
        const s = v.trim()
        if ((key === "url" || key.endsWith("_url") || key.includes("image_url")) && looksLikeUrl(s)) out.urls.push(s)
        if ((key.includes("b64") || key.includes("base64")) && s) out.b64.push(s)
        if (s.startsWith("data:image/")) out.urls.push(s)
      } else if (v && typeof v === "object") {
        // common nested shapes: { image_url: { url: "..." } }
        if ((key === "url" || key.endsWith("_url") || key.includes("image_url")) && typeof (v as Record<string, unknown>).url === "string") {
          const s = String((v as Record<string, unknown>).url || "").trim()
          if (looksLikeUrl(s)) out.urls.push(s)
        }
        deepCollect(v, depth - 1, out)
      } else if (Array.isArray(v)) {
        deepCollect(v, depth - 1, out)
      }
    }
  }

  // If we still have nothing, try a deep scan of the raw response (best-effort).
  let urls2 = urls
  let b642 = b64
  let data_urls2 = data_urls
  if (!urls2.length && !data_urls2.length) {
    const collected = { urls: [] as string[], b64: [] as string[] }
    deepCollect(root, 8, collected)
    const uniqueUrls = Array.from(new Set(collected.urls)).filter(Boolean)
    const uniqueB64 = Array.from(new Set(collected.b64)).filter(Boolean)
    urls2 = uniqueUrls
    b642 = uniqueB64
    data_urls2 = uniqueB64.map((s) => (s.startsWith("data:image/") ? s : `data:image/png;base64,${s}`))
  }

  // Avoid returning huge base64 blobs in raw logs/metadata.
  const rawSafe: Record<string, unknown> = root ? { ...root } : {}
  try {
    if (Array.isArray(rawSafe.data)) {
      rawSafe.data = (rawSafe.data as unknown[]).map((d) => {
        if (!d || typeof d !== "object") return d
        const obj = { ...(d as Record<string, unknown>) }
        if (typeof obj.b64_json === "string") obj.b64_json = `<omitted:${obj.b64_json.length}>`
        if (typeof obj.b64 === "string") obj.b64 = `<omitted:${obj.b64.length}>`
        if (typeof obj.base64 === "string") obj.base64 = `<omitted:${obj.base64.length}>`
        return obj
      })
    }
    if (Array.isArray(rawSafe.images)) {
      rawSafe.images = (rawSafe.images as unknown[]).map((d) => {
        if (!d || typeof d !== "object") return d
        const obj = { ...(d as Record<string, unknown>) }
        if (typeof obj.b64_json === "string") obj.b64_json = `<omitted:${obj.b64_json.length}>`
        if (typeof obj.b64 === "string") obj.b64 = `<omitted:${obj.b64.length}>`
        if (typeof obj.base64 === "string") obj.base64 = `<omitted:${obj.base64.length}>`
        return obj
      })
    }
  } catch {
    // ignore
  }

  // Provide lightweight debug hints when we couldn't extract anything.
  if (!urls2.length && !data_urls2.length) {
    try {
      rawSafe._debug = {
        top_keys: root ? Object.keys(root) : [],
        data_len: Array.isArray((root as Record<string, unknown> | null)?.data) ? ((root as Record<string, unknown>).data as unknown[]).length : 0,
        images_len: Array.isArray((root as Record<string, unknown> | null)?.images) ? ((root as Record<string, unknown>).images as unknown[]).length : 0,
      }
    } catch {
      // ignore
    }
  }

  return { raw: rawSafe, urls: urls2, b64: b642, data_urls: data_urls2 }
}

export async function openaiTextToSpeech(args: {
  apiBaseUrl: string
  apiKey: string
  model: string
  input: string
  voice?: string
  format?: "mp3" | "wav" | "opus" | "aac" | "flac"
  speed?: number
}) {
  const normalized = normalizeOpenAiBaseUrl(args.apiBaseUrl)
  const base = normalized || "https://api.openai.com/v1"
  const apiRoot = base.replace(/\/$/, "")

  const fmt = (args.format || "mp3").toLowerCase() as "mp3" | "wav" | "opus" | "aac" | "flac"
  const body: Record<string, unknown> = {
    model: args.model,
    input: args.input,
    voice: (args.voice || "alloy").toString(),
    format: fmt,
  }
  if (typeof args.speed === "number" && Number.isFinite(args.speed)) body.speed = args.speed

  const res = await fetch(`${apiRoot}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`OPENAI_TTS_FAILED_${res.status}@${apiRoot}:${errText}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  const b64 = buf.toString("base64")
  const mime =
    fmt === "mp3"
      ? "audio/mpeg"
      : fmt === "wav"
        ? "audio/wav"
        : fmt === "aac"
          ? "audio/aac"
          : fmt === "flac"
            ? "audio/flac"
            : "audio/ogg"
  const dataUrl = `data:${mime};base64,${b64}`
  return { raw: { mime, bytes: buf.length }, mime, data_url: dataUrl, base64: b64 }
}

// Google Gemini base URL 정규화
// - 기본: https://generativelanguage.googleapis.com/v1beta
// - 사용자가 /models/...:generateContent 같은 전체 엔드포인트를 넣어도 base까지만 잘라냅니다.
function normalizeGoogleBaseUrl(input: string) {
  const cleaned = (input || "").trim().replace(/\u200b/g, "").replace(/\/+$/g, "")
  if (!cleaned) return ""
  try {
    const u = new URL(cleaned)
    u.pathname = u.pathname
      .replace(/\/v1beta\/models\/.*$/i, "/v1beta")
      .replace(/\/v1\/models\/.*$/i, "/v1")
      .replace(/\/models\/.*$/i, "")
    u.search = ""
    u.hash = ""
    return u.toString().replace(/\/+$/g, "")
  } catch {
    return cleaned
  }
}

export async function getProviderAuth(providerId: string) {
  // 공용 credential(system tenant) 중 default 우선으로 선택
  const systemTenantId = await ensureSystemTenantId()
  const res = await query(
    `SELECT id, api_key_encrypted, endpoint_url, organization_id
     FROM provider_api_credentials
     WHERE tenant_id = $1 AND provider_id = $2 AND is_active = TRUE
     ORDER BY is_default DESC, created_at DESC
     LIMIT 1`,
    [systemTenantId, providerId]
  )
  if (res.rows.length === 0) throw new Error("NO_ACTIVE_CREDENTIAL")
  const row = res.rows[0]
  const apiKey = decryptApiKey(row.api_key_encrypted)
  return {
    credentialId: row.id as string,
    apiKey,
    endpointUrl: row.endpoint_url as string | null,
    organizationId: row.organization_id as string | null,
  }
}

export async function getProviderBase(providerId: string) {
  const res = await query(`SELECT api_base_url, slug FROM ai_providers WHERE id = $1`, [providerId])
  if (res.rows.length === 0) throw new Error("PROVIDER_NOT_FOUND")
  return {
    apiBaseUrl: (res.rows[0].api_base_url as string | null) || "",
    slug: (res.rows[0].slug as ProviderSlug) || "",
  }
}

export async function openaiListModels(apiBaseUrl: string, apiKey: string) {
  const normalized = normalizeOpenAiBaseUrl(apiBaseUrl)
  const base = normalized || "https://api.openai.com/v1"
  const res = await fetch(`${base.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OPENAI_LIST_FAILED_${res.status}`)
  const json = await res.json()
  return (json?.data || []) as Array<{ id: string }>
}

export async function anthropicListModels(apiKey: string) {
  // Anthropic는 별도 base url을 쓸 수 있지만, 우선 공식 엔드포인트를 사용
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  })
  if (!res.ok) throw new Error(`ANTHROPIC_LIST_FAILED_${res.status}`)
  const json = await res.json()
  return (json?.data || []) as Array<{ id: string }>
}

export async function googleSimulateChat(args: {
  apiBaseUrl: string
  apiKey: string
  model: string
  input: string
  maxTokens: number
  templateBody?: Record<string, unknown> | null
}) {
  const normalized = normalizeGoogleBaseUrl(args.apiBaseUrl)
  const base = normalized || "https://generativelanguage.googleapis.com/v1beta"
  const apiRoot = base.replace(/\/$/, "")

  const url = `${apiRoot}/models/${encodeURIComponent(args.model)}:generateContent`

  const baseBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: args.input }],
      },
    ],
    generationConfig: {
      maxOutputTokens: args.maxTokens,
    },
  }
  const body = args.templateBody && typeof args.templateBody === "object" ? deepMerge(args.templateBody, baseBody) : baseBody

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Gemini API: either query param key=... or this header
      "x-goog-api-key": args.apiKey,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`GOOGLE_SIMULATE_FAILED_${res.status}@${apiRoot}:${JSON.stringify(json)}`)
  }

  // candidates[0].content.parts[].text
  const parts = json?.candidates?.[0]?.content?.parts
  const text =
    Array.isArray(parts) && parts.length
      ? parts
          .map((p: unknown) =>
            p && typeof p === "object" && typeof (p as Record<string, unknown>).text === "string" ? String((p as Record<string, unknown>).text) : ""
          )
          .filter(Boolean)
          .join("")
      : ""

  return { raw: json, output_text: text }
}

export async function openaiSimulateChat(args: {
  apiBaseUrl: string
  apiKey: string
  model: string
  input: string
  maxTokens: number
  outputFormat?: "block_json"
  templateBody?: Record<string, unknown> | null
  responseSchema?: OpenAiJsonSchema | null
}) {
  const normalized = normalizeOpenAiBaseUrl(args.apiBaseUrl)
  const base = normalized || "https://api.openai.com/v1"
  const apiRoot = base.replace(/\/$/, "")

  // OpenAI 모델별로 파라미터/엔드포인트 호환성이 달라질 수 있어 방어적으로 처리합니다.
  // - 일부 최신 모델(GPT-5 계열)은 chat/completions에서 max_tokens를 거부하고 max_completion_tokens를 요구합니다.
  // - 일부 모델은 chat 모델이 아니어서 /v1/chat/completions 자체를 거부할 수 있습니다 → /v1/responses로 fallback.

  async function postJson(url: string, body: unknown) {
    async function doPost(payload: unknown) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      return { res, json }
    }

    const first = await doPost(body)
    if (first.res.ok) return first

    // Defensive retry: some environments reject optional params like `reasoning`.
    // If we see "Unknown parameter: 'reasoning'", drop it once and retry.
    if (first.res.status === 400 && body && typeof body === "object") {
      const root = first.json && typeof first.json === "object" ? (first.json as Record<string, unknown>) : null
      const err = root?.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : null
      const msg = typeof err?.message === "string" ? err.message : ""
      const param = typeof err?.param === "string" ? err.param : ""
      const isUnknownReasoning = /unknown parameter/i.test(msg) && (param === "reasoning" || /'reasoning'/.test(msg))
      if (isUnknownReasoning) {
        const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) }
        delete copy.reasoning
        return await doPost(copy)
      }
    }

    return first
  }

  function isMiniModel(model: string) {
    return /mini/i.test(String(model || "").trim())
  }

  function reasoningEffortForModel(model: string): "minimal" | "low" {
    // gpt-5-mini tends to burn completion tokens on reasoning; keep it as low as possible.
    return isMiniModel(model) ? "minimal" : "low"
  }

  function fallbackBlockJsonForEmptyOutput() {
    return {
      title: "응답 생성 실패",
      summary: "모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.",
      blocks: [
        {
          type: "markdown",
          markdown:
            "## 생성 실패\n모델 응답이 비어 있어 내용을 생성하지 못했습니다.\n\n- 질문을 조금 더 구체화하거나\n- 다시 시도(재생성)하거나\n- 다른 모델로 전환해 보세요.",
        },
      ],
    }
  }

  function extractTextFromChatCompletions(json: unknown) {
    const root = json && typeof json === "object" ? (json as Record<string, unknown>) : null
    const choices = Array.isArray(root?.choices) ? (root?.choices as unknown[]) : []
    const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : null
    const msg = first?.message && typeof first.message === "object" ? (first.message as Record<string, unknown>) : null
    const content = msg?.content
    if (typeof content === "string" && content) return content
    // Some SDKs/models return content as array parts: [{type:"text", text:"..."}]
    if (Array.isArray(content)) {
      const joined = content
        .map((p: unknown) => {
          if (!p || typeof p !== "object") return ""
          const po = p as Record<string, unknown>
          if (typeof po.text === "string") return po.text
          if (po.text && typeof po.text === "object") {
            const t = po.text as Record<string, unknown>
            if (typeof t.value === "string") return t.value
          }
          return ""
        })
        .filter(Boolean)
        .join("")
      if (joined.trim()) return joined
    }
    // Some structured-output style responses may put the JSON into tool_calls arguments.
    const toolCalls = Array.isArray(msg?.tool_calls) ? (msg?.tool_calls as unknown[]) : []
    for (const tc of toolCalls) {
      const tco = tc && typeof tc === "object" ? (tc as Record<string, unknown>) : null
      const fn = tco?.function && typeof tco.function === "object" ? (tco.function as Record<string, unknown>) : null
      const args = fn?.arguments
      if (typeof args === "string" && args.trim()) return args
    }
    return typeof content === "string" ? content : ""
  }

  function extractTextFromResponses(json: unknown) {
    // responses API는 포맷이 환경/버전에 따라 달라질 수 있어 여러 케이스를 흡수합니다.
    const root = json && typeof json === "object" ? (json as Record<string, unknown>) : null
    if (typeof root?.output_text === "string" && root.output_text.trim()) return root.output_text
    const output = Array.isArray(root?.output) ? (root.output as unknown[]) : []
    for (const item of output) {
      const itemObj = item && typeof item === "object" ? (item as Record<string, unknown>) : null
      const content = Array.isArray(itemObj?.content) ? (itemObj.content as unknown[]) : []
      for (const c of content) {
        const cObj = c && typeof c === "object" ? (c as Record<string, unknown>) : null
        // Plain text
        if (typeof cObj?.text === "string" && cObj.text.trim()) return cObj.text
        if (typeof cObj?.output_text === "string" && cObj.output_text.trim()) return cObj.output_text
        if (typeof cObj?.value === "string" && cObj.value.trim()) return cObj.value
        // Sometimes `text` is an object (e.g. { value: "..." })
        if (cObj?.text && typeof cObj.text === "object") {
          const t = cObj.text as Record<string, unknown>
          if (typeof t.value === "string" && t.value.trim()) return t.value
        }
        // JSON-schema / structured output can come back as a JSON object on the content item
        if (cObj?.json && typeof cObj.json === "object") return JSON.stringify(cObj.json)
        if (cObj?.parsed && typeof cObj.parsed === "object") return JSON.stringify(cObj.parsed)
        // Some variants may nest payload under `content`
        if (cObj?.content && typeof cObj.content === "object") {
          const inner = cObj.content as Record<string, unknown>
          if (typeof inner.text === "string" && inner.text.trim()) return inner.text
          if (inner.json && typeof inner.json === "object") return JSON.stringify(inner.json)
          if (inner.parsed && typeof inner.parsed === "object") return JSON.stringify(inner.parsed)
        }
        // Tool-call style items
        if (typeof cObj?.arguments === "string" && cObj.arguments.trim()) return cObj.arguments
      }
    }
    return ""
  }

  function extractTemplateMessages(templateBody: Record<string, unknown> | null | undefined): Array<{ role: string; content: string }> {
    if (!templateBody || typeof templateBody !== "object") return []
    const msgs = (templateBody as Record<string, unknown>).messages
    if (!Array.isArray(msgs)) return []
    const out: Array<{ role: string; content: string }> = []
    for (const m of msgs) {
      const mo = m && typeof m === "object" ? (m as Record<string, unknown>) : null
      const role = typeof mo?.role === "string" ? String(mo.role) : ""
      const content = typeof mo?.content === "string" ? String(mo.content) : ""
      if (!role || !content) continue
      out.push({ role, content })
    }
    return out
  }

  function sanitizeTemplateForResponses(templateBody: Record<string, unknown> | null | undefined) {
    if (!templateBody || typeof templateBody !== "object") return null
    const out: Record<string, unknown> = { ...(templateBody as Record<string, unknown>) }
    // `responses` API does not accept chat-style `messages`. We still use it to derive `instructions`.
    delete out.messages
    return out
  }

  function buildInstructionsFromTemplate(templateBody: Record<string, unknown> | null | undefined): string {
    const msgs = extractTemplateMessages(templateBody)
    if (!msgs.length) return ""
    const sys = msgs.filter((m) => m.role === "system").map((m) => m.content).join("\n\n").trim()
    const dev = msgs.filter((m) => m.role === "developer").map((m) => m.content).join("\n\n").trim()
    // Responses API best practice: put policy/format guidance into `instructions`
    const parts = [sys, dev].filter(Boolean)
    return parts.join("\n\n").trim()
  }

  function responsesBody() {
    const schema = args.responseSchema || (args.outputFormat === "block_json" ? openAiBlockJsonSchema() : null)
    const templateInstructions = buildInstructionsFromTemplate(args.templateBody || null)
    const sanitizedTemplate = sanitizeTemplateForResponses(args.templateBody || null)
    const baseBody = {
      model: args.model,
      input: args.input,
      // responses API에서는 max_output_tokens 사용
      max_output_tokens: args.maxTokens,
      // GPT-5 계열은 reasoning 토큰을 과도하게 소모할 수 있어 기본 effort를 낮춥니다.
      reasoning: { effort: reasoningEffortForModel(args.model) },
      ...(templateInstructions ? { instructions: templateInstructions } : {}),
      // 서버 레벨 JSON 강제 (가능한 경우)
      ...(schema
        ? {
            // 기본: json_schema (가능한 모델/계정에서 가장 강력한 강제)
            response_format: {
              type: "json_schema",
              json_schema: {
                name: schema.name,
                schema: schema.schema,
                strict: schema.strict !== false,
              },
            },
          }
        : {
            // 텍스트 출력 우선
            text: { verbosity: "low" },
          }),
    }
    // templateBody(JSONB)를 base body에 merge (runtime/base wins)
    return sanitizedTemplate && typeof sanitizedTemplate === "object" ? deepMerge(sanitizedTemplate, baseBody) : baseBody
  }

  function responsesBodyJsonObject() {
    // json_schema가 미지원일 때의 차선책: JSON object만 강제 (형식/필드 규칙은 프롬프트로)
    const templateInstructions = buildInstructionsFromTemplate(args.templateBody || null)
    const sanitizedTemplate = sanitizeTemplateForResponses(args.templateBody || null)
    return {
      ...(sanitizedTemplate || {}),
      model: args.model,
      input: args.input,
      max_output_tokens: args.maxTokens,
      reasoning: { effort: reasoningEffortForModel(args.model) },
      ...(templateInstructions ? { instructions: templateInstructions } : {}),
      response_format: { type: "json_object" },
      text: { verbosity: "low" },
    }
  }

  function responsesBodyPlain() {
    // 최후의 차선책: 포맷 파라미터 없이 responses를 호출 (프롬프트로 JSON-only 유도)
    const templateInstructions = buildInstructionsFromTemplate(args.templateBody || null)
    const sanitizedTemplate = sanitizeTemplateForResponses(args.templateBody || null)
    return {
      ...(sanitizedTemplate || {}),
      model: args.model,
      input: args.input,
      max_output_tokens: args.maxTokens,
      reasoning: { effort: reasoningEffortForModel(args.model) },
      ...(templateInstructions ? { instructions: templateInstructions } : {}),
      text: { verbosity: "low" },
    }
  }

  async function tryResponsesWithNonEmptyText(bodies: Array<unknown>) {
    for (const body of bodies) {
      const r = await postJson(`${apiRoot}/responses`, body)
      if (!r.res.ok) continue
      const text = extractTextFromResponses(r.json)
      const truncated = r.json?.incomplete_details?.reason === "max_output_tokens"

      // 토큰 제한으로 잘린 경우: 1회 더 큰 토큰으로 재시도해서 "완성본"을 우선 반환
      if (truncated) {
        const bigger = Math.min(Math.max(args.maxTokens, 2048), 4096)
        const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
        const retry = await postJson(`${apiRoot}/responses`, { ...bodyObj, max_output_tokens: bigger })
        if (retry.res.ok) {
          const t2 = extractTextFromResponses(retry.json)
          if (t2 && t2.length >= (text || "").length) {
            return { ok: true as const, raw: retry.json, output_text: t2 }
          }
        }
      }

      if (text) return { ok: true as const, raw: r.json, output_text: text }
    }
    return { ok: false as const }
  }

  // outputFormat이 있는 경우: 서버 레벨 강제를 위해 responses API를 우선 사용합니다.
  if (args.outputFormat === "block_json") {
    const tried = await tryResponsesWithNonEmptyText([responsesBody(), responsesBodyJsonObject(), responsesBodyPlain()])
    if (tried.ok) return { raw: tried.raw, output_text: tried.output_text }
    // responses가 미지원/차단이면 chat/completions로 fallback (프롬프트 기반 + json_object)
  }

  // GPT-5 계열은 환경에 따라 chat/completions에서 content가 비어있는 경우가 있어
  // responses API를 우선 사용합니다. (실패 시 chat/completions로 fallback)
  const preferResponses = /^gpt-5/i.test((args.model || "").trim())

  if (preferResponses) {
    const tried = await tryResponsesWithNonEmptyText([responsesBody(), responsesBodyJsonObject(), responsesBodyPlain()])
    if (tried.ok) return { raw: tried.raw, output_text: tried.output_text }
    // responses가 막혀있거나 미지원이면 chat/completions로 fallback
  }

  // 1) 우선 chat/completions 시도 (max_completion_tokens 우선)
  {
    const schema = args.outputFormat === "block_json" ? openAiBlockJsonSchema() : null
    const templateMsgs = extractTemplateMessages(args.templateBody || null)
    const hasTemplateSystemOrDev = templateMsgs.some((m) => m.role === "system" || m.role === "developer")
    const chatMessages =
      hasTemplateSystemOrDev
        ? [
            ...templateMsgs.filter((m) => m.role === "system" || m.role === "developer"),
            { role: "user", content: args.input },
          ]
        : [{ role: "user", content: args.input }]

    const maxCompletionTokens =
      // If the caller requests structured output and we're forced into chat/completions,
      // give the model enough room to both reason and emit visible output.
      args.outputFormat === "block_json" ? Math.min(Math.max(args.maxTokens, 2048), 4096) : args.maxTokens

    const { res, json } = await postJson(`${apiRoot}/chat/completions`, {
      model: args.model,
      messages: chatMessages,
      // 최신 모델은 max_tokens 대신 max_completion_tokens를 요구할 수 있음
      max_completion_tokens: maxCompletionTokens,
      ...(schema
        ? {
            response_format: {
              // chat/completions 호환성: json_schema가 미지원인 경우가 있어 json_object를 사용합니다.
              // 스키마 강제는 responses에서 수행하고, 여기서는 "유효한 JSON" 강제 용도로 사용합니다.
              type: "json_object",
            },
          }
        : {}),
    })

    if (res.ok) {
      const text = extractTextFromChatCompletions(json)
      // 일부 모델은 chat/completions에서 content가 비어있을 수 있어 responses로 1회 fallback
      if (!text) {
        const tried = await tryResponsesWithNonEmptyText([responsesBody(), responsesBodyJsonObject(), responsesBodyPlain()])
        if (tried.ok) return { raw: tried.raw, output_text: tried.output_text }
      }
      if (text && text.trim()) return { raw: json, output_text: text }
      // Last resort: don't store empty output_text if we got a payload.
      // Prefer a renderable block-json so the UI doesn't show blank.
      console.warn("[openaiSimulateChat] empty extracted text; returning fallback block_json", { model: args.model, endpoint: "chat/completions" })
      const fallback = fallbackBlockJsonForEmptyOutput()
      return { raw: json, output_text: JSON.stringify(fallback) }
    }

    const errMsg = JSON.stringify(json || {})
    const isUnsupportedResponseFormat =
      res.status === 400 && /(response_format|json_schema|Invalid schema|unsupported)/i.test(errMsg)
    const isNotChatModel =
      res.status === 404 &&
      /not a chat model|not supported in the v1\/chat\/completions/i.test(errMsg)
    const isUnsupportedMaxCompletion =
      res.status === 400 && /max_completion_tokens/i.test(errMsg) && /unsupported|unknown/i.test(errMsg)

    // (구형 모델 대비) max_completion_tokens가 거부되면 max_tokens로 1회 재시도
    if (isUnsupportedMaxCompletion) {
      const retry = await postJson(`${apiRoot}/chat/completions`, {
        model: args.model,
        messages: [{ role: "user", content: args.input }],
        max_tokens: args.maxTokens,
        ...(schema ? { response_format: { type: "json_object" } } : {}),
      })
      if (retry.res.ok) {
        const t = extractTextFromChatCompletions(retry.json)
        return { raw: retry.json, output_text: t && t.trim() ? t : JSON.stringify(retry.json ?? {}) }
      }
      throw new Error(`OPENAI_SIMULATE_FAILED_${retry.res.status}@${apiRoot}:${JSON.stringify(retry.json)}`)
    }

    // chat 모델이 아니라면 responses API로 fallback
    if (isNotChatModel) {
      const r2 = await postJson(`${apiRoot}/responses`, responsesBody())
      if (!r2.res.ok) throw new Error(`OPENAI_SIMULATE_FAILED_${r2.res.status}@${apiRoot}:${JSON.stringify(r2.json)}`)
      const t = extractTextFromResponses(r2.json)
      return { raw: r2.json, output_text: t && t.trim() ? t : JSON.stringify(r2.json ?? {}) }
    }

    // response_format 자체가 모델/계정에서 미지원이면: response_format 제거하고 재시도(프롬프트 기반 fallback)
    if (schema && isUnsupportedResponseFormat) {
      const retry = await postJson(`${apiRoot}/chat/completions`, {
        model: args.model,
        messages: [{ role: "user", content: args.input }],
        max_completion_tokens: args.maxTokens,
      })
      if (retry.res.ok) {
        const t = extractTextFromChatCompletions(retry.json)
        return { raw: retry.json, output_text: t && t.trim() ? t : JSON.stringify(retry.json ?? {}) }
      }
      throw new Error(`OPENAI_SIMULATE_FAILED_${retry.res.status}@${apiRoot}:${JSON.stringify(retry.json)}`)
    }

    // max_tokens 거부(특히 GPT-5) 등은 responses로 재시도하는 편이 안전합니다.
    const isUnsupportedMaxTokens =
      res.status === 400 && /max_tokens/i.test(errMsg) && /Use 'max_completion_tokens' instead/i.test(errMsg)

    if (isUnsupportedMaxTokens) {
      // 동일 엔드포인트 재시도: max_completion_tokens만으로 다시 호출
      const retry = await postJson(`${apiRoot}/chat/completions`, {
        model: args.model,
        messages: [{ role: "user", content: args.input }],
        max_completion_tokens: args.maxTokens,
      })
      if (retry.res.ok) {
        const t = extractTextFromChatCompletions(retry.json)
        return { raw: retry.json, output_text: t && t.trim() ? t : JSON.stringify(retry.json ?? {}) }
      }

      // 그래도 실패하면 responses로 fallback
      const r2 = await postJson(`${apiRoot}/responses`, responsesBody())
      if (!r2.res.ok) throw new Error(`OPENAI_SIMULATE_FAILED_${r2.res.status}@${apiRoot}:${JSON.stringify(r2.json)}`)
      const t = extractTextFromResponses(r2.json)
      return { raw: r2.json, output_text: t && t.trim() ? t : JSON.stringify(r2.json ?? {}) }
    }

    throw new Error(`OPENAI_SIMULATE_FAILED_${res.status}@${apiRoot}:${JSON.stringify(json)}`)
  }
}

export async function anthropicSimulateChat(args: {
  apiBaseUrl?: string
  apiKey: string
  model: string
  input: string
  maxTokens: number
  templateBody?: Record<string, unknown> | null
}) {
  const base = (args.apiBaseUrl || "https://api.anthropic.com/v1").replace(/\/+$/g, "")
  const baseBody = {
    model: args.model,
    max_tokens: args.maxTokens,
    messages: [{ role: "user", content: args.input }],
  }
  const body = args.templateBody && typeof args.templateBody === "object" ? deepMerge(args.templateBody, baseBody) : baseBody

  const res = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`ANTHROPIC_SIMULATE_FAILED_${res.status}@${base}:${JSON.stringify(json)}`)
  }
  const text = json?.content?.[0]?.text ?? ""
  return { raw: json, output_text: text }
}


