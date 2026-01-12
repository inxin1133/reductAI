import type { Node as PMNode, Schema } from "prosemirror-model"
import { MarkdownSerializer } from "prosemirror-markdown"

function esc(str: string) {
  return (str || "").replace(/(\*|_|`|\[|\]|\||\\)/g, "\\$1")
}

function oneLine(str: string) {
  return String(str || "").replace(/\s+/g, " ").trim()
}

function tableToGfm(node: PMNode): string {
  // prosemirror-tables: table -> table_row -> (table_cell | table_header)
  const rows: string[][] = []
  let hasHeader = false

  node.forEach((row) => {
    const cells: string[] = []
    row.forEach((cell) => {
      if (cell.type.name === "table_header") hasHeader = true
      cells.push(oneLine(cell.textContent))
    })
    rows.push(cells)
  })

  if (rows.length === 0) return ""
  const colCount = Math.max(...rows.map((r) => r.length), 0)
  const norm = rows.map((r) => {
    const rr = r.slice()
    while (rr.length < colCount) rr.push("")
    return rr
  })

  const header = hasHeader ? norm[0] : norm[0].map((_, i) => `col${i + 1}`)
  const body = hasHeader ? norm.slice(1) : norm.slice(1)

  const sep = header.map(() => "---")
  const fmtRow = (r: string[]) => `| ${r.map((c) => esc(c || "")).join(" | ")} |`
  const out: string[] = []
  out.push(fmtRow(header))
  out.push(fmtRow(sep))
  for (const r of body) out.push(fmtRow(r))
  return out.join("\n")
}

export function buildMarkdownSerializer(_schema: Schema) {
  const nodes: any = {
    doc: (state: any, node: PMNode) => state.renderContent(node),
    paragraph: (state: any, node: PMNode) => state.renderInline(node) && state.closeBlock(node),
    text: (state: any, node: PMNode) => state.text(node.text || ""),

    heading: (state: any, node: PMNode) => {
      state.write(state.repeat("#", node.attrs.level) + " ")
      state.renderInline(node)
      state.closeBlock(node)
    },
    blockquote: (state: any, node: PMNode) => {
      state.wrapBlock("> ", null, node, () => state.renderContent(node))
    },
    code_block: (state: any, node: PMNode) => {
      state.write("```")
      state.ensureNewLine()
      state.text(node.textContent, false)
      state.ensureNewLine()
      state.write("```")
      state.closeBlock(node)
    },
    hard_break: (state: any) => state.write("\\\n"),
    horizontal_rule: (state: any, node: PMNode) => {
      state.write("---")
      state.closeBlock(node)
    },

    bullet_list: (state: any, node: PMNode) => state.renderList(node, "  ", () => "- "),
    ordered_list: (state: any, node: PMNode) => {
      const start = node.attrs.order || 1
      let i = 0
      state.renderList(node, "  ", () => `${start + i++}. `)
    },
    list_item: (state: any, node: PMNode) => state.renderContent(node),

    // Tables: export as GitHub-flavored Markdown table (best-effort).
    table: (state: any, node: PMNode) => {
      const t = tableToGfm(node)
      state.write(t || "[Table]")
      state.closeBlock(node)
    },

    // Custom nodes
    image: (state: any, node: PMNode) => {
      const alt = esc(node.attrs.alt || "image")
      const src = String(node.attrs.src || "")
      const title = node.attrs.title ? ` "${esc(String(node.attrs.title))}"` : ""
      state.write(`![${alt}](${src}${title})`)
      state.closeBlock(node)
    },
    mention: (state: any, node: PMNode) => {
      state.text(`@${node.attrs.label || "mention"}`, false)
    },
    page_link: (state: any, node: PMNode) => {
      const title = String(node.attrs.title || "page")
      const pageId = String(node.attrs.pageId || "")
      const display = String(node.attrs.display || "link")
      state.write(`[[${esc(title)}|${esc(pageId)}|${esc(display)}]]`)
      state.closeBlock(node)
    },
  }

  const marks: any = {
    em: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
    strong: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
    code: { open: "`", close: "`" },
    // GFM doesn't have underline; use HTML tag so it round-trips through markdown export.
    underline: { open: "<u>", close: "</u>", mixable: true, expelEnclosingWhitespace: true },
    // GFM strikethrough
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    // Markdown doesn't standardize text color; export as inline HTML with best-effort hex mapping.
    text_color: {
      open: (_state: any, mark: any) => {
        const key = String(mark.attrs?.color || "")
        const hexByKey: Record<string, string> = {
          "slate-500": "#64748b",
          "gray-500": "#6b7280",
          "zinc-500": "#71717a",
          "neutral-500": "#737373",
          "stone-500": "#78716c",
          "red-500": "#ef4444",
          "orange-500": "#f97316",
          "amber-500": "#f59e0b",
          "yellow-500": "#eab308",
          "lime-500": "#84cc16",
          "green-500": "#22c55e",
          "emerald-500": "#10b981",
          "teal-500": "#14b8a6",
          "cyan-500": "#06b6d4",
          "sky-500": "#0ea5e9",
          "blue-500": "#3b82f6",
          "indigo-500": "#6366f1",
          "violet-500": "#8b5cf6",
          "purple-500": "#a855f7",
          "fuchsia-500": "#d946ef",
          "pink-500": "#ec4899",
          "rose-500": "#f43f5e",
        }
        const hex = hexByKey[key]
        const style = hex ? ` style="color:${hex}"` : ""
        // Keep the original key for debugging/round-tripping.
        const data = key ? ` data-text-color="${esc(key)}"` : ""
        return `<span${data}${style}>`
      },
      close: "</span>",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    link: {
      open: "[",
      close: (_state: any, mark: any) => {
        const href = String(mark.attrs.href || "")
        const title = mark.attrs.title ? ` "${esc(String(mark.attrs.title))}"` : ""
        return `](${href}${title})`
      },
    },
  }

  return new MarkdownSerializer(nodes, marks)
}

export function exportMarkdown(schema: Schema, doc: PMNode): string {
  return buildMarkdownSerializer(schema).serialize(doc, { tightLists: true })
}


