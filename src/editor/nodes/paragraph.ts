import type { NodeSpec } from "prosemirror-model"
import { getBgColorClasses } from "./bgColor"

// Override skeleton: customize tag/class for paragraphs here.
export const paragraphNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
    bgColor: { default: "" }, // e.g. "yellow-100"
    indent: { default: 0 }, // Notion-like block indent level
  },
  content: "inline*",
  group: "block",
  parseDOM: [
    {
      tag: "p",
      getAttrs: (dom) => ({
        blockId: (dom as HTMLElement).getAttribute("data-block-id"),
        bgColor: (dom as HTMLElement).getAttribute("data-bg-color") || "",
        indent: Number((dom as HTMLElement).getAttribute("data-indent") || 0) || 0,
      }),
    },
  ],
  // Tailwind-first styling (dark-mode safe)
  toDOM: (node) => [
    "p",
    {
      class: [
        "my-1 text-foreground leading-7",
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


