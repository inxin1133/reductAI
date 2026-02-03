import type { Schema } from "prosemirror-model"
import { Fragment } from "prosemirror-model"
import { TextSelection } from "prosemirror-state"
import { InputRule, wrappingInputRule, textblockTypeInputRule } from "prosemirror-inputrules"

const CODE_BLOCK_PREF_KEY = "reductai:code-block-settings"

function readCodeBlockPrefs(): { language?: string; wrap?: boolean; lineNumbers?: boolean } {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(CODE_BLOCK_PREF_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { language?: string; wrap?: boolean; lineNumbers?: boolean }
    if (!parsed || typeof parsed !== "object") return {}
    return parsed
  } catch {
    return {}
  }
}

function getCodeBlockDefaultAttrs() {
  const prefs = readCodeBlockPrefs()
  return {
    language: String(prefs.language || "plain"),
    wrap: prefs.wrap ?? true,
    lineNumbers: prefs.lineNumbers === true,
  }
}

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

function multiMarkInputRule(regexp: RegExp, markTypes: any[]) {
  return new InputRule(regexp, (state, match, start, end) => {
    const m = match[match.length - 1]
    if (!m) return null
    const tr = state.tr
    const textStart = start + match[0].indexOf(m)
    const textEnd = textStart + m.length
    if (textEnd < end) tr.delete(textEnd, end)
    if (start < textStart) tr.delete(start, textStart)
    for (const mt of markTypes) {
      if (!mt) continue
      tr.addMark(start, start + m.length, mt.create())
    }
    for (const mt of markTypes) {
      if (!mt) continue
      tr.removeStoredMark(mt)
    }
    return tr
  })
}

function isInCodeContext(state: any, schema: Schema): boolean {
  try {
    const $from = state.selection?.$from
    if ($from?.parent && schema.nodes.code_block && $from.parent.type === schema.nodes.code_block) return true
    const codeMark = schema.marks.code
    if (codeMark) {
      const marks = typeof $from?.marks === "function" ? $from.marks() : []
      if (Array.isArray(marks) && marks.some((m: any) => m?.type === codeMark)) return true
      const stored = state.storedMarks
      if (Array.isArray(stored) && stored.some((m: any) => m?.type === codeMark)) return true
    }
  } catch {
    // ignore
  }
  return false
}

function textReplaceRule(regexp: RegExp, replacement: string) {
  return new InputRule(regexp, (state, _match, start, end) => {
    const schema = state.schema as Schema
    if (isInCodeContext(state, schema)) return null
    const tr = state.tr
    tr.insertText(replacement, start, end)
    return tr
  })
}

function setCursorInsideFirstTextblock(tr: any, rangeFrom: number, rangeTo: number) {
  let targetPos: number | null = null
  tr.doc.nodesBetween(Math.max(0, rangeFrom), Math.min(tr.doc.content.size, rangeTo), (node: any, pos: number) => {
    if (targetPos != null) return false
    if (node.isTextblock) {
      targetPos = pos + 1
      return false
    }
    return true
  })
  if (targetPos != null) {
    try {
      tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos)))
    } catch {
      // ignore
    }
  }
}

// Build input rules:
// - "- " -> bullet_list
// - "1. " -> ordered_list
// - "# " -> heading (levels 1-3)
// - "---" -> horizontal_rule
export function buildInputRules(schema: Schema) {
  const rules: any[] = []

  // ------------------------------------------------------------
  // 1-4) Arrow replacements (order matters: <-> before <- / ->)
  // ------------------------------------------------------------
  // If "<-" already became "←", typing ">" should produce "↔".
  rules.push(textReplaceRule(/←>$/, "↔"))
  rules.push(textReplaceRule(/<->$/, "↔"))
  rules.push(textReplaceRule(/->$/, "→"))
  rules.push(textReplaceRule(/<-\s?$/, "←")) // allow "<-" at end (best-effort)
  rules.push(textReplaceRule(/=>$/, "⇒"))

  // ------------------------------------------------------------
  // 5-6, 11-12) Inline marks
  // - Order matters: *** before ** before *
  // ------------------------------------------------------------
  // 12 + 11) ***content*** -> strong + em
  if (schema.marks.strong && schema.marks.em) {
    rules.push(multiMarkInputRule(/\*\*\*([^*]+)\*\*\*$/, [schema.marks.strong, schema.marks.em]))
  }
  // 12) **content** -> strong
  if (schema.marks.strong) {
    rules.push(markInputRule(/\*\*([^*]+)\*\*$/, schema.marks.strong))
  }
  // 11) *content* -> em (avoid consuming **content**)
  if (schema.marks.em) {
    // use lookarounds so **...** doesn't get captured as *...*
    rules.push(markInputRule(/(?<!\*)\*([^*]+)\*(?!\*)$/, schema.marks.em))
  }

  // 5) Underline: _content_
  if (schema.marks.underline) {
    rules.push(markInputRule(/_([^_]+)_$/, schema.marks.underline))
  }

  // 6) Strikethrough: ~content~ or ~~content~~
  if (schema.marks.strike) {
    // prefer ~~ ~~ first
    rules.push(markInputRule(/~~([^~]+)~~$/, schema.marks.strike))
    rules.push(markInputRule(/~([^~]+)~$/, schema.marks.strike))
  }

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

  // 7-8) Checklist shortcuts:
  // - "[] content"  -> checklist item (unchecked)
  // - "[x] content" -> checklist item (checked)
  if (schema.nodes.bullet_list && schema.nodes.list_item && schema.nodes.paragraph) {
    rules.push(
      new InputRule(/^\[\]\s(.*)$/, (state, match, start, end) => {
        if (isInCodeContext(state, schema)) return null
        const $from = state.selection.$from
        // Only at start of a top-level paragraph (avoid breaking nested block constraints)
        if ($from.depth !== 1) return null
        if (start !== $from.start()) return null
        const text = String(match?.[1] ?? "")
        const li = schema.nodes.list_item.create({ checked: false }, [
          schema.nodes.paragraph.create(null, text ? schema.text(text) : null),
        ])
        const ul = schema.nodes.bullet_list.create({ listKind: "check" }, [li])
        const from = $from.before($from.depth)
        const to = $from.after($from.depth)
        const tr = state.tr.replaceWith(from, to, ul)
        // Place cursor inside the created list_item paragraph (right after any carried text)
        const base = from + 3 // doc -> bullet_list (from) -> list_item -> paragraph -> text start
        const caret = Math.min(tr.doc.content.size - 1, Math.max(0, base + text.length))
        try {
          tr.setSelection(TextSelection.create(tr.doc, caret))
        } catch {
          // ignore
        }
        return tr
      })
    )
    rules.push(
      new InputRule(/^\[(x|X)\]\s(.*)$/, (state, match, start, end) => {
        if (isInCodeContext(state, schema)) return null
        const $from = state.selection.$from
        if ($from.depth !== 1) return null
        if (start !== $from.start()) return null
        const text = String(match?.[2] ?? "")
        const li = schema.nodes.list_item.create({ checked: true }, [
          schema.nodes.paragraph.create(null, text ? schema.text(text) : null),
        ])
        const ul = schema.nodes.bullet_list.create({ listKind: "check" }, [li])
        const from = $from.before($from.depth)
        const to = $from.after($from.depth)
        const tr = state.tr.replaceWith(from, to, ul)
        const base = from + 3
        const caret = Math.min(tr.doc.content.size - 1, Math.max(0, base + text.length))
        try {
          tr.setSelection(TextSelection.create(tr.doc, caret))
        } catch {
          // ignore
        }
        return tr
      })
    )
  }

  // Inline code: `text` -> code mark (+ trailing space to exit code)
  if (schema.marks.code) {
    const codeMark = schema.marks.code
    rules.push(
      new InputRule(/`([^`]+)`$/, (state, match, start, end) => {
        const m = match[match.length - 1]
        if (!m) return null
        const tr = state.tr
        const textStart = start + match[0].indexOf(m)
        const textEnd = textStart + m.length
        if (textEnd < end) tr.delete(textEnd, end)
        if (start < textStart) tr.delete(start, textStart)
        tr.addMark(start, start + m.length, codeMark.create())
        tr.removeStoredMark(codeMark)

        const spacePos = start + m.length
        const nextPos = Math.min(spacePos + 1, tr.doc.content.size)
        const nextChar = tr.doc.textBetween(spacePos, nextPos, "\0", "\0")
        if (nextChar === " ") {
          if (tr.doc.rangeHasMark(spacePos, spacePos + 1, codeMark)) {
            tr.removeMark(spacePos, spacePos + 1, codeMark)
          }
        } else {
          tr.insert(spacePos, schema.text(" "))
        }
        const selPos = Math.min(tr.doc.content.size, spacePos + 1)
        try {
          tr.setSelection(TextSelection.create(tr.doc, selPos))
        } catch {
          // ignore
        }
        return tr
      })
    )
  }

  // 9) Code block: ``` (only at the start of a top-level paragraph)
  if (schema.nodes.code_block) {
    rules.push(
      new InputRule(/^```(.*)$/, (state, match, start, end) => {
        if (isInCodeContext(state, schema)) return null
        const rest = String(match?.[1] ?? "").replace(/^\s+/, "")
        const $from = state.selection.$from
        // Must be at the start of the current textblock
        if (start !== $from.start()) return null
        const tr = state.tr
        // Delete the triple backticks only; keep the rest as code content.
        tr.delete(start, Math.min(end, start + 3))
        // Convert current block to code_block
        tr.setBlockType(tr.selection.from, tr.selection.to, schema.nodes.code_block, getCodeBlockDefaultAttrs())
        // Ensure cursor is inside the code_block
        setCursorInsideFirstTextblock(tr, $from.before($from.depth), $from.after($from.depth))
        return tr
      })
    )
  }

  // Horizontal rule: "---"
  if (schema.nodes.horizontal_rule) {
    rules.push(
      new InputRule(/^(?:---|—-|___)\s$/, (state, _match, start, end) => {
        if (isInCodeContext(state, schema)) return null
        const tr = state.tr
        tr.delete(start, end)
        tr.replaceSelectionWith(schema.nodes.horizontal_rule.create())
        return tr
      })
    )

    // 10) "---" -> horizontal rule (only at start of a paragraph)
    // If there is trailing text, push it into a new paragraph below.
    rules.push(
      new InputRule(/^---(.*)$/, (state, match, start, end) => {
        if (isInCodeContext(state, schema)) return null
        const $from = state.selection.$from
        if (start !== $from.start()) return null
        const restRaw = String(match?.[1] ?? "")
        const rest = restRaw.replace(/^\s+/, "")
        const hr = schema.nodes.horizontal_rule.create()
        const p = schema.nodes.paragraph
        if (!p) return null
        const para = p.create(null, rest ? schema.text(rest) : null)
        const frag = Fragment.fromArray([hr, para])
        // Replace the whole current textblock with HR + paragraph
        const from = $from.before($from.depth)
        const to = $from.after($from.depth)
        const tr = state.tr.replaceWith(from, to, frag)
        // Place cursor into the paragraph after HR (so user can keep typing)
        setCursorInsideFirstTextblock(tr, from, Math.min(tr.doc.content.size, from + hr.nodeSize + para.nodeSize + 10))
        return tr
      })
    )
  }

  return rules
}


