import { Plugin, type Transaction } from "prosemirror-state"
import type { Schema, Node as PMNode } from "prosemirror-model"

// Default nesting styles (edit these to change behavior)
export const DEFAULT_BULLET_STYLES = ["disc", "circle", "square"]
export const DEFAULT_ORDERED_TYPES = ["1", "a", "i", "A", "I"]

type Opts = {
  bulletStyles?: string[]
  orderedTypes?: string[]
}

type ListAttrs = { bulletStyle?: string; listType?: string }

function walkAndNormalize(args: {
  schema: Schema
  node: PMNode
  pos: number
  listDepth: number
  bulletStyles: string[]
  orderedTypes: string[]
  tr: Transaction
  changed: { v: boolean }
}) {
  const { schema, node, pos, listDepth, bulletStyles, orderedTypes, tr, changed } = args

  const isBullet = node.type === schema.nodes.bullet_list
  const isOrdered = node.type === schema.nodes.ordered_list

  let nextDepth = listDepth
  if (isBullet) {
    const desired = bulletStyles[listDepth % bulletStyles.length] || "disc"
    const attrs = (node.attrs || {}) as ListAttrs
    // Checklist uses its own styling; don't normalize bulletStyle.
    if (String((attrs as any).listKind || "bullet") === "check") {
      nextDepth = listDepth + 1
    } else {
    const cur = String(attrs.bulletStyle || "disc")
    if (cur !== desired) {
      try {
        tr.setNodeMarkup(pos, undefined, { ...(attrs as Record<string, unknown>), bulletStyle: desired })
        changed.v = true
      } catch {
        // ignore invalid positions
      }
    }
    nextDepth = listDepth + 1
    }
  } else if (isOrdered) {
    const desired = orderedTypes[listDepth % orderedTypes.length] || "1"
    const attrs = (node.attrs || {}) as ListAttrs
    const cur = String(attrs.listType || "1")
    if (cur !== desired) {
      try {
        tr.setNodeMarkup(pos, undefined, { ...(attrs as Record<string, unknown>), listType: desired })
        changed.v = true
      } catch {
        // ignore invalid positions
      }
    }
    nextDepth = listDepth + 1
  }

  node.forEach((child, offset) => {
    // ProseMirror position math:
    // - For most nodes: childPos = pos + 1 + offset (enter the node's content with +1)
    // - For doc: childPos = offset (doc has no wrapper token at pos=0 in the same way)
    const childPos = node.type.name === "doc" ? offset : pos + 1 + offset
    walkAndNormalize({
      schema,
      node: child,
      pos: childPos,
      listDepth: nextDepth,
      bulletStyles,
      orderedTypes,
      tr,
      changed,
    })
  })
}

export function listStylePlugin(schema: Schema, opts?: Opts) {
  const bulletStyles = (opts?.bulletStyles && opts.bulletStyles.length > 0 ? opts.bulletStyles : DEFAULT_BULLET_STYLES).slice()
  const orderedTypes = (opts?.orderedTypes && opts.orderedTypes.length > 0 ? opts.orderedTypes : DEFAULT_ORDERED_TYPES).slice()

  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((t) => t.docChanged)) return null
      if (!schema.nodes.bullet_list || !schema.nodes.ordered_list) return null

      const tr = newState.tr
      const changed = { v: false }
      walkAndNormalize({
        schema,
        node: newState.doc,
        pos: 0,
        listDepth: 0,
        bulletStyles,
        orderedTypes,
        tr,
        changed,
      })
      if (!changed.v) return null
      // Normalization only; should not consume an undo step.
      tr.setMeta("addToHistory", false)
      return tr
    },
  })
}


