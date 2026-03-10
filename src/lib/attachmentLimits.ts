/**
 * 첨부 파일 제한 (이미지/파일/링크)
 * - capabilities.limits를 최우선, 없으면 기본값
 * - 용량: Free 7MB, Pro 이상 20MB (이미지/파일 분리 지원)
 */

/** Free 등급: 이미지 7MB */
export const MAX_IMAGE_BYTES_FREE = 7 * 1024 * 1024
/** Free 등급: 일반 파일 7MB */
export const MAX_FILE_BYTES_FREE = 7 * 1024 * 1024
/** Pro 이상: 이미지 20MB */
export const MAX_IMAGE_BYTES_DEFAULT = 20 * 1024 * 1024
/** Pro 이상: 일반 파일 20MB */
export const MAX_FILE_BYTES_DEFAULT = 20 * 1024 * 1024

/** @deprecated 호환용 - Free 기준 7MB. getEffectiveMaxAttachmentBytes 사용 권장 */
export const MAX_ATTACHMENT_BYTES = MAX_IMAGE_BYTES_FREE

/** 등급별 첨부 상한 (Pro 이상 = 6, Business = 모델 최대) */
const TIER_MAX_ATTACHMENTS: Record<string, number> = {
  free: 1,
  pro: 6,
  premium: 6,
  business: Infinity,
  enterprise: Infinity,
}

export type AttachmentLimits = {
  max_attachments: number
  max_reference_images: number
  max_attachment_bytes: number
}

const DEFAULT_LIMITS: AttachmentLimits = {
  max_attachments: 6,
  max_reference_images: 6,
  max_attachment_bytes: MAX_ATTACHMENT_BYTES,
}

/** capabilities.limits에서 제한값 추출 (값이 있을 때만 사용) */
export function getLimitsFromCapabilities(capabilities: unknown): Partial<AttachmentLimits> | null {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return null
  const cap = capabilities as Record<string, unknown>
  const limits = cap.limits
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) return null
  const L = limits as Record<string, unknown>
  const out: Partial<AttachmentLimits> = {}
  if (typeof L.max_attachments === "number" && L.max_attachments >= 0) {
    out.max_attachments = L.max_attachments
  }
  if (typeof L.max_reference_images === "number" && L.max_reference_images >= 0) {
    out.max_reference_images = L.max_reference_images
  }
  if (typeof L.max_attachment_bytes === "number" && L.max_attachment_bytes > 0) {
    out.max_attachment_bytes = L.max_attachment_bytes
  }
  return Object.keys(out).length ? out : null
}

/**
 * 유효 최대 첨부 수 (파일 유형 무관, 총합)
 * - image 모델: 이미지 한도 + 등급 한도 조합
 * - text 등: 총 첨부 수만 적용
 * - isInLastZone: 크레딧 마지막 구간 시 1개로 제한 (이미지 첨부 악용 방지)
 */
export function getEffectiveMaxAttachments(args: {
  planTier: string | null
  modelType: string
  modelApiId: string
  capabilities?: unknown
  isInLastZone?: boolean
}): number {
  const { planTier, modelType, modelApiId, capabilities, isInLastZone } = args
  if (isInLastZone) return 1

  const capLimits = getLimitsFromCapabilities(capabilities)
  const tierKey = (planTier ?? "free").toLowerCase()
  const tierMax = TIER_MAX_ATTACHMENTS[tierKey] ?? 1

  if (modelType === "image") {
    const modelMax = capLimits?.max_reference_images ?? 6
    if (tierMax === Infinity) return modelMax
    return Math.min(tierMax, modelMax)
  }

  // text, video, music, audio, code 등
  const defaultMax = capLimits?.max_attachments ?? DEFAULT_LIMITS.max_attachments
  if (tierMax === Infinity) return defaultMax
  return Math.min(tierMax, defaultMax)
}

/** 등급별 개별 첨부 용량 (이미지/파일 분리) */
export function getEffectiveMaxAttachmentBytes(
  planTier: string | null,
  kind: "image" | "file"
): number {
  const tier = (planTier ?? "free").toLowerCase()
  const isFree = tier === "free"
  return kind === "image"
    ? (isFree ? MAX_IMAGE_BYTES_FREE : MAX_IMAGE_BYTES_DEFAULT)
    : (isFree ? MAX_FILE_BYTES_FREE : MAX_FILE_BYTES_DEFAULT)
}
