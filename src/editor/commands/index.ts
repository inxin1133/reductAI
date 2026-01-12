import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands"
import { EditorState, Transaction } from "prosemirror-state"
import type { Schema } from "prosemirror-model"
import { TextSelection } from "prosemirror-state"
import { wrapInList } from "prosemirror-schema-list"
import { ReplaceStep } from "prosemirror-transform"
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  mergeCells,
  setCellAttr,
  splitCell,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
} from "prosemirror-tables"

export function cmdToggleBold(schema: Schema) {
  return toggleMark(schema.marks.strong)
}
export function cmdToggleItalic(schema: Schema) {
  return toggleMark(schema.marks.em)
}
export function cmdToggleCodeMark(schema: Schema) {
  return toggleMark(schema.marks.code)
}

export function cmdToggleUnderline(schema: Schema) {
  const m = schema.marks.underline
  if (!m) return () => false
  return toggleMark(m)
}

export function cmdToggleStrikethrough(schema: Schema) {
  const m = schema.marks.strike
  if (!m) return () => false
  return toggleMark(m)
}

export function cmdSetTextColor(schema: Schema, color: string) {
  const m = schema.marks.text_color
  if (!m) return () => false
  const c = String(color || "").trim()
  if (!c) return () => false

  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!dispatch) return true
    const { from, to, empty } = state.selection
    let tr = state.tr
    if (empty) {
      tr = tr.addStoredMark(m.create({ color: c }))
    } else {
      tr = tr.removeMark(from, to, m)
      tr = tr.addMark(from, to, m.create({ color: c }))
    }
    dispatch(tr.scrollIntoView())
    return true
  }
}

export function cmdClearTextColor(schema: Schema) {
  const m = schema.marks.text_color
  if (!m) return () => false
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!dispatch) return true
    const { from, to, empty } = state.selection
    let tr = state.tr
    tr = tr.removeStoredMark(m)
    if (!empty) tr = tr.removeMark(from, to, m)
    dispatch(tr.scrollIntoView())
    return true
  }
}

function findNearestBlockPos(state: EditorState): { pos: number; node: any } | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d -= 1) {
    const n = $from.node(d)
    if (n && n.isBlock && n.type.name !== "doc") {
      return { pos: $from.before(d), node: n }
    }
  }
  return null
}

export function cmdSetBlockBgColor(_schema: Schema, bgColor: string) {
  const c = String(bgColor || "").trim()
  if (!c) return () => false
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const found = findNearestBlockPos(state)
    if (!found) return false
    const node = found.node as any
    if (!dispatch) return true
    const nextAttrs = { ...(node.attrs || {}), bgColor: c }
    dispatch(state.tr.setNodeMarkup(found.pos, undefined, nextAttrs).scrollIntoView())
    return true
  }
}

export function cmdClearBlockBgColor(_schema: Schema) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const found = findNearestBlockPos(state)
    if (!found) return false
    const node = found.node as any
    if (!dispatch) return true
    const nextAttrs = { ...(node.attrs || {}), bgColor: "" }
    dispatch(state.tr.setNodeMarkup(found.pos, undefined, nextAttrs).scrollIntoView())
    return true
  }
}

export function cmdHeading(schema: Schema, level: 1 | 2 | 3) {
  return setBlockType(schema.nodes.heading, { level })
}

export function cmdParagraph(schema: Schema) {
  return setBlockType(schema.nodes.paragraph)
}

export function cmdBlockquote(schema: Schema) {
  return wrapIn(schema.nodes.blockquote)
}

export function cmdCodeBlock(schema: Schema) {
  return setBlockType(schema.nodes.code_block)
}

export function cmdBulletList(schema: Schema) {
  return wrapInList(schema.nodes.bullet_list)
}

export function cmdOrderedList(schema: Schema) {
  return wrapInList(schema.nodes.ordered_list)
}

export function cmdChecklist(schema: Schema) {
  const bl = schema.nodes.bullet_list
  if (!bl) return () => false

  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const { $from } = state.selection

    // If we're already inside a bullet_list, just flip it into checklist mode.
    for (let d = $from.depth; d > 0; d -= 1) {
      const node = $from.node(d)
      if (node.type === bl) {
        if (!dispatch) return true
        const pos = $from.before(d)
        dispatch(state.tr.setNodeMarkup(pos, undefined, { ...(node.attrs as any), listKind: "check" }).scrollIntoView())
        return true
      }
    }

    // Otherwise, wrap selection into a checklist bullet_list.
    return wrapInList(bl, { listKind: "check" } as any)(state, dispatch)
  }
}

export function cmdInsertHorizontalRule(schema: Schema) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const hr = schema.nodes.horizontal_rule
    if (!hr) return false
    if (!dispatch) return true
    dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView())
    return true
  }
}

export function cmdInsertImage(schema: Schema, attrs: { src: string; alt?: string; title?: string }) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const img = schema.nodes.image
    if (!img) return false
    if (!dispatch) return true
    dispatch(state.tr.replaceSelectionWith(img.create(attrs)).scrollIntoView())
    return true
  }
}

export function cmdInsertMention(schema: Schema, attrs: { id: string; label: string; type: string }) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const m = schema.nodes.mention
    if (!m) return false
    if (!dispatch) return true
    dispatch(state.tr.replaceSelectionWith(m.create(attrs)).scrollIntoView())
    return true
  }
}

export function cmdInsertPageLink(schema: Schema, attrs: { pageId: string; title?: string; display?: string }) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const n = schema.nodes.page_link
    if (!n) return false
    if (!dispatch) return true
    dispatch(state.tr.replaceSelectionWith(n.create(attrs)).scrollIntoView())
    return true
  }
}

export function cmdInsertTable(schema: Schema, opts: { rows: number; cols: number } = { rows: 2, cols: 2 }) {
  const table = schema.nodes.table
  const row = schema.nodes.table_row
  const cell = schema.nodes.table_cell
  const paragraph = schema.nodes.paragraph
  if (!table || !row || !cell || !paragraph) return () => false

  const rows = Math.max(1, Math.min(20, Number(opts.rows || 2)))
  const cols = Math.max(1, Math.min(20, Number(opts.cols || 2)))

  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    if (!dispatch) return true

    const tableNode = table.create(
      { blockId: null, indent: 0, width: 0 },
      Array.from({ length: rows }).map(() =>
        row.create(
          { blockId: null },
          Array.from({ length: cols }).map(() =>
            cell.create(
              { colspan: 1, rowspan: 1, colwidth: null, bgColor: "", cellAlign: "left" },
              [paragraph.create()]
            )
          )
        )
      )
    )

    const insertFrom = state.selection.from
    let tr = state.tr.replaceSelectionWith(tableNode).scrollIntoView()

    // Move cursor into the first textblock inside the inserted table (best-effort).
    const end = Math.min(tr.doc.content.size, insertFrom + tableNode.nodeSize)
    let targetPos: number | null = null
    tr.doc.nodesBetween(insertFrom, end, (node, pos) => {
      if (targetPos != null) return false
      if (node.isTextblock) {
        targetPos = pos + 1
        return false
      }
      return true
    })
    if (targetPos != null) {
      try {
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos)))
      } catch {
        // ignore
      }
    }

    dispatch(tr)
    return true
  }
}

export function cmdSetTableCellAlign(_schema: Schema, align: "left" | "center" | "right") {
  const a = align === "center" || align === "right" ? align : "left"
  return setCellAttr("cellAlign", a)
}

// prosemirror-transform 직접 사용 예시:
// 현재 selection이 속한 "블록 노드" (paragraph/heading/blockquote/code_block 등)를 통째로 복제하여 아래에 삽입합니다.
export function cmdDuplicateBlock(_schema: Schema) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const { $from } = state.selection

    // find nearest ancestor that is a block (skip doc)
    let depth = $from.depth
    while (depth > 0) {
      const node = $from.node(depth)
      if (node.isBlock && node.type.name !== "doc") break
      depth -= 1
    }
    if (depth <= 0) return false

    const start = $from.before(depth)
    const end = $from.after(depth)
    const slice = state.doc.slice(start, end)

    if (!dispatch) return true

    // Insert the exact slice at the end position using a ReplaceStep (from prosemirror-transform)
    const tr = state.tr
    tr.step(new ReplaceStep(end, end, slice))

    // Move cursor into the duplicated block (best-effort)
    const posInDup = Math.min(end + 1, tr.doc.content.size)
    tr.setSelection(TextSelection.near(tr.doc.resolve(posInDup)))

    dispatch(tr.scrollIntoView())
    return true
  }
}

export const tableCommands = {
  addRowAfter,
  addRowBefore,
  deleteRow,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  deleteTable,
  mergeCells,
  splitCell,
  toggleHeaderCell,
  toggleHeaderRow,
  toggleHeaderColumn,
}


