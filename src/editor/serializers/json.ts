import type { Node as PMNode } from "prosemirror-model"

export function exportJson(doc: PMNode): any {
  return doc.toJSON()
}


