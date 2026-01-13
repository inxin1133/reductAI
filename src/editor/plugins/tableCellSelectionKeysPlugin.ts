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

const pluginKey = new PluginKey<SelModeState>("reductai:selection-mode")

function initState(): SelModeState {
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

function clearToCaretInBlock(state: any, view: any, blockPos: number) {
  const node = state.doc.nodeAt(blockPos)
  if (!node) return
  const inside = Math.min(blockPos + 1, blockPos + Math.max(1, node.nodeSize - 1))
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(inside), 1)).scrollIntoView())
}

function selectSingleBlock(state: any, view: any, blockPos: number) {
  view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, blockPos)).scrollIntoView())
}

function selectBlockRangeAsText(state: any, view: any, aPos: number, bPos: number) {
  const doc = state.doc as PMNode
  const aIdx = topLevelIndexAtPos(doc, aPos)
  const bIdx = topLevelIndexAtPos(doc, bPos)
  if (aIdx == null || bIdx == null) return false
  const fromIdx = Math.min(aIdx, bIdx)
  const toIdx = Math.max(aIdx, bIdx)
  const first = posAtTopLevelIndex(doc, fromIdx)
  const last = posAtTopLevelIndex(doc, toIdx)
  if (!first || !last) return false

  const fromInside = Math.min(first.pos + 1, doc.content.size)
  const toInside = Math.min(last.pos + Math.max(1, last.node.nodeSize - 1), doc.content.size)
  try {
    view.dispatch(state.tr.setSelection(TextSelection.between(doc.resolve(fromInside), doc.resolve(toInside))).scrollIntoView())
    return true
  } catch {
    // fallback
    selectSingleBlock(state, view, last.pos)
    return true
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
    key: pluginKey,
    state: {
      init: initState,
      apply(tr, prev) {
        const meta = tr.getMeta(pluginKey) as Partial<SelModeState> | undefined
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
          if (next.kind === "cell" && !(sel instanceof CellSelection)) return initState()
          if (next.kind === "block" && !(sel instanceof NodeSelection) && !(sel instanceof TextSelection)) return initState()
        }
        return next
      },
    },
    props: {
      decorations(state) {
        const st = pluginKey.getState(state) || initState()
        if (st.mode === 0 || st.kind !== "block") return null
        return buildBlockSelectionDecorations(state.doc as PMNode, st.anchorBlockPos, st.headBlockPos)
      },
      handleKeyDown(view, event) {
        const state = view.state
        const st = pluginKey.getState(state) || initState()
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

          const tr = state.tr.delete(from, to).setMeta(pluginKey, initState()).scrollIntoView()

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
              .setMeta(pluginKey, initState())
              .scrollIntoView()
            view.dispatch(tr)
            event.preventDefault()
            return true
          }
          if (st.kind === "block") {
            const headPos = st.headBlockPos ?? findTopLevelBlockAtSelection(state)?.pos
            if (headPos != null) clearToCaretInBlock(state, view, headPos)
            view.dispatch(state.tr.setMeta(pluginKey, initState()))
            event.preventDefault()
            return true
          }
          view.dispatch(state.tr.setMeta(pluginKey, initState()))
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
                .setMeta(pluginKey, initState())
                .scrollIntoView()
              view.dispatch(tr)
              event.preventDefault()
              return true
            }

            const sel = state.selection instanceof CellSelection ? state.selection : new CellSelection($cell)
            const tr = state.tr
              .setSelection(sel)
              .setMeta(pluginKey, {
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
            clearToCaretInBlock(state, view, st.headBlockPos ?? info.pos)
            view.dispatch(state.tr.setMeta(pluginKey, initState()))
            event.preventDefault()
            return true
          }

          // keep anchor when toggling 1 -> 2
          const anchorPos = st.mode === 0 ? info.pos : st.anchorBlockPos ?? info.pos
          selectSingleBlock(state, view, info.pos)
          view.dispatch(
            state.tr.setMeta(pluginKey, {
              mode: nextMode,
              kind: "block",
              anchorBlockPos: anchorPos,
              headBlockPos: info.pos,
              anchorCellPos: null,
              headCellPos: null,
            })
          )
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
            .setMeta(pluginKey, { ...st, anchorCellPos: nextAnchorPos, headCellPos: nextHeadPos })
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
            selectSingleBlock(state, view, next.pos)
            view.dispatch(state.tr.setMeta(pluginKey, { ...st, anchorBlockPos: next.pos, headBlockPos: next.pos }))
            event.preventDefault()
            return true
          }

          const anchor = st.anchorBlockPos ?? headPos
          const ok = selectBlockRangeAsText(state, view, anchor, next.pos)
          if (ok) {
            view.dispatch(state.tr.setMeta(pluginKey, { ...st, anchorBlockPos: anchor, headBlockPos: next.pos }))
            event.preventDefault()
            return true
          }
        }

        return false
      },
    },
  })
}

