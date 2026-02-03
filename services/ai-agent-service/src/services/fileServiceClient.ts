import crypto from "crypto"

type MediaKind = "image" | "audio" | "video" | "file"
type FileSourceType = "ai_generated" | "attachment" | "post_upload" | "external_link" | "profile_image"

const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL || "http://localhost:3008"

export function newAssetId() {
  return crypto.randomUUID()
}

export async function storeImageDataUrlAsAsset(args: {
  conversationId: string
  messageId: string
  assetId: string
  dataUrl: string
  index: number
  kind?: MediaKind
  sourceType?: FileSourceType
  authHeader?: string
}): Promise<{ assetId: string; url: string; mime: string; bytes: number; sha256: string; storageKey: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const authHeader = (args.authHeader || "").trim()
  if (authHeader) headers.Authorization = authHeader

  const res = await fetch(`${FILE_SERVICE_URL}/api/ai/media/assets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      conversation_id: args.conversationId,
      message_id: args.messageId,
      asset_id: args.assetId,
      data_url: args.dataUrl,
      index: args.index,
      kind: args.kind,
      source_type: args.sourceType,
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof json?.message === "string" ? json.message : JSON.stringify(json)
    throw new Error(`FILE_SERVICE_HTTP_${res.status}:${detail}`)
  }

  const assetId = String((json as any)?.assetId || (json as any)?.asset_id || "")
  const url = String((json as any)?.url || "")
  if (!assetId || !url) {
    throw new Error(`FILE_SERVICE_INVALID_RESPONSE:${JSON.stringify(json)}`)
  }

  return {
    assetId,
    url,
    mime: String((json as any)?.mime || ""),
    bytes: Number((json as any)?.bytes || 0),
    sha256: String((json as any)?.sha256 || ""),
    storageKey: String((json as any)?.storageKey || (json as any)?.storage_key || ""),
  }
}
