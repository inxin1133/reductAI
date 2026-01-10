import type { NodeSpec } from "prosemirror-model"

// Notion-like divider (hr)
export const horizontalRuleNodeSpec: NodeSpec = {
  group: "block",
  selectable: true,
  draggable: true,
  attrs: {
    blockId: { default: null },
  },
  parseDOM: [
    {
      tag: "hr",
      getAttrs: (dom) => ({ blockId: (dom as HTMLElement).getAttribute("data-block-id") }),
    },
  ],
  // Tailwind-first styling (dark-mode safe)
  toDOM: (node) => [
    "hr",
    {
      class: "mt-4 mb-0 border-0 border-t border-border mx-auto h-[20px]",
      "data-block-id": (node.attrs as any).blockId || "",
    },
  ],
}


