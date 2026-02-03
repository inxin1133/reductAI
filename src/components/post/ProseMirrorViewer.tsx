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

type CodeBlockOverride = { wrap?: boolean; lineNumbers?: boolean }

function hashString(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function applyViewerCodeBlockDefaults(
  doc: ReturnType<typeof editorSchema.nodeFromJSON>,
  overrides: Map<string, CodeBlockOverride>
) {
  const codeBlock = editorSchema.nodes.code_block
  if (!codeBlock) return doc
  const state = EditorState.create({ schema: editorSchema, doc })
  let tr = state.tr
  const seen = new Map<string, number>()

  doc.descendants((node, pos) => {
    if (node.type !== codeBlock) return
    const attrs = { ...(node.attrs || {}) } as {
      language?: string
      wrap?: boolean
      lineNumbers?: boolean
      blockId?: string | null
    }
    let changed = false
    const lang = String(attrs.language || "plain")
    const text = node.textContent || ""
    let blockId = attrs.blockId ? String(attrs.blockId) : ""

    if (!blockId) {
      const base = `${lang}:${hashString(text)}`
      const count = (seen.get(base) || 0) + 1
      seen.set(base, count)
      blockId = `viewer-${base}-${count}`
      attrs.blockId = blockId
      changed = true
    }

    if (attrs.wrap !== false) {
      attrs.wrap = false
      changed = true
    }
    if (attrs.lineNumbers !== false) {
      attrs.lineNumbers = false
      changed = true
    }

    const override = overrides.get(blockId)
    if (override) {
      if (typeof override.wrap === "boolean" && override.wrap !== attrs.wrap) {
        attrs.wrap = override.wrap
        changed = true
      }
      if (typeof override.lineNumbers === "boolean" && override.lineNumbers !== attrs.lineNumbers) {
        attrs.lineNumbers = override.lineNumbers
        changed = true
      }
    }

    if (changed) {
      tr = tr.setNodeMarkup(pos, undefined, attrs)
    }
  })

  return tr.docChanged ? tr.doc : doc
}

function inferImageFilename(src: string) {
  const s = String(src || "")
  if (!s) return "image.png"
  if (s.startsWith("data:image/")) {
    const m = s.match(/^data:image\/([a-zA-Z0-9.+-]+);/i)
    const ext = (m?.[1] || "png").toLowerCase().replace("jpeg", "jpg")
    return `image.${ext}`
  }
  try {
    const u = new URL(s, window.location.href)
    const path = u.pathname || ""
    const name = path.split("/").filter(Boolean).pop() || "image"
    // best-effort extension inference
    if (/\.[a-z0-9]{2,5}$/i.test(name)) return name
    return `${name}.png`
  } catch {
    return "image.png"
  }
}

async function downloadImage(src: string) {
  const href = String(src || "").trim()
  if (!href) return
  const filename = inferImageFilename(href)

  // For data URLs, direct download works in most browsers.
  if (href.startsWith("data:image/")) {
    const a = document.createElement("a")
    a.href = href
    a.download = filename
    a.rel = "noopener"
    a.click()
    return
  }

  // For http(s), try blob download first (best UX). If blocked (CORS), fallback to opening.
  try {
    const res = await fetch(href, { mode: "cors" })
    if (!res.ok) throw new Error("FETCH_FAILED")
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.rel = "noopener"
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch {
    const a = document.createElement("a")
    a.href = href
    a.target = "_blank"
    a.rel = "noopener"
    a.click()
  }
}

function decorateImagesWithDownload(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img")) as HTMLImageElement[]
  const isEmptyParagraph = (el: Element) => {
    if (el.tagName !== "P") return false
    const p = el as HTMLParagraphElement
    // no meaningful content
    const text = (p.textContent || "").replace(/\u00a0/g, " ").trim()
    if (text) return false
    // ignore <br>, but do not treat paragraphs containing other nodes as empty
    const hasMediaOrBlocks =
      p.querySelector("img,video,audio,table,pre,code,blockquote,ul,ol,h1,h2,h3") !== null
    return !hasMediaOrBlocks
  }
  for (const img of imgs) {
    if (!img || !img.parentElement) continue
    // Avoid duplicating wrappers.
    if (img.closest?.("[data-pm-img-wrap='1']")) continue

    const src = String(img.getAttribute("src") || "").trim()
    if (!src) continue

    const wrap = document.createElement("span")
    wrap.setAttribute("data-pm-img-wrap", "1")
    wrap.className = "pm-img-wrap"

    // Keep layout: replace img with wrapper, then move img into it.
    const parent = img.parentElement
    parent.insertBefore(wrap, img)
    wrap.appendChild(img)

    // ProseMirror may leave an empty <p></p> around images when converting from markdown/html.
    // Remove the empty paragraph right before/after the image wrapper to avoid a "blank line".
    const prev = wrap.previousSibling
    if (prev instanceof Element && isEmptyParagraph(prev)) prev.remove()
    const next = wrap.nextSibling
    if (next instanceof Element && isEmptyParagraph(next)) next.remove()

    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "pm-img-download"
    btn.setAttribute("aria-label", "이미지 다운로드")
    btn.setAttribute("title", "이미지 다운로드")
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
    btn.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      void downloadImage(src)
    })

    wrap.appendChild(btn)
  }
}

function getEmptyDoc() {
  const wrap = document.createElement("div")
  wrap.innerHTML = "<p></p>"
  return PMDOMParser.fromSchema(editorSchema).parse(wrap)
}

export function ProseMirrorViewer({ docJson, className }: Props) {
  const mountRef = React.useRef<HTMLDivElement | null>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const codeBlockOverridesRef = React.useRef<Map<string, CodeBlockOverride>>(new Map())

  const handleCodeBlockAttrsChange = React.useCallback((blockId: string | null, attrs: CodeBlockOverride) => {
    if (!blockId) return
    const prev = codeBlockOverridesRef.current.get(blockId) || {}
    codeBlockOverridesRef.current.set(blockId, { ...prev, ...attrs })
  }, [])

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
        code_block: (node, view, getPos) =>
          new CodeBlockNodeView(node, view, getPos as () => number, {
            allowLanguageChange: false,
            persistPrefs: false,
            onAttrsChange: handleCodeBlockAttrsChange,
          }),
        list_item: (node, view, getPos) => new ListItemNodeView(node, view, getPos as () => number),
        table: (node, view, getPos) => new TableNodeView(node, view, getPos as () => number),
      },
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [handleCodeBlockAttrsChange])

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
    doc = applyViewerCodeBlockDefaults(doc, codeBlockOverridesRef.current)
    const state = EditorState.create({
      schema: editorSchema,
      doc,
      plugins: [],
    })
    viewRef.current.updateState(state)
    // After ProseMirror updates DOM, attach download buttons to images (best-effort).
    window.requestAnimationFrame(() => {
      if (mountRef.current) decorateImagesWithDownload(mountRef.current)
    })
  }, [docJson])

  return <div className={cn("pm-viewer", className)} ref={mountRef} />
}
