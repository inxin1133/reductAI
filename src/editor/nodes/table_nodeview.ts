import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view"
import { TableView } from "prosemirror-tables"

type TableAttrs = {
  blockId?: string | null
  indent?: number
  borderless?: boolean
  rounded?: boolean
}

type Options = {
  defaultCellMinWidth?: number
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export class TableNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement

  private base: TableView

  private opts: Required<Options>

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined, opts?: Options) {
    void view
    void getPos
    this.opts = {
      defaultCellMinWidth: opts?.defaultCellMinWidth ?? 25,
    }

    // Use the library TableView internally so columnResizing/tableEditing keep working.
    this.base = new TableView(node, this.opts.defaultCellMinWidth)
    this.dom = this.base.dom
    this.contentDOM = this.base.contentDOM

    // Apply our styling + persisted attrs (indent/width/blockId).
    this.applyAttrs(node)
  }

  update(node: PMNode) {
    // Let the base TableView update columns/colgroup.
    const ok = this.base.update(node)
    if (!ok) return false
    this.applyAttrs(node)
    return true
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    // ProseMirror may pass a synthetic "selection" record.
    if (mutation.type === "selection") return true

    // Ignore mutations from TableView
    const record = mutation as unknown as MutationRecord
    return this.base.ignoreMutation(record)
  }

  destroy() {
    // no-op
  }

  private applyAttrs(node: PMNode) {
    const a = (node.attrs || {}) as unknown as TableAttrs
    const blockId = typeof a.blockId === "string" ? a.blockId : ""
    const indent = clamp(Number(a.indent || 0), 0, 8)
    const borderless = Boolean(a.borderless)
    const rounded = a.rounded !== false

    // Keep the prosemirror-tables default class but add our design classes
    // prosemirror-tables의 기본 클래스를 유지하면서, 우리 디자인 클래스를 추가합니다
    this.dom.className = [
      "tableWrapper",
      "my-3 overflow-hidden rounded-md border border-border bg-card shadow-sm",
    ].join(" ")
    // Ensure positioning works even if Tailwind styles are not applied for some reason.
    this.dom.style.position = "relative"
    this.dom.setAttribute("data-block-id", blockId)
    this.dom.setAttribute("data-indent", String(indent))
    this.dom.setAttribute("data-borderless", String(borderless))
    this.dom.setAttribute("data-rounded", String(rounded))

    // Indent
    this.dom.style.marginLeft = `${indent * 24}px`
    // Let the wrapper width be determined by the inner table (shrink-to-fit via CSS)
    this.dom.style.removeProperty("width")
    // Border / rounded toggles
    if (borderless) {
      this.dom.style.border = "0"
    } else {
      this.dom.style.removeProperty("border")
    }
    if (borderless) {
      this.dom.style.boxShadow = "none"
    } else {
      this.dom.style.removeProperty("box-shadow")
    }
    if (!rounded) {
      this.dom.style.borderRadius = "0"
    } else {
      this.dom.style.removeProperty("border-radius")
    }

    // Attach attrs on the inner <table> too so parseDOM can recover if needed.
    this.base.table.className = "table-fixed text-sm"
    this.base.table.setAttribute("data-block-id", blockId)
    this.base.table.setAttribute("data-indent", String(indent))
    this.base.table.setAttribute("data-borderless", String(borderless))
    this.base.table.setAttribute("data-rounded", String(rounded))
    this.base.table.removeAttribute("data-width")
  }
}

