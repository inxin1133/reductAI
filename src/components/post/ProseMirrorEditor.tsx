import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EditorState, NodeSelection, TextSelection, type Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { DOMParser as PMDOMParser, type Node as PMNode } from "prosemirror-model"
import type { Slice } from "prosemirror-model"
import { Button } from "@/components/ui/button"
import { editorSchema } from "../../editor/schema"
import { buildEditorPlugins } from "../../editor/plugins"
import { PageLinkNodeView } from "../../editor/nodes/page_link_nodeview"
import { CodeBlockNodeView } from "../../editor/nodes/code_block_nodeview"
import { ListItemNodeView } from "../../editor/nodes/list_item_nodeview"
import { TableNodeView } from "../../editor/nodes/table_nodeview"
import { blockInserterKey, type BlockInserterState } from "../../editor/plugins/blockInserterPlugin"
import { selectionModeInitState, selectionModePluginKey } from "../../editor/plugins/tableCellSelectionKeysPlugin"
import { getBlockCommandRegistry } from "../../editor/commands/blockCommandRegistry"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ButtonGroup, ButtonGroupItem } from "@/components/ui/button-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
  cmdSetTableCellVAlign,
  cmdToggleTableBorder,
  cmdToggleTableRounded,
  cmdSetTableCellBgColor,
  cmdClearTableCellBgColor,
  tableCommands,  
} from "../../editor/commands"
// Removed: exportMarkdown was being called on every keystroke causing performance issues
// import { exportMarkdown } from "../../editor/serializers/markdown"
import {
  CellSelection,
  isInTable as pmIsInTable,
  selectedRect as pmSelectedRect,
  selectionCell as pmSelectionCell,
} from "prosemirror-tables"
import { 
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
  Paintbrush,
  PaintBucket,  
  Grid2X2,
  TableCellsMerge,    
  TableCellsSplit,      
  BetweenHorizontalStart,  
  BetweenVerticalStart,   
  FoldHorizontal,
  FoldVertical,
  Grid2X2X,
  ChevronLeft,
  Ellipsis,
  X,
  MoveLeft,
  MoveRight,
  MoveUp,
  MoveDown,
  // RulerDimensionLine,
  //MoveHorizontal,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronsDownUp,
  SquareDashed,
  SquareRoundCorner,
  SquareMousePointer,
  ArrowUp,
  ArrowDown,
  Repeat,
  FileText,
  ChevronDown,
  ChevronRight,
  Search,
  FolderOpen,
  Users,
} from "lucide-react"

type PmDocJson = unknown
type PmCommand = (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => boolean
type MenuAnchor = { left: number; top: number; width: number; height: number }

type Props = {
  initialDocJson?: PmDocJson
  onChange?: (docJson: PmDocJson) => void
  toolbarOpen: boolean
}

function topLevelIndexAtPos(doc: PMNode, pos: number): number | null {
  let cur = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    if (cur === pos) return i
    cur += doc.child(i).nodeSize
  }
  return null
}

function posAtTopLevelIndex(doc: PMNode, index: number): { pos: number; node: PMNode } | null {
  if (index < 0 || index >= doc.childCount) return null
  let pos = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i)
    if (i === index) return { pos, node: child }
    pos += child.nodeSize
  }
  return null
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

const TEXT_COLOR_PRESETS_500: Array<{
  key: string
  label: string
  textClass: string
  bgClass: string
  darkBgClass?: string
}> = [
  { key: "slate-500", label: "slate-500", textClass: "text-slate-500", bgClass: "bg-slate-500", darkBgClass: "dark:bg-slate-400" },
  { key: "gray-500", label: "gray-500", textClass: "text-gray-500", bgClass: "bg-gray-500", darkBgClass: "dark:bg-gray-400" },
  { key: "zinc-500", label: "zinc-500", textClass: "text-zinc-500", bgClass: "bg-zinc-500", darkBgClass: "dark:bg-zinc-400" },
  { key: "neutral-500", label: "neutral-500", textClass: "text-neutral-500", bgClass: "bg-neutral-500", darkBgClass: "dark:bg-neutral-400" },
  { key: "stone-500", label: "stone-500", textClass: "text-stone-500", bgClass: "bg-stone-500", darkBgClass: "dark:bg-stone-400" },
  { key: "red-500", label: "red-500", textClass: "text-red-500", bgClass: "bg-red-500", darkBgClass: "dark:bg-red-400" },
  { key: "orange-500", label: "orange-500", textClass: "text-orange-500", bgClass: "bg-orange-500", darkBgClass: "dark:bg-orange-400" },
  { key: "amber-500", label: "amber-500", textClass: "text-amber-500", bgClass: "bg-amber-500", darkBgClass: "dark:bg-amber-400" },
  { key: "yellow-500", label: "yellow-500", textClass: "text-yellow-500", bgClass: "bg-yellow-500", darkBgClass: "dark:bg-yellow-400" },
  { key: "lime-500", label: "lime-500", textClass: "text-lime-500", bgClass: "bg-lime-500", darkBgClass: "dark:bg-lime-400" },
  { key: "green-500", label: "green-500", textClass: "text-green-500", bgClass: "bg-green-500", darkBgClass: "dark:bg-green-400" },
  { key: "emerald-500", label: "emerald-500", textClass: "text-emerald-500", bgClass: "bg-emerald-500", darkBgClass: "dark:bg-emerald-400" },
  { key: "teal-500", label: "teal-500", textClass: "text-teal-500", bgClass: "bg-teal-500", darkBgClass: "dark:bg-teal-400" },
  { key: "cyan-500", label: "cyan-500", textClass: "text-cyan-500", bgClass: "bg-cyan-500", darkBgClass: "dark:bg-cyan-400" },
  { key: "sky-500", label: "sky-500", textClass: "text-sky-500", bgClass: "bg-sky-500", darkBgClass: "dark:bg-sky-400" },
  { key: "blue-500", label: "blue-500", textClass: "text-blue-500", bgClass: "bg-blue-500", darkBgClass: "dark:bg-blue-400" },
  { key: "indigo-500", label: "indigo-500", textClass: "text-indigo-500", bgClass: "bg-indigo-500", darkBgClass: "dark:bg-indigo-400" },
  { key: "violet-500", label: "violet-500", textClass: "text-violet-500", bgClass: "bg-violet-500", darkBgClass: "dark:bg-violet-400" },
  { key: "purple-500", label: "purple-500", textClass: "text-purple-500", bgClass: "bg-purple-500", darkBgClass: "dark:bg-purple-400" },
  { key: "fuchsia-500", label: "fuchsia-500", textClass: "text-fuchsia-500", bgClass: "bg-fuchsia-500", darkBgClass: "dark:bg-fuchsia-400" },
  { key: "pink-500", label: "pink-500", textClass: "text-pink-500", bgClass: "bg-pink-500", darkBgClass: "dark:bg-pink-400" },
  { key: "rose-500", label: "rose-500", textClass: "text-rose-500", bgClass: "bg-rose-500", darkBgClass: "dark:bg-rose-400" },
]

const BLOCK_BG_PRESETS_100: Array<{ key: string; label: string; bgClass: string; darkBgClass?: string }> = [
  { key: "slate-100", label: "slate-100", bgClass: "bg-slate-100", darkBgClass: "dark:bg-slate-800" },
  { key: "gray-100", label: "gray-100", bgClass: "bg-gray-100", darkBgClass: "dark:bg-gray-800" },
  { key: "zinc-100", label: "zinc-100", bgClass: "bg-zinc-100", darkBgClass: "dark:bg-zinc-800" },
  { key: "neutral-100", label: "neutral-100", bgClass: "bg-neutral-100", darkBgClass: "dark:bg-neutral-800" },
  { key: "stone-100", label: "stone-100", bgClass: "bg-stone-100", darkBgClass: "dark:bg-stone-800" },
  { key: "red-100", label: "red-100", bgClass: "bg-red-100", darkBgClass: "dark:bg-red-900/60" },
  { key: "orange-100", label: "orange-100", bgClass: "bg-orange-100", darkBgClass: "dark:bg-orange-900/60" },
  { key: "amber-100", label: "amber-100", bgClass: "bg-amber-100", darkBgClass: "dark:bg-amber-900/60" },
  { key: "yellow-100", label: "yellow-100", bgClass: "bg-yellow-100", darkBgClass: "dark:bg-yellow-900/60" },
  { key: "lime-100", label: "lime-100", bgClass: "bg-lime-100", darkBgClass: "dark:bg-lime-900/60" },
  { key: "green-100", label: "green-100", bgClass: "bg-green-100", darkBgClass: "dark:bg-green-900/60" },
  { key: "emerald-100", label: "emerald-100", bgClass: "bg-emerald-100", darkBgClass: "dark:bg-emerald-900/60" },
  { key: "teal-100", label: "teal-100", bgClass: "bg-teal-100", darkBgClass: "dark:bg-teal-900/60" },
  { key: "cyan-100", label: "cyan-100", bgClass: "bg-cyan-100", darkBgClass: "dark:bg-cyan-900/60" },
  { key: "sky-100", label: "sky-100", bgClass: "bg-sky-100", darkBgClass: "dark:bg-sky-900/60" },
  { key: "blue-100", label: "blue-100", bgClass: "bg-blue-100", darkBgClass: "dark:bg-blue-900/60" },
  { key: "indigo-100", label: "indigo-100", bgClass: "bg-indigo-100", darkBgClass: "dark:bg-indigo-900/60" },
  { key: "violet-100", label: "violet-100", bgClass: "bg-violet-100", darkBgClass: "dark:bg-violet-900/60" },
  { key: "purple-100", label: "purple-100", bgClass: "bg-purple-100", darkBgClass: "dark:bg-purple-900/60" },
  { key: "fuchsia-100", label: "fuchsia-100", bgClass: "bg-fuchsia-100", darkBgClass: "dark:bg-fuchsia-900/60" },
  { key: "pink-100", label: "pink-100", bgClass: "bg-pink-100", darkBgClass: "dark:bg-pink-900/60" },
  { key: "rose-100", label: "rose-100", bgClass: "bg-rose-100", darkBgClass: "dark:bg-rose-900/60" },
]

function getEmptyDoc() {
  const wrap = document.createElement("div")
  wrap.innerHTML = "<p></p>"
  return PMDOMParser.fromSchema(editorSchema).parse(wrap)
}

export function ProseMirrorEditor({ initialDocJson, onChange, toolbarOpen }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const embedIdsRef = useRef<Set<string>>(new Set())
  const embedDetectTimerRef = useRef<number | null>(null)

  const modEnterShortcutLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl+⏎"
    const platform = navigator.platform || ""
    const ua = navigator.userAgent || ""
    const isMac = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua)
    return isMac ? "⌘+⏎" : "Ctrl+⏎"
  }, [])

  const modBackspaceShortcutLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl+⌫"
    const platform = navigator.platform || ""
    const ua = navigator.userAgent || ""
    const isMac = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua)
    return isMac ? "⌘+⌫" : "Ctrl+⌫"
  }, [])

  const modShiftEnterShortcutLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl+Shift+⏎"
    const platform = navigator.platform || ""
    const ua = navigator.userAgent || ""
    const isMac = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua)
    return isMac ? "⌘+⇧+⏎" : "Ctrl+Shift+⏎"
  }, [])

  const modShiftBackspaceShortcutLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl+Shift+⌫"
    const platform = navigator.platform || ""
    const ua = navigator.userAgent || ""
    const isMac = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua)
    return isMac ? "⌘+⇧+⌫" : "Ctrl+Shift+⌫"
  }, [])

  // Removed: markdown state was only used for debug panel and caused expensive exportMarkdown on every keystroke
  // Removed: docJson state was only used for debug panel display
  const [textColorOpen, setTextColorOpen] = useState(false)
  const [selectionTextColorOpen, setSelectionTextColorOpen] = useState(false)
  const [blockBgOpen, setBlockBgOpen] = useState(false)
  const [tableCellBgOpen, setTableCellBgOpen] = useState(false)
  const [selectionTableCellBgOpen, setSelectionTableCellBgOpen] = useState(false)

  const [blockMenuOpen, setBlockMenuOpen] = useState(false)
  const [blockMenuAnchor, setBlockMenuAnchor] = useState<MenuAnchor | null>(null)
  const [blockMenuQuery, setBlockMenuQuery] = useState("")
  const blockMenuInputRef = useRef<HTMLInputElement | null>(null)
  const blockMenuSigRef = useRef<string>("")
  const [handleMenuOpen, setHandleMenuOpen] = useState(false)
  const [handleMenuAnchor, setHandleMenuAnchor] = useState<MenuAnchor | null>(null)
  const [handleMenuKind, setHandleMenuKind] = useState<BlockInserterState["kind"] | null>(null)
  const [handleMenuRange, setHandleMenuRange] = useState<{ from: number; to: number } | null>(null)
  const handleMenuSigRef = useRef<string>("")
  const [tableInsertOpen, setTableInsertOpen] = useState(false)
  const [tableGridHover, setTableGridHover] = useState<{ rows: number; cols: number }>({ rows: 1, cols: 1 })

  // Selection bubble toolbar (Notion-like): show when text is selected.
  const [selectionToolbarOpen, setSelectionToolbarOpen] = useState(false)
  const [selectionAnchor, setSelectionAnchor] = useState<{ left: number; top: number } | null>(null)
  const bubbleRafRef = useRef<number | null>(null)
  const bubbleInteractingRef = useRef(false)

  // Table cell quick menu (ellipsis) when cursor is inside a table cell.
  const [tableCellMenuAnchor, setTableCellMenuAnchor] = useState<{ left: number; top: number } | null>(null)
  const [tableCellMenuOpen, setTableCellMenuOpen] = useState(false)
  const tableMenuRafRef = useRef<number | null>(null)

  // Page Link picker state
  const [pageLinkPickerOpen, setPageLinkPickerOpen] = useState(false)
  const [pageLinkSearch, setPageLinkSearch] = useState("")
  const [pageLinkCategories, setPageLinkCategories] = useState<{
    personal: Array<{ id: string; name: string; icon: string | null }>
    team: Array<{ id: string; name: string; icon: string | null }>
  }>({ personal: [], team: [] })
  const [pageLinkPages, setPageLinkPages] = useState<Array<{
    id: string
    title: string
    icon: string | null
    category_id: string | null
    parent_id: string | null
    hasContent: boolean
  }>>([])
  const [pageLinkExpandedCats, setPageLinkExpandedCats] = useState<Set<string>>(new Set())
  // Store editor state when popover opens (to restore insertion point)
  const pageLinkEditorStateRef = useRef<EditorState | null>(null)
  // Anchor position for page link popover (at cursor/block position)
  const [pageLinkAnchor, setPageLinkAnchor] = useState<{ left: number; top: number } | null>(null)

  // Calculate anchor position from current selection
  const calcPageLinkAnchor = useCallback(() => {
    const view = viewRef.current
    const surface = surfaceRef.current
    if (!view || !surface) return null
    
    const { from } = view.state.selection
    const coords = view.coordsAtPos(from)
    const surfaceRect = surface.getBoundingClientRect()
    
    return {
      left: coords.left - surfaceRect.left,
      top: coords.bottom - surfaceRect.top + 4,
    }
  }, [])

  // Open page link picker at cursor position
  const openPageLinkPicker = useCallback(() => {
    if (viewRef.current) {
      pageLinkEditorStateRef.current = viewRef.current.state
    }
    const anchor = calcPageLinkAnchor()
    if (anchor) {
      setPageLinkAnchor(anchor)
    }
    setPageLinkPickerOpen(true)
  }, [calcPageLinkAnchor])

  // Listen for page link picker open event (from blockCommandRegistry)
  useEffect(() => {
    const handler = () => {
      openPageLinkPicker()
    }
    window.addEventListener("reductai:open-page-link-picker", handler)
    return () => window.removeEventListener("reductai:open-page-link-picker", handler)
  }, [openPageLinkPicker])

  // Load categories and pages when page link picker opens
  useEffect(() => {
    if (!pageLinkPickerOpen) return
    const token = localStorage.getItem("token")
    if (!token) return

    const headers = { Authorization: `Bearer ${token}` }

    // Fetch personal and team categories in parallel
    Promise.all([
      fetch("/api/posts/categories/mine?type=personal_page", { headers }).then((r) => r.ok ? r.json() : []),
      fetch("/api/posts/categories/mine?type=team_page", { headers }).then((r) => r.ok ? r.json() : []),
    ])
      .then(([personalData, teamData]) => {
        const personal = (personalData || []).map((cat: Record<string, unknown>) => ({
          id: String(cat.id),
          name: String(cat.name || "Untitled"),
          icon: cat.icon ? String(cat.icon) : null,
        }))
        const team = (teamData || []).map((cat: Record<string, unknown>) => ({
          id: String(cat.id),
          name: String(cat.name || "Untitled"),
          icon: cat.icon ? String(cat.icon) : null,
        }))
        setPageLinkCategories({ personal, team })
      })
      .catch(() => null)

    // Fetch pages
    fetch("/api/posts/mine", { headers })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data || !Array.isArray(data)) return
        const pages = data.map((p: Record<string, unknown>) => ({
          id: String(p.id),
          title: String(p.title || "Untitled"),
          icon: p.icon ? String(p.icon) : null,
          category_id: p.category_id ? String(p.category_id) : null,
          parent_id: p.parent_id ? String(p.parent_id) : null,
          hasContent: Boolean(p.has_content),
        }))
        setPageLinkPages(pages)
      })
      .catch(() => null)
  }, [pageLinkPickerOpen])

  // Table cell selection toolbar (drag/F5 selection).
  const [tableCellSelectionAnchor, setTableCellSelectionAnchor] = useState<{ left: number; top: number } | null>(null)
  const tableSelectionRafRef = useRef<number | null>(null)
  const tableSelectionInteractingRef = useRef(false)

  const updateSelectionToolbar = useCallback(() => {
    const v = viewRef.current
    const surfaceEl = surfaceRef.current
    if (!v || !surfaceEl) {
      setSelectionToolbarOpen(false)
      setSelectionTextColorOpen(false)
      return
    }

    // Keep the bubble open while the user is interacting with the bubble itself (or nested popovers like text color),
    // even if focus temporarily moves away from the editor.
    const keepOpenWhileInteracting = selectionTextColorOpen || bubbleInteractingRef.current

    // Only show while editor is focused (unless we're interacting with nested popovers).
    if (!v.hasFocus() && !keepOpenWhileInteracting) {
      setSelectionToolbarOpen(false)
      setSelectionTextColorOpen(false)
      return
    }

    const sel = v.state.selection
    if (sel.empty) {
      setSelectionToolbarOpen(false)
      setSelectionTextColorOpen(false)
      return
    }

    // Hide for non-text selections (e.g., table cell selection / node selection).
    if (!(sel instanceof TextSelection)) {
      setSelectionToolbarOpen(false)
      setSelectionTextColorOpen(false)
      return
    }
    if (sel instanceof CellSelection) {
      setSelectionToolbarOpen(false)
      setSelectionTextColorOpen(false)
      return
    }

    try {
      const start = v.coordsAtPos(sel.from)
      const end = v.coordsAtPos(sel.to)
      const rect = surfaceEl.getBoundingClientRect()

      const topY = Math.min(start.top, end.top)
      const left = start.left - rect.left
      const top = topY - rect.top

      // Avoid useless re-renders when the anchor didn't move meaningfully.
      setSelectionAnchor((prev) => {
        if (!prev) return { left, top }
        if (Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5) return prev
        return { left, top }
      })
      setSelectionToolbarOpen(true)
    } catch {
      setSelectionToolbarOpen(false)
      setSelectionTextColorOpen(false)
    }
  }, [selectionTextColorOpen])

  const scheduleSelectionToolbarUpdate = useCallback(() => {
    if (bubbleRafRef.current) window.cancelAnimationFrame(bubbleRafRef.current)
    bubbleRafRef.current = window.requestAnimationFrame(() => {
      bubbleRafRef.current = null
      updateSelectionToolbar()
    })
  }, [updateSelectionToolbar])

  const updateTableCellMenu = useCallback(() => {
    const v = viewRef.current
    const surfaceEl = surfaceRef.current
    if (!v || !surfaceEl) {
      setTableCellMenuAnchor(null)
      setTableCellMenuOpen(false)
      setTableCellSelectionAnchor(null)
      return
    }

    const keepOpenWhileInteracting = tableCellMenuOpen
    if (!v.hasFocus() && !keepOpenWhileInteracting) {
      setTableCellMenuAnchor(null)
      setTableCellMenuOpen(false)
      setTableCellSelectionAnchor(null)
      return
    }

    if (!pmIsInTable(v.state)) {
      setTableCellMenuAnchor(null)
      setTableCellMenuOpen(false)
      setTableCellSelectionAnchor(null)
      return
    }

    if (v.state.selection instanceof CellSelection) {
      setTableCellMenuAnchor(null)
      setTableCellMenuOpen(false)
      return
    }

    try {
      const $cell = pmSelectionCell(v.state)
      let cellEl: HTMLElement | null = null
      const domAt = v.nodeDOM($cell.pos)
      if (domAt && domAt instanceof HTMLElement) {
        cellEl = domAt
      } else {
        const near = v.domAtPos($cell.pos)
        const node = near.node.nodeType === Node.ELEMENT_NODE ? (near.node as HTMLElement) : near.node.parentElement
        cellEl = node?.closest("td,th") || null
      }

      if (!cellEl) {
        setTableCellMenuAnchor(null)
        return
      }

      const rect = cellEl.getBoundingClientRect()
      const surfaceRect = surfaceEl.getBoundingClientRect()
      const left = rect.right - surfaceRect.left - 6
      const top = rect.top - surfaceRect.top + 6

      setTableCellMenuAnchor((prev) => {
        if (!prev) return { left, top }
        if (Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5) return prev
        return { left, top }
      })
    } catch {
      setTableCellMenuAnchor(null)
    }
  }, [tableCellMenuOpen])

  const scheduleTableCellMenuUpdate = useCallback(() => {
    if (tableMenuRafRef.current) window.cancelAnimationFrame(tableMenuRafRef.current)
    tableMenuRafRef.current = window.requestAnimationFrame(() => {
      tableMenuRafRef.current = null
      updateTableCellMenu()
    })
  }, [updateTableCellMenu])

  const updateTableCellSelectionToolbar = useCallback(() => {
    const v = viewRef.current
    const surfaceEl = surfaceRef.current
    if (!v || !surfaceEl) {
      setTableCellSelectionAnchor(null)
      return
    }
    const keepOpenWhileInteracting = selectionTableCellBgOpen || tableSelectionInteractingRef.current
    if (!v.hasFocus() && !keepOpenWhileInteracting) {
      setTableCellSelectionAnchor(null)
      return
    }
    if (!pmIsInTable(v.state) && !keepOpenWhileInteracting) {
      setTableCellSelectionAnchor(null)
      return
    }
    if (!(v.state.selection instanceof CellSelection)) {
      setTableCellSelectionAnchor(null)
      setSelectionTableCellBgOpen(false)
      return
    }

    try {
      const rect = pmSelectedRect(v.state)
      const tableDom = v.nodeDOM(rect.tableStart)
      const tableEl =
        tableDom && tableDom instanceof HTMLElement
          ? tableDom
          : (tableDom as Node | null)?.parentElement?.closest(".tableWrapper")
      if (!tableEl) {
        setTableCellSelectionAnchor(null)
        return
      }
      const tableRect = tableEl.getBoundingClientRect()
      const surfaceRect = surfaceEl.getBoundingClientRect()
      const left = tableRect.left - surfaceRect.left
      const top = tableRect.top - surfaceRect.top - 8
      setTableCellSelectionAnchor((prev) => {
        if (!prev) return { left, top }
        if (Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5) return prev
        return { left, top }
      })
    } catch {
      setTableCellSelectionAnchor(null)
    }
  }, [selectionTableCellBgOpen])

  const scheduleTableCellSelectionUpdate = useCallback(() => {
    if (tableSelectionRafRef.current) window.cancelAnimationFrame(tableSelectionRafRef.current)
    tableSelectionRafRef.current = window.requestAnimationFrame(() => {
      tableSelectionRafRef.current = null
      updateTableCellSelectionToolbar()
    })
  }, [updateTableCellSelectionToolbar])

  // Mention (@) is temporarily disabled (it caused runaway update loops / freezes).
  const plugins = useMemo(() => buildEditorPlugins(editorSchema, { mention: { enabled: false } }), [])

  const blockCommandsFull = useMemo(() => getBlockCommandRegistry(editorSchema), [])
  const blockCommands = useMemo(() => {
    const items = blockCommandsFull
    return items.map((c) => ({ key: c.key, title: c.title, keywords: c.keywords }))
  }, [blockCommandsFull])

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
      handleDOMEvents: {
        copy: (v, event) => {
          // Fail-safe: ensure F5 block/cell selection can be copied even if another plugin swallows copy.
          if (event.defaultPrevented) return false
          const st = selectionModePluginKey.getState(v.state) || selectionModeInitState()
          if (st.mode === 0) return false

          const serializeForClipboard = (v as unknown as {
            serializeForClipboard?: (slice: Slice) => { dom: HTMLElement; text: string }
          }).serializeForClipboard
          if (!serializeForClipboard) return false
          const e = event as ClipboardEvent
          const data: DataTransfer | null = e.clipboardData
          if (!data) return false

          // CellSelection: let ProseMirror compute the slice from the selection
          if (st.kind === "cell" && v.state.selection instanceof CellSelection) {
            const slice = v.state.selection.content()
            const { dom, text } = serializeForClipboard(slice)
            event.preventDefault()
            data.setData("text/plain", text || "")
            data.setData("text/html", dom?.innerHTML || "")
            return true
          }

          // Block selection: copy the top-level block range from anchor/head
          if (st.kind === "block" && st.anchorBlockPos != null && st.headBlockPos != null) {
            const doc = v.state.doc as PMNode
            const aPos = st.anchorBlockPos
            const hPos = st.headBlockPos
            const aIdx = topLevelIndexAtPos(doc, aPos)
            const hIdx = topLevelIndexAtPos(doc, hPos)
            if (aIdx == null || hIdx == null) return false
            const fromIdx = Math.min(aIdx, hIdx)
            const toIdx = Math.max(aIdx, hIdx)
            const first = posAtTopLevelIndex(doc, fromIdx)
            const last = posAtTopLevelIndex(doc, toIdx)
            if (!first || !last) return false
            const from = first.pos
            const to = last.pos + last.node.nodeSize
            if (to <= from) return false

            const slice = doc.slice(from, to)
            const { dom, text } = serializeForClipboard(slice)
            event.preventDefault()
            data.setData("text/plain", text || "")
            data.setData("text/html", dom?.innerHTML || "")
            return true
          }

          return false
        },
        cut: (v, event) => {
          // Fail-safe: cut = copy + delete for F5 selection mode.
          if (event.defaultPrevented) return false
          const st = selectionModePluginKey.getState(v.state) || selectionModeInitState()
          if (st.mode === 0) return false

          const serializeForClipboard = (v as unknown as {
            serializeForClipboard?: (slice: Slice) => { dom: HTMLElement; text: string }
          }).serializeForClipboard
          if (!serializeForClipboard) return false
          const e = event as ClipboardEvent
          const data: DataTransfer | null = e.clipboardData
          if (!data) return false

          if (st.kind === "cell" && v.state.selection instanceof CellSelection) {
            const slice = v.state.selection.content()
            const { dom, text } = serializeForClipboard(slice)
            event.preventDefault()
            data.setData("text/plain", text || "")
            data.setData("text/html", dom?.innerHTML || "")
            if (v.editable) {
              v.dispatch(v.state.tr.deleteSelection().setMeta(selectionModePluginKey, selectionModeInitState()).scrollIntoView())
            }
            return true
          }

          if (st.kind === "block" && st.anchorBlockPos != null && st.headBlockPos != null) {
            const doc = v.state.doc as PMNode
            const aPos = st.anchorBlockPos
            const hPos = st.headBlockPos
            const aIdx = topLevelIndexAtPos(doc, aPos)
            const hIdx = topLevelIndexAtPos(doc, hPos)
            if (aIdx == null || hIdx == null) return false
            const fromIdx = Math.min(aIdx, hIdx)
            const toIdx = Math.max(aIdx, hIdx)
            const first = posAtTopLevelIndex(doc, fromIdx)
            const last = posAtTopLevelIndex(doc, toIdx)
            if (!first || !last) return false
            const from = first.pos
            const to = last.pos + last.node.nodeSize
            if (to <= from) return false

            const slice = doc.slice(from, to)
            const { dom, text } = serializeForClipboard(slice)
            event.preventDefault()
            data.setData("text/plain", text || "")
            data.setData("text/html", dom?.innerHTML || "")

            if (v.editable) {
              const tr = v.state.tr.delete(from, to).setMeta(selectionModePluginKey, selectionModeInitState()).scrollIntoView()
              const safe = Math.min(from, tr.doc.content.size)
              try {
                tr.setSelection(TextSelection.near(tr.doc.resolve(safe), -1))
              } catch {
                // ignore
              }
              v.dispatch(tr)
            }
            return true
          }

          return false
        },
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
        // Keep the selection bubble anchored to the latest selection.
        scheduleSelectionToolbarUpdate()
        scheduleTableCellMenuUpdate()
        scheduleTableCellSelectionUpdate()

        // Debounce embed detection to avoid expensive doc.descendants on every keystroke.
        // This is an optimistic UX layer; server also enforces deletion on save.
        if (embedDetectTimerRef.current) window.clearTimeout(embedDetectTimerRef.current)
        embedDetectTimerRef.current = window.setTimeout(() => {
          embedDetectTimerRef.current = null
          const v = viewRef.current
          if (!v) return
          const currentDoc = v.state.doc
          const nextEmbedIds = new Set<string>()
          currentDoc.descendants((node) => {
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
        }, 150)

        // Call onChange with the document JSON for the parent to handle
        onChange?.(nextState.doc.toJSON())

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

        const handleOpen = Boolean(ui?.handleMenuOpen)
        const handleAnchor = ui?.handleMenuAnchor || null
        const handleKind = (ui?.handleMenuKind as BlockInserterState["kind"] | null) || null
        const handleFrom = typeof ui?.handleMenuFrom === "number" ? ui.handleMenuFrom : null
        const handleTo = typeof ui?.handleMenuTo === "number" ? ui.handleMenuTo : null
        const handleSig = `${handleOpen ? 1 : 0}:${handleAnchor ? `${Math.round(handleAnchor.left)},${Math.round(handleAnchor.top)},${Math.round(handleAnchor.width)},${Math.round(handleAnchor.height)}` : ""}:${handleKind || ""}:${handleFrom ?? ""}:${handleTo ?? ""}`
        if (handleSig !== handleMenuSigRef.current) {
          handleMenuSigRef.current = handleSig
          setHandleMenuOpen(handleOpen)
          setHandleMenuAnchor(handleAnchor)
          setHandleMenuKind(handleKind)
          setHandleMenuRange(handleFrom != null && handleTo != null ? { from: handleFrom, to: handleTo } : null)
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

    // Append an embed/link block to the end of the current document (used by page tree "+" UX).
    const onAppendPageLink = (e: Event) => {
      const ce = e as CustomEvent<{ pageId?: string; title?: string; display?: string }>
      const pageId = String(ce.detail?.pageId || "")
      if (!pageId) return
      const title = String(ce.detail?.title || "New page")
      const display = String(ce.detail?.display || "embed")
      const v = viewRef.current
      if (!v) return
      const nodeType = editorSchema.nodes.page_link
      if (!nodeType) return

      const doc = v.state.doc
      let insertPos = doc.content.size
      const last = doc.lastChild
      // Insert before a trailing empty paragraph if present (Notion-like).
      if (last && last.type === editorSchema.nodes.paragraph && last.content.size === 0) {
        insertPos = doc.content.size - last.nodeSize
      }

      const linkNode = nodeType.create({ pageId, title, display })
      v.dispatch(v.state.tr.insert(insertPos, linkNode).scrollIntoView())
    }
    window.addEventListener("reductai:append-page-link", onAppendPageLink as EventListener)

    // Insert a page_link block right after a specific existing page_link (by pageId).
    const onInsertPageLinkAfter = (e: Event) => {
      const ce = e as CustomEvent<{ afterPageId?: string; pageId?: string; title?: string; display?: string }>
      const afterPageId = String(ce.detail?.afterPageId || "")
      const pageId = String(ce.detail?.pageId || "")
      if (!afterPageId || !pageId) return
      const title = String(ce.detail?.title || "New page")
      const display = String(ce.detail?.display || "embed")
      const v = viewRef.current
      if (!v) return
      const nodeType = editorSchema.nodes.page_link
      if (!nodeType) return

      let insertPos: number | null = null
      v.state.doc.descendants((node, pos) => {
        if (insertPos != null) return false
        if (node.type !== nodeType) return true
        const attrs = (node.attrs || {}) as Record<string, unknown>
        const pid = typeof attrs.pageId === "string" ? attrs.pageId : ""
        if (pid !== afterPageId) return true
        insertPos = pos + node.nodeSize
        return false
      })

      if (insertPos == null) {
        // Fallback: append near the end (before trailing empty paragraph if present)
        const doc = v.state.doc
        insertPos = doc.content.size
        const last = doc.lastChild
        if (last && last.type === editorSchema.nodes.paragraph && last.content.size === 0) {
          insertPos = doc.content.size - last.nodeSize
        }
      }

      const linkNode = nodeType.create({ pageId, title, display })
      v.dispatch(v.state.tr.insert(insertPos, linkNode).scrollIntoView())
    }
    window.addEventListener("reductai:insert-page-link-after", onInsertPageLinkAfter as EventListener)

    // Focus the editor from external UI (e.g., PostEditorPage title input Enter key).
    const onFocusEditor = () => {
      const v = viewRef.current
      if (!v) return
      try {
        v.focus()
      } catch {
        // ignore
      }
    }
    window.addEventListener("reductai:pm-editor:focus", onFocusEditor as EventListener)

    // init derived views - notify parent of initial doc
    onChange?.(doc.toJSON())
    scheduleSelectionToolbarUpdate()

    return () => {
      if (embedDetectTimerRef.current) window.clearTimeout(embedDetectTimerRef.current)
      window.removeEventListener("reductai:page-title-updated", onTitleUpdated as EventListener)
      window.removeEventListener("reductai:append-page-link", onAppendPageLink as EventListener)
      window.removeEventListener("reductai:insert-page-link-after", onInsertPageLinkAfter as EventListener)
      window.removeEventListener("reductai:pm-editor:focus", onFocusEditor as EventListener)
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scheduleSelectionToolbarUpdate()
  }, [selectionTextColorOpen, scheduleSelectionToolbarUpdate])

  // Reposition the selection bubble on scroll/resize while it's visible.
  useEffect(() => {
    if (!selectionToolbarOpen) return
    const onScrollOrResize = () => scheduleSelectionToolbarUpdate()
    window.addEventListener("scroll", onScrollOrResize, true)
    window.addEventListener("resize", onScrollOrResize)
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true)
      window.removeEventListener("resize", onScrollOrResize)
    }
  }, [scheduleSelectionToolbarUpdate, selectionToolbarOpen])

  useEffect(() => {
    if (!tableCellMenuAnchor) return
    const onScrollOrResize = () => scheduleTableCellMenuUpdate()
    window.addEventListener("scroll", onScrollOrResize, true)
    window.addEventListener("resize", onScrollOrResize)
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true)
      window.removeEventListener("resize", onScrollOrResize)
    }
  }, [scheduleTableCellMenuUpdate, tableCellMenuAnchor])

  useEffect(() => {
    if (!tableCellSelectionAnchor) return
    const onScrollOrResize = () => scheduleTableCellSelectionUpdate()
    window.addEventListener("scroll", onScrollOrResize, true)
    window.addEventListener("resize", onScrollOrResize)
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true)
      window.removeEventListener("resize", onScrollOrResize)
    }
  }, [scheduleTableCellSelectionUpdate, tableCellSelectionAnchor])

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

  const closeHandleMenu = () => {
    const v = viewRef.current
    if (!v) return
    v.dispatch(
      v.state.tr.setMeta(blockInserterKey, {
        handleMenuOpen: false,
        handleMenuAnchor: null,
        handleMenuKind: null,
        handleMenuFrom: null,
        handleMenuTo: null,
      })
    )
  }

  const runBlockMenuCommand = (commandKey: string, side: "before" | "after") => {
    window.dispatchEvent(new CustomEvent("reductai:block-inserter:run", { detail: { commandKey, side } }))
  }

  const selectHandleBlock = useCallback(() => {
    const v = viewRef.current
    if (!v || !handleMenuRange || !handleMenuKind) return
    const { from, to } = handleMenuRange
    const state = v.state
    if (handleMenuKind === "table_row") {
      let firstCell: number | null = null
      let lastCell: number | null = null
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type === editorSchema.nodes.table_cell || node.type === editorSchema.nodes.table_header) {
          if (firstCell == null) firstCell = pos
          lastCell = pos
        }
        return true
      })
      if (firstCell != null && lastCell != null) {
        const sel = CellSelection.create(state.doc, firstCell, lastCell)
        v.dispatch(
          state.tr
            .setSelection(sel)
            .setMeta(selectionModePluginKey, {
              mode: 1,
              kind: "cell",
              anchorCellPos: sel.$anchorCell.pos,
              headCellPos: sel.$headCell.pos,
              anchorBlockPos: null,
              headBlockPos: null,
            })
            .scrollIntoView()
        )
        v.focus()
      }
      return
    }

    const sel = NodeSelection.create(state.doc, from)
    v.dispatch(
      state.tr
        .setSelection(sel)
        .setMeta(selectionModePluginKey, {
          mode: 1,
          kind: "block",
          anchorBlockPos: from,
          headBlockPos: from,
          anchorCellPos: null,
          headCellPos: null,
        })
        .scrollIntoView()
    )
    v.focus()
  }, [handleMenuKind, handleMenuRange])

  useEffect(() => {
    if (!handleMenuOpen) return
    selectHandleBlock()
  }, [handleMenuOpen, selectHandleBlock])

  const duplicateHandleBlock = () => {
    const v = viewRef.current
    if (!v || !handleMenuRange || !handleMenuKind) return
    const { from, to } = handleMenuRange
    const state = v.state
    if (handleMenuKind === "table_row") {
      const row = state.doc.nodeAt(from)
      if (!row) return
      v.dispatch(state.tr.insert(to, row.copy(row.content)).scrollIntoView())
      v.focus()
      return
    }
    run(cmdDuplicateBlock(editorSchema))
  }

  const deleteHandleBlock = () => {
    const v = viewRef.current
    if (!v || !handleMenuRange || !handleMenuKind) return
    const { from, to } = handleMenuRange
    const state = v.state
    if (handleMenuKind === "table_row") {
      // Ensure selection is inside the row, then delete row.
      let firstCell: number | null = null
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type === editorSchema.nodes.table_cell || node.type === editorSchema.nodes.table_header) {
          firstCell = pos
          return false
        }
        return true
      })
      if (firstCell != null) {
        v.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(firstCell + 1), 1)))
      }
      run(tableCommands.deleteRow)
      return
    }
    v.dispatch(state.tr.delete(from, to).scrollIntoView())
    v.focus()
  }

  const runHandleReplaceCommand = (commandKey: string) => {
    const v = viewRef.current
    if (!v) return
    const cmd = blockCommandsFull.find((c) => c.key === commandKey)
    if (!cmd) return
    cmd.applyReplace(v)
  }

  const run = (cmd: PmCommand) => {
    const view = viewRef.current
    if (!view) return
    cmd(view.state, view.dispatch, view)
    view.focus()
  }

  const cycleTableCellSelectionMode = () => {
    const v = viewRef.current
    if (!v) return
    const state = v.state
    const st = selectionModePluginKey.getState(state) || selectionModeInitState()
    try {
      const $cell = pmSelectionCell(state)
      const cellPos = $cell.pos
      const nextMode = st.mode === 0 ? 1 : st.mode === 1 ? 2 : 0

      if (nextMode === 0) {
        const tr = state.tr
          .setSelection(TextSelection.near(state.doc.resolve(Math.min(cellPos + 1, state.doc.content.size)), 1))
          .setMeta(selectionModePluginKey, selectionModeInitState())
          .scrollIntoView()
        v.dispatch(tr)
        v.focus()
        return
      }

      const sel = state.selection instanceof CellSelection ? state.selection : new CellSelection($cell)
      const tr = state.tr
        .setSelection(sel)
        .setMeta(selectionModePluginKey, {
          mode: nextMode,
          kind: "cell",
          anchorCellPos: sel.$anchorCell.pos,
          headCellPos: sel.$headCell.pos,
          anchorBlockPos: null,
          headBlockPos: null,
        })
        .scrollIntoView()
      v.dispatch(tr)
      v.focus()
    } catch {
      // not in table
    }
  }

  const enterTableCellSelectionMode = () => {
    const v = viewRef.current
    if (!v) return
    const state = v.state
    try {
      const $cell = pmSelectionCell(state)
      const sel = state.selection instanceof CellSelection ? state.selection : new CellSelection($cell)
      const tr = state.tr
        .setSelection(sel)
        .setMeta(selectionModePluginKey, {
          mode: 1,
          kind: "cell",
          anchorCellPos: sel.$anchorCell.pos,
          headCellPos: sel.$headCell.pos,
          anchorBlockPos: null,
          headBlockPos: null,
        })
        .scrollIntoView()
      v.dispatch(tr)
      v.focus()
      window.requestAnimationFrame(() => {
        const v2 = viewRef.current
        if (!v2) return
        if (v2.state.selection instanceof CellSelection) {
          v2.focus()
          return
        }
        try {
          const $cell2 = pmSelectionCell(v2.state)
          const sel2 = new CellSelection($cell2)
          v2.dispatch(
            v2.state.tr
              .setSelection(sel2)
              .setMeta(selectionModePluginKey, {
                mode: 1,
                kind: "cell",
                anchorCellPos: sel2.$anchorCell.pos,
                headCellPos: sel2.$headCell.pos,
                anchorBlockPos: null,
                headBlockPos: null,
              })
              .scrollIntoView()
          )
          v2.focus()
        } catch {
          // ignore if selection moved out of table
        }
      })
    } catch {
      // not in table
    }
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

      {/* Block inserter menu - 블럭 삽입 메뉴 */}
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
            // block inserter rail uses z-60; keep menu above it
            className="w-[320px] p-0 z-[70]"
            onCloseAutoFocus={(e) => {
              // Keep selection stable; the plugin will close the menu and keep the rail visible.
              e.preventDefault()
            }}
          >
            <DropdownMenuLabel className="px-2 py-2">Insert Block</DropdownMenuLabel>
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
                        className="rounded-sm border border-border size-6 text-xs hover:bg-background flex items-center justify-center"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          runBlockMenuCommand(it.key, "before")
                        }}
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-sm border border-border size-6 text-xs hover:bg-background flex items-center justify-center"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          runBlockMenuCommand(it.key, "after")
                        }}
                      >
                        <ArrowDown className="size-4" />
                      </button>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* Block handle menu */}
      {handleMenuOpen && handleMenuAnchor ? (
        <DropdownMenu
          open={handleMenuOpen}
          onOpenChange={(open) => {
            if (!open) closeHandleMenu()
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              style={{
                position: "fixed",
                left: Math.round(handleMenuAnchor.left),
                top: Math.round(handleMenuAnchor.top),
                width: Math.max(1, Math.round(handleMenuAnchor.width)),
                height: Math.max(1, Math.round(handleMenuAnchor.height)),
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={6}
            className="min-w-[220px] p-1 z-[80]"
            onCloseAutoFocus={(e) => {
              e.preventDefault()
            }}
          >
            {handleMenuKind === "table_row" ? (
              <>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    duplicateHandleBlock()
                    closeHandleMenu()
                  }}
                >
                  <CopyPlus className="size-4" />
                  복제
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    deleteHandleBlock()
                    closeHandleMenu()
                  }}
                >
                  <X className="size-4" />
                  삭제
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    duplicateHandleBlock()
                    closeHandleMenu()
                  }}
                >
                  <CopyPlus className="size-4" />
                  복제
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Repeat className="size-4" />
                    전환
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56 p-1">
                    {[
                      { key: "text", label: "텍스트", icon: <Type className="size-4" /> },
                      { key: "h1", label: "H1", icon: <Heading1 className="size-4" /> },
                      { key: "h2", label: "H2", icon: <Heading2 className="size-4" /> },
                      { key: "h3", label: "H3", icon: <Heading3 className="size-4" /> },
                      { key: "quote", label: "인용", icon: <Quote className="size-4" /> },
                      { key: "code", label: "코드 블럭", icon: <SquareCode className="size-4" /> },
                      { key: "list", label: "글머리 기호 목록", icon: <List className="size-4" /> },
                      { key: "ordered", label: "번호 매기기 목록", icon: <ListOrdered className="size-4" /> },
                      { key: "checklist", label: "할 일 목록", icon: <ListTodo className="size-4" /> },
                      { key: "page", label: "페이지", icon: <File className="size-4" /> },
                    ].map((it) => (
                      <DropdownMenuItem
                        key={it.key}
                        onSelect={(e) => {
                          e.preventDefault()
                          runHandleReplaceCommand(it.key)
                          closeHandleMenu()
                        }}
                        className="flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          {it.icon}
                          {it.label}
                        </span>
                        {(() => {
                          const v = viewRef.current
                          const node = handleMenuRange?.from != null ? v?.state.doc.nodeAt(handleMenuRange.from) : null
                          const type = node?.type?.name || ""
                          const attrs = (node?.attrs || {}) as { level?: number; listKind?: string }
                          const matches =
                            (it.key === "text" && type === "paragraph") ||
                            (it.key === "h1" && type === "heading" && attrs.level === 1) ||
                            (it.key === "h2" && type === "heading" && attrs.level === 2) ||
                            (it.key === "h3" && type === "heading" && attrs.level === 3) ||
                            (it.key === "quote" && type === "blockquote") ||
                            (it.key === "code" && type === "code_block") ||
                            (it.key === "list" && type === "bullet_list") ||
                            (it.key === "ordered" && type === "ordered_list") ||
                            (it.key === "checklist" && type === "bullet_list" && attrs.listKind === "check") ||
                            (it.key === "page" && type === "page_link")
                          return matches ? <span>✓</span> : null
                        })()}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Paintbrush className="size-4" />
                    배경색
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56 p-2">
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
                            c.darkBgClass || "",
                          ].join(" ")}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            run(cmdSetBlockBgColor(editorSchema, c.key))
                            closeHandleMenu()
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
                          closeHandleMenu()
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    deleteHandleBlock()
                    closeHandleMenu()
                  }}
                >
                  <X className="size-4" />
                  삭제
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* Toolbar: use theme-aware background for dark mode - 블럭 에디터 툴바 */}
      {toolbarOpen ? (
        <div
          className={[
            // Sticky toolbar: when the page title scrolls away, pin this toolbar to the top of the scroll container.
            "sticky top-0 z-20",
            // Layout + styling
            "hidden sm:flex flex-wrap items-center",
            "bg-accent/75 backdrop-blur supports-[backdrop-filter]:bg-accent/75",
            "rounded-md",
          ].join(" ")}
        >
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
                        c.darkBgClass || "",
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
                        <Paintbrush />
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
                  openPageLinkPicker()
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
                    // Extract category_id from URL query string so child pages inherit the parent's category
                    const urlParams = new URLSearchParams(window.location.search)
                    const category_id = urlParams.get("category") || null
                    const r = await fetch(`/api/posts`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ title: "New page", page_type: "page", status: "draft", visibility: "private", parent_id, category_id }),
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
            <ToolbarTooltip label="Select Cell">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => {
                  e.preventDefault()
                  cycleTableCellSelectionMode()
                }}
              >
               <SquareMousePointer />
              </ButtonGroupItem>
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
            <ToolbarTooltip label="Top">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellVAlign(editorSchema, "top"))}
              >
               <ArrowUpToLine />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Middle">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellVAlign(editorSchema, "middle"))}
              >
               <ChevronsDownUp />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="Bottom">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellVAlign(editorSchema, "bottom"))}
              >
               <ArrowDownToLine />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="border toggle">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, cmdToggleTableBorder(editorSchema))}
              >
               <SquareDashed />
              </ButtonGroupItem>
            </ToolbarTooltip>
            <ToolbarTooltip label="round toggle">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}
                onMouseDown={(e) => runFromToolbar(e, cmdToggleTableRounded(editorSchema))}
              >
               <SquareRoundCorner />
              </ButtonGroupItem>
            </ToolbarTooltip>
            {/* 테이블 너비 조절
            <ToolbarTooltip label="Table width wideen">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}                
              >
               <MoveHorizontal />
              </ButtonGroupItem>
            </ToolbarTooltip> */}
            {/* 너비 조절
            <ToolbarTooltip label="Adjust the width">
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableActive}                
              >
               <RulerDimensionLine />
              </ButtonGroupItem>
            </ToolbarTooltip> */}
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
            <Popover open={tableCellBgOpen} onOpenChange={setTableCellBgOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <ButtonGroupItem
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!tableActive}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <PaintBucket />
                    </ButtonGroupItem>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  Cell Background Color
                </TooltipContent>
              </Tooltip>

              <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
                <div className="text-xs font-semibold mb-2">Cell background color</div>
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
                        c.darkBgClass || "",
                      ].join(" ")}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        run(cmdSetTableCellBgColor(editorSchema, c.key))
                        setTableCellBgOpen(false)
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
                      run(cmdClearTableCellBgColor(editorSchema))
                      setTableCellBgOpen(false)
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
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
        </div>
      ) : null}

      
      <div ref={surfaceRef} className="relative p-3 bg-background text-foreground">
        {/* 셀 영역 선택 시 팝오버 버튼 그룹 */}
        {tableCellSelectionAnchor ? (
          <Popover open onOpenChange={() => {}}>
            <PopoverAnchor asChild>
              <div
                aria-hidden
                className="absolute"
                style={{
                  left: Math.round(tableCellSelectionAnchor.left),
                  top: Math.round(tableCellSelectionAnchor.top),
                  width: 1,
                  height: 1,
                  opacity: 0,
                  pointerEvents: "none",
                }}
              />
            </PopoverAnchor>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={10}
              className="w-auto z-[80] p-0"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onPointerDownCapture={() => {
                tableSelectionInteractingRef.current = true
              }}
              onPointerUpCapture={() => {
                tableSelectionInteractingRef.current = false
              }}
              onPointerCancelCapture={() => {
                tableSelectionInteractingRef.current = false
              }}
            >
              {selectionTableCellBgOpen ? (
                <div className="w-64 p-2">
                  <div className="flex items-center gap-1 mb-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setSelectionTableCellBgOpen(false)
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-semibold">Cell background color</span>
                  </div>
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
                          c.darkBgClass || "",
                        ].join(" ")}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          run(cmdSetTableCellBgColor(editorSchema, c.key))
                          setSelectionTableCellBgOpen(false)
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
                        run(cmdClearTableCellBgColor(editorSchema))
                        setSelectionTableCellBgOpen(false)
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              ) : (
              <ButtonGroup>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellAlign(editorSchema, "left"))}
              >
                <TextAlignStart />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellAlign(editorSchema, "center"))}
              >
                <TextAlignCenter />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellAlign(editorSchema, "right"))}
              >
                <TextAlignEnd />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellVAlign(editorSchema, "top"))}
              >
                <ArrowUpToLine />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellVAlign(editorSchema, "middle"))}
              >
                <ChevronsDownUp />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdSetTableCellVAlign(editorSchema, "bottom"))}
              >
                <ArrowDownToLine />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdToggleTableBorder(editorSchema))}
              >
                <SquareDashed />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, cmdToggleTableRounded(editorSchema))}
              >
                <SquareRoundCorner />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, tableCommands.mergeCells)}
              >
                <TableCellsMerge />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                disabled={!tableCanSplit}
                onMouseDown={(e) => runFromToolbar(e, tableCommands.splitCell)}
              >
                <TableCellsSplit />
              </ButtonGroupItem>
              <ButtonGroupItem
                type="button"
                variant="outline"
                size="sm"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setSelectionTableCellBgOpen(true)
                }}
              >
                <PaintBucket />
              </ButtonGroupItem>
              <ButtonGroupItem
                variant="outline"
                size="sm"
                onMouseDown={(e) => runFromToolbar(e, tableCommands.deleteTable)}
              >
                <Grid2X2X />
              </ButtonGroupItem>
              </ButtonGroup>
              )}
            </PopoverContent>
          </Popover>
        ) : null}
        {/* 셀 커서 위치 시 드롭다운 메뉴 */}
        {tableCellMenuAnchor ? (
          <DropdownMenu open={tableCellMenuOpen} onOpenChange={setTableCellMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Table cell menu"
                className="absolute z-20 inline-flex size-6 items-center justify-center rounded-full hover:border bg-accent/80 text-foreground hover:bg-accent hover:shadow-sm"
                style={{
                  left: tableCellMenuAnchor.left,
                  top: tableCellMenuAnchor.top,
                  transform: "translate(-100%, 0)",
                }}
                onMouseDown={(e) => {
                  // Prevent editor selection from being disturbed.
                  e.preventDefault()
                }}
              >
                <Ellipsis className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" sideOffset={6} className="min-w-56">    
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  enterTableCellSelectionMode()
                  setTableCellMenuOpen(false)
                }}
              >
                <SquareMousePointer className="size-4" />
                셀 선택
                <DropdownMenuShortcut>F5</DropdownMenuShortcut>
              </DropdownMenuItem>            
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(cmdSetTableCellAlign(editorSchema, "left"))
                  setTableCellMenuOpen(false)
                }}
              >
                <TextAlignStart className="size-4" />
                좌정렬
              </DropdownMenuItem>              
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(cmdSetTableCellAlign(editorSchema, "center"))
                  setTableCellMenuOpen(false)
                }}
              >
                <TextAlignCenter className="size-4" />
                중앙정렬
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(cmdSetTableCellAlign(editorSchema, "right"))
                  setTableCellMenuOpen(false)
                }}
              >
                <TextAlignEnd className="size-4" />
                우정렬
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(cmdSetTableCellVAlign(editorSchema, "top"))
                  setTableCellMenuOpen(false)
                }}
              >
                <ArrowUpToLine className="size-4" />
                상단 정렬
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(cmdSetTableCellVAlign(editorSchema, "middle"))
                  setTableCellMenuOpen(false)
                }}
              >
                <ChevronsDownUp className="size-4" />
                가운데 정렬
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(cmdSetTableCellVAlign(editorSchema, "bottom"))
                  setTableCellMenuOpen(false)
                }}
              >
                <ArrowDownToLine className="size-4" />
                하단 정렬
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(tableCommands.addRowBefore)
                  setTableCellMenuOpen(false)
                }}
              >
                <MoveUp className="size-4" />
                줄 삽입                
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(tableCommands.addRowAfter)
                  setTableCellMenuOpen(false)
                }}
              >
                <MoveDown className="size-4" />
                줄 삽입
                <DropdownMenuShortcut>{modEnterShortcutLabel}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(tableCommands.addColumnBefore)
                  setTableCellMenuOpen(false)
                }}
              >
                <MoveLeft className="size-4" />
                열 삽입
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(tableCommands.addColumnAfter)
                  setTableCellMenuOpen(false)
                }}
              >
                <MoveRight className="size-4" />
                열 삽입
                <DropdownMenuShortcut>{modShiftEnterShortcutLabel}</DropdownMenuShortcut>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(tableCommands.deleteRow)
                  setTableCellMenuOpen(false)
                }}
              >
                <X className="size-4" />
                줄 삭제
                <DropdownMenuShortcut>{modBackspaceShortcutLabel}</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(tableCommands.deleteColumn)
                  setTableCellMenuOpen(false)
                }}
              >
                <X className="size-4" />
                열 삭제
                <DropdownMenuShortcut>{modShiftBackspaceShortcutLabel}</DropdownMenuShortcut>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="flex items-center gap-2 text-accent-foreground">
                  <PaintBucket className="size-4 text-muted-foreground" />
                  <span>셀배경색상</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56 p-2">
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
                          run(cmdSetTableCellBgColor(editorSchema, c.key))
                          setTableCellMenuOpen(false)
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
                        run(cmdClearTableCellBgColor(editorSchema))
                        setTableCellMenuOpen(false)
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  run(tableCommands.deleteTable)
                  setTableCellMenuOpen(false)
                }}
              >
                <Grid2X2X className="size-4" />
                표전체 지우기
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {/* 텍스트 드래그 선택 시 팝오버 버튼 그룹 */}
        <Popover open={selectionToolbarOpen && !!selectionAnchor} onOpenChange={setSelectionToolbarOpen}>
          <PopoverAnchor asChild>
            <div
              aria-hidden
              className="absolute"
              style={{
                left: Math.round(selectionAnchor?.left || 0),
                top: Math.round(selectionAnchor?.top || 0),
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </PopoverAnchor>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={10}
            className="w-auto z-[70] p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerDownCapture={() => {
              // Clicking the bubble moves focus away from the editor.
              // Keep the bubble open so nested popovers (e.g. palette) can open reliably.
              bubbleInteractingRef.current = true
            }}
            onPointerUpCapture={() => {
              bubbleInteractingRef.current = false
            }}
            onPointerCancelCapture={() => {
              bubbleInteractingRef.current = false
            }}
          >
            {/* 텍스트 형식 (selection bubble) - 선택 영역 팝업 */}
            {selectionTextColorOpen ? (
              // Color Picker Mode
              <div className="w-64">
                 <div className="flex items-center justify-between px-1 mb-2">
                   <div className="flex items-center gap-1">
                     <Button
                       variant="ghost"
                       size="icon"
                       className="h-6 w-6"
                       onMouseDown={(e) => {
                         e.preventDefault()
                         setSelectionTextColorOpen(false)
                       }}
                     >
                       <ChevronLeft className="h-4 w-4" />
                     </Button>
                     <span className="text-xs font-semibold">Text color</span>
                   </div>
                 </div>
                 <div className="grid grid-cols-6 gap-2 p-1">
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
                         setSelectionTextColorOpen(false)
                       }}
                       aria-label={c.label}
                       title={c.label}
                     />
                   ))}
                 </div>
                 <div className="mt-2 flex justify-end px-1">
                   <Button
                     variant="ghost"
                     size="sm"
                     className="h-7 text-xs"
                     onMouseDown={(e) => {
                       e.preventDefault()
                       run(cmdClearTextColor(editorSchema))
                       setSelectionTextColorOpen(false)
                     }}
                   >
                     Reset
                   </Button>
                 </div>
              </div>
            ) : (
              // Normal Toolbar Mode
              <ButtonGroup>
                <ToolbarTooltip label="Bold">
                  <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdToggleBold(editorSchema))}>
                    <Bold />
                  </ButtonGroupItem>
                </ToolbarTooltip>
                <ToolbarTooltip label="Italic">
                  <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdToggleItalic(editorSchema))}>
                    <Italic />
                  </ButtonGroupItem>
                </ToolbarTooltip>
                <ToolbarTooltip label="Underline">
                  <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdToggleUnderline(editorSchema))}>
                    <Underline />
                  </ButtonGroupItem>
                </ToolbarTooltip>
                <ToolbarTooltip label="Strikethrough">
                  <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdToggleStrikethrough(editorSchema))}>
                    <Strikethrough />
                  </ButtonGroupItem>
                </ToolbarTooltip>
                <ToolbarTooltip label="Code">
                  <ButtonGroupItem variant="outline" size="sm" onMouseDown={(e) => runFromToolbar(e, cmdToggleCodeMark(editorSchema))}>
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
                <ToolbarTooltip label="Text Color">
                  <ButtonGroupItem
                    variant="outline"
                    size="sm"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setSelectionTextColorOpen(true)
                    }}
                  >
                    <Palette />
                  </ButtonGroupItem>
                </ToolbarTooltip>
              </ButtonGroup>
            )}
          </PopoverContent>
        </Popover>
        <div ref={mountRef} />

        {/* Page Link Picker Popover - positioned at cursor */}
        <Popover
          open={pageLinkPickerOpen}
          onOpenChange={(open) => {
            setPageLinkPickerOpen(open)
            if (!open) {
              setPageLinkSearch("")
              setPageLinkExpandedCats(new Set())
              setPageLinkAnchor(null)
            }
          }}
        >
          <PopoverAnchor
            style={{
              position: "absolute",
              left: pageLinkAnchor?.left ?? 0,
              top: pageLinkAnchor?.top ?? 0,
              width: 0,
              height: 0,
            }}
          />
          <PopoverContent
            className="w-80 p-0 max-h-96 overflow-hidden flex flex-col z-50"
            align="start"
            sideOffset={4}
          >
            {/* Search */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="text"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="페이지 검색..."
                  value={pageLinkSearch}
                  onChange={(e) => setPageLinkSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Categories and Pages */}
            <div className="flex-1 overflow-y-auto p-1">
              {(() => {
                const searchLower = pageLinkSearch.toLowerCase().trim()
                const decodeIcon = (raw: string | null): { kind: "emoji" | "lucide"; value: string } | null => {
                  if (!raw) return null
                  if (raw.startsWith("emoji:")) return { kind: "emoji", value: raw.slice(6) }
                  if (raw.startsWith("lucide:")) return { kind: "lucide", value: raw.slice(7) }
                  return null
                }

                const renderPageIcon = (iconRaw: string | null, hasContent: boolean) => {
                  const choice = decodeIcon(iconRaw)
                  if (!choice) {
                    const DefaultIcon = hasContent ? FileText : File
                    return <DefaultIcon className="size-4 shrink-0" />
                  }
                  if (choice.kind === "emoji") {
                    return <span className="text-sm leading-none shrink-0">{choice.value}</span>
                  }
                  const DefaultIcon = hasContent ? FileText : File
                  return <DefaultIcon className="size-4 shrink-0" />
                }

                const handleSelectPage = (page: { id: string; title: string; icon: string | null; hasContent: boolean }) => {
                  const view = viewRef.current
                  if (!view) return
                  
                  const savedState = pageLinkEditorStateRef.current
                  if (savedState) {
                    const n = editorSchema.nodes.page_link
                    if (!n) return
                    const tr = savedState.tr.replaceSelectionWith(n.create({
                      pageId: page.id,
                      title: page.title,
                      icon: page.icon,
                      display: "link",
                    })).scrollIntoView()
                    view.dispatch(tr)
                    view.focus()
                  }
                  
                  setPageLinkPickerOpen(false)
                  setPageLinkSearch("")
                  pageLinkEditorStateRef.current = null
                }

                const filteredPages = searchLower
                  ? pageLinkPages.filter((p) => p.title.toLowerCase().includes(searchLower))
                  : pageLinkPages

                if (searchLower) {
                  return (
                    <div className="space-y-0.5">
                      {filteredPages.length === 0 ? (
                        <div className="text-sm text-muted-foreground p-2">검색 결과가 없습니다</div>
                      ) : (
                        filteredPages.map((page) => (
                          <button
                            key={page.id}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent text-left"
                            onClick={() => handleSelectPage(page)}
                          >
                            {renderPageIcon(page.icon, page.hasContent)}
                            <span className="truncate">{page.title}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )
                }

                const pagesByCat = new Map<string, typeof filteredPages>()
                const uncategorized: typeof filteredPages = []
                for (const p of filteredPages) {
                  if (!p.parent_id) {
                    if (p.category_id) {
                      const arr = pagesByCat.get(p.category_id) || []
                      arr.push(p)
                      pagesByCat.set(p.category_id, arr)
                    } else {
                      uncategorized.push(p)
                    }
                  }
                }

                const renderCategory = (
                  cat: { id: string; name: string; icon: string | null },
                  type: "personal" | "team"
                ) => {
                  const catId = `${type}:${cat.id}`
                  const isExpanded = pageLinkExpandedCats.has(catId)
                  const pages = pagesByCat.get(cat.id) || []
                  const catIcon = decodeIcon(cat.icon)

                  return (
                    <div key={catId}>
                      <button
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md hover:bg-accent text-left"
                        onClick={() => {
                          setPageLinkExpandedCats((prev) => {
                            const next = new Set(prev)
                            if (next.has(catId)) next.delete(catId)
                            else next.add(catId)
                            return next
                          })
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4 shrink-0" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0" />
                        )}
                        {catIcon?.kind === "emoji" ? (
                          <span className="text-sm leading-none">{catIcon.value}</span>
                        ) : (
                          <FolderOpen className="size-4 shrink-0" />
                        )}
                        <span className="truncate">{cat.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{pages.length}</span>
                      </button>
                      {isExpanded && pages.length > 0 && (
                        <div className="ml-4 space-y-0.5">
                          {pages.map((page) => (
                            <button
                              key={page.id}
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent text-left"
                              onClick={() => handleSelectPage(page)}
                            >
                              {renderPageIcon(page.icon, page.hasContent)}
                              <span className="truncate">{page.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div className="space-y-1">
                    {pageLinkCategories.personal.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          <FolderOpen className="size-3" /> 개인 페이지
                        </div>
                        {pageLinkCategories.personal.map((cat) => renderCategory(cat, "personal"))}
                      </div>
                    )}

                    {pageLinkCategories.team.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          <Users className="size-3" /> 팀 페이지
                        </div>
                        {pageLinkCategories.team.map((cat) => renderCategory(cat, "team"))}
                      </div>
                    )}

                    {uncategorized.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">기타</div>
                        <div className="space-y-0.5">
                          {uncategorized.map((page) => (
                            <button
                              key={page.id}
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent text-left"
                              onClick={() => handleSelectPage(page)}
                            >
                              {renderPageIcon(page.icon, page.hasContent)}
                              <span className="truncate">{page.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {pageLinkCategories.personal.length === 0 &&
                      pageLinkCategories.team.length === 0 &&
                      uncategorized.length === 0 && (
                        <div className="text-sm text-muted-foreground p-2">페이지가 없습니다</div>
                      )}
                  </div>
                )
              })()}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Debug panel removed for performance - was causing expensive JSON.stringify and exportMarkdown on every keystroke */}
    </div>
  )
}


