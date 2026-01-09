import type { NodeSpec } from "prosemirror-model"

export const imageNodeSpec: NodeSpec = {
  inline: false,
  group: "block",
  draggable: true,
  selectable: true,
  attrs: {
    blockId: { default: null },
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
          blockId: (el as HTMLImageElement).getAttribute("data-block-id"),
          src: (el as HTMLImageElement).getAttribute("src"),
          alt: (el as HTMLImageElement).getAttribute("alt"),
          title: (el as HTMLImageElement).getAttribute("title"),
          class: (el as HTMLImageElement).getAttribute("class"),
        }
      },
    },
  ],
  toDOM: (node) => {
    const { src, alt, title, blockId } = node.attrs as any
    // ProseMirror의 toDOM 반환 값은 [tag, attrs, ...content] 형식이고,
    // className은 attrs 객체에 넣어야 합니다.
    return ["img", { src, alt, title, class: "w-full h-full object-cover", "data-block-id": blockId || "" }]
  },
}


