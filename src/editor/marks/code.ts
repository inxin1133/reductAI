import type { MarkSpec } from "prosemirror-model"

// Override skeleton: customize tag/class for inline code here.
export const codeMarkSpec: MarkSpec = {
  parseDOM: [{ tag: "code" }],
  // Tailwind-first styling (dark-mode safe via CSS vars from shadcn)
  toDOM: () =>
    [
      "code",
      {
        class:
          "rounded-md bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground ring-1 ring-inset ring-border/60",
      },
      0,
    ],
}


