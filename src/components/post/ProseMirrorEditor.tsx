import { useEffect, useMemo, useRef, useState } from "react"
import { EditorState, type Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { DOMParser as PMDOMParser } from "prosemirror-model"

import { editorSchema } from "../../editor/schema"
import { buildEditorPlugins } from "../../editor/plugins"
import { PageLinkNodeView } from "../../editor/nodes/page_link_nodeview"
import { CodeBlockNodeView } from "../../editor/nodes/code_block_nodeview"
import {
  cmdBlockquote,
  cmdBulletList,
  cmdCodeBlock,
  cmdHeading,
  cmdDuplicateBlock,
  cmdInsertImage,
  cmdInsertMention,
  cmdInsertPageLink,
  cmdInsertHorizontalRule,
  cmdOrderedList,
  cmdParagraph,
  cmdToggleBold,
  cmdToggleCodeMark,
  cmdToggleItalic,
  tableCommands,
} from "../../editor/commands"
import { exportMarkdown } from "../../editor/serializers/markdown"

type PmDocJson = unknown
type PmCommand = (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => boolean

type Props = {
  initialDocJson?: PmDocJson
  onChange?: (docJson: PmDocJson) => void
}

function getEmptyDoc() {
  const wrap = document.createElement("div")
  wrap.innerHTML = "<p></p>"
  return PMDOMParser.fromSchema(editorSchema).parse(wrap)
}

export function ProseMirrorEditor({ initialDocJson, onChange }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const embedIdsRef = useRef<Set<string>>(new Set())

  const [markdown, setMarkdown] = useState("")
  const [docJson, setDocJson] = useState<PmDocJson>(initialDocJson ?? null)

  const plugins = useMemo(() => buildEditorPlugins(editorSchema, { mention: { enabled: true } }), [])

  useEffect(() => {
    if (!mountRef.current) return
    if (viewRef.current) return

    const doc =
      initialDocJson && typeof initialDocJson === "object"
        ? editorSchema.nodeFromJSON(initialDocJson)
        : getEmptyDoc()

    const state = EditorState.create({
      schema: editorSchema,
      doc,
      plugins,
    })

    const view = new EditorView(mountRef.current, {
      state,
      nodeViews: {
        page_link: (node, view, getPos) => new PageLinkNodeView(node, view, getPos as () => number),
        code_block: (node, view, getPos) => new CodeBlockNodeView(node, view, getPos as () => number),
      },
      // NOTE:
      // ProseMirror can dispatch transactions during EditorView construction (e.g. plugin views).
      // If we close over `const view` here, it can hit TDZ ("Cannot access 'view' before initialization").
      // Use `this` instead.
      dispatchTransaction: function (this: EditorView, tr) {
        // IMPORTANT:
        // Use applyTransaction (not apply) so plugin appendTransaction hooks run.
        // This is required for normalization plugins (e.g. listStylePlugin).
        const result = this.state.applyTransaction(tr)
        const nextState = result.state
        this.updateState(nextState)

        // Detect removed embed blocks (page_link with display=embed) so we can soft-delete the underlying child pages.
        // This is an optimistic UX layer; server also enforces deletion on save.
        const nextEmbedIds = new Set<string>()
        nextState.doc.descendants((node) => {
          if (node.type === editorSchema.nodes.page_link) {
            const attrs = (node.attrs || {}) as Record<string, unknown>
            const display = typeof attrs.display === "string" ? attrs.display : ""
            const pageId = typeof attrs.pageId === "string" ? attrs.pageId : ""
            if (display === "embed" && pageId) nextEmbedIds.add(pageId)
          }
          return true
        })
        const removed: string[] = []
        const added: string[] = []
        for (const pid of embedIdsRef.current) {
          if (!nextEmbedIds.has(pid)) removed.push(pid)
        }
        for (const pid of nextEmbedIds) {
          if (!embedIdsRef.current.has(pid)) added.push(pid)
        }
        if (removed.length) {
          window.dispatchEvent(new CustomEvent("reductai:embed-removed", { detail: { pageIds: removed } }))
        }
        if (added.length) {
          window.dispatchEvent(new CustomEvent("reductai:embed-added", { detail: { pageIds: added } }))
        }
        embedIdsRef.current = nextEmbedIds

        const json = nextState.doc.toJSON()
        setDocJson(json)
        onChange?.(json)
        setMarkdown(exportMarkdown(editorSchema, nextState.doc))
      },
      attributes: {
        class: "pm-editor ProseMirror",
      },
    })
    viewRef.current = view

    // Initialize embed id set from initial doc so first deletion is tracked correctly.
    const initEmbeds = new Set<string>()
    view.state.doc.descendants((node) => {
      if (node.type === editorSchema.nodes.page_link) {
        const attrs = (node.attrs || {}) as Record<string, unknown>
        const display = typeof attrs.display === "string" ? attrs.display : ""
        const pageId = typeof attrs.pageId === "string" ? attrs.pageId : ""
        if (display === "embed" && pageId) initEmbeds.add(pageId)
      }
      return true
    })
    embedIdsRef.current = initEmbeds

    // When a page title changes elsewhere (e.g., editing child page title), update any embed/link blocks
    // that reference that pageId so the parent page shows the latest title automatically.
    const onTitleUpdated = (e: Event) => {
      const ce = e as CustomEvent<{ postId?: string; title?: string }>
      const pageId = String(ce.detail?.postId || "")
      const nextTitle = String(ce.detail?.title || "")
      if (!pageId || !nextTitle) return
      const v = viewRef.current
      if (!v) return

      let tr = v.state.tr
      let changed = false
      v.state.doc.descendants((node, pos) => {
        if (node.type === editorSchema.nodes.page_link) {
          const attrs = (node.attrs || {}) as Record<string, unknown>
          const curPageId = typeof attrs.pageId === "string" ? attrs.pageId : ""
          const curTitle = typeof attrs.title === "string" ? attrs.title : ""
          if (curPageId === pageId && curTitle !== nextTitle) {
            tr = tr.setNodeMarkup(pos, undefined, { ...(attrs as Record<string, unknown>), title: nextTitle })
            changed = true
          }
        }
        return true
      })
      if (changed) v.dispatch(tr)
    }
    window.addEventListener("reductai:page-title-updated", onTitleUpdated as EventListener)

    // init derived views
    setMarkdown(exportMarkdown(editorSchema, doc))
    setDocJson(doc.toJSON())
    onChange?.(doc.toJSON())

    return () => {
      window.removeEventListener("reductai:page-title-updated", onTitleUpdated as EventListener)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = (cmd: PmCommand) => {
    const view = viewRef.current
    if (!view) return
    cmd(view.state, view.dispatch, view)
    view.focus()
  }

  const runFromToolbar = (e: React.MouseEvent, cmd: PmCommand) => {
    // Prevent toolbar click from stealing focus/selection from the editor.
    e.preventDefault()
    run(cmd)
  }

  const insertLink = () => {
    const view = viewRef.current
    if (!view) return
    const href = window.prompt("Link URL?", "https://")
    if (!href) return
    const { state, dispatch } = view
    const mark = editorSchema.marks.link.create({ href })
    dispatch(state.tr.addMark(state.selection.from, state.selection.to, mark))
    view.focus()
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 border rounded-md p-2">
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdToggleBold(editorSchema))}>
          Bold
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdToggleItalic(editorSchema))}>
          Italic
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdToggleCodeMark(editorSchema))}>
          Code
        </button>
        <button
          className="px-2 py-1 border rounded"
          onMouseDown={(e) => {
            e.preventDefault()
            insertLink()
          }}
        >
          Link
        </button>

        <span className="mx-2 opacity-40">|</span>

        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdParagraph(editorSchema))}>
          P
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdHeading(editorSchema, 1))}>
          H1
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdHeading(editorSchema, 2))}>
          H2
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdHeading(editorSchema, 3))}>
          H3
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdBlockquote(editorSchema))}>
          Quote
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdDuplicateBlock(editorSchema))}>
          Duplicate Block
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdCodeBlock(editorSchema))}>
          Code Block
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdBulletList(editorSchema))}>
          Bullet
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdOrderedList(editorSchema))}>
          Ordered
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, cmdInsertHorizontalRule(editorSchema))}>
          HR
        </button>

        <span className="mx-2 opacity-40">|</span>

        <button
          className="px-2 py-1 border rounded"
          onMouseDown={(e) => {
            e.preventDefault()
            const src = window.prompt("Image URL?", "https://")
            if (!src) return
            run(cmdInsertImage(editorSchema, { src }))
          }}
        >
          Image
        </button>
        <button
          className="px-2 py-1 border rounded"
          onMouseDown={(e) => {
            e.preventDefault()
            const label = window.prompt("Mention label?", "kangwoo") || ""
            if (!label) return
            run(cmdInsertMention(editorSchema, { id: `mock_${label}`, label, type: "user" }))
          }}
        >
          Mention
        </button>
        <button
          className="px-2 py-1 border rounded"
          onMouseDown={(e) => {
            e.preventDefault()
            const pageId = window.prompt("Target pageId (posts.id)?", "") || ""
            if (!pageId) return
            const title = window.prompt("Title (optional)", "") || ""
            run(cmdInsertPageLink(editorSchema, { pageId, title, display: "link" }))
          }}
        >
          Page Link
        </button>
        <button
          className="px-2 py-1 border rounded"
          onMouseDown={(e) => {
            e.preventDefault()
            const token = localStorage.getItem("token")
            if (!token) return
            void (async () => {
              const m = window.location.pathname.match(/^\/posts\/([^/]+)\/edit/)
              const parent_id = m?.[1] && m[1] !== "new" ? m[1] : null
              const r = await fetch(`/api/posts`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ title: "New page", page_type: "page", status: "draft", visibility: "private", parent_id }),
              })
              if (!r.ok) return
              const j = await r.json()
              const pageId = typeof j.id === "string" ? j.id : ""
              if (!pageId) return
              window.dispatchEvent(new CustomEvent("reductai:page-created", { detail: { postId: pageId, parent_id, title: "New page" } }))
              // Always leave a visible "title + link" in the parent page.
              run(cmdInsertPageLink(editorSchema, { pageId, title: "New page", display: "embed" }))
              window.dispatchEvent(
                new CustomEvent("reductai:open-post", { detail: { postId: pageId, focusTitle: true, forceSave: true } })
              )
            })()
          }}
        >
          Page Embed
        </button>

        <span className="mx-2 opacity-40">|</span>

        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, tableCommands.addRowAfter)}>
          Row+
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, tableCommands.addColumnAfter)}>
          Col+
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, tableCommands.mergeCells)}>
          Merge
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, tableCommands.splitCell)}>
          Split
        </button>
        <button className="px-2 py-1 border rounded" onMouseDown={(e) => runFromToolbar(e, tableCommands.deleteTable)}>
          Del Table
        </button>
      </div>

      {/* Editor surface: use theme-aware background for dark mode - 블럭 에디터  */}
      <div className="mt-3 p-3 bg-background text-foreground">
        <div ref={mountRef} />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-semibold mb-2">docJson</div>
          <pre className="text-xs whitespace-pre-wrap border rounded-md p-3 bg-muted max-h-[320px] overflow-auto">
            {JSON.stringify(docJson, null, 2)}
          </pre>
        </div>
        <div>
          <div className="text-sm font-semibold mb-2">Markdown (export)</div>
          <pre className="text-xs whitespace-pre-wrap border rounded-md p-3 bg-muted max-h-[320px] overflow-auto">
            {markdown}
          </pre>
        </div>
      </div>
    </div>
  )
}


