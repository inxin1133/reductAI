import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Download, Trash2, Star, Pin, ChevronLeft, ChevronRight, X } from "lucide-react"
import { FileAssetCard } from "@/components/files/FileAssetCard"
import type { FileAsset } from "@/components/files/fileAssetUtils"
import {
  formatBytes,
  getAssetCategory,
  getFileName,
  detectImageMimeFromBytes,
  inferImageMimeFromFilename,
  isImageAsset,
  withAuthToken,
} from "@/components/files/fileAssetUtils"
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

const FILES_API_BASE = "/api/ai/media/assets"
const PAGE_SIZE = 24

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}


export default function FileAssetsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = String(searchParams.get("type") || "ai")
  const tab = tabParam === "attachment" ? "attachment" : "ai"

  const [aiAssets, setAiAssets] = React.useState<FileAsset[]>([])
  const [attachmentAssets, setAttachmentAssets] = React.useState<FileAsset[]>([])
  const [aiLoading, setAiLoading] = React.useState(false)
  const [attachmentLoading, setAttachmentLoading] = React.useState(false)
  const [aiLoadingMore, setAiLoadingMore] = React.useState(false)
  const [attachmentLoadingMore, setAttachmentLoadingMore] = React.useState(false)
  const [aiOffset, setAiOffset] = React.useState(0)
  const [attachmentOffset, setAttachmentOffset] = React.useState(0)
  const [aiHasMore, setAiHasMore] = React.useState(true)
  const [attachmentHasMore, setAttachmentHasMore] = React.useState(true)
  const [aiTotalBytes, setAiTotalBytes] = React.useState(0)
  const [attachmentTotalBytes, setAttachmentTotalBytes] = React.useState(0)

  const [aiKind, setAiKind] = React.useState<"all" | "image" | "video" | "audio">("all")
  const [aiFavoriteOnly, setAiFavoriteOnly] = React.useState(false)
  const [attachmentKind, setAttachmentKind] = React.useState<"all" | "image" | "video" | "audio" | "document">("all")
  const [attachmentPinnedOnly, setAttachmentPinnedOnly] = React.useState(false)

  const [selectedAiIds, setSelectedAiIds] = React.useState<Set<string>>(new Set())
  const [selectedAttachmentIds, setSelectedAttachmentIds] = React.useState<Set<string>>(new Set())
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
    async (sourceType: "ai_generated" | "attachment", offset: number, limit = PAGE_SIZE) => {
      const res = await fetch(
        `${FILES_API_BASE}?source_type=${encodeURIComponent(sourceType)}&limit=${limit}&offset=${offset}`,
        {
          headers: { ...authHeaders() },
        }
      )
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
    []
  )

  const refreshAi = React.useCallback(async () => {
    setAiLoading(true)
    try {
      const { items, totalBytes, totalCount } = await fetchAssetsPage("ai_generated", 0)
      setAiAssets(items)
      setAiTotalBytes(totalBytes)
      setAiOffset(items.length)
      setAiHasMore(items.length < totalCount)
    } catch {
      setAiAssets([])
      setAiTotalBytes(0)
      setAiOffset(0)
      setAiHasMore(false)
    } finally {
      setAiLoading(false)
    }
  }, [fetchAssetsPage])

  const refreshAttachment = React.useCallback(async () => {
    setAttachmentLoading(true)
    try {
      const { items, totalBytes, totalCount } = await fetchAssetsPage("attachment", 0)
      setAttachmentAssets(items)
      setAttachmentTotalBytes(totalBytes)
      setAttachmentOffset(items.length)
      setAttachmentHasMore(items.length < totalCount)
    } catch {
      setAttachmentAssets([])
      setAttachmentTotalBytes(0)
      setAttachmentOffset(0)
      setAttachmentHasMore(false)
    } finally {
      setAttachmentLoading(false)
    }
  }, [fetchAssetsPage])

  React.useEffect(() => {
    void refreshAi()
    void refreshAttachment()
  }, [refreshAi, refreshAttachment])

  const aiFiltered = React.useMemo(() => {
    let list = aiAssets
    if (aiFavoriteOnly) list = list.filter((a) => Boolean(a.is_favorite))
    if (aiKind !== "all") {
      list = list.filter((a) => getAssetCategory(a) === aiKind)
    }
    return list
  }, [aiAssets, aiFavoriteOnly, aiKind])

  const attachmentFiltered = React.useMemo(() => {
    let list = attachmentAssets
    if (attachmentPinnedOnly) list = list.filter((a) => Boolean(a.is_pinned))
    if (attachmentKind !== "all") {
      list = list.filter((a) => getAssetCategory(a) === attachmentKind)
    }
    return list
  }, [attachmentAssets, attachmentKind, attachmentPinnedOnly])

  const activeList = tab === "ai" ? aiFiltered : attachmentFiltered
  const activeSelected = tab === "ai" ? selectedAiIds : selectedAttachmentIds
  const setActiveSelected = tab === "ai" ? setSelectedAiIds : setSelectedAttachmentIds
  const totalBytes = tab === "ai" ? aiTotalBytes : attachmentTotalBytes

  const setTab = (next: "ai" | "attachment") => {
    setSearchParams((prev) => {
      const np = new URLSearchParams(prev)
      np.set("type", next)
      return np
    })
  }

  const loadMoreAi = React.useCallback(async () => {
    if (aiLoadingMore || !aiHasMore) return
    setAiLoadingMore(true)
    try {
      const { items, totalBytes, totalCount } = await fetchAssetsPage("ai_generated", aiOffset)
      setAiAssets((prev) => [...prev, ...items])
      setAiTotalBytes(totalBytes)
      const nextOffset = aiOffset + items.length
      setAiOffset(nextOffset)
      setAiHasMore(nextOffset < totalCount)
    } catch {
      setAiHasMore(false)
    } finally {
      setAiLoadingMore(false)
    }
  }, [aiHasMore, aiLoadingMore, aiOffset, fetchAssetsPage])

  const loadMoreAttachment = React.useCallback(async () => {
    if (attachmentLoadingMore || !attachmentHasMore) return
    setAttachmentLoadingMore(true)
    try {
      const { items, totalBytes, totalCount } = await fetchAssetsPage("attachment", attachmentOffset)
      setAttachmentAssets((prev) => [...prev, ...items])
      setAttachmentTotalBytes(totalBytes)
      const nextOffset = attachmentOffset + items.length
      setAttachmentOffset(nextOffset)
      setAttachmentHasMore(nextOffset < totalCount)
    } catch {
      setAttachmentHasMore(false)
    } finally {
      setAttachmentLoadingMore(false)
    }
  }, [attachmentHasMore, attachmentLoadingMore, attachmentOffset, fetchAssetsPage])

  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 240
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      if (tab === "ai") void loadMoreAi()
      else void loadMoreAttachment()
    }
  }, [loadMoreAi, loadMoreAttachment, tab])

  const toggleSelect = (id: string) => {
    setActiveSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedAiIds(new Set())
    setSelectedAttachmentIds(new Set())
  }

  const updateFavorite = async (asset: FileAsset) => {
    const res = await fetch(`${FILES_API_BASE}/${asset.id}/favorite`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ favorite: !asset.is_favorite }),
    })
    if (!res.ok) {
      toast("즐겨찾기 설정에 실패했습니다.")
      return
    }
    setAiAssets((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, is_favorite: !asset.is_favorite } : a))
    )
  }

  const updatePin = async (asset: FileAsset) => {
    const res = await fetch(`${FILES_API_BASE}/${asset.id}/pin`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ pinned: !asset.is_pinned }),
    })
    const json: { message?: string; expires_at?: string | null } | null = await res
      .json()
      .catch(() => null)
    if (!res.ok) {
      const msg = json?.message ? String(json.message) : "핀 설정에 실패했습니다."
      toast(msg)
      return
    }
    setAttachmentAssets((prev) =>
      prev.map((a) => {
        if (a.id !== asset.id) return a
        const nextExpiresAt =
          json && Object.prototype.hasOwnProperty.call(json, "expires_at") ? json.expires_at ?? null : a.expires_at
        return { ...a, is_pinned: !asset.is_pinned, expires_at: nextExpiresAt }
      })
    )
  }

  const deleteAsset = async (asset: FileAsset) => {
    const res = await fetch(`${FILES_API_BASE}/${asset.id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    })
    if (!res.ok) {
      toast("파일 삭제에 실패했습니다.")
      return false
    }
    if (asset.source_type === "ai_generated") {
      setAiAssets((prev) => prev.filter((a) => a.id !== asset.id))
      setSelectedAiIds((prev) => {
        const next = new Set(prev)
        next.delete(asset.id)
        return next
      })
    } else {
      setAttachmentAssets((prev) => prev.filter((a) => a.id !== asset.id))
      setSelectedAttachmentIds((prev) => {
        const next = new Set(prev)
        next.delete(asset.id)
        return next
      })
    }
    return true
  }

  const requestSingleDelete = (asset: FileAsset) => {
    setSingleDeleteTarget(asset)
    setSingleDeleteOpen(true)
  }

  const openImageViewer = React.useCallback(
    (asset: FileAsset) => {
      if (getAssetCategory(asset) !== "image") return
      const sourceList = tab === "attachment" ? attachmentFiltered : aiFiltered
      const images = sourceList.filter((item) => getAssetCategory(item) === "image")
      if (!images.length) return
      const idx = images.findIndex((item) => item.id === asset.id)
      setViewerItems(images)
      setViewerIndex(idx >= 0 ? idx : 0)
      setViewerOpen(true)
    },
    [aiFiltered, attachmentFiltered, tab]
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
    const res = await fetch(asset.url, { headers: { ...authHeaders() } })
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

  const buildImageClipboardItem = async (asset: FileAsset, url: string) => {
    const res = await fetch(url, { headers: { ...authHeaders() } })
    if (!res.ok) throw new Error("FETCH_FAILED")
    const headerType = String(res.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase()
    const blob = await res.blob()
    const inferred = inferImageMimeFromFilename(asset.original_filename)
    const assetMime = String(asset.mime || "").trim().toLowerCase()
    let mime =
      (headerType.startsWith("image/") && headerType) ||
      (String(blob.type || "").toLowerCase().startsWith("image/") ? blob.type : "") ||
      (assetMime.startsWith("image/") ? assetMime : "") ||
      inferred
    if (!String(mime || "").startsWith("image/")) {
      const headBytes = new Uint8Array(await blob.slice(0, 64).arrayBuffer())
      const sniffed = detectImageMimeFromBytes(headBytes)
      if (sniffed) mime = sniffed
    }
    if (!String(mime || "").startsWith("image/") && isImageAsset(asset)) {
      mime = "image/png"
    }
    if (!String(mime || "").startsWith("image/")) return null
    const blobForClipboard = blob.type && blob.type === mime ? blob : blob.slice(0, blob.size, mime)
    const alt = escapeHtmlAttr(getFileName(asset))
    const html = `<img src="${escapeHtmlAttr(url)}" alt="${alt}" />`
    const ClipboardItemCtor = (globalThis as unknown as { ClipboardItem: typeof ClipboardItem }).ClipboardItem
    return new ClipboardItemCtor({
      [mime]: blobForClipboard,
      "text/html": new Blob([html], { type: "text/html" }),
    })
  }

  const copyLink = async (asset: FileAsset) => {
    const isImage = isImageAsset(asset)
    const preferBinaryOnly = tab === "attachment"
    const shouldTryImage = isImage || (preferBinaryOnly && asset.source_type === "attachment")
    if (shouldTryImage) {
      try {
        const url = asset.url
        const item = await buildImageClipboardItem(asset, url)
        if (item) {
          const canWrite =
            typeof navigator !== "undefined" &&
            !!navigator.clipboard &&
            typeof (navigator.clipboard as unknown as { write?: unknown }).write === "function" &&
            typeof (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined"
          if (!canWrite) throw new Error("CLIPBOARD_HTML_UNSUPPORTED")
          await (navigator.clipboard as unknown as { write: (items: ClipboardItem[]) => Promise<void> }).write([item])
          toast("복사되었습니다.")
          return
        }
      } catch (err) {
        if (preferBinaryOnly && isImage) {
          toast("이미지 복사에 실패했습니다.")
          return
        }
        if (preferBinaryOnly && String((err as Error)?.message || "") === "CLIPBOARD_HTML_UNSUPPORTED") {
          toast("이미지 복사는 HTTPS 환경에서만 지원됩니다.")
          return
        }
      }
    }

    const url = asset.url
    try {
      await navigator.clipboard.writeText(url)
      toast("복사되었습니다.")
    } catch {
      toast("복사에 실패했습니다.")
    }
  }

  const bulkDownload = async () => {
    if (!activeSelected.size) return
    setBulkBusy(true)
    try {
      const ids = Array.from(activeSelected)
      const res = await fetch(`${FILES_API_BASE}/zip`, {
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
    if (!activeSelected.size) return
    setBulkBusy(true)
    const ids = Array.from(activeSelected)
    let ok = 0
    for (const id of ids) {
      const asset = activeList.find((a) => a.id === id)
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
      <Button variant="outline" size="sm" disabled={!activeSelected.size || bulkBusy} onClick={bulkDownload}>
        <Download className="size-4" />
        선택 일괄 다운로드
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!activeSelected.size || bulkBusy}
        onClick={() => setBulkDeleteOpen(true)}
      >
        <Trash2 className="size-4" />
        선택 일괄 삭제
      </Button>
    </div>
  )

  const headerMenu = (
    <TabsList className="bg-muted/80">
      <TabsTrigger value="ai">AI 생성 파일</TabsTrigger>
      <TabsTrigger value="attachment">첨부 파일</TabsTrigger>
    </TabsList>
  )

  const viewerAsset = viewerItems[viewerIndex]

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v === "attachment" ? "attachment" : "ai")}>
      <AppShell headerLeftContent={headerMenu} headerContent={headerActions} bodyClassName="bg-background">
      <div className="flex h-full w-full overflow-hidden">
        <div className="flex-1 h-full overflow-y-auto" ref={scrollRef} onScroll={handleScroll}>
          <div className="mx-auto w-full max-w-[900px] px-6 pb-6 pt-[84px]">
            <TabsContent value="ai">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      "h-6 px-2 rounded-lg border text-xs flex items-center gap-1",
                      aiFavoriteOnly ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground"
                    )}
                    onClick={() => setAiFavoriteOnly((prev) => !prev)}
                  >
                    <Star className="size-3" />
                  </button>
                  {[
                    { id: "all", label: "전체" },
                    { id: "image", label: "이미지" },
                    { id: "video", label: "비디오" },
                    { id: "audio", label: "오디오" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "h-6 px-2 rounded-lg border text-xs",
                        aiKind === item.id ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground"
                      )}
                      onClick={() => setAiKind(item.id as typeof aiKind)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">
                  용량 <span className="text-foreground ml-1">{formatBytes(totalBytes)}</span>
                </div>
              </div>

              {aiLoading ? (
                <div className="text-sm text-muted-foreground">로딩중...</div>
              ) : aiFiltered.length === 0 ? (
                <div className="text-sm text-muted-foreground">AI 생성 파일이 없습니다.</div>
              ) : (
                <>
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                    {aiFiltered.map((asset) => (
                      <FileAssetCard
                        key={asset.id}
                        asset={asset}
                        selected={activeSelected.has(asset.id)}
                        onToggleSelect={toggleSelect}
                        onCopy={copyLink}
                        onDownload={downloadAsset}
                        onRequestDelete={requestSingleDelete}
                        onToggleFavorite={updateFavorite}
                        onTogglePin={updatePin}
                        onPreviewImage={openImageViewer}
                        favoriteMode="favorite"
                        detailMode="model"
                      />
                    ))}
                  </div>
                  {aiLoadingMore ? (
                    <div className="mt-4 text-sm text-muted-foreground">추가로 불러오는 중...</div>
                  ) : null}
                </>
              )}
            </TabsContent>

            <TabsContent value="attachment">
              <div className="mb-3 text-sm text-muted-foreground">
                첨부파일은 15일 후 자동삭제됩니다. 삭제를 원치 않는 파일은 핀고정을 해두시면 파일이 유지됩니다.
              </div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      "h-6 px-2 rounded-lg border text-xs flex items-center gap-1",
                      attachmentPinnedOnly
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground"
                    )}
                    onClick={() => setAttachmentPinnedOnly((prev) => !prev)}
                  >
                    <Pin className="size-3" />
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
                        attachmentKind === item.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground"
                      )}
                      onClick={() => setAttachmentKind(item.id as typeof attachmentKind)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">
                  용량 <span className="text-foreground ml-1">{formatBytes(totalBytes)}</span>
                </div>
              </div>

              {attachmentLoading ? (
                <div className="text-sm text-muted-foreground">로딩중...</div>
              ) : attachmentFiltered.length === 0 ? (
                <div className="text-sm text-muted-foreground">첨부 파일이 없습니다.</div>
              ) : (
                <>
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                    {attachmentFiltered.map((asset) => (
                      <FileAssetCard
                        key={asset.id}
                        asset={asset}
                        selected={activeSelected.has(asset.id)}
                        onToggleSelect={toggleSelect}
                        onCopy={copyLink}
                        onDownload={downloadAsset}
                        onRequestDelete={requestSingleDelete}
                        onToggleFavorite={updateFavorite}
                        onTogglePin={updatePin}
                        onPreviewImage={openImageViewer}
                        favoriteMode="pin"
                        detailMode="expires"
                      />
                    ))}
                  </div>
                  {attachmentLoadingMore ? (
                    <div className="mt-4 text-sm text-muted-foreground">추가로 불러오는 중...</div>
                  ) : null}
                </>
              )}
            </TabsContent>
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
              src={withAuthToken(viewerAsset.url)}
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
    </Tabs>
  )
}
