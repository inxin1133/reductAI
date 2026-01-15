import type { NodeSpec } from "prosemirror-model"
import { getBgColorClasses } from "./bgColor"

// Override skeleton: customize tag/class for blockquotes here.
export const blockquoteNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
    bgColor: { default: "" },
    indent: { default: 0 },
  },
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [
    {
      tag: "blockquote",
      getAttrs: (dom) => ({
        blockId: (dom as HTMLElement).getAttribute("data-block-id"),
        bgColor: (dom as HTMLElement).getAttribute("data-bg-color") || "",
        indent: Number((dom as HTMLElement).getAttribute("data-indent") || 0) || 0,
      }),
    },
  ],
  // Tailwind-first styling (dark-mode safe)
  toDOM: (node) => [
    "blockquote",
    {
      class: [
        "my-3 border-l-2 border-border pl-4 italic text-muted-foreground",
        getBgColorClasses((node.attrs as any).bgColor),
      ]
        .filter(Boolean)
        .join(" "),
      "data-block-id": (node.attrs as any).blockId || "",
      "data-bg-color": (node.attrs as any).bgColor || "",
      "data-indent": String((node.attrs as any).indent || 0),
      style: `margin-left: ${Math.max(0, Math.min(8, Number((node.attrs as any).indent || 0))) * 24}px;`,
    },
    0,
  ],
}


