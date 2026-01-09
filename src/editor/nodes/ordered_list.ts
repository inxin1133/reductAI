import type { NodeSpec } from "prosemirror-model"

// Override skeleton: customize ordered list marker styling here.
// attrs:
// - order: start number (kept for compatibility)
// - listType: HTML <ol type="..."> (1|a|A|i|I)
export const orderedListNodeSpec: NodeSpec = {
  attrs: {
    order: { default: 1 },
    listType: { default: "1" },
    blockId: { default: null },
  },
  content: "list_item+",
  group: "block",
  parseDOM: [
    {
      tag: "ol",
      getAttrs: (dom) => {
        const el = dom as HTMLOListElement
        const orderAttr = el.getAttribute("start")
        const order = orderAttr ? parseInt(orderAttr, 10) || 1 : 1
        const listType = (el.getAttribute("type") || el.getAttribute("data-list-type") || "1").trim()
        const blockId = el.getAttribute("data-block-id") || ""
        return { order, listType, blockId: blockId || null }
      },
    },
  ],
  toDOM: (node) => {
    const { order, listType, blockId } = node.attrs as { order?: number; listType?: string; blockId?: string | null }
    const start = Number(order || 1)
    const type = String(listType || "1")

    // Ensure CSS reflects the stored listType even if global styles exist.
    // HTML `type` is not always honored when CSS forces list-style-type.
    const cssListStyleType =
      type === "a"
        ? "lower-alpha"
        : type === "A"
          ? "upper-alpha"
          : type === "i"
            ? "lower-roman"
            : type === "I"
              ? "upper-roman"
              : "decimal"

    return [
      "ol",
      {
        class: `pm-ordered-list pm-ordered-${type}`,
        start,
        type,
        "data-list-type": type,
        "data-block-id": blockId || "",
        style: `list-style-type: ${cssListStyleType};`,
      },
      0,
    ]
  },
}


