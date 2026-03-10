"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveProviderClientKey = deriveProviderClientKey;
/**
 * API 클라이언트 라우팅을 위한 정규화된 벤더 키를 추출합니다.
 *
 * ai_providers는 모달리티별로 slug를 구분합니다 (google-nanobanana, openai-chatgpt, openai-veo 등).
 * slug 전체로는 providerKey === "google" 같은 체크가 실패하므로,
 * provider_family 또는 slug prefix를 사용해 canonical key(openai|google|anthropic)를 반환합니다.
 *
 * @param providerFamily provider_family 컬럼 값 (openai, google, anthropic, custom 등)
 * @param providerSlug provider slug (google-nanobanana, openai-chatgpt 등)
 * @returns API 클라이언트 선택용 canonical key
 */
function deriveProviderClientKey(providerFamily, providerSlug) {
    const family = String(providerFamily || "").trim().toLowerCase();
    const slug = String(providerSlug || "").trim().toLowerCase();
    const KNOWN = ["openai", "google", "anthropic"];
    if (family && family !== "custom" && KNOWN.includes(family)) {
        return family;
    }
    if (!slug)
        return "custom";
    const prefix = slug.split("-")[0] || slug;
    return KNOWN.includes(prefix) ? prefix : "custom";
}
