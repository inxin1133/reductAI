import { Plugin, PluginKey } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"

type MentionItem = { id: string; label: string; type: "user" | "page" | "custom" }

const key = new PluginKey("mentionPlugin")

function getTextBeforeCursor(view: EditorView, max = 50) {
  const { state } = view
  const { $from } = state.selection
  if (!$from.parent.isTextblock) return ""
  const start = Math.max(0, $from.parentOffset - max)
  return $from.parent.textBetween(start, $from.parentOffset, "\0", "\0")
}

function defaultMockFetch(query: string): MentionItem[] {
  const q = query.toLowerCase()
  const pool: MentionItem[] = [
    { id: "u_1", label: "kangwoo", type: "user" },
    { id: "u_2", label: "admin", type: "user" },
    { id: "p_1", label: "Welcome Page", type: "page" },
  ]
  if (!q) return pool
  return pool.filter((i) => i.label.toLowerCase().includes(q))
}

function insertMention(view: EditorView, from: number, to: number, item: MentionItem) {
  const { state, dispatch } = view
  const node = state.schema.nodes.mention
  if (!node) return
  dispatch(state.tr.replaceWith(from, to, node.create(item)).scrollIntoView())
}

export function mentionPlugin(opts?: {
  fetchSuggestions?: (query: string) => Promise<MentionItem[]> | MentionItem[]
}) {
  const fetchSuggestions = opts?.fetchSuggestions || defaultMockFetch

  return new Plugin({
    key,
    state: {
      init: () => ({ active: false, query: "", from: 0, to: 0, index: 0, items: [] as MentionItem[] }),
      apply: (tr, prev) => {
        const meta = tr.getMeta(key)
        if (meta) return { ...prev, ...meta }
        if (tr.docChanged || tr.selectionSet) return { ...prev }
        return prev
      },
    },
    view: (view) => {
      let dom: HTMLDivElement | null = document.createElement("div")
      dom.className = "pm-mention-dropdown"
      dom.style.display = "none"
      dom.style.position = "absolute"
      dom.style.zIndex = "50"
      dom.style.minWidth = "180px"
      dom.style.background = "white"
      dom.style.border = "1px solid rgba(0,0,0,0.12)"
      dom.style.borderRadius = "8px"
      dom.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"
      dom.style.padding = "6px"
      document.body.appendChild(dom)

      async function updateDropdown() {
        const st = key.getState(view.state) as any
        const text = getTextBeforeCursor(view)
        const m = text.match(/(?:^|\s)@([a-zA-Z0-9_ -]{0,30})$/)
        if (!m) {
          if (dom) dom.style.display = "none"
          view.dispatch(view.state.tr.setMeta(key, { active: false }))
          return
        }

        const query = (m[1] || "").trim()
        const $from = view.state.selection.$from
        const to = $from.pos
        const from = to - m[0].length + (m[0].startsWith(" ") ? 1 : 0)

        const itemsRaw = await Promise.resolve(fetchSuggestions(query))
        const items = Array.isArray(itemsRaw) ? itemsRaw.slice(0, 8) : []
        const index = Math.min(st.index || 0, Math.max(items.length - 1, 0))
        view.dispatch(view.state.tr.setMeta(key, { active: true, query, from, to, items, index }))

        if (!dom) return
        if (items.length === 0) {
          dom.innerHTML = `<div style="padding:8px;color:rgba(0,0,0,0.5)">No results</div>`
        } else {
          dom.innerHTML = items
            .map((it, i) => {
              const active = i === index
              return `<div data-i="${i}" style="padding:6px 8px;border-radius:6px;cursor:pointer;${
                active ? "background:rgba(0,0,0,0.06);" : ""
              }"><div style="font-size:13px;font-weight:600">@${it.label}</div><div style="font-size:12px;color:rgba(0,0,0,0.55)">${it.type}</div></div>`
            })
            .join("")
        }

        const coords = view.coordsAtPos(to)
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
        const st = key.getState(view.state) as any
        const item = st.items?.[idx]
        if (!item) return
        insertMention(view, st.from, st.to, item)
        dom.style.display = "none"
        view.dispatch(view.state.tr.setMeta(key, { active: false }))
      }

      if (dom) dom.addEventListener("mousedown", (e) => e.preventDefault())
      if (dom) dom.addEventListener("click", onClick)

      updateDropdown()

      return {
        update: () => {
          updateDropdown()
        },
        destroy: () => {
          if (dom) dom.removeEventListener("click", onClick)
          dom?.remove()
          dom = null
        },
      }
    },
    props: {
      handleKeyDown(view, event) {
        const st = key.getState(view.state) as any
        if (!st?.active) return false

        if (event.key === "Escape") {
          view.dispatch(view.state.tr.setMeta(key, { active: false }))
          return true
        }
        if (event.key === "ArrowDown") {
          const next = Math.min((st.index || 0) + 1, Math.max((st.items?.length || 1) - 1, 0))
          view.dispatch(view.state.tr.setMeta(key, { index: next }))
          return true
        }
        if (event.key === "ArrowUp") {
          const next = Math.max((st.index || 0) - 1, 0)
          view.dispatch(view.state.tr.setMeta(key, { index: next }))
          return true
        }
        if (event.key === "Enter") {
          const item = st.items?.[st.index || 0]
          if (!item) return false
          insertMention(view, st.from, st.to, item)
          view.dispatch(view.state.tr.setMeta(key, { active: false }))
          return true
        }
        return false
      },
    },
  })
}


