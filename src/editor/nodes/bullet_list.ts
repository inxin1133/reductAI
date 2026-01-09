import type { NodeSpec } from "prosemirror-model"

// Override skeleton: customize bullet list marker styling here.
// attrs:
// - bulletStyle: CSS list-style-type (disc|circle|square|...)
export const bulletListNodeSpec: NodeSpec = {
  attrs: {
    bulletStyle: { default: "disc" },
    blockId: { default: null },
  },
  content: "list_item+",
  group: "block",
  parseDOM: [
    {
      tag: "ul",
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        const data = el.getAttribute("data-bullet-style") || ""
        const style = (el.style as any)?.listStyleType || ""
        const bulletStyle = (data || style || "disc").trim()
        const blockId = el.getAttribute("data-block-id") || ""
        return { bulletStyle, blockId: blockId || null }
      },
    },
  ],
  toDOM: (node) => {
    const { bulletStyle, blockId } = node.attrs as { bulletStyle?: string; blockId?: string | null }
    const style = String(bulletStyle || "disc")
    return [
      "ul",
      {
        class: `pm-bullet-list pm-bullet-${style}`,
        "data-bullet-style": style,
        "data-block-id": blockId || "",
        style: `list-style-type: ${style};`,
      },
      0,
    ]
  },
}


