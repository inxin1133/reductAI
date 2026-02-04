import type { Schema, Node as PMNode } from "prosemirror-model"
import type { EditorView } from "prosemirror-view"
import { wrapInList } from "prosemirror-schema-list"
import { TextSelection } from "prosemirror-state"
import { cmdBlockquote, cmdChecklist, cmdDuplicateBlock } from "./index"

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

async function requestImageSrc() {
  if (typeof window !== "undefined") {
    const picker = (window as unknown as { __reductaiPickImageSrc?: () => Promise<string> }).__reductaiPickImageSrc
    if (typeof picker === "function") {
      try {
        const src = await picker()
        if (src && src.trim()) return src.trim()
      } catch {
        // ignore and fallback to prompt
      }
    }
  }
  const src = typeof window !== "undefined" ? window.prompt("Image URL?", "https://") || "" : ""
  return src.trim()
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

function duplicateBlockRelative(view: EditorView, args: { blockFrom: number; blockTo: number; side: BlockInsertSide }) {
  const { state, dispatch } = view
  const node = state.doc.nodeAt(args.blockFrom)
  if (!node) return
  const insertPos = args.side === "before" ? args.blockFrom : args.blockTo + 1
  let tr = state.tr.insert(insertPos, node)

  // Place cursor inside the duplicated node if possible
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

const CODE_BLOCK_PREF_KEY = "reductai:code-block-settings"

function readCodeBlockPrefs(): { language?: string; wrap?: boolean; lineNumbers?: boolean } {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(CODE_BLOCK_PREF_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { language?: string; wrap?: boolean; lineNumbers?: boolean }
    if (!parsed || typeof parsed !== "object") return {}
    return parsed
  } catch {
    return {}
  }
}

function getCodeBlockDefaultAttrs() {
  const prefs = readCodeBlockPrefs()
  return {
    language: String(prefs.language || "plain"),
    wrap: prefs.wrap ?? true,
    lineNumbers: prefs.lineNumbers === true,
  }
}

function createEmptyCodeBlock(schema: Schema) {
  return schema.nodes.code_block.createAndFill(getCodeBlockDefaultAttrs())!
}

function createEmptyBlockquote(schema: Schema) {
  const blockquote = schema.nodes.blockquote
  const para = schema.nodes.paragraph
  if (!blockquote || !para) return null
  return blockquote.create(null, [para.createAndFill()!])
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

function createCheckList(schema: Schema) {
  const bullet = schema.nodes.bullet_list
  const item = schema.nodes.list_item
  const para = schema.nodes.paragraph
  if (!bullet || !item || !para) return null
  const li = item.create({ checked: false }, [para.createAndFill()!])
  return bullet.create({ listKind: "check" }, [li])
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
      title: "텍스트",
      keywords: ["text", "paragraph", "텍스트", "문장", "문단"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.paragraph),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyParagraph(schema) }),
    },
    {
      key: "h1",
      title: "제목1",
      keywords: ["h1", "heading", "H1", "제목1", "제목 1", "헤드라인1", "헤드라인 1"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.heading, { level: 1 }),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyHeading(schema, 1) }),
    },
    {
      key: "h2",
      title: "제목2",
      keywords: ["h2", "heading", "H2", "제목2", "제목 2", "헤드라인2", "헤드라인 2"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.heading, { level: 2 }),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyHeading(schema, 2) }),
    },
    {
      key: "h3",
      title: "제목3",
      keywords: ["h3", "heading", "H3", "제목3", "제목 3", "헤드라인3", "헤드라인 3"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.heading, { level: 3 }),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyHeading(schema, 3) }),
    },
    {
      key: "list",
      title: "글머리 기호 목록",
      keywords: ["list", "bullet", "ul", "글머리 기호 목록", "목록", "블릿", "리스트"],
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
      title: "번호 매기기 목록",
      keywords: ["ordered", "ol", "number", "번호", "번호매기기", "번호매기기 목록"],
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
      key: "checklist",
      title: "할 일 목록",
      keywords: ["check", "checklist", "todo", "task", "체크", "체크리스트", "할일", "작업"],
      applyReplace: (view) => {
        const cmd = cmdChecklist(schema)
        cmd(view.state, view.dispatch)
        view.focus()
      },
      applyInsert: (view, args) => {
        const node = createCheckList(schema)
        if (!node) return
        insertBlockRelative(view, { ...args, node })
      },
    },
    {
      key: "quote",
      title: "인용",
      keywords: ["quote", "blockquote", "인용"],
      applyReplace: (view) => {
        const cmd = cmdBlockquote(schema)
        cmd(view.state, view.dispatch)
        view.focus()
      },
      applyInsert: (view, args) => {
        const node = createEmptyBlockquote(schema)
        if (!node) return
        insertBlockRelative(view, { ...args, node })
      },
    },
    {
      key: "table",
      title: "표",
      keywords: ["table", "grid", "표", "테이블"],
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
      title: "구분선",
      keywords: ["divider", "hr", "horizontal", "구분선", "선"],
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
      title: "코드 블록",
      keywords: ["code", "codeblock", "코드", "코드블록"],
      applyReplace: (view) => setBlockTypeOnSelection(view, schema.nodes.code_block, getCodeBlockDefaultAttrs()),
      applyInsert: (view, args) =>
        insertBlockRelative(view, { ...args, node: createEmptyCodeBlock(schema) }),
    },
    {
      key: "image",
      title: "이미지",
      keywords: ["image", "img", "picture", "이미지"],
      applyReplace: (view) => {
        const img = schema.nodes.image
        if (!img) return
        void (async () => {
          const src = await requestImageSrc()
          if (!src) return
          replaceCurrentBlock(view, img.create({ src }))
        })()
      },
      applyInsert: (view, args) => {
        const img = schema.nodes.image
        if (!img) return
        void (async () => {
          const src = await requestImageSrc()
          if (!src) return
          insertBlockRelative(view, { ...args, node: img.create({ src }) })
        })()
      },
    },
    {
      key: "duplicate",
      title: "복제",
      keywords: ["duplicate", "copy", "duplicate block", "복제", "복사"],
      applyReplace: (view) => {
        const cmd = cmdDuplicateBlock(schema)
        cmd(view.state, view.dispatch)
        view.focus()
      },
      applyInsert: (view, args) => {
        duplicateBlockRelative(view, args)
      },
    },
    {
      key: "page",
      title: "페이지 추가",
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
    {
      key: "link",
      title: "링크(페이지)",
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
  ]
}


