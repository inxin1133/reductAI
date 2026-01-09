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
            const display = window.prompt("display? (link|embed)", "link") || "link"
            run(cmdInsertPageLink(editorSchema, { pageId, title, display }))
          }}
        >
          Page Link
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


