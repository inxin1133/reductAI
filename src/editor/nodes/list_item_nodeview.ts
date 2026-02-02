import type { Node as PMNode } from "prosemirror-model"
import { getBgColorClasses } from "./bgColor"
import type { EditorView, NodeView } from "prosemirror-view"

type ListItemAttrs = {
  blockId?: string
  bgColor?: string
  checked?: boolean
  listKind?: string
}

export class ListItemNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private checkboxRoot: HTMLButtonElement | null = null
  private checkboxIndicator: HTMLElement | null = null
  private view: EditorView
  private getPos: () => number

  constructor(node: PMNode, view: EditorView, getPos: () => number) {
    this.view = view
    this.getPos = getPos

    this.dom = document.createElement("li")
    this.dom.className = "pm-list-item"

    this.contentDOM = document.createElement("div")
    this.contentDOM.className = "pm-list-item-content"
    this.dom.appendChild(this.contentDOM)

    this.render(node)
  }

  private getParentListKind(): string {
    const pos = this.getPos()
    const $pos = this.view.state.doc.resolve(pos)
    const parent = $pos.parent
    if (parent.type.name !== "bullet_list") return ""
    const parentAttrs = parent.attrs as unknown as { listKind?: unknown }
    return String(parentAttrs.listKind ?? "bullet")
  }

  private render(node: PMNode) {
    const attrs = (node.attrs || {}) as unknown as ListItemAttrs
    const bgColor = String(attrs.bgColor ?? "")
    const checked = Boolean(attrs.checked)
    const attrKind = String(attrs.listKind || "")
    const listKind = attrKind || this.getParentListKind()
    const isChecklist = listKind === "check"

    // Base classes
    const cls = ["pm-list-item", getBgColorClasses(bgColor)].filter(Boolean).join(" ")
    this.dom.className = cls
    this.dom.setAttribute("data-block-id", String(attrs.blockId || ""))
    this.dom.setAttribute("data-bg-color", bgColor)
    this.dom.setAttribute("data-checked", checked ? "true" : "false")
    this.dom.setAttribute("data-list-kind", listKind || "")

    // Ensure checkbox exists only for checklist mode
    if (isChecklist) {
      if (!this.checkboxRoot || !this.checkboxIndicator) {
        const root = document.createElement("button")
        root.type = "button"
        root.setAttribute("data-slot", "checkbox")
        root.setAttribute("aria-label", "Toggle checklist")
        root.setAttribute("contenteditable", "false")        
        // `src/components/ui/checkbox.tsx`를 최대한 가깝게 맞춰주세요.
        root.className = [
          "peer border-input size-4.5 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none text-primary-foreground",
          "dark:bg-input/30 dark:aria-invalid:ring-destructive/40 ", 
          "data-[state=checked]:bg-primary dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",          
          "mt-[2px]",
        ].join(" ")

        const indicator = document.createElement("span")
        indicator.setAttribute("data-slot", "checkbox-indicator")
        indicator.className = "flex items-center justify-center text-current transition-none"
        indicator.setAttribute("aria-hidden", "true")
        indicator.innerHTML =
          '<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>'

        root.appendChild(indicator)

        root.addEventListener("mousedown", (e) => {
          // Keep selection stable.
          e.preventDefault()
          e.stopPropagation()
        })
        root.addEventListener("click", (e) => {
          e.preventDefault()
          e.stopPropagation()

          const curNode = this.view.state.doc.nodeAt(this.getPos())
          if (!curNode) return
          const curAttrs = curNode.attrs as unknown as ListItemAttrs
          const next = !curAttrs.checked

          // Optimistic UI update (fixes "only shows after reload").
          root.dataset.state = next ? "checked" : "unchecked"
          root.setAttribute("aria-checked", next ? "true" : "false")

          const tr = this.view.state.tr.setNodeMarkup(this.getPos(), undefined, { ...curNode.attrs, checked: next })
          this.view.dispatch(tr)
          this.view.focus()
        })

        this.checkboxRoot = root
        this.checkboxIndicator = indicator
        // put checkbox before content
        this.dom.insertBefore(root, this.contentDOM)
      }

      this.checkboxRoot.dataset.state = checked ? "checked" : "unchecked"
      this.checkboxRoot.setAttribute("aria-checked", checked ? "true" : "false")
      this.dom.classList.add("pm-task-item")
      this.dom.classList.add("flex", "items-start", "gap-2")
      // Stack paragraph + nested lists without introducing extra vertical gaps.
      this.contentDOM.className = "pm-list-item-content flex-1 min-w-0 flex flex-col gap-1"
    } else {
      // remove checkbox if present
      if (this.checkboxRoot) {
        this.checkboxRoot.remove()
        this.checkboxRoot = null
        this.checkboxIndicator = null
      }
      this.dom.classList.remove("pm-task-item")
      this.dom.classList.remove("flex", "items-start", "gap-2")
      this.contentDOM.className = "pm-list-item-content"
    }
  }

  update(node: PMNode) {
    this.render(node)
    return true
  }
}

