"use strict";
/**
 * 첨부 파일 제한 (백엔드 검증용)
 * - capabilities.limits 최우선, 없으면 기본값
 * - 용량: Free 7MB, Pro 이상 20MB (이미지/파일 분리)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEffectiveMaxAttachments = getEffectiveMaxAttachments;
exports.getEffectiveMaxAttachmentBytes = getEffectiveMaxAttachmentBytes;
/** Free: 이미지 7MB */
const MAX_IMAGE_BYTES_FREE = 7 * 1024 * 1024;
/** Free: 파일 7MB */
const MAX_FILE_BYTES_FREE = 7 * 1024 * 1024;
/** Pro 이상: 이미지 20MB */
const MAX_IMAGE_BYTES_DEFAULT = 20 * 1024 * 1024;
/** Pro 이상: 파일 20MB */
const MAX_FILE_BYTES_DEFAULT = 20 * 1024 * 1024;
/** 등급별 첨부 상한 */
const TIER_MAX_ATTACHMENTS = {
    free: 1,
    pro: 6,
    premium: 6,
    business: Infinity,
    enterprise: Infinity,
};
function isRecord(v) {
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
/** capabilities.limits에서 max_reference_images, max_attachments 추출 */
function getCapLimit(capabilities, key) {
    if (!isRecord(capabilities))
        return null;
    const limits = capabilities.limits;
    if (!isRecord(limits))
        return null;
    const v = limits[key];
    if (typeof v !== "number" || v < 0)
        return null;
    return v;
}
/**
 * 유효 최대 첨부 수 (총합, 파일 유형 무관)
 * - image 모델: 이미지 한도 + 등급 한도 조합
 * - text 등: 총 첨부 수만 적용
 */
function getEffectiveMaxAttachments(args) {
    const { planTier, modelType, modelApiId, capabilities } = args;
    const tierKey = (planTier ?? "free").toLowerCase();
    const tierMax = TIER_MAX_ATTACHMENTS[tierKey] ?? 1;
    if (modelType === "image") {
        const modelMax = getCapLimit(capabilities, "max_reference_images") ?? 6;
        if (tierMax === Infinity)
            return modelMax;
        return Math.min(tierMax, modelMax);
    }
    const defaultMax = getCapLimit(capabilities, "max_attachments") ?? 6;
    if (tierMax === Infinity)
        return defaultMax;
    return Math.min(tierMax, defaultMax);
}
/** 등급별 개별 첨부 용량 (이미지/파일 분리). file-service와 동일 로직 */
function getEffectiveMaxAttachmentBytes(planTier, kind) {
    const tier = (planTier ?? "free").toLowerCase();
    const isFree = tier === "free";
    return kind === "image"
        ? (isFree ? MAX_IMAGE_BYTES_FREE : MAX_IMAGE_BYTES_DEFAULT)
        : (isFree ? MAX_FILE_BYTES_FREE : MAX_FILE_BYTES_DEFAULT);
}
