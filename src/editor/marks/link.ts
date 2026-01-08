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
    const { href, title } = mark.attrs as any
    return ["a", { href, title, rel: "noopener noreferrer nofollow", target: "_blank" }, 0]
  },
}


