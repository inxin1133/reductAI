import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"
import hljs from "highlight.js"
import "highlight.js/styles/github.css"

type CodeBlockAttrs = { language?: string; wrap?: boolean; lineNumbers?: boolean; blockId?: string | null }

type LangOption = { value: string; label: string }

type CodeBlockPrefs = { language?: string; wrap?: boolean; lineNumbers?: boolean }

const CODE_BLOCK_PREF_KEY = "reductai:code-block-settings"

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

type IconNode = Array<[string, Record<string, string>]>

const COPY_ICON: IconNode = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
]

const TEXT_WRAP_ICON: IconNode = [
  ["path", { d: "m16 16-3 3 3 3" }],
  ["path", { d: "M3 12h14.5a1 1 0 0 1 0 7H13" }],
  ["path", { d: "M3 19h6" }],
  ["path", { d: "M3 5h18" }],
]

const LIST_ORDERED_ICON: IconNode = [
  ["path", { d: "M11 5h10" }],
  ["path", { d: "M11 12h10" }],
  ["path", { d: "M11 19h10" }],
  ["path", { d: "M4 4h1v5" }],
  ["path", { d: "M4 9h2" }],
  ["path", { d: "M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" }],
]

function writeCodeBlockPrefs(next: CodeBlockPrefs) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CODE_BLOCK_PREF_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

function createIcon(iconNode: IconNode) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("class", "pm-code-block-icon")
  svg.setAttribute("aria-hidden", "true")
  for (const [tag, attrs] of iconNode) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag)
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value)
    }
    svg.appendChild(el)
  }
  return svg
}

type CodeBlockNodeViewOptions = {
  allowLanguageChange?: boolean
  persistPrefs?: boolean
  onAttrsChange?: (blockId: string | null, attrs: Partial<CodeBlockAttrs>) => void
}

// Editing-friendly approach:
// - contentDOM remains plain text inside <code>
// - a separate overlay <pre><code> is highlighted and layered under the editable text
export class CodeBlockNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement

  private gutter: HTMLElement
  private overlayPre: HTMLElement
  private overlayCode: HTMLElement
  private editorPre: HTMLElement
  private editorCode: HTMLElement
  private languageSelect: HTMLSelectElement
  private wrapButton: HTMLButtonElement
  private lineNumbersButton: HTMLButtonElement
  private latestText: string

  constructor(node: PMNode, view: EditorView, getPos: () => number, options?: CodeBlockNodeViewOptions) {
    const allowLanguageChange = options?.allowLanguageChange !== false
    const persistPrefs = options?.persistPrefs !== false
    const wrap = document.createElement("div")
    wrap.className = "pm-code-block-wrap"

    const popover = document.createElement("div")
    popover.className = "pm-code-block-popover"
    wrap.appendChild(popover)

    const select = document.createElement("select")
    select.className = "pm-code-block-lang-select"
    for (const opt of LANG_OPTIONS) {
      const o = document.createElement("option")
      o.value = opt.value
      o.textContent = opt.label
      select.appendChild(o)
    }
    popover.appendChild(select)

    const actions = document.createElement("div")
    actions.className = "pm-code-block-actions"
    popover.appendChild(actions)

    const divider = document.createElement("span")
    divider.className = "pm-code-block-divider"
    divider.setAttribute("aria-hidden", "true")
    divider.textContent = "|"
    actions.appendChild(divider)

    const copyButton = document.createElement("button")
    copyButton.type = "button"
    copyButton.className = "pm-code-block-action"
    copyButton.setAttribute("aria-label", "Copy")
    copyButton.setAttribute("data-tooltip", "코드 복사")
    copyButton.appendChild(createIcon(COPY_ICON))
    actions.appendChild(copyButton)

    const wrapButton = document.createElement("button")
    wrapButton.type = "button"
    wrapButton.className = "pm-code-block-action"
    wrapButton.setAttribute("aria-label", "Text wrap")
    wrapButton.setAttribute("data-tooltip", "줄바꿈 On/Off")
    wrapButton.appendChild(createIcon(TEXT_WRAP_ICON))
    actions.appendChild(wrapButton)

    const lineNumbersButton = document.createElement("button")
    lineNumbersButton.type = "button"
    lineNumbersButton.className = "pm-code-block-action"
    lineNumbersButton.setAttribute("aria-label", "Line numbers")
    lineNumbersButton.setAttribute("data-tooltip", "라인넘버 On/Off")
    lineNumbersButton.appendChild(createIcon(LIST_ORDERED_ICON))
    actions.appendChild(lineNumbersButton)

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
    this.overlayPre = overlayPre
    this.overlayCode = overlayCode
    this.editorPre = editorPre
    this.editorCode = editorCode
    this.languageSelect = select
    this.wrapButton = wrapButton
    this.lineNumbersButton = lineNumbersButton
    this.latestText = ""

    const updateAttrs = (next: Partial<CodeBlockAttrs>) => {
      const pos = getPos()
      const curNode = view.state.doc.nodeAt(pos)
      const curAttrs = (curNode?.attrs || {}) as CodeBlockAttrs
      const blockId = (curAttrs.blockId ? String(curAttrs.blockId) : null) || null
      try {
        const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...(curAttrs as CodeBlockAttrs), ...next })
        view.dispatch(tr)
        view.focus()
      } catch {
        // ignore
      }
      const merged = { ...curAttrs, ...next }
      if (persistPrefs) {
        writeCodeBlockPrefs({
          language: normalizeLang(String(merged.language || "plain")),
          wrap: merged.wrap ?? true,
          lineNumbers: merged.lineNumbers === true,
        })
      }
      options?.onAttrsChange?.(blockId, next)
    }

    // Change language via dropdown
    if (allowLanguageChange) {
      select.addEventListener("change", (e) => {
        e.preventDefault()
        e.stopPropagation()
        const lang = normalizeLang(select.value)
        updateAttrs({ language: lang })
      })
    } else {
      select.disabled = true
      select.classList.add("is-disabled")
    }

    copyButton.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.copyToClipboard(this.latestText)
      view.focus()
    })

    wrapButton.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = getPos()
      const curNode = view.state.doc.nodeAt(pos)
      const curAttrs = (curNode?.attrs || {}) as CodeBlockAttrs
      updateAttrs({ wrap: !curAttrs.wrap })
    })

    lineNumbersButton.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = getPos()
      const curNode = view.state.doc.nodeAt(pos)
      const curAttrs = (curNode?.attrs || {}) as CodeBlockAttrs
      const next = curAttrs.lineNumbers !== false ? false : true
      updateAttrs({ lineNumbers: next })
    })

    // Keep overlay scrolling in sync with the editor
    editorPre.addEventListener("scroll", () => {
      overlayPre.scrollTop = editorPre.scrollTop
      overlayPre.scrollLeft = editorPre.scrollLeft
      overlayCode.scrollLeft = editorPre.scrollLeft
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

  private copyToClipboard(text: string) {
    if (!text) return
    const runCopy = async () => {
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch {
        // fall back
      }
      const ta = document.createElement("textarea")
      ta.value = text
      ta.setAttribute("readonly", "true")
      ta.style.position = "fixed"
      ta.style.left = "-9999px"
      ta.style.top = "0"
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand("copy")
      } catch {
        // ignore
      }
      document.body.removeChild(ta)
    }
    void runCopy()
  }

  private sync(node: PMNode) {
    const syncScrollLeft = this.editorPre?.scrollLeft || 0
    const syncScrollTop = this.editorPre?.scrollTop || 0
    const attrs = (node.attrs || {}) as CodeBlockAttrs
    const lang = normalizeLang(String(attrs.language || "plain"))
    const wrapOn = !!attrs.wrap
    const lineNumbersOn = attrs.lineNumbers !== false
    this.dom.classList.toggle("is-wrap-on", wrapOn)
    this.dom.classList.toggle("is-line-numbers-off", !lineNumbersOn)
    this.wrapButton.dataset.active = wrapOn ? "true" : "false"
    this.wrapButton.setAttribute("aria-pressed", wrapOn ? "true" : "false")
    this.lineNumbersButton.dataset.active = lineNumbersOn ? "true" : "false"
    this.lineNumbersButton.setAttribute("aria-pressed", lineNumbersOn ? "true" : "false")
    this.languageSelect.value = LANG_OPTIONS.some((o) => o.value === lang) ? lang : "plain"
    this.editorCode.className = `pm-code-block-code p-3 language-${lang}`

    // Always keep overlay text in sync from doc textContent
    const text = node.textContent || ""
    this.latestText = text
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

    this.overlayPre.scrollLeft = syncScrollLeft
    this.overlayPre.scrollTop = syncScrollTop
    this.overlayCode.scrollLeft = syncScrollLeft
    this.gutter.scrollTop = syncScrollTop
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


