import { editorSchema } from "@/editor/schema"
import { parseMarkdownToPmDoc } from "@/editor/serializers/markdown"

type PmDocJson = unknown

type AiBlock = {
  type?: string
  markdown?: string
  code?: string
  content?: string
  language?: string
  headers?: unknown[]
  rows?: unknown[]
  data?: unknown
  url?: string
  src?: string
  alt?: string
  title?: string
}

function paragraphFromText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null
  return {
    type: "paragraph",
    content: [{ type: "text", text: trimmed }],
  }
}

function paragraphsFromText(text: string) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((chunk) => paragraphFromText(chunk))
    .filter(Boolean) as Array<Record<string, unknown>>
}

function withAuthToken(url: string) {
  const raw = String(url || "")
  if (!raw) return raw
  if (typeof window === "undefined") return raw
  const token = window.localStorage.getItem("token")
  if (!token) return raw
  if (!raw.startsWith("/api/ai/media/assets/")) return raw
  return `${raw}${raw.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
}

function normalizeMarkdownTables(input: string) {
  const raw = String(input || "")
  if (!raw.includes("```")) return raw
  const fenceRegex = /```[^\n]*\n([\s\S]*?)```/g
  return raw.replace(fenceRegex, (match, inner) => {
    const lines = String(inner || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (lines.length < 2) return match
    const hasPipes = lines.every((line) => line.includes("|"))
    if (!hasPipes) return match
    const toCells = (line: string) => {
      const parts = line.split("|").map((s) => s.trim())
      if (line.startsWith("|")) parts.shift()
      if (line.endsWith("|")) parts.pop()
      return parts
    }
    const headerCells = toCells(lines[0])
    const bodyCells = lines.slice(1).map(toCells)
    const colCount = headerCells.length
    if (colCount < 2) return match
    const sep = Array(colCount).fill("---").join(" | ")
    const normalized = [
      `| ${headerCells.join(" | ")} |`,
      `| ${sep} |`,
      ...bodyCells.map((row) => {
        const padded = row.slice()
        while (padded.length < colCount) padded.push("")
        return `| ${padded.join(" | ")} |`
      }),
    ]
    return `\n${normalized.join("\n")}\n`
  })
}

function normalizeMarkdownText(input: string) {
  let raw = String(input || "")
  if (!raw) return raw
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === "string") raw = parsed
    } catch {
      // ignore
    }
  }
  const hasActualNewline = raw.includes("\n")
  const hasEscapedNewline = raw.includes("\\n")
  if (hasEscapedNewline && !hasActualNewline) {
    raw = raw
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
  }
  return raw
}

type MarkdownSegment =
  | { type: "markdown"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] }

function splitMarkdownIntoSegments(markdown: string): MarkdownSegment[] {
  const lines = String(markdown || "").split("\n")
  const segments: MarkdownSegment[] = []
  const buffer: string[] = []

  const flushBuffer = () => {
    const text = buffer.join("\n").trim()
    if (text) segments.push({ type: "markdown", content: text })
    buffer.length = 0
  }

  const isSeparator = (line: string) => {
    if (!line.includes("|")) return false
    if (!line.includes("-")) return false
    return /^(\s*\|?\s*:?-+:?\s*)+\|?\s*$/.test(line)
  }

  const toCells = (line: string) => {
    const parts = line.split("|").map((s) => s.trim())
    if (line.startsWith("|")) parts.shift()
    if (line.endsWith("|")) parts.pop()
    return parts
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const next = i + 1 < lines.length ? lines[i + 1] : ""
    const isTableStart = line.includes("|") && isSeparator(next)
    if (!isTableStart) {
      buffer.push(line)
      continue
    }

    flushBuffer()

    const headerCells = toCells(line)
    const rows: string[][] = []
    i += 2
    for (; i < lines.length; i += 1) {
      const rowLine = lines[i]
      if (!rowLine.trim()) break
      if (!rowLine.includes("|")) break
      if (isSeparator(rowLine)) continue
      rows.push(toCells(rowLine))
    }
    i -= 1

    if (headerCells.length >= 2) {
      const paddedRows = rows.map((row) => {
        const out = row.slice()
        while (out.length < headerCells.length) out.push("")
        return out
      })
      segments.push({ type: "table", headers: headerCells, rows: paddedRows })
    } else {
      buffer.push(line)
    }
  }

  flushBuffer()
  return segments
}

function appendMarkdownBlocks(content: Array<Record<string, unknown>>, markdown: string) {
  const normalizedMarkdown = normalizeMarkdownTables(normalizeMarkdownText(markdown))
  const segments = splitMarkdownIntoSegments(normalizedMarkdown)
  if (!segments.length) {
    content.push(...paragraphsFromText(normalizedMarkdown))
    return
  }
  for (const segment of segments) {
    if (segment.type === "table") {
      const table = tableFromBlocks(segment.headers, segment.rows)
      if (table) content.push(table)
      continue
    }
    try {
      const doc = parseMarkdownToPmDoc(editorSchema, segment.content)
      const json = doc?.toJSON() as { content?: Array<Record<string, unknown>> } | undefined
      if (json?.content?.length) {
        content.push(...json.content)
        continue
      }
    } catch {
      // fall through to plain text
    }
    content.push(...paragraphsFromText(segment.content))
  }
}

function tableFromBlocks(headers: string[], rows: string[][]) {
  const inlineFromMarkdown = (input: string) => {
    const raw = String(input ?? "")
    if (!raw.trim()) return [] as Array<Record<string, unknown>>
    try {
      const doc = parseMarkdownToPmDoc(editorSchema, raw)
      const json = doc?.toJSON() as { content?: Array<Record<string, unknown>> } | undefined
      const first = json?.content?.[0]
      // Prefer the first paragraph's inline content.
      if (first?.type === "paragraph" && Array.isArray(first.content)) return first.content as Array<Record<string, unknown>>
      // Fallback: if parsing produced non-paragraph blocks, just keep plain text.
      return [{ type: "text", text: raw }]
    } catch {
      return [{ type: "text", text: raw }]
    }
  }

  const headerCells = headers.map((h) => ({
    type: "table_header",
    content: [{ type: "paragraph", content: inlineFromMarkdown(h) }],
  }))
  const bodyRows = rows.map((r) => ({
    type: "table_row",
    content: r.map((cell) => ({
      type: "table_cell",
      content: [{ type: "paragraph", content: inlineFromMarkdown(cell) }],
    })),
  }))
  const tableRows = headerCells.length
    ? [
        {
          type: "table_row",
          content: headerCells,
        },
        ...bodyRows,
      ]
    : bodyRows

  if (!tableRows.length) return null
  return {
    type: "table",
    content: tableRows,
  }
}

function buildMarkdownFromSteps(steps: unknown[]): string {
  const normalized = steps
    .map((s, i) => {
      if (typeof s === "string") return `${i + 1}. ${s}`
      if (!s || typeof s !== "object") return ""
      const obj = s as Record<string, unknown>
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

function coerceTableFromObject(obj: Record<string, unknown> | null): { headers: string[]; rows: string[][] } | null {
  if (!obj) return null
  const headers = Array.isArray(obj.headers)
    ? (obj.headers as unknown[]).map(String)
    : Array.isArray(obj.columns)
      ? (obj.columns as unknown[]).map(String)
      : []
  const rowsRaw = Array.isArray(obj.rows) ? (obj.rows as unknown[]) : []
  const rows = rowsRaw.map((r) => (Array.isArray(r) ? r.map(String) : []))
  if (!headers.length && !rows.length) return null
  return { headers, rows }
}

export function aiJsonToPmDoc(contentJson: unknown): PmDocJson | null {
  if (!contentJson || typeof contentJson !== "object") return null
  const obj = contentJson as Record<string, unknown>
  if (obj.type === "doc") return contentJson as PmDocJson

  const content: Array<Record<string, unknown>> = []
  const outputText = typeof obj.output_text === "string" ? normalizeMarkdownText(obj.output_text).trim() : ""
  if (outputText) {
    appendMarkdownBlocks(content, outputText)
  }
  const topMarkdown = typeof obj.markdown === "string" ? normalizeMarkdownText(obj.markdown).trim() : ""
  if (topMarkdown) {
    appendMarkdownBlocks(content, topMarkdown)
  }
  const messageText = typeof obj.message === "string" ? normalizeMarkdownText(obj.message).trim() : ""
  if (messageText) {
    appendMarkdownBlocks(content, messageText)
  }
  const replyText = typeof obj.reply === "string" ? normalizeMarkdownText(obj.reply).trim() : ""
  if (replyText) {
    appendMarkdownBlocks(content, replyText)
  }
  const title = typeof obj.title === "string" ? obj.title.trim() : ""
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : ""
  if (title) {
    content.push({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: title }],
    })
  }
  if (summary) {
    appendMarkdownBlocks(content, summary)
  }

  let blocks = Array.isArray(obj.blocks) ? (obj.blocks as AiBlock[]) : []
  if (!blocks.length) {
    const fallbackBlocks: AiBlock[] = []
    const summaryText = typeof obj.summary === "string" ? obj.summary.trim() : ""
    if (summaryText) {
      fallbackBlocks.push({ type: "markdown", content: `## 핵심 개요\n${summaryText}` })
    }
    const stepsRaw = Array.isArray(obj.steps) ? (obj.steps as unknown[]) : []
    const stepsMarkdown = stepsRaw.length ? buildMarkdownFromSteps(stepsRaw) : ""
    if (stepsMarkdown) fallbackBlocks.push({ type: "markdown", content: stepsMarkdown })
    const keyTerms = coerceTableFromObject(obj.key_terms && typeof obj.key_terms === "object" ? (obj.key_terms as Record<string, unknown>) : null)
    const analysisTable = coerceTableFromObject(obj.analysis_table && typeof obj.analysis_table === "object" ? (obj.analysis_table as Record<string, unknown>) : null)
    const tableSource = keyTerms || analysisTable
    if (tableSource) {
      fallbackBlocks.push({ type: "table", headers: tableSource.headers, rows: tableSource.rows })
    }
    blocks = fallbackBlocks
  }
  for (const b of blocks) {
    const t = String(b.type || "").toLowerCase()
    const dataObj = b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : null
    if (t === "markdown") {
      const md =
        typeof b.markdown === "string"
          ? b.markdown
          : typeof (b as { text?: unknown }).text === "string"
            ? String((b as { text?: unknown }).text)
          : typeof b.content === "string"
            ? b.content
            : typeof dataObj?.content === "string"
              ? dataObj.content
              : typeof dataObj?.markdown === "string"
                ? dataObj.markdown
                : ""
      if (md) appendMarkdownBlocks(content, md)
      continue
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
      if (!code) continue
      content.push({
        type: "code_block",
        attrs: { language: typeof b.language === "string" ? b.language : typeof dataObj?.language === "string" ? dataObj.language : "plain" },
        content: [{ type: "text", text: code }],
      })
      continue
    }
    if (t === "table") {
      const contentObj = (b as unknown as { content?: unknown }).content
      const contentRec = contentObj && typeof contentObj === "object" ? (contentObj as Record<string, unknown>) : null
      const tableObj = (b as unknown as { table?: unknown }).table
      const tableRec = tableObj && typeof tableObj === "object" ? (tableObj as Record<string, unknown>) : null
      const pickFirstNonEmpty = <T,>(candidates: T[][]): T[] => {
        for (const c of candidates) {
          if (Array.isArray(c) && c.length) return c
        }
        return []
      }
      const columnsFromData = (rec: Record<string, unknown> | null) =>
        Array.isArray(rec?.columns) ? (rec?.columns as unknown[]).map(String) : []
      const rowsFromData = (rec: Record<string, unknown> | null) => {
        const data = Array.isArray(rec?.data) ? (rec?.data as unknown[]) : []
        return data.map((r) => (Array.isArray(r) ? r.map(String) : []))
      }

      const headers = pickFirstNonEmpty<string>([
        Array.isArray(b.headers) ? b.headers.map(String) : [],
        Array.isArray(contentRec?.headers) ? (contentRec?.headers as unknown[]).map(String) : [],
        Array.isArray(tableRec?.headers) ? (tableRec?.headers as unknown[]).map(String) : [],
        Array.isArray(dataObj?.headers) ? (dataObj?.headers as unknown[]).map(String) : [],
        columnsFromData(tableRec),
        columnsFromData(dataObj),
      ])

      const rawRows = pickFirstNonEmpty<unknown>([
        Array.isArray(b.rows) ? b.rows : [],
        Array.isArray(contentRec?.rows) ? (contentRec?.rows as unknown[]) : [],
        Array.isArray(tableRec?.rows) ? (tableRec?.rows as unknown[]) : [],
        Array.isArray(dataObj?.rows) ? (dataObj?.rows as unknown[]) : [],
        rowsFromData(tableRec),
        rowsFromData(dataObj),
        Array.isArray(dataObj) ? (dataObj as unknown[]) : [],
      ])
      const rows = rawRows.map((r) => (Array.isArray(r) ? r.map(String) : []))
      const table = tableFromBlocks(headers, rows)
      if (table) content.push(table)
      continue
    }
    if (t === "image") {
      const src = typeof b.src === "string" ? b.src : typeof b.url === "string" ? b.url : ""
      if (src) {
        content.push({
          type: "image",
          attrs: {
            src: withAuthToken(src),
            alt: typeof b.alt === "string" ? b.alt : null,
            title: typeof b.title === "string" ? b.title : null,
          },
        })
      }
      continue
    }
    if (t === "text") {
      const md = typeof b.markdown === "string" ? b.markdown : typeof b.content === "string" ? b.content : ""
      if (md) appendMarkdownBlocks(content, md)
    }
  }

  const images = Array.isArray(obj.images) ? (obj.images as Array<Record<string, unknown>>) : []
  for (const img of images) {
    const src = typeof img?.url === "string" ? img.url : ""
    if (!src) continue
    content.push({
      type: "image",
      attrs: { src: withAuthToken(src), alt: "image", title: null },
    })
  }

  const audio = obj.audio && typeof obj.audio === "object" ? (obj.audio as Record<string, unknown>) : null
  const video = obj.video && typeof obj.video === "object" ? (obj.video as Record<string, unknown>) : null
  const audioSrc = audio && typeof audio.data_url === "string" ? audio.data_url : typeof audio?.url === "string" ? audio.url : ""
  const videoSrc = video && typeof video.data_url === "string" ? video.data_url : typeof video?.url === "string" ? video.url : ""
  if (audioSrc) {
    content.push({ type: "audio", attrs: { src: withAuthToken(audioSrc), title: null } })
  }
  if (videoSrc) {
    content.push({ type: "video", attrs: { src: withAuthToken(videoSrc), title: null, poster: null } })
  }

  if (!content.length) return null
  const docJson = { type: "doc", content }
  try {
    // Validate against schema to avoid runtime errors.
    editorSchema.nodeFromJSON(docJson)
    return docJson
  } catch {
    return null
  }
}
