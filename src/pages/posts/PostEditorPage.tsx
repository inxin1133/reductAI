import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ProseMirrorEditor } from "../../components/post/ProseMirrorEditor"
import {
  ChevronDown,
  ChevronsLeft,
  ChevronRight,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

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
  child_count: number
  page_order: number
  updated_at: string
}

type DocJson = unknown

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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverVersion, setServerVersion] = useState<number>(0)
  const [initialDocJson, setInitialDocJson] = useState<DocJson>(null)
  const [draftDocJson, setDraftDocJson] = useState<DocJson>(null)

  const NAV_OPEN_KEY = "reductai:postEditor:navOpen"
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

  // Persist the user's preference for the left page tree visibility across route changes.
  const [navOpen, setNavOpen] = useState<boolean>(() => getInitialNavOpen())
  const navOpenRef = useRef<boolean>(getInitialNavOpen())
  const [isMobile, setIsMobile] = useState(false)
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false)
  const [myPages, setMyPages] = useState<MyPage[]>([])
  const [pageTitle, setPageTitle] = useState<string>("")
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [isDeletedPage, setIsDeletedPage] = useState(false)

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
          const pagesRes = await fetch(`/api/posts/mine`, { headers: authOnly })
          if (pagesRes.ok) {
            const pagesJson = await pagesRes.json()
            const pages = Array.isArray(pagesJson) ? (pagesJson as MyPage[]) : []
            const sorted = sortPages(filterNonDeleted(pages))
            if (!cancelled) setMyPages(sorted)

            if (sorted.length > 0) {
              const firstId = String(sorted[0].id || "")
              if (firstId) {
                navigate(`/posts/${firstId}/edit`, { replace: true })
                return
              }
            }
          }

          // no pages -> empty state (no auto-create)
          if (!cancelled) {
            setInitialDocJson(null)
            setDraftDocJson(null)
            setServerVersion(0)
            const s = JSON.stringify(null)
            lastSavedRef.current = s
            setDirty(false)
          }
          return
        }

        // Load sidebar tree (my pages)
        const pagesRes = await fetch(`/api/posts/mine`, { headers: authOnly })
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
        const status = typeof j.status === "string" ? j.status : ""
        const deletedAt = j.deleted_at != null
        const isDeleted = status === "deleted" || deletedAt
        setIsDeletedPage(isDeleted)

        // Safety: if the user somehow lands on a deleted page, redirect away.
        if (isDeleted) {
          const firstId = nonDeletedSorted.length ? String(nonDeletedSorted[0].id || "") : ""
          navigate(firstId ? `/posts/${firstId}/edit` : `/posts/new/edit`, { replace: true })
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
  }, [filterNonDeleted, postId, isNew, navigate, sortPages])

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

  // keep refs in sync
  useEffect(() => {
    draftRef.current = draftDocJson
    const s = JSON.stringify(draftDocJson || null)
    setDirty(s !== lastSavedRef.current)
  }, [draftDocJson])

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

  // Safe navigation requested by PageLinkNodeView
  useEffect(() => {
    function onOpenPost(e: Event) {
      const ce = e as CustomEvent<{ postId?: string; focusTitle?: boolean; forceSave?: boolean }>
      const targetId = String(ce.detail?.postId || "")
      if (!targetId) return
      const focusTitle = Boolean(ce.detail?.focusTitle)
      const forceSave = Boolean(ce.detail?.forceSave)
      navigatingRef.current = targetId
      void (async () => {
        // IMPORTANT:
        // The embed flow may navigate immediately after inserting the embed link, before React `dirty`
        // state has a chance to update. Force-save (or compare snapshots) ensures the parent keeps the link.
        const snapshot = JSON.stringify(draftRef.current || null)
        const shouldSave = forceSave || snapshot !== lastSavedRef.current
        if (shouldSave && canSave) await saveNow({ silent: true })
        navigate(`/posts/${targetId}/edit`, { state: { focusTitle } })
      })()
    }
    window.addEventListener("reductai:open-post", onOpenPost as EventListener)
    return () => window.removeEventListener("reductai:open-post", onOpenPost as EventListener)
  }, [canSave, dirty, navigate, postId, saveNow])

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

      // Persist deletion (soft delete) so it disappears everywhere
      const token = localStorage.getItem("token")
      if (!token) return
      void (async () => {
        for (const pid of ids) {
          await fetch(`/api/posts/${pid}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "deleted" }),
          }).catch(() => null)
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

  const openNav = () => {
    if (isMobile) setIsNavDrawerOpen(true)
    else setNavOpen(true)
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
        navigate(`/posts/${newId}/edit`)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to create"
        setError(msg)
      }
    },
    [canSave, navigate, postId, saveNow]
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

        await fetch(`/api/posts/${targetId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "deleted" }),
        })

        // Remove the link block from the parent page content (if any).
        if (parentId) {
          void updatePostContent(parentId, (doc) => removePageLinksFromDocJson(doc, targetId))
        }

        // Remove this page + its descendants from tree (UX: disappears immediately).
        setMyPages((prev) => {
          const byParent = new Map<string, string[]>()
          for (const p of prev) {
            if (!p.parent_id) continue
            const k = String(p.parent_id)
            const arr = byParent.get(k) || []
            arr.push(String(p.id))
            byParent.set(k, arr)
          }

          const toRemove = new Set<string>()
          const stack: string[] = [String(id)]
          while (stack.length) {
            const cur = stack.pop()!
            if (toRemove.has(cur)) continue
            toRemove.add(cur)
            const kids = byParent.get(cur) || []
            for (const kid of kids) stack.push(kid)
          }
          return prev.filter((p) => !toRemove.has(String(p.id)))
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
          const byParent = new Map<string, string[]>()
          for (const p of myPages) {
            if (!p.parent_id) continue
            const k = String(p.parent_id)
            const arr = byParent.get(k) || []
            arr.push(String(p.id))
            byParent.set(k, arr)
          }
          const toRemove = new Set<string>()
          const stack: string[] = [targetId]
          while (stack.length) {
            const cur = stack.pop()!
            if (toRemove.has(cur)) continue
            toRemove.add(cur)
            const kids = byParent.get(cur) || []
            for (const kid of kids) stack.push(kid)
          }
          const remainingRoots = sortPages(myPages.filter((p) => !p.parent_id && !toRemove.has(String(p.id))))
          return remainingRoots.length ? String(remainingRoots[0].id) : ""
        })()

        const noRemainingPages = (() => {
          const byParent = new Map<string, string[]>()
          for (const p of myPages) {
            if (!p.parent_id) continue
            const k = String(p.parent_id)
            const arr = byParent.get(k) || []
            arr.push(String(p.id))
            byParent.set(k, arr)
          }
          const toRemove = new Set<string>()
          const stack: string[] = [targetId]
          while (stack.length) {
            const cur = stack.pop()!
            if (toRemove.has(cur)) continue
            toRemove.add(cur)
            const kids = byParent.get(cur) || []
            for (const kid of kids) stack.push(kid)
          }
          const remaining = myPages.filter((p) => !toRemove.has(String(p.id)))
          return remaining.length === 0
        })()

        if (currentIsInDeletedSubtree) {
          if (parentId) {
            navigate(`/posts/${parentId}/edit`, { replace: true })
          } else {
            // If top-level page: navigate to the first remaining root page (exclude deleted).
            if (noRemainingPages) {
              navigate(`/posts/new/edit`, { replace: true })
            } else {
              navigate(nextRootAfterDelete ? `/posts/${nextRootAfterDelete}/edit` : `/posts/new/edit`, { replace: true })
            }
          }
        }

        // Toast with undo
        toast("페이지가 삭제 되었습니다.", {
          action: snapshot
            ? {
                label: "undo",
                onClick: () => {
                  const pid = String(snapshot.id)
                  void (async () => {
                    const t = localStorage.getItem("token")
                    if (!t) return
                    await fetch(`/api/posts/${pid}`, {
                      method: "PATCH",
                      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "draft" }),
                    }).catch(() => null)

                    // Restore tree entry (best-effort)
                    setMyPages((prev) => {
                      if (prev.some((p) => String(p.id) === pid)) return prev
                      // Insert near previous location; if missing, append.
                      const parent_id = snapshot.parent_id ? String(snapshot.parent_id) : null
                      const idx = prev.findIndex((p) => String(p.parent_id || "") === String(parent_id || "") && Number(p.page_order || 0) > Number(snapshot.page_order || 0))
                      const next = prev.slice()
                      const entry: MyPage = { ...snapshot, parent_id }
                      if (idx < 0) next.push(entry)
                      else next.splice(idx, 0, entry)
                      return next
                    })

                    // Restore link into parent content (best-effort)
                    if (snapshot.parent_id) {
                      const par = String(snapshot.parent_id)
                      if (String(postId || "") === par) {
                        window.dispatchEvent(
                          new CustomEvent("reductai:append-page-link", {
                            detail: { pageId: pid, title: snapshot.title || "New page", display: "embed" },
                          })
                        )
                      } else {
                        void updatePostContent(par, (doc) =>
                          appendPageLinkToDocJson(doc, { pageId: pid, title: snapshot.title || "New page", display: "embed" })
                        )
                      }
                    }
                  })()
                },
              }
            : undefined,
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to delete"
        setError(msg)
      }
    },
    [myPages, navigate, pageById, parentById, postId, sortPages]
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

        const duplicateSubtree = async (srcId: string, parentId: string | null, isRoot: boolean): Promise<string> => {
          // Load source content + title
          const srcRes = await fetch(`/api/posts/${srcId}/content`, { headers: authOnly })
          if (!srcRes.ok) throw new Error(await srcRes.text())
          const srcJson: unknown = await srcRes.json().catch(() => ({}))
          const srcObj = srcJson && typeof srcJson === "object" ? (srcJson as Record<string, unknown>) : {}
          const srcDoc = ("docJson" in srcObj ? srcObj.docJson : null) ?? null
          const srcTitle = String((typeof srcObj.title === "string" ? srcObj.title : "") || pageById.get(String(srcId))?.title || "New page")
          const nextTitle = `${srcTitle} (copy)`

          // Create new page
          const createRes = await fetch(`/api/posts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authOnly },
            body: JSON.stringify({ title: nextTitle, page_type: "page", status: "draft", visibility: "private", parent_id: parentId }),
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
            await duplicateSubtree(String(c.id), newId, false)
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
          const page_order = isRoot ? orderBase + 0.5 : orderBase
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

        const newRootId = await duplicateSubtree(String(id), rootParentId, true)
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
    [canSave, childrenByParent, pageById, postId, saveNow]
  )

  // 페이지 트리 렌더링 
  const renderTreeNode = (p: MyPage, depth: number) => {
    const id = String(p.id)
    const kids = childrenByParent.get(id) || []
    const hasKids = kids.length > 0
    const isExpanded = expanded.has(id)
    const isActive = id === postId

    return (
      <div key={id} className="flex flex-col w-full min-w-0">
        <div className="flex my-0.5 items-center w-full min-w-0" style={{ paddingLeft: depth * 8 }}>
          <div
            role="button"
            tabIndex={0}
            className={[
              // base (match shadcn button layout/feel)
              "group flex flex-1 items-center shrink-0 rounded-md text-sm font-medium transition-all outline-none",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              "h-8 px-1 gap-1 min-w-0 overflow-hidden justify-start",
              // variants
              isActive
                ? "bg-accent text-secondary-foreground shadow-xs"
                : "hover:bg-accent hover:text-accent-foreground",
            ].join(" ")}
            onClick={() => navigate(`/posts/${id}/edit`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                navigate(`/posts/${id}/edit`)
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
            <FileText className={["size-4", depth > 0 ? "opacity-70" : ""].join(" ")} />
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
        body: JSON.stringify({ title: "New page", page_type: "page", status: "draft", visibility: "private" }),
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      const newId = String(j.id || "")
      if (!newId) throw new Error("Failed to create post (missing id)")
      navigate(`/posts/${newId}/edit`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create"
      setError(msg)
    }
  }

  return (
    <>
    <AppShell
      headerLeftContent={
        <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-nowrap">
          {/* When collapsed, show ListTree icon + breadcrumb */}
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
                    <div className="text-sm font-semibold">나의 페이지</div>
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
                  <ScrollArea className="h-[360px]">
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
                                navigate(`/posts/${h.id}/edit`)
                              }}
                            >
                              <span className="truncate">{h.title || "New page"}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {!isLast ? <BreadcrumbSeparator /> : null}
                    </BreadcrumbItem>
                  )
                }
                const label = (
                  <span className="max-w-[120px] min-w-[30px] w-full truncate inline-block align-bottom">{c.title || "New page"}</span>
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
                          navigate(`/posts/${c.id}/edit`)
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
          <Button
            variant="ghost"
            size="sm"
            title="툴바"
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
                      <div className="font-semibold">나의 페이지</div>
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
              <div className="h-full w-[280px] border-r text-sidebar-foreground bg-background transition-all duration-200 shrink-0">
                <div className="h-14 flex items-center justify-between px-3">
                  <div className="text-sm font-semibold">나의 페이지</div>
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

            {!isNew ? (
              <div className="mt-3">
                {isDeletedPage ? (
                  <div className="mb-2 text-sm font-semibold text-red-600">Deleted Page</div>
                ) : null}
                <input
                  ref={titleInputRef}
                  className="w-full text-3xl font-bold outline-none placeholder:text-muted-foreground truncate"
                  title={pageTitle}
                  value={pageTitle}
                  placeholder="New page"
                  onChange={(e) => setPageTitle(e.target.value)}
                />
              </div>
            ) : null}
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
            <div className="">
              {isNew ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-[420px] w-full" />
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
                    setDraftDocJson(j)
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
    </>
  )
}


