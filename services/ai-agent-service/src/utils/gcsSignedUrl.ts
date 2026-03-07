/**
 * GCS gs:// URI를 브라우저 재생 가능한 signed URL로 변환합니다.
 * Vertex AI Veo 등이 반환하는 gcsUri는 브라우저에서 직접 재생할 수 없으므로 변환이 필요합니다.
 */
import { Storage } from "@google-cloud/storage"

const SIGNED_URL_EXPIRY_MS = 60 * 60 * 1000 // 1시간

/**
 * gs://bucket/path 형식의 URI를 signed URL로 변환합니다.
 * @param gcsUri - gs://bucket-name/path/to/file 형식
 * @returns HTTPS signed URL 또는 null (실패 시)
 */
export async function gcsUriToSignedUrl(gcsUri: string): Promise<string | null> {
  const trimmed = typeof gcsUri === "string" ? gcsUri.trim() : ""
  if (!trimmed.startsWith("gs://")) return null

  const match = trimmed.match(/^gs:\/\/([^/]+)\/(.+)$/)
  if (!match) return null
  const [, bucketName, objectPath] = match
  if (!bucketName || !objectPath) return null

  try {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    const file = bucket.file(objectPath)
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    })
    return signedUrl || null
  } catch (e) {
    console.warn("[gcsSignedUrl] Failed to create signed URL:", String(e))
    return null
  }
}
