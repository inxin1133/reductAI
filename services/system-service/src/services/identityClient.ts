type LookupUser = {
  id: string
  email?: string | null
  full_name?: string | null
}

type LookupTenant = {
  id: string
  name?: string | null
  slug?: string | null
  tenant_type?: string | null
}

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:3002"
const TENANT_SERVICE_URL = process.env.TENANT_SERVICE_URL || "http://localhost:3003"

async function postLookup<T>(url: string, ids: string[], authHeader?: string): Promise<T[]> {
  if (ids.length === 0) return []
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (authHeader) headers.Authorization = authHeader

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ids }),
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      console.warn(`lookup failed: ${url} ${res.status} ${errorText}`)
      return []
    }

    const json = (await res.json().catch(() => ({}))) as { rows?: T[] }
    return Array.isArray(json.rows) ? json.rows : []
  } catch (e) {
    console.warn(`lookup error: ${url}`, e)
    return []
  }
}

export async function lookupUsers(ids: string[], authHeader?: string) {
  const rows = await postLookup<LookupUser>(`${USER_SERVICE_URL}/api/users/lookup`, ids, authHeader)
  const map = new Map<string, LookupUser>()
  for (const row of rows) {
    if (row?.id) map.set(String(row.id), row)
  }
  return map
}

export async function lookupTenants(ids: string[], authHeader?: string) {
  const rows = await postLookup<LookupTenant>(`${TENANT_SERVICE_URL}/api/tenants/lookup`, ids, authHeader)
  const map = new Map<string, LookupTenant>()
  for (const row of rows) {
    if (row?.id) map.set(String(row.id), row)
  }
  return map
}
