import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ProseMirrorEditor } from "../../components/post/ProseMirrorEditor"
import { ChevronLeft, ChevronRight, FileText, Plus, RefreshCw, Save } from "lucide-react"

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

export default function PostEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
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

  const canSave = useMemo(() => !!postId && !!draftDocJson, [postId, draftDocJson])

  const sortPages = (pages: MyPage[]) =>
    [...pages].sort((a, b) => {
      const ao = Number(a.page_order || 0)
      const bo = Number(b.page_order || 0)
      if (ao !== bo) return ao - bo
      return String(a.title || "").localeCompare(String(b.title || ""))
    })

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
        // - Otherwise, create a new page and open it.
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

          // no pages -> create a new one
          const created = await fetch(`/api/posts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authOnly },
            body: JSON.stringify({ title: "Untitled", page_type: "page", status: "draft", visibility: "private" }),
          })
          if (!created.ok) throw new Error(await created.text())
          const pj = await created.json()
          const newId = String(pj.id || "")
          if (!newId) throw new Error("Failed to create post (missing id)")
          if (cancelled) return
          navigate(`/posts/${newId}/edit`, { replace: true })
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
        const json = await r.json()
        if (cancelled) return
        setServerVersion(Number(json.version || 0))
        setInitialDocJson(json.docJson || null)
        setDraftDocJson(json.docJson || null)
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

  async function save() {
    if (!canSave) return
    setError(null)
    try {
      const authOnly: Record<string, string> = { ...authHeaders() }
      const r = await fetch(`/api/posts/${postId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authOnly },
        body: JSON.stringify({ docJson: draftDocJson, version: serverVersion }),
      })
      if (r.status === 409) {
        const j = await r.json().catch(() => ({}))
        setError(`Version conflict (server: ${j.currentVersion}). Reload and try again.`)
        return
      }
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      setServerVersion(Number(j.version || serverVersion + 1))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save"
      setError(msg)
    }
  }

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

  async function createNewFromNav() {
    setError(null)
    try {
      const authOnly: Record<string, string> = { ...authHeaders() }
      const r = await fetch(`/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authOnly },
        body: JSON.stringify({ title: "Untitled", page_type: "page", status: "draft", visibility: "private" }),
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
          <Button size="sm" disabled={!canSave} onClick={save}>
            <Save className="size-4 mr-2" />
            Save
          </Button>
        </div>
      }
      leftPane={
        <>
          {/* Left page tree (local) - 왼쪽 페이지 트리 */}
          <div
            className={[
              "h-full border-r bg-sidebar text-sidebar-foreground transition-all duration-200 shrink-0",
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
                    {roots.map((p) => (
                      <div key={p.id}>
                        <Button
                          variant={p.id === postId ? "secondary" : "ghost"}
                          className="w-full justify-start gap-2"
                          onClick={() => navigate(`/posts/${p.id}/edit`)}
                        >
                          <FileText className="size-4" />
                          <span className="truncate">{p.title || "Untitled"}</span>
                        </Button>
                        {(childrenByParent.get(p.id) || []).map((c) => (
                          <Button
                            key={c.id}
                            variant={c.id === postId ? "secondary" : "ghost"}
                            className="w-full justify-start gap-2 pl-8"
                            onClick={() => navigate(`/posts/${c.id}/edit`)}
                          >
                            <FileText className="size-4 opacity-70" />
                            <span className="truncate">{c.title || "Untitled"}</span>
                          </Button>
                        ))}
                      </div>
                    ))}
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
              <ProseMirrorEditor initialDocJson={initialDocJson} onChange={setDraftDocJson} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}


