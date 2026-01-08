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
    pageId: { default: null },
    title: { default: "" },
    display: { default: "link" },
  },
  toDOM: (node) => {
    const { pageId, title, display } = node.attrs as any
    return [
      "div",
      {
        class: "pm-page-link",
        "data-page-link": "1",
        "data-page-id": pageId || "",
        "data-display": display || "link",
      },
      ["div", { class: "pm-page-link-title" }, title || "Untitled page"],
      display === "embed"
        ? ["div", { class: "pm-page-link-preview" }, "Preview (title + summary)"]
        : ["div", { class: "pm-page-link-hint" }, "Link"],
    ]
  },
  parseDOM: [
    {
      tag: "div[data-page-link]",
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        const title = el.querySelector(".pm-page-link-title")?.textContent || ""
        return {
          pageId: el.getAttribute("data-page-id"),
          display: el.getAttribute("data-display") || "link",
          title,
        }
      },
    },
  ],
}


