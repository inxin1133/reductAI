import type { NodeSpec } from "prosemirror-model"

export const audioNodeSpec: NodeSpec = {
  inline: false,
  group: "block",
  draggable: true,
  selectable: true,
  attrs: {
    src: { default: null },
    title: { default: null },
  },
  parseDOM: [
    {
      tag: "audio[src]",
      getAttrs: (dom) => {
        const el = dom as HTMLAudioElement
        return {
          src: el.getAttribute("src"),
          title: el.getAttribute("title"),
        }
      },
    },
  ],
  toDOM: (node) => {
    const { src, title } = node.attrs as { src?: string | null; title?: string | null }
    return [
      "audio",
      {
        src: src || "",
        title: title || null,
        controls: "controls",
        preload: "metadata",
        class: "w-full",
      },
    ]
  },
}
