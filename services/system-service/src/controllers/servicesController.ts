import { Request, Response } from "express"
import { query } from "../config/db"
import { lookupTenants } from "../services/identityClient"

function toInt(v: unknown, fallback: number) {
  if (v === null || v === undefined || v === "") return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.floor(n))
}

function toStr(v: unknown) {
  const s = typeof v === "string" ? v : ""
  return s.trim()
}

const SERVICE_STATUSES = new Set(["active", "inactive", "deprecated"])
const INSTANCE_STATUSES = new Set(["active", "inactive", "degraded", "down"])
const ACCESS_STATUSES = new Set(["active", "inactive", "suspended"])
const ACCESS_LEVELS = new Set(["standard", "premium", "enterprise"])

export async function listServices(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (status) {
      if (!SERVICE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      where.push(`status = $${params.length + 1}`)
      params.push(status)
    }
    if (q) {
      where.push(
        `(
          name ILIKE $${params.length + 1}
          OR slug ILIKE $${params.length + 1}
          OR COALESCE(description, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM services ${whereSql}`, params)
    const listRes = await query(
      `
      SELECT id, name, slug, description, version, status, config, created_at, updated_at
      FROM services
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    })
  } catch (e: any) {
    console.error("listServices error:", e)
    return res.status(500).json({ message: "Failed to list services", details: String(e?.message || e) })
  }
}

export async function createService(req: Request, res: Response) {
  try {
    const name = toStr(req.body?.name)
    const slug = toStr(req.body?.slug)
    const version = toStr(req.body?.version)
    const status = toStr(req.body?.status) || "active"
    const description = typeof req.body?.description === "string" ? req.body.description : null
    const configInput = req.body?.config
    const configValue = configInput && typeof configInput === "object" ? configInput : configInput ? null : {}

    if (!name) return res.status(400).json({ message: "name is required" })
    if (!slug) return res.status(400).json({ message: "slug is required" })
    if (!version) return res.status(400).json({ message: "version is required" })
    if (!SERVICE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
    if (configValue === null) return res.status(400).json({ message: "config must be object" })

    const result = await query(
      `
      INSERT INTO services (name, slug, description, version, status, config)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      RETURNING id, name, slug, description, version, status, config, created_at, updated_at
      `,
      [name, slug, description, version, status, JSON.stringify(configValue || {})]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("createService error:", e)
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Service slug already exists", details: String(e?.detail || "") })
    }
    return res.status(500).json({ message: "Failed to create service", details: String(e?.message || e) })
  }
}

export async function updateService(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const input = req.body || {}
    const fields: string[] = []
    const params: any[] = []

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`)
      params.push(value)
    }

    if (input.name !== undefined) {
      const name = toStr(input.name)
      if (!name) return res.status(400).json({ message: "name must be non-empty" })
      setField("name", name)
    }
    if (input.slug !== undefined) {
      const slug = toStr(input.slug)
      if (!slug) return res.status(400).json({ message: "slug must be non-empty" })
      setField("slug", slug)
    }
    if (input.version !== undefined) {
      const version = toStr(input.version)
      if (!version) return res.status(400).json({ message: "version must be non-empty" })
      setField("version", version)
    }
    if (input.status !== undefined) {
      const status = toStr(input.status)
      if (!SERVICE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.description !== undefined) {
      const description = typeof input.description === "string" ? input.description : null
      setField("description", description)
    }
    if (input.config !== undefined) {
      const configInput = input.config
      const configValue = configInput && typeof configInput === "object" ? configInput : configInput ? null : {}
      if (configValue === null) return res.status(400).json({ message: "config must be object" })
      setField("config", JSON.stringify(configValue || {}))
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE services
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, name, slug, description, version, status, config, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Service not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateService error:", e)
    if (e?.code === "23505") {
      return res.status(409).json({ message: "Service slug already exists", details: String(e?.detail || "") })
    }
    return res.status(500).json({ message: "Failed to update service", details: String(e?.message || e) })
  }
}

export async function listServiceInstances(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)
    const serviceId = toStr(req.query.service_id)
    const tenantId = toStr(req.query.tenant_id)
    const region = toStr(req.query.region)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (status) {
      if (!INSTANCE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      where.push(`si.status = $${params.length + 1}`)
      params.push(status)
    }
    if (serviceId) {
      where.push(`si.service_id = $${params.length + 1}`)
      params.push(serviceId)
    }
    if (tenantId) {
      where.push(`si.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (region) {
      where.push(`si.region ILIKE $${params.length + 1}`)
      params.push(`%${region}%`)
    }
    if (q) {
      where.push(
        `(
          si.instance_name ILIKE $${params.length + 1}
          OR COALESCE(si.endpoint_url, '') ILIKE $${params.length + 1}
          OR COALESCE(si.region, '') ILIKE $${params.length + 1}
          OR COALESCE(s.name, '') ILIKE $${params.length + 1}
          OR COALESCE(s.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(si.tenant_id::text, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM service_instances si
      JOIN services s ON s.id = si.service_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        si.id,
        si.service_id,
        si.tenant_id,
        si.instance_name,
        si.endpoint_url,
        si.region,
        si.status,
        si.health_check_url,
        si.config,
        si.created_at,
        si.updated_at,
        s.name AS service_name,
        s.slug AS service_slug
      FROM service_instances si
      JOIN services s ON s.id = si.service_id
      ${whereSql}
      ORDER BY si.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)

    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
        tenant_name: tenant?.name ?? null,
        tenant_slug: tenant?.slug ?? null,
        tenant_type: tenant?.tenant_type ?? null,
      }
    })

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows,
    })
  } catch (e: any) {
    console.error("listServiceInstances error:", e)
    return res.status(500).json({ message: "Failed to list service instances", details: String(e?.message || e) })
  }
}

export async function createServiceInstance(req: Request, res: Response) {
  try {
    const serviceId = toStr(req.body?.service_id)
    const tenantId = toStr(req.body?.tenant_id)
    const instanceName = toStr(req.body?.instance_name)
    const endpointUrl = typeof req.body?.endpoint_url === "string" ? req.body.endpoint_url : null
    const region = typeof req.body?.region === "string" ? req.body.region : null
    const status = toStr(req.body?.status) || "active"
    const healthCheckUrl = typeof req.body?.health_check_url === "string" ? req.body.health_check_url : null
    const configInput = req.body?.config
    const configValue = configInput && typeof configInput === "object" ? configInput : configInput ? null : {}

    if (!serviceId) return res.status(400).json({ message: "service_id is required" })
    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })
    if (!instanceName) return res.status(400).json({ message: "instance_name is required" })
    if (!INSTANCE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
    if (configValue === null) return res.status(400).json({ message: "config must be object" })

    const result = await query(
      `
      INSERT INTO service_instances (
        service_id, tenant_id, instance_name, endpoint_url, region, status, health_check_url, config
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING id, service_id, tenant_id, instance_name, endpoint_url, region, status, health_check_url, config, created_at, updated_at
      `,
      [serviceId, tenantId, instanceName, endpointUrl, region, status, healthCheckUrl, JSON.stringify(configValue || {})]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("createServiceInstance error:", e)
    if (e?.code === "23505") {
      return res
        .status(409)
        .json({ message: "Service instance already exists", details: String(e?.detail || "") })
    }
    return res.status(500).json({ message: "Failed to create service instance", details: String(e?.message || e) })
  }
}

export async function updateServiceInstance(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const input = req.body || {}
    const fields: string[] = []
    const params: any[] = []

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`)
      params.push(value)
    }

    if (input.service_id !== undefined) {
      const serviceId = toStr(input.service_id)
      if (!serviceId) return res.status(400).json({ message: "service_id must be non-empty" })
      setField("service_id", serviceId)
    }
    if (input.tenant_id !== undefined) {
      const tenantId = toStr(input.tenant_id)
      if (!tenantId) return res.status(400).json({ message: "tenant_id must be non-empty" })
      setField("tenant_id", tenantId)
    }
    if (input.instance_name !== undefined) {
      const instanceName = toStr(input.instance_name)
      if (!instanceName) return res.status(400).json({ message: "instance_name must be non-empty" })
      setField("instance_name", instanceName)
    }
    if (input.endpoint_url !== undefined) {
      const endpointUrl = typeof input.endpoint_url === "string" ? input.endpoint_url : null
      setField("endpoint_url", endpointUrl)
    }
    if (input.region !== undefined) {
      const region = typeof input.region === "string" ? input.region : null
      setField("region", region)
    }
    if (input.status !== undefined) {
      const status = toStr(input.status)
      if (!INSTANCE_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.health_check_url !== undefined) {
      const healthCheckUrl = typeof input.health_check_url === "string" ? input.health_check_url : null
      setField("health_check_url", healthCheckUrl)
    }
    if (input.config !== undefined) {
      const configInput = input.config
      const configValue = configInput && typeof configInput === "object" ? configInput : configInput ? null : {}
      if (configValue === null) return res.status(400).json({ message: "config must be object" })
      setField("config", JSON.stringify(configValue || {}))
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE service_instances
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, service_id, tenant_id, instance_name, endpoint_url, region, status, health_check_url, config, created_at, updated_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Service instance not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateServiceInstance error:", e)
    if (e?.code === "23505") {
      return res
        .status(409)
        .json({ message: "Service instance already exists", details: String(e?.detail || "") })
    }
    return res.status(500).json({ message: "Failed to update service instance", details: String(e?.message || e) })
  }
}

export async function listTenantServiceAccess(req: Request, res: Response) {
  try {
    const q = toStr(req.query.q)
    const status = toStr(req.query.status)
    const accessLevel = toStr(req.query.access_level)
    const tenantId = toStr(req.query.tenant_id)
    const serviceId = toStr(req.query.service_id)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = []
    const params: any[] = []

    if (status) {
      if (!ACCESS_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      where.push(`tsa.status = $${params.length + 1}`)
      params.push(status)
    }
    if (accessLevel) {
      if (!ACCESS_LEVELS.has(accessLevel)) return res.status(400).json({ message: "invalid access_level" })
      where.push(`tsa.access_level = $${params.length + 1}`)
      params.push(accessLevel)
    }
    if (tenantId) {
      where.push(`tsa.tenant_id = $${params.length + 1}`)
      params.push(tenantId)
    }
    if (serviceId) {
      where.push(`tsa.service_id = $${params.length + 1}`)
      params.push(serviceId)
    }
    if (q) {
      where.push(
        `(
          COALESCE(s.name, '') ILIKE $${params.length + 1}
          OR COALESCE(s.slug, '') ILIKE $${params.length + 1}
          OR COALESCE(tsa.tenant_id::text, '') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM tenant_service_access tsa
      JOIN services s ON s.id = tsa.service_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        tsa.id,
        tsa.tenant_id,
        tsa.service_id,
        tsa.status,
        tsa.access_level,
        tsa.rate_limit,
        tsa.config,
        tsa.granted_at,
        tsa.expires_at,
        s.name AS service_name,
        s.slug AS service_slug
      FROM tenant_service_access tsa
      JOIN services s ON s.id = tsa.service_id
      ${whereSql}
      ORDER BY tsa.granted_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    const authHeader = String(req.headers.authorization || "")
    const tenantIds = Array.from(
      new Set(listRes.rows.map((row) => row.tenant_id).filter((id) => typeof id === "string" && id))
    )
    const tenantMap = await lookupTenants(tenantIds, authHeader)

    const rows = listRes.rows.map((row) => {
      const tenant = row.tenant_id ? tenantMap.get(String(row.tenant_id)) : undefined
      return {
        ...row,
        tenant_name: tenant?.name ?? null,
        tenant_slug: tenant?.slug ?? null,
        tenant_type: tenant?.tenant_type ?? null,
      }
    })

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows,
    })
  } catch (e: any) {
    console.error("listTenantServiceAccess error:", e)
    return res.status(500).json({ message: "Failed to list tenant service access", details: String(e?.message || e) })
  }
}

export async function createTenantServiceAccess(req: Request, res: Response) {
  try {
    const tenantId = toStr(req.body?.tenant_id)
    const serviceId = toStr(req.body?.service_id)
    const status = toStr(req.body?.status) || "active"
    const accessLevel = toStr(req.body?.access_level) || "standard"
    const rateLimitInput = req.body?.rate_limit
    const rateLimitValue =
      rateLimitInput && typeof rateLimitInput === "object" ? rateLimitInput : rateLimitInput ? null : {}
    const configInput = req.body?.config
    const configValue = configInput && typeof configInput === "object" ? configInput : configInput ? null : {}
    const expiresAt = req.body?.expires_at || null

    if (!tenantId) return res.status(400).json({ message: "tenant_id is required" })
    if (!serviceId) return res.status(400).json({ message: "service_id is required" })
    if (!ACCESS_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
    if (!ACCESS_LEVELS.has(accessLevel)) return res.status(400).json({ message: "invalid access_level" })
    if (rateLimitValue === null) return res.status(400).json({ message: "rate_limit must be object" })
    if (configValue === null) return res.status(400).json({ message: "config must be object" })

    const result = await query(
      `
      INSERT INTO tenant_service_access (
        tenant_id, service_id, status, access_level, rate_limit, config, expires_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
      RETURNING id, tenant_id, service_id, status, access_level, rate_limit, config, granted_at, expires_at
      `,
      [tenantId, serviceId, status, accessLevel, JSON.stringify(rateLimitValue || {}), JSON.stringify(configValue || {}), expiresAt]
    )

    return res.status(201).json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("createTenantServiceAccess error:", e)
    if (e?.code === "23505") {
      return res
        .status(409)
        .json({ message: "Tenant service access already exists", details: String(e?.detail || "") })
    }
    return res
      .status(500)
      .json({ message: "Failed to create tenant service access", details: String(e?.message || e) })
  }
}

export async function updateTenantServiceAccess(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const input = req.body || {}
    const fields: string[] = []
    const params: any[] = []

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`)
      params.push(value)
    }

    if (input.tenant_id !== undefined) {
      const tenantId = toStr(input.tenant_id)
      if (!tenantId) return res.status(400).json({ message: "tenant_id must be non-empty" })
      setField("tenant_id", tenantId)
    }
    if (input.service_id !== undefined) {
      const serviceId = toStr(input.service_id)
      if (!serviceId) return res.status(400).json({ message: "service_id must be non-empty" })
      setField("service_id", serviceId)
    }
    if (input.status !== undefined) {
      const status = toStr(input.status)
      if (!ACCESS_STATUSES.has(status)) return res.status(400).json({ message: "invalid status" })
      setField("status", status)
    }
    if (input.access_level !== undefined) {
      const accessLevel = toStr(input.access_level)
      if (!ACCESS_LEVELS.has(accessLevel)) return res.status(400).json({ message: "invalid access_level" })
      setField("access_level", accessLevel)
    }
    if (input.rate_limit !== undefined) {
      const rateLimitInput = input.rate_limit
      const rateLimitValue =
        rateLimitInput && typeof rateLimitInput === "object" ? rateLimitInput : rateLimitInput ? null : {}
      if (rateLimitValue === null) return res.status(400).json({ message: "rate_limit must be object" })
      setField("rate_limit", JSON.stringify(rateLimitValue || {}))
    }
    if (input.config !== undefined) {
      const configInput = input.config
      const configValue = configInput && typeof configInput === "object" ? configInput : configInput ? null : {}
      if (configValue === null) return res.status(400).json({ message: "config must be object" })
      setField("config", JSON.stringify(configValue || {}))
    }
    if (input.expires_at !== undefined) {
      const expiresAt = input.expires_at ? input.expires_at : null
      setField("expires_at", expiresAt)
    }

    if (fields.length === 0) return res.status(400).json({ message: "No fields to update" })

    const result = await query(
      `
      UPDATE tenant_service_access
      SET ${fields.join(", ")}
      WHERE id = $${params.length + 1}
      RETURNING id, tenant_id, service_id, status, access_level, rate_limit, config, granted_at, expires_at
      `,
      [...params, id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Tenant service access not found" })
    return res.json({ ok: true, row: result.rows[0] })
  } catch (e: any) {
    console.error("updateTenantServiceAccess error:", e)
    if (e?.code === "23505") {
      return res
        .status(409)
        .json({ message: "Tenant service access already exists", details: String(e?.detail || "") })
    }
    return res
      .status(500)
      .json({ message: "Failed to update tenant service access", details: String(e?.message || e) })
  }
}
