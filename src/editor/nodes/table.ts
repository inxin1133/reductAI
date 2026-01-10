import type { DOMOutputSpec, NodeSpec } from "prosemirror-model"

type CellAttrs = {
  colspan?: number
  rowspan?: number
  colwidth?: number[] | null
}

function getColWidths(dom: HTMLElement) {
  const raw = dom.getAttribute("data-colwidth")
  if (!raw) return null
  const parts = raw
    .split(",")
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
  return parts.length ? parts : null
}

function getCellAttrs(dom: HTMLElement): CellAttrs {
  const colspan = dom.getAttribute("colspan")
  const rowspan = dom.getAttribute("rowspan")
  return {
    colspan: colspan ? parseInt(colspan, 10) || 1 : 1,
    rowspan: rowspan ? parseInt(rowspan, 10) || 1 : 1,
    colwidth: getColWidths(dom),
  }
}

function cellToDom(tag: "td" | "th", attrs: CellAttrs, className: string) {
  const domAttrs: Record<string, unknown> = {
    class: className,
  }
  if (attrs.colspan && attrs.colspan !== 1) domAttrs.colspan = attrs.colspan
  if (attrs.rowspan && attrs.rowspan !== 1) domAttrs.rowspan = attrs.rowspan
  if (attrs.colwidth && attrs.colwidth.length) domAttrs["data-colwidth"] = attrs.colwidth.join(",")
  return [tag, domAttrs, 0] as DOMOutputSpec
}

// Customize wrapper / table classes here (shadcn-like styling is mostly in src/index.css)
export const tableNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
  },
  content: "table_row+",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseDOM: [
    {
      tag: "table",
      getAttrs: (dom) => ({ blockId: (dom as HTMLElement).getAttribute("data-block-id") }),
    },
  ],
  toDOM: (node) => {
    const attrs = (node.attrs || {}) as { blockId?: string | null }
    const blockId = attrs.blockId || ""
    return [
    "div",
    {
      class:
        "tableWrapper my-3 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm",
      "data-block-id": blockId,
    },
    ["table", { class: "w-full table-fixed text-sm", "data-block-id": blockId }, ["tbody", 0]],
    ] as DOMOutputSpec
  },
}

export const tableRowNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
  },
  content: "(table_cell | table_header)*",
  tableRole: "row",
  parseDOM: [
    {
      tag: "tr",
      getAttrs: (dom) => ({ blockId: (dom as HTMLElement).getAttribute("data-block-id") }),
    },
  ],
  toDOM: (node) => {
    const attrs = (node.attrs || {}) as { blockId?: string | null }
    return ["tr", { class: "pm-table-row", "data-block-id": attrs.blockId || "" }, 0]
  },
}

export const tableCellNodeSpec: NodeSpec = {
  content: "block+",
  attrs: {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
  },
  tableRole: "cell",
  isolating: true,
  parseDOM: [{ tag: "td", getAttrs: (dom) => getCellAttrs(dom as HTMLElement) }],
  toDOM: (node) =>
    cellToDom(
      "td",
      (node.attrs || {}) as CellAttrs,
      "align-top border-b border-r border-border/60 p-2"
    ),
}

export const tableHeaderNodeSpec: NodeSpec = {
  content: "block+",
  attrs: {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
  },
  tableRole: "header_cell",
  isolating: true,
  parseDOM: [{ tag: "th", getAttrs: (dom) => getCellAttrs(dom as HTMLElement) }],
  toDOM: (node) =>
    cellToDom(
      "th",
      (node.attrs || {}) as CellAttrs,
      "bg-muted/50 font-semibold text-foreground align-top border-b border-r border-border/60 p-2"
    ),
}


