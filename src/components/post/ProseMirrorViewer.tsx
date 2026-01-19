import * as React from "react"
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { DOMParser as PMDOMParser } from "prosemirror-model"
import { cn } from "@/lib/utils"
import { editorSchema } from "@/editor/schema"
import { PageLinkNodeView } from "@/editor/nodes/page_link_nodeview"
import { CodeBlockNodeView } from "@/editor/nodes/code_block_nodeview"
import { ListItemNodeView } from "@/editor/nodes/list_item_nodeview"
import { TableNodeView } from "@/editor/nodes/table_nodeview"

type Props = {
  docJson?: unknown
  className?: string
}

function getEmptyDoc() {
  const wrap = document.createElement("div")
  wrap.innerHTML = "<p></p>"
  return PMDOMParser.fromSchema(editorSchema).parse(wrap)
}

export function ProseMirrorViewer({ docJson, className }: Props) {
  const mountRef = React.useRef<HTMLDivElement | null>(null)
  const viewRef = React.useRef<EditorView | null>(null)

  React.useEffect(() => {
    if (!mountRef.current || viewRef.current) return
    const doc = getEmptyDoc()

    const state = EditorState.create({
      schema: editorSchema,
      doc,
      plugins: [],
    })

    const view = new EditorView(mountRef.current, {
      state,
      editable: () => false,
      nodeViews: {
        page_link: (node, view, getPos) => new PageLinkNodeView(node, view, getPos as () => number),
        code_block: (node, view, getPos) => new CodeBlockNodeView(node, view, getPos as () => number),
        list_item: (node, view, getPos) => new ListItemNodeView(node, view, getPos as () => number),
        table: (node, view, getPos) => new TableNodeView(node, view, getPos as () => number),
      },
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (!viewRef.current) return
    let doc = getEmptyDoc()
    if (docJson && typeof docJson === "object") {
      try {
        doc = editorSchema.nodeFromJSON(docJson)
      } catch {
        doc = getEmptyDoc()
      }
    }
    const state = EditorState.create({
      schema: editorSchema,
      doc,
      plugins: [],
    })
    viewRef.current.updateState(state)
  }, [docJson])

  return <div className={cn("pm-viewer", className)} ref={mountRef} />
}
