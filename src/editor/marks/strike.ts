import type { MarkSpec } from "prosemirror-model"

// Strikethrough mark: supports <s>/<del>/<strike> and CSS text-decoration.
export const strikeMarkSpec: MarkSpec = {
  parseDOM: [
    { tag: "s" },
    { tag: "del" },
    { tag: "strike" },
    {
      style: "text-decoration",
      getAttrs: (value) => {
        const v = String(value || "").toLowerCase()
        return v.includes("line-through") ? null : false
      },
    },
  ],
  toDOM: () => ["s", { class: "line-through" }, 0],
}

