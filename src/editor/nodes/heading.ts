import type { NodeSpec } from "prosemirror-model"

// Override skeleton: customize tag/class for headings here.
export const headingNodeSpec: NodeSpec = {
  attrs: { level: { default: 1 }, blockId: { default: null } },
  content: "inline*",
  group: "block",
  defining: true,
  parseDOM: [
    { tag: "h1", getAttrs: (dom) => ({ level: 1, blockId: (dom as HTMLElement).getAttribute("data-block-id") }) },
    { tag: "h2", getAttrs: (dom) => ({ level: 2, blockId: (dom as HTMLElement).getAttribute("data-block-id") }) },
    { tag: "h3", getAttrs: (dom) => ({ level: 3, blockId: (dom as HTMLElement).getAttribute("data-block-id") }) },
    { tag: "h4", getAttrs: (dom) => ({ level: 4, blockId: (dom as HTMLElement).getAttribute("data-block-id") }) },
    { tag: "h5", getAttrs: (dom) => ({ level: 5, blockId: (dom as HTMLElement).getAttribute("data-block-id") }) },
    { tag: "h6", getAttrs: (dom) => ({ level: 6, blockId: (dom as HTMLElement).getAttribute("data-block-id") }) },
  ],
  toDOM: (node) => {
    const level = Math.max(1, Math.min(6, Number((node.attrs as any).level || 1)))
    const base = "scroll-m-20 tracking-tight text-foreground"
    const byLevel =
      level === 1
        ? "mt-6 mb-3 text-3xl font-semibold"
        : level === 2
          ? "mt-6 mb-3 text-2xl font-semibold"
          : level === 3
            ? "mt-5 mb-2 text-xl font-semibold"
            : level === 4
              ? "mt-4 mb-2 text-lg font-semibold"
              : level === 5
                ? "mt-4 mb-2 text-base font-semibold"
                : "mt-3 mb-2 text-sm font-semibold"
    return [
      `h${level}`,
      { class: `${base} ${byLevel}`, "data-block-id": (node.attrs as any).blockId || "" },
      0,
    ]
  },
}


