/**
 * Credential별 rate limit 체크 및 기록
 * - rate_limit_per_minute, rate_limit_per_day가 null이면 제한없음
 * - 값이 설정되어 있으면 해당 한도 초과 시 throw
 * - in-memory 기반 (서버 재시작 시 카운트 리셋)
 */

type WindowEntry = { timestamps: number[] }

const minuteMs = 60_000
const dayMs = 24 * 60 * 60_000

const store = new Map<string, { minute: WindowEntry; day: WindowEntry }>()

function getOrCreate(id: string) {
  let entry = store.get(id)
  if (!entry) {
    entry = { minute: { timestamps: [] }, day: { timestamps: [] } }
    store.set(id, entry)
  }
  return entry
}

function prune(entry: WindowEntry, windowMs: number) {
  const now = Date.now()
  const cut = now - windowMs
  entry.timestamps = entry.timestamps.filter((t) => t > cut)
}

/**
 * rate limit 체크 후 요청 기록
 * - limit이 null/undefined면 체크 생략 (제한없음)
 * - 초과 시 CredentialRateLimitExceededError throw
 */
export class CredentialRateLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly credentialId: string,
    public readonly limitType: "minute" | "day",
    public readonly limit: number,
    public readonly current: number
  ) {
    super(message)
    this.name = "CredentialRateLimitExceededError"
  }
}

export function checkAndRecord(
  credentialId: string,
  rateLimitPerMinute: number | null | undefined,
  rateLimitPerDay: number | null | undefined
): void {
  if ((rateLimitPerMinute == null || rateLimitPerMinute <= 0) && (rateLimitPerDay == null || rateLimitPerDay <= 0)) {
    return // 제한없음
  }

  const entry = getOrCreate(credentialId)
  const now = Date.now()

  if (rateLimitPerMinute != null && rateLimitPerMinute > 0) {
    prune(entry.minute, minuteMs)
    if (entry.minute.timestamps.length >= rateLimitPerMinute) {
      throw new CredentialRateLimitExceededError(
        `분당 요청 한도 초과 (${rateLimitPerMinute}건/분)`,
        credentialId,
        "minute",
        rateLimitPerMinute,
        entry.minute.timestamps.length
      )
    }
    entry.minute.timestamps.push(now)
  }

  if (rateLimitPerDay != null && rateLimitPerDay > 0) {
    prune(entry.day, dayMs)
    if (entry.day.timestamps.length >= rateLimitPerDay) {
      throw new CredentialRateLimitExceededError(
        `일일 요청 한도 초과 (${rateLimitPerDay}건/일)`,
        credentialId,
        "day",
        rateLimitPerDay,
        entry.day.timestamps.length
      )
    }
    entry.day.timestamps.push(now)
  }
}
