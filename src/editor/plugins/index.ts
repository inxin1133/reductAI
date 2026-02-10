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
import { listStylePlugin } from "./listStylePlugin"
import { trailingParagraphPlugin } from "./trailingParagraphPlugin"
import { blockInserterPlugin } from "./blockInserterPlugin"
import { blockIdPlugin } from "./blockIdPlugin"
import { tableCellSelectionKeysPlugin } from "./tableCellSelectionKeysPlugin"
import { codeBlockPastePlugin } from "./codeBlockPastePlugin"

export function buildEditorPlugins(schema: Schema, opts?: { mention?: { enabled?: boolean } }) {
  const plugins: any[] = []

  plugins.push(history())
  // Hide the default drop-cursor line; we provide our own drop indicator for block DnD.
  plugins.push(dropCursor({ color: "rgba(0,0,0,0)", width: 0 }))
  plugins.push(gapCursor())

  plugins.push(inputRules({ rules: buildInputRules(schema) }))

  // Paste handling for external code blocks (language inference + attrs)
  plugins.push(codeBlockPastePlugin(schema))

  // Ensure stable blockId on every top-level block (needed for block drag/drop).
  plugins.push(blockIdPlugin(schema))

  // Slash commands should get key events (Enter/Arrows/Escape) BEFORE keymaps consume them.
  plugins.push(slashCommandPlugin(schema))

  // Block inserter (+) on hover. Reuses the same command registry as slash.
  plugins.push(blockInserterPlugin(schema))

  // Mention autocomplete should capture Enter/Arrows/Escape BEFORE keymaps consume them.
  if (opts?.mention?.enabled !== false) {
    plugins.push(mentionPlugin())
  }

  // Tables
  // Keep column resizing (including last column). Also, disable prosemirror-tables from injecting
  // its own TableView NodeView so our custom TableNodeView remains in control.
  plugins.push(columnResizing({ View: null as any }))
  // IMPORTANT: must run before tableEditing() so Arrow keys keep CellSelection (F5-selected cells).
  plugins.push(tableCellSelectionKeysPlugin())
  plugins.push(tableEditing())

  // Keymaps
  plugins.push(buildEditorKeymap(schema))
  plugins.push(baseKeys)

  // List marker styles by nesting depth (disc/circle/square and 1/a/i/A/I by default)
  plugins.push(listStylePlugin(schema))

  // Always keep a writable trailing paragraph after the last block (Notion-like)
  plugins.push(trailingParagraphPlugin(schema))

  return plugins
}


