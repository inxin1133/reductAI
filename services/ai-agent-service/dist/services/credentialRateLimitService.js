"use strict";
/**
 * Credential별 rate limit 체크 및 기록
 * - rate_limit_per_minute, rate_limit_per_day가 null이면 제한없음
 * - 값이 설정되어 있으면 해당 한도 초과 시 throw
 * - in-memory 기반 (서버 재시작 시 카운트 리셋)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialRateLimitExceededError = void 0;
exports.checkAndRecord = checkAndRecord;
const minuteMs = 60000;
const dayMs = 24 * 60 * 60000;
const store = new Map();
function getOrCreate(id) {
    let entry = store.get(id);
    if (!entry) {
        entry = { minute: { timestamps: [] }, day: { timestamps: [] } };
        store.set(id, entry);
    }
    return entry;
}
function prune(entry, windowMs) {
    const now = Date.now();
    const cut = now - windowMs;
    entry.timestamps = entry.timestamps.filter((t) => t > cut);
}
/**
 * rate limit 체크 후 요청 기록
 * - limit이 null/undefined면 체크 생략 (제한없음)
 * - 초과 시 CredentialRateLimitExceededError throw
 */
class CredentialRateLimitExceededError extends Error {
    constructor(message, credentialId, limitType, limit, current) {
        super(message);
        this.credentialId = credentialId;
        this.limitType = limitType;
        this.limit = limit;
        this.current = current;
        this.name = "CredentialRateLimitExceededError";
    }
}
exports.CredentialRateLimitExceededError = CredentialRateLimitExceededError;
function checkAndRecord(credentialId, rateLimitPerMinute, rateLimitPerDay) {
    if ((rateLimitPerMinute == null || rateLimitPerMinute <= 0) && (rateLimitPerDay == null || rateLimitPerDay <= 0)) {
        return; // 제한없음
    }
    const entry = getOrCreate(credentialId);
    const now = Date.now();
    if (rateLimitPerMinute != null && rateLimitPerMinute > 0) {
        prune(entry.minute, minuteMs);
        if (entry.minute.timestamps.length >= rateLimitPerMinute) {
            throw new CredentialRateLimitExceededError(`분당 요청 한도 초과 (${rateLimitPerMinute}건/분)`, credentialId, "minute", rateLimitPerMinute, entry.minute.timestamps.length);
        }
        entry.minute.timestamps.push(now);
    }
    if (rateLimitPerDay != null && rateLimitPerDay > 0) {
        prune(entry.day, dayMs);
        if (entry.day.timestamps.length >= rateLimitPerDay) {
            throw new CredentialRateLimitExceededError(`일일 요청 한도 초과 (${rateLimitPerDay}건/일)`, credentialId, "day", rateLimitPerDay, entry.day.timestamps.length);
        }
        entry.day.timestamps.push(now);
    }
}
