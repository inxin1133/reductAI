import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { Skeleton } from "@/components/ui/skeleton"

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
  status?: string
  deleted_at?: unknown
}

function isDeletedPage(p: MyPage) {
  return String(p.status || "") === "deleted" || p.deleted_at != null
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
// - else go to /posts/new/edit (empty state; user can create via +)
export default function PostEntryPage() {
  const navigate = useNavigate()
  const location = useLocation()

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      const headers = authHeaders()
      if (!headers.Authorization) {
        navigate("/", { replace: true })
        return
      }

      try {
        const qs = new URLSearchParams(location.search || "")
        const categoryId = qs.get("category") || ""
        const url = categoryId ? `/api/posts/mine?categoryId=${encodeURIComponent(categoryId)}` : `/api/posts/mine`
        const pagesRes = await fetch(url, { headers })
        if (pagesRes.ok) {
          const pagesJson = await pagesRes.json().catch(() => [])
          const pages = Array.isArray(pagesJson) ? (pagesJson as MyPage[]) : []
          const sorted = sortPages(pages.filter((p) => !isDeletedPage(p)))
          const pageIds = new Set(sorted.map((p) => String(p.id || "")))

          // Check if there's a last viewed page for this category that still exists
          let targetPageId = ""
          if (categoryId) {
            try {
              const lastViewedKey = `reductai.posts.lastViewedPage.${categoryId}`
              const lastViewedId = localStorage.getItem(lastViewedKey) || ""
              if (lastViewedId && pageIds.has(lastViewedId)) {
                targetPageId = lastViewedId
              }
            } catch {
              // ignore localStorage errors
            }
          }

          // Fallback to first page if no valid last viewed page
          if (!targetPageId && sorted.length > 0) {
            targetPageId = String(sorted[0].id || "")
          }

          if (targetPageId) {
            if (!cancelled) navigate(`/posts/${targetPageId}/edit${categoryId ? `?category=${encodeURIComponent(categoryId)}` : ""}`, { replace: true })
            return
          }
        }

        // No pages -> show empty state (user creates via +)
        if (!cancelled) navigate(`/posts/new/edit${categoryId ? `?category=${encodeURIComponent(categoryId)}` : ""}`, { replace: true })
      } catch {
        const qs = new URLSearchParams(location.search || "")
        const categoryId = qs.get("category") || ""
        if (!cancelled) navigate(`/posts/new/edit${categoryId ? `?category=${encodeURIComponent(categoryId)}` : ""}`, { replace: true })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [location.search, navigate])

  // Keep layout stable while redirecting (avoid flicker between routes)
  return (
    <AppShell>
      <div className="h-full w-full overflow-auto">
        <div className="max-w-4xl mx-auto px-12 pt-10 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      </div>
    </AppShell>
  )
}


