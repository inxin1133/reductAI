import { keymap } from "prosemirror-keymap"
import { baseKeymap, chainCommands, setBlockType, toggleMark } from "prosemirror-commands"
import { undo, redo } from "prosemirror-history"
import { sinkListItem, liftListItem, splitListItem } from "prosemirror-schema-list"
import type { Schema } from "prosemirror-model"
import { TextSelection } from "prosemirror-state"

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
  const keys: Record<string, any> = {
    "Mod-z": undo,
    "Mod-y": redo,
    "Shift-Mod-z": redo,

    // Formatting
    "Mod-b": schema.marks.strong ? toggleMark(schema.marks.strong) : false,
    "Mod-i": schema.marks.em ? toggleMark(schema.marks.em) : false,

    // List indent
    Tab: sinkListItem(schema.nodes.list_item),
    "Shift-Tab": liftListItem(schema.nodes.list_item),
  }

  // Code mark UX (inline `code`):
  keys["ArrowRight"] = chainCommands(exitCodeMarkOnArrowRight(schema), arrowRightBase)

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


