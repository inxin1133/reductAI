import { Schema } from "prosemirror-model"
import { schema as basicSchema } from "prosemirror-schema-basic"
import { addListNodes } from "prosemirror-schema-list"
import { tableNodes } from "prosemirror-tables"

import { paragraphNodeSpec } from "../nodes/paragraph"
import { headingNodeSpec } from "../nodes/heading"
import { blockquoteNodeSpec } from "../nodes/blockquote"
import { codeBlockNodeSpec } from "../nodes/code_block"
import { bulletListNodeSpec } from "../nodes/bullet_list"
import { orderedListNodeSpec } from "../nodes/ordered_list"
import { listItemNodeSpec } from "../nodes/list_item"
import { imageNodeSpec } from "../nodes/image"
import { audioNodeSpec } from "../nodes/audio"
import { videoNodeSpec } from "../nodes/video"
import { mentionNodeSpec } from "../nodes/mention"
import { pageLinkNodeSpec } from "../nodes/page_link"
import { inlineIconNodeSpec } from "../nodes/inline_icon"
import { tableCellNodeSpec, tableHeaderNodeSpec, tableNodeSpec, tableRowNodeSpec } from "../nodes/table"
import { horizontalRuleNodeSpec } from "../nodes/horizontal_rule"

import { strongMarkSpec } from "../marks/strong"
import { emMarkSpec } from "../marks/em"
import { codeMarkSpec } from "../marks/code"
import { linkMarkSpec } from "../marks/link"
import { underlineMarkSpec } from "../marks/underline"
import { strikeMarkSpec } from "../marks/strike"
import { textColorMarkSpec } from "../marks/text_color"

// Notion-like: top-level blocks in doc.content
const baseNodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")
  // Override basic block nodes for easier styling/tag control
  .update("paragraph", paragraphNodeSpec)
  .update("heading", headingNodeSpec)
  .update("blockquote", blockquoteNodeSpec)
  .update("code_block", codeBlockNodeSpec)
  .update("horizontal_rule", horizontalRuleNodeSpec)
  // Override list nodes for marker/style control
  .update("bullet_list", bulletListNodeSpec)
  .update("ordered_list", orderedListNodeSpec)
  .update("list_item", listItemNodeSpec)

const baseMarks = basicSchema.spec.marks
  // Override basic marks for easier styling/tag control
  .update("strong", strongMarkSpec)
  .update("em", emMarkSpec)
  .update("code", codeMarkSpec)

export const editorSchema = new Schema({
  nodes: baseNodes
    // tables
    .append(
      tableNodes({
        tableGroup: "block",
        cellContent: "block+",
        cellAttributes: {},
      })
    )
    // Override table nodes for easier styling/tag control
    .update("table", tableNodeSpec)
    .update("table_row", tableRowNodeSpec)
    .update("table_cell", tableCellNodeSpec)
    .update("table_header", tableHeaderNodeSpec)
    // custom block/inline nodes
    .addToEnd("image", imageNodeSpec)
    .addToEnd("audio", audioNodeSpec)
    .addToEnd("video", videoNodeSpec)
    .addToEnd("page_link", pageLinkNodeSpec)
    .addToEnd("inline_icon", inlineIconNodeSpec)
    .addToEnd("mention", mentionNodeSpec),
  marks: baseMarks
    .addToEnd("underline", underlineMarkSpec)
    .addToEnd("strike", strikeMarkSpec)
    .addToEnd("text_color", textColorMarkSpec)
    .addToEnd("link", linkMarkSpec),
})


