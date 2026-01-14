import { Plugin, PluginKey, NodeSelection, TextSelection } from "prosemirror-state"
import type { Node as PMNode } from "prosemirror-model"
import { CellSelection, nextCell, selectionCell } from "prosemirror-tables"
import { Decoration, DecorationSet } from "prosemirror-view"

type Mode = 0 | 1 | 2 // 0=off, 1=move, 2=expand
type Kind = "cell" | "block" | null

type SelModeState = {
  mode: Mode
  kind: Kind
  // Table anchor/head (cell resolved positions)
  anchorCellPos: number | null
  headCellPos: number | null
  // Block anchor/head (top-level block positions, pos BEFORE the node)
  anchorBlockPos: number | null
  headBlockPos: number | null
}

export const selectionModePluginKey = new PluginKey<SelModeState>("reductai:selection-mode")

export function selectionModeInitState(): SelModeState {
  return { mode: 0, kind: null, anchorCellPos: null, headCellPos: null, anchorBlockPos: null, headBlockPos: null }
}

function mapPos(mapping: any, pos: number | null) {
  if (pos == null) return null
  try {
    return mapping.map(pos)
  } catch {
    return pos
  }
}

function findTopLevelBlockAtSelection(state: any): { pos: number; node: PMNode; index: number } | null {
  // If we're on a NodeSelection at top-level, $from.depth can be 0 (loop below won't run).
  // Handle this explicitly so F5 mode toggling works when a whole block is selected.
  const sel = state.selection
  if (sel instanceof NodeSelection) {
    const pos = sel.from
    const node = sel.node as PMNode
    if (node?.isBlock) {
      const idx = topLevelIndexAtPos(state.doc as PMNode, pos)
      if (idx != null) return { pos, node, index: idx }
    }
  }

  const $from = state.selection?.$from
  if (!$from) return null
  for (let d = $from.depth; d > 0; d -= 1) {
    const node = $from.node(d)
    const parent = $from.node(d - 1)
    if (!node || !node.isBlock) continue
    if (!parent || parent.type.name !== "doc") continue
    const pos = $from.before(d)
    const index = $from.index(d - 1)
    return { pos, node, index }
  }
  return null
}

function posAtTopLevelIndex(doc: PMNode, index: number): { pos: number; node: PMNode } | null {
  if (index < 0 || index >= doc.childCount) return null
  let pos = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i)
    if (i === index) return { pos, node: child }
    pos += child.nodeSize
  }
  return null
}

function topLevelIndexAtPos(doc: PMNode, pos: number): number | null {
  let cur = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    if (cur === pos) return i
    cur += doc.child(i).nodeSize
  }
  return null
}

function selectionNearInsideBlock(doc: PMNode, blockPos: number) {
  const node = doc.nodeAt(blockPos)
  if (!node) return null
  const inside = Math.min(blockPos + 1, blockPos + Math.max(1, node.nodeSize - 1))
  try {
    return TextSelection.near(doc.resolve(inside), 1)
  } catch {
    return null
  }
}

function nodeSelectionAtTopLevel(doc: PMNode, blockPos: number) {
  try {
    return NodeSelection.create(doc, blockPos)
  } catch {
    return null
  }
}

function selectionForBlockRange(doc: PMNode, aPos: number, bPos: number) {
  const aIdx = topLevelIndexAtPos(doc, aPos)
  const bIdx = topLevelIndexAtPos(doc, bPos)
  if (aIdx == null || bIdx == null) return null
  const fromIdx = Math.min(aIdx, bIdx)
  const toIdx = Math.max(aIdx, bIdx)
  const first = posAtTopLevelIndex(doc, fromIdx)
  const last = posAtTopLevelIndex(doc, toIdx)
  if (!first || !last) return null

  const fromInside = Math.min(first.pos + 1, doc.content.size)
  const toInside = Math.min(last.pos + Math.max(1, last.node.nodeSize - 1), doc.content.size)
  try {
    return TextSelection.between(doc.resolve(fromInside), doc.resolve(toInside))
  } catch {
    // fallback
    return nodeSelectionAtTopLevel(doc, last.pos)
  }
}

function buildBlockSelectionDecorations(doc: PMNode, anchorPos: number | null, headPos: number | null) {
  if (anchorPos == null || headPos == null) return DecorationSet.empty
  const aIdx = topLevelIndexAtPos(doc, anchorPos)
  const bIdx = topLevelIndexAtPos(doc, headPos)
  if (aIdx == null || bIdx == null) return DecorationSet.empty
  const fromIdx = Math.min(aIdx, bIdx)
  const toIdx = Math.max(aIdx, bIdx)
  const headIdx = bIdx

  const decos: Decoration[] = []
  let pos = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i)
    if (i >= fromIdx && i <= toIdx) {
      const cls = i === headIdx ? "pm-block-selected pm-block-selected-head" : "pm-block-selected"
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }))
    }
    pos += node.nodeSize
  }
  return DecorationSet.create(doc, decos)
}

/**
 * F5 selection mode state machine:
 * - mode 0: normal
 * - mode 1: Arrow moves selection (single cell / single block)
 * - mode 2: Arrow expands selection; also Shift+Arrow expands in mode 1
 * - cycle: F5: 0 -> 1 -> 2 -> 0 (same as Escape on the final step)
 *
 * Must run BEFORE prosemirror-tables tableEditing(), otherwise CellSelection collapses on Arrow.
 */
export function tableCellSelectionKeysPlugin() {
  return new Plugin<SelModeState>({
    key: selectionModePluginKey,
    state: {
      init: selectionModeInitState,
      apply(tr, prev) {
        const meta = tr.getMeta(selectionModePluginKey) as Partial<SelModeState> | undefined
        let next = meta ? ({ ...prev, ...meta } as SelModeState) : prev
        if (tr.docChanged) {
          next = {
            ...next,
            anchorCellPos: mapPos(tr.mapping, next.anchorCellPos),
            headCellPos: mapPos(tr.mapping, next.headCellPos),
            anchorBlockPos: mapPos(tr.mapping, next.anchorBlockPos),
            headBlockPos: mapPos(tr.mapping, next.headBlockPos),
          }
        }
        if (next.mode !== 0) {
          // if selection no longer matches our kind, reset
          const sel = tr.selection
          if (next.kind === "cell" && !(sel instanceof CellSelection)) return selectionModeInitState()
          if (next.kind === "block" && !(sel instanceof NodeSelection) && !(sel instanceof TextSelection)) return selectionModeInitState()
        }
        return next
      },
    },
    props: {
      handleDOMEvents: {
        copy(view, event) {
          const state = view.state
          const st = selectionModePluginKey.getState(state) || selectionModeInitState()
          if (st.mode === 0) return false

          const serializeForClipboard = (view as any).serializeForClipboard as
            | ((slice: any) => { dom: HTMLElement; text: string })
            | undefined
          if (!serializeForClipboard) return false

          const e = event as any
          const data = e?.clipboardData
          if (!data) return false

          // Table cell selection: copy currently selected cells (works via selection slice)
          if (st.kind === "cell" && state.selection instanceof CellSelection) {
            const slice = state.selection.content()
            const { dom, text } = serializeForClipboard(slice)
            event.preventDefault()
            try {
              data.setData("text/plain", text || "")
              data.setData("text/html", dom?.innerHTML || "")
            } catch {
              // ignore clipboard failures
            }
            return true
          }

          // Block selection: copy based on our anchor/head even when selection is just a single NodeSelection.
          if (st.kind === "block") {
            const doc = state.doc as PMNode
            const aPos = st.anchorBlockPos
            const hPos = st.headBlockPos
            if (aPos == null || hPos == null) return false

            const aIdx = topLevelIndexAtPos(doc, aPos)
            const hIdx = topLevelIndexAtPos(doc, hPos)
            if (aIdx == null || hIdx == null) return false

            const fromIdx = Math.min(aIdx, hIdx)
            const toIdx = Math.max(aIdx, hIdx)
            const first = posAtTopLevelIndex(doc, fromIdx)
            const last = posAtTopLevelIndex(doc, toIdx)
            if (!first || !last) return false

            const from = first.pos
            const to = last.pos + last.node.nodeSize
            if (to <= from) return false

            const slice = state.doc.slice(from, to)
            const { dom, text } = serializeForClipboard(slice)
            event.preventDefault()
            try {
              data.setData("text/plain", text || "")
              data.setData("text/html", dom?.innerHTML || "")
            } catch {
              // ignore clipboard failures
            }
            return true
          }

          return false
        },

        cut(view, event) {
          const state = view.state
          const st = selectionModePluginKey.getState(state) || selectionModeInitState()
          if (st.mode === 0) return false

          const serializeForClipboard = (view as any).serializeForClipboard as
            | ((slice: any) => { dom: HTMLElement; text: string })
            | undefined
          if (!serializeForClipboard) return false

          const e = event as any
          const data = e?.clipboardData
          if (!data) return false

          // Table cell selection: copy selection, then delete selection contents.
          if (st.kind === "cell" && state.selection instanceof CellSelection) {
            const slice = state.selection.content()
            const { dom, text } = serializeForClipboard(slice)
            event.preventDefault()
            try {
              data.setData("text/plain", text || "")
              data.setData("text/html", dom?.innerHTML || "")
            } catch {
              // ignore clipboard failures
            }
            if (view.editable) {
              const tr = state.tr.deleteSelection().setMeta(selectionModePluginKey, selectionModeInitState()).scrollIntoView()
              view.dispatch(tr)
            }
            return true
          }

          // Block selection: copy our block-range slice, then delete the blocks (like Delete key).
          if (st.kind === "block") {
            const doc = state.doc as PMNode
            const aPos = st.anchorBlockPos
            const hPos = st.headBlockPos
            if (aPos == null || hPos == null) return false

            const aIdx = topLevelIndexAtPos(doc, aPos)
            const hIdx = topLevelIndexAtPos(doc, hPos)
            if (aIdx == null || hIdx == null) return false

            const fromIdx = Math.min(aIdx, hIdx)
            const toIdx = Math.max(aIdx, hIdx)
            const first = posAtTopLevelIndex(doc, fromIdx)
            const last = posAtTopLevelIndex(doc, toIdx)
            if (!first || !last) return false

            const from = first.pos
            const to = last.pos + last.node.nodeSize
            if (to <= from) return false

            const slice = state.doc.slice(from, to)
            const { dom, text } = serializeForClipboard(slice)
            event.preventDefault()
            try {
              data.setData("text/plain", text || "")
              data.setData("text/html", dom?.innerHTML || "")
            } catch {
              // ignore clipboard failures
            }

            if (view.editable) {
              const tr = state.tr.delete(from, to).setMeta(selectionModePluginKey, selectionModeInitState()).scrollIntoView()
              // Place caret near the deletion point (best-effort).
              const safe = Math.min(from, tr.doc.content.size)
              try {
                tr.setSelection(TextSelection.near(tr.doc.resolve(safe), -1))
              } catch {
                // ignore
              }
              view.dispatch(tr)
            }
            return true
          }

          return false
        },
      },
      decorations(state) {
        const st = selectionModePluginKey.getState(state) || selectionModeInitState()
        if (st.mode === 0 || st.kind !== "block") return null
        return buildBlockSelectionDecorations(state.doc as PMNode, st.anchorBlockPos, st.headBlockPos)
      },
      handleKeyDown(view, event) {
        const state = view.state
        const st = selectionModePluginKey.getState(state) || selectionModeInitState()
        const k = event.key

        // Delete selected blocks when we're in block selection mode.
        if ((k === "Backspace" || k === "Delete") && st.mode !== 0 && st.kind === "block") {
          const doc = state.doc as PMNode
          const aPos = st.anchorBlockPos
          const hPos = st.headBlockPos
          if (aPos == null || hPos == null) return false
          const aIdx = topLevelIndexAtPos(doc, aPos)
          const hIdx = topLevelIndexAtPos(doc, hPos)
          if (aIdx == null || hIdx == null) return false

          const fromIdx = Math.min(aIdx, hIdx)
          const toIdx = Math.max(aIdx, hIdx)
          const first = posAtTopLevelIndex(doc, fromIdx)
          const last = posAtTopLevelIndex(doc, toIdx)
          if (!first || !last) return false

          const from = first.pos
          const to = last.pos + last.node.nodeSize

          const tr = state.tr.delete(from, to).setMeta(selectionModePluginKey, selectionModeInitState()).scrollIntoView()

          // Place caret near the deletion point (best-effort).
          const safe = Math.min(from, tr.doc.content.size)
          try {
            tr.setSelection(TextSelection.near(tr.doc.resolve(safe), -1))
          } catch {
            // ignore
          }

          view.dispatch(tr)
          event.preventDefault()
          return true
        }

        // Escape: clear selection mode (both cell & block)
        if (k === "Escape") {
          if (st.mode === 0) return false
          if (st.kind === "cell" && st.headCellPos != null) {
            const inside = Math.min(st.headCellPos + 1, state.doc.content.size)
            const tr = state.tr
              .setSelection(TextSelection.near(state.doc.resolve(inside), 1))
              .setMeta(selectionModePluginKey, selectionModeInitState())
              .scrollIntoView()
            view.dispatch(tr)
            event.preventDefault()
            return true
          }
          if (st.kind === "block") {
            const headPos = st.headBlockPos ?? findTopLevelBlockAtSelection(state)?.pos
            if (headPos != null) {
              const sel = selectionNearInsideBlock(state.doc as PMNode, headPos)
              const tr = state.tr
                .setSelection(sel || state.selection)
                .setMeta(selectionModePluginKey, selectionModeInitState())
                .scrollIntoView()
              view.dispatch(tr)
            } else {
              view.dispatch(state.tr.setMeta(selectionModePluginKey, selectionModeInitState()))
            }
            event.preventDefault()
            return true
          }
          view.dispatch(state.tr.setMeta(selectionModePluginKey, selectionModeInitState()))
          event.preventDefault()
          return true
        }

        // F5 cycles modes; also enters selection mode in table or outside (block)
        if (k === "F5") {
          // Try table first
          try {
            const $cell = selectionCell(state)
            const cellPos = $cell.pos
            const nextMode: Mode = st.mode === 0 ? 1 : st.mode === 1 ? 2 : 0

            if (nextMode === 0) {
              const tr = state.tr
                .setSelection(TextSelection.near(state.doc.resolve(Math.min(cellPos + 1, state.doc.content.size)), 1))
                .setMeta(selectionModePluginKey, selectionModeInitState())
                .scrollIntoView()
              view.dispatch(tr)
              event.preventDefault()
              return true
            }

            const sel = state.selection instanceof CellSelection ? state.selection : new CellSelection($cell)
            const tr = state.tr
              .setSelection(sel)
              .setMeta(selectionModePluginKey, {
                mode: nextMode,
                kind: "cell",
                anchorCellPos: sel.$anchorCell.pos,
                headCellPos: sel.$headCell.pos,
                anchorBlockPos: null,
                headBlockPos: null,
              })
              .scrollIntoView()
            view.dispatch(tr)
            event.preventDefault()
            return true
          } catch {
            // not in table
          }

          // Block mode (top-level block)
          const info = findTopLevelBlockAtSelection(state)
          if (!info) return false

          const nextMode: Mode = st.mode === 0 ? 1 : st.mode === 1 ? 2 : 0
          if (nextMode === 0) {
            const headPos = st.headBlockPos ?? info.pos
            const sel = selectionNearInsideBlock(state.doc as PMNode, headPos)
            const tr = state.tr
              .setSelection(sel || state.selection)
              .setMeta(selectionModePluginKey, selectionModeInitState())
              .scrollIntoView()
            view.dispatch(tr)
            event.preventDefault()
            return true
          }

          // keep anchor when toggling 1 -> 2
          const anchorPos = st.mode === 0 ? info.pos : st.anchorBlockPos ?? info.pos
          const sel = nodeSelectionAtTopLevel(state.doc as PMNode, info.pos)
          const tr = state.tr
            .setSelection(sel || state.selection)
            .setMeta(selectionModePluginKey, {
              mode: nextMode,
              kind: "block",
              anchorBlockPos: anchorPos,
              headBlockPos: info.pos,
              anchorCellPos: null,
              headCellPos: null,
            })
            .scrollIntoView()
          view.dispatch(tr)
          event.preventDefault()
          return true
        }

        // Arrow keys only matter when mode is active
        if (st.mode === 0) return false
        const isArrow = k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown"
        if (!isArrow) return false

        const expand = Boolean(event.shiftKey) || st.mode === 2

        // Table: move/expand cell selection
        if (st.kind === "cell" && state.selection instanceof CellSelection) {
          let axis: "horiz" | "vert"
          let dir: -1 | 1
          if (k === "ArrowLeft") {
            axis = "horiz"
            dir = -1
          } else if (k === "ArrowRight") {
            axis = "horiz"
            dir = 1
          } else if (k === "ArrowUp") {
            axis = "vert"
            dir = -1
          } else {
            axis = "vert"
            dir = 1
          }

          const curAnchor = state.selection.$anchorCell
          const curHead = state.selection.$headCell
          const from = expand ? curHead : curHead
          const base = expand ? curHead : curHead
          void from
          void base
          const $next = nextCell(curHead, axis, dir)
          if (!$next) return false

          const nextSel = expand ? new CellSelection(curAnchor, $next) : new CellSelection($next)
          const nextAnchorPos = expand ? curAnchor.pos : $next.pos
          const nextHeadPos = $next.pos

          const tr = state.tr
            .setSelection(nextSel)
            .setMeta(selectionModePluginKey, { ...st, anchorCellPos: nextAnchorPos, headCellPos: nextHeadPos })
            .scrollIntoView()
          view.dispatch(tr)
          event.preventDefault()
          return true
        }

        // Block: move/expand selection between top-level blocks
        if (st.kind === "block") {
          const headPos = st.headBlockPos ?? findTopLevelBlockAtSelection(state)?.pos
          if (headPos == null) return false
          const headIdx = topLevelIndexAtPos(state.doc, headPos)
          if (headIdx == null) return false

          // Treat Left/Up as previous, Right/Down as next
          const delta = k === "ArrowLeft" || k === "ArrowUp" ? -1 : 1
          const next = posAtTopLevelIndex(state.doc, headIdx + delta)
          if (!next) return false

          if (!expand) {
            const sel = nodeSelectionAtTopLevel(state.doc as PMNode, next.pos)
            const tr = state.tr
              .setSelection(sel || state.selection)
              .setMeta(selectionModePluginKey, { ...st, anchorBlockPos: next.pos, headBlockPos: next.pos })
              .scrollIntoView()
            view.dispatch(tr)
            event.preventDefault()
            return true
          }

          const anchor = st.anchorBlockPos ?? headPos
          const sel = selectionForBlockRange(state.doc as PMNode, anchor, next.pos)
          if (!sel) return false
          const tr = state.tr
            .setSelection(sel)
            .setMeta(selectionModePluginKey, { ...st, anchorBlockPos: anchor, headBlockPos: next.pos })
            .scrollIntoView()
          view.dispatch(tr)
          event.preventDefault()
          return true
        }

        return false
      },
    },
  })
}

