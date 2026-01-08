import type { NodeSpec } from "prosemirror-model"

export const imageNodeSpec: NodeSpec = {
  inline: false,
  group: "block",
  draggable: true,
  selectable: true,
  attrs: {
    src: { default: null },
    alt: { default: null },
    title: { default: null },
  },
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          src: (el as HTMLImageElement).getAttribute("src"),
          alt: (el as HTMLImageElement).getAttribute("alt"),
          title: (el as HTMLImageElement).getAttribute("title"),
        }
      },
    },
  ],
  toDOM: (node) => {
    const { src, alt, title } = node.attrs as any
    return ["img", { src, alt, title }]
  },
}


