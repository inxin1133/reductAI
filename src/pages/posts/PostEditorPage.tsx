import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ProseMirrorEditor } from "../../components/post/ProseMirrorEditor"
import {
  ChevronDown,
  ChevronsLeft,
  ChevronRight,
  File,
  FileText,
  ListTree,
  Plus,
  Save,
  ListChevronsDownUp,
  ListChevronsUpDown,
  ChevronsLeftRight,
  ChevronsRightLeft,
  SquareChevronUp,
  Settings2,
  Ellipsis,
  Smile,
  Star,
  Book,
  BookOpen,
  Calendar,
  CheckSquare,
  Hash,
  Code,
  PenLine,
  Image,
  Link,
  Globe,
  Bot,
  Share2,
} from "lucide-react"

import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import EmojiPicker, { Theme } from "emoji-picker-react"
import type { EmojiClickData } from "emoji-picker-react"

type CategoryUpdatedDetail = {
  id: string
  name?: string
  icon?: string | null
  deleted?: boolean
}

function emitCategoryUpdated(detail: CategoryUpdatedDetail) {
  try {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("reductai:categoryUpdated", { detail }))
  } catch {
    // ignore
  }
}

function authHeaders() {
  const token = localStorage.getItem("token")
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

type MyPage = {
  id: string
  parent_id: string | null
  title: string
  icon?: string | null
  child_count: number
  page_order: number
  updated_at: string
}

type DocJson = unknown

type MyPageCategory = {
  id: string
  name: string
  icon?: string | null
}

const LUCIDE_PRESETS = [
  { key: "File", label: "File", Icon: File },
  { key: "FileText", label: "FileText", Icon: FileText },
  { key: "Smile", label: "Smile", Icon: Smile },
  { key: "Star", label: "Star", Icon: Star },
  { key: "Book", label: "Book", Icon: Book },
  { key: "Calendar", label: "Calendar", Icon: Calendar },
  { key: "CheckSquare", label: "CheckSquare", Icon: CheckSquare },
  { key: "Hash", label: "Hash", Icon: Hash },
  { key: "Code", label: "Code", Icon: Code },
  { key: "PenLine", label: "Pen", Icon: PenLine },
  { key: "Image", label: "Image", Icon: Image },
  { key: "Link", label: "Link", Icon: Link },
  { key: "Globe", label: "Globe", Icon: Globe },
  { key: "Bot", label: "Bot", Icon: Bot },
] as const

const LUCIDE_PRESET_MAP: Record<string, React.ElementType> = Object.fromEntries(
  LUCIDE_PRESETS.map((x) => [x.key, x.Icon])
) as Record<string, React.ElementType>

function docJsonHasMeaningfulContent(docJson: unknown): boolean {
  if (!docJson || typeof docJson !== "object") return false
  const root = docJson as Record<string, unknown>
  const content = Array.isArray(root.content) ? (root.content as unknown[]) : []
  if (!content.length) return false

  for (const n of content) {
    if (!n || typeof n !== "object") continue
    const node = n as Record<string, unknown>
    const type = String(node.type || "")
    if (!type) continue

    // Ignore a single empty trailing paragraph.
    if (type === "paragraph") {
      const kids = Array.isArray(node.content) ? (node.content as unknown[]) : []
      const hasText = kids.some((c) => {
        if (!c || typeof c !== "object") return false
        const cc = c as Record<string, unknown>
        if (String(cc.type || "") !== "text") return false
        const t = typeof cc.text === "string" ? cc.text : ""
        return Boolean(t.trim())
      })
      if (hasText) return true
      continue
    }

    // Any other top-level block counts as content.
    return true
  }
  return false
}

type PageIconChoice =
  | { kind: "emoji"; value: string }
  | { kind: "lucide"; value: string }

function encodePageIcon(choice: PageIconChoice | null): string | null {
  if (!choice) return null
  if (choice.kind === "emoji") return `emoji:${choice.value}`
  return `lucide:${choice.value}`
}

function decodePageIcon(raw: unknown): PageIconChoice | null {
  if (raw == null) return null
  const s = typeof raw === "string" ? raw : ""
  if (!s) return null
  if (s.startsWith("emoji:")) return { kind: "emoji", value: s.slice("emoji:".length) }
  if (s.startsWith("lucide:")) return { kind: "lucide", value: s.slice("lucide:".length) }
  // Back-compat: if it's non-ascii-ish, assume emoji; otherwise assume lucide name.
  if (/[^\w]/.test(s)) return { kind: "emoji", value: s }
  return { kind: "lucide", value: s }
}

function appendPageLinkToDocJson(docJson: unknown, args: { pageId: string; title: string; display?: "link" | "embed" }) {
  const pageId = String(args.pageId || "").trim()
  if (!pageId) return docJson
  const title = String(args.title || "New page")
  const display = args.display === "embed" ? "embed" : "link"

  if (!docJson || typeof docJson !== "object") return docJson
  const root = docJson as Record<string, unknown>
  if (String(root.type || "") !== "doc") return docJson
  const content = Array.isArray(root.content) ? (root.content as unknown[]) : []

  const next = content.concat([
    {
      type: "page_link",
      attrs: { blockId: null, pageId, title, display },
    },
  ])
  return { ...root, content: next }
}

function insertPageLinkAfterDocJson(
  docJson: unknown,
  args: { afterPageId: string; pageId: string; title: string; display?: "link" | "embed" }
) {
  const afterPageId = String(args.afterPageId || "").trim()
  const pageId = String(args.pageId || "").trim()
  if (!afterPageId || !pageId) return docJson

  const title = String(args.title || "New page")
  const display = args.display === "embed" ? "embed" : "link"

  if (!docJson || typeof docJson !== "object") return docJson
  const root = docJson as Record<string, unknown>
  if (String(root.type || "") !== "doc") return docJson
  const content = Array.isArray(root.content) ? (root.content as unknown[]) : []

  let inserted = false
  const next: unknown[] = []
  for (const n of content) {
    next.push(n)
    if (inserted) continue
    if (!n || typeof n !== "object") continue
    const node = n as Record<string, unknown>
    if (String(node.type || "") !== "page_link") continue
    const attrs = node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {}
    const pid = typeof attrs.pageId === "string" ? attrs.pageId : ""
    if (pid !== afterPageId) continue
    next.push({ type: "page_link", attrs: { blockId: null, pageId, title, display } })
    inserted = true
  }

  if (!inserted) {
    return appendPageLinkToDocJson(docJson, { pageId, title, display })
  }
  return { ...root, content: next }
}

function removePageLinksFromDocJson(docJson: unknown, targetPageId: string) {
  const tid = String(targetPageId || "").trim()
  if (!tid) return docJson

  const walk = (n: unknown): unknown => {
    if (!n || typeof n !== "object") return n
    const node = n as Record<string, unknown>
    const type = typeof node.type === "string" ? node.type : ""
    const attrs = node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {}
    const content = Array.isArray(node.content) ? (node.content as unknown[]) : null

    if (type === "page_link") {
      const pid = typeof attrs.pageId === "string" ? attrs.pageId : ""
      if (String(pid) === tid) return null
    }

    if (!content) return n

    const nextContent: unknown[] = []
    for (const c of content) {
      const next = walk(c)
      if (next != null) nextContent.push(next)
    }
    return { ...node, content: nextContent }
  }

  return walk(docJson)
}

function remapPageLinksInDocJson(
  docJson: unknown,
  idMap: Map<string, string>,
  titleMap: Map<string, string>
): unknown {
  const walk = (n: unknown): unknown => {
    if (!n || typeof n !== "object") return n
    const node = n as Record<string, unknown>
    const type = typeof node.type === "string" ? node.type : ""
    const attrs = node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {}
    const content = Array.isArray(node.content) ? (node.content as unknown[]) : null

    if (type === "page_link") {
      const curId = typeof attrs.pageId === "string" ? attrs.pageId : ""
      const mapped = idMap.get(String(curId))
      if (mapped) {
        const nextTitle = titleMap.get(String(curId)) || (typeof attrs.title === "string" ? attrs.title : "")
        return {
          ...node,
          attrs: { ...attrs, pageId: mapped, title: nextTitle },
        }
      }
    }

    if (!content) return n
    const nextContent: unknown[] = []
    for (const c of content) {
      const next = walk(c)
      if (next != null) nextContent.push(next)
    }
    return { ...node, content: nextContent }
  }

  return walk(docJson)
}

async function updatePostContent(postId: string, updater: (docJson: unknown) => unknown) {
  const pid = String(postId || "").trim()
  if (!pid) return false
  const authOnly: Record<string, string> = { ...authHeaders() }

  const r = await fetch(`/api/posts/${pid}/content`, { headers: authOnly })
  if (!r.ok) return false
  const json: unknown = await r.json().catch(() => null)
  const j = json && typeof json === "object" ? (json as Record<string, unknown>) : {}
  const version = Number(j.version || 0)
  const curDoc = "docJson" in j ? j.docJson : null

  const nextDoc = updater(curDoc)
  const wr = await fetch(`/api/posts/${pid}/content`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authOnly },
    body: JSON.stringify({ docJson: nextDoc, version }),
  })
  return wr.ok
}

function extractEmbedIdsInOrder(docJson: unknown): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return
    const node = n as Record<string, unknown>
    const type = typeof node.type === "string" ? node.type : ""
    if (type === "page_link") {
      const attrs = node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {}
      const display = typeof attrs.display === "string" ? attrs.display : ""
      const pageId = typeof attrs.pageId === "string" ? attrs.pageId : ""
      if (display === "embed" && pageId && !seen.has(pageId)) {
        seen.add(pageId)
        out.push(pageId)
      }
    }
    const content = node.content
    if (Array.isArray(content)) {
      for (const c of content) walk(c)
    }
  }
  walk(docJson)
  return out
}

export default function PostEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const rawId = id || ""
  const isNew = rawId === "new"
  const postId = rawId

  const categoryId = useMemo(() => {
    const qs = new URLSearchParams(location.search || "")
    return String(qs.get("category") || "").trim()
  }, [location.search])
  const categoryQS = useMemo(() => (categoryId ? `?category=${encodeURIComponent(categoryId)}` : ""), [categoryId])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverVersion, setServerVersion] = useState<number>(0)
  const [initialDocJson, setInitialDocJson] = useState<DocJson>(null)
  const [draftDocJson, setDraftDocJson] = useState<DocJson>(null)

  const NAV_OPEN_KEY = "reductai:postEditor:navOpen"
  const NAV_WIDTH_KEY = "reductai:postEditor:navWidth"
  const NAV_MIN_W = 220
  const NAV_MAX_W = 380
  const getInitialNavOpen = () => {
    try {
      if (typeof window === "undefined") return true
      const v = window.localStorage.getItem(NAV_OPEN_KEY)
      if (v === "0") return false
      if (v === "1") return true
      return true
    } catch {
      return true
    }
  }
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
  const getInitialNavWidth = () => {
    try {
      if (typeof window === "undefined") return NAV_MIN_W
      const raw = window.localStorage.getItem(NAV_WIDTH_KEY)
      const n = Number(raw)
      if (!Number.isFinite(n)) return NAV_MIN_W
      return clamp(Math.round(n), NAV_MIN_W, NAV_MAX_W)
    } catch {
      return NAV_MIN_W
    }
  }

  // Persist the user's preference for the left page tree visibility across route changes.
  const [navOpen, setNavOpen] = useState<boolean>(() => getInitialNavOpen())
  const navOpenRef = useRef<boolean>(getInitialNavOpen())
  const [navWidth, setNavWidth] = useState<number>(() => getInitialNavWidth())
  const [navResizing, setNavResizing] = useState(false)
  const navResizeRef = useRef<{ startX: number; startW: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false)
  const [myPages, setMyPages] = useState<MyPage[]>([])
  const [pageHasContent, setPageHasContent] = useState<Record<string, boolean>>({})
  // Keep latest pageHasContent in a ref so event handlers (embed removed/added) can read fresh values
  // without forcing re-subscription of window event listeners.
  const pageHasContentRef = useRef<Record<string, boolean>>({})
  useEffect(() => {
    pageHasContentRef.current = pageHasContent
  }, [pageHasContent])
  const [iconPickerOpenId, setIconPickerOpenId] = useState<string | null>(null)
  // Embed block icon picker state (separate from sidebar icon picker)
  const [embedIconPickerId, setEmbedIconPickerId] = useState<string | null>(null)
  const [embedIconPickerAnchor, setEmbedIconPickerAnchor] = useState<{ left: number; top: number } | null>(null)
  const [visiblePageIds, setVisiblePageIds] = useState<Set<string>>(() => new Set())
  const ioRef = useRef<IntersectionObserver | null>(null)
  const observedElsRef = useRef<Map<string, HTMLElement>>(new Map())
  const [iconPickerTab, setIconPickerTab] = useState<"emoji" | "icon">("emoji")
  const [lucideQuery, setLucideQuery] = useState("")
  const [lucideAll, setLucideAll] = useState<Record<string, React.ElementType> | null>(null)
  const [lucideLoading, setLucideLoading] = useState(false)
  const lucideLoadSeqRef = useRef(0)
  const [pageTitle, setPageTitle] = useState<string>("")
  const [pageIconRaw, setPageIconRaw] = useState<string | null>(null)
  const [titleIconOpen, setTitleIconOpen] = useState(false)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [isDeletedPage, setIsDeletedPage] = useState(false)

  // Page tree drag & drop state (Notion-style)
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null)
  const [pageDropIndicator, setPageDropIndicator] = useState<{
    id: string
    position: "before" | "after" | "inside"
  } | null>(null)
  const pageDragBlockClickUntilRef = useRef<number>(0)

  const [activeCategory, setActiveCategory] = useState<{
    id: string
    type: "personal" | "team" | "unknown"
    name: string
    icon: string | null
  } | null>(null)
  const [categoryIconOpen, setCategoryIconOpen] = useState(false)
  const [categoryRenameOpen, setCategoryRenameOpen] = useState(false)
  const [categoryRenameValue, setCategoryRenameValue] = useState("")
  const categoryRenameInputRef = useRef<HTMLInputElement | null>(null)
  const categoryRenameFocusUntilRef = useRef<number>(0)

  // Keep category header in sync with Sidebar edits (rename/icon) without refresh.
  useEffect(() => {
    const onUpdated = (ev: Event) => {
      const ce = ev as CustomEvent<CategoryUpdatedDetail>
      const d = ce?.detail
      const id = d && typeof d.id === "string" ? d.id : ""
      if (!id) return
      if (!categoryId || String(categoryId) !== id) return

      // If the current category was deleted, auto-navigate to the top category.
      if (d?.deleted) {
        const h = authHeaders()
        if (!h.Authorization) return
        void Promise.all([
          fetch("/api/posts/categories/mine", { headers: h }).catch(() => null),
          fetch("/api/posts/categories/mine?type=team_page", { headers: h }).catch(() => null),
        ]).then(async ([pRes, tRes]) => {
          const personal: MyPageCategory[] = pRes && pRes.ok ? ((await pRes.json().catch(() => [])) as MyPageCategory[]) : []
          const team: MyPageCategory[] = tRes && tRes.ok ? ((await tRes.json().catch(() => [])) as MyPageCategory[]) : []
          const nextId = (Array.isArray(personal) && personal.length ? String(personal[0]?.id || "") : "") || (Array.isArray(team) && team.length ? String(team[0]?.id || "") : "")
          navigate(nextId ? `/posts?category=${encodeURIComponent(nextId)}` : `/posts/new/edit`, { replace: true })
        })
        return
      }

      const nextName = typeof d.name === "string" ? d.name : undefined
      const nextIcon = "icon" in (d || {}) ? (d.icon as string | null | undefined) : undefined

      setActiveCategory((prev) => {
        if (!prev || String(prev.id) !== id) return prev
        return {
          ...prev,
          ...(nextName !== undefined ? { name: nextName } : null),
          ...(nextIcon !== undefined ? { icon: nextIcon } : null),
        }
      })

      // If we're currently renaming, keep the input value in sync only if user hasn't diverged.
      if (nextName !== undefined) {
        setCategoryRenameValue((v) => (categoryRenameOpen ? v : nextName))
      }
    }
    window.addEventListener("reductai:categoryUpdated", onUpdated as EventListener)
    return () => window.removeEventListener("reductai:categoryUpdated", onUpdated as EventListener)
  }, [categoryId, categoryRenameOpen, navigate])

  const saveCategory = useCallback(
    async (args: { id: string; patch: { name?: string; icon?: string | null } }) => {
      const token = localStorage.getItem("token")
      if (!token) return
      const id = String(args.id || "").trim()
      if (!id) return
      const patch = args.patch || {}
      const r = await fetch(`/api/posts/categories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null)
      if (!r || !r.ok) {
        const msg = r ? await r.text().catch(() => "") : ""
        toast.error(msg || "카테고리 업데이트에 실패했습니다.")
        return
      }
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      setActiveCategory((prev) => {
        if (!prev || String(prev.id) !== id) return prev
        const nextName = typeof j.name === "string" ? j.name : typeof patch.name === "string" ? patch.name : prev.name
        const serverIconRaw = "icon" in j ? (j.icon as unknown) : patch.icon
        const nextIcon = serverIconRaw === null ? null : typeof serverIconRaw === "string" ? serverIconRaw : prev.icon
        return { ...prev, name: nextName, icon: nextIcon }
      })
      emitCategoryUpdated({
        id,
        ...(typeof patch.name === "string" ? { name: patch.name } : null),
        ...("icon" in patch ? { icon: patch.icon } : null),
      })
    },
    []
  )

  const saveCategoryIcon = useCallback(
    async (choice: PageIconChoice | null) => {
      if (!categoryId) return
      setActiveCategory((prev) => {
        if (!prev || String(prev.id) !== String(categoryId)) return prev
        return { ...prev, icon: encodePageIcon(choice) }
      })
      await saveCategory({ id: categoryId, patch: { icon: encodePageIcon(choice) } })
    },
    [categoryId, saveCategory]
  )

  const commitCategoryRename = useCallback(async () => {
    if (!categoryId) return
    const next = String(categoryRenameValue || "").trim()
    if (!next) return
    setActiveCategory((prev) => {
      if (!prev || String(prev.id) !== String(categoryId)) return prev
      return { ...prev, name: next }
    })
    await saveCategory({ id: categoryId, patch: { name: next } })
  }, [categoryId, categoryRenameValue, saveCategory])

  useEffect(() => {
    if (!categoryRenameOpen) return
    categoryRenameFocusUntilRef.current = Date.now() + 250
    window.setTimeout(() => {
      categoryRenameInputRef.current?.focus()
    }, 0)
  }, [categoryRenameOpen])

  // Load current category (icon + name) from server for the header display.
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!categoryId) {
        setActiveCategory(null)
        return
      }
      const h = authHeaders()
      if (!h.Authorization) return
      try {
        const [pRes, tRes] = await Promise.all([
          fetch("/api/posts/categories/mine", { headers: h }).catch(() => null),
          fetch("/api/posts/categories/mine?type=team_page", { headers: h }).catch(() => null),
        ])
        const personal: MyPageCategory[] = pRes && pRes.ok ? ((await pRes.json().catch(() => [])) as MyPageCategory[]) : []
        const team: MyPageCategory[] = tRes && tRes.ok ? ((await tRes.json().catch(() => [])) as MyPageCategory[]) : []
        const pid = String(categoryId)
        const pMatch = Array.isArray(personal) ? personal.find((c) => String(c.id) === pid) : undefined
        const tMatch = Array.isArray(team) ? team.find((c) => String(c.id) === pid) : undefined
        const found = pMatch || tMatch
        if (!found) {
          // Category doesn't exist (probably deleted). Redirect to the top available category.
          const nextId =
            (Array.isArray(personal) && personal.length ? String(personal[0]?.id || "") : "") ||
            (Array.isArray(team) && team.length ? String(team[0]?.id || "") : "")
          if (!cancelled) setActiveCategory(null)
          if (!cancelled) navigate(nextId ? `/posts?category=${encodeURIComponent(nextId)}` : `/posts/new/edit`, { replace: true })
          return
        }
        const type = tMatch ? "team" : "personal"
        const name = typeof found.name === "string" ? found.name : "카테고리"
        const icon = typeof found.icon === "string" ? found.icon : found.icon === null ? null : null
        if (!cancelled) setActiveCategory({ id: pid, type, name, icon })
      } catch {
        // ignore
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [categoryId, navigate])

  // Tree row actions (rename / duplicate / delete / add child)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTargetId, setRenameTargetId] = useState<string>("")
  const [renameValue, setRenameValue] = useState<string>("")
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  const PM_TOOLBAR_OPEN_KEY = "reductai:pmEditor:toolbarOpen"
  const [pmToolbarOpen, setPmToolbarOpen] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") return false
      return window.localStorage.getItem(PM_TOOLBAR_OPEN_KEY) === "1"
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      window.localStorage.setItem(PM_TOOLBAR_OPEN_KEY, pmToolbarOpen ? "1" : "0")
    } catch {
      // ignore (storage might be blocked)
    }
  }, [pmToolbarOpen])

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      window.localStorage.setItem(NAV_WIDTH_KEY, String(clamp(navWidth, NAV_MIN_W, NAV_MAX_W)))
    } catch {
      // ignore (storage might be blocked)
    }
  }, [NAV_MAX_W, NAV_MIN_W, NAV_WIDTH_KEY, navWidth])

  const CONTENT_WIDE_KEY_PREFIX = "reductai:postEditor:isWideLayout:"
  const wideKeyFor = useCallback(
    (pid: string) => `${CONTENT_WIDE_KEY_PREFIX}${String(pid || "").trim()}`,
    []
  )
  const readWidePref = useCallback(
    (pid: string) => {
      try {
        if (typeof window === "undefined") return false
        const k = wideKeyFor(pid)
        return window.localStorage.getItem(k) === "1"
      } catch {
        return false
      }
    },
    [wideKeyFor]
  )

  const [isWideLayout, setIsWideLayout] = useState<boolean>(() => {
    if (!postId || postId === "new") return false
    return readWidePref(postId)
  })

  useEffect(() => {
    if (!postId || postId === "new") return
    setIsWideLayout(readWidePref(postId))
  }, [postId, readWidePref])

  useEffect(() => {
    if (!postId || postId === "new") return
    try {
      if (typeof window === "undefined") return
      const k = wideKeyFor(postId)
      window.localStorage.setItem(k, isWideLayout ? "1" : "0")
    } catch {
      // ignore (storage might be blocked)
    }
  }, [isWideLayout, postId, wideKeyFor])

  const canSave = useMemo(() => !!postId && !isNew && !!draftDocJson, [postId, isNew, draftDocJson])

  // Autosave / safe navigation helpers
  const draftRef = useRef<DocJson>(null)
  const versionRef = useRef<number>(0)
  const lastSavedRef = useRef<string>("")
  const savingRef = useRef(false)
  const pendingSaveRef = useRef(false)
  const autoTimerRef = useRef<number | null>(null)
  const navigatingRef = useRef<string | null>(null)
  const draftStateTimerRef = useRef<number | null>(null) // Debounce timer for draftDocJson state updates
  const [dirty, setDirty] = useState(false)

  // IMPORTANT:
  // Keep ordering stable and NOT dependent on title (renaming shouldn't reshuffle the tree).
  // We currently rely on page_order only; when equal, preserve the existing order.
  const sortPages = useCallback((pages: MyPage[]) => {
    const indexed = pages.map((p, idx) => ({ p, idx }))
    indexed.sort((a, b) => {
      const ao = Number(a.p.page_order || 0)
      const bo = Number(b.p.page_order || 0)
      if (ao !== bo) return ao - bo
      return a.idx - b.idx
    })
    return indexed.map((x) => x.p)
  }, [])

  const filterNonDeleted = useCallback((pages: MyPage[]) => {
    return pages.filter((p) => {
      const anyP = p as unknown as Record<string, unknown>
      const status = typeof anyP.status === "string" ? anyP.status : ""
      const deletedAt = anyP.deleted_at != null
      return status !== "deleted" && !deletedAt
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const authOnly: Record<string, string> = { ...authHeaders() }
        if (!authOnly.Authorization) {
          throw new Error("로그인이 필요합니다. (token missing)")
        }

        // Landing flow: /posts/new/edit
        // - If the user already has pages, open the topmost one.
        // - Otherwise, show empty state (user creates via +)
        if (isNew) {
          const pagesRes = await fetch(
            categoryId ? `/api/posts/mine?categoryId=${encodeURIComponent(categoryId)}` : `/api/posts/mine`,
            { headers: authOnly }
          )
          if (pagesRes.ok) {
            const pagesJson = await pagesRes.json()
            const pages = Array.isArray(pagesJson) ? (pagesJson as MyPage[]) : []
            const sorted = sortPages(filterNonDeleted(pages))
            if (!cancelled) setMyPages(sorted)

            if (sorted.length > 0) {
              const firstId = String(sorted[0].id || "")
              if (firstId) {
                navigate(`/posts/${firstId}/edit${categoryQS}`, { replace: true })
                return
              }
            }
          }

          // no pages -> empty state (no auto-create)
          if (!cancelled) {
            setInitialDocJson(null)
            setDraftDocJson(null)
            setServerVersion(0)
            setPageIconRaw(null)
            const s = JSON.stringify(null)
            lastSavedRef.current = s
            setDirty(false)
          }
          return
        }

        // Load sidebar tree (my pages)
        const pagesRes = await fetch(
          categoryId ? `/api/posts/mine?categoryId=${encodeURIComponent(categoryId)}` : `/api/posts/mine`,
          { headers: authOnly }
        )
        let nonDeletedSorted: MyPage[] = []
        if (pagesRes.ok) {
          const pagesJson = await pagesRes.json()
          if (!cancelled && Array.isArray(pagesJson)) {
            nonDeletedSorted = sortPages(filterNonDeleted(pagesJson as MyPage[]))
            setMyPages(nonDeletedSorted)
          }
        }

        const r = await fetch(`/api/posts/${postId}/content`, { headers: authOnly })
        if (!r.ok) throw new Error(await r.text())
        const json: unknown = await r.json()
        if (cancelled) return
        const j = json && typeof json === "object" ? (json as Record<string, unknown>) : {}
        setServerVersion(Number(j.version || 0))
        setInitialDocJson(j.docJson || null)
        setDraftDocJson(j.docJson || null)
        const title = typeof j.title === "string" && j.title.trim() ? j.title : "New page"
        setPageTitle(title)
        setPageIconRaw(typeof j.icon === "string" ? j.icon : null)
        const pageCategoryId = typeof j.category_id === "string" ? j.category_id : null
        const status = typeof j.status === "string" ? j.status : ""
        const deletedAt = j.deleted_at != null
        const isDeleted = status === "deleted" || deletedAt
        setIsDeletedPage(isDeleted)

        // If the URL has no category but the page belongs to one, redirect with the correct category.
        // This fixes the issue where navigating from an embed link loses the category context.
        if (!categoryId && pageCategoryId && !isDeleted) {
          navigate(`/posts/${postId}/edit?category=${encodeURIComponent(pageCategoryId)}`, { replace: true })
          return
        }

        // Safety: if the user somehow lands on a deleted page, redirect away.
        if (isDeleted) {
          const firstId = nonDeletedSorted.length ? String(nonDeletedSorted[0].id || "") : ""
          navigate(firstId ? `/posts/${firstId}/edit${categoryQS}` : `/posts/new/edit${categoryQS}`, { replace: true })
          return
        }
        // reset autosave baseline
        const s = JSON.stringify(j.docJson || null)
        lastSavedRef.current = s
        setDirty(false)
      } catch (e: unknown) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : "Failed to load"
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (postId) load()
    return () => {
      cancelled = true
    }
  }, [categoryId, categoryQS, filterNonDeleted, postId, isNew, navigate, sortPages])

  // Save this page as the last viewed page for the current category.
  // This allows us to return to this page when the user navigates back to the category.
  useEffect(() => {
    if (!postId || postId === "new") return
    if (!categoryId) return
    if (isDeletedPage) return
    try {
      const key = `reductai.posts.lastViewedPage.${categoryId}`
      localStorage.setItem(key, postId)
    } catch {
      // ignore localStorage errors (e.g., private browsing mode)
    }
  }, [postId, categoryId, isDeletedPage])

  // If current page has a saved Lucide icon, lazy-load lucide map so the title can render it.
  useEffect(() => {
    if (!postId || postId === "new") return
    if (!pageIconRaw || !pageIconRaw.startsWith("lucide:")) return
    if (lucideAll || lucideLoading) return
    const seq = (lucideLoadSeqRef.current += 1)
    setLucideLoading(true)
    void import("lucide-react")
      .then((mod) => {
        if (lucideLoadSeqRef.current !== seq) return
        const iconsNs = (mod as unknown as Record<string, unknown>)["icons"]
        if (iconsNs && typeof iconsNs === "object") setLucideAll(iconsNs as Record<string, React.ElementType>)
      })
      .finally(() => {
        if (lucideLoadSeqRef.current === seq) setLucideLoading(false)
      })
  }, [lucideAll, lucideLoading, pageIconRaw, postId])

  // Reset picker UI when closing / switching rows
  useEffect(() => {
    if (!iconPickerOpenId && !titleIconOpen && !categoryIconOpen && !embedIconPickerId) {
      setIconPickerTab("emoji")
      setLucideQuery("")
      // Cancel any in-flight lucide import (best-effort) and clear loading state.
      lucideLoadSeqRef.current += 1
      setLucideLoading(false)
    }
  }, [categoryIconOpen, iconPickerOpenId, titleIconOpen, embedIconPickerId])

  // Listen for embed block icon picker open event
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ postId?: string; anchorRect?: { left: number; top: number } }>
      const pageId = ce.detail?.postId
      const anchorRect = ce.detail?.anchorRect
      if (!pageId) return
      
      setEmbedIconPickerId(pageId)
      if (anchorRect) {
        setEmbedIconPickerAnchor({ left: anchorRect.left, top: anchorRect.top })
      }
    }
    window.addEventListener("reductai:open-page-icon-picker", handler)
    return () => window.removeEventListener("reductai:open-page-icon-picker", handler)
  }, [])

  const savePageIcon = useCallback(
    async (pageId: string, choice: PageIconChoice | null) => {
      const token = localStorage.getItem("token")
      if (!token) return
      const nextIcon = encodePageIcon(choice)

      // Optimistic update in the tree
      setMyPages((prev) =>
        prev.map((p) => (String(p.id) === String(pageId) ? ({ ...p, icon: nextIcon } as MyPage) : p))
      )
      if (String(pageId) === String(postId || "")) {
        setPageIconRaw(nextIcon)
      }

      // Dispatch event immediately so embed blocks can update their icon
      window.dispatchEvent(new CustomEvent("reductai:page-icon-updated", {
        detail: { postId: pageId, icon: nextIcon },
      }))

      try {
        const r = await fetch(`/api/posts/${pageId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ icon: nextIcon }),
        })
        if (!r.ok) throw new Error(await r.text())
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
        const serverIconRaw = "icon" in j ? (j.icon as unknown) : nextIcon
        const serverIcon =
          serverIconRaw === null ? null : typeof serverIconRaw === "string" ? serverIconRaw : (nextIcon ?? null)
        setMyPages((prev) =>
          prev.map((p) => (String(p.id) === String(pageId) ? ({ ...p, icon: serverIcon } as MyPage) : p))
        )
        if (String(pageId) === String(postId || "")) {
          setPageIconRaw(serverIcon)
        }
        // Dispatch event again with confirmed server icon
        window.dispatchEvent(new CustomEvent("reductai:page-icon-updated", {
          detail: { postId: pageId, icon: serverIcon },
        }))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to update icon"
        toast.error(msg)
      }
    },
    [postId]
  )

  // Lazy-load the full lucide icon map only when the user searches.
  useEffect(() => {
    if (!iconPickerOpenId && !titleIconOpen && !categoryIconOpen) return
    if (iconPickerTab !== "icon") return
    const q = lucideQuery.trim()
    if (!q) return
    if (lucideAll || lucideLoading) return

    const seq = (lucideLoadSeqRef.current += 1)
    setLucideLoading(true)
    void import("lucide-react")
      .then((mod) => {
        if (lucideLoadSeqRef.current !== seq) return
        // lucide-react exposes *all* icons under `icons` as a namespace import.
        const iconsNs = (mod as unknown as Record<string, unknown>)["icons"]
        if (iconsNs && typeof iconsNs === "object") {
          setLucideAll(iconsNs as Record<string, React.ElementType>)
          return
        }

        // Fallback: derive icons from named exports. Note: many icons are forwardRef components (objects), not functions.
        const blacklist = new Set(["default", "createLucideIcon", "Icon", "LucideIcon", "LucideProps", "toKebabCase"])
        const map: Record<string, React.ElementType> = {}
        for (const k of Object.keys(mod)) {
          if (blacklist.has(k)) continue
          if (!/^[A-Z]/.test(k)) continue
          const v = (mod as unknown as Record<string, unknown>)[k]
          if (!v) continue
          const t = typeof v
          if (t !== "function" && t !== "object") continue
          map[k] = v as React.ElementType
        }
        setLucideAll(map)
      })
      .finally(() => {
        if (lucideLoadSeqRef.current === seq) setLucideLoading(false)
      })
  }, [categoryIconOpen, iconPickerOpenId, titleIconOpen, iconPickerTab, lucideAll, lucideLoading, lucideQuery])

  // Track which tree rows are actually visible (or near-visible) in the viewport.
  useEffect(() => {
    let cancelled = false
    const observedMap = observedElsRef.current
    ioRef.current = new IntersectionObserver(
      (entries) => {
        if (cancelled) return
        setVisiblePageIds((prev) => {
          let changed = false
          const next = new Set(prev)
          for (const entry of entries) {
            const el = entry.target as HTMLElement
            const id = String(el.dataset.pageId || "")
            if (!id) continue
            if (entry.isIntersecting) {
              if (!next.has(id)) {
                next.add(id)
                changed = true
              }
            } else {
              if (next.delete(id)) changed = true
            }
          }
          return changed ? next : prev
        })
      },
      // root=null: viewport. IntersectionObserver still respects scroll/clip ancestors.
      { root: null, threshold: 0, rootMargin: "200px 0px 200px 0px" }
    )
    const io = ioRef.current
    // Observe any rows already mounted
    for (const el of observedMap.values()) io.observe(el)
    return () => {
      cancelled = true
      io.disconnect()
      ioRef.current = null
      observedMap.clear()
    }
  }, [])

  const observeTreeRow = useCallback((id: string) => {
    return (el: HTMLElement | null) => {
      const prevEl = observedElsRef.current.get(id)
      if (prevEl && prevEl !== el) {
        ioRef.current?.unobserve(prevEl)
        observedElsRef.current.delete(id)
      }
      if (!el) return
      el.dataset.pageId = id
      observedElsRef.current.set(id, el)
      ioRef.current?.observe(el)
    }
  }, [])

  // Fetch lightweight content presence only for visible (or near-visible) pages.
  useEffect(() => {
    let cancelled = false
    async function run() {
      const token = localStorage.getItem("token")
      if (!token) return
      if (!myPages.length) return
      if (!visiblePageIds.size) return

      const visible = visiblePageIds
      const missing = myPages
        .map((p) => String(p.id))
        .filter((id) => id && visible.has(id) && pageHasContent[id] == null)
      if (!missing.length) return

      const headers = { Authorization: `Bearer ${token}` }
      const concurrency = 6
      let idx = 0
      const worker = async () => {
        while (!cancelled) {
          const cur = missing[idx]
          idx += 1
          if (!cur) return
          const r = await fetch(`/api/posts/${cur}/preview`, { headers }).catch(() => null)
          if (!r || !r.ok) {
            if (cancelled) return
            setPageHasContent((prev) => (prev[cur] != null ? prev : { ...prev, [cur]: false }))
            continue
          }
          const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
          const summary = typeof j.summary === "string" ? j.summary : ""
          const has = Boolean(summary.trim())
          if (cancelled) return
          setPageHasContent((prev) => ({ ...prev, [cur]: has }))
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()))
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [myPages, pageHasContent, visiblePageIds])

  const saveNow = useCallback(async (args?: { silent?: boolean }): Promise<boolean> => {
    if (!postId || !draftRef.current) return false
    if (savingRef.current) {
      pendingSaveRef.current = true
      return false
    }
    savingRef.current = true
    if (!args?.silent) setError(null)
    try {
      const authOnly: Record<string, string> = { ...authHeaders() }
      const r = await fetch(`/api/posts/${postId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authOnly },
        body: JSON.stringify({ docJson: draftRef.current, version: versionRef.current }),
      })
      if (r.status === 409) {
        const j = await r.json().catch(() => ({}))
        setError(`Version conflict (server: ${j.currentVersion}). Reload and try again.`)
        return false
      }
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      const nextV = Number(j.version || versionRef.current + 1)
      versionRef.current = nextV
      setServerVersion(nextV)
      lastSavedRef.current = JSON.stringify(draftRef.current || null)
      setDirty(false)
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save"
      setError(msg)
      return false
    } finally {
      savingRef.current = false
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false
        void saveNow({ silent: true })
      }
    }
  }, [postId])

  // Title editing (debounced PATCH /api/posts/:id)
  const titleTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (isNew) return
    if (!postId) return
    const next = String(pageTitle || "").trim()
    if (!next) return
    if (titleTimerRef.current) window.clearTimeout(titleTimerRef.current)
    titleTimerRef.current = window.setTimeout(() => {
      titleTimerRef.current = null
      const token = localStorage.getItem("token")
      if (!token) return
      void (async () => {
        await fetch(`/api/posts/${postId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title: next }),
        })
        window.dispatchEvent(new CustomEvent("reductai:page-title-updated", { detail: { postId, title: next } }))
      })()
    }, 400)
    return () => {
      if (titleTimerRef.current) window.clearTimeout(titleTimerRef.current)
    }
  }, [isNew, pageTitle, postId])

  // Calculate dirty state (draftRef is already synced immediately in onChange handler)
  useEffect(() => {
    const s = JSON.stringify(draftDocJson || null)
    setDirty(s !== lastSavedRef.current)
  }, [draftDocJson])

  // Keep the current page's "has content" flag in sync immediately while editing.
  // This drives the page tree icon (File -> FileText) without needing a refresh or navigation.
  useEffect(() => {
    if (!postId || postId === "new") return
    const has = docJsonHasMeaningfulContent(draftDocJson)
    setPageHasContent((prev) => {
      const cur = prev[String(postId)]
      if (cur === has) return prev
      return { ...prev, [String(postId)]: has }
    })
  }, [draftDocJson, postId])

  // Keep the left tree ordering synced with the embed order inside the parent document (instant UX).
  useEffect(() => {
    if (!postId || postId === "new") return
    const ids = extractEmbedIdsInOrder(draftDocJson)
    if (!ids.length) return
    const order = new Map<string, number>()
    for (let i = 0; i < ids.length; i += 1) order.set(String(ids[i]), i + 1)
    setMyPages((prev) =>
      prev.map((p) => {
        if (String(p.parent_id || "") !== String(postId)) return p
        const ord = order.get(String(p.id))
        if (!ord) return p
        if (Number(p.page_order || 0) === ord) return p
        return { ...p, page_order: ord }
      })
    )
  }, [draftDocJson, postId])
  useEffect(() => {
    versionRef.current = serverVersion
  }, [serverVersion])

  // Autosave: debounce changes
  useEffect(() => {
    if (!canSave) return
    if (!dirty) return
    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current)
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null
      void saveNow({ silent: true })
    }, 700)
    return () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current)
    }
  }, [canSave, dirty, postId, saveNow])

  // Cleanup draftStateTimer on unmount
  useEffect(() => {
    return () => {
      if (draftStateTimerRef.current) window.clearTimeout(draftStateTimerRef.current)
    }
  }, [])

  // Safe navigation requested by PageLinkNodeView
  useEffect(() => {
    function onOpenPost(e: Event) {
      const ce = e as CustomEvent<{ postId?: string; focusTitle?: boolean; forceSave?: boolean; categoryId?: string | null }>
      const targetId = String(ce.detail?.postId || "")
      if (!targetId) return
      const focusTitle = Boolean(ce.detail?.focusTitle)
      const forceSave = Boolean(ce.detail?.forceSave)
      // Use categoryId from event if provided, otherwise fall back to current categoryQS
      const targetCategoryId = ce.detail?.categoryId
      const targetCategoryQS = targetCategoryId
        ? `?category=${encodeURIComponent(targetCategoryId)}`
        : categoryQS
      navigatingRef.current = targetId
      void (async () => {
        // IMPORTANT:
        // The embed flow may navigate immediately after inserting the embed link, before React `dirty`
        // state has a chance to update. Force-save (or compare snapshots) ensures the parent keeps the link.
        const snapshot = JSON.stringify(draftRef.current || null)
        const shouldSave = forceSave || snapshot !== lastSavedRef.current
        if (shouldSave && canSave) await saveNow({ silent: true })
        // Navigate to target page with its category so the sidebar switches correctly.
        navigate(`/posts/${targetId}/edit${targetCategoryQS}`, { state: { focusTitle } })
      })()
    }
    window.addEventListener("reductai:open-post", onOpenPost as EventListener)
    return () => window.removeEventListener("reductai:open-post", onOpenPost as EventListener)
  }, [canSave, categoryQS, dirty, navigate, postId, saveNow])

  // Focus the title input after embed auto-navigation
  useEffect(() => {
    if (isNew) return
    const state = location.state as unknown
    const focus =
      !!state &&
      typeof state === "object" &&
      "focusTitle" in state &&
      typeof (state as Record<string, unknown>).focusTitle === "boolean" &&
      Boolean((state as Record<string, unknown>).focusTitle)
    if (!focus) return
    window.setTimeout(() => titleInputRef.current?.focus(), 0)
  }, [isNew, location.state, postId])

  // Keep left tree reactive to in-editor page creation/title updates (embed flow)
  useEffect(() => {
    function onPageCreated(e: Event) {
      const ce = e as CustomEvent<{ postId?: string; parent_id?: string | null; title?: string }>
      const id = String(ce.detail?.postId || "")
      if (!id) return
      const parent_id = ce.detail?.parent_id ? String(ce.detail.parent_id) : null
      const title = String(ce.detail?.title || "New page")
      setMyPages((prev) => {
        if (prev.some((p) => String(p.id) === id)) return prev
        // Keep existing order; append new pages at the end (until we introduce explicit ordering UX).
        const next = prev.concat([
          {
            id,
            parent_id,
            title,
            child_count: 0,
            page_order: 0,
            updated_at: new Date().toISOString(),
          },
        ])
        return next
      })
    }

    function onTitleUpdated(e: Event) {
      const ce = e as CustomEvent<{ postId?: string; title?: string }>
      const id = String(ce.detail?.postId || "")
      const title = String(ce.detail?.title || "")
      if (!id || !title) return
      // Update in-place; do NOT resort on title changes.
      setMyPages((prev) => prev.map((p) => (String(p.id) === id ? { ...p, title } : p)))
    }

    window.addEventListener("reductai:page-created", onPageCreated as EventListener)
    window.addEventListener("reductai:page-title-updated", onTitleUpdated as EventListener)
    const onEmbedRemoved = (e: Event) => {
      const ce = e as CustomEvent<{ pageIds?: string[] }>
      const ids = Array.isArray(ce.detail?.pageIds) ? ce.detail!.pageIds!.map(String).filter(Boolean) : []
      if (!ids.length) return

      // Optimistically hide from tree immediately
      setMyPages((prev) => prev.filter((p) => !ids.includes(String(p.id))))

      // Persist deletion:
      // - if page has content => soft delete (trash)
      // - if page has NO content (File icon state) => soft delete then purge (hard delete)
      const token = localStorage.getItem("token")
      if (!token) return
      void (async () => {
        let trashedCount = 0
        let purgedCount = 0
        for (const pid of ids) {
          const shouldPurgeImmediately = pageHasContentRef.current[String(pid)] === false
          await fetch(`/api/posts/${pid}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "deleted" }),
          }).catch(() => null)

          if (shouldPurgeImmediately) {
            await fetch(`/api/posts/trash/${encodeURIComponent(pid)}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => null)
            purgedCount += 1
          } else {
            trashedCount += 1
          }
        }

        // Toasts (match the same messages used in manual delete)
        if (purgedCount > 0) {
          toast(purgedCount === 1 ? "페이지가 완전 삭제되었습니다." : `${purgedCount}개 페이지가 완전 삭제되었습니다.`)
        }
        if (trashedCount > 0) {
          toast(trashedCount === 1 ? "페이지가 삭제되어 휴지통으로 이동되었습니다." : `${trashedCount}개 페이지가 삭제되어 휴지통으로 이동되었습니다.`)
        }
      })()
    }
    window.addEventListener("reductai:embed-removed", onEmbedRemoved as EventListener)

    const onEmbedAdded = (e: Event) => {
      const ce = e as CustomEvent<{ pageIds?: string[] }>
      const ids = Array.isArray(ce.detail?.pageIds) ? ce.detail!.pageIds!.map(String).filter(Boolean) : []
      if (!ids.length) return

      const token = localStorage.getItem("token")
      if (!token) return

      // Restore pages that were previously soft-deleted (undo case)
      void (async () => {
        for (const pid of ids) {
          await fetch(`/api/posts/${pid}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "draft" }),
          }).catch(() => null)

          // After restore, preview becomes available again; use it to repopulate tree entry.
          const pr = await fetch(`/api/posts/${pid}/preview`, { headers: { Authorization: `Bearer ${token}` } }).catch(
            () => null
          )
          const title =
            pr && pr.ok
              ? await pr
                  .json()
                  .then((j) =>
                    j &&
                    typeof j === "object" &&
                    "title" in j &&
                    typeof (j as Record<string, unknown>).title === "string"
                      ? String((j as Record<string, unknown>).title)
                      : "New page"
                  )
                  .catch(() => "New page")
              : "New page"

          setMyPages((prev) => {
            if (prev.some((p) => String(p.id) === pid)) return prev
            return prev.concat([
              {
                id: pid,
                parent_id: postId && postId !== "new" ? postId : null,
                title,
                child_count: 0,
                page_order: 0,
                updated_at: new Date().toISOString(),
              },
            ])
          })
        }
      })()
    }
    window.addEventListener("reductai:embed-added", onEmbedAdded as EventListener)
    return () => {
      window.removeEventListener("reductai:page-created", onPageCreated as EventListener)
      window.removeEventListener("reductai:page-title-updated", onTitleUpdated as EventListener)
      window.removeEventListener("reductai:embed-removed", onEmbedRemoved as EventListener)
      window.removeEventListener("reductai:embed-added", onEmbedAdded as EventListener)
    }
  }, [postId])

  const roots = useMemo(() => sortPages(myPages.filter((p) => !p.parent_id)), [myPages, sortPages])
  const childrenByParent = useMemo(() => {
    const m = new Map<string, MyPage[]>()
    for (const p of myPages) {
      if (!p.parent_id) continue
      const arr = m.get(p.parent_id) || []
      arr.push(p)
      m.set(p.parent_id, arr)
    }
    for (const [k, arr] of m.entries()) {
      // Keep ordering stable (tie-break by insertion order in `myPages`), same as roots.
      m.set(k, sortPages(arr))
    }
    return m
  }, [myPages, sortPages])

  const parentById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const p of myPages) m.set(String(p.id), p.parent_id ? String(p.parent_id) : null)
    return m
  }, [myPages])

  // Safety redirect:
  // If the user ends up on /posts/:id/edit but has no remaining (non-deleted) pages,
  // push them to /posts/new/edit immediately (same outcome as a hard refresh).
  useEffect(() => {
    if (loading) return
    if (isNew) return
    if (!postId || postId === "new") return
    if (myPages.length > 0) return
    navigate(`/posts/new/edit${categoryQS}`, { replace: true })
  }, [categoryQS, isNew, loading, myPages.length, navigate, postId])

  const pageById = useMemo(() => {
    const m = new Map<string, MyPage>()
    for (const p of myPages) m.set(String(p.id), p)
    return m
  }, [myPages])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [autoExpandAncestors, setAutoExpandAncestors] = useState(true)

  const expandableIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [parentId, kids] of childrenByParent.entries()) {
      if (kids.length > 0) ids.add(String(parentId))
    }
    return ids
  }, [childrenByParent])

  // Mobile behavior: auto-collapse page tree and open it as an overlay drawer (Timeline-like)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(max-width: 767px)")

    const apply = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      if (mobile) {
        // Mobile uses an overlay drawer; keep desktop preference (navOpen) unchanged.
        setIsNavDrawerOpen(false)
      } else {
        setIsNavDrawerOpen(false)
      }
    }

    apply()
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply)
      return () => mq.removeEventListener("change", apply)
    }
    // Safari legacy
    mq.addListener(apply)
    return () => mq.removeListener(apply)
  }, [])

  // Persist navOpen choice on desktop; don't overwrite preference while in mobile overlay mode.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (isMobile) return
    try {
      window.localStorage.setItem(NAV_OPEN_KEY, navOpen ? "1" : "0")
    } catch {
      // ignore (storage might be blocked)
    }
    navOpenRef.current = navOpen
  }, [isMobile, navOpen])

  const breadcrumbData = useMemo(() => {
    if (!postId || postId === "new") return { visible: [] as Array<{ id: string; title: string }>, hidden: [] as Array<{ id: string; title: string }> }
    const chain: Array<{ id: string; title: string }> = []
    let cur = String(postId)
    for (let i = 0; i < 50; i += 1) {
      const p = pageById.get(cur)
      const title = cur === String(postId) && String(pageTitle || "").trim() ? String(pageTitle) : p?.title || "New page"
      chain.push({ id: cur, title })
      const parent = parentById.get(cur) || null
      if (!parent) break
      cur = String(parent)
    }
    chain.reverse()
    if (chain.length <= 4) return { visible: chain, hidden: [] as Array<{ id: string; title: string }> }
    const hidden = chain.slice(1, Math.max(1, chain.length - 2))
    // Notion-like: show first, ellipsis, last-1, last
    return {
      visible: [chain[0], { id: "__ellipsis__", title: "..." }, chain[chain.length - 2], chain[chain.length - 1]],
      hidden,
    }
  }, [pageById, pageTitle, parentById, postId])

  // Breadcrumb icon rendering (emoji/lucide) + lucide lazy-load when needed.
  const breadcrumbNeedsLucide = useMemo(() => {
    const ids: string[] = []
    for (const c of breadcrumbData.visible) if (c.id && c.id !== "__ellipsis__") ids.push(String(c.id))
    for (const h of breadcrumbData.hidden) if (h.id) ids.push(String(h.id))

    for (const id of ids) {
      const p = pageById.get(String(id))
      const raw = typeof p?.icon === "string" ? p.icon : null
      const choice = decodePageIcon(raw)
      if (!choice || choice.kind !== "lucide") continue
      if (LUCIDE_PRESET_MAP[choice.value]) continue
      return true
    }
    return false
  }, [breadcrumbData.hidden, breadcrumbData.visible, pageById])

  useEffect(() => {
    if (!breadcrumbNeedsLucide) return
    if (lucideAll || lucideLoading) return
    const seq = (lucideLoadSeqRef.current += 1)
    setLucideLoading(true)
    void import("lucide-react")
      .then((mod) => {
        if (lucideLoadSeqRef.current !== seq) return
        const iconsNs = (mod as unknown as Record<string, unknown>)["icons"]
        if (iconsNs && typeof iconsNs === "object") setLucideAll(iconsNs as Record<string, React.ElementType>)
      })
      .finally(() => {
        if (lucideLoadSeqRef.current === seq) setLucideLoading(false)
      })
  }, [breadcrumbNeedsLucide, lucideAll, lucideLoading])

  const renderHeaderIcon = useCallback(
    (pageId: string) => {
      const p = pageById.get(String(pageId))
      const raw = typeof p?.icon === "string" ? p.icon : null
      const choice = decodePageIcon(raw)
      if (!choice) return null
      if (choice.kind === "emoji") return <span className="text-[14px] leading-none">{choice.value}</span>
      const Preset = LUCIDE_PRESET_MAP[choice.value]
      const Dyn = Preset || lucideAll?.[choice.value]
      if (!Dyn) return <span className="text-[12px] leading-none opacity-60">□</span>
      return <Dyn className="size-4" />
    },
    [lucideAll, pageById]
  )

  const openNav = () => {
    if (isMobile) setIsNavDrawerOpen(true)
    else setNavOpen(true)
  }

  const startNavResize = (e: React.PointerEvent) => {
    if (isMobile) return
    if (typeof e.button === "number" && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    setNavResizing(true)
    navResizeRef.current = { startX: e.clientX, startW: navWidth }

    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const onMove = (ev: PointerEvent) => {
      const cur = navResizeRef.current
      if (!cur) return
      const next = clamp(cur.startW + (ev.clientX - cur.startX), NAV_MIN_W, NAV_MAX_W)
      setNavWidth(next)
    }
    const stop = () => {
      navResizeRef.current = null
      setNavResizing(false)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
  }

  // Expand roots and the ancestor chain of the current page so it stays visible.
  useEffect(() => {
    if (!autoExpandAncestors) return
    if (!myPages.length) return
    setExpanded((prev) => {
      const next = new Set(prev)
      let cur = String(postId || "")
      // expand parents up to root
      for (let i = 0; i < 50; i += 1) {
        const p = parentById.get(cur) || null
        if (!p) break
        next.add(p)
        cur = p
      }
      return next
    })
  }, [autoExpandAncestors, myPages.length, parentById, postId, roots])

  const expandAll = useCallback(() => {
    setAutoExpandAncestors(true)
    setExpanded(new Set(expandableIds))
  }, [expandableIds])

  const collapseAll = useCallback(() => {
    setAutoExpandAncestors(false)
    setExpanded(new Set())
  }, [])

  const isAllExpanded = useMemo(() => {
    if (!expandableIds.size) return false
    for (const id of expandableIds) {
      if (!expanded.has(id)) return false
    }
    return true
  }, [expandableIds, expanded])

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openRename = useCallback(
    (id: string) => {
      const cur = pageById.get(String(id))
      const title = cur?.title || "New page"
      setRenameTargetId(String(id))
      setRenameValue(title)
      setRenameOpen(true)
      window.setTimeout(() => renameInputRef.current?.focus(), 0)
    },
    [pageById]
  )

  const applyRename = useCallback(async () => {
    const id = String(renameTargetId || "").trim()
    const title = String(renameValue || "").trim()
    if (!id || !title) return
    const token = localStorage.getItem("token")
    if (!token) return
    try {
      await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      setMyPages((prev) => prev.map((p) => (String(p.id) === id ? { ...p, title } : p)))
      window.dispatchEvent(new CustomEvent("reductai:page-title-updated", { detail: { postId: id, title } }))
      if (String(postId || "") === id) setPageTitle(title)
      setRenameOpen(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to rename"
      setError(msg)
    }
  }, [postId, renameTargetId, renameValue])

  const createChildPage = useCallback(
    async (parentId: string) => {
      setError(null)
      try {
        const authOnly: Record<string, string> = { ...authHeaders() }
        const r = await fetch(`/api/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authOnly },
          body: JSON.stringify({
            title: "New page",
            page_type: "page",
            status: "draft",
            visibility: "private",
            parent_id: parentId,
            category_id: categoryId || null,
          }),
        })
        if (!r.ok) throw new Error(await r.text())
        const j = await r.json()
        const newId = String(j.id || "")
        if (!newId) throw new Error("Failed to create post (missing id)")

        // Add a page_link block into the parent page (at the bottom).
        // - If the parent is currently open, update the editor immediately via event.
        // - Otherwise, persist it directly to the parent page content.
        if (String(postId || "") === String(parentId)) {
          window.dispatchEvent(
            new CustomEvent("reductai:append-page-link", {
              detail: { pageId: newId, title: "New page", display: "embed" },
            })
          )
          // Persist parent content before navigating away, otherwise the link will be lost on reload.
          if (canSave) {
            await saveNow({ silent: true })
          }
        } else {
          void updatePostContent(String(parentId), (doc) => appendPageLinkToDocJson(doc, { pageId: newId, title: "New page", display: "embed" }))
        }

        // Ensure parent is expanded so the new child is visible. 
        setExpanded((prev) => {
          const next = new Set(prev)
          next.add(String(parentId))
          return next
        })
        // Optimistically insert into tree right away.
        setMyPages((prev) => {
          if (prev.some((p) => String(p.id) === newId)) return prev
          const next = prev.concat([
            {
              id: newId,
              parent_id: parentId,
              title: "New page",
              child_count: 0,
              page_order: 0,
              updated_at: new Date().toISOString(),
            },
          ])
          return next
        })
        navigate(`/posts/${newId}/edit${categoryQS}`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to create"
        setError(msg)
      }
    },
    [canSave, categoryId, categoryQS, navigate, postId, saveNow]
  )

  const softDeletePage = useCallback(
    async (id: string) => {
      setError(null)
      try {
        const token = localStorage.getItem("token")
        if (!token) return

        const targetId = String(id)
        const target = pageById.get(targetId) || null
        const parentId = target?.parent_id ? String(target.parent_id) : null
        // If the page has NO meaningful content (File icon state), purge immediately (skip trash UX).
        // Safety: only do this when we have an explicit false in pageHasContent (unknown -> treat as non-empty).
        const shouldPurgeImmediately = pageHasContent[targetId] === false
        const snapshot: MyPage | null = target
          ? {
              id: String(target.id),
              parent_id: target.parent_id ? String(target.parent_id) : null,
              title: target.title,
              child_count: target.child_count,
              page_order: target.page_order,
              updated_at: target.updated_at,
            }
          : null

        // Compute subtree ids (target + descendants) from the current tree snapshot.
        const byParent = new Map<string, string[]>()
        for (const p of myPages) {
          if (!p.parent_id) continue
          const k = String(p.parent_id)
          const arr = byParent.get(k) || []
          arr.push(String(p.id))
          byParent.set(k, arr)
        }
        const toRemoveSet = new Set<string>()
        const stack: string[] = [targetId]
        while (stack.length) {
          const cur = stack.pop()!
          if (toRemoveSet.has(cur)) continue
          toRemoveSet.add(cur)
          const kids = byParent.get(cur) || []
          for (const kid of kids) stack.push(kid)
        }
        const toRemoveIds = Array.from(toRemoveSet)

        if (shouldPurgeImmediately) {
          // Purge is only supported via /trash/:id, and it requires the page to be in deleted state.
          // To "skip trash UX", we soft-delete then immediately purge.
          // Also: only purge the root target (empty pages should not have children; keep safety anyway).
          if (toRemoveIds.length > 1) {
            console.warn("[PostEditorPage] skip immediate purge for subtree delete; falling back to trash flow")
          } else {
            const pid = targetId
            await fetch(`/api/posts/${pid}`, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ status: "deleted" }),
            }).catch(() => null)
            await fetch(`/api/posts/trash/${encodeURIComponent(pid)}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => null)
          }
        } else {
          // Cascade soft-delete on server for the whole subtree.
          for (const pid of toRemoveIds) {
            await fetch(`/api/posts/${pid}`, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ status: "deleted" }),
            }).catch(() => null)
          }
        }

        // Remove the link block from the parent page content (if any).
        if (parentId) {
          void updatePostContent(parentId, (doc) => removePageLinksFromDocJson(doc, targetId))
        }

        // Remove this page + its descendants from tree (UX: disappears immediately).
        setMyPages((prev) => {
          return prev.filter((p) => !toRemoveSet.has(String(p.id)))
        })

        // Navigation rules:
        // - If the current page is the deleted page (or inside its subtree), navigate away.
        const currentId = String(postId || "")
        const currentIsInDeletedSubtree = (() => {
          if (!currentId) return false
          if (currentId === targetId) return true
          let cur = currentId
          for (let i = 0; i < 50; i += 1) {
            const p = parentById.get(cur) || null
            if (!p) return false
            if (String(p) === targetId) return true
            cur = String(p)
          }
          return false
        })()

        // If top-level page deleted, choose the next remaining root (exclude deleted subtree).
        const nextRootAfterDelete = (() => {
          if (parentId) return ""
          const remainingRoots = sortPages(myPages.filter((p) => !p.parent_id && !toRemoveSet.has(String(p.id))))
          return remainingRoots.length ? String(remainingRoots[0].id) : ""
        })()

        const noRemainingPages = (() => {
          const remaining = myPages.filter((p) => !toRemoveSet.has(String(p.id)))
          return remaining.length === 0
        })()

        // If there are no remaining pages at all, always go to /posts/new/edit (even if the subtree check misfires).
        if (noRemainingPages) {
          navigate(`/posts/new/edit${categoryQS}`, { replace: true })
          // Some states (editor + route) may not fully reset without a hard navigation.
          // Force a "refresh-like" transition so the intro skeleton reliably appears.
          if (typeof window !== "undefined") {
            window.location.replace(`/posts/new/edit${categoryQS}`)
          }
        } else if (currentIsInDeletedSubtree) {
          if (parentId) {
            navigate(`/posts/${parentId}/edit${categoryQS}`, { replace: true })
          } else {
            // If top-level page: navigate to the first remaining root page (exclude deleted).
            navigate(nextRootAfterDelete ? `/posts/${nextRootAfterDelete}/edit${categoryQS}` : `/posts/new/edit${categoryQS}`, { replace: true })
          }
        }

        // Toast with undo
        // Snapshots for undo (subtree)
        const subtreeSnapshots: MyPage[] = toRemoveIds
          .map((pid) => pageById.get(String(pid)) || null)
          .filter(Boolean)
          .map((p) => ({
            id: String(p!.id),
            parent_id: p!.parent_id ? String(p!.parent_id) : null,
            title: p!.title,
            child_count: p!.child_count,
            page_order: p!.page_order,
            updated_at: p!.updated_at,
          }))

        if (shouldPurgeImmediately && toRemoveIds.length === 1) {
          toast("페이지가 완전 삭제되었습니다.")
        } else {
          toast("페이지가 삭제되어 휴지통으로 이동되었습니다.", {
            action: snapshot
              ? {
                  label: "undo",
                  onClick: () => {
                    void (async () => {
                      const t = localStorage.getItem("token")
                      if (!t) return
                      // Restore server status for whole subtree
                      for (const s of subtreeSnapshots) {
                        await fetch(`/api/posts/${String(s.id)}`, {
                          method: "PATCH",
                          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "draft" }),
                        }).catch(() => null)
                      }

                      // Restore tree entry (best-effort)
                      setMyPages((prev) => {
                        const existing = new Set(prev.map((p) => String(p.id)))
                        const toAdd = subtreeSnapshots.filter((s) => !existing.has(String(s.id)))
                        if (!toAdd.length) return prev
                        const next = prev.slice()
                        for (const s of toAdd) next.push(s)
                        return next
                      })

                      // Restore link into parent content (best-effort)
                      if (snapshot.parent_id) {
                        const par = String(snapshot.parent_id)
                        if (String(postId || "") === par) {
                          window.dispatchEvent(
                            new CustomEvent("reductai:append-page-link", {
                              detail: { pageId: String(snapshot.id), title: snapshot.title || "New page", display: "embed" },
                            })
                          )
                        } else {
                          void updatePostContent(par, (doc) =>
                            appendPageLinkToDocJson(doc, { pageId: String(snapshot.id), title: snapshot.title || "New page", display: "embed" })
                          )
                        }
                      }
                    })()
                  },
                }
              : undefined,
          })
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to delete"
        setError(msg)
      }
    },
    [categoryQS, myPages, navigate, pageById, pageHasContent, parentById, postId, sortPages]
  )

  const duplicatePage = useCallback(
    async (id: string) => {
      setError(null)
      try {
        const token = localStorage.getItem("token")
        if (!token) return
        const authOnly: Record<string, string> = { ...authHeaders() }

        const srcRoot = pageById.get(String(id)) || null
        const rootParentId = srcRoot?.parent_id ? String(srcRoot.parent_id) : null

        const createdPages: MyPage[] = []
        const idMap = new Map<string, string>() // old -> new
        const titleMap = new Map<string, string>() // old -> newTitle

        const duplicateSubtree = async (srcId: string, parentId: string | null): Promise<string> => {
          // Load source content + title
          const srcRes = await fetch(`/api/posts/${srcId}/content`, { headers: authOnly })
          if (!srcRes.ok) throw new Error(await srcRes.text())
          const srcJson: unknown = await srcRes.json().catch(() => ({}))
          const srcObj = srcJson && typeof srcJson === "object" ? (srcJson as Record<string, unknown>) : {}
          const srcDoc = ("docJson" in srcObj ? srcObj.docJson : null) ?? null
          const srcTitle = String((typeof srcObj.title === "string" ? srcObj.title : "") || pageById.get(String(srcId))?.title || "New page")
          const nextTitle = `${srcTitle} (copy)`

          // Create new page (inherit category from parent or use current category context)
          const createRes = await fetch(`/api/posts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authOnly },
            body: JSON.stringify({ title: nextTitle, page_type: "page", status: "draft", visibility: "private", parent_id: parentId, category_id: categoryId || null }),
          })
          if (!createRes.ok) throw new Error(await createRes.text())
          const created = await createRes.json().catch(() => ({}))
          const createdObj = created && typeof created === "object" ? (created as Record<string, unknown>) : {}
          const rawId = createdObj.id
          const newId = typeof rawId === "string" ? rawId : typeof rawId === "number" ? String(rawId) : ""
          if (!newId) throw new Error("Failed to create duplicate (missing id)")

          idMap.set(String(srcId), newId)
          titleMap.set(String(srcId), nextTitle)

          // Duplicate children first (so we can rewrite links in this doc)
          const kids = childrenByParent.get(String(srcId)) || []
          for (const c of kids) {
            await duplicateSubtree(String(c.id), newId)
          }

          // Rewrite embedded links to duplicated child ids/titles
          const nextDoc = remapPageLinksInDocJson(srcDoc, idMap, titleMap)

          // Save rewritten content into the new page
          await fetch(`/api/posts/${newId}/content`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authOnly },
            body: JSON.stringify({ docJson: nextDoc, version: 0 }),
          }).catch(() => null)

          // Track for local tree
          const srcMeta = pageById.get(String(srcId)) || null
          const orderBase = Number(srcMeta?.page_order || 0)
          // Keep the same page_order and rely on stable insertion to show "copy" right under the source.
          const page_order = orderBase
          createdPages.push({
            id: newId,
            parent_id: parentId,
            title: nextTitle,
            child_count: 0,
            page_order,
            updated_at: new Date().toISOString(),
          })

          return newId
        }

        const newRootId = await duplicateSubtree(String(id), rootParentId)
        const rootTitle = titleMap.get(String(id)) || "New page (copy)"

        // Insert the duplicate link block right under the original link block in the parent page (if parent exists).
        if (rootParentId) {
          if (String(postId || "") === String(rootParentId)) {
            window.dispatchEvent(
              new CustomEvent("reductai:insert-page-link-after", {
                detail: { afterPageId: String(id), pageId: newRootId, title: rootTitle, display: "embed" },
              })
            )
            if (canSave) await saveNow({ silent: true })
          } else {
            const ok = await updatePostContent(rootParentId, (doc) =>
              insertPageLinkAfterDocJson(doc, { afterPageId: String(id), pageId: newRootId, title: rootTitle, display: "embed" })
            )
            if (!ok) setError("Failed to insert copy link into parent page.")
          }
        }

        // Update tree: insert root copy right under source, and append descendants.
        setMyPages((prev) => {
          const hasAny = new Set(prev.map((p) => String(p.id)))
          const toAdd = createdPages.filter((p) => !hasAny.has(String(p.id)))
          if (!toAdd.length) return prev

          const rootEntry = toAdd.find((p) => String(p.id) === String(newRootId)) || null
          const others = toAdd.filter((p) => String(p.id) !== String(newRootId))
          const idx = prev.findIndex((p) => String(p.id) === String(id))
          const next = prev.slice()
          if (rootEntry) {
            if (idx < 0) next.push(rootEntry)
            else next.splice(idx + 1, 0, rootEntry)
          }
          // Append descendants; ordering under parents is driven by (stable) sortPages + parent_id + page_order.
          for (const p of others) next.push(p)
          return next
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to duplicate"
        setError(msg)
      }
    },
    [canSave, categoryId, childrenByParent, pageById, postId, saveNow]
  )

  // Page tree drag & drop handlers
  const startPageDrag = useCallback((pageId: string, e: React.DragEvent<HTMLElement>) => {
    e.stopPropagation()
    pageDragBlockClickUntilRef.current = Date.now() + 250
    setDraggingPageId(pageId)
    setPageDropIndicator(null)
    try {
      e.dataTransfer.setData("text/plain", pageId)
      e.dataTransfer.effectAllowed = "move"
    } catch {
      // ignore
    }
  }, [])

  const endPageDrag = useCallback(() => {
    setDraggingPageId(null)
    setPageDropIndicator(null)
  }, [])

  const handlePageDragOver = useCallback((targetId: string, e: React.DragEvent<HTMLElement>) => {
    if (!draggingPageId || draggingPageId === targetId) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height
    // Notion-style: top 25% = before, bottom 25% = after, middle 50% = inside (as child)
    let position: "before" | "after" | "inside"
    if (y < height * 0.25) {
      position = "before"
    } else if (y > height * 0.75) {
      position = "after"
    } else {
      position = "inside"
    }
    setPageDropIndicator({ id: targetId, position })
  }, [draggingPageId])

  const handlePageDragLeave = useCallback((targetId: string, e: React.DragEvent<HTMLElement>) => {
    const related = (e.relatedTarget as Node | null) || null
    if (related && (e.currentTarget as HTMLElement).contains(related)) return
    setPageDropIndicator((prev) => {
      if (!prev) return null
      if (prev.id !== targetId) return prev
      return null
    })
  }, [])

  const handlePageDrop = useCallback(async (targetId: string, e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    if (!draggingPageId || draggingPageId === targetId) {
      endPageDrag()
      return
    }
    const indicator = pageDropIndicator
    if (!indicator || indicator.id !== targetId) {
      endPageDrag()
      return
    }

    // Prevent dropping a page onto its own descendant
    const isDescendant = (parentId: string, childId: string): boolean => {
      const kids = childrenByParent.get(parentId) || []
      for (const k of kids) {
        if (String(k.id) === childId) return true
        if (isDescendant(String(k.id), childId)) return true
      }
      return false
    }
    if (indicator.position === "inside" && isDescendant(draggingPageId, targetId)) {
      endPageDrag()
      return
    }

    const fromId = draggingPageId
    const target = pageById.get(targetId)
    if (!target) {
      endPageDrag()
      return
    }

    // Determine new parent and position
    let targetParentId: string | null
    let afterPageId: string | null = null
    let beforePageId: string | null = null

    if (indicator.position === "inside") {
      // Move into target as child (at the end)
      targetParentId = targetId
    } else {
      // Move as sibling of target
      targetParentId = target.parent_id || null
      if (indicator.position === "before") {
        beforePageId = targetId
      } else {
        afterPageId = targetId
      }
    }

    // Optimistically update UI
    setMyPages((prev) => {
      const fromPage = prev.find((p) => String(p.id) === fromId)
      if (!fromPage) return prev
      const next = prev.filter((p) => String(p.id) !== fromId)
      const updatedPage: MyPage = { ...fromPage, parent_id: targetParentId }
      
      if (indicator.position === "inside") {
        // Add as child of target (at end)
        next.push(updatedPage)
      } else {
        // Insert before/after target
        const targetIdx = next.findIndex((p) => String(p.id) === targetId)
        if (targetIdx < 0) {
          next.push(updatedPage)
        } else {
          const insertIdx = indicator.position === "before" ? targetIdx : targetIdx + 1
          next.splice(insertIdx, 0, updatedPage)
        }
      }
      return next
    })

    // Expand parent if moving inside
    if (indicator.position === "inside") {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add(targetId)
        return next
      })
    }

    endPageDrag()

    // Call server API
    try {
      const h = authHeaders()
      if (!h.Authorization) return
      await fetch(`/api/posts/${fromId}/move`, {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ targetParentId, afterPageId, beforePageId }),
      })

      // If moving inside another page, add embed link to parent's content
      if (indicator.position === "inside" && targetParentId) {
        try {
          // Get the moved page info for title and icon
          const movedPage = pageById.get(fromId)
          const movedPageTitle = movedPage?.title || "Untitled"
          const movedPageIcon = (movedPage as unknown as { icon?: string | null })?.icon || null

          // 1. Fetch parent page content
          const contentRes = await fetch(`/api/posts/${targetParentId}/content`, {
            headers: h,
          })
          if (!contentRes.ok) return

          const contentData = await contentRes.json()
          const docJson = contentData.docJson || { type: "doc", content: [] }
          const currentVersion = contentData.version || 0

          // 2. Check if embed link already exists (by pageId)
          const alreadyExists = (docJson.content || []).some((node: { type?: string; attrs?: { pageId?: string } }) => 
            node.type === "page_link" && node.attrs?.pageId === fromId
          )

          if (!alreadyExists) {
            // 3. Generate unique blockId
            const blockId = crypto.randomUUID()

            // 4. Add page_link embed at the end with correct attrs
            const newPageLink = {
              type: "page_link",
              attrs: {
                blockId,
                pageId: fromId,
                title: movedPageTitle,
                icon: movedPageIcon,
                display: "embed",
              },
            }

            const updatedDocJson = {
              ...docJson,
              content: [...(docJson.content || []), newPageLink],
            }

            // 5. Save updated parent content
            await fetch(`/api/posts/${targetParentId}/content`, {
              method: "POST",
              headers: { ...h, "Content-Type": "application/json" },
              body: JSON.stringify({
                docJson: updatedDocJson,
                baseVersion: currentVersion,
              }),
            })
          }
        } catch {
          // Silently fail if embed link couldn't be added
        }
      }
    } catch {
      // If API fails, we could reload, but for now just leave the optimistic update
    }
  }, [draggingPageId, pageDropIndicator, childrenByParent, pageById, endPageDrag])

  // 페이지 트리 렌더링 
  const renderTreeNode = (p: MyPage, depth: number) => {
    const id = String(p.id)
    const kids = childrenByParent.get(id) || []
    const hasKids = kids.length > 0
    const isExpanded = expanded.has(id)
    const isActive = id === postId
    const chosenIcon = decodePageIcon((p as unknown as Record<string, unknown>).icon)
    const hasContent = pageHasContent[id] ?? false
    const isDark = document.documentElement.classList.contains("dark")

    const lucideIconMap: Record<
      string,
      React.ComponentType<{ className?: string }>
    > = {
      File,
      FileText,
      Smile,
      Star,
      Book,
      Calendar,
      CheckSquare,
      Hash,
      Code,
      PenLine,
      Image,
      Link,
      Globe,
      Bot,
    }

    const DefaultIcon = hasContent ? FileText : File
    const iconNode = (() => {
      if (!chosenIcon) return <DefaultIcon className={["size-4", depth > 0 ? "opacity-70" : ""].join(" ")} />
      if (chosenIcon.kind === "emoji") {
        return (
          <span className={["text-[15px] leading-none", depth > 0 ? "opacity-70" : ""].join(" ")}>
            {chosenIcon.value}
          </span>
        )
      }
      const Cmp = lucideIconMap[chosenIcon.value]
      const Dyn = lucideAll?.[chosenIcon.value]
      const Final = Cmp || Dyn
      if (!Final) return <DefaultIcon className={["size-4", depth > 0 ? "opacity-70" : ""].join(" ")} />
      return <Final className={["size-4", depth > 0 ? "opacity-70" : ""].join(" ")} />
    })()

    // use file-level LUCIDE_PRESETS for icon picker (emoji, lucide)
    // 아이콘 선택기(이모지, lucide)를 위해 파일 레벨의 LUCIDE_PRESETS 사용

    const isDropTarget = pageDropIndicator?.id === id
    const dropPosition = isDropTarget ? pageDropIndicator.position : null
    const isDragging = draggingPageId === id

    return (
      <div key={id} className="flex flex-col w-full min-w-0">
        <div
          className="relative flex my-0.5 items-center w-full min-w-0"
          style={{ paddingLeft: depth * 8 }}
          draggable
          onDragStart={(e) => startPageDrag(id, e)}
          onDragEnd={endPageDrag}
          onDragOver={(e) => handlePageDragOver(id, e)}
          onDragLeave={(e) => handlePageDragLeave(id, e)}
          onDrop={(e) => void handlePageDrop(id, e)}
        >
          {/* Drop indicator lines */}
          {isDropTarget && dropPosition === "before" && (
            <div className="pointer-events-none absolute left-1 right-1 top-0 h-0.5 rounded bg-primary" />
          )}
          {isDropTarget && dropPosition === "after" && (
            <div className="pointer-events-none absolute left-1 right-1 bottom-0 h-0.5 rounded bg-primary" />
          )}
          <div
            role="button"
            tabIndex={0}
            className={[
              // base (match shadcn button layout/feel)
              "group flex flex-1 items-center shrink-0 rounded-md text-sm font-medium transition-all outline-none",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              "h-8 px-1 gap-1 min-w-0 overflow-hidden justify-start cursor-grab active:cursor-grabbing",
              // variants
              isActive
                ? "bg-accent text-secondary-foreground shadow-xs"
                : "hover:bg-accent hover:text-accent-foreground",
              // Drop inside indicator
              isDropTarget && dropPosition === "inside"
                ? "ring-2 ring-primary ring-inset"
                : "",
              // Dragging state
              isDragging ? "opacity-50" : "",
            ].join(" ")}
            ref={observeTreeRow(id) as unknown as React.Ref<HTMLDivElement>}
            onClick={() => {
              if (Date.now() < pageDragBlockClickUntilRef.current) return
              navigate(`/posts/${id}/edit${categoryQS}`)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                navigate(`/posts/${id}/edit${categoryQS}`)
              }
            }}
          >
            {hasKids ? (
              <div
                role="button"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-neutral-200"
                title={isExpanded ? "접기" : "펼치기"}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleExpand(id)
                }}
              >
                {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              </div>
            ) : (
              <div className="flex h-4 w-4 shrink-0"></div>
            )}
            <Popover open={iconPickerOpenId === id} onOpenChange={(open) => setIconPickerOpenId(open ? id : null)}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-neutral-200"
                  title="아이콘 변경"
                  // Prevent row navigation, but allow Radix PopoverTrigger to toggle.
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {iconNode}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={6} className="w-[370px] p-3" onPointerDown={(e) => e.stopPropagation()}>
                <Tabs value={iconPickerTab} onValueChange={(v) => setIconPickerTab(v === "icon" ? "icon" : "emoji")}>
                  <TabsList>
                    <TabsTrigger value="emoji">이모지</TabsTrigger>
                    <TabsTrigger value="icon">아이콘</TabsTrigger>
                  </TabsList>
                  <TabsContent value="emoji">
                    <div className="max-h-[360px] overflow-auto pr-1">
                      <EmojiPicker
                        theme={isDark ? Theme.DARK : Theme.LIGHT}
                        previewConfig={{ showPreview: false }}
                        onEmojiClick={(emoji: EmojiClickData) => {
                          const native = emoji?.emoji ? String(emoji.emoji) : ""
                          if (!native) return
                          void savePageIcon(id, { kind: "emoji", value: native })
                          setIconPickerOpenId(null)
                        }}
                      />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void savePageIcon(id, null)
                          setIconPickerOpenId(null)
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="icon">
                    <div className="mb-2">
                      <Input
                        value={lucideQuery}
                        onChange={(e) => setLucideQuery(e.target.value)}
                        placeholder="Search icons (e.g. calendar, bot, file...)"
                        className="h-8 text-sm"
                      />
                    </div>

                    {lucideQuery.trim() ? (
                      <>
                        {lucideLoading && !lucideAll ? (
                          <div className="text-xs text-muted-foreground px-1 py-2">Loading icons…</div>
                        ) : null}
                        <div className="max-h-[300px] overflow-auto pr-1">
                          <div className="grid grid-cols-7 gap-1">
                            {(() => {
                              const q = lucideQuery.trim().toLowerCase()
                              const map = lucideAll || {}
                              const keys = Object.keys(map)
                                .filter((k) => k.toLowerCase().includes(q))
                                .slice(0, 98)
                              if (!lucideLoading && lucideAll && keys.length === 0) {
                                return (
                                  <div className="col-span-7 text-xs text-muted-foreground px-1 py-2">
                                    No matches. Try a different keyword.
                                  </div>
                                )
                              }
                              return keys.map((k) => {
                                const Cmp = map[k]
                                return (
                                  <button
                                    key={k}
                                    type="button"
                                    className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                                    onClick={() => {
                                      void savePageIcon(id, { kind: "lucide", value: k })
                                      setIconPickerOpenId(null)
                                    }}
                                    title={k}
                                    aria-label={k}
                                  >
                                    <Cmp className="size-4" />
                                  </button>
                                )
                              })
                            })()}
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          Showing up to 98 matches. Refine your search to narrow results.
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-7 gap-1">
                        {LUCIDE_PRESETS.map((it) => (
                          <button
                            key={it.key}
                            type="button"
                            className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                            onClick={() => {
                              void savePageIcon(id, { kind: "lucide", value: it.key })
                              setIconPickerOpenId(null)
                            }}
                            title={it.label}
                            aria-label={it.label}
                          >
                            <it.Icon className="size-4" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void savePageIcon(id, null)
                          setIconPickerOpenId(null)
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </PopoverContent>
            </Popover>
            <div className="flex flex-1" title={p.title || "New page"}>
              <p className="line-clamp-1">{p.title || "New page"}</p>   
            </div>   
            <div className="flex items-center gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-4 shrink-0 hover:bg-neutral-200 rounded-full"
                    title="메뉴"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Ellipsis className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44" onPointerDown={(e) => e.stopPropagation()}>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      openRename(id)
                    }}
                  >
                    이름 바꾸기
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      void duplicatePage(id)
                    }}
                  >
                    복제
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => {
                      e.preventDefault()
                      void softDeletePage(id)
                    }}
                  >
                    휴지통으로 이동
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="size-4 shrink-0 hover:bg-neutral-200 rounded-full"
                title="새 페이지"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void createChildPage(id)
                }}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>
        </div>
        {hasKids && isExpanded ? (
          <div className="flex flex-col">
            {kids.map((c) => renderTreeNode(c, depth + 1))}
          </div>
        ) : null}
      </div>
    )
  }

  async function createNewFromNav() {
    setError(null)
    try {
      const authOnly: Record<string, string> = { ...authHeaders() }
      const r = await fetch(`/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authOnly },
        body: JSON.stringify({ title: "New page", page_type: "page", status: "draft", visibility: "private", category_id: categoryId || null }),
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      const newId = String(j.id || "")
      if (!newId) throw new Error("Failed to create post (missing id)")
      navigate(`/posts/${newId}/edit${categoryQS}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create"
      setError(msg)
    }
  }

  const renderCategoryHeader = (titleClassName?: string) => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    const displayName = String(activeCategory?.name || "나의 페이지")
    const canEdit = Boolean(categoryId && activeCategory?.id)
    const type = activeCategory?.type || "personal"
    const DefaultCatIcon = type === "team" ? Share2 : BookOpen
    const chosen = decodePageIcon(activeCategory?.icon)
    const iconEl = (() => {
      if (!chosen) return <DefaultCatIcon className="size-4 opacity-80" />
      if (chosen.kind === "emoji") return <span className="text-[18px] leading-none">{chosen.value}</span>
      const Preset = LUCIDE_PRESET_MAP[chosen.value]
      const Dyn = Preset || lucideAll?.[chosen.value]
      if (!Dyn) return <DefaultCatIcon className="size-4 opacity-80" />
      return <Dyn className="size-4" />
    })()

    return (
      <div className="flex items-center gap-2 min-w-0">
        {canEdit ? (
          <Popover open={categoryIconOpen} onOpenChange={setCategoryIconOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                title="카테고리 아이콘 변경"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {iconEl}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="w-[370px] p-3" onPointerDown={(e) => e.stopPropagation()}>
              <Tabs value={iconPickerTab} onValueChange={(v) => setIconPickerTab(v === "icon" ? "icon" : "emoji")}>
                <TabsList>
                  <TabsTrigger value="emoji">이모지</TabsTrigger>
                  <TabsTrigger value="icon">아이콘</TabsTrigger>
                </TabsList>
                <TabsContent value="emoji">
                  <div className="max-h-[360px] overflow-auto pr-1">
                    <EmojiPicker
                      theme={isDark ? Theme.DARK : Theme.LIGHT}
                      previewConfig={{ showPreview: false }}
                      onEmojiClick={(emoji: EmojiClickData) => {
                        const native = emoji?.emoji ? String(emoji.emoji) : ""
                        if (!native) return
                        void saveCategoryIcon({ kind: "emoji", value: native })
                        setCategoryIconOpen(false)
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void saveCategoryIcon(null)
                        setCategoryIconOpen(false)
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="icon">
                  <div className="mb-2">
                    <Input
                      value={lucideQuery}
                      onChange={(e) => setLucideQuery(e.target.value)}
                      placeholder="Search icons (e.g. calendar, bot, file...)"
                      className="h-8 text-sm"
                    />
                  </div>

                  {lucideQuery.trim() ? (
                    <>
                      {lucideLoading && !lucideAll ? <div className="text-xs text-muted-foreground px-1 py-2">Loading icons…</div> : null}
                      <div className="max-h-[300px] overflow-auto pr-1">
                        <div className="grid grid-cols-7 gap-1">
                          {(() => {
                            const q = lucideQuery.trim().toLowerCase()
                            const map = lucideAll || {}
                            const keys = Object.keys(map)
                              .filter((k) => k.toLowerCase().includes(q))
                              .slice(0, 98)
                            if (!lucideLoading && lucideAll && keys.length === 0) {
                              return (
                                <div className="col-span-7 text-xs text-muted-foreground px-1 py-2">
                                  No matches. Try a different keyword.
                                </div>
                              )
                            }
                            return keys.map((k) => {
                              const Cmp = map[k]
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                                  onClick={() => {
                                    void saveCategoryIcon({ kind: "lucide", value: k })
                                    setCategoryIconOpen(false)
                                  }}
                                  title={k}
                                  aria-label={k}
                                >
                                  <Cmp className="size-4" />
                                </button>
                              )
                            })
                          })()}
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Showing up to 98 matches. Refine your search to narrow results.
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {LUCIDE_PRESETS.map((it) => (
                        <button
                          key={it.key}
                          type="button"
                          className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                          onClick={() => {
                            void saveCategoryIcon({ kind: "lucide", value: it.key })
                            setCategoryIconOpen(false)
                          }}
                          title={it.label}
                          aria-label={it.label}
                        >
                          <it.Icon className="size-4" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void saveCategoryIcon(null)
                        setCategoryIconOpen(false)
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center">{iconEl}</div>
        )}

        {canEdit && categoryRenameOpen ? (
          <input
            ref={categoryRenameInputRef}
            className="min-w-0 flex-1 bg-background outline-none rounded-sm px-2 py-1 border border-border text-sm"
            value={categoryRenameValue}
            onChange={(e) => setCategoryRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void commitCategoryRename()
                setCategoryRenameOpen(false)
              } else if (e.key === "Escape") {
                e.preventDefault()
                setCategoryRenameOpen(false)
              }
            }}
            onBlur={() => {
              if (Date.now() < categoryRenameFocusUntilRef.current) return
              void commitCategoryRename()
              setCategoryRenameOpen(false)
            }}
          />
        ) : (
          <button
            type="button"
            className={["min-w-0 truncate text-left", titleClassName || ""].join(" ").trim()}
            title={displayName}
            onClick={() => {
              if (!canEdit) return
              setCategoryRenameValue(displayName)
              setCategoryRenameOpen(true)
            }}
          >
            {displayName}
          </button>
        )}
      </div>
    )
  }

  const isEmptyPagePlaceholder = isNew || !postId

  return (
    <>
    <AppShell
      headerLeftContent={
        <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-nowrap">
          {/* When collapsed, show ListTree icon + breadcrumb - 목록 트리 아이콘 + 브레드크럼 표시 */}
          {(isMobile ? !isNavDrawerOpen : !navOpen) ? (
            <HoverCard openDelay={0} closeDelay={120}>
              <HoverCardTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={openNav} title="페이지 트리">
                  <ListTree className="size-4" />
                </Button>
              </HoverCardTrigger>
              {!isMobile ? (
                <HoverCardContent side="right" align="start" className="w-[280px] p-2">
                  <div className="flex items-center justify-between px-1 pb-2">
                    {renderCategoryHeader("text-sm font-semibold")}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"                        
                        onClick={isAllExpanded ? collapseAll : expandAll}
                        title={isAllExpanded ? "목록 최소화" : "목록 펼치기"}                        
                      >
                        {isAllExpanded ? <ListChevronsDownUp className="size-4" /> : <ListChevronsUpDown className="size-4" />}
                      </Button>

                      <Button variant="ghost" size="sm" onClick={createNewFromNav} title="새 페이지" className="size-8">
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <ScrollArea className="h-[600px]">
                    <div className="pt-2">
                      {roots.length === 0 ? (
                        <div className="text-sm text-muted-foreground px-2 py-2">아직 페이지가 없습니다.</div>
                      ) : (
                        <div className="flex flex-col gap-1">{roots.map((p) => renderTreeNode(p, 0))}</div>
                      )}
                    </div>
                  </ScrollArea>
                </HoverCardContent>
              ) : null}
            </HoverCard>
          ) : null}

          <Breadcrumb className="min-w-0 overflow-hidden">
            <BreadcrumbList className="min-w-0 overflow-hidden flex-nowrap whitespace-nowrap break-normal">
              {breadcrumbData.visible.map((c, idx) => {
                const isLast = idx === breadcrumbData.visible.length - 1
                if (c.id === "__ellipsis__") {
                  return (
                    <BreadcrumbItem key={`ellipsis_${idx}`}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="gap-0">
                          <Button                            
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"                            
                            title="숨겨진 경로 보기"
                          >
                            <BreadcrumbEllipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          {breadcrumbData.hidden.map((h) => (
                            <DropdownMenuItem
                              key={h.id}
                              onSelect={() => {
                                if (isMobile) setIsNavDrawerOpen(false)
                                navigate(`/posts/${h.id}/edit${categoryQS}`)
                              }}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0">{renderHeaderIcon(h.id)}</span>
                                <span className="truncate">{h.title || "New page"}</span>
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {!isLast ? <BreadcrumbSeparator /> : null}
                    </BreadcrumbItem>
                  )
                }
                const iconEl = renderHeaderIcon(c.id)
                const label = (
                  <span className="inline-flex items-center gap-1.5 max-w-[160px] min-w-[30px] min-w-0 align-bottom">
                    {iconEl ? <span className="shrink-0">{iconEl}</span> : null}
                    <span className="min-w-0 truncate">{c.title || "New page"}</span>
                  </span>
                )
                return (
                  <BreadcrumbItem key={c.id} className="min-w-0">
                    {isLast ? (
                      <BreadcrumbPage className="min-w-0">{label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        asChild
                        className="min-w-0 cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault()
                          if (isMobile) setIsNavDrawerOpen(false)
                          navigate(`/posts/${c.id}/edit${categoryQS}`)
                        }}
                      >
                        <span className="min-w-0">{label}</span>
                      </BreadcrumbLink>
                    )}
                    {!isLast ? <BreadcrumbSeparator /> : null}
                  </BreadcrumbItem>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      }
      headerContent={
        // 상단 해드 버튼 들
        <div className="flex items-center gap-2">
          {/* <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4 mr-2" />
            Reload
          </Button> */}
          <Button className="hidden" size="sm" disabled={!canSave} onClick={() => void saveNow()}>
            <Save className="size-4 mr-2" />
            Save{dirty ? "*" : ""}
          </Button>
          <Button variant="ghost" size="sm" className="sm:hidden" onClick={createNewFromNav} title="새 페이지">
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="툴바"
            className="hidden sm:block"
            onClick={() => setPmToolbarOpen((v) => !v)}
            aria-pressed={pmToolbarOpen}
          >
            {pmToolbarOpen ? <SquareChevronUp /> : <Settings2 />}
          </Button>
          <Button
            variant="ghost"            
            size="sm"
            title="페이지 너비 토글"
            onClick={() => setIsWideLayout((v) => !v)}
          >
            {isWideLayout ? <ChevronsRightLeft /> : <ChevronsLeftRight />}
          </Button>
        </div>
      }
      leftPane={
        <>
          {/* Left page tree (local) - 왼쪽 페이지 트리 */}
          {isMobile ? (
            <>
              {/* Mobile: NavDrawer - 모바일 왼쪽 페이지 트리 */}
              {isNavDrawerOpen ? (
                <>
                  <div className="fixed inset-0 top-[56px] z-30 bg-black/30" onClick={() => setIsNavDrawerOpen(false)} />
                  <div className="fixed top-[56px] left-0 bottom-0 z-40 w-[320px] border-r border-border bg-background shadow-lg">
                    <div className="h-12 flex items-center justify-between px-3">
                      {renderCategoryHeader("font-semibold")}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          className="size-8 shrink-0"
                          title={isAllExpanded ? "목록 최소화" : "목록 펼치기"}
                          onClick={isAllExpanded ? collapseAll : expandAll}
                        >
                          {isAllExpanded ? <ListChevronsDownUp className="size-4" /> : <ListChevronsUpDown className="size-4" />}
                        </Button>
                        <Button variant="ghost" className="size-8 shrink-0" onClick={createNewFromNav} title="새 페이지">
                          <Plus className="size-4" />
                        </Button>
                        <Button variant="ghost" className="size-8 shrink-0" onClick={() => setIsNavDrawerOpen(false)} title="닫기">
                          <ChevronsLeft className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <Separator />
                    <ScrollArea className="h-[calc(100%-48px)]">
                      <div className="p-2">
                        {roots.length === 0 ? (
                          <div className="text-sm opacity-70 px-2 py-2">아직 페이지가 없습니다.</div>
                        ) : (
                          <div className="flex flex-col gap-1">{roots.map((p) => renderTreeNode(p, 0))}</div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              ) : null}
              {/* Mobile: keep leftPane width zero so main content doesn't shift - 왼쪽 페이지 트리 너비를 0으로 유지하여 메인 콘텐츠가 이동하지 않도록 함 */}
              <div className="w-0" />
            </>
          ) : navOpen ? (
            <>
              {/* Desktop: NavDrawer - 데스크탑 왼쪽 페이지 트리 */}    
              <div
                className={[
                  "relative h-full shrink-0 border-r border-border text-sidebar-foreground bg-background",
                  "min-w-[220px] max-w-[380px]",
                  navResizing ? "transition-none" : "transition-[width] duration-200",
                ].join(" ")}
                style={{ width: navWidth }}
              >
                <div className="h-14 flex items-center justify-between px-3">
                  {renderCategoryHeader("text-sm font-semibold")}
                  <div className="flex items-center gap-0">
                    <Button
                      variant="ghost"
                      size="sm"                      
                      title={isAllExpanded ? "목록 최소화" : "목록 펼치기"}
                      onClick={isAllExpanded ? collapseAll : expandAll}
                    >
                      {isAllExpanded ? <ListChevronsDownUp /> : <ListChevronsUpDown />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={createNewFromNav} title="새 페이지">
                      <Plus />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setNavOpen(false)} title="닫기">
                      <ChevronsLeft />
                    </Button>
                  </div>
                </div>
                <Separator />

                <ScrollArea className="h-[calc(100%-48px)]">
                  <div className="p-1 w-full">
                    {roots.length === 0 ? <div className="text-sm opacity-70 px-2 py-2">아직 페이지가 없습니다.</div> : null}
                     <div className="flex min-w-0 flex-col gap-1">{roots.map((p) => renderTreeNode(p, 0))}</div>
                  </div>
                </ScrollArea>

                {/* Right-edge resize handle (full height, above all sidebar content) */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize page tree"
                  className={[
                    "absolute inset-y-0 right-0 w-2",
                    "cursor-col-resize",
                    "z-50",
                    "hover:bg-border/60",
                    navResizing ? "bg-border/70" : "bg-transparent",
                  ].join(" ")}
                  onPointerDown={startNavResize}
                />
              </div>
            </>
          ) : (
            // Desktop: keep leftPane width zero so main content doesn't shift
            <div className="w-0" />
          )}
        </>
      }
    >
      {/* Editor (Main Body slot) */}
      <div className="flex-1 h-full overflow-auto">
        <div className={[isWideLayout ? "w-full" : "max-w-4xl", "mx-auto px-12"].join(" ")}>
          <div className="mb-4">

            {/* 페이지 상단 부분 숨기기  - 페이지명, 페이지아이디, 저장버전 */}
            <div className="text-xl font-semibold hidden h-0">Post Editor</div>
            <div className="text-sm text-muted-foreground hidden h-0">
              postId: <span className="font-mono">{postId}</span> · version: {serverVersion}
            </div>

            {isEmptyPagePlaceholder ? (
              <div className="mt-3">
                <div className="relative flex items-center gap-2 select-none">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 opacity-70">
                    <File className="size-5 text-muted-foreground" />
                  </div>
                  <div
                    className="w-full text-3xl font-bold text-muted-foreground truncate"
                    aria-label="빈 페이지 제목"
                  >
                    New page
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                {isDeletedPage ? (
                  <div className="mb-2 text-sm font-semibold text-red-600">Deleted Page</div>
                ) : null}
                {(() => {
                  const chosen = decodePageIcon(pageIconRaw)
                  const hasCustom = Boolean(chosen)
                  const hasTitleContent = docJsonHasMeaningfulContent(draftDocJson)
                  const InsertIcon = hasTitleContent ? FileText : File
                  const iconEl = (() => {
                    if (!chosen) return null
                    if (chosen.kind === "emoji") return <span className="text-[28px] leading-none">{chosen.value}</span>
                    const Preset = LUCIDE_PRESET_MAP[chosen.value]
                    const Dyn = Preset || lucideAll?.[chosen.value]
                    if (!Dyn) return <span className="text-[18px] leading-none opacity-60">□</span>
                    return <Dyn className="size-7" />
                  })()

                  return (
                    <Popover open={titleIconOpen} onOpenChange={setTitleIconOpen}>
                      <div className="relative group/title flex items-center gap-2">
                        {hasCustom ? (
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                              title="아이콘 변경"
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              {iconEl}
                            </button>
                          </PopoverTrigger>
                        ) : (
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={[
                                // Keep inside the title container so it won't be covered by the sticky header,
                                // and so hover doesn't drop when moving the mouse to the button.
                                // Float OUTSIDE the title (no title indent), but keep hover stable via an invisible bridge.
                                "absolute top-1 -left-10",
                                "h-8 w-8",
                                "rounded-md border border-border bg-background shadow-sm flex items-center justify-center",
                                "z-[100]",
                                "opacity-0 invisible pointer-events-none",
                                "group-hover/title:opacity-100 group-hover/title:visible group-hover/title:pointer-events-auto",
                                "transition-opacity",
                              ].join(" ")}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <InsertIcon className="size-4" />
                            </button>
                          </PopoverTrigger>
                        )}

                        {/* Hover bridge: extends the group's hover hitbox to the floating button area so it doesn't disappear while moving the mouse. */}
                        {!hasCustom ? (
                          <span
                            aria-hidden
                            className={[
                              "absolute top-0 -left-10 h-full w-10",
                              "bg-transparent",
                            ].join(" ")}
                          />
                        ) : null}

                        <input
                          ref={titleInputRef}
                          className="w-full text-3xl font-bold outline-none placeholder:text-muted-foreground truncate"
                          title={pageTitle}
                          value={pageTitle}
                          placeholder="New page"
                          onChange={(e) => setPageTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return
                            // Enter: move focus into the ProseMirror editor.
                            e.preventDefault()
                            e.stopPropagation()
                            try {
                              window.dispatchEvent(new CustomEvent("reductai:pm-editor:focus"))
                            } catch {
                              // ignore
                            }
                          }}
                        />
                      </div>

                      <PopoverContent align="start" sideOffset={8} className="w-[370px] p-3 z-[90]">
                        <Tabs value={iconPickerTab} onValueChange={(v) => setIconPickerTab(v === "icon" ? "icon" : "emoji")}>
                          <TabsList>
                            <TabsTrigger value="emoji">이모지</TabsTrigger>
                            <TabsTrigger value="icon">아이콘</TabsTrigger>
                          </TabsList>
                          <TabsContent value="emoji">
                            <div className="max-h-[360px] overflow-auto pr-1">
                              <EmojiPicker
                                theme={document.documentElement.classList.contains("dark") ? Theme.DARK : Theme.LIGHT}
                                previewConfig={{ showPreview: false }}
                                onEmojiClick={(emoji: EmojiClickData) => {
                                  const native = emoji?.emoji ? String(emoji.emoji) : ""
                                  if (!native || !postId) return
                                  void savePageIcon(postId, { kind: "emoji", value: native })
                                  setTitleIconOpen(false)
                                }}
                              />
                            </div>
                            <div className="mt-2 flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (!postId) return
                                  void savePageIcon(postId, null)
                                  setTitleIconOpen(false)
                                }}
                              >
                                Reset
                              </Button>
                            </div>
                          </TabsContent>
                          <TabsContent value="icon">
                            <div className="mb-2">
                              <Input
                                value={lucideQuery}
                                onChange={(e) => setLucideQuery(e.target.value)}
                                placeholder="Search icons (e.g. calendar, bot, file...)"
                                className="h-8 text-sm"
                              />
                            </div>

                            {lucideQuery.trim() ? (
                              <>
                                {lucideLoading && !lucideAll ? (
                                  <div className="text-xs text-muted-foreground px-1 py-2">Loading icons…</div>
                                ) : null}
                                <div className="max-h-[300px] overflow-auto pr-1">
                                  <div className="grid grid-cols-7 gap-1">
                                    {(() => {
                                      const q = lucideQuery.trim().toLowerCase()
                                      const map = lucideAll || {}
                                      const keys = Object.keys(map)
                                        .filter((k) => k.toLowerCase().includes(q))
                                        .slice(0, 98)
                                      if (!lucideLoading && lucideAll && keys.length === 0) {
                                        return (
                                          <div className="col-span-7 text-xs text-muted-foreground px-1 py-2">
                                            No matches. Try a different keyword.
                                          </div>
                                        )
                                      }
                                      return keys.map((k) => {
                                        const Cmp = map[k]
                                        return (
                                          <button
                                            key={k}
                                            type="button"
                                            className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                                            onClick={() => {
                                              if (!postId) return
                                              void savePageIcon(postId, { kind: "lucide", value: k })
                                              setTitleIconOpen(false)
                                            }}
                                            title={k}
                                            aria-label={k}
                                          >
                                            <Cmp className="size-4" />
                                          </button>
                                        )
                                      })
                                    })()}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="grid grid-cols-7 gap-1">
                                  {LUCIDE_PRESETS.map((it) => (
                                    <button
                                      key={it.key}
                                      type="button"
                                      className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                                      onClick={() => {
                                        if (!postId) return
                                        void savePageIcon(postId, { kind: "lucide", value: it.key })
                                        setTitleIconOpen(false)
                                      }}
                                      title={it.label}
                                      aria-label={it.label}
                                    >
                                      <it.Icon className="size-4" />
                                    </button>
                                  ))}
                                </div>
                                <div className="mt-2 text-[11px] text-muted-foreground px-0.5">
                                  검색어를 입력하면 전체 아이콘 목록을 불러옵니다.
                                </div>
                              </>
                            )}
                            <div className="mt-2 flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (!postId) return
                                  void savePageIcon(postId, null)
                                  setTitleIconOpen(false)
                                }}
                              >
                                Reset
                              </Button>
                            </div>
                          </TabsContent>
                        </Tabs>
                      </PopoverContent>
                    </Popover>
                  )
                })()}
              </div>
            )}
          </div>

          {error ? (
            <Card className="mb-4 p-3 border-destructive/30 bg-destructive/5">
              <div className="text-sm text-destructive whitespace-pre-wrap">{error}</div>
            </Card>
          ) : null}
          {error?.includes("로그인이 필요") ? (
            <div className="mb-4">
              <Button variant="outline" onClick={() => navigate("/")}>
                로그인하러 가기
              </Button>
            </div>
          ) : null}
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[420px] w-full" />
            </div>
          ) : (
            <div className="pb-[300px]">
              {isEmptyPagePlaceholder ? (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    페이지가 없습니다. 왼쪽에서 “+”로 새 페이지를 만들거나, 페이지를 선택하세요.
                  </div>
                  <div className="space-y-3 opacity-60 pointer-events-none select-none">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-[420px] w-full" />
                  </div>
                  <div className="pt-2">
                    <Button onClick={createNewFromNav}>
                      <Plus className="size-4 mr-2" />
                      새 페이지 만들기
                    </Button>
                  </div>
                </div>
              ) : (
                <ProseMirrorEditor
                  initialDocJson={initialDocJson}
                  toolbarOpen={pmToolbarOpen}
                  onChange={(j) => {
                    // Keep draftRef in sync immediately so "save-before-navigate" never misses the latest embed link.
                    draftRef.current = j
                    // Debounce the state update to avoid triggering expensive useEffects on every keystroke.
                    // The draftRef.current is always up-to-date for immediate operations like save.
                    if (draftStateTimerRef.current) window.clearTimeout(draftStateTimerRef.current)
                    draftStateTimerRef.current = window.setTimeout(() => {
                      draftStateTimerRef.current = null
                      setDraftDocJson(j)
                    }, 100)
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
    <Dialog
      open={renameOpen}
      onOpenChange={(v) => {
        setRenameOpen(v)
        if (!v) {
          setRenameTargetId("")
          setRenameValue("")
        }
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          // allow closing
          void e
        }}
      >
        <DialogHeader>
          <DialogTitle>이름 바꾸기</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void applyRename()
              }
            }}
            placeholder="페이지 이름"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setRenameOpen(false)
            }}
          >
            취소
          </Button>
          <Button
            onClick={() => {
              void applyRename()
            }}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Embed block icon picker popover */}
    <Popover
      open={!!embedIconPickerId}
      onOpenChange={(open) => {
        if (!open) {
          setEmbedIconPickerId(null)
          setEmbedIconPickerAnchor(null)
        }
      }}
    >
      <PopoverAnchor
        style={{
          position: "fixed",
          left: embedIconPickerAnchor?.left ?? 0,
          top: embedIconPickerAnchor?.top ?? 0,
          width: 0,
          height: 0,
        }}
      />
      <PopoverContent align="start" sideOffset={6} className="w-[370px] p-3 z-[100]">
        <Tabs value={iconPickerTab} onValueChange={(v) => setIconPickerTab(v === "icon" ? "icon" : "emoji")}>
          <TabsList>
            <TabsTrigger value="emoji">이모지</TabsTrigger>
            <TabsTrigger value="icon">아이콘</TabsTrigger>
          </TabsList>
          <TabsContent value="emoji">
            <div className="max-h-[360px] overflow-auto pr-1">
              <EmojiPicker
                theme={typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? Theme.DARK : Theme.LIGHT}
                previewConfig={{ showPreview: false }}
                onEmojiClick={(emoji: EmojiClickData) => {
                  const native = emoji?.emoji ? String(emoji.emoji) : ""
                  if (!native || !embedIconPickerId) return
                  void savePageIcon(embedIconPickerId, { kind: "emoji", value: native })
                  setEmbedIconPickerId(null)
                  setEmbedIconPickerAnchor(null)
                }}
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (embedIconPickerId) void savePageIcon(embedIconPickerId, null)
                  setEmbedIconPickerId(null)
                  setEmbedIconPickerAnchor(null)
                }}
              >
                Reset
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="icon">
            <div className="mb-2">
              <Input
                value={lucideQuery}
                onChange={(e) => setLucideQuery(e.target.value)}
                placeholder="Search icons (e.g. calendar, bot, file...)"
                className="h-8 text-sm"
              />
            </div>

            {lucideQuery.trim() ? (
              <>
                {lucideLoading && !lucideAll ? (
                  <div className="text-xs text-muted-foreground px-1 py-2">Loading icons…</div>
                ) : null}
                <div className="max-h-[300px] overflow-auto pr-1">
                  <div className="grid grid-cols-7 gap-1">
                    {(() => {
                      const q = lucideQuery.trim().toLowerCase()
                      const map = lucideAll || {}
                      const keys = Object.keys(map)
                        .filter((k) => k.toLowerCase().includes(q))
                        .slice(0, 98)
                      if (!lucideLoading && lucideAll && keys.length === 0) {
                        return (
                          <div className="col-span-7 text-xs text-muted-foreground px-1 py-2">
                            No matches. Try a different keyword.
                          </div>
                        )
                      }
                      return keys.map((k) => {
                        const Cmp = map[k]
                        return (
                          <button
                            key={k}
                            type="button"
                            className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                            onClick={() => {
                              if (embedIconPickerId) void savePageIcon(embedIconPickerId, { kind: "lucide", value: k })
                              setEmbedIconPickerId(null)
                              setEmbedIconPickerAnchor(null)
                            }}
                            title={k}
                            aria-label={k}
                          >
                            <Cmp className="size-4" />
                          </button>
                        )
                      })
                    })()}
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Showing up to 98 matches. Refine your search to narrow results.
                </div>
              </>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {LUCIDE_PRESETS.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    className="h-9 w-9 rounded-md border border-border hover:bg-accent flex items-center justify-center"
                    onClick={() => {
                      if (embedIconPickerId) void savePageIcon(embedIconPickerId, { kind: "lucide", value: it.key })
                      setEmbedIconPickerId(null)
                      setEmbedIconPickerAnchor(null)
                    }}
                    title={it.label}
                    aria-label={it.label}
                  >
                    <it.Icon className="size-4" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (embedIconPickerId) void savePageIcon(embedIconPickerId, null)
                  setEmbedIconPickerId(null)
                  setEmbedIconPickerAnchor(null)
                }}
              >
                Reset
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
    </>
  )
}


