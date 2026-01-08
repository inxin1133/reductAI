import { Schema } from "prosemirror-model"
import { schema as basicSchema } from "prosemirror-schema-basic"
import { addListNodes } from "prosemirror-schema-list"
import { tableNodes } from "prosemirror-tables"

import { imageNodeSpec } from "../nodes/image"
import { mentionNodeSpec } from "../nodes/mention"
import { pageLinkNodeSpec } from "../nodes/page_link"

import { linkMarkSpec } from "../marks/link"

// Notion-like: top-level blocks in doc.content
const baseNodes = addListNodes(basicSchema.spec.nodes, "paragraph block*", "block")

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
    // custom block/inline nodes
    .addToEnd("image", imageNodeSpec)
    .addToEnd("page_link", pageLinkNodeSpec)
    .addToEnd("mention", mentionNodeSpec),
  marks: basicSchema.spec.marks.addToEnd("link", linkMarkSpec),
})


