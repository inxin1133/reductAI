import { Plugin, PluginKey } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import type { Schema } from "prosemirror-model"
import { wrapInList } from "prosemirror-schema-list"

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

function replaceCurrentBlock(view: EditorView, node: any) {
  const { state, dispatch } = view
  const { $from } = state.selection

  let depth = $from.depth
  while (depth > 0) {
    const n = $from.node(depth)
    if (n.isBlock && n.type.name !== "doc") break
    depth -= 1
  }
  if (depth <= 0) return

  const start = $from.before(depth)
  const end = $from.after(depth)
  const tr = state.tr.replaceWith(start, end, node)
  dispatch(tr.scrollIntoView())
}

function setBlockTypeOnSelection(view: EditorView, type: any, attrs?: Record<string, any>) {
  const { state, dispatch } = view
  const { from, to } = state.selection
  const tr = state.tr.setBlockType(from, to, type, attrs)
  dispatch(tr.scrollIntoView())
}

function insertTable2x2(view: EditorView, schema: Schema) {
  const table = schema.nodes.table
  const row = schema.nodes.table_row
  const cell = schema.nodes.table_cell
  const paragraph = schema.nodes.paragraph
  if (!table || !row || !cell || !paragraph) return

  const mkCell = () => cell.createAndFill(null, paragraph.createAndFill())!
  const mkRow = () => row.create(null, [mkCell(), mkCell()])
  const t = table.create(null, [mkRow(), mkRow()])

  replaceCurrentBlock(view, t)
}

function insertHr(view: EditorView, schema: Schema) {
  const hr = schema.nodes.horizontal_rule
  if (!hr) return
  replaceCurrentBlock(view, hr.create())
}

function insertImage(view: EditorView, schema: Schema) {
  const img = schema.nodes.image
  if (!img) return
  const src = window.prompt("Image URL?", "https://") || ""
  if (!src.trim()) return
  replaceCurrentBlock(view, img.create({ src: src.trim() }))
}

function insertPageLink(view: EditorView, schema: Schema) {
  const n = schema.nodes.page_link
  if (!n) return
  const pageId = window.prompt("Target pageId (posts.id)?", "") || ""
  if (!pageId.trim()) return
  const title = window.prompt("Title (optional)", "") || ""
  const display = window.prompt("display? (link|embed)", "link") || "link"
  replaceCurrentBlock(view, n.create({ pageId: pageId.trim(), title, display }))
}

function insertCodeBlock(view: EditorView, schema: Schema) {
  const cb = schema.nodes.code_block
  if (!cb) return
  setBlockTypeOnSelection(view, cb)
}

function wrapBulletList(view: EditorView, schema: Schema) {
  const cmd = wrapInList(schema.nodes.bullet_list)
  cmd(view.state, view.dispatch)
}

function makeCommands(schema: Schema): SlashCmd[] {
  return [
    {
      key: "text",
      title: "Text",
      keywords: ["text", "paragraph"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        setBlockTypeOnSelection(view, schema.nodes.paragraph)
      },
    },
    {
      key: "h1",
      title: "Heading 1",
      keywords: ["h1", "heading"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        setBlockTypeOnSelection(view, schema.nodes.heading, { level: 1 })
      },
    },
    {
      key: "h2",
      title: "Heading 2",
      keywords: ["h2", "heading"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        setBlockTypeOnSelection(view, schema.nodes.heading, { level: 2 })
      },
    },
    {
      key: "h3",
      title: "Heading 3",
      keywords: ["h3", "heading"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        setBlockTypeOnSelection(view, schema.nodes.heading, { level: 3 })
      },
    },
    {
      key: "list",
      title: "Bullet List",
      keywords: ["list", "bullet", "ul"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        wrapBulletList(view, schema)
      },
    },
    {
      key: "table",
      title: "Table (2x2)",
      keywords: ["table", "grid"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        insertTable2x2(view, schema)
      },
    },
    {
      key: "image",
      title: "Image",
      keywords: ["image", "img", "picture"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        insertImage(view, schema)
      },
    },
    {
      key: "divider",
      title: "Divider",
      keywords: ["divider", "hr", "horizontal"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        insertHr(view, schema)
      },
    },
    {
      key: "page",
      title: "Page Link",
      keywords: ["page", "link", "embed"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        insertPageLink(view, schema)
      },
    },
    {
      key: "code",
      title: "Code Block",
      keywords: ["code", "codeblock"],
      run: (view, ctx) => {
        deleteSlashQuery(view, ctx.from, ctx.to)
        insertCodeBlock(view, schema)
      },
    },
  ]
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
        const m = text.match(/(?:^|\s)\/([a-zA-Z0-9_-]{0,30})$/)
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
          view.dispatch(view.state.tr.setMeta(key, { dismissed: true }))
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
          const cmd = st.items?.[st.index || 0]
          if (!cmd) return false
          // Ensure we delete the slash query range before running the command.
          // (Some commands use view.state right away.)
          if (st.from < st.to) {
            const tr = view.state.tr.delete(st.from, st.to)
            view.dispatch(tr)
          }
          cmd.run(view, { from: st.from, to: st.to, query: st.query })
          return true
        }
        return false
      },
    },
  })
}


