type JsonRecord = Record<string, unknown>

type BlockShape = {
  type?: string
  markdown?: string
  code?: string
  content?: string
  language?: string
  headers?: unknown[]
  rows?: unknown[]
  data?: unknown[]
}

function isRecord(v: unknown): v is JsonRecord {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function parseJsonLikeString(input: string): JsonRecord | null {
  let raw = String(input || "").trim()
  if (!raw) return null
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
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeTableBlock(block: BlockShape): JsonRecord {
  const { headers, rows, data, ...rest } = block as JsonRecord
  const dataObj = isRecord(data) ? (data as JsonRecord) : null
  const normalizedHeaders = Array.isArray(headers)
    ? headers.map(String)
    : Array.isArray(dataObj?.headers)
      ? (dataObj?.headers as unknown[]).map(String)
      : []
  const normalizedRows = Array.isArray(rows) ? rows : Array.isArray(dataObj?.rows) ? (dataObj?.rows as unknown[]) : []
  const normalizedData = Array.isArray(data) ? data : Array.isArray(dataObj) ? (dataObj as unknown[]) : []

  if (!normalizedHeaders.length && normalizedRows.length === 0 && normalizedData.length > 0) {
    const firstRow = Array.isArray(normalizedData[0]) ? (normalizedData[0] as unknown[]).map(String) : []
    const bodyRows = normalizedData.slice(1).map((r) => (Array.isArray(r) ? r.map(String) : []))
    return { ...rest, type: "table", headers: firstRow, rows: bodyRows }
  }

  if (!normalizedHeaders.length && normalizedData.length > 0 && normalizedRows.length === 0) {
    return {
      ...rest,
      type: "table",
      headers: [],
      rows: normalizedData.map((r) => (Array.isArray(r) ? r.map(String) : [])),
    }
  }

  if (normalizedHeaders.length && normalizedRows.length === 0 && normalizedData.length > 0) {
    return {
      ...rest,
      type: "table",
      headers: normalizedHeaders,
      rows: normalizedData.map((r) => (Array.isArray(r) ? r.map(String) : [])),
    }
  }

  return {
    ...rest,
    type: "table",
    headers: normalizedHeaders,
    rows: normalizedRows.map((r) => (Array.isArray(r) ? r.map(String) : [])),
  }
}

function normalizeBlocks(blocks: unknown[]): JsonRecord[] {
  return blocks.map((raw) => {
    const b = isRecord(raw) ? (raw as BlockShape) : {}
    const t = String(b.type || "").toLowerCase()
    const dataObj = b.data && isRecord(b.data) ? (b.data as JsonRecord) : null
    if (t === "markdown") {
      const md =
        typeof b.markdown === "string"
          ? b.markdown
          : typeof b.content === "string"
            ? b.content
            : typeof dataObj?.content === "string"
              ? dataObj.content
              : typeof dataObj?.markdown === "string"
                ? dataObj.markdown
                : ""
      const rest = { ...(b as JsonRecord) }
      delete rest.content
      delete rest.markdown
      return md ? { ...rest, type: "markdown", markdown: md } : { ...rest, type: "markdown" }
    }
    if (t === "code") {
      const code =
        typeof b.code === "string"
          ? b.code
          : typeof b.content === "string"
            ? b.content
            : typeof dataObj?.content === "string"
              ? dataObj.content
              : typeof dataObj?.code === "string"
                ? dataObj.code
                : ""
      const rest = { ...(b as JsonRecord) }
      delete rest.content
      delete rest.code
      return code
        ? {
            ...rest,
            type: "code",
            language: typeof b.language === "string" ? b.language : typeof dataObj?.language === "string" ? dataObj.language : "plain",
            code,
          }
        : {
            ...rest,
            type: "code",
            language: typeof b.language === "string" ? b.language : typeof dataObj?.language === "string" ? dataObj.language : "plain",
          }
    }
    if (t === "table") return normalizeTableBlock(b)
    return isRecord(raw) ? (raw as JsonRecord) : { type: "text", text: String(raw ?? "") }
  })
}

function coerceFromOutputText(content: JsonRecord): JsonRecord | null {
  const raw = content.output_text
  if (typeof raw !== "string" || !raw.trim()) return null
  const parsed = parseJsonLikeString(raw)
  if (!parsed) return null
  return normalizeAiContent(parsed)
}

function buildMarkdownFromSteps(steps: unknown[]): string {
  const normalized = steps
    .map((s, i) => {
      if (typeof s === "string") return `${i + 1}. ${s}`
      if (!s || typeof s !== "object") return ""
      const obj = s as JsonRecord
      const label = typeof obj.step === "string" ? obj.step : `Step ${i + 1}`
      const content = typeof obj.content === "string" ? obj.content : typeof obj.description === "string" ? obj.description : ""
      const details = typeof obj.details === "string" ? obj.details : ""
      const formula = typeof obj.formula === "string" ? obj.formula : ""
      const parts = [content, details, formula ? `수식: ${formula}` : ""].filter(Boolean).join(" ")
      return parts ? `${i + 1}. ${label} - ${parts}` : `${i + 1}. ${label}`
    })
    .filter(Boolean)
  if (!normalized.length) return ""
  return `## 풀이 절차\n${normalized.join("\n")}`
}

function coerceTableFromObject(obj: JsonRecord | null): JsonRecord | null {
  if (!obj) return null
  const headers = Array.isArray(obj.headers)
    ? (obj.headers as unknown[]).map(String)
    : Array.isArray(obj.columns)
      ? (obj.columns as unknown[]).map(String)
      : []
  const rowsRaw = Array.isArray(obj.rows) ? (obj.rows as unknown[]) : []
  const rows = rowsRaw.map((r) => (Array.isArray(r) ? r.map(String) : []))
  if (!headers.length && !rows.length) return null
  return { type: "table", headers, rows }
}

export function normalizeAiContent(content: unknown): JsonRecord {
  if (typeof content === "string") {
    const parsed = parseJsonLikeString(content)
    if (parsed) return normalizeAiContent(parsed)
    return { text: content }
  }
  if (!isRecord(content)) return { value: content }
  const fromOutputText = coerceFromOutputText(content)
  if (fromOutputText) return fromOutputText
  const blocks = Array.isArray(content.blocks) ? content.blocks : null
  if (!blocks) {
    const summaryText = typeof content.summary === "string" ? content.summary.trim() : ""
    const stepsRaw = Array.isArray(content.steps) ? (content.steps as unknown[]) : []
    const stepsMarkdown = stepsRaw.length ? buildMarkdownFromSteps(stepsRaw) : ""
    const keyTerms = coerceTableFromObject(isRecord(content.key_terms) ? (content.key_terms as JsonRecord) : null)
    const analysisTable = coerceTableFromObject(isRecord(content.analysis_table) ? (content.analysis_table as JsonRecord) : null)
    const fallbackBlocks = [
      summaryText ? { type: "markdown", markdown: `## 핵심 개요\n${summaryText}` } : null,
      stepsMarkdown ? { type: "markdown", markdown: stepsMarkdown } : null,
      keyTerms || analysisTable,
    ].filter(Boolean) as JsonRecord[]
    return fallbackBlocks.length ? { ...content, blocks: fallbackBlocks } : content
  }
  return { ...content, blocks: normalizeBlocks(blocks) }
}
