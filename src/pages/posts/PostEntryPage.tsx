import * as React from "react"
import { useNavigate } from "react-router-dom"

function authHeaders() {
  const token = localStorage.getItem("token")
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

type MyPage = {
  id: string
  page_order?: number
  title?: string
}

function sortPages(pages: MyPage[]) {
  return [...pages].sort((a, b) => {
    const ao = Number(a.page_order || 0)
    const bo = Number(b.page_order || 0)
    if (ao !== bo) return ao - bo
    return String(a.title || "").localeCompare(String(b.title || ""))
  })
}

// Dedicated entry route for "My Pages".
// Avoids timing/state issues inside PostEditorPage by doing only:
// - fetch /api/posts/mine
// - redirect to top page if exists
// - else create then redirect
export default function PostEntryPage() {
  const navigate = useNavigate()

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      const headers = authHeaders()
      if (!headers.Authorization) {
        navigate("/", { replace: true })
        return
      }

      try {
        const pagesRes = await fetch(`/api/posts/mine`, { headers })
        if (pagesRes.ok) {
          const pagesJson = await pagesRes.json().catch(() => [])
          const pages = Array.isArray(pagesJson) ? (pagesJson as MyPage[]) : []
          const sorted = sortPages(pages)
          const firstId = sorted.length > 0 ? String(sorted[0].id || "") : ""
          if (firstId) {
            if (!cancelled) navigate(`/posts/${firstId}/edit`, { replace: true })
            return
          }
        }

        // No pages -> create
        const created = await fetch(`/api/posts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ title: "Untitled", page_type: "page", status: "draft", visibility: "private" }),
        })
        if (!created.ok) throw new Error(await created.text())
        const pj = await created.json().catch(() => ({}))
        const newId = String((pj as any).id || "")
        if (!newId) throw new Error("Failed to create post (missing id)")
        if (!cancelled) navigate(`/posts/${newId}/edit`, { replace: true })
      } catch {
        // Fallback: old behavior
        if (!cancelled) navigate(`/posts/new/edit`, { replace: true })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  // Minimal blank screen while redirecting
  return <div className="w-full h-screen bg-background" />
}


