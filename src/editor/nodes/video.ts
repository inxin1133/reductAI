import type { NodeSpec } from "prosemirror-model"

export const videoNodeSpec: NodeSpec = {
  inline: false,
  group: "block",
  draggable: true,
  selectable: true,
  attrs: {
    src: { default: null },
    title: { default: null },
    poster: { default: null },
  },
  parseDOM: [
    {
      tag: "video[src]",
      getAttrs: (dom) => {
        const el = dom as HTMLVideoElement
        return {
          src: el.getAttribute("src"),
          title: el.getAttribute("title"),
          poster: el.getAttribute("poster"),
        }
      },
    },
  ],
  toDOM: (node) => {
    const { src, title, poster } = node.attrs as { src?: string | null; title?: string | null; poster?: string | null }
    return [
      "video",
      {
        src: src || "",
        title: title || null,
        poster: poster || null,
        controls: "controls",
        preload: "metadata",
        class: "w-full rounded-md border",
      },
    ]
  },
}
