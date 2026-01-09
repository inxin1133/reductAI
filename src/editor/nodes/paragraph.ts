import type { NodeSpec } from "prosemirror-model"

// Override skeleton: customize tag/class for paragraphs here.
export const paragraphNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
  },
  content: "inline*",
  group: "block",
  parseDOM: [
    {
      tag: "p",
      getAttrs: (dom) => ({ blockId: (dom as HTMLElement).getAttribute("data-block-id") }),
    },
  ],
  // Tailwind-first styling (dark-mode safe)
  toDOM: (node) => [
    "p",
    {
      class: "my-1 text-foreground leading-7",
      "data-block-id": (node.attrs as any).blockId || "",
    },
    0,
  ],
}


