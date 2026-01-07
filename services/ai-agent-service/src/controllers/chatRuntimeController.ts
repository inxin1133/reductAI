import { Request, Response } from "express"
import { query } from "../config/db"
import { AuthedRequest } from "../middleware/requireAuth"
import { ensureSystemTenantId } from "../services/systemTenantService"
import crypto from "crypto"
import {
  getProviderBase,
  openaiGenerateImage,
  openaiSimulateChat,
  openaiTextToSpeech,
  anthropicSimulateChat,
  googleSimulateChat,
} from "../services/providerClients"
import { resolveAuthForModelApiProfile } from "../services/authProfilesService"
import { newAssetId, storeImageDataUrlAsAsset } from "../services/mediaAssetsService"

type ModelType = "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"

const MODEL_TYPES: ModelType[] = ["text", "image", "audio", "music", "video", "multimodal", "embedding", "code"]

type AudioFormat = "mp3" | "wav" | "opus" | "aac" | "flac"

function isAudioFormat(v: unknown): v is AudioFormat {
  return v === "mp3" || v === "wav" || v === "opus" || v === "aac" || v === "flac"
}

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function extractTextFromJsonContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!content || typeof content !== "object") return ""
  const c = content as Record<string, unknown>
  if (typeof c.text === "string") return c.text
  if (typeof c.output_text === "string") return c.output_text
  if (typeof c.input === "string") return c.input
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

function deepInjectVars(input: unknown, vars: Record<string, string>): unknown {
  if (typeof input === "string") {
    // If the entire string is exactly one placeholder, allow scalar coercion
    // so JSON templates can safely carry numbers/booleans (e.g., temperature/maxTokens).
    const exact = input.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/)
    if (exact) {
      const k = exact[1]
      const raw = k in vars ? vars[k] : ""
      const s = String(raw)
      if (s === "true") return true
      if (s === "false") return false
      if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s)
      return s
    }
    return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => (k in vars ? vars[k] : ""))
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
  configVars: Record<string, string>
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

  const vars: Record<string, string> = {
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
    vars: Record<string, string>
    overrideMethod?: string
    overridePath?: string
    overrideQuery?: Record<string, unknown>
    mode: "json" | "binary"
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
    const blockJson = { title, summary: "생성이 완료되었습니다.", blocks: [{ type: "markdown", markdown: `${title}이(가) 생성되었습니다.` }] }

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
    const blockJson = { title, summary: "생성이 완료되었습니다.", blocks: [{ type: "markdown", markdown: `${title}이(가) 생성되었습니다.` }] }
    const key = args.purpose === "video" ? "video" : "audio"
    return { output_text: JSON.stringify(blockJson), raw: initial.json, content: { ...blockJson, [key]: { mime, data_url: dataUrl }, raw: initial.json } }
  }

  const json = initial.json

  if (resultType === "text") {
    const textPath = pickString(extract, "text_path")
    const textVal = textPath ? getByPath(json, textPath) : undefined
    const output_text = typeof textVal === "string" ? textVal : JSON.stringify(textVal ?? json)
    return { output_text, raw: json, content: { output_text, raw: json } }
  }

  if (resultType === "image_urls") {
    const urlsPath = pickString(extract, "urls_path")
    const val = urlsPath ? getByPath(json, urlsPath) : []
    const urls = Array.isArray(val) ? val.map((v) => (typeof v === "string" ? v : "")).filter(Boolean) : []
    const blocks = urls.length
      ? urls.map((u) => ({ type: "markdown", markdown: `![image](${u})` }))
      : [{ type: "markdown", markdown: "이미지 생성 결과를 받지 못했습니다." }]
    const blockJson = { title: "이미지 생성", summary: "요청한 이미지 생성 결과입니다.", blocks }
    return { output_text: JSON.stringify(blockJson), raw: json, content: { ...blockJson, images: urls.map((u) => ({ url: u })), raw: json } }
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

async function createConversation(args: { tenantId: string; userId: string; modelDbId: string; firstMessage: string }) {
  const title = (String(args.firstMessage || "").split("\n")[0] || "새 대화").trim().slice(0, 15) || "새 대화"
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
    INSERT INTO model_messages (id, conversation_id, role, content, content_text, summary, message_order, metadata)
    VALUES (COALESCE($1::uuid, uuid_generate_v4()), $2,$3,$4::jsonb,$5,$6,$7,$8::jsonb)
    RETURNING id, message_order
    `,
    [
      msgId,
      args.conversationId,
      args.role,
      JSON.stringify(args.content),
      args.contentText || null,
      args.summary,
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
  try {
    const userId = (req as AuthedRequest).userId
    const tenantId = await ensureSystemTenantId()

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
    } = req.body || {}

    const prompt = String(userPrompt || "").trim()
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

    // conversation ownership / creation
    let convId = conversation_id ? String(conversation_id) : ""
    if (convId) {
      const ok = await ensureConversationOwned({ tenantId, userId, conversationId: convId })
      if (!ok) return res.status(404).json({ message: "Conversation not found" })
    } else {
      convId = await createConversation({ tenantId, userId, modelDbId: chosenModelDbId, firstMessage: prompt })
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

    // 4) 변수 주입
    const injectedTemplate = templateBody
      ? (deepInjectVars(templateBody, {
          userPrompt: prompt,
          language: finalLang,
          shortHistory: history.shortText,
          longSummary: history.conversationSummary || history.longText,
        }) as Record<string, unknown>)
      : null

    // 5) 안전 조정 (min/max)
    const modelMaxOut = row.max_output_tokens ? Number(row.max_output_tokens) : null
    const safeMaxTokens = modelMaxOut ? clampInt(maxTokensRequested, 16, Math.max(16, modelMaxOut)) : maxTokensRequested

    // 7) 최종 request body 생성 + provider call
    const providerId = String(row.provider_id)
    const base = await getProviderBase(providerId)

    const providerKey = String(row.provider_family || row.provider_slug || "").trim().toLowerCase()
    const modelApiId = String(row.model_api_id || "")
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

    let out: { output_text: string; raw: unknown; content: Record<string, unknown> } | null = null

    // ✅ DB-driven execution: if a model_api_profile exists for this provider/purpose, try it first.
    // Safe rollout: if profile is missing or fails, we fall back to the existing provider_family-specific code.
    const purpose: ModelApiPurpose = (mt === "text" ? "chat" : mt) as ModelApiPurpose
    let usedProfileKey: string | null = null
    try {
      const profile = await loadModelApiProfile({ tenantId, providerId, modelDbId: chosenModelDbId, purpose })
      if (profile) {
        usedProfileKey = profile.profile_key
        const auth = await resolveAuthForModelApiProfile({ providerId, authProfileId: profile.auth_profile_id })
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
          options: options || {},
          injectedTemplate,
          profile,
          configVars: auth.configVars,
        })
      }
    } catch (e) {
      console.warn("[model_api_profiles] execution failed -> fallback:", usedProfileKey, e)
      out = null
    }

    if (out == null) {
      const auth = await resolveAuthForModelApiProfile({ providerId, authProfileId: null })
      // Fallback: 기존 provider별 하드코딩 실행기
      if (mt === "text") {
        if (providerKey === "openai") {
        const r = await openaiSimulateChat({
          apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
          apiKey: auth.apiKey,
          model: modelApiId,
          input,
          maxTokens: safeMaxTokens,
          templateBody: injectedTemplate || undefined,
          responseSchema,
        })
        out = { ...r, content: { output_text: r.output_text, raw: r.raw } }
        } else if (providerKey === "anthropic") {
        const r = await anthropicSimulateChat({
          apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
          apiKey: auth.apiKey,
          model: modelApiId,
          input,
          maxTokens: safeMaxTokens,
          templateBody: injectedTemplate || undefined,
        })
        out = { ...r, content: { output_text: r.output_text, raw: r.raw } }
        } else if (providerKey === "google") {
        const r = await googleSimulateChat({
          apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
          apiKey: auth.apiKey,
          model: modelApiId,
          input,
          maxTokens: safeMaxTokens,
          templateBody: injectedTemplate || undefined,
        })
        out = { ...r, content: { output_text: r.output_text, raw: r.raw } }
        } else {
        return res.status(400).json({ message: `Unsupported provider_family/provider_slug: ${providerKey}` })
        }
      } else if (mt === "image") {
      if (providerKey !== "openai") {
        return res.status(400).json({ message: `Image is not supported for provider=${providerKey} yet.` })
      }
      const n = typeof options?.n === "number" ? clampInt(options.n, 1, 10) : 1
      const size = typeof options?.size === "string" ? options.size : undefined
      const quality = typeof options?.quality === "string" ? options.quality : undefined
      const style = typeof options?.style === "string" ? options.style : undefined
      const background = typeof options?.background === "string" ? options.background : undefined
      const r = await openaiGenerateImage({
        apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
        apiKey: auth.apiKey,
        model: modelApiId,
        prompt,
        n,
        size,
        quality,
        style,
        background,
      })
      // Prefer real URLs; if API returns base64 only, fall back to data URLs.
      const sourceUrls: string[] = (r.urls && r.urls.length ? r.urls : r.data_urls) || []
      const blocks = sourceUrls.length
        ? sourceUrls.map((u) => ({ type: "markdown", markdown: `![image](${u})` }))
        : [{ type: "markdown", markdown: "이미지 생성 결과를 받지 못했습니다." }]
      const blockJson = { title: "이미지 생성", summary: "요청한 이미지 생성 결과입니다.", blocks }
      out = {
        output_text: JSON.stringify(blockJson),
        raw: { provider: "openai", kind: "image", model: modelApiId, count: sourceUrls.length },
        content: { ...blockJson, images: sourceUrls.map((u) => ({ url: u })), raw: { provider: "openai", kind: "image", model: modelApiId, count: sourceUrls.length } },
      }
      } else if (mt === "audio" || mt === "music") {
      if (providerKey !== "openai") {
        return res.status(400).json({ message: `${mt} is not supported for provider=${providerKey} yet.` })
      }
      const voice = typeof options?.voice === "string" ? options.voice : undefined
      const formatRaw = typeof options?.format === "string" ? options.format.trim().toLowerCase() : ""
      const format: AudioFormat = isAudioFormat(formatRaw) ? formatRaw : "mp3"
      const speed = typeof options?.speed === "number" ? options.speed : undefined
      const r = await openaiTextToSpeech({
        apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
        apiKey: auth.apiKey,
        model: modelApiId,
        input: prompt,
        voice,
        format,
        speed,
      })
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
      return res.status(400).json({
        message: "Video is not implemented yet.",
        details:
          "현재 프로젝트에는 video 생성용 provider client(예: Runway/Pika/Sora)가 아직 없습니다. 어떤 provider_family/endpoint를 사용할지 알려주시면 연동을 구현할 수 있습니다.",
      })
      } else {
      return res.status(400).json({ message: `Unsupported model_type=${mt}` })
      }
    }

    // persist messages (user + assistant)
    await appendMessage({
      conversationId: convId,
      role: "user",
      content: { text: prompt, options: options || {} },
      contentText: prompt,
      summary: null,
      modelApiId,
      providerSlug: String(row.provider_slug || ""),
      providerKey: providerKey,
      providerLogoKey,
    })

    // Assetize media fields (image/audio/video data URLs) before persisting assistant message.
    const assistantMessageId = crypto.randomUUID()
    const rewritten = rewriteContentWithAssetUrls(out.content)

    // Use a safe, compact content_text for history/context (avoid huge JSON / base64).
    const title = typeof rewritten.content.title === "string" ? rewritten.content.title : ""
    const summary = typeof rewritten.content.summary === "string" ? rewritten.content.summary : ""
    const imgCount = Array.isArray(rewritten.content.images) ? (rewritten.content.images as unknown[]).length : 0
    const hasAudio = isRecord(rewritten.content.audio)
    const hasVideo = isRecord(rewritten.content.video)
    const contentTextForHistory =
      title || summary
        ? `${title || ""}${title && summary ? " - " : ""}${summary || ""}`.slice(0, 4000)
        : imgCount
          ? `이미지 생성 (${imgCount}장)`
          : hasAudio
            ? "오디오 생성"
            : hasVideo
              ? "비디오 생성"
              : String(out.output_text || "").slice(0, 4000)

    await appendMessage({
      id: assistantMessageId,
      conversationId: convId,
      role: "assistant",
      content: rewritten.content,
      contentText: contentTextForHistory,
      summary: null,
      modelApiId,
      providerSlug: String(row.provider_slug || ""),
      providerKey: providerKey,
      providerLogoKey,
    })

    // Persist assets (FK requires message row exists).
    for (const a of rewritten.assets) {
      await storeImageDataUrlAsAsset({
        tenantId,
        userId: userId || null,
        conversationId: convId,
        messageId: assistantMessageId,
        assetId: a.assetId,
        dataUrl: a.dataUrl,
        index: a.index,
        kind: a.kind,
      })
    }

    // Return rewritten (assetized) content to the client as output_text too,
    // so the frontend never receives base64 blobs in output_text.
    out.output_text = JSON.stringify(rewritten.content)

    // best-effort: keep conversation model_id updated to last used model
    await query(`UPDATE model_conversations SET model_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [convId, chosenModelDbId])

    return res.json({
      ok: true,
      conversation_id: convId,
      language: finalLang,
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
    })
  } catch (e: unknown) {
    console.error("chatRun error:", e)
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ message: "Failed to run chat", details: msg })
  }
}


