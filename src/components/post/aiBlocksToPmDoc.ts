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

function appendMarkdownBlocks(content: Array<Record<string, unknown>>, markdown: string) {
  try {
    const doc = parseMarkdownToPmDoc(editorSchema, markdown)
    const json = doc?.toJSON() as { content?: Array<Record<string, unknown>> } | undefined
    if (json?.content?.length) {
      content.push(...json.content)
      return
    }
  } catch {
    // fall through to plain text
  }
  content.push(...paragraphsFromText(markdown))
}

function tableFromBlocks(headers: string[], rows: string[][]) {
  const headerCells = headers.map((h) => ({
    type: "table_header",
    content: [{ type: "paragraph", content: [{ type: "text", text: h }] }],
  }))
  const bodyRows = rows.map((r) => ({
    type: "table_row",
    content: r.map((cell) => ({
      type: "table_cell",
      content: [{ type: "paragraph", content: [{ type: "text", text: cell }] }],
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
      const headers = Array.isArray(b.headers) ? b.headers.map(String) : Array.isArray(dataObj?.headers) ? (dataObj?.headers as unknown[]).map(String) : []
      const rawRows = Array.isArray(b.rows) ? b.rows : Array.isArray(dataObj?.rows) ? (dataObj?.rows as unknown[]) : Array.isArray(dataObj) ? (dataObj as unknown[]) : []
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
