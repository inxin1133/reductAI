export const ACTIVE_TENANT_ID_KEY = "reductai:tenant:active"

export const getActiveTenantId = () => {
  if (typeof window === "undefined") return ""
  try {
    return String(window.localStorage.getItem(ACTIVE_TENANT_ID_KEY) || "").trim()
  } catch {
    return ""
  }
}

export const setActiveTenantId = (tenantId?: string | null) => {
  if (typeof window === "undefined") return
  const value = String(tenantId || "").trim()
  try {
    if (value) {
      window.localStorage.setItem(ACTIVE_TENANT_ID_KEY, value)
    } else {
      window.localStorage.removeItem(ACTIVE_TENANT_ID_KEY)
    }
  } catch {
    // ignore storage issues
  }
}

export const withActiveTenantHeader = <T extends Record<string, string>>(
  headers: T,
  tenantId?: string | null
) => {
  const value = String(tenantId || "").trim() || getActiveTenantId()
  if (!value) return headers
  return { ...headers, "x-tenant-id": value }
}
