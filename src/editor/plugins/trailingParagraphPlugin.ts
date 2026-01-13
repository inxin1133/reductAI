import { Plugin, type Transaction } from "prosemirror-state"
import type { Schema } from "prosemirror-model"

// Notion-like UX: keep an extra empty paragraph at the end so users can always click and continue writing,
// even if the last block is a code_block/table/etc.
export function trailingParagraphPlugin(schema: Schema) {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((t) => t.docChanged)) return null
      const paragraph = schema.nodes.paragraph
      if (!paragraph) return null

      const last = newState.doc.lastChild
      if (!last) return null
      if (last.type === paragraph) return null

      // Append a trailing empty paragraph
      const tr: Transaction = newState.tr
      tr.insert(newState.doc.content.size, paragraph.createAndFill()!)
      // Normalization only; should not consume an undo step.
      tr.setMeta("addToHistory", false)
      return tr
    },
  })
}


