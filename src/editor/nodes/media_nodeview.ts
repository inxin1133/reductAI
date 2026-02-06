import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"
import { toast } from "sonner"

type MediaType = "image" | "video" | "audio"

type MediaAttrs = {
  src?: string | null
  alt?: string | null
  title?: string | null
  poster?: string | null
  width?: number | null
}

const MIN_IMAGE_WIDTH = 160
const MAX_IMAGE_WIDTH = 1200

function withAuthToken(url: string) {
  const raw = String(url || "")
  if (!raw) return raw
  if (typeof window === "undefined") return raw
  if (!raw.startsWith("/api/ai/media/assets/")) return raw
  if (raw.includes("token=")) return raw
  const token = window.localStorage.getItem("token")
  if (!token) return raw
  return `${raw}${raw.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
}

function inferImageFilename(src: string) {
  const s = String(src || "")
  if (!s) return "image.png"
  if (s.startsWith("data:image/")) {
    const m = s.match(/^data:image\/([a-zA-Z0-9.+-]+);/i)
    const ext = (m?.[1] || "png").toLowerCase().replace("jpeg", "jpg")
    return `image.${ext}`
  }
  try {
    const u = new URL(s, window.location.href)
    const path = u.pathname || ""
    const name = path.split("/").filter(Boolean).pop() || "image"
    if (/\.[a-z0-9]{2,5}$/i.test(name)) return name
    return `${name}.png`
  } catch {
    return "image.png"
  }
}

async function downloadImage(src: string) {
  const href = String(src || "").trim()
  if (!href) return
  const filename = inferImageFilename(href)

  if (href.startsWith("data:image/")) {
    const a = document.createElement("a")
    a.href = href
    a.download = filename
    a.rel = "noopener"
    a.click()
    return
  }

  try {
    const res = await fetch(href, { mode: "cors" })
    if (!res.ok) throw new Error("FETCH_FAILED")
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.rel = "noopener"
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch {
    const a = document.createElement("a")
    a.href = href
    a.target = "_blank"
    a.rel = "noopener"
    a.click()
  }
}

async function copyImageToClipboard(src: string): Promise<boolean> {
  const href = String(src || "").trim()
  if (!href) return false

  try {
    const canWriteImage =
      typeof navigator !== "undefined" &&
      !!navigator.clipboard &&
      typeof (navigator.clipboard as unknown as { write?: unknown }).write === "function" &&
      typeof (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined"
    if (!canWriteImage) throw new Error("CLIPBOARD_IMAGE_UNSUPPORTED")

    const res = await fetch(href, { mode: "cors" })
    if (!res.ok) throw new Error("FETCH_FAILED")
    const blob = await res.blob()
    const mime = blob.type || "image/png"

    const ClipboardItemCtor = (globalThis as unknown as { ClipboardItem: typeof ClipboardItem }).ClipboardItem
    const item = new ClipboardItemCtor({ [mime]: blob })
    await (navigator.clipboard as unknown as { write: (items: ClipboardItem[]) => Promise<void> }).write([item])
    return true
  } catch {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(href)
        return true
      }
    } catch {
      // ignore
    }
  }
  return false
}

export class MediaNodeView implements NodeView {
  dom: HTMLElement
  private media: HTMLImageElement | HTMLVideoElement | HTMLAudioElement
  private fallback: HTMLDivElement
  private type: MediaType
  private onError: () => void
  private onLoad: () => void
  private view?: EditorView
  private getPos?: () => number | undefined

  constructor(node: PMNode, type: MediaType, view?: EditorView, getPos?: () => number | undefined) {
    this.type = type
    this.view = view
    this.getPos = getPos
    const wrap = document.createElement("span")
    const wrapClass = type === "image" ? "pm-media-wrap pm-media-wrap--image pm-img-wrap" : `pm-media-wrap pm-media-wrap--${type}`
    wrap.className = wrapClass
    wrap.setAttribute("data-pm-media-wrap", "1")
    wrap.contentEditable = "false"

    const media = document.createElement(type === "image" ? "img" : type)
    if (type !== "image") {
      media.setAttribute("controls", "controls")
      media.setAttribute("preload", "metadata")
      media.className = "w-full rounded-md border"
    } else {
      media.className = "w-full h-full object-cover rounded-md"
    }

    const fallback = document.createElement("div")
    fallback.className = "pm-media-fallback"
    const label = type === "video" ? "비디오를 불러올 수 없습니다." : type === "audio" ? "오디오를 불러올 수 없습니다." : "이미지를 불러올 수 없습니다."
    fallback.innerHTML = `<span>${label}</span>`
    fallback.style.display = "none"

    wrap.appendChild(media)
    wrap.appendChild(fallback)

    if (type === "image") {
      const getSrc = () => String(media.getAttribute("src") || "").trim()
      const tooltip = document.createElement("div")
      tooltip.className = "pm-img-resize-tooltip"
      tooltip.textContent = ""
      tooltip.style.display = "none"

      const startResize = (e: MouseEvent, edge: "left" | "right") => {
        if (!this.view || !this.getPos) return
        e.preventDefault()
        e.stopPropagation()

        const startX = e.clientX
        const wrapRect = wrap.getBoundingClientRect()
        const parentRect = wrap.parentElement?.getBoundingClientRect()
        const startWidth = wrapRect.width
        const maxWidthRaw = parentRect?.width ? parentRect.width : startWidth
        const maxWidth = Math.max(MIN_IMAGE_WIDTH, Math.min(maxWidthRaw, MAX_IMAGE_WIDTH))
        const minWidth = MIN_IMAGE_WIDTH
        let latest = startWidth

        wrap.classList.add("pm-img-resizing")
        tooltip.textContent = `${Math.round(startWidth)}px`
        tooltip.style.display = "inline-flex"

        const onMove = (evt: MouseEvent) => {
          const dx = evt.clientX - startX
          let next = edge === "right" ? startWidth + dx : startWidth - dx
          next = Math.max(minWidth, Math.min(maxWidth, next))
          latest = next
          wrap.style.width = `${Math.round(next)}px`
          const pct = maxWidth ? Math.round((next / maxWidth) * 100) : 0
          tooltip.textContent = pct ? `${Math.round(next)}px · ${pct}%` : `${Math.round(next)}px`
        }

        const onUp = () => {
          document.removeEventListener("mousemove", onMove)
          document.removeEventListener("mouseup", onUp)
          wrap.classList.remove("pm-img-resizing")
          tooltip.style.display = "none"
          if (!this.view || !this.getPos) return
          const pos = this.getPos()
          if (pos == null) return
          const nodeAt = this.view.state.doc.nodeAt(pos)
          if (!nodeAt) return
          const nextAttrs = { ...nodeAt.attrs, width: Math.round(latest) }
          this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, nextAttrs))
        }

        document.addEventListener("mousemove", onMove)
        document.addEventListener("mouseup", onUp)
      }

      const copyBtn = document.createElement("button")
      copyBtn.type = "button"
      copyBtn.className = "pm-img-copy"
      copyBtn.setAttribute("aria-label", "이미지 복사")
      copyBtn.setAttribute("title", "이미지 복사")
      copyBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        const src = getSrc()
        if (!src) return
        void copyImageToClipboard(src).then((ok) => {
          if (ok) toast("복사되었습니다.")
          else toast("복사에 실패했습니다.")
        })
      })

      const downloadBtn = document.createElement("button")
      downloadBtn.type = "button"
      downloadBtn.className = "pm-img-download"
      downloadBtn.setAttribute("aria-label", "이미지 다운로드")
      downloadBtn.setAttribute("title", "이미지 다운로드")
      downloadBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
      downloadBtn.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        const src = getSrc()
        if (!src) return
        void downloadImage(src)
      })

      wrap.appendChild(copyBtn)
      wrap.appendChild(downloadBtn)

      wrap.appendChild(tooltip)

      const leftHandle = document.createElement("div")
      leftHandle.className = "pm-img-resize-handle pm-img-resize-handle--left"
      leftHandle.setAttribute("role", "separator")
      leftHandle.setAttribute("aria-orientation", "vertical")
      leftHandle.setAttribute("aria-label", "이미지 너비 조절")
      leftHandle.addEventListener("mousedown", (e) => startResize(e, "left"))

      const rightHandle = document.createElement("div")
      rightHandle.className = "pm-img-resize-handle pm-img-resize-handle--right"
      rightHandle.setAttribute("role", "separator")
      rightHandle.setAttribute("aria-orientation", "vertical")
      rightHandle.setAttribute("aria-label", "이미지 너비 조절")
      rightHandle.addEventListener("mousedown", (e) => startResize(e, "right"))

      wrap.appendChild(leftHandle)
      wrap.appendChild(rightHandle)
    }

    this.dom = wrap
    this.media = media
    this.fallback = fallback

    this.onError = () => {
      wrap.classList.add("pm-media-broken")
      this.fallback.style.display = "inline-flex"
    }
    this.onLoad = () => {
      wrap.classList.remove("pm-media-broken")
      this.fallback.style.display = "none"
    }

    media.addEventListener("error", this.onError)
    media.addEventListener(type === "image" ? "load" : "loadedmetadata", this.onLoad)

    this.applyAttrs(node.attrs as MediaAttrs)
  }

  private applyAttrs(attrs: MediaAttrs) {
    const src = attrs?.src ? String(attrs.src) : ""
    if (src) this.media.setAttribute("src", this.type === "image" ? withAuthToken(src) : src)
    else this.media.removeAttribute("src")

    if (this.type === "image") {
      const img = this.media as HTMLImageElement
      if (attrs?.alt) img.setAttribute("alt", String(attrs.alt))
      else img.removeAttribute("alt")
      if (attrs?.title) img.setAttribute("title", String(attrs.title))
      else img.removeAttribute("title")

      if (typeof attrs?.width === "number" && Number.isFinite(attrs.width) && attrs.width > 0) {
        this.dom.style.width = `${Math.round(attrs.width)}px`
      } else {
        this.dom.style.width = ""
      }
    } else if (this.type === "video") {
      const vid = this.media as HTMLVideoElement
      if (attrs?.title) vid.setAttribute("title", String(attrs.title))
      else vid.removeAttribute("title")
      if (attrs?.poster) vid.setAttribute("poster", String(attrs.poster))
      else vid.removeAttribute("poster")
    } else {
      const aud = this.media as HTMLAudioElement
      if (attrs?.title) aud.setAttribute("title", String(attrs.title))
      else aud.removeAttribute("title")
    }
  }

  update(node: PMNode) {
    if (node.type.name !== this.type) return false
    this.applyAttrs(node.attrs as MediaAttrs)
    return true
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.media.removeEventListener("error", this.onError)
    this.media.removeEventListener(this.type === "image" ? "load" : "loadedmetadata", this.onLoad)
  }
}

export function createMediaNodeView(type: MediaType) {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined) => new MediaNodeView(node, type, view, getPos)
}
