import type { NodeSpec } from "prosemirror-model"

// Block node that references another page/post
// attrs:
// - pageId: target posts.id
// - title: cached title for display (optional)
// - display: link | embed
export const pageLinkNodeSpec: NodeSpec = {
  inline: false,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    blockId: { default: null },
    pageId: { default: null },
    title: { default: "" },
    display: { default: "link" },
  },
  toDOM: (node) => {
    const { pageId, title, display, blockId } = node.attrs as any
    return [
      "div",
      {
        class:
          "my-3 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm",
        "data-page-link": "1",
        "data-block-id": blockId || "",
        "data-page-id": pageId || "",
        "data-display": display || "link",
      },
      // Step 4 요구사항: embed는 title만 렌더링 (콘텐츠/요약 포함 X)
      ["div", { class: "font-semibold", "data-role": "title" }, title || "Untitled page"],
      display === "link"
        ? ["div", { class: "mt-1 text-xs text-muted-foreground", "data-role": "hint" }, "Link"]
        : ["div", { class: "hidden", "data-role": "hint" }, ""],
    ]
  },
  parseDOM: [
    {
      tag: "div[data-page-link]",
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        const title = el.querySelector('[data-role="title"]')?.textContent || ""
        return {
          blockId: el.getAttribute("data-block-id"),
          pageId: el.getAttribute("data-page-id"),
          display: el.getAttribute("data-display") || "link",
          title,
        }
      },
    },
  ],
}


