import type { MarkSpec } from "prosemirror-model"

// Override skeleton: customize tag/class for italic here.
export const emMarkSpec: MarkSpec = {
  parseDOM: [
    { tag: "i" },
    { tag: "em" },
    { style: "font-style=italic" },
  ],
  // Tailwind-first styling (dark-mode safe)
  toDOM: () => ["em", { class: "italic text-foreground" }, 0],
}


