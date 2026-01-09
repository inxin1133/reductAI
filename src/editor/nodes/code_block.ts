import type { NodeSpec } from "prosemirror-model"

// Override skeleton: customize tag/class for code blocks here.
export const codeBlockNodeSpec: NodeSpec = {
  attrs: {
    language: { default: "plain" }, // e.g. html | javascript | typescript | css | sql | plain
    blockId: { default: null },
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
        return { language, blockId: blockId || null }
      },
    },
  ],
  toDOM: (node) => {
    const attrs = node.attrs as { language?: string; blockId?: string | null }
    const language = String(attrs.language || "plain")
    return [
      "pre",
      { class: "pm-code-block", "data-language": language, "data-block-id": attrs.blockId || "" },
      ["code", { class: `pm-code-block-code language-${language}`, "data-language": language, "data-block-id": attrs.blockId || "" }, 0],
    ]
  },
}


