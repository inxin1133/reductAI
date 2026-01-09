import type { NodeSpec } from "prosemirror-model"

// Override skeleton: customize tag/class for blockquotes here.
export const blockquoteNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
  },
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [
    {
      tag: "blockquote",
      getAttrs: (dom) => ({ blockId: (dom as HTMLElement).getAttribute("data-block-id") }),
    },
  ],
  // Tailwind-first styling (dark-mode safe)
  toDOM: (node) => [
    "blockquote",
    {
      class: "my-3 border-l-2 border-border pl-4 italic text-muted-foreground",
      "data-block-id": (node.attrs as any).blockId || "",
    },
    0,
  ],
}


