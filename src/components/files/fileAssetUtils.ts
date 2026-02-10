export type FileAsset = {
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
  status?: string | null
  metadata?: Record<string, unknown>
  is_favorite?: boolean
  is_pinned?: boolean
  is_missing?: boolean
  model_api_id?: string | null
  model_display_name?: string | null
  provider_slug?: string | null
  provider_key?: string | null
  provider_name?: string | null
  provider_product_name?: string | null
}

export const formatBytes = (bytes: number) => {
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

export const formatDateTime = (raw?: string | null) => {
  if (!raw) return "-"
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return "-"
  const pad = (v: number) => String(v).padStart(2, "0")
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

export const appendQueryParams = (url: string, extra?: Record<string, string | undefined>) => {
  if (!extra || Object.keys(extra).length === 0) return url
  const [base, query = ""] = url.split("?")
  const params = new URLSearchParams(query)
  for (const [key, value] of Object.entries(extra)) {
    if (!key) continue
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export const withAuthToken = (url: string, extra?: Record<string, string | undefined>) => {
  let token = ""
  try {
    token = localStorage.getItem("token") || ""
  } catch {
    token = ""
  }
  const merged = { ...(extra || {}), ...(token ? { token } : {}) }
  return appendQueryParams(url, merged)
}

export const getAssetCategory = (asset: FileAsset) => {
  if (asset.kind === "image") return "image"
  if (asset.kind === "video") return "video"
  if (asset.kind === "audio") return "audio"
  const mime = String(asset.mime || "")
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  return "document"
}

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
}

export const detectImageMimeFromBytes = (bytes: Uint8Array) => {
  if (bytes.length >= 12) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png"
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg"
    }
    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61
    ) {
      return "image/gif"
    }
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp"
    }
  }
  try {
    const head = new TextDecoder().decode(bytes).toLowerCase()
    if (head.includes("<svg")) return "image/svg+xml"
  } catch {
    // ignore
  }
  return ""
}

export const inferImageMimeFromFilename = (name?: string | null) => {
  const raw = String(name || "").trim()
  if (!raw) return ""
  const lower = raw.toLowerCase()
  const ext = lower.split(".").pop() || ""
  return IMAGE_EXT_TO_MIME[ext] || ""
}

export const isImageAsset = (asset: FileAsset) => {
  if (asset.kind === "image") return true
  const mime = String(asset.mime || "").toLowerCase()
  if (mime.startsWith("image/")) return true
  return Boolean(inferImageMimeFromFilename(asset.original_filename))
}

export const getAssetLabel = (asset: FileAsset) => {
  const category = getAssetCategory(asset)
  if (category === "image") return "이미지"
  if (category === "video") return "비디오"
  if (category === "audio") return "오디오"
  return "문서"
}

export const getModelLabel = (asset: FileAsset) => {
  const base = (asset.model_display_name || asset.model_api_id || "").trim()
  if (!base) return "-"
  const provider =
    String(asset.provider_product_name || asset.provider_name || asset.provider_slug || asset.provider_key || "").trim() || ""
  return provider ? `${base} (${provider})` : base
}

export const getAssetSourceLabel = (asset: FileAsset) => {
  const metaSource = typeof asset.metadata?.source === "string" ? asset.metadata.source.trim() : ""
  const metaSourceLower = metaSource.toLowerCase()
  if (metaSource === "원본" || metaSourceLower === "original") return "출처: 원본"
  if (asset.source_type === "external_link") return "출처: 원본"
  if (asset.source_type === "post_upload") return "출처: 페이지 직접 파일 첨부"
  if (asset.source_type === "ai_generated") return "출처: 생성 파일 > AI 생성 파일"
  if (asset.source_type === "attachment") return "출처: 생성 파일 > 첨부 파일"
  return "출처: -"
}

export const getFileName = (asset: FileAsset) => {
  const raw = String(asset.original_filename || "").trim()
  if (raw) return raw
  const ext = String(asset.mime || "").split("/")[1] || "bin"
  return `file_${asset.id}.${ext}`
}
