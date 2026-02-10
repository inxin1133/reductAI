import * as React from "react"
import { useNavigate } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Download, Trash2, Star, ChevronLeft, ChevronRight, X } from "lucide-react"
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
import { FileAssetCard } from "@/components/files/FileAssetCard"
import type { FileAsset } from "@/components/files/fileAssetUtils"
import {
  appendQueryParams,
  formatBytes,
  getAssetCategory,
  getFileName,
  withAuthToken,
} from "@/components/files/fileAssetUtils"

const FILES_API_BASE = "/api/ai/media/assets"
const PAGE_SIZE = 24

type ListScope = "user" | "tenant"

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type PageAttachmentsPageProps = {
  scope: ListScope
  title: string
  emptyLabel: string
}

function PageAttachmentsPage({ scope, title, emptyLabel }: PageAttachmentsPageProps) {
  const navigate = useNavigate()
  const scopeParams = React.useMemo(
    () => (scope === "tenant" ? { scope: "tenant" } : undefined),
    [scope]
  )

  const [assets, setAssets] = React.useState<FileAsset[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [offset, setOffset] = React.useState(0)
  const [hasMore, setHasMore] = React.useState(true)
  const [totalBytes, setTotalBytes] = React.useState(0)

  const [kind, setKind] = React.useState<"all" | "image" | "video" | "audio" | "document">("all")
  const [favoriteOnly, setFavoriteOnly] = React.useState(false)

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [singleDeleteOpen, setSingleDeleteOpen] = React.useState(false)
  const [singleDeleteTarget, setSingleDeleteTarget] = React.useState<FileAsset | null>(null)
  const [viewerOpen, setViewerOpen] = React.useState(false)
  const [viewerItems, setViewerItems] = React.useState<FileAsset[]>([])
  const [viewerIndex, setViewerIndex] = React.useState(0)

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

  const fetchAssetsPage = React.useCallback(
    async (nextOffset: number, limit = PAGE_SIZE) => {
      const params = new URLSearchParams({
        source_type: "post_upload,ai_generated,attachment",
        limit: String(limit),
        offset: String(nextOffset),
      })
      if (scope === "tenant") {
        params.set("scope", "tenant")
        params.set("page_scope", "team")
      } else {
        params.set("page_scope", "personal")
      }
      const res = await fetch(`${FILES_API_BASE}?${params.toString()}`, {
        headers: { ...authHeaders() },
      })
      if (!res.ok) throw new Error("FILES_FETCH_FAILED")
      const json = (await res.json().catch(() => null)) as
        | { items?: FileAsset[]; total_bytes?: number; total_count?: number }
        | null
      return {
        items: Array.isArray(json?.items) ? json!.items : [],
        totalBytes: Number(json?.total_bytes || 0),
        totalCount: Number(json?.total_count || 0),
      }
    },
    [scope]
  )

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const { items, totalBytes, totalCount } = await fetchAssetsPage(0)
      setAssets(items)
      setTotalBytes(totalBytes)
      setOffset(items.length)
      setHasMore(items.length < totalCount)
    } catch {
      setAssets([])
      setTotalBytes(0)
      setOffset(0)
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [fetchAssetsPage])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = React.useMemo(() => {
    let list = assets
    if (favoriteOnly) list = list.filter((a) => Boolean(a.is_favorite))
    if (kind !== "all") {
      list = list.filter((a) => getAssetCategory(a) === kind)
    }
    return list
  }, [assets, favoriteOnly, kind])

  const loadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const { items, totalBytes, totalCount } = await fetchAssetsPage(offset)
      setAssets((prev) => [...prev, ...items])
      setTotalBytes(totalBytes)
      const nextOffset = offset + items.length
      setOffset(nextOffset)
      setHasMore(nextOffset < totalCount)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [fetchAssetsPage, hasMore, loadingMore, offset])

  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 240
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      void loadMore()
    }
  }, [loadMore])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const scopedUrl = React.useCallback(
    (url: string) => appendQueryParams(url, scopeParams),
    [scopeParams]
  )

  const updateFavorite = async (asset: FileAsset) => {
    const res = await fetch(scopedUrl(`${FILES_API_BASE}/${asset.id}/favorite`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ favorite: !asset.is_favorite }),
    })
    if (!res.ok) {
      toast("즐겨찾기 설정에 실패했습니다.")
      return
    }
    setAssets((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, is_favorite: !asset.is_favorite } : a))
    )
  }

  const deleteAsset = async (asset: FileAsset) => {
    const res = await fetch(scopedUrl(`${FILES_API_BASE}/${asset.id}`), {
      method: "DELETE",
      headers: { ...authHeaders() },
    })
    if (!res.ok) {
      toast("파일 삭제에 실패했습니다.")
      return false
    }
    setAssets((prev) => prev.filter((a) => a.id !== asset.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(asset.id)
      return next
    })
    return true
  }

  const requestSingleDelete = (asset: FileAsset) => {
    setSingleDeleteTarget(asset)
    setSingleDeleteOpen(true)
  }

  const openImageViewer = React.useCallback(
    (asset: FileAsset) => {
      if (getAssetCategory(asset) !== "image") return
      const images = filtered.filter((item) => getAssetCategory(item) === "image")
      if (!images.length) return
      const idx = images.findIndex((item) => item.id === asset.id)
      setViewerItems(images)
      setViewerIndex(idx >= 0 ? idx : 0)
      setViewerOpen(true)
    },
    [filtered]
  )

  const closeImageViewer = React.useCallback(() => {
    setViewerOpen(false)
  }, [])

  const showPrevImage = React.useCallback(() => {
    setViewerIndex((prev) => {
      if (viewerItems.length <= 1) return prev
      return (prev - 1 + viewerItems.length) % viewerItems.length
    })
  }, [viewerItems.length])

  const showNextImage = React.useCallback(() => {
    setViewerIndex((prev) => {
      if (viewerItems.length <= 1) return prev
      return (prev + 1) % viewerItems.length
    })
  }, [viewerItems.length])

  React.useEffect(() => {
    if (!viewerItems.length) {
      if (viewerIndex !== 0) setViewerIndex(0)
      return
    }
    if (viewerIndex >= viewerItems.length) setViewerIndex(0)
  }, [viewerIndex, viewerItems.length])

  React.useEffect(() => {
    if (!viewerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        closeImageViewer()
        return
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        showPrevImage()
        return
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        showNextImage()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeImageViewer, showNextImage, showPrevImage, viewerOpen])

  const confirmSingleDelete = async () => {
    if (!singleDeleteTarget) return
    setBulkBusy(true)
    const success = await deleteAsset(singleDeleteTarget)
    setBulkBusy(false)
    setSingleDeleteOpen(false)
    if (success) {
      toast("파일을 삭제했습니다.")
    }
    setSingleDeleteTarget(null)
  }

  const downloadAsset = async (asset: FileAsset) => {
    const res = await fetch(scopedUrl(asset.url), { headers: { ...authHeaders() } })
    if (!res.ok) {
      toast("다운로드에 실패했습니다.")
      return false
    }
    const blob = await res.blob()
    const name = getFileName(asset)
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objUrl)
    return true
  }

  const escapeHtmlAttr = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  const copyLink = async (asset: FileAsset) => {
    const isImage = asset.kind === "image" || String(asset.mime || "").startsWith("image/")
    if (isImage) {
      try {
        const canWrite =
          typeof navigator !== "undefined" &&
          !!navigator.clipboard &&
          typeof (navigator.clipboard as unknown as { write?: unknown }).write === "function" &&
          typeof (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined"
        if (!canWrite) throw new Error("CLIPBOARD_HTML_UNSUPPORTED")

        const res = await fetch(scopedUrl(asset.url), { headers: { ...authHeaders() } })
        if (!res.ok) throw new Error("FETCH_FAILED")
        const blob = await res.blob()
        const mime = blob.type || asset.mime || "image/png"
        const url = scopedUrl(asset.url)
        const alt = escapeHtmlAttr(getFileName(asset))
        const html = `<img src="${escapeHtmlAttr(url)}" alt="${alt}" />`
        const ClipboardItemCtor = (globalThis as unknown as { ClipboardItem: typeof ClipboardItem }).ClipboardItem
        const item = new ClipboardItemCtor({
          [mime]: blob,
          "text/plain": new Blob([url], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        })
        await (navigator.clipboard as unknown as { write: (items: ClipboardItem[]) => Promise<void> }).write([item])
        toast("복사되었습니다.")
        return
      } catch {
        // fallback to URL text
      }
    }

    const url = withAuthToken(asset.url, scopeParams)
    try {
      await navigator.clipboard.writeText(url)
      toast("복사되었습니다.")
    } catch {
      toast("복사에 실패했습니다.")
    }
  }

  const bulkDownload = async () => {
    if (!selectedIds.size) return
    setBulkBusy(true)
    try {
      const ids = Array.from(selectedIds)
      const res = await fetch(scopedUrl(`${FILES_API_BASE}/zip`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) {
        toast("선택한 파일 다운로드에 실패했습니다.")
        return
      }
      const blob = await res.blob()
      const cd = String(res.headers.get("content-disposition") || "")
      const match = cd.match(/filename="([^"]+)"/i)
      const filename = match?.[1] || `files_${new Date().toISOString().slice(0, 10)}.zip`
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
      toast(`선택한 ${ids.length}개 파일을 다운로드했습니다.`)
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkDelete = async () => {
    if (!selectedIds.size) return
    setBulkBusy(true)
    const ids = Array.from(selectedIds)
    let ok = 0
    for (const id of ids) {
      const asset = assets.find((a) => a.id === id)
      if (!asset) continue
      const success = await deleteAsset(asset)
      if (success) ok += 1
    }
    setBulkBusy(false)
    setBulkDeleteOpen(false)
    toast(`선택한 ${ok}개 파일을 삭제했습니다.`)
    clearSelection()
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={!selectedIds.size || bulkBusy} onClick={bulkDownload}>
        <Download className="size-4" />
        선택 일괄 다운로드
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!selectedIds.size || bulkBusy}
        onClick={() => setBulkDeleteOpen(true)}
      >
        <Trash2 className="size-4" />
        선택 일괄 삭제
      </Button>
    </div>
  )

  const viewerAsset = viewerItems[viewerIndex]

  return (
    <AppShell
      headerLeftContent={<span className="text-sm font-semibold">{title}</span>}
      headerContent={headerActions}
      bodyClassName="bg-background"
    >
      <div className="flex h-full w-full overflow-hidden">
        <div className="flex-1 h-full overflow-y-auto" ref={scrollRef} onScroll={handleScroll}>
          <div className="mx-auto w-full max-w-[900px] px-6 pb-6 pt-[84px]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "h-6 px-2 rounded-lg border text-xs flex items-center gap-1",
                    favoriteOnly ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground"
                  )}
                  onClick={() => setFavoriteOnly((prev) => !prev)}
                >
                  <Star className="size-3" />
                </button>
                {[
                  { id: "all", label: "전체" },
                  { id: "image", label: "이미지" },
                  { id: "document", label: "문서" },
                  { id: "video", label: "비디오" },
                  { id: "audio", label: "오디오" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "h-6 px-2 rounded-lg border text-xs",
                      kind === item.id ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground"
                    )}
                    onClick={() => setKind(item.id as typeof kind)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="text-sm text-muted-foreground">
                용량 <span className="text-foreground ml-1">{formatBytes(totalBytes)}</span>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">로딩중...</div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground">{emptyLabel}</div>
            ) : (
              <>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((asset) => (
                    <FileAssetCard
                      key={asset.id}
                      asset={asset}
                      selected={selectedIds.has(asset.id)}
                      onToggleSelect={toggleSelect}
                      onCopy={copyLink}
                      onDownload={downloadAsset}
                      onRequestDelete={requestSingleDelete}
                      onToggleFavorite={updateFavorite}
                      onPreviewImage={openImageViewer}
                      favoriteMode="favorite"
                      detailMode="none"
                      authQuery={scopeParams}
                    />
                  ))}
                </div>
                {loadingMore ? <div className="mt-4 text-sm text-muted-foreground">추가로 불러오는 중...</div> : null}
              </>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택한 파일을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>삭제된 파일은 복구할 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>취소</AlertDialogCancel>
            <AlertDialogAction disabled={bulkBusy} onClick={() => void bulkDelete()}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={singleDeleteOpen} onOpenChange={setSingleDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 파일을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>삭제된 파일은 복구할 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>취소</AlertDialogCancel>
            <AlertDialogAction disabled={bulkBusy} onClick={() => void confirmSingleDelete()}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewerOpen && viewerAsset ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={closeImageViewer} />
          <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
            <img
              src={withAuthToken(viewerAsset.url, scopeParams)}
              alt={getFileName(viewerAsset)}
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg shadow-2xl pointer-events-auto"
            />
          </div>
          <button
            type="button"
            className="absolute top-6 right-6 size-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 pointer-events-auto"
            onClick={closeImageViewer}
            aria-label="닫기"
          >
            <X className="size-5" />
          </button>
          {viewerItems.length > 1 ? (
            <button
              type="button"
              className="absolute left-6 top-1/2 -translate-y-1/2 size-11 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 pointer-events-auto"
              onClick={showPrevImage}
              aria-label="이전 이미지"
            >
              <ChevronLeft className="size-6" />
            </button>
          ) : null}
          {viewerItems.length > 1 ? (
            <button
              type="button"
              className="absolute right-6 top-1/2 -translate-y-1/2 size-11 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 pointer-events-auto"
              onClick={showNextImage}
              aria-label="다음 이미지"
            >
              <ChevronRight className="size-6" />
            </button>
          ) : null}
          {viewerItems.length > 1 ? (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-sm pointer-events-none">
              {viewerIndex + 1}/{viewerItems.length}
            </div>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  )
}

export function PersonalFilesPage() {
  return <PageAttachmentsPage scope="user" title="개인 파일" emptyLabel="개인 파일이 없습니다." />
}

export function SharedFilesPage() {
  return <PageAttachmentsPage scope="tenant" title="공유 파일" emptyLabel="공유 파일이 없습니다." />
}
