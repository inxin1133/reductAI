import type { Schema } from "prosemirror-model"
import { InputRule, wrappingInputRule, textblockTypeInputRule } from "prosemirror-inputrules"

// Build input rules:
// - "- " -> bullet_list
// - "1. " -> ordered_list
// - "# " -> heading (levels 1-3)
// - "---" -> horizontal_rule
export function buildInputRules(schema: Schema) {
  const rules: any[] = []

  // Lists
  if (schema.nodes.bullet_list) {
    rules.push(wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list))
  }
  if (schema.nodes.ordered_list) {
    rules.push(
      wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (match) => ({
        order: parseInt(match[1], 10) || 1,
      }))
    )
  }

  // Headings (#, ##, ###)
  if (schema.nodes.heading) {
    rules.push(textblockTypeInputRule(/^#\s$/, schema.nodes.heading, { level: 1 }))
    rules.push(textblockTypeInputRule(/^##\s$/, schema.nodes.heading, { level: 2 }))
    rules.push(textblockTypeInputRule(/^###\s$/, schema.nodes.heading, { level: 3 }))
  }

  // Blockquote: "> "
  if (schema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote))
  }

  // Horizontal rule: "---"
  if (schema.nodes.horizontal_rule) {
    rules.push(
      new InputRule(/^(?:---|—-|___)\s$/, (state, _match, start, end) => {
        const tr = state.tr
        tr.delete(start, end)
        tr.replaceSelectionWith(schema.nodes.horizontal_rule.create())
        return tr
      })
    )
  }

  return rules
}


