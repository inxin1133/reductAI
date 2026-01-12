import type { NodeSpec } from "prosemirror-model"

// Override skeleton: customize bullet list marker styling here.
// attrs:
// - bulletStyle: CSS list-style-type (disc|circle|square|...)
export const bulletListNodeSpec: NodeSpec = {
  attrs: {
    bulletStyle: { default: "disc" },
    blockId: { default: null },
    // listKind: "bullet" | "check"
    listKind: { default: "bullet" },
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
        const listKind = (el.getAttribute("data-list-kind") || "bullet").trim()
        return { bulletStyle, blockId: blockId || null, listKind }
      },
    },
  ],
  toDOM: (node) => {
    const { bulletStyle, blockId, listKind } = node.attrs as {
      bulletStyle?: string
      blockId?: string | null
      listKind?: string
    }
    const style = String(bulletStyle || "disc")
    const kind = String(listKind || "bullet")
    const isCheck = kind === "check"
    return [
      "ul",
      {
        class: isCheck ? "pm-task-list" : `pm-bullet-list pm-bullet-${style}`,
        "data-bullet-style": style,
        "data-list-kind": kind,
        "data-block-id": blockId || "",
        style: isCheck ? "list-style-type: none;" : `list-style-type: ${style};`,
      },
      0,
    ]
  },
}


