import type { NodeSpec } from "prosemirror-model"

// Inline atom node: @mention
export const mentionNodeSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  attrs: {
    id: { default: null },
    label: { default: "" },
    type: { default: "user" }, // user | page | custom
  },
  toDOM: (node) => {
    const { id, label, type } = node.attrs as any
    return [
      "span",
      {
        "data-mention": "1",
        "data-mention-id": id || "",
        "data-mention-type": type || "user",
        class:
          "inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-sm font-semibold text-primary ring-1 ring-inset ring-primary/15",
      },
      `@${label || "mention"}`,
    ]
  },
  parseDOM: [
    {
      tag: "span[data-mention]",
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          id: el.getAttribute("data-mention-id"),
          type: el.getAttribute("data-mention-type") || "user",
          label: (el.textContent || "").replace(/^@/, ""),
        }
      },
    },
  ],
}


