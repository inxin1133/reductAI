import type { MarkSpec } from "prosemirror-model"

export const linkMarkSpec: MarkSpec = {
  attrs: {
    href: { default: "" },
    title: { default: null },
  },
  inclusive: false,
  parseDOM: [
    {
      tag: "a[href]",
      getAttrs: (dom) => {
        const el = dom as HTMLAnchorElement
        return {
          href: el.getAttribute("href") || "",
          title: el.getAttribute("title"),
        }
      },
    },
  ],
  toDOM: (mark) => {
    const { href, title } = mark.attrs as { href?: string; title?: string | null }
    return [
      "a",
      {
        href: String(href || ""),
        title: title ?? null,
        rel: "noopener noreferrer nofollow",
        target: "_blank",
        // Tailwind-first styling (dark-mode safe)
        class:
          "text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary hover:text-primary/90",
      },
      0,
    ]
  },
}


