import type { NodeSpec } from "prosemirror-model"

// Notion-like divider (hr)
export const horizontalRuleNodeSpec: NodeSpec = {
  group: "block",
  selectable: true,
  draggable: true,
  attrs: {
    blockId: { default: null },
    indent: { default: 0 },
  },
  parseDOM: [
    {
      tag: "hr",
      getAttrs: (dom) => ({
        blockId: (dom as HTMLElement).getAttribute("data-block-id"),
        indent: Number((dom as HTMLElement).getAttribute("data-indent") || 0) || 0,
      }),
    },
  ],
  // Tailwind-first styling (dark-mode safe)
  toDOM: (node) => [
    "hr",
    {
      class: "mt-4 mb-0 border-0 border-t border-border mx-auto h-[20px]",
      "data-block-id": (node.attrs as any).blockId || "",
      "data-indent": String((node.attrs as any).indent || 0),
      style: `margin-left: ${Math.max(0, Math.min(8, Number((node.attrs as any).indent || 0))) * 24}px;`,
    },
  ],
}


