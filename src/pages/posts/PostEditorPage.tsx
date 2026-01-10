import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { ProseMirrorEditor } from "../../components/post/ProseMirrorEditor"
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Plus, RefreshCw, Save } from "lucide-react"

import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Expand roots and the ancestor chain of the current page so it stays visible.
  useEffect(() => {
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
  }, [myPages.length, parentById, postId, roots])

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
      headerContent={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4 mr-2" />
            Reload
          </Button>
          <Button size="sm" disabled={!canSave} onClick={() => void saveNow()}>
            <Save className="size-4 mr-2" />
            Save{dirty ? "*" : ""}
          </Button>
        </div>
      }
      leftPane={
        <>
          {/* Left page tree (local) - 왼쪽 페이지 트리 */}
          <div
            className={[
              "h-full border-r text-sidebar-foreground bg-background transition-all duration-200 shrink-0",
              navOpen ? "w-[280px]" : "w-[56px]",
            ].join(" ")}
          >
            <div className="h-12 flex items-center justify-between px-3">
              {navOpen ? <div className="font-semibold">나의 페이지</div> : <div className="font-semibold">P</div>}
              <div className="flex items-center gap-2">
                {navOpen ? (
                  <Button variant="ghost" size="icon" onClick={createNewFromNav} title="새 페이지">
                    <Plus className="size-4" />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon" onClick={() => setNavOpen((v) => !v)} title="토글">
                  {navOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                </Button>
              </div>
            </div>
            <Separator />

            {navOpen ? (
              <ScrollArea className="h-[calc(100%-48px)]">
                <div className="p-2">
                  {roots.length === 0 ? (
                    <div className="text-sm opacity-70 px-2 py-2">아직 페이지가 없습니다.</div>
                  ) : null}

                  <div className="flex flex-col gap-1">
                    {roots.map((p) => renderTreeNode(p, 0))}
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="p-2 flex flex-col gap-2">
                <Button variant="ghost" size="icon" onClick={createNewFromNav} title="새 페이지">
                  <Plus className="size-5" />
                </Button>
              </div>
            )}
          </div>
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


