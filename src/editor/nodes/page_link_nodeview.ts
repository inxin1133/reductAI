import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"

type Preview = { title: string; summary: string }

const previewTitleCache = new Map<string, { title: string; fetchedAt: number }>()
const PREVIEW_TTL_MS = 5_000

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
    const title = typeof j.title === "string" ? j.title : "New page"
    const summary = typeof j.summary === "string" ? j.summary : ""
    return { title, summary }
  } catch {
    return null
  }
}

async function updatePostTitle(pageId: string, title: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/posts/${pageId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    return r.ok
  } catch {
    return false
  }
}

export class PageLinkNodeView implements NodeView {
  dom: HTMLElement
  private titleBtn: HTMLButtonElement
  private titleInput: HTMLInputElement
  private hintEl: HTMLElement
  private currentKey: string = ""
  private view: EditorView
  private getPos: () => number
  private didAutofocus = false

  constructor(node: PMNode, view: EditorView, getPos: () => number) {
    const dom = document.createElement("div")
    dom.className = "my-3 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-sm"
    // IMPORTANT:
    // This is an atom node rendered inside a contenteditable editor.
    // Mark it non-editable so interactive controls (input/button) don't lose focus to ProseMirror.
    dom.setAttribute("contenteditable", "false")

    const titleWrap = document.createElement("div")
    titleWrap.className = "flex items-center gap-2"
    titleWrap.setAttribute("data-role", "title-wrap")

    const titleBtn = document.createElement("button")
    titleBtn.type = "button"
    titleBtn.className = "font-semibold text-left hover:underline underline-offset-2"
    titleBtn.setAttribute("data-role", "title-btn")
    titleWrap.appendChild(titleBtn)

    const titleInput = document.createElement("input")
    titleInput.type = "text"
    titleInput.className =
      "w-full bg-transparent font-semibold outline-none placeholder:text-muted-foreground"
    titleInput.placeholder = "New page"
    titleInput.setAttribute("data-role", "title-input")
    titleWrap.appendChild(titleInput)

    dom.appendChild(titleWrap)

    const hint = document.createElement("div")
    hint.className = "mt-1 text-xs text-muted-foreground"
    hint.setAttribute("data-role", "hint")
    dom.appendChild(hint)

    this.dom = dom
    this.titleBtn = titleBtn
    this.titleInput = titleInput
    this.hintEl = hint
    this.view = view
    this.getPos = getPos

    const stop = (e: Event) => e.stopPropagation()
    const stopMouseDown = (e: Event) => {
      // Prevent ProseMirror from setting node selection on mousedown before the input can focus.
      e.preventDefault()
      e.stopPropagation()
    }
    // Allow native input editing without ProseMirror hijacking events.
    titleInput.addEventListener("mousedown", stopMouseDown)
    titleInput.addEventListener("click", stop)
    titleInput.addEventListener("keydown", (e) => {
      e.stopPropagation()
      if (e.key === "Enter") {
        e.preventDefault()
        this.commitTitle()
      }
      if (e.key === "Escape") {
        e.preventDefault()
        titleInput.blur()
      }
    })
    titleInput.addEventListener("blur", () => {
      // Commit on blur (best-effort)
      this.commitTitle()
    })

    titleBtn.addEventListener("mousedown", stopMouseDown)
    titleBtn.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pageId = String((this.view.state.doc.nodeAt(this.getPos())?.attrs as any)?.pageId || "")
      if (!pageId) return
      // Let the host page decide how to navigate (and optionally flush autosave first).
      window.dispatchEvent(new CustomEvent("reductai:open-post", { detail: { postId: pageId } }))
    })

    void this.refresh(node)
  }

  private commitTitle() {
    const node = this.view.state.doc.nodeAt(this.getPos())
    if (!node) return
    const pageId = String((node.attrs as any).pageId || "")
    const display = String((node.attrs as any).display || "link")
    if (!pageId || display !== "embed") return

    const nextTitle = String(this.titleInput.value || "").trim()
    if (!nextTitle) return

    const curTitle = String((node.attrs as any).title || "")
    if (curTitle.trim() === nextTitle) return

    const pos = this.getPos()
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...(node.attrs as any), title: nextTitle })
    this.view.dispatch(tr)
    void (async () => {
      const ok = await updatePostTitle(pageId, nextTitle)
      if (ok) {
        window.dispatchEvent(
          new CustomEvent("reductai:page-title-updated", { detail: { postId: pageId, title: nextTitle } })
        )
      }
    })()
  }

  async refresh(node: PMNode) {
    const pageId = String((node.attrs as any).pageId || "")
    const display = String((node.attrs as any).display || "link")
    const cachedTitle = String((node.attrs as any).title || "")

    const key = `${pageId}|${display}|${cachedTitle}`
    if (key === this.currentKey) return
    this.currentKey = key

    const titleText = cachedTitle || "New page"

    // Step 4 요구사항: embed는 title만 렌더링 (summary/content 렌더링 X)
    this.hintEl.textContent = display === "link" ? "Link" : ""
    this.hintEl.style.display = display === "link" ? "block" : "none"

    // UX: embed는 "처음 생성 직후" title이 비어있으면 inline title 입력을 제공
    const editing = display === "embed" && (!cachedTitle || !cachedTitle.trim())
    this.titleBtn.style.display = editing ? "none" : "inline"
    this.titleInput.style.display = editing ? "block" : "none"

    if (editing) {
      // Keep whatever the user typed (don't clobber), but ensure focus sticks.
      if (!this.titleInput.value) this.titleInput.value = ""
      window.setTimeout(() => {
        // If ProseMirror stole focus right after insertion, refocus the input.
        if (document.activeElement !== this.titleInput) this.titleInput.focus()
      }, this.didAutofocus ? 0 : 0)
      this.didAutofocus = true
    } else {
      this.titleBtn.textContent = titleText
      this.titleInput.value = titleText
    }

    // Always revalidate title via preview (so parent pages reflect child title changes),
    // but cache results to avoid spamming the server.
    if (!pageId) return
    if (editing) return

    const now = Date.now()
    const cached = previewTitleCache.get(pageId)
    const shouldFetch = !cached || now - cached.fetchedAt > PREVIEW_TTL_MS
    const p = shouldFetch ? await fetchPreview(pageId) : null
    if (p && p.title) previewTitleCache.set(pageId, { title: p.title, fetchedAt: now })

    const freshTitle = (p?.title || cached?.title || titleText || "New page").trim()
    if (!freshTitle) return

    // Update UI immediately
    this.titleBtn.textContent = freshTitle
    if (this.titleInput.style.display === "none") this.titleInput.value = freshTitle

    // If the stored node title is stale, update the node attrs so autosave can persist it.
    if (cachedTitle.trim() !== freshTitle) {
      const pos = this.getPos()
      const curNode = this.view.state.doc.nodeAt(pos)
      if (!curNode) return
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...(curNode.attrs as any), title: freshTitle })
      this.view.dispatch(tr)
    }
  }

  update(node: PMNode) {
    void this.refresh(node)
    return true
  }
}


