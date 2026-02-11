import * as React from "react"
import { AppShell } from "@/components/layout/AppShell"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { useNavigate } from "react-router-dom"
import { ProseMirrorViewer } from "@/components/post/ProseMirrorViewer"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type DeletedThreadRow = {
  id: string
  title: string
  created_at: string
  updated_at: string
}

type DeletedPostRow = {
  id: string
  parent_id: string | null
  category_id?: string | null
  category_lost?: boolean
  title: string
  icon?: string | null
  deleted_at?: string | null
  updated_at: string
}

type CategoryRow = {
  id: string
  name: string
  icon?: string | null
  slug?: string
}

const TIMELINE_API_BASE = "/api/ai/timeline"
const POSTS_API_BASE = "/api/posts"

export default function TrashPage() {
  const navigate = useNavigate()
  const [tab, setTab] = React.useState<"timeline" | "pages">("timeline")
  const [threads, setThreads] = React.useState<DeletedThreadRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [threadPurgeTarget, setThreadPurgeTarget] = React.useState<DeletedThreadRow | null>(null)

  const [deletedPosts, setDeletedPosts] = React.useState<DeletedPostRow[]>([])
  const [postsLoading, setPostsLoading] = React.useState(false)
  const [selectedPostId, setSelectedPostId] = React.useState<string>("")
  const [postDetailLoading, setPostDetailLoading] = React.useState(false)
  const [postDetail, setPostDetail] = React.useState<{
    post: DeletedPostRow & { status?: string; deleted_at?: string | null }
    docJson?: unknown
    ancestors?: DeletedPostRow[]
    children?: DeletedPostRow[]
  } | null>(null)
  const [purgeConfirmOpen, setPurgeConfirmOpen] = React.useState(false)
  const [restoreConfirmTarget, setRestoreConfirmTarget] = React.useState<DeletedPostRow | null>(null)
  const [restoreCategoryId, setRestoreCategoryId] = React.useState<string>("")
  const [personalCategories, setPersonalCategories] = React.useState<CategoryRow[]>([])
  const [teamCategories, setTeamCategories] = React.useState<CategoryRow[]>([])

  const authHeaders = React.useCallback((): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  // auth guard (same style as Timeline)
  React.useEffect(() => {
    const token = localStorage.getItem("token")
    const expiresAt = Number(localStorage.getItem("token_expires_at") || 0)
    const isExpired = !expiresAt || Date.now() > expiresAt
    if (!token || isExpired) {
      localStorage.removeItem("token")
      localStorage.removeItem("token_expires_at")
      localStorage.removeItem("user_email")
      localStorage.removeItem("user_id")
      navigate("/", { replace: true })
    }
  }, [navigate])

  const fetchDeletedThreads = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${TIMELINE_API_BASE}/threads/deleted`, { headers: { ...authHeaders() } })
      if (!res.ok) throw new Error("DELETED_THREADS_FETCH_FAILED")
      const rows = (await res.json().catch(() => [])) as DeletedThreadRow[]
      setThreads(Array.isArray(rows) ? rows : [])
    } catch {
      setThreads([])
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  React.useEffect(() => {
    if (tab !== "timeline") return
    void fetchDeletedThreads()
  }, [fetchDeletedThreads, tab])

  const fetchDeletedPosts = React.useCallback(async () => {
    setPostsLoading(true)
    try {
      const res = await fetch(`${POSTS_API_BASE}/trash`, { headers: { ...authHeaders() } })
      if (!res.ok) throw new Error("DELETED_POSTS_FETCH_FAILED")
      const rows = (await res.json().catch(() => [])) as DeletedPostRow[]
      const next = Array.isArray(rows) ? rows : []
      setDeletedPosts(next)
      // if current selection disappeared, clear it
      if (selectedPostId && !next.some((p) => String(p.id) === String(selectedPostId))) {
        setSelectedPostId("")
        setPostDetail(null)
      }
    } catch {
      setDeletedPosts([])
    } finally {
      setPostsLoading(false)
    }
  }, [authHeaders, selectedPostId])

  const fetchDeletedPostDetail = React.useCallback(
    async (id: string) => {
      const pid = String(id || "").trim()
      if (!pid) return
      setPostDetailLoading(true)
      try {
        const res = await fetch(`${POSTS_API_BASE}/trash/${pid}`, { headers: { ...authHeaders() } })
        if (!res.ok) throw new Error("DELETED_POST_DETAIL_FAILED")
        const json: unknown = await res.json().catch(() => null)
        setPostDetail(json && typeof json === "object" ? (json as typeof postDetail) : null)
      } catch {
        setPostDetail(null)
      } finally {
        setPostDetailLoading(false)
      }
    },
    [authHeaders]
  )

  React.useEffect(() => {
    if (tab !== "pages") return
    void fetchDeletedPosts()
  }, [fetchDeletedPosts, tab])

  const fetchCategories = React.useCallback(async () => {
    try {
      const [pRes, tRes] = await Promise.all([
        fetch(`${POSTS_API_BASE}/categories/mine`, { headers: { ...authHeaders() } }),
        fetch(`${POSTS_API_BASE}/categories/mine?type=team_page`, { headers: { ...authHeaders() } }),
      ])
      const pRows = pRes.ok ? ((await pRes.json().catch(() => [])) as CategoryRow[]) : []
      const tRows = tRes.ok ? ((await tRes.json().catch(() => [])) as CategoryRow[]) : []
      setPersonalCategories(Array.isArray(pRows) ? pRows : [])
      setTeamCategories(Array.isArray(tRows) ? tRows : [])
    } catch {
      setPersonalCategories([])
      setTeamCategories([])
    }
  }, [authHeaders])

  React.useEffect(() => {
    if (tab !== "pages") return
    void fetchCategories()
  }, [fetchCategories, tab])

  React.useEffect(() => {
    if (tab !== "pages") return
    if (!selectedPostId) return
    void fetchDeletedPostDetail(selectedPostId)
  }, [fetchDeletedPostDetail, selectedPostId, tab])

  const restore = React.useCallback(
    async (id: string) => {
      const res = await fetch(`${TIMELINE_API_BASE}/threads/${id}/restore`, {
        method: "POST",
        headers: { ...authHeaders() },
      })
      if (!res.ok) throw new Error("RESTORE_FAILED")
      setThreads((prev) => prev.filter((t) => t.id !== id))
      toast("대화가 복구되었습니다.")
    },
    [authHeaders]
  )

  const purgeThread = React.useCallback(
    async (id: string) => {
      const res = await fetch(`${TIMELINE_API_BASE}/threads/${id}/purge`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      if (!res.ok) throw new Error("THREAD_PURGE_FAILED")
      setThreads((prev) => prev.filter((t) => t.id !== id))
    },
    [authHeaders]
  )

  const restorePost = React.useCallback(
    async (id: string, categoryId?: string) => {
      const body = categoryId ? JSON.stringify({ category_id: categoryId }) : null
      const res = await fetch(`${POSTS_API_BASE}/trash/${id}/restore`, {
        method: "POST",
        headers: { ...authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body || undefined,
      })
      if (!res.ok) {
        const t = await res.text().catch(() => "")
        throw new Error(t || "POST_RESTORE_FAILED")
      }
      // remove from trash list
      setDeletedPosts((prev) => prev.filter((p) => p.id !== id))
      // clear detail if it was the selected one
      if (String(selectedPostId) === String(id)) {
        setSelectedPostId("")
        setPostDetail(null)
      }
      toast("페이지가 복구되었습니다.")
    },
    [authHeaders, selectedPostId]
  )

  const shouldRequireCategoryChoice = React.useCallback((p: DeletedPostRow | null | undefined) => {
    if (!p) return false
    if (p.category_lost === true) return true
    // If category_id is null, we must choose a category to restore into.
    return p.category_id === null
  }, [])

  const purgePost = React.useCallback(
    async (id: string) => {
      const res = await fetch(`${POSTS_API_BASE}/trash/${id}`, { method: "DELETE", headers: { ...authHeaders() } })
      if (!res.ok) throw new Error("POST_PURGE_FAILED")
      setDeletedPosts((prev) => prev.filter((p) => p.id !== id))
      if (String(selectedPostId) === String(id)) {
        setSelectedPostId("")
        setPostDetail(null)
      }
    },
    [authHeaders, selectedPostId]
  )

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v === "pages" ? "pages" : "timeline")}>
      <AppShell
        headerLeftContent={
          <div className="flex flex-1 justify-start items-center gap-3">
            <TabsList>
              <TabsTrigger value="timeline">타임라인에서 지운 대화</TabsTrigger>
              <TabsTrigger value="pages">페이지에서 지운 페이지</TabsTrigger>
            </TabsList>
          </div>
        }
        headerContent={
          <div>
            
          </div>
        }
      >
        <div className="flex-1 h-full w-full overflow-hidden">
          <div className="h-full w-full max-w-[1000px] mx-auto">
            <TabsContent value="timeline">
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="text-sm font-medium">삭제된 대화</div>
                  <Button variant="outline" size="sm" onClick={() => void fetchDeletedThreads()} disabled={loading}>
                    새로고침
                  </Button>
                </div>
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                  {loading ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">불러오는 중…</div>
                  ) : threads.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">삭제된 대화가 없습니다.</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {threads.map((t) => (
                        <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className={cn("text-sm font-medium truncate")}>{t.title || "제목 없음"}</div>
                            <div className="text-xs text-muted-foreground truncate">{t.updated_at}</div>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <Button size="sm" onClick={() => void restore(t.id)}>
                              복구
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => setThreadPurgeTarget(t)}>
                              완전삭제
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <AlertDialog open={Boolean(threadPurgeTarget)} onOpenChange={(o) => !o && setThreadPurgeTarget(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>대화를 완전삭제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>이 작업은 되돌릴 수 없습니다. 대화와 메시지가 영구 삭제됩니다.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        const t = threadPurgeTarget
                        if (!t) return
                        void purgeThread(t.id)
                        setThreadPurgeTarget(null)
                      }}
                    >
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TabsContent>

            <TabsContent value="pages">
              <div className="mt-4 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
                {/* Left: deleted pages list */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="text-sm font-medium">삭제된 페이지</div>
                    <Button variant="outline" size="sm" onClick={() => void fetchDeletedPosts()} disabled={postsLoading}>
                      새로고침
                    </Button>
                  </div>
                  <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                    {postsLoading ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground">불러오는 중…</div>
                    ) : deletedPosts.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground">삭제된 페이지가 없습니다.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {deletedPosts.map((p) => {
                          const active = String(p.id) === String(selectedPostId)
                          const needsCategory = shouldRequireCategoryChoice(p)
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className={cn(
                                "w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors",
                                active ? "bg-accent/60" : ""
                              )}
                              onClick={() => setSelectedPostId(String(p.id))}
                            >
                              <div className="text-sm font-medium truncate">{p.title || "제목 없음"}</div>
                              {needsCategory ? (
                                <div className="text-xs text-destructive mt-1 truncate">복원 시 카테고리를 선택해야 합니다.</div>
                              ) : null}
                              <div className="text-xs text-muted-foreground truncate">{p.updated_at}</div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: deleted page detail (Notion-like) */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {postDetail?.post?.title ? postDetail.post.title : selectedPostId ? "페이지" : "페이지 선택"}
                      </div>
                      {postDetail?.ancestors?.length ? (
                        <div className="text-xs text-muted-foreground truncate">
                          {postDetail.ancestors.map((a) => a.title || "제목 없음").join(" / ")}
                        </div>
                      ) : null}
                      {shouldRequireCategoryChoice(postDetail?.post) ? (
                        <div className="text-xs text-destructive mt-1 truncate">복원 시 카테고리를 선택해야 합니다.</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          const id = selectedPostId
                          if (!id) return
                          // If category is missing, force choosing a category before restore.
                          const target = postDetail?.post
                          if (shouldRequireCategoryChoice(target)) {
                            setRestoreConfirmTarget(target as DeletedPostRow)
                            setRestoreCategoryId("")
                            return
                          }
                          void restorePost(id)
                        }}
                        disabled={!selectedPostId}
                      >
                        복구
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setPurgeConfirmOpen(true)}
                        disabled={!selectedPostId}
                      >
                        완전삭제
                      </Button>
                    </div>
                  </div>

                  {!selectedPostId ? (
                    <div className="px-4 py-10 text-sm text-muted-foreground">왼쪽에서 삭제된 페이지를 선택하세요.</div>
                  ) : postDetailLoading ? (
                    <div className="px-4 py-10 text-sm text-muted-foreground">불러오는 중…</div>
                  ) : !postDetail ? (
                    <div className="px-4 py-10 text-sm text-muted-foreground">페이지를 불러오지 못했습니다.</div>
                  ) : (
                    <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
                      <div className="min-h-[360px]">
                        <ProseMirrorViewer docJson={postDetail.docJson} className="prose max-w-none" />
                      </div>
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="px-3 py-2 border-b border-border text-xs font-medium">자식 페이지</div>
                        <div className="max-h-[520px] overflow-y-auto">
                          {(postDetail.children || []).length === 0 ? (
                            <div className="px-3 py-3 text-xs text-muted-foreground">자식 페이지가 없습니다.</div>
                          ) : (
                            <div className="divide-y divide-border">
                              {(postDetail.children || []).map((c) => (
                                <button
                                  key={String(c.id)}
                                  type="button"
                                  className="w-full text-left px-3 py-2 hover:bg-accent/40 transition-colors"
                                  onClick={() => setSelectedPostId(String(c.id))}
                                >
                                  <div className="text-sm truncate">{c.title || "제목 없음"}</div>
                                  <div className="text-xs text-muted-foreground truncate">{c.updated_at}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <AlertDialog open={purgeConfirmOpen} onOpenChange={setPurgeConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>완전삭제할까요?</AlertDialogTitle>
                      <AlertDialogDescription>
                        이 작업은 되돌릴 수 없습니다. 선택한 페이지와 해당 자식 페이지(서브트리)가 DB에서 영구 삭제됩니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          const id = selectedPostId
                          if (!id) return
                          void purgePost(id)
                        }}
                      >
                        삭제
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Restore confirm when category is lost */}
                <AlertDialog open={Boolean(restoreConfirmTarget)} onOpenChange={(o) => !o && setRestoreConfirmTarget(null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>카테고리를 선택해 복원할까요?</AlertDialogTitle>
                      <AlertDialogDescription>이 페이지는 복원 시 카테고리를 반드시 선택해야 합니다.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="mt-2">
                      <Select value={restoreCategoryId} onValueChange={setRestoreCategoryId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="카테고리 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {personalCategories.length ? (
                            <SelectGroup>
                              <SelectLabel>개인 페이지</SelectLabel>
                              {personalCategories.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                  {c.name || "제목 없음"}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : null}
                          {teamCategories.length ? (
                            <SelectGroup>
                              <SelectLabel>팀/그룹 페이지</SelectLabel>
                              {teamCategories.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                  {c.name || "제목 없음"}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ) : null}
                          {!personalCategories.length && !teamCategories.length ? (
                            <div className="px-2 py-2 text-xs text-muted-foreground">복원할 카테고리가 없습니다. 먼저 카테고리를 만들어주세요.</div>
                          ) : null}
                        </SelectContent>
                      </Select>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={!restoreCategoryId}
                        onClick={() => {
                          const t = restoreConfirmTarget
                          if (!t) return
                          void restorePost(String(t.id), restoreCategoryId)
                          setRestoreConfirmTarget(null)
                        }}
                      >
                        복원
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TabsContent>
          </div>
        </div>
      </AppShell>
    </Tabs>
  )
}


