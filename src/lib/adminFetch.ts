export function getAdminAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {}
  const token = window.localStorage.getItem("token")
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {})
  const authHeaders = getAdminAuthHeaders()
  Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value))
  return fetch(input, { ...init, headers })
}
