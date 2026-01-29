import type { NodeSpec } from "prosemirror-model"

// Block node that references another page/post
// attrs:
// - pageId: target posts.id
// - title: cached title for display (optional)
// - icon: cached icon for display (optional) - format: "emoji:😀" or "lucide:File"
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
    icon: { default: null },
    display: { default: "link" },
  },
  toDOM: (node) => {
    const { pageId, title, display, blockId } = node.attrs as any
    return [
      "div",
      {
        class:
          "my-2 py-3 px-4 text-card-foreground hover:bg-muted rounded-xl cursor-pointer",
        "data-page-link": "1",
        "data-block-id": blockId || "",
        "data-page-id": pageId || "",
        "data-display": display || "link",
      },
      [
        "div",
        { class: "flex items-center gap-2", "data-role": "title-wrap" },
        // Link icon placeholder - actual icon rendered by nodeview
        ["span", { class: "shrink-0 text-muted-foreground size-4", "data-role": "link-icon" }, "🔗"],
        ["span", { class: "font-semibold", "data-role": "title" }, title || "Untitled page"],
      ],
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


