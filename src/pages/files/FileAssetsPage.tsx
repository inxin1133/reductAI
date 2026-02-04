import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Download, Trash2, Copy, Star, Pin, Video, Music, FileText } from "lucide-react"
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

type FileAsset = {
  id: string
  url: string
  source_type: "ai_generated" | "attachment" | "post_upload" | "external_link" | "profile_image"
  kind: "image" | "audio" | "video" | "file"
  mime: string | null
  bytes: number
  original_filename: string | null
  expires_at: string | null
  created_at: string | null
  updated_at: string | null
  is_favorite?: boolean
  is_pinned?: boolean
  model_api_id?: string | null
  model_display_name?: string | null
  provider_slug?: string | null
  provider_key?: string | null
  provider_name?: string | null
  provider_product_name?: string | null
}

const FILES_API_BASE = "/api/ai/media/assets"
const PAGE_SIZE = 24

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let idx = 0
  let value = bytes
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${rounded}${units[idx]}`
}

const formatDateTime = (raw?: string | null) => {
  if (!raw) return "-"
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return "-"
  const pad = (v: number) => String(v).padStart(2, "0")
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const withAuthToken = (url: string) => {
  const token = localStorage.getItem("token")
  if (!token) return url
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}token=${encodeURIComponent(token)}`
}

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem("token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const getAssetCategory = (asset: FileAsset) => {
  if (asset.kind === "image") return "image"
  if (asset.kind === "video") return "video"
  if (asset.kind === "audio") return "audio"
  const mime = String(asset.mime || "")
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  return "document"
}

const getAssetLabel = (asset: FileAsset) => {
  const category = getAssetCategory(asset)
  if (category === "image") return "이미지"
  if (category === "video") return "비디오"
  if (category === "audio") return "오디오"
  return "문서"
}

const getModelLabel = (asset: FileAsset) => {
  const base = (asset.model_display_name || asset.model_api_id || "").trim()
  if (!base) return "-"
  const provider =
    String(asset.provider_product_name || asset.provider_name || asset.provider_slug || asset.provider_key || "").trim() || ""
  return provider ? `${base} (${provider})` : base
}

const getFileName = (asset: FileAsset) => {
  const raw = String(asset.original_filename || "").trim()
  if (raw) return raw
  const ext = String(asset.mime || "").split("/")[1] || "bin"
  return `file_${asset.id}.${ext}`
}

type AssetCardProps = {
  asset: FileAsset
  selected: boolean
  onToggleSelect: (id: string) => void
  onCopy: (asset: FileAsset) => void
  onDownload: (asset: FileAsset) => void
  onRequestDelete: (asset: FileAsset) => void
  onToggleFavorite: (asset: FileAsset) => void
  onTogglePin: (asset: FileAsset) => void
}

function AssetCard({
  asset,
  selected,
  onToggleSelect,
  onCopy,
  onDownload,
  onRequestDelete,
  onToggleFavorite,
  onTogglePin,
}: AssetCardProps) {
  const [previewError, setPreviewError] = React.useState(false)
  const category = getAssetCategory(asset)

  const preview = () => {
    if (category === "image" && !previewError) {
      return (
        <img
          alt={getFileName(asset)}
          src={withAuthToken(asset.url)}
          className="absolute inset-0 size-full object-cover rounded-md"
          onError={() => setPreviewError(true)}
        />
      )
    }
    const iconClass = "size-8 text-muted-foreground"
    if (category === "video") return <Video className={iconClass} />
    if (category === "audio") return <Music className={iconClass} />
    return <FileText className={iconClass} />
  }

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-xl p-4 flex flex-col gap-4 shadow-xs",
        selected && "ring-2 ring-primary/30"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="text-base font-bold text-card-foreground">{getAssetLabel(asset)}</div>
          <div className="text-sm text-muted-foreground">{formatDateTime(asset.created_at)}</div>
        </div>
        <div className="flex items-center gap-2">
          {asset.source_type === "ai_generated" ? (
            <button
              type="button"
              className="p-1 rounded-md hover:bg-accent"
              onClick={() => onToggleFavorite(asset)}
              aria-label="즐겨찾기"
            >
              <Star
                className={cn(
                  "size-4",
                  asset.is_favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"
                )}
              />
            </button>
          ) : (
            <button
              type="button"
              className="p-1 rounded-md hover:bg-accent"
              onClick={() => onTogglePin(asset)}
              aria-label="핀 고정"
            >
              <Pin className={cn("size-4", asset.is_pinned ? "text-blue-500 fill-blue-500" : "text-muted-foreground")} />
            </button>
          )}
          <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(asset.id)} />
        </div>
      </div>

      <div className="relative w-full aspect-square rounded-md bg-muted flex items-center justify-center">
        {preview()}
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">이름</span>
          <span className="flex-1 truncate text-foreground">{getFileName(asset)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">용량</span>
          <span className="flex-1 truncate text-foreground">{formatBytes(asset.bytes)}</span>
        </div>
        {asset.source_type === "ai_generated" ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">모델</span>
            <span className="flex-1 truncate text-foreground">{getModelLabel(asset)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">자동삭제일</span>
            <span className="flex-1 truncate text-foreground">{formatDateTime(asset.expires_at)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="size-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-accent"
          onClick={() => onCopy(asset)}
          aria-label="복사"
        >
          <Copy className="size-4" />
        </button>
        <button
          type="button"
          className="size-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-accent"
          onClick={() => onDownload(asset)}
          aria-label="다운로드"
        >
          <Download className="size-4" />
        </button>
        <button
          type="button"
          className="size-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-accent"
          onClick={() => onRequestDelete(asset)}
          aria-label="삭제"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  )
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

  const copyLink = async (asset: FileAsset) => {
    try {
      if (asset.kind === "image" || String(asset.mime || "").startsWith("image/")) {
        const canWriteImage =
          typeof navigator !== "undefined" &&
          !!navigator.clipboard &&
          typeof (navigator.clipboard as unknown as { write?: unknown }).write === "function" &&
          typeof (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined"
        if (!canWriteImage) throw new Error("CLIPBOARD_IMAGE_UNSUPPORTED")

        const res = await fetch(asset.url, { headers: { ...authHeaders() } })
        if (!res.ok) throw new Error("FETCH_FAILED")
        const blob = await res.blob()
        const mime = blob.type || asset.mime || "image/png"
        const ClipboardItemCtor = (globalThis as unknown as { ClipboardItem: typeof ClipboardItem }).ClipboardItem
        const item = new ClipboardItemCtor({ [mime]: blob })
        await (navigator.clipboard as unknown as { write: (items: ClipboardItem[]) => Promise<void> }).write([item])
        toast("복사되었습니다.")
        return
      }
    } catch {
      // fallback to URL text
    }

    const url = withAuthToken(asset.url)
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
    let ok = 0
    for (const id of activeSelected) {
      const asset = activeList.find((a) => a.id === id)
      if (!asset) continue
      const success = await downloadAsset(asset)
      if (success) ok += 1
    }
    setBulkBusy(false)
    toast(`선택한 ${ok}개 파일을 다운로드했습니다.`)
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
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        selected={activeSelected.has(asset.id)}
                        onToggleSelect={toggleSelect}
                        onCopy={copyLink}
                        onDownload={downloadAsset}
                        onRequestDelete={requestSingleDelete}
                        onToggleFavorite={updateFavorite}
                        onTogglePin={updatePin}
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
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        selected={activeSelected.has(asset.id)}
                        onToggleSelect={toggleSelect}
                        onCopy={copyLink}
                        onDownload={downloadAsset}
                        onRequestDelete={requestSingleDelete}
                        onToggleFavorite={updateFavorite}
                        onTogglePin={updatePin}
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
      </AppShell>
    </Tabs>
  )
}
