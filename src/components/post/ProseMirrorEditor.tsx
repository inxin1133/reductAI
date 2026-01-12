import { useEffect, useMemo, useRef, useState } from "react"
import { EditorState, type Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { DOMParser as PMDOMParser } from "prosemirror-model"
import { Button } from "@/components/ui/button"
import { editorSchema } from "../../editor/schema"
import { buildEditorPlugins } from "../../editor/plugins"
import { PageLinkNodeView } from "../../editor/nodes/page_link_nodeview"
import { CodeBlockNodeView } from "../../editor/nodes/code_block_nodeview"
import { ListItemNodeView } from "../../editor/nodes/list_item_nodeview"
import { TableNodeView } from "../../editor/nodes/table_nodeview"
import { blockInserterKey, type BlockInserterState } from "../../editor/plugins/blockInserterPlugin"
import { getBlockCommandRegistry } from "../../editor/commands/blockCommandRegistry"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ButtonGroup, ButtonGroupItem } from "@/components/ui/button-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  cmdBlockquote,
  cmdBulletList,
  cmdChecklist,
  cmdCodeBlock,
  cmdHeading,
  cmdDuplicateBlock,
  cmdInsertImage,
  cmdInsertMention,
  cmdInsertPageLink,
  cmdInsertHorizontalRule,
  cmdOrderedList,
  cmdParagraph,
  cmdToggleBold,
  cmdToggleUnderline,
  cmdToggleStrikethrough,
  cmdSetTextColor,
  cmdClearTextColor,
  cmdSetBlockBgColor,
  cmdClearBlockBgColor,
  cmdToggleCodeMark,
  cmdToggleItalic,
  cmdInsertTable,
  cmdSetTableCellAlign,
  tableCommands,
} from "../../editor/commands"
import { exportMarkdown } from "../../editor/serializers/markdown"
import { isInTable as pmIsInTable, selectedRect as pmSelectedRect, selectionCell as pmSelectionCell } from "prosemirror-tables"
import { 
  ChevronRight, 
  ChevronDown,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  CodeXml,
  Link,
  Palette,
  Type,
  Heading1,
  Heading2,
  Heading3,  
  List,
  ListOrdered,
  ListTodo,  
  Quote,
  CopyPlus,
  SquareCode,
  AtSign,
  Image,
  TextAlignStart,
  TextAlignCenter,
  TextAlignEnd,
  Minus,  
  Link2,
  File,
  PaintBucket,  
  Grid2X2,
  TableCellsMerge,    
  TableCellsSplit,      
  BetweenHorizontalStart,  
  BetweenVerticalStart,   
  FoldHorizontal,
  FoldVertical,
  Grid2X2X, 
} from "lucide-react"

type PmDocJson = unknown
type PmCommand = (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => boolean
type MenuAnchor = { left: number; top: number; width: number; height: number }

type Props = {
  initialDocJson?: PmDocJson
  onChange?: (docJson: PmDocJson) => void
}

function ToolbarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

const TEXT_COLOR_PRESETS_500: Array<{ key: string; label: string; textClass: string; bgClass: string }> = [
  { key: "slate-500", label: "slate-500", textClass: "text-slate-500", bgClass: "bg-slate-500" },
  { key: "gray-500", label: "gray-500", textClass: "text-gray-500", bgClass: "bg-gray-500" },
  { key: "zinc-500", label: "zinc-500", textClass: "text-zinc-500", bgClass: "bg-zinc-500" },
  { key: "neutral-500", label: "neutral-500", textClass: "text-neutral-500", bgClass: "bg-neutral-500" },
  { key: "stone-500", label: "stone-500", textClass: "text-stone-500", bgClass: "bg-stone-500" },
  { key: "red-500", label: "red-500", textClass: "text-red-500", bgClass: "bg-red-500" },
  { key: "orange-500", label: "orange-500", textClass: "text-orange-500", bgClass: "bg-orange-500" },
  { key: "amber-500", label: "amber-500", textClass: "text-amber-500", bgClass: "bg-amber-500" },
  { key: "yellow-500", label: "yellow-500", textClass: "text-yellow-500", bgClass: "bg-yellow-500" },
  { key: "lime-500", label: "lime-500", textClass: "text-lime-500", bgClass: "bg-lime-500" },
  { key: "green-500", label: "green-500", textClass: "text-green-500", bgClass: "bg-green-500" },
  { key: "emerald-500", label: "emerald-500", textClass: "text-emerald-500", bgClass: "bg-emerald-500" },
  { key: "teal-500", label: "teal-500", textClass: "text-teal-500", bgClass: "bg-teal-500" },
  { key: "cyan-500", label: "cyan-500", textClass: "text-cyan-500", bgClass: "bg-cyan-500" },
  { key: "sky-500", label: "sky-500", textClass: "text-sky-500", bgClass: "bg-sky-500" },
  { key: "blue-500", label: "blue-500", textClass: "text-blue-500", bgClass: "bg-blue-500" },
  { key: "indigo-500", label: "indigo-500", textClass: "text-indigo-500", bgClass: "bg-indigo-500" },
  { key: "violet-500", label: "violet-500", textClass: "text-violet-500", bgClass: "bg-violet-500" },
  { key: "purple-500", label: "purple-500", textClass: "text-purple-500", bgClass: "bg-purple-500" },
  { key: "fuchsia-500", label: "fuchsia-500", textClass: "text-fuchsia-500", bgClass: "bg-fuchsia-500" },
  { key: "pink-500", label: "pink-500", textClass: "text-pink-500", bgClass: "bg-pink-500" },
  { key: "rose-500", label: "rose-500", textClass: "text-rose-500", bgClass: "bg-rose-500" },
]

const BLOCK_BG_PRESETS_100: Array<{ key: string; label: string; bgClass: string }> = [
  { key: "slate-100", label: "slate-100", bgClass: "bg-slate-100" },
  { key: "gray-100", label: "gray-100", bgClass: "bg-gray-100" },
  { key: "zinc-100", label: "zinc-100", bgClass: "bg-zinc-100" },
  { key: "neutral-100", label: "neutral-100", bgClass: "bg-neutral-100" },
  { key: "stone-100", label: "stone-100", bgClass: "bg-stone-100" },
  { key: "red-100", label: "red-100", bgClass: "bg-red-100" },
  { key: "orange-100", label: "orange-100", bgClass: "bg-orange-100" },
  { key: "amber-100", label: "amber-100", bgClass: "bg-amber-100" },
  { key: "yellow-100", label: "yellow-100", bgClass: "bg-yellow-100" },
  { key: "lime-100", label: "lime-100", bgClass: "bg-lime-100" },
  { key: "green-100", label: "green-100", bgClass: "bg-green-100" },
  { key: "emerald-100", label: "emerald-100", bgClass: "bg-emerald-100" },
  { key: "teal-100", label: "teal-100", bgClass: "bg-teal-100" },
  { key: "cyan-100", label: "cyan-100", bgClass: "bg-cyan-100" },
  { key: "sky-100", label: "sky-100", bgClass: "bg-sky-100" },
  { key: "blue-100", label: "blue-100", bgClass: "bg-blue-100" },
  { key: "indigo-100", label: "indigo-100", bgClass: "bg-indigo-100" },
  { key: "violet-100", label: "violet-100", bgClass: "bg-violet-100" },
  { key: "purple-100", label: "purple-100", bgClass: "bg-purple-100" },
  { key: "fuchsia-100", label: "fuchsia-100", bgClass: "bg-fuchsia-100" },
  { key: "pink-100", label: "pink-100", bgClass: "bg-pink-100" },
  { key: "rose-100", label: "rose-100", bgClass: "bg-rose-100" },
]

function getEmptyDoc() {
  const wrap = document.createElement("div")
  wrap.innerHTML = "<p></p>"
  return PMDOMParser.fromSchema(editorSchema).parse(wrap)
}

export function ProseMirrorEditor({ initialDocJson, onChange }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const embedIdsRef = useRef<Set<string>>(new Set())

  const [markdown, setMarkdown] = useState("")
  const [docJson, setDocJson] = useState<PmDocJson>(initialDocJson ?? null)

  const TOOLBAR_OPEN_KEY = "reductai:pmEditor:toolbarOpen"
  const [toolbarOpen, setToolbarOpen] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return false
      return window.localStorage.getItem(TOOLBAR_OPEN_KEY) === "1"
    } catch {
      return false
    }
  })
  const [textColorOpen, setTextColorOpen] = useState(false)
  const [blockBgOpen, setBlockBgOpen] = useState(false)

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      window.localStorage.setItem(TOOLBAR_OPEN_KEY, toolbarOpen ? "1" : "0")
    } catch {
      // ignore (storage might be blocked)
    }
  }, [toolbarOpen])

  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const [blockMenuAnchor, setBlockMenuAnchor] = useState<MenuAnchor | null>(null)
  const [blockMenuQuery, setBlockMenuQuery] = useState("")
  const blockMenuInputRef = useRef<HTMLInputElement | null>(null)
  const blockMenuSigRef = useRef<string>("")
  const [tableInsertOpen, setTableInsertOpen] = useState(false)
  const [tableGridHover, setTableGridHover] = useState<{ rows: number; cols: number }>({ rows: 1, cols: 1 })

  // Mention (@) is temporarily disabled (it caused runaway update loops / freezes).
  const plugins = useMemo(() => buildEditorPlugins(editorSchema, { mention: { enabled: false } }), [])

  const blockCommands = useMemo(() => {
    const items = getBlockCommandRegistry(editorSchema)
    return items.map((c) => ({ key: c.key, title: c.title, keywords: c.keywords }))
  }, [])

  const filteredBlockCommands = useMemo(() => {
    const q = blockMenuQuery.trim().toLowerCase()
    if (!q) return blockCommands
    return blockCommands.filter(
      (c) => c.key.startsWith(q) || c.keywords.some((k) => String(k || "").toLowerCase().startsWith(q))
    )
  }, [blockCommands, blockMenuQuery])

  useEffect(() => {
    if (!mountRef.current) return
    if (viewRef.current) return

    const doc =
      initialDocJson && typeof initialDocJson === "object"
        ? editorSchema.nodeFromJSON(initialDocJson)
        : getEmptyDoc()

    const state = EditorState.create({
      schema: editorSchema,
      doc,
      plugins,
    })

    const view = new EditorView(mountRef.current, {
      state,
      nodeViews: {
        page_link: (node, view, getPos) => new PageLinkNodeView(node, view, getPos as () => number),
        code_block: (node, view, getPos) => new CodeBlockNodeView(node, view, getPos as () => number),
        list_item: (node, view, getPos) => new ListItemNodeView(node, view, getPos as () => number),
        table: (node, view, getPos) => new TableNodeView(node, view, getPos as () => number),
      },
      // NOTE:
      // ProseMirror can dispatch transactions during EditorView construction (e.g. plugin views).
      // If we close over `const view` here, it can hit TDZ ("Cannot access 'view' before initialization").
      // Use `this` instead.
      dispatchTransaction: function (this: EditorView, tr) {
        // IMPORTANT:
        // Use applyTransaction (not apply) so plugin appendTransaction hooks run.
        // This is required for normalization plugins (e.g. listStylePlugin).
        const result = this.state.applyTransaction(tr)
        const nextState = result.state
        this.updateState(nextState)

        // Detect removed embed blocks (page_link with display=embed) so we can soft-delete the underlying child pages.
        // This is an optimistic UX layer; server also enforces deletion on save.
        const nextEmbedIds = new Set<string>()
        nextState.doc.descendants((node) => {
          if (node.type === editorSchema.nodes.page_link) {
            const attrs = (node.attrs || {}) as Record<string, unknown>
            const display = typeof attrs.display === "string" ? attrs.display : ""
            const pageId = typeof attrs.pageId === "string" ? attrs.pageId : ""
            if (display === "embed" && pageId) nextEmbedIds.add(pageId)
          }
          return true
        })
        const removed: string[] = []
        const added: string[] = []
        for (const pid of embedIdsRef.current) {
          if (!nextEmbedIds.has(pid)) removed.push(pid)
        }
        for (const pid of nextEmbedIds) {
          if (!embedIdsRef.current.has(pid)) added.push(pid)
        }
        if (removed.length) {
          window.dispatchEvent(new CustomEvent("reductai:embed-removed", { detail: { pageIds: removed } }))
        }
        if (added.length) {
          window.dispatchEvent(new CustomEvent("reductai:embed-added", { detail: { pageIds: added } }))
        }
        embedIdsRef.current = nextEmbedIds

        const json = nextState.doc.toJSON()
        setDocJson(json)
        onChange?.(json)
        setMarkdown(exportMarkdown(editorSchema, nextState.doc))

        // Sync block inserter menu state for the React DropdownMenu overlay.
        const ui = blockInserterKey.getState(nextState) as BlockInserterState | undefined
        const open = Boolean(ui?.menuOpen)
        const anchor = ui?.menuAnchor || null
        const sig = `${open ? 1 : 0}:${anchor ? `${Math.round(anchor.left)},${Math.round(anchor.top)},${Math.round(anchor.width)},${Math.round(anchor.height)}` : ""}`
        if (sig !== blockMenuSigRef.current) {
          blockMenuSigRef.current = sig
          setBlockMenuOpen(open)
          setBlockMenuAnchor(anchor)
          if (!open) setBlockMenuQuery("")
        }
      },
      attributes: {
        class: "pm-editor ProseMirror",
      },
    })
    viewRef.current = view

    // Initialize embed id set from initial doc so first deletion is tracked correctly.
    const initEmbeds = new Set<string>()
    view.state.doc.descendants((node) => {
      if (node.type === editorSchema.nodes.page_link) {
        const attrs = (node.attrs || {}) as Record<string, unknown>
        const display = typeof attrs.display === "string" ? attrs.display : ""
        const pageId = typeof attrs.pageId === "string" ? attrs.pageId : ""
        if (display === "embed" && pageId) initEmbeds.add(pageId)
      }
      return true
    })
    embedIdsRef.current = initEmbeds

    // When a page title changes elsewhere (e.g., editing child page title), update any embed/link blocks
    // that reference that pageId so the parent page shows the latest title automatically.
    const onTitleUpdated = (e: Event) => {
      const ce = e as CustomEvent<{ postId?: string; title?: string }>
      const pageId = String(ce.detail?.postId || "")
      const nextTitle = String(ce.detail?.title || "")
      if (!pageId || !nextTitle) return
      const v = viewRef.current
      if (!v) return

      let tr = v.state.tr
      let changed = false
      v.state.doc.descendants((node, pos) => {
        if (node.type === editorSchema.nodes.page_link) {
          const attrs = (node.attrs || {}) as Record<string, unknown>
          const curPageId = typeof attrs.pageId === "string" ? attrs.pageId : ""
          const curTitle = typeof attrs.title === "string" ? attrs.title : ""
          if (curPageId === pageId && curTitle !== nextTitle) {
            tr = tr.setNodeMarkup(pos, undefined, { ...(attrs as Record<string, unknown>), title: nextTitle })
            changed = true
          }
        }
        return true
      })
      if (changed) v.dispatch(tr)
    }
    window.addEventListener("reductai:page-title-updated", onTitleUpdated as EventListener)

    // init derived views
    setMarkdown(exportMarkdown(editorSchema, doc))
    setDocJson(doc.toJSON())
    onChange?.(doc.toJSON())

    return () => {
      window.removeEventListener("reductai:page-title-updated", onTitleUpdated as EventListener)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Focus the menu search input when opened.
  useEffect(() => {
    if (!blockMenuOpen) return
    window.setTimeout(() => blockMenuInputRef.current?.focus(), 0)
  }, [blockMenuOpen])

  const closeBlockMenu = () => {
    const v = viewRef.current
    if (!v) return
    v.dispatch(v.state.tr.setMeta(blockInserterKey, { menuOpen: false, query: "", menuAnchor: null }))
  }

  const runBlockMenuCommand = (commandKey: string, side: "before" | "after") => {
    window.dispatchEvent(new CustomEvent("reductai:block-inserter:run", { detail: { commandKey, side } }))
  }

  const run = (cmd: PmCommand) => {
    const view = viewRef.current
    if (!view) return
    cmd(view.state, view.dispatch, view)
    view.focus()
  }

  const runFromToolbar = (e: React.MouseEvent, cmd: PmCommand) => {
    // Prevent toolbar click from stealing focus/selection from the editor.
    e.preventDefault()
    run(cmd)
  }

  const insertTableFromPopover = (e: React.MouseEvent, rows: number, cols: number) => {
    runFromToolbar(e, cmdInsertTable(editorSchema, { rows, cols }))
    setTableInsertOpen(false)
  }

  const tableActive = (() => {
    const v = viewRef.current
    if (!v) return false
    try {
      return pmIsInTable(v.state)
    } catch {
      return false
    }
  })()

  const tableCanSplit = (() => {
    const v = viewRef.current
    if (!v) return false
    const state = v.state
    try {
      if (!pmIsInTable(state)) return false

      // If there is a cell selection (drag selection), check whether any selected cell is merged.
      const rect = pmSelectedRect(state)
      const map = rect.map
      for (let r = rect.top; r < rect.bottom; r += 1) {
        for (let c = rect.left; c < rect.right; c += 1) {
          const index = r * map.width + c
          const offset = map.map[index]
          const pos = rect.tableStart + offset
          const cell = state.doc.nodeAt(pos)
          if (!cell) continue
          const attrs = cell.attrs as unknown as { colspan?: number; rowspan?: number }
          if (Number(attrs.colspan || 1) > 1 || Number(attrs.rowspan || 1) > 1) return true
        }
      }
      return false
    } catch {
      // Fallback for normal text selection in a single cell
      try {
        const $cell = pmSelectionCell(state)
        const cell = $cell.parent
        const attrs = cell.attrs as unknown as { colspan?: number; rowspan?: number }
        return Number(attrs.colspan || 1) > 1 || Number(attrs.rowspan || 1) > 1
      } catch {
        return false
      }
    }
  })()

  const insertLink = () => {
    const view = viewRef.current
    if (!view) return
    const href = window.prompt("Link URL?", "https://")
    if (!href) return
    const { state, dispatch } = view
    const mark = editorSchema.marks.link.create({ href })
    dispatch(state.tr.addMark(state.selection.from, state.selection.to, mark))
    view.focus()
  }

  return (
    <div className="w-full">
      {/* Block inserter menu (React / shadcn DropdownMenu) - 블럭 삽입 메뉴 */}
      {blockMenuOpen && blockMenuAnchor ? (
        <DropdownMenu
          open={blockMenuOpen}
          onOpenChange={(open) => {
            if (!open) closeBlockMenu()
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              style={{
                position: "fixed",
                left: Math.round(blockMenuAnchor.left),
                top: Math.round(blockMenuAnchor.top),
                width: Math.max(1, Math.round(blockMenuAnchor.width)),
                height: Math.max(1, Math.round(blockMenuAnchor.height)),
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={6}
            className="w-[320px] p-0"
            onCloseAutoFocus={(e) => {
              // Keep selection stable; the plugin will close the menu and keep the rail visible.
              e.preventDefault()
            }}
          >
            <DropdownMenuLabel className="px-2 py-2">Insert</DropdownMenuLabel>
            <div className="px-2 pb-2">
              <input
                ref={blockMenuInputRef}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none"
                placeholder="Search blocks..."
                value={blockMenuQuery}
                onChange={(e) => setBlockMenuQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Let Esc close the Radix menu.
                  e.stopPropagation()
                }}
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-[320px] overflow-auto p-1">
              {filteredBlockCommands.length === 0 ? (
                <div className="px-2 py-2 text-sm text-muted-foreground">No items</div>
              ) : (
                filteredBlockCommands.map((it) => (
                  <DropdownMenuItem
                    key={it.key}
                    className="flex items-center justify-between gap-2"
                    onSelect={(e) => {
                      // We'll handle clicks ourselves to avoid double-trigger when clicking nested buttons.
                      e.preventDefault()
                    }}
                  >
                    <button
                      type="button"
                      className="flex flex-1 flex-col text-left"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        runBlockMenuCommand(it.key, "after")
                      }}
                    >
                      <div className="text-sm">{it.title}</div>
                      <div className="text-xs text-muted-foreground">/{it.key}</div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-sm border border-border px-2 py-1 text-xs hover:bg-accent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          runBlockMenuCommand(it.key, "before")
                        }}
                      >
                        Above
                      </button>
                      <button
                        type="button"
                        className="rounded-sm border border-border px-2 py-1 text-xs hover:bg-accent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          runBlockMenuCommand(it.key, "after")
                        }}
                      >
                        Below
                      </button>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* Toolbar: use theme-aware background for dark mode - 블럭 에디터 툴바 */}
      <div className=" flex-wrap items-center hidden sm:flex">
      <button
        type="button"
        className="flex w-fit items-center gap-1 p-1 text-foreground text-sm hover:bg-accent rounded-md"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setToolbarOpen((v) => !v)}
        aria-expanded={toolbarOpen}
      >
        {toolbarOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        툴바
      </button>

      {toolbarOpen ? (
        <div className="flex flex-wrap items-center gap-2 p-1">
          {/* 텍스트 형식 */}
          <ButtonGroup>
            <ToolbarTooltip label="Bold">
              <ButtonGroupItem                     
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdToggleBold(editorSchema))}
              >
                <Bold />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Italic">
              <ButtonGroupItem                
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdToggleItalic(editorSchema))}
              >
                <Italic />
              </ButtonGroupItem>
            </ToolbarTooltip>            
            <ToolbarTooltip label="Underline">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdToggleUnderline(editorSchema))}
              >
                <Underline />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Strikethrough">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdToggleStrikethrough(editorSchema))}
              >
                <Strikethrough />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Code">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdToggleCodeMark(editorSchema))}
              >
                <CodeXml />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Link">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertLink()
                }}
              >
                <Link />
              </ButtonGroupItem>
            </ToolbarTooltip>

            <Popover open={textColorOpen} onOpenChange={setTextColorOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <ButtonGroupItem
                      type="button"
                      variant="outline"
                      size="sm"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <Palette />
                    </ButtonGroupItem>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  Text Color
                </TooltipContent>
              </Tooltip>
              <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
                <div className="text-xs font-semibold mb-2">Text color</div>
                <div className="grid grid-cols-6 gap-2">
                  {TEXT_COLOR_PRESETS_500.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={[
                        "size-7 rounded-md border border-border",
                        "hover:opacity-90",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        c.bgClass,
                      ].join(" ")}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        run(cmdSetTextColor(editorSchema, c.key))
                        setTextColorOpen(false)
                      }}
                      aria-label={c.label}
                      title={c.label}
                    />
                  ))}
                </div>
                <div className="mt-3 flex justify-between">
                  <Button                    
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      run(cmdClearTextColor(editorSchema))
                      setTextColorOpen(false)
                    }}
                  >
                    Reset
                  </Button>                  
                </div>
              </PopoverContent>
            </Popover>
          </ButtonGroup>

          {/* 블럭 형식 */}
          <ButtonGroup>
            <ToolbarTooltip label="Text(paragraph)">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdParagraph(editorSchema))}>
                <Type />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="H1">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdHeading(editorSchema, 1))}>
                <Heading1 />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="H2">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdHeading(editorSchema, 2))}>
                <Heading2 />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="H3">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdHeading(editorSchema, 3))}>
                <Heading3 />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Quote">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdBlockquote(editorSchema))}>
                <Quote />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Duplicate Block">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdDuplicateBlock(editorSchema))}>
                <CopyPlus />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Code Block">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdCodeBlock(editorSchema))}>
                <SquareCode />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Bullet">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdBulletList(editorSchema))}>
                <List />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Ordered">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdOrderedList(editorSchema))}>
                <ListOrdered />
              </ButtonGroupItem>
            </ToolbarTooltip>

            <ToolbarTooltip label="Checklist">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdChecklist(editorSchema))}>
                <ListTodo />
              </ButtonGroupItem>
            </ToolbarTooltip>

            <ToolbarTooltip label="HR">
              <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdInsertHorizontalRule(editorSchema))}>
                <Minus />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Background Color">
              <Popover open={blockBgOpen} onOpenChange={setBlockBgOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <ButtonGroupItem
                        type="button"
                        variant="outline"
                        size="sm"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <PaintBucket />
                      </ButtonGroupItem>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    Background Color
                  </TooltipContent>
                </Tooltip>
                <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
                  <div className="text-xs font-semibold mb-2">Block background Color</div>
                  <div className="grid grid-cols-6 gap-2">
                    {BLOCK_BG_PRESETS_100.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className={[
                          "size-7 rounded-md border border-border",
                          "hover:opacity-90",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          c.bgClass,
                        ].join(" ")}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          run(cmdSetBlockBgColor(editorSchema, c.key))
                          setBlockBgOpen(false)
                        }}
                        aria-label={c.label}
                        title={c.label}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        run(cmdClearBlockBgColor(editorSchema))
                        setBlockBgOpen(false)
                      }}
                    >
                      Reset
                    </Button>                    
                  </div>
                </PopoverContent>
              </Popover>
            </ToolbarTooltip>
          </ButtonGroup>

          
         

          {/* 미디어 삽입 */}
          <ButtonGroup>
            <ToolbarTooltip label="Image">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const src = window.prompt("Image URL?", "https://")
                  if (!src) return
                  run(cmdInsertImage(editorSchema, { src }))
                }}
              >
                <Image />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Mention">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const label = window.prompt("Mention label?", "kangwoo") || ""
                  if (!label) return
                  run(cmdInsertMention(editorSchema, { id: `mock_${label}`, label, type: "user" }))
                }}
              >
               <AtSign />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Page Link">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const pageId = window.prompt("Target pageId (posts.id)?", "") || ""
                  if (!pageId) return
                  const title = window.prompt("Title (optional)", "") || ""
                  run(cmdInsertPageLink(editorSchema, { pageId, title, display: "link" }))
                }}
              >
                <Link2 />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="New Page">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const token = localStorage.getItem("token")
                  if (!token) return
                  void (async () => {
                    const m = window.location.pathname.match(/^\/posts\/([^/]+)\/edit/)
                    const parent_id = m?.[1] && m[1] !== "new" ? m[1] : null
                    const r = await fetch(`/api/posts`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ title: "New page", page_type: "page", status: "draft", visibility: "private", parent_id }),
                    })
                    if (!r.ok) return
                    const j = await r.json()
                    const pageId = typeof j.id === "string" ? j.id : ""
                    if (!pageId) return
                    window.dispatchEvent(new CustomEvent("reductai:page-created", { detail: { postId: pageId, parent_id, title: "New page" } }))
                    // Always leave a visible "title + link" in the parent page.
                    run(cmdInsertPageLink(editorSchema, { pageId, title: "New page", display: "embed" }))
                    window.dispatchEvent(
                      new CustomEvent("reductai:open-post", { detail: { postId: pageId, focusTitle: true, forceSave: true } })
                    )
                  })()
                }}
              >
                <File />
              </ButtonGroupItem>
            </ToolbarTooltip>
          </ButtonGroup>

          {/* 테이블 형식 */}
          <ButtonGroup>

            <ToolbarTooltip label="Insert Table">
              <Popover open={tableInsertOpen} onOpenChange={setTableInsertOpen}>
                <PopoverTrigger asChild>
                  <ButtonGroupItem
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => {
                      // Don't steal selection from editor; Popover will open on click.
                      e.preventDefault()
                    }}
                  >
                    <Grid2X2 />
                  </ButtonGroupItem>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[180px] p-2"
                  align="start"
                  onOpenAutoFocus={(e) => {
                    // Keep editor selection stable when opening the Popover.
                    e.preventDefault()
                  }}
                >
                  <div className="flex items-center justify-between px-1 pb-2">
                    <div className="text-xs font-medium text-muted-foreground">Insert table</div>
                    <div className="text-xs font-semibold tabular-nums">{tableGridHover.rows}×{tableGridHover.cols}</div>
                  </div>

                  {/* Notion-like grid picker (2~6) */}
                  <div
                    className="grid grid-cols-6 gap-1"
                    onMouseLeave={() => setTableGridHover({ rows: 1, cols: 1 })}
                  >
                    {Array.from({ length: 6 }).map((_, r) =>
                      Array.from({ length: 6 }).map((__, c) => {
                        const rows = r + 1
                        const cols = c + 1
                        const active = rows <= tableGridHover.rows && cols <= tableGridHover.cols
                        const enabled = true

                        return (
                          <button
                            key={`${rows}-${cols}`}
                            type="button"
                            className={[
                              "h-5 w-5 rounded-[3px] border transition-colors",
                              enabled
                                ? active
                                  ? "border-primary bg-primary/20"
                                  : "border-border bg-background hover:bg-accent"
                                : "border-border/60 bg-muted/40",
                            ].join(" ")}
                            onMouseEnter={() => {
                              if (!enabled) return
                              setTableGridHover({ rows, cols })
                            }}
                            onMouseDown={(e) => {
                              // Prevent focus from moving away from editor.
                              e.preventDefault()
                              if (!enabled) return
                              insertTableFromPopover(e, rows, cols)
                            }}
                            aria-label={`Insert ${rows} by ${cols} table`}
                            disabled={!enabled}
                          />
                        )
                      })
                    )}
                  </div>

                  <div className="pt-2 px-1 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setTableInsertOpen(false)
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </ToolbarTooltip>
            <ToolbarTooltip label="Block Align Left">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellAlign(editorSchema, "left"))}
              >
               <TextAlignStart />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Block Align Center">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellAlign(editorSchema, "center"))}
              >
               <TextAlignCenter />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Block Align Right">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellAlign(editorSchema, "right"))}
              >
               <TextAlignEnd />
              </ButtonGroupItem>
            </ToolbarTooltip>


            <ToolbarTooltip label="Row+">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, tableCommands.addRowAfter)}
              >
               <BetweenHorizontalStart />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Col+">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, tableCommands.addColumnAfter)}
              >
               <BetweenVerticalStart />
              </ButtonGroupItem>
            </ToolbarTooltip>


            <ToolbarTooltip label="Row-">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, tableCommands.deleteRow)}
              >
               <FoldVertical />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Col-">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, tableCommands.deleteColumn)}
              >
               <FoldHorizontal />               
              </ButtonGroupItem>
            </ToolbarTooltip>



            <ToolbarTooltip label="Merge">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, tableCommands.mergeCells)}
              >
              <TableCellsMerge />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Split">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableCanSplit}
                onMouseDown={(e) => runFromToolbar(e, tableCommands.splitCell)}
              >
              <TableCellsSplit />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Del Table">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, tableCommands.deleteTable)}
              >
                <Grid2X2X />
              </ButtonGroupItem>
            </ToolbarTooltip>
          </ButtonGroup>






        </div>
      
      ) : null}
      </div>

      {/* Editor surface: use theme-aware background for dark mode - 블럭 에디터  */}
      <div className="p-3 bg-background text-foreground">
        <div ref={mountRef} />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-semibold mb-2">docJson</div>
          <pre className="text-xs whitespace-pre-wrap border rounded-md p-3 bg-muted max-h-[320px] overflow-auto">
            {JSON.stringify(docJson, null, 2)}
          </pre>
        </div>
        <div>
          <div className="text-sm font-semibold mb-2">Markdown (export)</div>
          <pre className="text-xs whitespace-pre-wrap border rounded-md p-3 bg-muted max-h-[320px] overflow-auto">
            {markdown}
          </pre>
        </div>
      </div>
    </div>
  )
}


