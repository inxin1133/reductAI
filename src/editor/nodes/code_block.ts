import type { NodeSpec } from "prosemirror-model"
import { getBgColorClasses } from "./bgColor"

// Override skeleton: customize tag/class for code blocks here.
export const codeBlockNodeSpec: NodeSpec = {
  attrs: {
    language: { default: "plain" }, // e.g. html | javascript | typescript | css | sql | plain
    blockId: { default: null },
    bgColor: { default: "" },
    indent: { default: 0 },
    wrap: { default: true },
    lineNumbers: { default: false },
  },
  content: "text*",
  group: "block",
  code: true,
  defining: true,
  marks: "",
  parseDOM: [
    {
      tag: "pre",
      preserveWhitespace: "full",
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        const code = el.querySelector("code")
        const dataLang = code?.getAttribute("data-language") || el.getAttribute("data-language") || ""
        const clsLang =
          (code?.getAttribute("class") || "")
            .split(/\s+/g)
            .find((c) => c.startsWith("language-"))
            ?.replace(/^language-/, "") || ""
        const language = (dataLang || clsLang || "plain").trim()
        const blockId = el.getAttribute("data-block-id") || code?.getAttribute("data-block-id") || ""
        const bgColor = el.getAttribute("data-bg-color") || ""
        const indent = Number(el.getAttribute("data-indent") || 0) || 0
        const wrap = el.getAttribute("data-wrap") === "true"
        const lineNumbersAttr = el.getAttribute("data-line-numbers")
        const lineNumbers = lineNumbersAttr !== "false"
        return { language, blockId: blockId || null, bgColor, indent, wrap, lineNumbers }
      },
    },
  ],
  toDOM: (node) => {
    const attrs = node.attrs as {
      language?: string
      blockId?: string | null
      bgColor?: string
      indent?: number
      wrap?: boolean
      lineNumbers?: boolean
    }
    const language = String(attrs.language || "plain")
    return [
      "pre",
      {
        class: ["pm-code-block", getBgColorClasses(attrs.bgColor)].filter(Boolean).join(" "),
        "data-language": language,
        "data-block-id": attrs.blockId || "",
        "data-bg-color": attrs.bgColor || "",
        "data-indent": String(attrs.indent || 0),
        "data-wrap": String(!!attrs.wrap),
        "data-line-numbers": String(attrs.lineNumbers !== false),
        style: `margin-left: ${Math.max(0, Math.min(8, Number(attrs.indent || 0))) * 24}px;`,
      },
      ["code", { class: `pm-code-block-code language-${language}`, "data-language": language, "data-block-id": attrs.blockId || "" }, 0],
    ]
  },
}


