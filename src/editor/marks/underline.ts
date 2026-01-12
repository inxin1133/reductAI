import type { MarkSpec } from "prosemirror-model"

// Underline mark: renders as <u> with Tailwind underline utilities.
export const underlineMarkSpec: MarkSpec = {
  parseDOM: [
    { tag: "u" },
    {
      style: "text-decoration",
      getAttrs: (value) => {
        const v = String(value || "").toLowerCase()
        return v.includes("underline") ? null : false
      },
    },
  ],
  toDOM: () => ["u", { class: "underline underline-offset-2" }, 0],
}

