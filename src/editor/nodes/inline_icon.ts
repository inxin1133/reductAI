import type { NodeSpec } from "prosemirror-model"

export const inlineIconNodeSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,
  attrs: {
    icon: { default: null }, // "emoji:😀" | "lucide:File"
  },
  toDOM: (node) => {
    const iconRaw = (node.attrs as { icon?: string | null }).icon || ""
    const attrs: Record<string, string> = {
      "data-inline-icon": "1",
    }
    if (iconRaw) attrs["data-icon"] = iconRaw
    if (typeof iconRaw === "string" && iconRaw.startsWith("emoji:")) {
      return ["span", attrs, iconRaw.slice("emoji:".length)]
    }
    return ["span", attrs]
  },
  parseDOM: [
    {
      tag: "span[data-inline-icon]",
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          icon: el.getAttribute("data-icon") || null,
        }
      },
    },
  ],
}

