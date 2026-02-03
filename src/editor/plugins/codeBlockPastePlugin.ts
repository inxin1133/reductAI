import { Plugin } from "prosemirror-state"
import type { Schema } from "prosemirror-model"
import { Fragment, Slice } from "prosemirror-model"
import hljs from "highlight.js"

type CodeBlockPrefs = { language?: string; wrap?: boolean; lineNumbers?: boolean }

const CODE_BLOCK_PREF_KEY = "reductai:code-block-settings"

function readCodeBlockPrefs(): CodeBlockPrefs {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(CODE_BLOCK_PREF_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CodeBlockPrefs
    if (!parsed || typeof parsed !== "object") return {}
    return parsed
  } catch {
    return {}
  }
}

function normalizeLang(lang: string) {
  const l = String(lang || "plain").toLowerCase().trim()
  if (!l) return "plain"
  if (l === "plaintext") return "plain"
  if (l === "ts") return "typescript"
  if (l === "js") return "javascript"
  if (l === "py") return "python"
  return l
}

function getCodeBlockDefaultAttrs() {
  const prefs = readCodeBlockPrefs()
  return {
    language: normalizeLang(String(prefs.language || "plain")),
    wrap: prefs.wrap ?? true,
    lineNumbers: prefs.lineNumbers === true,
  }
}

function looksLikeCode(text: string) {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return false
  const codeIndicators = [
    /[{}[\];]/,
    /=>/,
    /<\/?[a-z][\s\S]*>/i,
    /\b(function|class|def|import|export|const|let|var|return|if|else|switch|case|public|private|protected)\b/,
    /#include\s+/,
  ]
  let indicatorHits = 0
  let indentHits = 0
  for (const line of lines) {
    if (/^\s{2,}|\t/.test(line)) indentHits += 1
    if (codeIndicators.some((re) => re.test(line))) indicatorHits += 1
  }
  return indentHits >= 2 || indicatorHits >= 2
}

function inferLanguage(text: string) {
  if (!looksLikeCode(text)) return "plain"
  try {
    const result = hljs.highlightAuto(text)
    if (result?.language) return normalizeLang(result.language)
  } catch {
    // ignore
  }
  return "plain"
}

function createCodeBlockSlice(schema: Schema, text: string, language?: string) {
  const codeBlock = schema.nodes.code_block
  if (!codeBlock) return null
  const base = getCodeBlockDefaultAttrs()
  const lang = normalizeLang(language || base.language || "plain")
  const attrs = { ...base, language: lang }
  const normalized = String(text || "").replace(/\r\n?/g, "\n")
  const content = normalized ? schema.text(normalized) : null
  const node = codeBlock.create(attrs, content || undefined)
  return new Slice(Fragment.from(node), 0, 0)
}

function extractLangFromClassName(className: string) {
  const cls = String(className || "")
    .split(/\s+/g)
    .find((c) => c.startsWith("language-") || c.startsWith("lang-"))
  if (!cls) return ""
  return normalizeLang(cls.replace(/^language-/, "").replace(/^lang-/, ""))
}

function extractLangFromCodeElement(pre: Element, code: Element | null) {
  const dataLang =
    code?.getAttribute("data-language") ||
    pre.getAttribute("data-language") ||
    code?.getAttribute("data-lang") ||
    pre.getAttribute("data-lang") ||
    ""
  const classLang = extractLangFromClassName(code?.getAttribute("class") || pre.getAttribute("class") || "")
  return normalizeLang(dataLang || classLang || "plain")
}

function extractFence(text: string) {
  const match = text.match(/^\s*```([^\n`]*)\n([\s\S]*?)\n?```\s*$/)
  if (!match) return null
  const rawLang = String(match[1] || "").trim().split(/\s+/)[0] || ""
  const code = match[2] ?? ""
  return { lang: rawLang, code }
}

export function codeBlockPastePlugin(schema: Schema) {
  return new Plugin({
    props: {
      clipboardTextParser(text, $context) {
        const codeBlock = schema.nodes.code_block
        if (!codeBlock) return null
        if ($context?.parent?.type === codeBlock) return null
        const raw = String(text || "")
        if (!raw.trim()) return null

        const fence = extractFence(raw)
        if (fence) {
          const lang = fence.lang ? normalizeLang(fence.lang) : inferLanguage(fence.code)
          return createCodeBlockSlice(schema, fence.code, lang)
        }

        if (!looksLikeCode(raw)) return null
        const lang = inferLanguage(raw)
        return createCodeBlockSlice(schema, raw, lang)
      },
      transformPastedHTML(html) {
        if (typeof DOMParser === "undefined") return html
        const codeBlock = schema.nodes.code_block
        if (!codeBlock) return html
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(html, "text/html")
          const pres = Array.from(doc.querySelectorAll("pre"))
          if (pres.length === 0) return html

          const prefs = getCodeBlockDefaultAttrs()
          let changed = false

          for (const pre of pres) {
            const code = pre.querySelector("code")
            const text = (code?.textContent || pre.textContent || "").replace(/\r\n?/g, "\n")
            const existingLang = extractLangFromCodeElement(pre, code)
            const inferred = existingLang && existingLang !== "plain" ? existingLang : inferLanguage(text)
            const lang = inferred || "plain"

            if (!pre.getAttribute("data-language") && lang) {
              pre.setAttribute("data-language", lang)
              changed = true
            }
            if (code && !code.getAttribute("data-language") && lang) {
              code.setAttribute("data-language", lang)
              changed = true
            }
            if (code && lang) {
              const cls = code.getAttribute("class") || ""
              if (!cls.includes("language-")) {
                code.setAttribute("class", `${cls} language-${lang}`.trim())
                changed = true
              }
            }

            if (!pre.getAttribute("data-wrap")) {
              pre.setAttribute("data-wrap", String(!!prefs.wrap))
              changed = true
            }
            if (!pre.getAttribute("data-line-numbers")) {
              pre.setAttribute("data-line-numbers", String(prefs.lineNumbers === true))
              changed = true
            }
          }

          return changed ? doc.body.innerHTML : html
        } catch {
          return html
        }
      },
    },
  })
}
