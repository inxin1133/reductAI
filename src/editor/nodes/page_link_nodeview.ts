import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"

type Preview = { title: string; summary: string; icon: string | null; hasContent: boolean }

const previewCache = new Map<string, { title: string; icon: string | null; hasContent: boolean; fetchedAt: number }>()
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
    const icon = typeof j.icon === "string" ? j.icon : null
    // If summary exists (excerpt from content), the page has content
    const hasContent = summary.trim().length > 0
    return { title, summary, icon, hasContent }
  } catch {
    return null
  }
}

// Lucide icon SVGs for common icons (matching LUCIDE_PRESETS in PostEditorPage)
const LUCIDE_ICON_SVGS: Record<string, string> = {
  File: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  FileText: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  Link2: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>`,
  Smile: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>`,
  Star: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  Book: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  Calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  CheckSquare: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`,
  Hash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>`,
  Code: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  PenLine: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  Image: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  Link: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  Globe: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
  Bot: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
}

function decodeIcon(raw: string | null): { kind: "emoji" | "lucide"; value: string } | null {
  if (!raw) return null
  if (raw.startsWith("emoji:")) return { kind: "emoji", value: raw.slice(6) }
  if (raw.startsWith("lucide:")) return { kind: "lucide", value: raw.slice(7) }
  return null
}

// Cache for dynamically loaded lucide icon SVGs
const lucideIconCache: Record<string, string> = {}
let lucideIconsModule: Record<string, unknown> | null = null
let lucideLoadPromise: Promise<void> | null = null

async function loadLucideIcons(): Promise<void> {
  if (lucideIconsModule) return
  if (lucideLoadPromise) return lucideLoadPromise
  
  lucideLoadPromise = import("lucide-react").then((mod) => {
    const iconsNs = (mod as unknown as Record<string, unknown>)["icons"]
    if (iconsNs && typeof iconsNs === "object") {
      lucideIconsModule = iconsNs as Record<string, unknown>
    }
  }).catch(() => {
    // Ignore errors
  })
  return lucideLoadPromise
}

function getLucideIconSvg(iconName: string): string | null {
  // Check static cache first
  if (LUCIDE_ICON_SVGS[iconName]) return LUCIDE_ICON_SVGS[iconName]
  // Check dynamic cache
  if (lucideIconCache[iconName]) return lucideIconCache[iconName]
  return null
}

// Try to generate SVG from React component
function generateSvgFromComponent(iconName: string): string | null {
  if (!lucideIconsModule) return null
  const IconComponent = lucideIconsModule[iconName]
  if (!IconComponent || typeof IconComponent !== "function") return null
  
  try {
    const svgAttrs = 'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    
    // For lucide-react icons, we can call them directly to get React element
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (IconComponent as any)({ size: 16 })
    if (result && result.props && result.props.children) {
      const children = Array.isArray(result.props.children) ? result.props.children : [result.props.children]
      const innerHtml = children.map((child: Record<string, unknown>) => {
        if (!child || !child.type) return ""
        const tag = String(child.type)
        const props = child.props as Record<string, unknown> || {}
        const attrs = Object.entries(props)
          .filter(([k]) => k !== "children")
          .map(([k, v]) => `${k}="${String(v)}"`)
          .join(" ")
        return `<${tag} ${attrs}/>`
      }).join("")
      const svg = `<svg ${svgAttrs}>${innerHtml}</svg>`
      lucideIconCache[iconName] = svg
      return svg
    }
  } catch {
    // Ignore errors
  }
  return null
}

function renderIconHtml(iconRaw: string | null, hasContent: boolean): string {
  const choice = decodeIcon(iconRaw)
  if (!choice) {
    // Default icon based on content
    return hasContent ? LUCIDE_ICON_SVGS.FileText : LUCIDE_ICON_SVGS.File
  }
  if (choice.kind === "emoji") {
    return `<span class="text-base leading-none">${choice.value}</span>`
  }
  // Lucide icon - check static and dynamic cache
  const svg = getLucideIconSvg(choice.value)
  if (svg) return svg
  
  // Try to generate from loaded module
  const generatedSvg = generateSvgFromComponent(choice.value)
  if (generatedSvg) return generatedSvg
  
  // Fallback - start loading icons for next time
  void loadLucideIcons()
  return hasContent ? LUCIDE_ICON_SVGS.FileText : LUCIDE_ICON_SVGS.File
}

// Async version that loads icons if needed and returns updated SVG
async function renderIconHtmlAsync(iconRaw: string | null, hasContent: boolean): Promise<string> {
  const choice = decodeIcon(iconRaw)
  if (!choice) {
    return hasContent ? LUCIDE_ICON_SVGS.FileText : LUCIDE_ICON_SVGS.File
  }
  if (choice.kind === "emoji") {
    return `<span class="text-base leading-none">${choice.value}</span>`
  }
  
  // Check caches first
  const svg = getLucideIconSvg(choice.value)
  if (svg) return svg
  
  // Load lucide icons module and try to generate
  await loadLucideIcons()
  const generatedSvg = generateSvgFromComponent(choice.value)
  if (generatedSvg) return generatedSvg
  
  return hasContent ? LUCIDE_ICON_SVGS.FileText : LUCIDE_ICON_SVGS.File
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
  private link2IconEl: HTMLSpanElement
  private pageIconEl: HTMLButtonElement
  private titleBtn: HTMLButtonElement
  private titleInput: HTMLInputElement
  private currentKey: string = ""
  private view: EditorView
  private getPos: () => number
  private didAutofocus = false
  private iconUpdateHandler: ((e: Event) => void) | null = null

  constructor(node: PMNode, view: EditorView, getPos: () => number) {
    const dom = document.createElement("div")
    dom.className = "my-2 py-3 px-4 text-card-foreground hover:bg-muted rounded-xl cursor-pointer"
    // IMPORTANT:
    // This is an atom node rendered inside a contenteditable editor.
    // Mark it non-editable so interactive controls (input/button) don't lose focus to ProseMirror.
    dom.setAttribute("contenteditable", "false")

    const titleWrap = document.createElement("div")
    titleWrap.className = "flex items-center gap-2"
    titleWrap.setAttribute("data-role", "title-wrap")

    // Link2 icon (always visible for link type)
    const link2Icon = document.createElement("span")
    link2Icon.className = "shrink-0 text-muted-foreground"
    link2Icon.setAttribute("data-role", "link2-icon")
    link2Icon.innerHTML = LUCIDE_ICON_SVGS.Link2
    titleWrap.appendChild(link2Icon)

    // Page icon (emoji or File/FileText) - clickable to open icon picker
    const pageIcon = document.createElement("button")
    pageIcon.type = "button"
    pageIcon.className = "shrink-0 h-6 w-6 flex items-center justify-center rounded-md hover:bg-neutral-200"
    pageIcon.setAttribute("data-role", "page-icon")
    pageIcon.title = "아이콘 변경"
    titleWrap.appendChild(pageIcon)

    const titleBtn = document.createElement("button")
    titleBtn.type = "button"
    titleBtn.className = "font-semibold text-left hover:underline underline-offset-2"
    titleBtn.setAttribute("data-role", "title-btn")
    titleWrap.appendChild(titleBtn)

    const titleInput = document.createElement("input")
    titleInput.type = "text"
    titleInput.className =
      "flex-1 bg-transparent font-semibold outline-none placeholder:text-muted-foreground"
    titleInput.placeholder = "New page"
    titleInput.setAttribute("data-role", "title-input")
    titleWrap.appendChild(titleInput)

    dom.appendChild(titleWrap)

    this.dom = dom
    this.link2IconEl = link2Icon
    this.pageIconEl = pageIcon
    this.titleBtn = titleBtn
    this.titleInput = titleInput
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
      
      // Check access permission before navigating and get category_id
      void (async () => {
        try {
          const r = await fetch(`/api/posts/${pageId}/preview`, { headers: authHeaders() })
          if (!r.ok) {
            if (r.status === 403 || r.status === 404) {
              alert("이 페이지에 접근할 수 없습니다. 권한이 없거나 페이지가 삭제되었습니다.")
              return
            }
          }
          const data = await r.json()
          const categoryId = data.category_id || null
          // Let the host page decide how to navigate (and optionally flush autosave first).
          // Include categoryId so the sidebar can switch to the correct category.
          window.dispatchEvent(new CustomEvent("reductai:open-post", { detail: { postId: pageId, categoryId } }))
        } catch {
          alert("페이지에 접근하는 중 오류가 발생했습니다.")
        }
      })()
    })

    // Page icon click -> open icon picker
    pageIcon.addEventListener("mousedown", stopMouseDown)
    pageIcon.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pageId = String((this.view.state.doc.nodeAt(this.getPos())?.attrs as any)?.pageId || "")
      if (!pageId) return
      
      // Get the bounding rect of the icon for popover positioning
      const rect = pageIcon.getBoundingClientRect()
      
      // Dispatch event to open icon picker at this position
      window.dispatchEvent(new CustomEvent("reductai:open-page-icon-picker", {
        detail: {
          postId: pageId,
          anchorRect: { left: rect.left, top: rect.bottom, width: rect.width, height: rect.height },
        },
      }))
    })

    // Listen for icon updates from the icon picker
    this.iconUpdateHandler = (e: Event) => {
      const ce = e as CustomEvent<{ postId?: string; icon?: string | null }>
      const updatedPageId = ce.detail?.postId
      const updatedIcon = ce.detail?.icon
      
      const curNode = this.view.state.doc.nodeAt(this.getPos())
      if (!curNode) return
      const curPageId = String((curNode.attrs as Record<string, unknown>).pageId || "")
      if (curPageId !== updatedPageId) return
      
      // Update the icon in this node
      const pos = this.getPos()
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...(curNode.attrs as Record<string, unknown>),
        icon: updatedIcon ?? null,
      })
      this.view.dispatch(tr)
      
      // Get cached hasContent for icon render
      const cachedPreview = curPageId ? previewCache.get(curPageId) : null
      const hasContent = cachedPreview?.hasContent ?? false
      
      // Update UI immediately (sync), then async load if needed
      this.pageIconEl.innerHTML = renderIconHtml(updatedIcon ?? null, hasContent)
      
      // Async load for dynamic icons and update again if changed
      void renderIconHtmlAsync(updatedIcon ?? null, hasContent).then((asyncHtml) => {
        if (this.pageIconEl && this.pageIconEl.innerHTML !== asyncHtml) {
          this.pageIconEl.innerHTML = asyncHtml
        }
      })
    }
    window.addEventListener("reductai:page-icon-updated", this.iconUpdateHandler)

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
    const cachedIcon = (node.attrs as any).icon as string | null

    const key = `${pageId}|${display}|${cachedTitle}|${cachedIcon || ""}`
    if (key === this.currentKey) return
    this.currentKey = key

    const titleText = cachedTitle || "New page"
    
    // Get cached hasContent for initial icon render
    const cachedPreview = pageId ? previewCache.get(pageId) : null
    const cachedHasContent = cachedPreview?.hasContent ?? false

    // Render page icon immediately from cached attrs
    this.pageIconEl.innerHTML = renderIconHtml(cachedIcon, cachedHasContent)
    
    // Async load for dynamic icons and update again if changed
    void renderIconHtmlAsync(cachedIcon, cachedHasContent).then((asyncHtml) => {
      if (this.pageIconEl && this.pageIconEl.innerHTML !== asyncHtml) {
        this.pageIconEl.innerHTML = asyncHtml
      }
    })
    
    // Show/hide Link2 icon based on display type
    this.link2IconEl.style.display = display === "link" ? "inline" : "none"

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

    // Always revalidate title/icon via preview (so parent pages reflect child changes),
    // but cache results to avoid spamming the server.
    if (!pageId) return
    if (editing) return

    const now = Date.now()
    const cached = previewCache.get(pageId)
    const shouldFetch = !cached || now - cached.fetchedAt > PREVIEW_TTL_MS
    const p = shouldFetch ? await fetchPreview(pageId) : null
    if (p) previewCache.set(pageId, { title: p.title, icon: p.icon, hasContent: p.hasContent, fetchedAt: now })

    const freshTitle = (p?.title || cached?.title || titleText || "New page").trim()
    const freshIcon = p?.icon ?? cached?.icon ?? cachedIcon
    const freshHasContent = p?.hasContent ?? cached?.hasContent ?? false

    // Update page icon UI (sync first, then async load if needed)
    this.pageIconEl.innerHTML = renderIconHtml(freshIcon, freshHasContent)
    void renderIconHtmlAsync(freshIcon, freshHasContent).then((asyncHtml) => {
      if (this.pageIconEl && this.pageIconEl.innerHTML !== asyncHtml) {
        this.pageIconEl.innerHTML = asyncHtml
      }
    })

    // Update title UI
    this.titleBtn.textContent = freshTitle
    if (this.titleInput.style.display === "none") this.titleInput.value = freshTitle

    // If the stored node title/icon is stale, update the node attrs so autosave can persist it.
    const titleChanged = cachedTitle.trim() !== freshTitle
    const iconChanged = (cachedIcon || "") !== (freshIcon || "")
    if (titleChanged || iconChanged) {
      const pos = this.getPos()
      const curNode = this.view.state.doc.nodeAt(pos)
      if (!curNode) return
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...(curNode.attrs as any),
        title: freshTitle,
        icon: freshIcon,
      })
      this.view.dispatch(tr)
    }
  }

  update(node: PMNode) {
    void this.refresh(node)
    return true
  }

  destroy() {
    if (this.iconUpdateHandler) {
      window.removeEventListener("reductai:page-icon-updated", this.iconUpdateHandler)
      this.iconUpdateHandler = null
    }
  }
}


