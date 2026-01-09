import { Plugin } from "prosemirror-state"
import type { Node as PMNode, Schema } from "prosemirror-model"

function makeId() {
  // Prefer stable UUIDs in browser.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (globalThis as any).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `blk_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

export function blockIdPlugin(schema: Schema) {
  void schema
  function nodeSupportsBlockId(n: PMNode) {
    const attrs = n.type.spec.attrs as Record<string, unknown> | undefined
    return !!attrs && Object.prototype.hasOwnProperty.call(attrs, "blockId")
  }

  return new Plugin({
    view: (view) => {
      let applying = false

      const ensure = () => {
        if (applying) return
        const { state } = view
        const doc = state.doc
        let tr = state.tr
        let changed = false

        doc.descendants((node, pos) => {
          if (!nodeSupportsBlockId(node)) return true
          const attrs = (node.attrs || {}) as Record<string, unknown>
          if (typeof attrs.blockId === "string" && String(attrs.blockId).trim()) return true
          const nextAttrs = { ...attrs, blockId: makeId() }
          try {
            tr = tr.setNodeMarkup(pos, undefined, nextAttrs)
            changed = true
          } catch {
            // ignore
          }
          return true
        })

        if (changed) {
          applying = true
          view.dispatch(tr)
          applying = false
        }
      }

      ensure()
      return { update: () => ensure(), destroy: () => void 0 }
    },
  })
}


