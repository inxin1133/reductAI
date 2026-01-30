import { Plugin, PluginKey } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import type { Schema } from "prosemirror-model"
import { getBlockCommandRegistry } from "../commands/blockCommandRegistry"

type SlashCmd = {
  key: string
  title: string
  keywords: string[]
  run: (view: EditorView, ctx: { from: number; to: number; query: string }) => void
}

type SlashState = {
  active: boolean
  query: string
  from: number
  to: number
  index: number
  items: SlashCmd[]
  dismissed: boolean
}

const key = new PluginKey<SlashState>("slashCommand")

function getTextBeforeCursorFromState(state: any, max = 80) {
  const { $from } = state.selection
  if (!$from.parent.isTextblock) return ""
  const start = Math.max(0, $from.parentOffset - max)
  return $from.parent.textBetween(start, $from.parentOffset, "\0", "\0")
}

function deleteSlashQuery(view: EditorView, from: number, to: number) {
  const { state, dispatch } = view
  const tr = state.tr.delete(from, to)
  dispatch(tr)
}

function makeCommands(schema: Schema): SlashCmd[] {
  const blocks = getBlockCommandRegistry(schema)
  return blocks.map((b) => ({
    key: b.key,
    title: b.title,
    keywords: b.keywords,
    run: (view, ctx) => {
      deleteSlashQuery(view, ctx.from, ctx.to)
      b.applyReplace(view)
    },
  }))
}

function filterCommands(all: SlashCmd[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return all
  return all.filter((c) => c.key.startsWith(q) || c.keywords.some((k) => k.startsWith(q)))
}

export function slashCommandPlugin(schema: Schema) {
  const all = makeCommands(schema)

  return new Plugin<SlashState>({
    key,
    state: {
      init: () => ({ active: false, query: "", from: 0, to: 0, index: 0, items: [], dismissed: false }),
      // Compute slash state from the *new* editorState. Avoid dispatching inside plugin view updates.
      apply: (tr, prev, _oldState, newState) => {
        const meta = tr.getMeta(key) as Partial<SlashState> | undefined
        let dismissed = prev.dismissed
        let index = prev.index

        if (meta?.dismissed !== undefined) dismissed = !!meta.dismissed
        if (meta?.index !== undefined) index = Number(meta.index) || 0

        // If the document changes, allow the menu to show again
        if (tr.docChanged) dismissed = false

        const $from = newState.selection.$from
        const isPara = $from.parent.type === newState.schema.nodes.paragraph
        if (!isPara || dismissed) {
          return { active: false, query: "", from: 0, to: 0, index: 0, items: [], dismissed }
        }

        const text = getTextBeforeCursorFromState(newState)
        // Allow IME composition and non-Latin characters by matching any non-space token.
        const m = text.match(/(?:^|\s)\/([^\s/]{0,30})$/u)
        if (!m) {
          return { active: false, query: "", from: 0, to: 0, index: 0, items: [], dismissed }
        }

        const query = (m[1] || "").toLowerCase()
        // Compute doc positions robustly based on parent offsets.
        // m[0] may include a leading whitespace from (?:^|\\s); we do NOT want to delete that whitespace.
        const matchLen = m[0].length
        const leadingSpaceAdjust = m[0].startsWith(" ") ? 1 : 0
        const to = $from.start() + $from.parentOffset
        const from = $from.start() + ($from.parentOffset - matchLen + leadingSpaceAdjust)

        const items = filterCommands(all, query)
        const clampedIndex = Math.min(Math.max(index, 0), Math.max(items.length - 1, 0))

        return { active: true, query, from, to, index: clampedIndex, items, dismissed }
      },
    },
    view: (view) => {
      let dom: HTMLDivElement | null = document.createElement("div")
      dom.className = "pm-slash-dropdown"
      dom.style.display = "none"
      dom.style.position = "absolute"
      dom.style.zIndex = "50"
      dom.style.minWidth = "220px"
      dom.style.background = "white"
      dom.style.border = "1px solid rgba(0,0,0,0.12)"
      dom.style.borderRadius = "10px"
      dom.style.boxShadow = "0 10px 28px rgba(0,0,0,0.14)"
      dom.style.padding = "6px"
      document.body.appendChild(dom)

      function render() {
        const st = key.getState(view.state) as SlashState
        if (!dom) return
        if (!st?.active) {
          dom.style.display = "none"
          return
        }

        const items = st.items || []
        dom.innerHTML =
          items.length === 0
            ? `<div style="padding:8px;color:rgba(0,0,0,0.5)">No results</div>`
            : items
                .map((it, i) => {
                  const active = i === st.index
                  return `<div data-i="${i}" style="padding:8px 10px;border-radius:8px;cursor:pointer;${
                    active ? "background:rgba(0,0,0,0.06);" : ""
                  }"><div style="font-size:13px;font-weight:700">${it.title}</div><div style="font-size:12px;color:rgba(0,0,0,0.55)">/${it.key}</div></div>`
                })
                .join("")

        // position to cursor
        const coords = view.coordsAtPos(st.to)
        dom.style.left = `${coords.left}px`
        dom.style.top = `${coords.bottom + 6}px`
        dom.style.display = "block"
      }

      function onClick(e: MouseEvent) {
        if (!dom) return
        const t = e.target as HTMLElement
        const itemEl = t.closest("[data-i]") as HTMLElement | null
        if (!itemEl) return
        const idx = parseInt(itemEl.getAttribute("data-i") || "0", 10)
        const st = key.getState(view.state) as SlashState
        const cmd = st.items[idx]
        if (!cmd) return
        cmd.run(view, { from: st.from, to: st.to, query: st.query })
        if (dom) dom.style.display = "none"
      }

      if (dom) dom.addEventListener("mousedown", (e) => e.preventDefault())
      if (dom) dom.addEventListener("click", onClick)

      render()

      return {
        update: () => render(),
        destroy: () => {
          if (dom) dom.removeEventListener("click", onClick)
          dom?.remove()
          dom = null
        },
      }
    },
    props: {
      handleKeyDown(view, event) {
        const st = key.getState(view.state) as SlashState
        if (!st?.active) return false

        if (event.key === "Escape") {
          // Dismiss until user types again (docChanged resets dismissed)
          event.preventDefault()
          view.dispatch(view.state.tr.setMeta(key, { dismissed: true }))
          return true
        }
        if (event.key === "ArrowDown") {
          event.preventDefault()
          const next = Math.min((st.index || 0) + 1, Math.max((st.items?.length || 1) - 1, 0))
          view.dispatch(view.state.tr.setMeta(key, { index: next }))
          return true
        }
        if (event.key === "ArrowUp") {
          event.preventDefault()
          const next = Math.max((st.index || 0) - 1, 0)
          view.dispatch(view.state.tr.setMeta(key, { index: next }))
          return true
        }
        if (event.key === "Enter") {
          const cmd = st.items?.[st.index || 0]
          if (!cmd) return false
          // Prevent keymaps/splitBlock from consuming Enter while the menu is open.
          event.preventDefault()
          // cmd.run() already deletes the slash query internally.
          cmd.run(view, { from: st.from, to: st.to, query: st.query })
          return true
        }
        return false
      },
    },
  })
}


