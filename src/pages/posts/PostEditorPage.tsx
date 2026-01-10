import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ProseMirrorEditor } from "../../components/post/ProseMirrorEditor"
import { ChevronDown, ChevronsLeft, ChevronRight, FileText, ListTree, Plus, Save, ListChevronsDownUp, ListChevronsUpDown } from "lucide-react"

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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

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

  const [navOpen, setNavOpen] = useState(true)
  const navOpenRef = useRef(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false)
  const [myPages, setMyPages] = useState<MyPage[]>([])
  const [pageTitle, setPageTitle] = useState<string>("")
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [isDeletedPage, setIsDeletedPage] = useState(false)

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
  const sortPages = (pages: MyPage[]) => {
    const indexed = pages.map((p, idx) => ({ p, idx }))
    indexed.sort((a, b) => {
      const ao = Number(a.p.page_order || 0)
      const bo = Number(b.p.page_order || 0)
      if (ao !== bo) return ao - bo
      return a.idx - b.idx
    })
    return indexed.map((x) => x.p)
  }

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
            const sorted = sortPages(pages)
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
        if (pagesRes.ok) {
          const pagesJson = await pagesRes.json()
          if (!cancelled && Array.isArray(pagesJson)) setMyPages(sortPages(pagesJson as MyPage[]))
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
        setIsDeletedPage(status === "deleted" || deletedAt)
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
  }, [postId, isNew, navigate])

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

  const roots = useMemo(() => sortPages(myPages.filter((p) => !p.parent_id)), [myPages])
  const childrenByParent = useMemo(() => {
    const m = new Map<string, MyPage[]>()
    for (const p of myPages) {
      if (!p.parent_id) continue
      const arr = m.get(p.parent_id) || []
      arr.push(p)
      m.set(p.parent_id, arr)
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => (a.page_order || 0) - (b.page_order || 0))
      m.set(k, arr)
    }
    return m
  }, [myPages])

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
        // remember desktop state and collapse
        navOpenRef.current = navOpen
        setNavOpen(false)
        setIsNavDrawerOpen(false)
      } else {
        setIsNavDrawerOpen(false)
        // restore last desktop state
        setNavOpen(navOpenRef.current)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const renderTreeNode = (p: MyPage, depth: number) => {
    const id = String(p.id)
    const kids = childrenByParent.get(id) || []
    const hasKids = kids.length > 0
    const isExpanded = expanded.has(id)
    const isActive = id === postId

    return (
      <div key={id} className="flex flex-col">
        <div className="flex items-center gap-1" style={{ paddingLeft: depth * 12 }}>
          {hasKids ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title={isExpanded ? "접기" : "펼치기"}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggleExpand(id)
              }}
            >
              {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          ) : (
            <div className="h-7 w-7 shrink-0" />
          )}
          <Button
            variant={isActive ? "secondary" : "ghost"}
            className="w-full justify-start gap-2 px-2"
            onClick={() => navigate(`/posts/${id}/edit`)}
          >
            <FileText className={["size-4", depth > 0 ? "opacity-70" : ""].join(" ")} />
            <span className="truncate">{p.title || "New page"}</span>
          </Button>
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
                        size="icon"
                        onClick={isAllExpanded ? collapseAll : expandAll}
                        title={isAllExpanded ? "목록 최소화" : "목록 펼치기"}
                        className="size-8"
                      >
                        {isAllExpanded ? <ListChevronsDownUp className="size-4" /> : <ListChevronsUpDown className="size-4" />}
                      </Button>

                      <Button variant="ghost" size="icon" onClick={createNewFromNav} title="새 페이지" className="size-8">
                        <Plus className="size-4" />
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
        <div className="flex items-center gap-2">
          {/* <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4 mr-2" />
            Reload
          </Button> */}
          <Button size="sm" disabled={!canSave} onClick={() => void saveNow()}>
            <Save className="size-4 mr-2" />
            Save{dirty ? "*" : ""}
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
                      className="size-8 shrink-0"
                      title={isAllExpanded ? "목록 최소화" : "목록 펼치기"}
                      onClick={isAllExpanded ? collapseAll : expandAll}
                    >
                      {isAllExpanded ? <ListChevronsDownUp className="size-4" /> : <ListChevronsUpDown className="size-4" />}
                    </Button>
                    <Button variant="ghost" className="size-8 shrink-0" onClick={createNewFromNav} title="새 페이지">
                      <Plus className="size-4" />
                    </Button>
                    <Button variant="ghost" className="size-8 shrink-0" onClick={() => setNavOpen(false)} title="닫기">
                      <ChevronsLeft className="size-4" />
                    </Button>
                  </div>
                </div>
                <Separator />

                <ScrollArea className="h-[calc(100%-48px)]">
                  <div className="p-2">
                    {roots.length === 0 ? <div className="text-sm opacity-70 px-2 py-2">아직 페이지가 없습니다.</div> : null}
                    <div className="flex flex-col gap-1">{roots.map((p) => renderTreeNode(p, 0))}</div>
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
        <div className="max-w-6xl mx-auto px-12 py-6">
          <div className="mb-4">
            <div className="text-xl font-semibold">Post Editor</div>
            <div className="text-sm text-muted-foreground">
              postId: <span className="font-mono">{postId}</span> · version: {serverVersion}
            </div>
            {!isNew ? (
              <div className="mt-3">
                {isDeletedPage ? (
                  <div className="mb-2 text-sm font-semibold text-red-600">Deleted Page</div>
                ) : null}
                <input
                  ref={titleInputRef}
                  className="w-full max-w-3xl bg-transparent text-3xl font-bold outline-none placeholder:text-muted-foreground"
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
                <Card className="p-6">
                  <div className="text-lg font-semibold mb-2">아직 페이지가 없습니다.</div>
                  <div className="text-sm text-muted-foreground mb-4">
                    왼쪽 상단의 <span className="font-semibold">+</span> 버튼으로 새 페이지를 만들어 주세요.
                  </div>
                  <Button onClick={createNewFromNav}>
                    <Plus className="size-4 mr-2" />
                    새 페이지 만들기
                  </Button>
                </Card>
              ) : (
                <ProseMirrorEditor
                  initialDocJson={initialDocJson}
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
  )
}


