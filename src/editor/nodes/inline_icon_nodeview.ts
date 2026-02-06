import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"

// Minimal preset SVGs for common icons.
const LUCIDE_ICON_SVGS: Record<string, string> = {
  File: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  FileText: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
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
  lucideLoadPromise = import("lucide-react")
    .then((mod) => {
      const iconsNs = (mod as unknown as Record<string, unknown>)["icons"]
      if (iconsNs && typeof iconsNs === "object") {
        lucideIconsModule = iconsNs as Record<string, unknown>
      }
    })
    .catch(() => {
      // ignore
    })
  return lucideLoadPromise
}

function generateSvgFromComponent(iconName: string): string | null {
  if (!lucideIconsModule) return null
  const IconComponent = lucideIconsModule[iconName]
  if (!IconComponent || typeof IconComponent !== "function") return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (IconComponent as any)({ size: 16 })
    const svgAttrs =
      'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    if (result && result.props && result.props.children) {
      const children = Array.isArray(result.props.children) ? result.props.children : [result.props.children]
      const innerHtml = children
        .map((child: Record<string, unknown>) => {
          if (!child || !child.type) return ""
          const tag = String(child.type)
          const props = (child.props as Record<string, unknown>) || {}
          const attrs = Object.entries(props)
            .filter(([k]) => k !== "children")
            .map(([k, v]) => `${k}="${String(v)}"`)
            .join(" ")
          return `<${tag} ${attrs}/>`
        })
        .join("")
      const svg = `<svg ${svgAttrs}>${innerHtml}</svg>`
      lucideIconCache[iconName] = svg
      return svg
    }
  } catch {
    // ignore
  }
  return null
}

function renderInlineIconHtml(iconRaw: string | null): string {
  const choice = decodeIcon(iconRaw)
  if (!choice) return ""
  if (choice.kind === "emoji") return `<span class="text-sm leading-none">${choice.value}</span>`
  if (LUCIDE_ICON_SVGS[choice.value]) return LUCIDE_ICON_SVGS[choice.value]
  if (lucideIconCache[choice.value]) return lucideIconCache[choice.value]
  const generated = generateSvgFromComponent(choice.value)
  if (generated) return generated
  void loadLucideIcons()
  return `<span class="text-sm leading-none opacity-60">□</span>`
}

async function renderInlineIconHtmlAsync(iconRaw: string | null): Promise<string> {
  const choice = decodeIcon(iconRaw)
  if (!choice) return ""
  if (choice.kind === "emoji") return `<span class="text-sm leading-none">${choice.value}</span>`
  if (LUCIDE_ICON_SVGS[choice.value]) return LUCIDE_ICON_SVGS[choice.value]
  if (lucideIconCache[choice.value]) return lucideIconCache[choice.value]
  await loadLucideIcons()
  const generated = generateSvgFromComponent(choice.value)
  if (generated) return generated
  return `<span class="text-sm leading-none opacity-60">□</span>`
}

export class InlineIconNodeView implements NodeView {
  dom: HTMLElement
  private iconRaw: string | null

  constructor(node: PMNode, _view: EditorView) {
    const dom = document.createElement("span")
    dom.className = "inline-flex items-center justify-center align-text-bottom"
    dom.setAttribute("data-inline-icon", "1")
    dom.setAttribute("contenteditable", "false")
    this.dom = dom
    this.iconRaw = (node.attrs as { icon?: string | null }).icon || null
    this.render(this.iconRaw)
  }

  private render(iconRaw: string | null) {
    this.dom.innerHTML = renderInlineIconHtml(iconRaw)
    const choice = decodeIcon(iconRaw)
    if (choice?.kind === "lucide") {
      void renderInlineIconHtmlAsync(iconRaw).then((html) => {
        if (iconRaw !== this.iconRaw) return
        this.dom.innerHTML = html
      })
    }
  }

  update(node: PMNode) {
    if (node.type.name !== "inline_icon") return false
    const nextRaw = (node.attrs as { icon?: string | null }).icon || null
    if (nextRaw !== this.iconRaw) {
      this.iconRaw = nextRaw
      this.render(this.iconRaw)
    }
    return true
  }

  ignoreMutation() {
    return true
  }
}

