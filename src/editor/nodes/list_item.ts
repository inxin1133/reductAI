import type { NodeSpec } from "prosemirror-model"

// Override skeleton: customize list item DOM/class here.
// IMPORTANT: keep content model compatible with prosemirror-schema-list expectations.
export const listItemNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
  },
  content: "paragraph block*",
  defining: true,
  parseDOM: [
    {
      tag: "li",
      getAttrs: (dom) => ({ blockId: (dom as HTMLElement).getAttribute("data-block-id") }),
    },
  ],
  toDOM: (node) => ["li", { class: "pm-list-item", "data-block-id": (node.attrs as any).blockId || "" }, 0],
}


