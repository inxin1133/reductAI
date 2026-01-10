import type { Schema } from "prosemirror-model"
import { InputRule, wrappingInputRule, textblockTypeInputRule } from "prosemirror-inputrules"

function markInputRule(regexp: RegExp, markType: any) {
  return new InputRule(regexp, (state, match, start, end) => {
    const m = match[match.length - 1]
    if (!m) return null
    const tr = state.tr
    const textStart = start + match[0].indexOf(m)
    const textEnd = textStart + m.length
    if (textEnd < end) tr.delete(textEnd, end)
    if (start < textStart) tr.delete(start, textStart)
    tr.addMark(start, start + m.length, markType.create())
    tr.removeStoredMark(markType)
    return tr
  })
}

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

  // Blockquote: '" ' (quote + space) -> blockquote (Korean keyboard friendly)
  if (schema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^"\s$/, schema.nodes.blockquote))
  }

  // Inline code: `text` -> code mark
  if (schema.marks.code) {
    // Similar to prosemirror example: apply code mark and strip backticks.
    rules.push(markInputRule(/`([^`]+)`$/, schema.marks.code))
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


