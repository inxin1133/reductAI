import { history } from "prosemirror-history"
import { dropCursor } from "prosemirror-dropcursor"
import { gapCursor } from "prosemirror-gapcursor"
import { inputRules } from "prosemirror-inputrules"
import { columnResizing, tableEditing } from "prosemirror-tables"
import type { Schema } from "prosemirror-model"

import { buildInputRules } from "./inputRules"
import { buildEditorKeymap, baseKeys } from "../keymaps"
import { mentionPlugin } from "./mentionPlugin"
import { slashCommandPlugin } from "./slashCommandPlugin"

export function buildEditorPlugins(schema: Schema, opts?: { mention?: { enabled?: boolean } }) {
  const plugins: any[] = []

  plugins.push(history())
  plugins.push(dropCursor())
  plugins.push(gapCursor())

  plugins.push(inputRules({ rules: buildInputRules(schema) }))

  // Tables
  plugins.push(columnResizing())
  plugins.push(tableEditing())

  // Keymaps
  plugins.push(buildEditorKeymap(schema))
  plugins.push(baseKeys)

  // Slash commands (Notion-style)
  plugins.push(slashCommandPlugin(schema))

  // Mention autocomplete (mock)
  if (opts?.mention?.enabled !== false) {
    plugins.push(mentionPlugin())
  }

  return plugins
}


