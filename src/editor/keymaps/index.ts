import { keymap } from "prosemirror-keymap"
import { baseKeymap, chainCommands, setBlockType } from "prosemirror-commands"
import { undo, redo } from "prosemirror-history"
import { sinkListItem, liftListItem, splitListItem } from "prosemirror-schema-list"
import type { Schema } from "prosemirror-model"

export function buildEditorKeymap(schema: Schema) {
  const keys: Record<string, any> = {
    "Mod-z": undo,
    "Mod-y": redo,
    "Shift-Mod-z": redo,

    // List indent
    Tab: sinkListItem(schema.nodes.list_item),
    "Shift-Tab": liftListItem(schema.nodes.list_item),
  }

  // Notion-like list behavior:
  // - Enter continues list
  // - Enter on empty list item exits to paragraph
  // - Backspace at start/empty lifts out of list to paragraph
  if (schema.nodes.list_item) {
    keys["Enter"] = splitListItem(schema.nodes.list_item)
    keys["Backspace"] = chainCommands(liftListItem(schema.nodes.list_item), baseKeymap.Backspace)
  }

  // Shift+Enter -> hard_break (only meaningful inside textblocks)
  if (schema.nodes.hard_break) {
    keys["Shift-Enter"] = (state: any, dispatch: any) => {
      const { $from } = state.selection
      if (!$from.parent.isTextblock) return false
      if (!dispatch) return true
      dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
      return true
    }
  }

  // Optional: Enter on empty heading could become paragraph, etc. (kept minimal for MVP)
  if (schema.nodes.paragraph) {
    keys["Mod-Alt-0"] = setBlockType(schema.nodes.paragraph)
  }

  return keymap(keys)
}

export const baseKeys = keymap(baseKeymap)


