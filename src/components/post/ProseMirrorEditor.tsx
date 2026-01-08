import { useEffect, useMemo, useRef, useState } from "react"
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { DOMParser as PMDOMParser } from "prosemirror-model"

import { editorSchema } from "../../editor/schema"
import { buildEditorPlugins } from "../../editor/plugins"
import { PageLinkNodeView } from "../../editor/nodes/page_link_nodeview"
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

type Props = {
  initialDocJson?: any
  onChange?: (docJson: any) => void
}

function getEmptyDoc() {
  const wrap = document.createElement("div")
  wrap.innerHTML = "<p></p>"
  return PMDOMParser.fromSchema(editorSchema).parse(wrap)
}

export function ProseMirrorEditor({ initialDocJson, onChange }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  const [markdown, setMarkdown] = useState("")
  const [docJson, setDocJson] = useState<any>(initialDocJson || null)

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
        page_link: (node, view, getPos) => new PageLinkNodeView(node, view, getPos as any),
      },
      // NOTE:
      // ProseMirror can dispatch transactions during EditorView construction (e.g. plugin views).
      // If we close over `const view` here, it can hit TDZ ("Cannot access 'view' before initialization").
      // Use `this` instead.
      dispatchTransaction: function (this: EditorView, tr) {
        const next = this.state.apply(tr)
        this.updateState(next)

        const json = next.doc.toJSON()
        setDocJson(json)
        onChange?.(json)
        setMarkdown(exportMarkdown(editorSchema, next.doc))
      },
      attributes: {
        class: "pm-editor ProseMirror",
      },
    })
    viewRef.current = view

    // init derived views
    setMarkdown(exportMarkdown(editorSchema, doc))
    setDocJson(doc.toJSON())
    onChange?.(doc.toJSON())

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = (cmd: any) => {
    const view = viewRef.current
    if (!view) return
    cmd(view.state, view.dispatch, view)
    view.focus()
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
      <div className="flex flex-wrap gap-2 border rounded-md p-2 bg-background">
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdToggleBold(editorSchema))}>
          Bold
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdToggleItalic(editorSchema))}>
          Italic
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdToggleCodeMark(editorSchema))}>
          Code
        </button>
        <button className="px-2 py-1 border rounded" onClick={insertLink}>
          Link
        </button>

        <span className="mx-2 opacity-40">|</span>

        <button className="px-2 py-1 border rounded" onClick={() => run(cmdParagraph(editorSchema))}>
          P
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdHeading(editorSchema, 1))}>
          H1
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdHeading(editorSchema, 2))}>
          H2
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdHeading(editorSchema, 3))}>
          H3
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdBlockquote(editorSchema))}>
          Quote
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdDuplicateBlock(editorSchema))}>
          Duplicate Block
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdCodeBlock(editorSchema))}>
          Code Block
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdBulletList(editorSchema))}>
          Bullet
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdOrderedList(editorSchema))}>
          Ordered
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(cmdInsertHorizontalRule(editorSchema))}>
          HR
        </button>

        <span className="mx-2 opacity-40">|</span>

        <button
          className="px-2 py-1 border rounded"
          onClick={() => {
            const src = window.prompt("Image URL?", "https://")
            if (!src) return
            run(cmdInsertImage(editorSchema, { src }))
          }}
        >
          Image
        </button>
        <button
          className="px-2 py-1 border rounded"
          onClick={() => {
            const label = window.prompt("Mention label?", "kangwoo") || ""
            if (!label) return
            run(cmdInsertMention(editorSchema, { id: `mock_${label}`, label, type: "user" }))
          }}
        >
          Mention
        </button>
        <button
          className="px-2 py-1 border rounded"
          onClick={() => {
            const pageId = window.prompt("Target pageId (posts.id)?", "") || ""
            if (!pageId) return
            const title = window.prompt("Title (optional)", "") || ""
            const display = window.prompt("display? (link|embed)", "link") || "link"
            run(cmdInsertPageLink(editorSchema, { pageId, title, display }))
          }}
        >
          Page Link
        </button>

        <span className="mx-2 opacity-40">|</span>

        <button className="px-2 py-1 border rounded" onClick={() => run(tableCommands.addRowAfter)}>
          Row+
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(tableCommands.addColumnAfter)}>
          Col+
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(tableCommands.mergeCells)}>
          Merge
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(tableCommands.splitCell)}>
          Split
        </button>
        <button className="px-2 py-1 border rounded" onClick={() => run(tableCommands.deleteTable)}>
          Del Table
        </button>
      </div>

      <div className="mt-3 border rounded-md p-3 bg-white">
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


