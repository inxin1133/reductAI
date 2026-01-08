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


