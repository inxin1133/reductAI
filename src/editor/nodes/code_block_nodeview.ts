import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"
import hljs from "highlight.js"
import "highlight.js/styles/github.css"

type CodeBlockAttrs = { language?: string }

type LangOption = { value: string; label: string }

function normalizeLang(lang: string) {
  const l = String(lang || "plain").toLowerCase().trim()
  if (!l) return "plain"
  // common aliases
  if (l === "ts") return "typescript"
  if (l === "js") return "javascript"
  if (l === "py") return "python"
  return l
}

const LANG_OPTIONS: LangOption[] = [
  { value: "plain", label: "Plain" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "javascript", label: "JavaScript (js)" },
  { value: "typescript", label: "TypeScript (ts)" },
  { value: "json", label: "JSON" },
  { value: "sql", label: "SQL" },
  { value: "python", label: "Python (py)" },
  { value: "bash", label: "Bash" },
]

// Editing-friendly approach:
// - contentDOM remains plain text inside <code>
// - a separate overlay <pre><code> is highlighted and layered under the editable text
export class CodeBlockNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement

  private gutter: HTMLElement
  private overlayCode: HTMLElement
  private editorCode: HTMLElement
  private languageSelect: HTMLSelectElement

  constructor(node: PMNode, view: EditorView, getPos: () => number) {
    const wrap = document.createElement("div")
    wrap.className = "pm-code-block-wrap"

    const header = document.createElement("div")
    header.className = "pm-code-block-header"
    wrap.appendChild(header)

    const select = document.createElement("select")
    select.className = "pm-code-block-lang-select"
    for (const opt of LANG_OPTIONS) {
      const o = document.createElement("option")
      o.value = opt.value
      o.textContent = opt.label
      select.appendChild(o)
    }
    header.appendChild(select)

    const body = document.createElement("div")
    body.className = "pm-code-block-body"
    wrap.appendChild(body)

    const gutter = document.createElement("div")
    gutter.className = "pm-code-block-gutter"
    body.appendChild(gutter)

    // Highlight overlay (NOT editable)
    const overlayPre = document.createElement("pre")
    overlayPre.className = "pm-code-block pm-code-block-overlay"
    const overlayCode = document.createElement("code")
    overlayCode.className = "pm-code-block-code hljs"
    overlayPre.appendChild(overlayCode)
    body.appendChild(overlayPre)

    const editorPre = document.createElement("pre")
    editorPre.className = "pm-code-block pm-code-block-editor"
    const editorCode = document.createElement("code")
    editorCode.className = "pm-code-block-code"
    editorPre.appendChild(editorCode)
    body.appendChild(editorPre)

    this.dom = wrap
    this.contentDOM = editorCode
    this.gutter = gutter
    this.overlayCode = overlayCode
    this.editorCode = editorCode
    this.languageSelect = select

    // Change language via dropdown
    select.addEventListener("change", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = getPos()
      const curNode = view.state.doc.nodeAt(pos)
      const curAttrs = (curNode?.attrs || {}) as CodeBlockAttrs
      const lang = normalizeLang(select.value)
      try {
        const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...(curAttrs as CodeBlockAttrs), language: lang })
        view.dispatch(tr)
        view.focus()
      } catch {
        // ignore
      }
    })

    // Keep overlay scrolling in sync with the editor
    editorPre.addEventListener("scroll", () => {
      overlayPre.scrollTop = editorPre.scrollTop
      overlayPre.scrollLeft = editorPre.scrollLeft
      gutter.scrollTop = editorPre.scrollTop
    })

    this.sync(node)
  }

  private setLineNumbers(text: string) {
    const lines = Math.max(1, text.split("\n").length)
    const parts: string[] = []
    for (let i = 1; i <= lines; i += 1) parts.push(String(i))
    this.gutter.textContent = parts.join("\n")
  }

  private sync(node: PMNode) {
    const attrs = (node.attrs || {}) as CodeBlockAttrs
    const lang = normalizeLang(String(attrs.language || "plain"))
    this.languageSelect.value = LANG_OPTIONS.some((o) => o.value === lang) ? lang : "plain"
    this.editorCode.className = `pm-code-block-code p-3 language-${lang}`

    // Always keep overlay text in sync from doc textContent
    const text = node.textContent || ""
    this.overlayCode.className = `pm-code-block-code hljs language-${lang}`
    this.setLineNumbers(text)

    // Highlight overlay HTML (never touch contentDOM)
    try {
      const result =
        lang && lang !== "plain" && hljs.getLanguage(lang)
          ? hljs.highlight(text, { language: lang, ignoreIllegals: true })
          : hljs.highlightAuto(text)
      this.overlayCode.innerHTML = result.value
    } catch {
      // Fallback: no highlight
      this.overlayCode.textContent = text
    }
  }

  update(node: PMNode, _decorations: unknown) {
    void _decorations
    // NodeView update is called a lot; keep it cheap.
    // We only re-sync preview/badge/classes.
    // NOTE: EditorView instance isn't passed here; ProseMirror will keep contentDOM updated.
    // We'll avoid using view.hasFocus() here; preview is still helpful.
    this.sync(node)
    return true
  }
}


