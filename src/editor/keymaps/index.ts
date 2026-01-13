/* eslint-disable @typescript-eslint/no-explicit-any */
import { keymap } from "prosemirror-keymap"
import { baseKeymap, chainCommands, setBlockType, toggleMark } from "prosemirror-commands"
import { undo, redo } from "prosemirror-history"
import { sinkListItem, liftListItem, splitListItem } from "prosemirror-schema-list"
import type { Schema } from "prosemirror-model"
import { TextSelection } from "prosemirror-state"
import { CellSelection, nextCell, selectionCell } from "prosemirror-tables"

function isInListItem(state: any, schema: Schema) {
  const li = schema.nodes.list_item
  if (!li) return false
  const $from = state.selection?.$from
  if (!$from) return false
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type === li) return true
  }
  return false
}

function findChecklistListPos(state: any, schema: Schema): number | null {
  const bl = schema.nodes.bullet_list
  if (!bl) return null
  const $from = state.selection?.$from
  if (!$from) return null
  for (let d = $from.depth; d > 0; d -= 1) {
    const n = $from.node(d)
    if (n.type === bl && String((n.attrs as any)?.listKind || "bullet") === "check") {
      return $from.before(d)
    }
  }
  return null
}

function findNearestBlockWithIndent(state: any): { pos: number; node: any } | null {
  const sel = state.selection
  const $from = sel?.$from
  if (!$from) return null
  for (let d = $from.depth; d > 0; d -= 1) {
    const node = $from.node(d)
    if (!node || !node.isBlock || node.type.name === "doc") continue
    const specAttrs = (node.type.spec && (node.type.spec as any).attrs) || null
    if (specAttrs && "indent" in specAttrs) {
      return { pos: $from.before(d), node }
    }
  }
  return null
}

function indentBlock(delta: 1 | -1) {
  return (state: any, dispatch: any) => {
    const found = findNearestBlockWithIndent(state)
    if (!found) return false
    const cur = Math.max(0, Math.min(8, Number((found.node.attrs as any)?.indent || 0)))
    const next = Math.max(0, Math.min(8, cur + delta))
    if (next === cur) return false
    if (!dispatch) return true
    const tr = state.tr.setNodeMarkup(found.pos, undefined, { ...(found.node.attrs as any), indent: next })
    dispatch(tr.scrollIntoView())
    return true
  }
}

function ensureChecklistKindInsideList(tr: any, checklistPos: number, schema: Schema) {
  const bl = schema.nodes.bullet_list
  if (!bl) return tr
  const root = tr.doc.nodeAt(checklistPos)
  if (!root || root.type !== bl) return tr

  const toFix: number[] = []
  root.descendants((node: any, pos: number) => {
    if (node.type === bl) {
      const cur = String((node.attrs as any)?.listKind || "bullet")
      if (cur !== "check") toFix.push(checklistPos + 1 + pos)
    }
    return true
  })

  // Apply from deeper to shallower for position stability
  for (let i = toFix.length - 1; i >= 0; i -= 1) {
    const pos = toFix[i]
    const n = tr.doc.nodeAt(pos)
    if (!n || n.type !== bl) continue
    tr = tr.setNodeMarkup(pos, undefined, { ...(n.attrs as any), listKind: "check" })
  }
  return tr
}

function sinkListItemPreserveChecklist(schema: Schema) {
  const li = schema.nodes.list_item
  if (!li) return () => false
  const base = sinkListItem(li)
  return (state: any, dispatch: any) => {
    const checklistPos = findChecklistListPos(state, schema)
    if (!dispatch) return base(state, dispatch)
    return base(
      state,
      (tr: any) => {
        let nextTr = tr
        if (checklistPos != null) {
          nextTr = ensureChecklistKindInsideList(nextTr, checklistPos, schema)
        }
        dispatch(nextTr)
      }
    )
  }
}

function exitCodeMarkOnArrowRight(schema: Schema) {
  const code = schema.marks.code
  if (!code) return () => false
  return (state: any, dispatch: any) => {
    const sel = state.selection
    if (!sel?.empty) return false
    const $from = sel.$from

    const stored = state.storedMarks || $from.marks()
    const codeActive = !!stored && code.isInSet(stored)
    if (!codeActive) return false

    const after = $from.nodeAfter
    const afterHasCode = !!after && after.isText && code.isInSet(after.marks)
    if (afterHasCode) return false

    if (!dispatch) return true

    const tr = state.tr
    const nextStored = Array.isArray(stored) ? stored.filter((m: any) => m.type !== code) : null
    tr.setStoredMarks(nextStored && nextStored.length ? nextStored : null)

    const pos = $from.pos
    if ($from.parentOffset < $from.parent.content.size) {
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1), 1))
    }

    dispatch(tr.scrollIntoView())
    return true
  }
}

function moveCellSelection(axis: "horiz" | "vert", dir: -1 | 1) {
  return (state: any, dispatch: any) => {
    if (!(state.selection instanceof CellSelection)) return false
    let $cell: any
    try {
      $cell = selectionCell(state)
    } catch {
      return false
    }
    const $next = nextCell($cell, axis, dir)
    if (!$next) return false
    if (!dispatch) return true
    dispatch(state.tr.setSelection(new CellSelection($next)).scrollIntoView())
    return true
  }
}

function removeCodeMarkOnBackspace(schema: Schema) {
  const code = schema.marks.code
  if (!code) return () => false
  return (state: any, dispatch: any) => {
    const sel = state.selection
    if (!sel?.empty) return false
    const $from = sel.$from

    const before = $from.nodeBefore
    if (!before || !before.isText) return false
    if (!code.isInSet(before.marks)) return false

    const parent = $from.parent
    const parentStart = $from.start()
    const at = $from.parentOffset

    const left = parent.childBefore(at)
    if (!left.node || !left.node.isText || !code.isInSet(left.node.marks)) return false

    let fromOff = left.offset
    let toOff = left.offset + left.node.nodeSize

    while (fromOff > 0) {
      const prev = parent.childBefore(fromOff)
      if (!prev.node || !prev.node.isText || !code.isInSet(prev.node.marks)) break
      fromOff = prev.offset
    }

    while (toOff < parent.content.size) {
      const next = parent.childAfter(toOff)
      if (!next.node || !next.node.isText || !code.isInSet(next.node.marks)) break
      toOff = toOff + next.node.nodeSize
    }

    if (!dispatch) return true
    const fromPos = parentStart + fromOff
    const toPos = parentStart + toOff
    const tr = state.tr.removeMark(fromPos, toPos, code)
    tr.setStoredMarks(null)
    dispatch(tr.scrollIntoView())
    return true
  }
}

export function buildEditorKeymap(schema: Schema) {
  const arrowRightBase = (baseKeymap as any)["ArrowRight"]
  const arrowLeftBase = (baseKeymap as any)["ArrowLeft"]
  const arrowUpBase = (baseKeymap as any)["ArrowUp"]
  const arrowDownBase = (baseKeymap as any)["ArrowDown"]
  const keys: Record<string, any> = {
    "Mod-z": undo,
    "Mod-y": redo,
    "Shift-Mod-z": redo,

    // Formatting
    "Mod-b": schema.marks.strong ? toggleMark(schema.marks.strong) : false,
    "Mod-i": schema.marks.em ? toggleMark(schema.marks.em) : false,

    // Notion-like:
    // - In lists: Tab/Shift-Tab should indent/outdent the list ITEM (marker + content), never just the inner paragraph.
    // - Outside lists: Tab/Shift-Tab adjust block indent.
    Tab: (state: any, dispatch: any) => {
      if (isInListItem(state, schema)) return sinkListItemPreserveChecklist(schema)(state, dispatch)
      return indentBlock(1)(state, dispatch)
    },
    "Shift-Tab": (state: any, dispatch: any) => {
      if (isInListItem(state, schema)) return liftListItem(schema.nodes.list_item)(state, dispatch)
      return indentBlock(-1)(state, dispatch)
    },

    // Table UX:
    // - F5 selects the whole current cell (works for both cursor-in-cell and cell selections).
    //   Note: This intentionally prevents browser refresh only when the caret is inside a table cell.
    F5: (state: any, dispatch: any) => {
      try {
        const $cell = selectionCell(state)
        if (!$cell) return false
        if (!dispatch) return true
        dispatch(state.tr.setSelection(new CellSelection($cell)).scrollIntoView())
        return true
      } catch {
        return false
      }
    },

    Escape: (state: any, dispatch: any) => {
      if (!(state.selection instanceof CellSelection)) return false
      let $cell: any
      try {
        $cell = selectionCell(state)
      } catch {
        return false
      }
      const inside = Math.min($cell.pos + 1, state.doc.content.size)
      if (!dispatch) return true
      dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(inside), 1)).scrollIntoView())
      return true
    },
  }

  // Code mark UX (inline `code`):
  keys["ArrowRight"] = chainCommands(moveCellSelection("horiz", 1), exitCodeMarkOnArrowRight(schema), arrowRightBase)
  keys["ArrowLeft"] = chainCommands(moveCellSelection("horiz", -1), arrowLeftBase)
  keys["ArrowDown"] = chainCommands(moveCellSelection("vert", 1), arrowDownBase)
  keys["ArrowUp"] = chainCommands(moveCellSelection("vert", -1), arrowUpBase)

  // Notion-like list behavior:
  // - Enter continues list
  // - Enter on empty list item exits to paragraph
  // - Backspace at start/empty lifts out of list to paragraph
  if (schema.nodes.list_item) {
    keys["Enter"] = splitListItem(schema.nodes.list_item)
    keys["Backspace"] = chainCommands(
      removeCodeMarkOnBackspace(schema),
      liftListItem(schema.nodes.list_item),
      baseKeymap.Backspace
    )
  } else {
    keys["Backspace"] = chainCommands(removeCodeMarkOnBackspace(schema), baseKeymap.Backspace)
  }

  // Shift+Enter -> hard_break (only meaningful inside textblocks)
  if (schema.nodes.hard_break) {
    keys["Shift-Enter"] = (state: any, dispatch: any) => {
      const { $from } = state.selection
      if (!$from.parent.isTextblock) return false
      if (!dispatch) return true
      dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
      return true
    }
  }

  // Optional: Enter on empty heading could become paragraph, etc. (kept minimal for MVP)
  if (schema.nodes.paragraph) {
    keys["Mod-Alt-0"] = setBlockType(schema.nodes.paragraph)
  }

  return keymap(keys)
}

export const baseKeys = keymap(baseKeymap)


