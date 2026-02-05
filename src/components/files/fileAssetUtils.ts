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
  is_favorite?: boolean
  is_pinned?: boolean
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

export const getFileName = (asset: FileAsset) => {
  const raw = String(asset.original_filename || "").trim()
  if (raw) return raw
  const ext = String(asset.mime || "").split("/")[1] || "bin"
  return `file_${asset.id}.${ext}`
}
