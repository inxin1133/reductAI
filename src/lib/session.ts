import type { NavigateFunction } from "react-router-dom"

const SESSION_EXPIRED_HANDLED_KEY = "reductai.sessionExpiredHandled"
const SESSION_EXPIRED_NOTICE_KEY = "reductai.sessionExpiredNotice"

export function isSessionExpired() {
  const token = localStorage.getItem("token")
  const expiresAt = Number(localStorage.getItem("token_expires_at") || 0)
  return !token || !expiresAt || Date.now() > expiresAt
}

export function clearAuthStorage() {
  localStorage.removeItem("token")
  localStorage.removeItem("token_expires_at")
  localStorage.removeItem("user_email")
  localStorage.removeItem("user_id")
}

export function handleSessionExpired(
  navigate: NavigateFunction,
  options?: { redirectTo?: string; showNotice?: boolean }
) {
  if (sessionStorage.getItem(SESSION_EXPIRED_HANDLED_KEY) === "1") return
  sessionStorage.setItem(SESSION_EXPIRED_HANDLED_KEY, "1")
  if (options?.showNotice !== false) {
    sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, "1")
  }
  clearAuthStorage()
  navigate(options?.redirectTo ?? "/", { replace: true })
}

export function resetSessionExpiredGuard() {
  sessionStorage.removeItem(SESSION_EXPIRED_HANDLED_KEY)
}

export function consumeSessionExpiredNotice() {
  const hasNotice = sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY) === "1"
  if (hasNotice) {
    sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY)
  }
  return hasNotice
}
