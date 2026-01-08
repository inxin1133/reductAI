import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ProseMirrorEditor } from "../../components/post/ProseMirrorEditor"
import { ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react"

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

export default function PostEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const rawId = id || ""
  const isNew = rawId === "new"
  const postId = rawId

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverVersion, setServerVersion] = useState<number>(0)
  const [initialDocJson, setInitialDocJson] = useState<any>(null)
  const [draftDocJson, setDraftDocJson] = useState<any>(null)

  const [navOpen, setNavOpen] = useState(true)
  const [myPages, setMyPages] = useState<MyPage[]>([])

  const canSave = useMemo(() => !!postId && !!draftDocJson, [postId, draftDocJson])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders() }
        if (!headers.Authorization) {
          throw new Error("로그인이 필요합니다. (token missing)")
        }

        // Create-new flow: /posts/new/edit -> create post then redirect to real id
        if (isNew) {
          const created = await fetch(`/api/posts`, {
            method: "POST",
            headers,
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
        const pagesRes = await fetch(`/api/posts/mine`, { headers })
        if (pagesRes.ok) {
          const pagesJson = await pagesRes.json()
          if (!cancelled && Array.isArray(pagesJson)) setMyPages(pagesJson as MyPage[])
        }

        const r = await fetch(`/api/posts/${postId}/content`, { headers })
        if (!r.ok) throw new Error(await r.text())
        const json = await r.json()
        if (cancelled) return
        setServerVersion(Number(json.version || 0))
        setInitialDocJson(json.docJson || null)
        setDraftDocJson(json.docJson || null)
      } catch (e: any) {
        if (cancelled) return
        setError(e?.message || "Failed to load")
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
      const r = await fetch(`/api/posts/${postId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
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
    } catch (e: any) {
      setError(e?.message || "Failed to save")
    }
  }

  const roots = useMemo(() => myPages.filter((p) => !p.parent_id), [myPages])
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
      const r = await fetch(`/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title: "Untitled", page_type: "page", status: "draft", visibility: "private" }),
      })
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      const newId = String(j.id || "")
      if (!newId) throw new Error("Failed to create post (missing id)")
      navigate(`/posts/${newId}/edit`)
    } catch (e: any) {
      setError(e?.message || "Failed to create")
    }
  }

  return (
    <div className="w-full h-[calc(100vh-0px)] flex bg-background">
      {/* Left page tree (Figma-ish) */}
      <div
        className={[
          "h-full border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
          navOpen ? "w-[280px]" : "w-[56px]",
        ].join(" ")}
      >
        <div className="h-12 flex items-center justify-between px-3 border-b">
          {navOpen ? <div className="font-semibold">나의 페이지</div> : <div className="font-semibold">P</div>}
          <div className="flex items-center gap-2">
            {navOpen ? (
              <button className="p-2 rounded hover:bg-accent/50" onClick={createNewFromNav} title="새 페이지">
                <Plus className="size-4" />
              </button>
            ) : null}
            <button className="p-2 rounded hover:bg-accent/50" onClick={() => setNavOpen((v) => !v)} title="토글">
              {navOpen ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </div>
        </div>

        {navOpen ? (
          <div className="p-2 overflow-auto h-[calc(100%-48px)]">
            {roots.length === 0 ? (
              <div className="text-sm opacity-70 px-2 py-2">아직 페이지가 없습니다.</div>
            ) : null}

            <div className="flex flex-col gap-1">
              {roots.map((p) => (
                <div key={p.id}>
                  <button
                    className={[
                      "w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-accent/50 text-left",
                      p.id === postId ? "bg-accent" : "",
                    ].join(" ")}
                    onClick={() => navigate(`/posts/${p.id}/edit`)}
                  >
                    <FileText className="size-4" />
                    <span className="truncate">{p.title || "Untitled"}</span>
                  </button>
                  {(childrenByParent.get(p.id) || []).map((c) => (
                    <button
                      key={c.id}
                      className={[
                        "w-full flex items-center gap-2 pl-8 pr-2 py-2 rounded hover:bg-accent/50 text-left",
                        c.id === postId ? "bg-accent" : "",
                      ].join(" ")}
                      onClick={() => navigate(`/posts/${c.id}/edit`)}
                    >
                      <FileText className="size-4 opacity-70" />
                      <span className="truncate">{c.title || "Untitled"}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-2">
            <button className="p-2 rounded hover:bg-accent/50" onClick={createNewFromNav} title="새 페이지">
              <Plus className="size-5" />
            </button>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 h-full overflow-auto">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-xl font-semibold">Post Editor</div>
              <div className="text-sm text-muted-foreground">
                postId: <span className="font-mono">{postId}</span> · version: {serverVersion}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 border rounded-md disabled:opacity-50" onClick={() => window.location.reload()}>
                Reload
              </button>
              <button className="px-3 py-2 border rounded-md disabled:opacity-50" disabled={!canSave} onClick={save}>
                Save
              </button>
            </div>
          </div>

          {error && <div className="mb-4 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}
          {error?.includes("로그인이 필요") ? (
            <div className="mb-4">
              <button className="px-3 py-2 border rounded-md" onClick={() => navigate("/")}>
                로그인하러 가기
              </button>
            </div>
          ) : null}
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <ProseMirrorEditor initialDocJson={initialDocJson} onChange={setDraftDocJson} />
          )}
        </div>
      </div>
    </div>
  )
}


