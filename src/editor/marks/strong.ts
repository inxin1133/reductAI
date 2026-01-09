import type { MarkSpec } from "prosemirror-model"

// Override skeleton: customize tag/class for bold here.
export const strongMarkSpec: MarkSpec = {
  parseDOM: [
    { tag: "strong" },
    // Keep legacy <b> support
    {
      tag: "b",
      getAttrs: (node) => (node as HTMLElement).style.fontWeight !== "normal" && null,
    },
    {
      style: "font-weight",
      getAttrs: (value) => (/^(bold(er)?|[5-9]\d{2,})$/.test(String(value)) ? null : false),
    },
  ],
  // Tailwind-first styling (dark-mode safe)
  toDOM: () => ["strong", { class: "font-semibold text-foreground" }, 0],
}


