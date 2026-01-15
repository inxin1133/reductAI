import type { NodeSpec } from "prosemirror-model"
import { getBgColorClasses } from "./bgColor"

// Override skeleton: customize list item DOM/class here.
// IMPORTANT: keep content model compatible with prosemirror-schema-list expectations.
export const listItemNodeSpec: NodeSpec = {
  attrs: {
    blockId: { default: null },
    bgColor: { default: "" },
    checked: { default: false },
  },
  content: "paragraph block*",
  defining: true,
  parseDOM: [
    {
      tag: "li",
      getAttrs: (dom) => ({
        blockId: (dom as HTMLElement).getAttribute("data-block-id"),
        bgColor: (dom as HTMLElement).getAttribute("data-bg-color") || "",
        checked: (dom as HTMLElement).getAttribute("data-checked") === "true",
      }),
    },
  ],
  toDOM: (node) => [
    "li",
    {
      class: ["pm-list-item", getBgColorClasses((node.attrs as any).bgColor)].filter(Boolean).join(" "),
      "data-block-id": (node.attrs as any).blockId || "",
      "data-bg-color": (node.attrs as any).bgColor || "",
      "data-checked": (node.attrs as any).checked ? "true" : "false",
    },
    0,
  ],
}


