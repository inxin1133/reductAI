import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"

type Preview = { title: string; summary: string }

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function fetchPreview(pageId: string): Promise<Preview | null> {
  try {
    const r = await fetch(`/api/posts/${pageId}/preview`, { headers: authHeaders() })
    if (!r.ok) return null
    const j = await r.json()
    const title = typeof j.title === "string" ? j.title : "Untitled"
    const summary = typeof j.summary === "string" ? j.summary : ""
    return { title, summary }
  } catch {
    return null
  }
}

export class PageLinkNodeView implements NodeView {
  dom: HTMLElement
  private titleEl: HTMLElement
  private summaryEl: HTMLElement
  private hintEl: HTMLElement
  private currentKey: string = ""

  constructor(node: PMNode, _view: EditorView, _getPos: () => number) {
    const dom = document.createElement("div")
    dom.className = "my-3 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm"

    const title = document.createElement("div")
    title.className = "font-semibold"
    title.setAttribute("data-role", "title")
    dom.appendChild(title)

    const summary = document.createElement("div")
    summary.className = "mt-1 text-xs text-muted-foreground"
    summary.setAttribute("data-role", "summary")
    dom.appendChild(summary)

    const hint = document.createElement("div")
    hint.className = "mt-1 text-xs text-muted-foreground"
    hint.setAttribute("data-role", "hint")
    dom.appendChild(hint)

    this.dom = dom
    this.titleEl = title
    this.summaryEl = summary
    this.hintEl = hint

    void this.refresh(node)
  }

  async refresh(node: PMNode) {
    const pageId = String((node.attrs as any).pageId || "")
    const display = String((node.attrs as any).display || "link")
    const cachedTitle = String((node.attrs as any).title || "")

    const key = `${pageId}|${display}|${cachedTitle}`
    if (key === this.currentKey) return
    this.currentKey = key

    this.titleEl.textContent = cachedTitle || "Untitled page"
    this.hintEl.textContent = display === "embed" ? "" : "Link"
    this.summaryEl.textContent = display === "embed" ? "Loading…" : ""

    if (display !== "embed" || !pageId) return

    const p = await fetchPreview(pageId)
    if (!p) {
      this.summaryEl.textContent = "Preview unavailable"
      return
    }
    this.titleEl.textContent = p.title || this.titleEl.textContent || "Untitled page"
    this.summaryEl.textContent = p.summary || ""
  }

  update(node: PMNode) {
    void this.refresh(node)
    return true
  }
}


