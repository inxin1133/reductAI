import type { Schema, Node as PMNode } from "prosemirror-model"
import type { EditorView } from "prosemirror-view"
import { wrapInList } from "prosemirror-schema-list"
import { TextSelection } from "prosemirror-state"

export type BlockInsertSide = "before" | "after"

export type BlockCommand = {
  key: string
  title: string
  keywords: string[]
  /**
   * Slash-mode: convert/replace current block while keeping selection content when possible.
   * (Caller is responsible for deleting the "/query" text before calling this.)
   */
  applyReplace: (view: EditorView) => void
  /**
   * Mouse inserter: insert a new empty block relative to a target block range.
   */
  applyInsert: (view: EditorView, args: { blockFrom: number; blockTo: number; side: BlockInsertSide }) => void
}

function findNearestBlockRange(view: EditorView) {
  const { $from } = view.state.selection
  let depth = $from.depth
  while (depth > 0) {
    const n = $from.node(depth)
    if (n.isBlock && n.type.name !== "doc") break
    depth -= 1
  }
  if (depth <= 0) return null
  return { from: $from.before(depth), to: $from.after(depth) }
}

function insertBlockRelative(view: EditorView, args: { blockFrom: number; blockTo: number; side: BlockInsertSide; node: PMNode }) {
  const { state, dispatch } = view
  const insertPos = args.side === "before" ? args.blockFrom : args.blockTo + 1
  let tr = state.tr.insert(insertPos, args.node)

  // Place cursor inside the inserted node if possible
  const resolved = tr.doc.resolve(Math.min(insertPos + 1, tr.doc.content.size))
  tr = tr.setSelection(TextSelection.near(resolved, 1)).scrollIntoView()
  dispatch(tr)
  view.focus()
}

function replaceCurrentBlock(view: EditorView, node: PMNode) {
  const range = findNearestBlockRange(view)
  if (!range) return
  const { state, dispatch } = view
  const tr = state.tr.replaceWith(range.from, range.to, node).scrollIntoView()
  dispatch(tr)
  view.focus()
}

function setBlockTypeOnSelection(view: EditorView, type: any, attrs?: Record<string, any>) {
  const { state, dispatch } = view
  const { from, to } = state.selection
  const tr = state.tr.setBlockType(from, to, type, attrs).scrollIntoView()
  dispatch(tr)
  view.focus()
}

function createEmptyParagraph(schema: Schema) {
  return schema.nodes.paragraph.createAndFill()!
}

function createEmptyHeading(schema: Schema, level: 1 | 2 | 3) {
  return schema.nodes.heading.createAndFill({ level })!
}

function createEmptyCodeBlock(schema: Schema) {
  return schema.nodes.code_block.createAndFill({ language: "plain" })!
}

function createBulletList2(schema: Schema) {
  const bullet = schema.nodes.bullet_list
  const item = schema.nodes.list_item
  const para = schema.nodes.paragraph
  if (!bullet || !item || !para) return null
  const li = item.createAndFill(null, [para.createAndFill()!])!
  return bullet.create(null, [li])
}

function createOrderedList2(schema: Schema) {
  const ordered = schema.nodes.ordered_list
  const item = schema.nodes.list_item
  const para = schema.nodes.paragraph
  if (!ordered || !item || !para) return null
  const li = item.createAndFill(null, [para.createAndFill()!])!
  return ordered.create({ order: 1, listType: "1" }, [li])
}

function createTable2x2(schema: Schema) {
  const table = schema.nodes.table
  const row = schema.nodes.table_row
  const cell = schema.nodes.table_cell
  const paragraph = schema.nodes.paragraph
  if (!table || !row || !cell || !paragraph) return null
  const mkCell = () => cell.createAndFill(null, paragraph.createAndFill())!
  const mkRow = () => row.create(null, [mkCell(), mkCell()])
  return table.create(null, [mkRow(), mkRow()])
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  headers["Content-Type"] = "application/json"
  return headers
}

async function createNewPage(): Promise<{ id: string; title: string } | null> {
  try {
    const m = typeof window !== "undefined" ? window.location.pathname.match(/^\/posts\/([^/]+)\/edit/) : null
    const parent_id = m?.[1] && m[1] !== "new" ? m[1] : null
    // Extract category_id from URL query string so child pages inherit the parent's category
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null
    const category_id = urlParams?.get("category") || null
    const r = await fetch(`/api/posts`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New page", page_type: "page", status: "draft", visibility: "private", parent_id, category_id }),
    })
    if (!r.ok) return null
    const j = await r.json()
    const id = typeof j.id === "string" ? j.id : ""
    const title = typeof j.title === "string" ? j.title : "New page"
    if (!id) return null
    window.dispatchEvent(new CustomEvent("reductai:page-created", { detail: { postId: id, parent_id, title } }))
    return { id, title }
  } catch {
    return null
  }
}

export function getBlockCommandRegistry(schema: Schema): BlockCommand[] {
  return [
    {
      key: "text",
      title: "Text",
      keywords: ["text", "paragraph"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.paragraph),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyParagraph(schema) }),
    },
    {
      key: "h1",
      title: "Heading 1",
      keywords: ["h1", "heading"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.heading, { level: 1 }),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyHeading(schema, 1) }),
    },
    {
      key: "h2",
      title: "Heading 2",
      keywords: ["h2", "heading"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.heading, { level: 2 }),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyHeading(schema, 2) }),
    },
    {
      key: "h3",
      title: "Heading 3",
      keywords: ["h3", "heading"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.heading, { level: 3 }),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyHeading(schema, 3) }),
    },
    {
      key: "list",
      title: "Bullet List",
      keywords: ["list", "bullet", "ul"],
      applyReplace: (view) => {
        const cmd = wrapInList(schema.nodes.bullet_list)
        cmd(view.state, view.dispatch, view)
        view.focus()
      },
      applyInsert: (view, args) => {
        const node = createBulletList2(schema)
        if (!node) return
        insertBlockRelative(view, { ...args, node })
      },
    },
    {
      key: "ordered",
      title: "Ordered List",
      keywords: ["ordered", "ol", "number"],
      applyReplace: (view) => {
        const cmd = wrapInList(schema.nodes.ordered_list)
        cmd(view.state, view.dispatch, view)
        view.focus()
      },
      applyInsert: (view, args) => {
        const node = createOrderedList2(schema)
        if (!node) return
        insertBlockRelative(view, { ...args, node })
      },
    },
    {
      key: "table",
      title: "Table (2x2)",
      keywords: ["table", "grid"],
      applyReplace: (view) => {
        const t = createTable2x2(schema)
        if (!t) return
        replaceCurrentBlock(view, t)
      },
      applyInsert: (view, args) => {
        const t = createTable2x2(schema)
        if (!t) return
        insertBlockRelative(view, { ...args, node: t })
      },
    },
    {
      key: "divider",
      title: "Divider",
      keywords: ["divider", "hr", "horizontal"],
      applyReplace: (view) => {
        const hr = schema.nodes.horizontal_rule
        if (!hr) return
        replaceCurrentBlock(view, hr.create())
      },
      applyInsert: (view, args) => {
        const hr = schema.nodes.horizontal_rule
        if (!hr) return
        insertBlockRelative(view, { ...args, node: hr.create() })
      },
    },
    {
      key: "code",
      title: "Code Block",
      keywords: ["code", "codeblock"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.code_block),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyCodeBlock(schema) }),
    },
    {
      key: "image",
      title: "Image",
      keywords: ["image", "img", "picture"],
      applyReplace: (view) => {
        const img = schema.nodes.image
        if (!img) return
        const src = window.prompt("Image URL?", "https://") || ""
        if (!src.trim()) return
        replaceCurrentBlock(view, img.create({ src: src.trim() }))
      },
      applyInsert: (view, args) => {
        const img = schema.nodes.image
        if (!img) return
        const src = window.prompt("Image URL?", "https://") || ""
        if (!src.trim()) return
        insertBlockRelative(view, { ...args, node: img.create({ src: src.trim() }) })
      },
    },
    {
      key: "link",
      title: "Page Link",
      keywords: ["link", "링크"],
      applyReplace: () => {
        // Open page link picker via event (handled by ProseMirrorEditor)
        window.dispatchEvent(new CustomEvent("reductai:open-page-link-picker", { detail: { display: "link" } }))
      },
      applyInsert: () => {
        // Open page link picker via event (handled by ProseMirrorEditor)
        window.dispatchEvent(new CustomEvent("reductai:open-page-link-picker", { detail: { display: "link" } }))
      },
    },
    {
      key: "page",
      title: "New Page",
      keywords: ["page", "new", "페이지", "새 페이지"],
      applyReplace: (view) => {
        const n = schema.nodes.page_link
        if (!n) return
        void (async () => {
          const created = await createNewPage()
          if (!created) return
          // Always leave a visible "title + link" in the parent page.
          replaceCurrentBlock(view, n.create({ pageId: created.id, title: created.title || "New page", display: "embed" }))
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("reductai:open-post", { detail: { postId: created.id, focusTitle: true, forceSave: true } })
            )
          }, 0)
        })()
      },
      applyInsert: (view, args) => {
        const n = schema.nodes.page_link
        if (!n) return
        void (async () => {
          const created = await createNewPage()
          if (!created) return
          insertBlockRelative(view, {
            ...args,
            node: n.create({ pageId: created.id, title: created.title || "New page", display: "embed" }),
          })
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("reductai:open-post", { detail: { postId: created.id, focusTitle: true, forceSave: true } })
            )
          }, 0)
        })()
      },
    },
  ]
}


