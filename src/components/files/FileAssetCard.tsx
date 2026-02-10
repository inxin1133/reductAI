import * as React from "react"
import { Download, Trash2, Copy, Star, Pin, Video, Music, FileText, Link2Off, CloudUpload, Brain } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { FileAsset, AssetOriginContext } from "@/components/files/fileAssetUtils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  formatBytes,
  formatDateTime,
  getAssetCategory,
  getAssetLabel,
  getAssetSourceLabel,
  getFileName,
  getModelLabel,
  isOriginalSourceAsset,
  withAuthToken,
} from "@/components/files/fileAssetUtils"

type DetailMode = "none" | "model" | "expires"
type FavoriteMode = "none" | "favorite" | "pin"

type FileAssetCardProps = {
  asset: FileAsset
  selected: boolean
  onToggleSelect: (id: string) => void
  onCopy: (asset: FileAsset) => void
  onDownload: (asset: FileAsset) => void
  onRequestDelete: (asset: FileAsset) => void
  onToggleFavorite?: (asset: FileAsset) => void
  onTogglePin?: (asset: FileAsset) => void
  onPreviewImage?: (asset: FileAsset) => void
  detailMode?: DetailMode
  favoriteMode?: FavoriteMode
  authQuery?: Record<string, string | undefined>
  originContext?: AssetOriginContext
}

export function FileAssetCard({
  asset,
  selected,
  onToggleSelect,
  onCopy,
  onDownload,
  onRequestDelete,
  onToggleFavorite,
  onTogglePin,
  onPreviewImage,
  detailMode = "none",
  favoriteMode = "none",
  authQuery,
  originContext,
}: FileAssetCardProps) {
  const [previewError, setPreviewError] = React.useState(false)
  const category = getAssetCategory(asset)
  const isMissing = Boolean(asset.is_missing)
  const showBroken = isMissing || previewError
  const isAttachmentSource = asset.source_type === "attachment" || asset.source_type === "post_upload"
  const canDelete = isOriginalSourceAsset(asset, originContext)
  const canCopy = !isAttachmentSource && typeof onCopy === "function"
  const canFavorite = favoriteMode === "favorite" && typeof onToggleFavorite === "function"
  const canPin = favoriteMode === "pin" && typeof onTogglePin === "function"
  const linkedPages = Array.isArray(asset.linked_posts) ? asset.linked_posts : []
  const primaryLink = linkedPages[0]
  const remainingLinks = linkedPages.slice(1)
  const shouldShowPath = originContext === "page" && linkedPages.length > 0 && category === "image"
  const pageTitle = (title?: string | null) => (String(title || "").trim() ? String(title).trim() : "제목 없음")

  const preview = () => {
    if (showBroken) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Link2Off className="size-8" />
          <span className="text-xs">원본 삭제됨</span>
        </div>
      )
    }
    if (category === "image") {
      return (
        <img
          alt={getFileName(asset)}
          src={withAuthToken(asset.url, authQuery)}
          className="absolute inset-0 size-full object-cover rounded-md cursor-zoom-in"
          onError={() => setPreviewError(true)}
          onClick={() => onPreviewImage?.(asset)}
        />
      )
    }
    const iconClass = "size-8 text-muted-foreground"
    if (category === "video") return <Video className={iconClass} />
    if (category === "audio") return <Music className={iconClass} />
    return <FileText className={iconClass} />
  }

  const detailRow = (() => {
    if (detailMode === "model") {
      return (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">모델</span>
          <span className="flex-1 truncate text-foreground">{getModelLabel(asset)}</span>
        </div>
      )
    }
    if (detailMode === "expires") {
      return (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">자동삭제일</span>
          <span className="flex-1 truncate text-foreground">{formatDateTime(asset.expires_at)}</span>
        </div>
      )
    }
    return null
  })()

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-xl p-4 flex flex-col gap-4 shadow-xs",
        selected && "ring-2 ring-primary/30"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-base font-bold text-card-foreground">
            {isAttachmentSource ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <CloudUpload className="size-4 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>첨부 파일</p>
                </TooltipContent>
              </Tooltip>
            ) : asset.source_type === "ai_generated" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Brain className="size-4 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>AI 생성 파일</p>
                </TooltipContent>
              </Tooltip>
            ) : null}
            <span>{getAssetLabel(asset)}</span>
          </div>
          <div className="text-sm text-muted-foreground">{formatDateTime(asset.created_at)}</div>
        </div>
        <div className="flex items-center gap-2">
          {canFavorite ? (
            <button
              type="button"
              className="p-1 rounded-md hover:bg-accent"
              onClick={() => onToggleFavorite?.(asset)}
              aria-label="즐겨찾기"
            >
              <Star
                className={cn(
                  "size-4",
                  asset.is_favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"
                )}
              />
            </button>
          ) : null}
          {canPin ? (
            <button
              type="button"
              className="p-1 rounded-md hover:bg-accent"
              onClick={() => onTogglePin?.(asset)}
              aria-label="핀 고정"
            >
              <Pin className={cn("size-4", asset.is_pinned ? "text-blue-500 fill-blue-500" : "text-muted-foreground")} />
            </button>
          ) : null}
          <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(asset.id)} />
        </div>
      </div>

      <div className="relative w-full aspect-square rounded-md bg-muted flex items-center justify-center">{preview()}</div>

      <div className="flex flex-col gap-2 text-sm">
        {shouldShowPath ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">경로</span>
            <div className="flex-1 truncate text-foreground flex items-center gap-2">
              {primaryLink ? (
                <a className="truncate hover:underline" href={`/posts/${primaryLink.id}/edit`}>
                  {pageTitle(primaryLink.title)}
                </a>
              ) : (
                <span>-</span>
              )}
              {remainingLinks.length > 0 ? (
                <>
                  <span className="text-muted-foreground">… 외 </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:underline">
                        {remainingLinks.length}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64">
                      <div className="flex flex-col gap-1 text-sm">
                        {remainingLinks.map((p) => (
                          <a key={p.id} className="truncate hover:underline" href={`/posts/${p.id}/edit`}>
                            {pageTitle(p.title)}
                          </a>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">이름</span>
          <span className="flex-1 truncate text-foreground">{getFileName(asset)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">용량</span>
          <span className="flex-1 truncate text-foreground">{formatBytes(asset.bytes)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">출처</span>
          <span className="flex-1 truncate text-foreground">{getAssetSourceLabel(asset, originContext)}</span>
        </div>
        {detailRow}
      </div>

      <div className="flex items-center gap-2">
        {canCopy ? (
          <button
            type="button"
            className="size-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-accent"
            onClick={() => onCopy(asset)}
            aria-label="복사"
          >
            <Copy className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          className="size-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-accent"
          onClick={() => onDownload(asset)}
          aria-label="다운로드"
        >
          <Download className="size-4" />
        </button>
        {canDelete ? (
          <button
            type="button"
            className="size-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-accent"
            onClick={() => onRequestDelete(asset)}
            aria-label="삭제"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
