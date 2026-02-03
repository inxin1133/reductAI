import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"

type MediaType = "image" | "video" | "audio"

type MediaAttrs = {
  src?: string | null
  alt?: string | null
  title?: string | null
  poster?: string | null
}

export class MediaNodeView implements NodeView {
  dom: HTMLElement
  private media: HTMLImageElement | HTMLVideoElement | HTMLAudioElement
  private fallback: HTMLDivElement
  private type: MediaType
  private onError: () => void
  private onLoad: () => void

  constructor(node: PMNode, type: MediaType) {
    this.type = type
    const wrap = document.createElement("span")
    wrap.className = `pm-media-wrap pm-media-wrap--${type}`
    wrap.setAttribute("data-pm-media-wrap", "1")
    wrap.contentEditable = "false"

    const media = document.createElement(type === "image" ? "img" : type)
    if (type !== "image") {
      media.setAttribute("controls", "controls")
      media.setAttribute("preload", "metadata")
      media.className = "w-full rounded-md border"
    } else {
      media.className = "w-full h-full object-cover rounded-md border"
    }

    const fallback = document.createElement("div")
    fallback.className = "pm-media-fallback"
    const label = type === "video" ? "비디오를 불러올 수 없습니다." : type === "audio" ? "오디오를 불러올 수 없습니다." : "이미지를 불러올 수 없습니다."
    fallback.innerHTML = `<span>${label}</span>`
    fallback.style.display = "none"

    wrap.appendChild(media)
    wrap.appendChild(fallback)

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
    if (src) this.media.setAttribute("src", src)
    else this.media.removeAttribute("src")

    if (this.type === "image") {
      const img = this.media as HTMLImageElement
      if (attrs?.alt) img.setAttribute("alt", String(attrs.alt))
      else img.removeAttribute("alt")
      if (attrs?.title) img.setAttribute("title", String(attrs.title))
      else img.removeAttribute("title")
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
  return (node: PMNode, _view: EditorView, _getPos: () => number) => new MediaNodeView(node, type)
}
