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

const SLASH_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: "텍스트",
    keys: ["text", "h1", "h2", "h3", "quote", "divider", "code", "list", "ordered", "checklist", "link", "page", "emoji"],
  },
  { title: "미디어", keys: ["image"] },
  { title: "표", keys: ["table"] },
]

const KEY_ORDER = new Map(
  SLASH_GROUPS.flatMap((g) => g.keys.map((k, i) => [k, i] as const))
)
const GROUP_ORDER = new Map(
  SLASH_GROUPS.flatMap((g, i) => g.keys.map((k) => [k, i] as const))
)

function getModKeyLabel() {
  if (typeof navigator === "undefined") return "Ctrl"
  const platform = navigator.platform || ""
  const ua = navigator.userAgent || ""
  const isMac = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua)
  return isMac ? "⌘" : "Ctrl"
}

const SHORTCUTS: Record<string, string | (() => string)> = {
  h1: "#",
  h2: "##",
  h3: "###",
  quote: "\"",
  divider: "---",
  list: "-",
  ordered: "1.",
  checklist: "[]",
  code: "```",
  emoji: () => `${getModKeyLabel()}+J`,
}

const ICON_HTML: Record<string, string> = {
  text: `<span style="font-weight:700;font-size:12px;">T</span>`,
  h1: `<span style="font-weight:700;font-size:11px;">H1</span>`,
  h2: `<span style="font-weight:700;font-size:11px;">H2</span>`,
  h3: `<span style="font-weight:700;font-size:11px;">H3</span>`,
  quote: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V7H3z"/><path d="M14 21c3 0 7-1 7-8V7h-7z"/></svg>`,
  divider: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`,
  list: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>`,
  ordered: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 12h2"/><path d="M4 18h2"/></svg>`,
  checklist: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 2 2 4-4"/><path d="M10 6h11"/><path d="m3 12 2 2 4-4"/><path d="M10 12h11"/><path d="m3 18 2 2 4-4"/><path d="M10 18h11"/></svg>`,
  code: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  image: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  table: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`,
  link: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  page: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  emoji: `<span style="font-size:14px;line-height:1;">😊</span>`,
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case "\"":
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return m
    }
  })
}

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
  const blocks = getBlockCommandRegistry(schema).filter((b) => b.key !== "duplicate")
  const base = blocks.map((b) => ({
    key: b.key,
    title: b.title,
    keywords: b.keywords,
    run: (view, ctx) => {
      deleteSlashQuery(view, ctx.from, ctx.to)
      b.applyReplace(view)
    },
  }))
  return [
    ...base,
    {
      key: "emoji",
      title: "이모지",
      keywords: ["emoji", "이모지", "emote", "emotes"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        if (typeof window === "undefined") return
        window.dispatchEvent(new CustomEvent("reductai:open-inline-emoji-picker"))
      },
    },
  ]
}

function sortByGroups(items: SlashCmd[]) {
  const withIndex = items.map((item, idx) => ({ item, idx }))
  withIndex.sort((a, b) => {
    const ga = GROUP_ORDER.get(a.item.key) ?? 99
    const gb = GROUP_ORDER.get(b.item.key) ?? 99
    if (ga !== gb) return ga - gb
    const ka = KEY_ORDER.get(a.item.key) ?? 99
    const kb = KEY_ORDER.get(b.item.key) ?? 99
    if (ka !== kb) return ka - kb
    return a.idx - b.idx
  })
  return withIndex.map((it) => it.item)
}

function filterCommands(all: SlashCmd[], query: string) {
  const q = query.trim().toLowerCase()
  const filtered = !q
    ? all
    : all.filter((c) => c.key.startsWith(q) || c.keywords.some((k) => k.startsWith(q)))
  return sortByGroups(filtered)
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
        if (items.length === 0) {
          dom.innerHTML = `<div style="padding:8px;color:rgba(0,0,0,0.5)">No results</div>`
          return
        }
        const indexByKey = new Map(items.map((it, i) => [it.key, i]))
        const grouped = SLASH_GROUPS.map((g) => ({
          title: g.title,
          items: items.filter((it) => g.keys.includes(it.key)),
        })).filter((g) => g.items.length > 0)
        const other = items.filter((it) => !GROUP_ORDER.has(it.key))
        if (other.length) grouped.push({ title: "기타", items: other })

        const renderItem = (it: SlashCmd) => {
          const i = indexByKey.get(it.key) ?? 0
          const active = i === st.index
          const icon = ICON_HTML[it.key] || `<span style="font-weight:700;font-size:11px;">•</span>`
          const shortcut = SHORTCUTS[it.key]
          const shortcutLabel = typeof shortcut === "function" ? shortcut() : shortcut
          return `<div data-i="${i}" style="padding:8px 10px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;${
            active ? "background:rgba(0,0,0,0.06);" : ""
          }">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:rgba(0,0,0,0.6)">${icon}</span>
              <div style="font-size:13px;font-weight:600">${escapeHtml(it.title)}</div>
            </div>
            ${shortcutLabel ? `<div style="font-size:11px;color:rgba(0,0,0,0.5);font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${escapeHtml(shortcutLabel)}</div>` : ""}
          </div>`
        }

        dom.innerHTML = grouped
          .map((group, idx) => {
            const header = `<div style="padding:6px 10px 4px;font-size:11px;font-weight:600;color:rgba(0,0,0,0.5)">${escapeHtml(
              group.title
            )}</div>`
            const body = group.items.map(renderItem).join("")
            const sep = idx < grouped.length - 1 ? `<div style="height:1px;margin:6px 0;background:rgba(0,0,0,0.06)"></div>` : ""
            return `<div>${header}${body}${sep}</div>`
          })
          .join("")

        // position to cursor
        const coords = view.coordsAtPos(st.to)
        dom.style.left = `${coords.left}px`
        dom.style.display = "block"

        // Flip menu upward when near the viewport bottom
        const margin = 6
        const menuHeight = dom.offsetHeight || 0
        const spaceBelow = window.innerHeight - coords.bottom - margin
        const spaceAbove = coords.top - margin
        if (menuHeight && spaceBelow < menuHeight && spaceAbove > spaceBelow) {
          const top = Math.max(8, coords.top - menuHeight - margin)
          dom.style.top = `${top}px`
        } else {
          dom.style.top = `${coords.bottom + margin}px`
        }
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


