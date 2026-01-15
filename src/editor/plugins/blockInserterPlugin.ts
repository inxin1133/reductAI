import { Plugin, PluginKey } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { Decoration, DecorationSet } from "prosemirror-view"
import type { Node as PMNode, Schema } from "prosemirror-model"
import { getBlockCommandRegistry, type BlockInsertSide } from "../commands/blockCommandRegistry"

export type BlockInserterState = {
  hover: boolean
  blockFrom: number
  blockTo: number
  menuOpen: boolean
  index: number
  query: string
  kind: "top" | "list_item" | "table_row"
  draggingId: string | null
  draggingPos: number | null
  dropPos: number | null
  placeholderHeight: number
  menuAnchor: { left: number; top: number; width: number; height: number } | null
  handleMenuOpen: boolean
  handleMenuAnchor: { left: number; top: number; width: number; height: number } | null
  handleMenuKind: "top" | "list_item" | "table_row" | null
  handleMenuFrom: number | null
  handleMenuTo: number | null
}

export const blockInserterKey = new PluginKey<BlockInserterState>("blockInserter")

function findTopLevelBlockRangeAtPos(view: EditorView, pos: number): { from: number; to: number } | null {
  const doc = view.state.doc
  const p = Math.max(0, Math.min(pos, doc.content.size))
  let last: { from: number; to: number } | null = null
  let found: { from: number; to: number } | null = null
  doc.forEach((node, offset) => {
    const from = offset
    const to = offset + node.nodeSize
    last = { from, to }
    if (!found && p >= from && p < to) found = { from, to }
  })
  if (found) return found
  // If cursor is at end, target the last block
  return last
}

function findKindedRangeAtPos(view: EditorView, pos: number, schema: Schema) {
  const doc = view.state.doc
  const p = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(p)

  // Table row drag inside table
  if (schema.nodes.table_row) {
    for (let d = $pos.depth; d > 0; d -= 1) {
      const n = $pos.node(d)
      if (n.type === schema.nodes.table_row) {
        return { kind: "table_row" as const, from: $pos.before(d), to: $pos.after(d) }
      }
    }
  }

  // List item drag inside lists
  if (schema.nodes.list_item) {
    for (let d = $pos.depth; d > 0; d -= 1) {
      const n = $pos.node(d)
      if (n.type === schema.nodes.list_item) {
        return { kind: "list_item" as const, from: $pos.before(d), to: $pos.after(d) }
      }
    }
  }

  const top = findTopLevelBlockRangeAtPos(view, p)
  if (!top) return null
  return { kind: "top" as const, from: top.from, to: top.to }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export function blockInserterPlugin(schema: Schema) {
  const commands = getBlockCommandRegistry(schema)

  return new Plugin<BlockInserterState>({
    key: blockInserterKey,
    state: {
      init: () => ({
        hover: false,
        blockFrom: 0,
        blockTo: 0,
        menuOpen: false,
        index: 0,
        query: "",
        kind: "top",
        draggingId: null,
        draggingPos: null,
        dropPos: null,
        placeholderHeight: 36,
        menuAnchor: null,
        handleMenuOpen: false,
        handleMenuAnchor: null,
        handleMenuKind: null,
        handleMenuFrom: null,
        handleMenuTo: null,
      }),
      apply: (tr, prev) => {
        const meta = tr.getMeta(blockInserterKey) as Partial<BlockInserterState> | undefined
        if (!meta) return prev
        return { ...prev, ...meta }
      },
    },
    props: {
      decorations(state) {
        const st = blockInserterKey.getState(state) as BlockInserterState
        const decos: Decoration[] = []

        if (st.draggingPos != null) {
          decos.push(Decoration.node(st.draggingPos, st.draggingPos + state.doc.nodeAt(st.draggingPos)!.nodeSize, { class: "pm-block-ghost" }))
        }
        // IMPORTANT: do NOT render a placeholder widget inside tables (it can look like an HR line / break layout).
        if (st.dropPos != null && st.kind !== "table_row") {
          const h = Math.max(20, Number(st.placeholderHeight || 36))
          decos.push(
            Decoration.widget(st.dropPos, () => {
              const el = document.createElement("div")
              el.className = "pm-drop-placeholder"
              el.style.height = `${h}px`
              return el
            })
          )
        }
        return DecorationSet.create(state.doc, decos)
      },
      handleDOMEvents: {
        mousemove: (view, event) => {
          const e = event as MouseEvent
          const target = e.target as Node | null
          if (!target) return false
          if (!view.dom.contains(target)) return false

          const st = blockInserterKey.getState(view.state) as BlockInserterState
          if (st.menuOpen) return false
          // While dragging, don't fight the drag loop with hover updates.
          if (st.draggingId) return false

          let pos = 0
          try {
            pos = view.posAtDOM(target as unknown as Node, 0)
          } catch {
            return false
          }
          const range = findKindedRangeAtPos(view, pos, schema)
          if (!range) return false

          if (st.hover && st.blockFrom === range.from && st.blockTo === range.to && st.kind === range.kind) return false
          view.dispatch(
            view.state.tr.setMeta(blockInserterKey, {
              hover: true,
              blockFrom: range.from,
              blockTo: range.to,
              kind: range.kind,
            })
          )
          return false
        },
      },
      handleKeyDown: (view, event) => {
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        if (!st.menuOpen) return false

        if (event.key === "Escape") {
          event.preventDefault()
          view.dispatch(view.state.tr.setMeta(blockInserterKey, { menuOpen: false, query: "", menuAnchor: null }))
          return true
        }
        return false
      },
    },
    view: (view) => {
      // Floating left rail (handle + + button)
      const rail = document.createElement("div")
      rail.className = "absolute z-60 flex items-center"
      // coordsAtPos()는 뷰포트 좌표를 반환하므로 rail은 뷰포트 기준 위치에 배치해야 합니다.
      // 스크롤 시에도 rail이 정렬을 유지하도록 fixed 포지셔닝을 사용합니다.
      rail.style.position = "fixed"
      rail.style.display = "none"
      document.body.appendChild(rail)

      // PERF: avoid layout thrash during typing by not measuring DOM every transaction.
      // These widths match the Tailwind classes below (w-[32px], w-[22px]).
      const PLUS_BTN_W = 32
      const HANDLE_W = 22
      const RAIL_GAP_W = 2 // small visual gap between buttons (if you add gap/margin in styles, update this)

      let lastLeft: number | null = null
      let lastTop: number | null = null
      let uiRaf: number | null = null
      let anchorSig: string | null = null
      let anchorRectCache: { left: number; top: number } | null = null

      
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "cursor-pointer bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground w-[32px] h-[32px] rounded-md flex items-center justify-center"
      // lucide-react: Plus (inline SVG)
      btn.innerHTML = `
        <span class="" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"></path>
            <path d="M12 5v14"></path>
          </svg>
        </span>
      `.trim()
      rail.appendChild(btn)

      const handle = document.createElement("button")
      handle.type = "button"
      handle.className = "cursor-grab active:cursor-grabbing bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground w-[22px] h-[32px] rounded-md flex items-center justify-center";
      handle.setAttribute("aria-label", "Block handle")
      // lucide-react: GripVertical (inline SVG)
      handle.innerHTML = `
        <span class="" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="5" r="1"></circle>
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="9" cy="19" r="1"></circle>
            <circle cx="15" cy="5" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="15" cy="19" r="1"></circle>
          </svg>
        </span>
      `.trim()
      handle.setAttribute("draggable", "true")
      rail.appendChild(handle)

      let overUI = false
      let hideTimer: number | null = null
      let clearHoverTimer: number | null = null
      let draggingId: string | null = null
      let dropPos: number | null = null
      let draggingKind: BlockInserterState["kind"] = "top"
      let draggingContainerId: string | null = null
      let placeholderHeight = 36

      // Drop line overlay (used for table_row drag, where inserting a widget into <table> is problematic) 
      // 드래그 중에 테이블 내부에 위젯을 삽입하는 문제를 방지하기 위해 사용되는 드롭 라인 오버레이입니다.
      const dropLine = document.createElement("div")
      dropLine.className = "pm-drop-line"
      dropLine.style.display = "none"
      document.body.appendChild(dropLine)

      function hideDropLine() {
        dropLine.style.display = "none"
      }
      function showDropLineAt(y: number) {
        const r = view.dom.getBoundingClientRect()
        dropLine.style.left = `${Math.round(r.left)}px`
        dropLine.style.top = `${Math.round(y)}px`
        dropLine.style.width = `${Math.round(r.width)}px`
        dropLine.style.display = "block"
      }

      // Throttle dragover -> dispatch(meta) so the editor doesn't feel frozen.
      let raf: number | null = null
      let pending: { dropPos: number | null; y: number | null } | null = null
      function flushDragMeta() {
        raf = null
        if (!pending) return
        const next = pending
        pending = null
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        if (st.dropPos === next.dropPos && st.placeholderHeight === placeholderHeight) return
        view.dispatch(view.state.tr.setMeta(blockInserterKey, { dropPos: next.dropPos, placeholderHeight }))
        if (draggingKind === "table_row" && next.y != null) showDropLineAt(next.y)
      }

      const clearDragUI = () => {
        if (raf) window.cancelAnimationFrame(raf)
        raf = null
        pending = null
        hideDropLine()
        view.dispatch(view.state.tr.setMeta(blockInserterKey, { draggingId: null, draggingPos: null, dropPos: null }))
      }

      function setOverUI(v: boolean) {
        overUI = v
        if (overUI) {
          if (hideTimer) window.clearTimeout(hideTimer)
          hideTimer = null
          if (clearHoverTimer) window.clearTimeout(clearHoverTimer)
          clearHoverTimer = null
          rail.style.display = "flex"
        } else {
          scheduleHideIfNeeded()
        }
      }

      function scheduleHideIfNeeded() {
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        if (st.menuOpen || st.handleMenuOpen) return
        if (st.hover) return
        if (overUI) return
        if (hideTimer) window.clearTimeout(hideTimer)
        hideTimer = window.setTimeout(() => {
          const st2 = blockInserterKey.getState(view.state) as BlockInserterState
          if (!st2.menuOpen && !st2.hover && !overUI) {
            rail.style.display = "none"
          }
        }, 220)
      }

      function positionButton(st: BlockInserterState) {
        if ((!st.hover && !overUI) && !st.menuOpen && !st.handleMenuOpen) {
          rail.style.display = "none"
          return
        }
        // For nested blocks (list items / table rows), show handle but hide "+" (inserter stays top-level for now)
        btn.style.display = st.kind === "top" ? "grid" : "none"

        // Anchor the rail to the *block container*, not the first text character.
        // This prevents overlap for list/code blocks where the text is indented.
        const sig = `${st.kind}:${st.blockFrom}:${btn.style.display}`
        if (sig !== anchorSig) {
          anchorSig = sig
          anchorRectCache = null
        }

        const doc = view.state.doc
        const safeFrom = clamp(st.blockFrom, 0, doc.content.size)
        const $from = doc.resolve(safeFrom)

        let anchorPos = safeFrom
        if (st.kind === "list_item") {
          // Cursor is inside a list item: anchor to the parent list (<ul>/<ol>) so the rail sits in the gutter.
          for (let d = $from.depth; d > 0; d -= 1) {
            const n = $from.node(d)
            if (n.type === schema.nodes.bullet_list || n.type === schema.nodes.ordered_list) {
              anchorPos = $from.before(d)
              break
            }
          }
        } else if (st.kind === "table_row") {
          // Anchor to the table wrapper instead of inside a row/cell.
          for (let d = $from.depth; d > 0; d -= 1) {
            const n = $from.node(d)
            if (n.type === schema.nodes.table) {
              anchorPos = $from.before(d)
              break
            }
          }
        }

        // Fast path for paragraphs: coordsAtPos is cheap and already aligns well.
        const anchorNode = view.state.doc.nodeAt(anchorPos)
        let anchorLeft = 0
        let anchorTop = 0

        if (st.kind === "top" && anchorNode?.type === schema.nodes.paragraph) {
          const coords = view.coordsAtPos(clamp(anchorPos + 1, 0, doc.content.size))
          anchorLeft = coords.left
          anchorTop = coords.top
        } else {
          // Cache DOM rect for the current anchor to avoid reflow on every keystroke.
          if (!anchorRectCache) {
            const domEl = view.nodeDOM(anchorPos) as HTMLElement | null
            const rect = domEl?.getBoundingClientRect()
            if (rect) {
              // For list anchors, top-of-<ul> can be slightly above the first row (especially with custom list item UIs).
              // Use the first <li> top when available to align "+ / handle" with the row content.
              if ((domEl?.tagName === "UL" || domEl?.tagName === "OL") && domEl.firstElementChild instanceof HTMLElement) {
                const liRect = domEl.firstElementChild.getBoundingClientRect()
                anchorRectCache = { left: rect.left, top: liRect.top }
              } else {
                anchorRectCache = { left: rect.left, top: rect.top }
              }
            }
          }
          if (anchorRectCache) {
            anchorLeft = anchorRectCache.left
            anchorTop = anchorRectCache.top
          } else {
            // Fallback: coordsAtPos (may be slightly inside content, but better than nothing)
            const coords = view.coordsAtPos(clamp(anchorPos + 1, 0, doc.content.size))
            anchorLeft = coords.left
            anchorTop = coords.top
          }
        }

        // Prevent the rail from covering the first characters: keep it in the left gutter.
        const railWidth = st.kind === "top" ? PLUS_BTN_W + HANDLE_W + RAIL_GAP_W : HANDLE_W
        const gapPx = 2
        const nextLeft = Math.max(8, Math.round(anchorLeft - railWidth - gapPx))
        const nextTop = Math.round(anchorTop - 6)

        // Minimize style writes (helps during fast typing)
        if (lastLeft !== nextLeft) {
          rail.style.left = `${nextLeft}px`
          lastLeft = nextLeft
        }
        if (lastTop !== nextTop) {
          rail.style.top = `${nextTop}px`
          lastTop = nextTop
        }
        rail.style.display = "flex"
      }

      function updateUI() {
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        positionButton(st)
      }

      // Throttle UI updates to animation frames to avoid stutter while typing.
      function scheduleUI() {
        if (uiRaf != null) return
        uiRaf = window.requestAnimationFrame(() => {
          uiRaf = null
          updateUI()
        })
      }

      function openMenu() {
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        const r = btn.getBoundingClientRect()
        view.dispatch(
          view.state.tr.setMeta(blockInserterKey, {
            menuOpen: true,
            index: 0,
            query: st.query || "",
            menuAnchor: { left: r.left, top: r.top, width: r.width, height: r.height },
          })
        )
        setOverUI(true)
        rail.style.display = "flex"
      }

      rail.addEventListener("mouseenter", () => setOverUI(true))
      rail.addEventListener("mouseleave", () => setOverUI(false))

      btn.addEventListener("mousedown", (e) => e.preventDefault())
      btn.addEventListener("click", (e) => {
        e.preventDefault()
        openMenu()
      })

      // Handle (6-dot) - for now, just prevent focus stealing
      // NOTE: don't preventDefault on mousedown here — it cancels native dragstart in some browsers.
      handle.addEventListener("mousedown", (e) => e.stopPropagation())
      handle.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        const range = findKindedRangeAtPos(view, st.blockFrom, schema)
        if (!range) return
        const rect = handle.getBoundingClientRect()
        view.dispatch(
          view.state.tr.setMeta(blockInserterKey, {
            handleMenuOpen: true,
            handleMenuAnchor: {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            handleMenuKind: range.kind,
            handleMenuFrom: range.from,
            handleMenuTo: range.to,
            menuOpen: false,
          })
        )
      })
      handle.addEventListener("dragstart", (e) => {
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        const range = findKindedRangeAtPos(view, st.blockFrom, schema)
        if (!range) return
        const node = view.state.doc.nodeAt(range.from)
        const attrs = (node?.attrs || {}) as { blockId?: string | null }
        const blockId = attrs.blockId || undefined
        if (!blockId) return
        draggingId = blockId
        draggingKind = range.kind
        draggingContainerId = null
        placeholderHeight = 36
        // Lock container from the SOURCE block so list/table items cannot jump across containers.
        if (draggingKind === "list_item" || draggingKind === "table_row") {
          draggingContainerId = parentContainerIdAt(range.from)
        }
        try {
          const dom = view.nodeDOM(range.from) as HTMLElement | null
          const rect = dom?.getBoundingClientRect()
          if (rect?.height) placeholderHeight = Math.max(24, Math.round(rect.height))
        } catch {
          // ignore
        }
        dropPos = null
        hideDropLine()
        view.dispatch(
          view.state.tr.setMeta(blockInserterKey, {
            draggingId,
            draggingPos: range.from,
            placeholderHeight,
            kind: range.kind,
          })
        )
        try {
          // IMPORTANT: do NOT put the UUID into text/plain, otherwise browsers may insert it into contenteditable on drop.
          // Use a custom mime type and keep text/plain empty to avoid stray text insertion.
          e.dataTransfer?.setData("application/x-reductai-blockid", blockId)
          e.dataTransfer?.setData("text/plain", "")
          e.dataTransfer!.effectAllowed = "move"
        } catch {
          // ignore
        }
      })
      handle.addEventListener("dragend", () => {
        draggingId = null
        dropPos = null
        draggingContainerId = null
        draggingKind = "top"
        clearDragUI()
        scheduleHideIfNeeded()
      })

      // React menu calls into the plugin to execute commands.
      function onRunMenu(e: Event) {
        const ce = e as CustomEvent<{ commandKey?: string; side?: BlockInsertSide }>
        const cmdKey = String(ce.detail?.commandKey || "")
        const side = (ce.detail?.side || "after") as BlockInsertSide
        if (!cmdKey) return
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        if (!st.menuOpen) return
        const cmd = commands.find((c) => c.key === cmdKey)
        if (!cmd) return
        view.dispatch(view.state.tr.setMeta(blockInserterKey, { menuOpen: false, query: "", menuAnchor: null }))
        cmd.applyInsert(view, { blockFrom: st.blockFrom, blockTo: st.blockTo, side })
      }
      window.addEventListener("reductai:block-inserter:run", onRunMenu as EventListener)

      // When the mouse leaves the editor AND the inserter UI, clear hover state so the rail can hide.
      function onDocMouseMove(e: MouseEvent) {
        const st = blockInserterKey.getState(view.state) as BlockInserterState
        if (st.menuOpen) return
        if (overUI) return
        const target = e.target as Node | null
        // Moving from editor -> rail: don't clear hover before mouseenter fires.
        if (target && rail.contains(target)) return
        if (target && view.dom.contains(target)) return
        if (!st.hover) return

        // UX: don't immediately clear hover when leaving the editor. Users often move the mouse
        // into the left gutter (empty space) before reaching the rail. Give a short grace period.
        if (clearHoverTimer) return
        clearHoverTimer = window.setTimeout(() => {
          clearHoverTimer = null
          const st2 = blockInserterKey.getState(view.state) as BlockInserterState
          if (st2.menuOpen) return
          if (overUI) return
          view.dispatch(view.state.tr.setMeta(blockInserterKey, { hover: false }))
          scheduleHideIfNeeded()
        }, 220)
      }
      document.addEventListener("mousemove", onDocMouseMove)

      // When the page scrolls, cached anchor rect becomes stale (rail is positioned fixed).
      function onScroll() {
        anchorRectCache = null
      }
      window.addEventListener("scroll", onScroll, true)

      function findInDocById(id: string): { from: number; to: number; node: PMNode } | null {
        const doc = view.state.doc
        let found: { from: number; to: number; node: PMNode } | null = null
        doc.descendants((node, pos) => {
          if (found) return false
          const attrs = (node.attrs || {}) as { blockId?: string | null }
          const bid = attrs.blockId
          if (bid && String(bid) === id) {
            found = { from: pos, to: pos + node.nodeSize, node }
            return false
          }
          return true
        })
        return found
      }

      function parentContainerIdAt(pos: number) {
        const $pos = view.state.doc.resolve(pos)
        if (draggingKind === "list_item") {
          for (let d = $pos.depth; d > 0; d -= 1) {
            const n = $pos.node(d)
            if (n.type === schema.nodes.bullet_list || n.type === schema.nodes.ordered_list) {
              const attrs = (n.attrs || {}) as { blockId?: string | null }
              return attrs.blockId ? String(attrs.blockId) : null
            }
          }
        }
        if (draggingKind === "table_row") {
          for (let d = $pos.depth; d > 0; d -= 1) {
            const n = $pos.node(d)
            if (n.type === schema.nodes.table) {
              const attrs = (n.attrs || {}) as { blockId?: string | null }
              return attrs.blockId ? String(attrs.blockId) : null
            }
          }
        }
        return null
      }

      function rangeFromDomForKind(el: Element, kind: BlockInserterState["kind"]): { from: number; to: number } | null {
        const pos = view.posAtDOM(el as unknown as Node, 0)
        const $pos = view.state.doc.resolve(pos)
        if (kind === "table_row" && schema.nodes.table_row) {
          for (let d = $pos.depth; d > 0; d -= 1) {
            if ($pos.node(d).type === schema.nodes.table_row) return { from: $pos.before(d), to: $pos.after(d) }
          }
        }
        if (kind === "list_item" && schema.nodes.list_item) {
          for (let d = $pos.depth; d > 0; d -= 1) {
            if ($pos.node(d).type === schema.nodes.list_item) return { from: $pos.before(d), to: $pos.after(d) }
          }
        }
        // top-level block: depth 1
        if ($pos.depth >= 1) return { from: $pos.before(1), to: $pos.after(1) }
        return null
      }

      function siblingElementsForTarget(kind: BlockInserterState["kind"], target: EventTarget | null) {
        const node = target as unknown as Node | null
        if (!node) return null
        const el: Element | null = node.nodeType === 1 ? (node as unknown as Element) : (node as Node).parentElement
        if (!el) return null
        if (kind === "table_row") {
          const row = el.closest("tr") as HTMLElement | null
          const tbody = row?.parentElement
          if (!tbody) return null
          const rows = Array.from(tbody.querySelectorAll(":scope > tr")) as HTMLElement[]
          return rows.length ? rows : null
        }
        if (kind === "list_item") {
          const li = el.closest("li") as HTMLElement | null
          const list = li?.parentElement
          if (!list) return null
          const items = Array.from(list.querySelectorAll(":scope > li")) as HTMLElement[]
          return items.length ? items : null
        }
        // top-level blocks: direct children of view.dom
        const kids = Array.from(view.dom.children) as HTMLElement[]
        return kids.length ? kids : null
      }

      function onDragOver(ev: DragEvent) {
        if (!draggingId) return
        ev.preventDefault()
        const siblings = siblingElementsForTarget(draggingKind, ev.target)
        if (!siblings) return

        // Decide boundary: between blocks only (avoid text/caret positions).
        let idx = siblings.length
        for (let i = 0; i < siblings.length; i += 1) {
          const r = siblings[i].getBoundingClientRect()
          const mid = (r.top + r.bottom) / 2
          if (ev.clientY < mid) {
            idx = i
            break
          }
        }

        // Compute candidate drop position from the chosen sibling boundary.
        const anchorEl = idx < siblings.length ? siblings[idx] : siblings[siblings.length - 1]
        const anchorRange = rangeFromDomForKind(anchorEl, draggingKind)
        if (!anchorRange) return

        // For list/table internal move: only within same container (lock to SOURCE container).
        if (draggingKind === "list_item" || draggingKind === "table_row") {
          const cid = parentContainerIdAt(anchorRange.from)
          if (!cid || (draggingContainerId && cid !== draggingContainerId)) {
            view.dispatch(view.state.tr.setMeta(blockInserterKey, { dropPos: null }))
            return
          }
        }

        const isBefore = idx < siblings.length
        const nextDropPos = isBefore ? anchorRange.from : anchorRange.to
        if (nextDropPos === dropPos) return
        dropPos = nextDropPos

        const rect = anchorEl.getBoundingClientRect()
        const y = isBefore ? rect.top - 1 : rect.bottom - 1

        // For table rows, use line overlay. For others, keep the placeholder (meta dispatch) behavior.
        if (draggingKind === "table_row") {
          pending = { dropPos, y }
        } else {
          hideDropLine()
          pending = { dropPos, y: null }
        }
        if (!raf) raf = window.requestAnimationFrame(flushDragMeta)
      }

      function onDrop(ev: DragEvent) {
        if (!draggingId) return
        ev.preventDefault()
        const id = draggingId
        draggingId = null
        clearDragUI()
        const dp = dropPos
        dropPos = null
        if (dp === null) return

        const src = findInDocById(id)
        if (!src) return

        // No-op: dropping into itself
        if (dp >= src.from && dp <= src.to) return

        const { state, dispatch } = view
        let tr = state.tr
        tr = tr.delete(src.from, src.to)
        const mapped = tr.mapping.map(dp, dp > src.from ? -1 : 1)
        tr = tr.insert(mapped, src.node).scrollIntoView()
        dispatch(tr)
        view.focus()
      }

      // Capture phase so we reliably intercept before the browser inserts dropped text.
      view.dom.addEventListener("dragover", onDragOver, true)
      view.dom.addEventListener("drop", onDrop, true)

      scheduleUI()

      return {
        update: () => scheduleUI(),
        destroy: () => {
          document.removeEventListener("mousemove", onDocMouseMove)
          view.dom.removeEventListener("dragover", onDragOver, true)
          view.dom.removeEventListener("drop", onDrop, true)
          window.removeEventListener("scroll", onScroll, true)
          window.removeEventListener("reductai:block-inserter:run", onRunMenu as EventListener)
          if (uiRaf != null) window.cancelAnimationFrame(uiRaf)
          rail.remove()
          dropLine.remove()
        },
      }
    },
  })
}


