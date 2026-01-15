import type { DOMOutputSpec, NodeSpec } from "prosemirror-model"
import { getBgColorClasses } from "./bgColor"

type CellAttrs = {
  colspan?: number
  rowspan?: number
  colwidth?: number[] | null
  cellAlign?: "left" | "center" | "right"
  cellVAlign?: "top" | "middle" | "bottom"
  bgColor?: string
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
  const rawAlign = (dom.getAttribute("data-align") || dom.style.textAlign || "").trim().toLowerCase()
  const rawVAlign = (dom.getAttribute("data-valign") || dom.style.verticalAlign || "").trim().toLowerCase()
  const cellAlign = rawAlign === "center" || rawAlign === "right" ? rawAlign : "left"
  const cellVAlign = rawVAlign === "middle" || rawVAlign === "bottom" ? rawVAlign : "top"
  return {
    colspan: colspan ? parseInt(colspan, 10) || 1 : 1,
    rowspan: rowspan ? parseInt(rowspan, 10) || 1 : 1,
    colwidth: getColWidths(dom),
    cellAlign,
    cellVAlign,
  }
}

function cellToDom(tag: "td" | "th", attrs: CellAttrs, className: string) {
  const domAttrs: Record<string, unknown> = {
    class: className,
  }
  if (attrs.colspan && attrs.colspan !== 1) domAttrs.colspan = attrs.colspan
  if (attrs.rowspan && attrs.rowspan !== 1) domAttrs.rowspan = attrs.rowspan
  if (attrs.colwidth && attrs.colwidth.length) domAttrs["data-colwidth"] = attrs.colwidth.join(",")
  // Optional block background color on table cells
  if (attrs.bgColor) domAttrs["data-bg-color"] = String(attrs.bgColor)
  if (attrs.cellAlign) domAttrs["data-align"] = attrs.cellAlign
  if (attrs.cellVAlign) domAttrs["data-valign"] = attrs.cellVAlign
  return [tag, domAttrs, 0] as DOMOutputSpec
}

// Customize wrapper / table classes here (shadcn-like styling is mostly in src/index.css)
export const tableNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
    indent: { default: 0 },
    // Table wrapper width in px. 0/falsey means "auto" (full width).
    width: { default: 0 },
    borderless: { default: false },
    rounded: { default: true },
  },
  content: "table_row+",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseDOM: [
    {
      tag: "table",
      getAttrs: (dom) => ({
        blockId: (dom as HTMLElement).getAttribute("data-block-id"),
        indent: Number((dom as HTMLElement).getAttribute("data-indent") || 0) || 0,
        width: Number((dom as HTMLElement).getAttribute("data-width") || 0) || 0,
        borderless: (dom as HTMLElement).getAttribute("data-borderless") === "true",
        rounded: (dom as HTMLElement).getAttribute("data-rounded") !== "false",
      }),
    },
  ],
  toDOM: (node) => {
    const attrs = (node.attrs || {}) as {
      blockId?: string | null
      indent?: number
      width?: number
      borderless?: boolean
      rounded?: boolean
    }
    const blockId = attrs.blockId || ""
    const indent = Math.max(0, Math.min(8, Number(attrs.indent || 0)))
    const width = Math.max(0, Number(attrs.width || 0))
    const borderless = Boolean(attrs.borderless)
    const rounded = attrs.rounded !== false
    return [
    "div",
    {
      class:
        "tableWrapper my-3 overflow-hidden rounded-md border border-border bg-card shadow-sm",
      "data-block-id": blockId,
      "data-indent": String(indent),
      "data-borderless": String(borderless),
      "data-rounded": String(rounded),
      style: [
        `margin-left: ${indent * 24}px;`,
        width ? ` width: ${width}px;` : "",
        borderless ? " border: 0;" : "",
        rounded ? "" : " border-radius: 0;",
      ].join(""),
    },
    [
      "table",
      {
        class: "w-full table-fixed text-sm table-width-adjustable bg-red-500",
        "data-block-id": blockId,
        "data-indent": String(indent),
        "data-width": String(width),
        "data-borderless": String(borderless),
        "data-rounded": String(rounded),
      },
      ["tbody", 0],
    ],
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
    return ["tr", { class: "pm-table-row bg-background", "data-block-id": attrs.blockId || "" }, 0]
  },
}

export const tableCellNodeSpec: NodeSpec = {
  content: "block+",
  attrs: {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
    bgColor: { default: "" },
    cellAlign: { default: "left" },
    cellVAlign: { default: "top" },
  },
  tableRole: "cell",
  isolating: true,
  parseDOM: [
    {
      tag: "td",
      getAttrs: (dom) => ({
        ...getCellAttrs(dom as HTMLElement),
        bgColor: (dom as HTMLElement).getAttribute("data-bg-color") || "",
      }),
    },
  ],
  toDOM: (node) => {
    const attrs = (node.attrs || {}) as CellAttrs
    const cellAlign = attrs.cellAlign || "left"
    const cellVAlign = attrs.cellVAlign || "top"
    return cellToDom(
      "td",
      attrs,
      [
        "align-top border-b border-r border-border dark:border-neutral-700",
        getBgColorClasses(attrs.bgColor),
        cellAlign === "center" ? "text-center" : cellAlign === "right" ? "text-right" : "text-left",
        cellVAlign === "middle" ? "align-middle" : cellVAlign === "bottom" ? "align-bottom" : "align-top",
      ]
        .filter(Boolean)
        .join(" ")
    )
  },
}

export const tableHeaderNodeSpec: NodeSpec = {
  content: "block+",
  attrs: {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
    bgColor: { default: "" },
    cellAlign: { default: "left" },
    cellVAlign: { default: "top" },
  },
  tableRole: "header_cell",
  isolating: true,
  parseDOM: [
    {
      tag: "th",      
      getAttrs: (dom) => ({
        ...getCellAttrs(dom as HTMLElement),
        bgColor: (dom as HTMLElement).getAttribute("data-bg-color") || "",
      }),
    },
  ],
  toDOM: (node) => {
    const attrs = (node.attrs || {}) as CellAttrs
    const cellAlign = attrs.cellAlign || "left"
    const cellVAlign = attrs.cellVAlign || "top"
    return cellToDom(
      "th",
      attrs,
      [
        "bg-muted",
        getBgColorClasses(attrs.bgColor),
        cellAlign === "center" ? "text-center" : cellAlign === "right" ? "text-right" : "text-left",
        cellVAlign === "middle" ? "align-middle" : cellVAlign === "bottom" ? "align-bottom" : "align-top",
      ]
        .filter(Boolean)
        .join(" ")
    )
  },
}


