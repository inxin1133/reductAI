/* eslint-disable @typescript-eslint/no-explicit-any */
import { keymap } from "prosemirror-keymap"
import { baseKeymap, chainCommands, setBlockType, toggleMark } from "prosemirror-commands"
import { undo, redo } from "prosemirror-history"
import { sinkListItem, liftListItem, splitListItem } from "prosemirror-schema-list"
import type { Schema } from "prosemirror-model"
import { NodeSelection, TextSelection } from "prosemirror-state"
import {
  addColumnAfter,
  addRowAfter,
  CellSelection,
  deleteColumn,
  deleteRow,
  nextCell,
  selectionCell,
} from "prosemirror-tables"

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

function childIndexAtPos(parent: any, pos: number): number | null {
  let cur = 0
  for (let i = 0; i < parent.childCount; i += 1) {
    if (cur === pos) return i
    cur += parent.child(i).nodeSize
  }
  return null
}

function childPosAtIndex(parent: any, index: number): number | null {
  if (index < 0 || index >= parent.childCount) return null
  let cur = 0
  for (let i = 0; i < index; i += 1) {
    cur += parent.child(i).nodeSize
  }
  return cur
}

function findTopLevelBlockRangeAtPos(doc: any, pos: number): { from: number; to: number } | null {
  const p = Math.max(0, Math.min(Number.isFinite(pos) ? pos : 0, doc.content.size))
  let last: { from: number; to: number } | null = null
  let found: { from: number; to: number } | null = null
  doc.forEach((node: any, offset: number) => {
    const from = offset
    const to = offset + node.nodeSize
    last = { from, to }
    if (!found && p >= from && p < to) found = { from, to }
  })
  return found || last
}

function restoreSelectionAfterMove(tr: any, sel: any, srcFrom: number, srcNode: any, insertPos: number) {
  const doc = tr.doc
  const clampAbs = (p: number) => Math.max(0, Math.min(Number(p || 0), doc.content.size))
  const maxInside = Math.max(1, Number(srcNode?.nodeSize || 2) - 1)

  const toInsideAbs = (rel: number) => {
    const r = Math.max(1, Math.min(maxInside, Number(rel || 1)))
    return clampAbs(insertPos + r)
  }

  try {
    if (sel instanceof NodeSelection) {
      return tr.setSelection(NodeSelection.create(doc, insertPos))
    }

    if (sel instanceof CellSelection) {
      const aRel = sel.$anchorCell.pos - srcFrom
      const hRel = sel.$headCell.pos - srcFrom
      try {
        return tr.setSelection(CellSelection.create(doc, insertPos + aRel, insertPos + hRel))
      } catch {
        // fall through
      }
    }

    const anchorAbs = typeof sel?.anchor === "number" ? sel.anchor : typeof sel?.from === "number" ? sel.from : srcFrom + 1
    const headAbs = typeof sel?.head === "number" ? sel.head : typeof sel?.to === "number" ? sel.to : anchorAbs
    const anchorRel = anchorAbs - srcFrom
    const headRel = headAbs - srcFrom
    const nextAnchorAbs = toInsideAbs(anchorRel)
    const nextHeadAbs = toInsideAbs(headRel)

    if (nextAnchorAbs !== nextHeadAbs) {
      return tr.setSelection(TextSelection.between(doc.resolve(nextAnchorAbs), doc.resolve(nextHeadAbs)))
    }
    return tr.setSelection(TextSelection.near(doc.resolve(nextAnchorAbs), 1))
  } catch {
    // ignore
  }
  return tr
}

function moveBlockBy(dir: -1 | 1, schema: Schema) {
  return (state: any, dispatch: any) => {
    const doc = state.doc
    const sel = state.selection
    const $from = sel?.$from

    // If we're inside a list item, move the list item within its parent list.
    const liType = schema.nodes.list_item
    if (liType && $from) {
      for (let d = $from.depth; d > 0; d -= 1) {
        const node = $from.node(d)
        if (!node || node.type !== liType) continue

        const itemFrom = $from.before(d)
        const parentDepth = d - 1
        const parentNode = $from.node(parentDepth)
        const parentStart = $from.start(parentDepth)
        const rel = itemFrom - parentStart
        const idx = childIndexAtPos(parentNode, rel)
        if (idx == null) return true

        const nextIdx = idx + dir
        if (nextIdx < 0 || nextIdx >= parentNode.childCount) return true

        const srcNode = doc.nodeAt(itemFrom)
        if (!srcNode) return true
        const srcFrom = itemFrom
        const srcTo = srcFrom + srcNode.nodeSize

        let dp: number
        if (dir < 0) {
          const prevPos = childPosAtIndex(parentNode, idx - 1)
          if (prevPos == null) return true
          dp = parentStart + prevPos
        } else {
          const nextPos = childPosAtIndex(parentNode, idx + 1)
          if (nextPos == null) return true
          const nextNode = parentNode.child(idx + 1)
          dp = parentStart + nextPos + nextNode.nodeSize
        }

        if (!dispatch) return true

        let tr = state.tr.delete(srcFrom, srcTo)
        const insertPos = tr.mapping.map(dp, dp > srcFrom ? -1 : 1)
        tr = tr.insert(insertPos, srcNode)
        tr = restoreSelectionAfterMove(tr, sel, srcFrom, srcNode, insertPos)
        dispatch(tr.scrollIntoView())
        return true
      }
    }

    // Otherwise, move the top-level block containing the selection.
    const range = findTopLevelBlockRangeAtPos(doc, typeof sel?.from === "number" ? sel.from : 0)
    if (!range) return false
    const srcFrom = range.from
    const srcNode = doc.nodeAt(srcFrom)
    if (!srcNode) return false

    const idx = childIndexAtPos(doc, srcFrom)
    if (idx == null) return false
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= doc.childCount) return true

    let dp: number
    if (dir < 0) {
      const prevPos = childPosAtIndex(doc, idx - 1)
      if (prevPos == null) return true
      dp = prevPos
    } else {
      const nextPos = childPosAtIndex(doc, idx + 1)
      if (nextPos == null) return true
      const nextNode = doc.child(idx + 1)
      dp = nextPos + nextNode.nodeSize
    }

    if (!dispatch) return true

    const srcTo = srcFrom + srcNode.nodeSize
    let tr = state.tr.delete(srcFrom, srcTo)
    const insertPos = tr.mapping.map(dp, dp > srcFrom ? -1 : 1)
    tr = tr.insert(insertPos, srcNode)
    tr = restoreSelectionAfterMove(tr, sel, srcFrom, srcNode, insertPos)
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

function liftListItemOnlyWhenEmptyAtStart(schema: Schema) {
  const li = schema.nodes.list_item
  if (!li) return () => false
  const lift = liftListItem(li)
  return (state: any, dispatch: any) => {
    const sel = state.selection
    if (!(sel instanceof TextSelection) || !sel.empty) return false
    const $from = sel.$from
    if (!$from) return false

    // Find containing list_item depth.
    let liDepth = -1
    for (let d = $from.depth; d > 0; d -= 1) {
      if ($from.node(d).type === li) {
        liDepth = d
        break
      }
    }
    if (liDepth < 0) return false

    // We only allow "unlist" when:
    // - cursor is inside the FIRST child textblock of the list_item (usually paragraph)
    // - cursor is at the start of that textblock
    // - and that textblock is empty (all text deleted)
    if ($from.depth !== liDepth + 1) return false
    if ($from.index(liDepth) !== 0) return false
    if (!$from.parent.isTextblock) return false
    if ($from.parentOffset !== 0) return false
    if ($from.parent.content.size !== 0) return false

    return lift(state, dispatch)
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

function exitCodeMarkOnSpace(schema: Schema) {
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
    const nextStored = Array.isArray(stored) ? stored.filter((m: any) => m.type !== code) : null
    let tr = state.tr.setStoredMarks(nextStored && nextStored.length ? nextStored : [])
    tr = tr.insertText(" ", $from.pos)
    tr = tr.removeMark($from.pos, $from.pos + 1, code).scrollIntoView()
    dispatch(tr)
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

    const codeText = parent.textBetween(fromOff, toOff, "\0", "\0")
    if (codeText.length > 1) return false

    if (!dispatch) return true
    const fromPos = parentStart + fromOff
    const toPos = parentStart + toOff
    let tr = state.tr
    // Delete the last character, then remove the mark and clear stored marks.
    if ($from.pos > fromPos) {
      tr = tr.delete($from.pos - 1, $from.pos)
    } else {
      tr = tr.delete(fromPos, toPos)
    }
    tr = tr.removeMark(fromPos, toPos, code).setStoredMarks(null)
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
    // Strikethrough
    "Shift-Mod-x": schema.marks.strike ? toggleMark(schema.marks.strike) : false,
    "Shift-Mod-s": schema.marks.strike ? toggleMark(schema.marks.strike) : false,

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

    // Block movement (Notion-like):
    // - Mod+Shift+ArrowUp / ArrowDown moves the current "block" up/down.
    // - Inside lists, moves the current list item within its list.
    "Mod-Shift-ArrowUp": moveBlockBy(-1, schema),
    "Mod-Shift-ArrowDown": moveBlockBy(1, schema),

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
    keys["Space"] = exitCodeMarkOnSpace(schema)
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
      liftListItemOnlyWhenEmptyAtStart(schema),
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

  // Mod+Enter: insert row below when cursor is inside a table cell
  keys["Mod-Enter"] = (state: any, dispatch: any) => {
    try {
      selectionCell(state)
    } catch {
      return false
    }
    return addRowAfter(state, dispatch)
  }

  // Mod+Backspace / Mod+Delete: delete current row when cursor is inside a table cell
  const deleteRowInTable = (state: any, dispatch: any) => {
    try {
      selectionCell(state)
    } catch {
      return false
    }
    return deleteRow(state, dispatch)
  }
  keys["Mod-Backspace"] = deleteRowInTable
  keys["Mod-Delete"] = deleteRowInTable

  // Mod+Shift+Enter: add column to the right when cursor is inside a table cell
  keys["Mod-Shift-Enter"] = (state: any, dispatch: any) => {
    try {
      selectionCell(state)
    } catch {
      return false
    }
    return addColumnAfter(state, dispatch)
  }

  // Mod+Shift+Backspace / Mod+Shift+Delete: delete current column when cursor is inside a table cell
  const deleteColumnInTable = (state: any, dispatch: any) => {
    try {
      selectionCell(state)
    } catch {
      return false
    }
    return deleteColumn(state, dispatch)
  }
  keys["Mod-Shift-Backspace"] = deleteColumnInTable
  keys["Mod-Shift-Delete"] = deleteColumnInTable

  // Optional: Enter on empty heading could become paragraph, etc. (kept minimal for MVP)
  if (schema.nodes.paragraph) {
    keys["Mod-Alt-0"] = setBlockType(schema.nodes.paragraph)
  }

  return keymap(keys)
}

export const baseKeys = keymap(baseKeymap)


