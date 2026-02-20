import { useEffect, useMemo, useState } from "react"
import { adminFetch } from "@/lib/adminFetch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Pencil, Plus, RefreshCcw } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type ServiceRow = {
  id: string
  name: string
  slug: string
  description?: string | null
  version: string
  status: "active" | "inactive" | "deprecated"
  config?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ServiceInstanceRow = {
  id: string
  service_id: string
  tenant_id: string
  instance_name: string
  endpoint_url?: string | null
  region?: string | null
  status: "active" | "inactive" | "degraded" | "down"
  health_check_url?: string | null
  config?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  service_name?: string | null
  service_slug?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
}

type TenantServiceAccessRow = {
  id: string
  tenant_id: string
  service_id: string
  status: "active" | "inactive" | "suspended"
  access_level: "standard" | "premium" | "enterprise"
  rate_limit?: Record<string, unknown> | null
  config?: Record<string, unknown> | null
  granted_at: string
  expires_at?: string | null
  service_name?: string | null
  service_slug?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_type?: string | null
}

type ListResponse<T> = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: T[]
}

type ServiceForm = {
  name: string
  slug: string
  description: string
  version: string
  status: ServiceRow["status"]
  config: string
}

type InstanceForm = {
  service_id: string
  tenant_id: string
  instance_name: string
  endpoint_url: string
  region: string
  status: ServiceInstanceRow["status"]
  health_check_url: string
  config: string
}

type AccessForm = {
  tenant_id: string
  service_id: string
  status: TenantServiceAccessRow["status"]
  access_level: TenantServiceAccessRow["access_level"]
  rate_limit: string
  config: string
  expires_at: string
}

const SERVICES_API = "/api/ai/system/services"
const INSTANCES_API = "/api/ai/system/service-instances"
const ACCESS_API = "/api/ai/system/tenant-service-access"
const FILTER_ALL = "__all__"

const SERVICE_EMPTY: ServiceForm = {
  name: "",
  slug: "",
  description: "",
  version: "",
  status: "active",
  config: "",
}

const INSTANCE_EMPTY: InstanceForm = {
  service_id: "",
  tenant_id: "",
  instance_name: "",
  endpoint_url: "",
  region: "",
  status: "active",
  health_check_url: "",
  config: "",
}

const ACCESS_EMPTY: AccessForm = {
  tenant_id: "",
  service_id: "",
  status: "active",
  access_level: "standard",
  rate_limit: "",
  config: "",
  expires_at: "",
}

const SERVICE_STATUSES: ServiceRow["status"][] = ["active", "inactive", "deprecated"]
const INSTANCE_STATUSES: ServiceInstanceRow["status"][] = ["active", "inactive", "degraded", "down"]
const ACCESS_STATUSES: TenantServiceAccessRow["status"][] = ["active", "inactive", "suspended"]
const ACCESS_LEVELS: TenantServiceAccessRow["access_level"][] = ["standard", "premium", "enterprise"]

function fmtDate(iso?: string | null) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function toDateTimeLocal(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

function formatJsonPreview(value: unknown) {
  if (!value) return "-"
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value)
    return raw.length > 60 ? `${raw.slice(0, 60)}...` : raw
  } catch {
    return "-"
  }
}

function statusBadge(status?: string | null) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "inactive") return "bg-slate-50 text-slate-600 border-slate-200"
  if (status === "deprecated") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "degraded") return "bg-amber-50 text-amber-700 border-amber-200"
  if (status === "down") return "bg-rose-50 text-rose-700 border-rose-200"
  if (status === "suspended") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

function parseJson(value: string) {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function SystemServices() {
  const [tab, setTab] = useState("services")

  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([])
  const [serviceLoading, setServiceLoading] = useState(false)
  const [serviceTotal, setServiceTotal] = useState(0)
  const [servicePage, setServicePage] = useState(0)
  const serviceLimit = 50

  const [serviceQ, setServiceQ] = useState("")
  const [serviceStatus, setServiceStatus] = useState(FILTER_ALL)

  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [serviceEditing, setServiceEditing] = useState<ServiceRow | null>(null)
  const [serviceForm, setServiceForm] = useState<ServiceForm>(SERVICE_EMPTY)
  const [serviceSaving, setServiceSaving] = useState(false)

  const [instanceRows, setInstanceRows] = useState<ServiceInstanceRow[]>([])
  const [instanceLoading, setInstanceLoading] = useState(false)
  const [instanceTotal, setInstanceTotal] = useState(0)
  const [instancePage, setInstancePage] = useState(0)
  const instanceLimit = 50

  const [instanceQ, setInstanceQ] = useState("")
  const [instanceStatus, setInstanceStatus] = useState(FILTER_ALL)
  const [instanceServiceId, setInstanceServiceId] = useState("")
  const [instanceTenantId, setInstanceTenantId] = useState("")
  const [instanceRegion, setInstanceRegion] = useState("")

  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false)
  const [instanceEditing, setInstanceEditing] = useState<ServiceInstanceRow | null>(null)
  const [instanceForm, setInstanceForm] = useState<InstanceForm>(INSTANCE_EMPTY)
  const [instanceSaving, setInstanceSaving] = useState(false)

  const [accessRows, setAccessRows] = useState<TenantServiceAccessRow[]>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessTotal, setAccessTotal] = useState(0)
  const [accessPage, setAccessPage] = useState(0)
  const accessLimit = 50

  const [accessQ, setAccessQ] = useState("")
  const [accessStatus, setAccessStatus] = useState(FILTER_ALL)
  const [accessLevel, setAccessLevel] = useState(FILTER_ALL)
  const [accessTenantId, setAccessTenantId] = useState("")
  const [accessServiceId, setAccessServiceId] = useState("")

  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const [accessEditing, setAccessEditing] = useState<TenantServiceAccessRow | null>(null)
  const [accessForm, setAccessForm] = useState<AccessForm>(ACCESS_EMPTY)
  const [accessSaving, setAccessSaving] = useState(false)

  const serviceQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(serviceLimit))
    params.set("offset", String(servicePage * serviceLimit))
    if (serviceQ.trim()) params.set("q", serviceQ.trim())
    if (serviceStatus !== FILTER_ALL) params.set("status", serviceStatus)
    return params.toString()
  }, [serviceLimit, servicePage, serviceQ, serviceStatus])

  const instanceQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(instanceLimit))
    params.set("offset", String(instancePage * instanceLimit))
    if (instanceQ.trim()) params.set("q", instanceQ.trim())
    if (instanceStatus !== FILTER_ALL) params.set("status", instanceStatus)
    if (instanceServiceId.trim()) params.set("service_id", instanceServiceId.trim())
    if (instanceTenantId.trim()) params.set("tenant_id", instanceTenantId.trim())
    if (instanceRegion.trim()) params.set("region", instanceRegion.trim())
    return params.toString()
  }, [instanceLimit, instancePage, instanceQ, instanceRegion, instanceServiceId, instanceStatus, instanceTenantId])

  const accessQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(accessLimit))
    params.set("offset", String(accessPage * accessLimit))
    if (accessQ.trim()) params.set("q", accessQ.trim())
    if (accessStatus !== FILTER_ALL) params.set("status", accessStatus)
    if (accessLevel !== FILTER_ALL) params.set("access_level", accessLevel)
    if (accessTenantId.trim()) params.set("tenant_id", accessTenantId.trim())
    if (accessServiceId.trim()) params.set("service_id", accessServiceId.trim())
    return params.toString()
  }, [accessLevel, accessLimit, accessPage, accessQ, accessServiceId, accessStatus, accessTenantId])

  async function fetchServices() {
    setServiceLoading(true)
    try {
      const res = await adminFetch(`${SERVICES_API}?${serviceQuery}`)
      const json = (await res.json()) as ListResponse<ServiceRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setServiceRows(json.rows || [])
      setServiceTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setServiceRows([])
      setServiceTotal(0)
    } finally {
      setServiceLoading(false)
    }
  }

  async function fetchInstances() {
    setInstanceLoading(true)
    try {
      const res = await adminFetch(`${INSTANCES_API}?${instanceQuery}`)
      const json = (await res.json()) as ListResponse<ServiceInstanceRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setInstanceRows(json.rows || [])
      setInstanceTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setInstanceRows([])
      setInstanceTotal(0)
    } finally {
      setInstanceLoading(false)
    }
  }

  async function fetchAccess() {
    setAccessLoading(true)
    try {
      const res = await adminFetch(`${ACCESS_API}?${accessQuery}`)
      const json = (await res.json()) as ListResponse<TenantServiceAccessRow>
      if (!res.ok || !json.ok) throw new Error("FAILED")
      setAccessRows(json.rows || [])
      setAccessTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setAccessRows([])
      setAccessTotal(0)
    } finally {
      setAccessLoading(false)
    }
  }

  useEffect(() => {
    fetchServices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceQuery])

  useEffect(() => {
    fetchInstances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceQuery])

  useEffect(() => {
    fetchAccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessQuery])

  function openServiceCreate() {
    setServiceEditing(null)
    setServiceForm(SERVICE_EMPTY)
    setServiceDialogOpen(true)
  }

  function openServiceEdit(row: ServiceRow) {
    setServiceEditing(row)
    setServiceForm({
      name: row.name || "",
      slug: row.slug || "",
      description: row.description || "",
      version: row.version || "",
      status: row.status || "active",
      config: row.config ? JSON.stringify(row.config, null, 2) : "",
    })
    setServiceDialogOpen(true)
  }

  async function saveService() {
    const configValue = parseJson(serviceForm.config)
    if (configValue === null) return alert("서비스 Config JSON 형식이 올바르지 않습니다.")
    if (!serviceForm.name.trim()) return alert("서비스명을 입력해 주세요.")
    if (!serviceForm.slug.trim()) return alert("슬러그를 입력해 주세요.")
    if (!serviceForm.version.trim()) return alert("버전을 입력해 주세요.")

    const payload = {
      name: serviceForm.name.trim(),
      slug: serviceForm.slug.trim(),
      description: serviceForm.description.trim() || null,
      version: serviceForm.version.trim(),
      status: serviceForm.status,
      config: configValue,
    }

    try {
      setServiceSaving(true)
      const res = await adminFetch(serviceEditing ? `${SERVICES_API}/${serviceEditing.id}` : SERVICES_API, {
        method: serviceEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        return alert(json.message || "저장에 실패했습니다.")
      }
      setServiceDialogOpen(false)
      setServiceEditing(null)
      await fetchServices()
    } catch (e) {
      console.error(e)
      alert("저장 중 오류가 발생했습니다.")
    } finally {
      setServiceSaving(false)
    }
  }

  function openInstanceCreate() {
    setInstanceEditing(null)
    setInstanceForm(INSTANCE_EMPTY)
    setInstanceDialogOpen(true)
  }

  function openInstanceEdit(row: ServiceInstanceRow) {
    setInstanceEditing(row)
    setInstanceForm({
      service_id: row.service_id || "",
      tenant_id: row.tenant_id || "",
      instance_name: row.instance_name || "",
      endpoint_url: row.endpoint_url || "",
      region: row.region || "",
      status: row.status || "active",
      health_check_url: row.health_check_url || "",
      config: row.config ? JSON.stringify(row.config, null, 2) : "",
    })
    setInstanceDialogOpen(true)
  }

  async function saveInstance() {
    const configValue = parseJson(instanceForm.config)
    if (configValue === null) return alert("인스턴스 Config JSON 형식이 올바르지 않습니다.")
    if (!instanceForm.service_id.trim()) return alert("service_id를 입력해 주세요.")
    if (!instanceForm.tenant_id.trim()) return alert("tenant_id를 입력해 주세요.")
    if (!instanceForm.instance_name.trim()) return alert("instance_name을 입력해 주세요.")

    const payload = {
      service_id: instanceForm.service_id.trim(),
      tenant_id: instanceForm.tenant_id.trim(),
      instance_name: instanceForm.instance_name.trim(),
      endpoint_url: instanceForm.endpoint_url.trim() || null,
      region: instanceForm.region.trim() || null,
      status: instanceForm.status,
      health_check_url: instanceForm.health_check_url.trim() || null,
      config: configValue,
    }

    try {
      setInstanceSaving(true)
      const res = await adminFetch(instanceEditing ? `${INSTANCES_API}/${instanceEditing.id}` : INSTANCES_API, {
        method: instanceEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        return alert(json.message || "저장에 실패했습니다.")
      }
      setInstanceDialogOpen(false)
      setInstanceEditing(null)
      await fetchInstances()
    } catch (e) {
      console.error(e)
      alert("저장 중 오류가 발생했습니다.")
    } finally {
      setInstanceSaving(false)
    }
  }

  function openAccessCreate() {
    setAccessEditing(null)
    setAccessForm(ACCESS_EMPTY)
    setAccessDialogOpen(true)
  }

  function openAccessEdit(row: TenantServiceAccessRow) {
    setAccessEditing(row)
    setAccessForm({
      tenant_id: row.tenant_id || "",
      service_id: row.service_id || "",
      status: row.status || "active",
      access_level: row.access_level || "standard",
      rate_limit: row.rate_limit ? JSON.stringify(row.rate_limit, null, 2) : "",
      config: row.config ? JSON.stringify(row.config, null, 2) : "",
      expires_at: toDateTimeLocal(row.expires_at || null),
    })
    setAccessDialogOpen(true)
  }

  async function saveAccess() {
    const rateLimitValue = parseJson(accessForm.rate_limit)
    if (rateLimitValue === null) return alert("Rate Limit JSON 형식이 올바르지 않습니다.")
    const configValue = parseJson(accessForm.config)
    if (configValue === null) return alert("Config JSON 형식이 올바르지 않습니다.")
    if (!accessForm.tenant_id.trim()) return alert("tenant_id를 입력해 주세요.")
    if (!accessForm.service_id.trim()) return alert("service_id를 입력해 주세요.")

    const payload = {
      tenant_id: accessForm.tenant_id.trim(),
      service_id: accessForm.service_id.trim(),
      status: accessForm.status,
      access_level: accessForm.access_level,
      rate_limit: rateLimitValue,
      config: configValue,
      expires_at: accessForm.expires_at ? new Date(accessForm.expires_at).toISOString() : null,
    }

    try {
      setAccessSaving(true)
      const res = await adminFetch(accessEditing ? `${ACCESS_API}/${accessEditing.id}` : ACCESS_API, {
        method: accessEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        return alert(json.message || "저장에 실패했습니다.")
      }
      setAccessDialogOpen(false)
      setAccessEditing(null)
      await fetchAccess()
    } catch (e) {
      console.error(e)
      alert("저장 중 오류가 발생했습니다.")
    } finally {
      setAccessSaving(false)
    }
  }

  const servicePageCount = Math.max(1, Math.ceil(serviceTotal / serviceLimit))
  const instancePageCount = Math.max(1, Math.ceil(instanceTotal / instanceLimit))
  const accessPageCount = Math.max(1, Math.ceil(accessTotal / accessLimit))

  return (
    <AdminPage
      headerContent={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchServices} disabled={serviceLoading}>
            {serviceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">서비스 새로고침</span>
          </Button>
          <Button size="sm" onClick={openServiceCreate}>
            <Plus className="h-4 w-4 mr-1" />
            서비스 등록
          </Button>
          <Button variant="outline" size="sm" onClick={fetchInstances} disabled={instanceLoading}>
            {instanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">인스턴스 새로고침</span>
          </Button>
          <Button size="sm" onClick={openInstanceCreate}>
            <Plus className="h-4 w-4 mr-1" />
            인스턴스 등록
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAccess} disabled={accessLoading}>
            {accessLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">접근 새로고침</span>
          </Button>
          <Button size="sm" onClick={openAccessCreate}>
            <Plus className="h-4 w-4 mr-1" />
            접근 등록
          </Button>
        </div>
      }
    >
      <div className="space-y-1">
        <div className="text-xl font-semibold">서비스(Services) 관리</div>
        <div className="text-sm text-muted-foreground">
          마이크로서비스 정의, 테넌트 인스턴스, 접근 권한을 통합 관리합니다.
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="services">서비스 정의</TabsTrigger>
          <TabsTrigger value="instances">서비스 인스턴스</TabsTrigger>
          <TabsTrigger value="access">테넌트 접근</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="서비스명/슬러그" value={serviceQ} onChange={(e) => setServiceQ(e.target.value)} />
            </div>
            <div className="w-full md:w-40 space-y-1">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select value={serviceStatus} onValueChange={setServiceStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  {SERVICE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2" />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>서비스</TableHead>
                  <TableHead>버전</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>수정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceRows.length === 0 && !serviceLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      표시할 서비스가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {serviceLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {serviceRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.slug}</div>
                    </TableCell>
                    <TableCell className="text-sm">{row.version}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadge(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.description || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatJsonPreview(row.config)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openServiceEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              총 {serviceTotal}건 / {servicePage + 1} of {servicePageCount}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={servicePage === 0 || serviceLoading}
                onClick={() => setServicePage((p) => p - 1)}
              >
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={servicePage + 1 >= servicePageCount || serviceLoading}
                onClick={() => setServicePage((p) => p + 1)}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="instances" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="인스턴스/서비스/테넌트" value={instanceQ} onChange={(e) => setInstanceQ(e.target.value)} />
            </div>
            <div className="w-full md:w-40 space-y-1">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select value={instanceStatus} onValueChange={setInstanceStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  {INSTANCE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-52 space-y-1">
              <div className="text-xs text-muted-foreground">서비스 ID</div>
              <Input value={instanceServiceId} onChange={(e) => setInstanceServiceId(e.target.value)} placeholder="service_id" />
            </div>
            <div className="w-full md:w-52 space-y-1">
              <div className="text-xs text-muted-foreground">테넌트 ID</div>
              <Input value={instanceTenantId} onChange={(e) => setInstanceTenantId(e.target.value)} placeholder="tenant_id" />
            </div>
            <div className="w-full md:w-40 space-y-1">
              <div className="text-xs text-muted-foreground">Region</div>
              <Input value={instanceRegion} onChange={(e) => setInstanceRegion(e.target.value)} placeholder="region" />
            </div>
            <div className="flex items-center gap-2" />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>서비스</TableHead>
                  <TableHead>테넌트</TableHead>
                  <TableHead>인스턴스</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>엔드포인트/리전</TableHead>
                  <TableHead>헬스체크</TableHead>
                  <TableHead>수정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instanceRows.length === 0 && !instanceLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      표시할 인스턴스가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {instanceLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {instanceRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="text-sm">{row.service_name || row.service_id}</div>
                      <div className="text-xs text-muted-foreground">{row.service_slug || row.service_id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{row.tenant_name || row.tenant_id}</div>
                      <div className="text-xs text-muted-foreground">{row.tenant_slug || row.tenant_id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{row.instance_name}</div>
                      <div className="text-xs text-muted-foreground">{row.region || "-"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadge(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{row.endpoint_url || "-"}</div>
                      <div>{row.region || "-"}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.health_check_url || "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openInstanceEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              총 {instanceTotal}건 / {instancePage + 1} of {instancePageCount}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={instancePage === 0 || instanceLoading}
                onClick={() => setInstancePage((p) => p - 1)}
              >
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={instancePage + 1 >= instancePageCount || instanceLoading}
                onClick={() => setInstancePage((p) => p + 1)}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="access" className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground">검색</div>
              <Input placeholder="서비스/테넌트" value={accessQ} onChange={(e) => setAccessQ(e.target.value)} />
            </div>
            <div className="w-full md:w-40 space-y-1">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select value={accessStatus} onValueChange={setAccessStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  {ACCESS_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-40 space-y-1">
              <div className="text-xs text-muted-foreground">레벨</div>
              <Select value={accessLevel} onValueChange={setAccessLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="access_level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>전체</SelectItem>
                  {ACCESS_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-52 space-y-1">
              <div className="text-xs text-muted-foreground">테넌트 ID</div>
              <Input value={accessTenantId} onChange={(e) => setAccessTenantId(e.target.value)} placeholder="tenant_id" />
            </div>
            <div className="w-full md:w-52 space-y-1">
              <div className="text-xs text-muted-foreground">서비스 ID</div>
              <Input value={accessServiceId} onChange={(e) => setAccessServiceId(e.target.value)} placeholder="service_id" />
            </div>
            <div className="flex items-center gap-2" />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>테넌트</TableHead>
                  <TableHead>서비스</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>레벨</TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>만료</TableHead>
                  <TableHead>수정</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessRows.length === 0 && !accessLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      표시할 접근 권한이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {accessLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : null}
                {accessRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="text-sm">{row.tenant_name || row.tenant_id}</div>
                      <div className="text-xs text-muted-foreground">{row.tenant_slug || row.tenant_id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{row.service_name || row.service_id}</div>
                      <div className="text-xs text-muted-foreground">{row.service_slug || row.service_id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadge(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.access_level}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatJsonPreview(row.rate_limit)}</TableCell>
                    <TableCell>
                      <div className="text-sm">{fmtDate(row.expires_at || null)}</div>
                      <div className="text-xs text-muted-foreground">부여: {fmtDate(row.granted_at)}</div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openAccessEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              총 {accessTotal}건 / {accessPage + 1} of {accessPageCount}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={accessPage === 0 || accessLoading}
                onClick={() => setAccessPage((p) => p - 1)}
              >
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={accessPage + 1 >= accessPageCount || accessLoading}
                onClick={() => setAccessPage((p) => p + 1)}
              >
                다음
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{serviceEditing ? "서비스 수정" : "서비스 등록"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">서비스명</div>
              <Input value={serviceForm.name} onChange={(e) => setServiceForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">슬러그</div>
              <Input value={serviceForm.slug} onChange={(e) => setServiceForm((p) => ({ ...p, slug: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">버전</div>
              <Input
                value={serviceForm.version}
                onChange={(e) => setServiceForm((p) => ({ ...p, version: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select value={serviceForm.status} onValueChange={(value) => setServiceForm((p) => ({ ...p, status: value as ServiceRow["status"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="status" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">설명</div>
              <Textarea
                value={serviceForm.description}
                onChange={(e) => setServiceForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">Config (JSON)</div>
              <Textarea
                value={serviceForm.config}
                onChange={(e) => setServiceForm((p) => ({ ...p, config: e.target.value }))}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceDialogOpen(false)}>
              닫기
            </Button>
            <Button onClick={saveService} disabled={serviceSaving}>
              {serviceSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={instanceDialogOpen} onOpenChange={setInstanceDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{instanceEditing ? "서비스 인스턴스 수정" : "서비스 인스턴스 등록"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">서비스 ID</div>
              <Input
                value={instanceForm.service_id}
                onChange={(e) => setInstanceForm((p) => ({ ...p, service_id: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">테넌트 ID</div>
              <Input
                value={instanceForm.tenant_id}
                onChange={(e) => setInstanceForm((p) => ({ ...p, tenant_id: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">인스턴스명</div>
              <Input
                value={instanceForm.instance_name}
                onChange={(e) => setInstanceForm((p) => ({ ...p, instance_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">엔드포인트 URL</div>
              <Input
                value={instanceForm.endpoint_url}
                onChange={(e) => setInstanceForm((p) => ({ ...p, endpoint_url: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">Region</div>
              <Input value={instanceForm.region} onChange={(e) => setInstanceForm((p) => ({ ...p, region: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">상태</div>
              <Select
                value={instanceForm.status}
                onValueChange={(value) => setInstanceForm((p) => ({ ...p, status: value as ServiceInstanceRow["status"] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="status" />
                </SelectTrigger>
                <SelectContent>
                  {INSTANCE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">헬스체크 URL</div>
              <Input
                value={instanceForm.health_check_url}
                onChange={(e) => setInstanceForm((p) => ({ ...p, health_check_url: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">Config (JSON)</div>
              <Textarea
                value={instanceForm.config}
                onChange={(e) => setInstanceForm((p) => ({ ...p, config: e.target.value }))}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstanceDialogOpen(false)}>
              닫기
            </Button>
            <Button onClick={saveInstance} disabled={instanceSaving}>
              {instanceSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{accessEditing ? "테넌트 접근 수정" : "테넌트 접근 등록"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">테넌트 ID</div>
              <Input
                value={accessForm.tenant_id}
                onChange={(e) => setAccessForm((p) => ({ ...p, tenant_id: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">서비스 ID</div>
              <Input
                value={accessForm.service_id}
                onChange={(e) => setAccessForm((p) => ({ ...p, service_id: e.target.value }))}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">상태</div>
                <Select
                  value={accessForm.status}
                  onValueChange={(value) =>
                    setAccessForm((p) => ({ ...p, status: value as TenantServiceAccessRow["status"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="status" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">레벨</div>
                <Select
                  value={accessForm.access_level}
                  onValueChange={(value) =>
                    setAccessForm((p) => ({ ...p, access_level: value as TenantServiceAccessRow["access_level"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="access_level" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">만료 시각</div>
              <Input
                type="datetime-local"
                value={accessForm.expires_at}
                onChange={(e) => setAccessForm((p) => ({ ...p, expires_at: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">Rate Limit (JSON)</div>
              <Textarea
                value={accessForm.rate_limit}
                onChange={(e) => setAccessForm((p) => ({ ...p, rate_limit: e.target.value }))}
                rows={5}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-xs text-muted-foreground">Config (JSON)</div>
              <Textarea
                value={accessForm.config}
                onChange={(e) => setAccessForm((p) => ({ ...p, config: e.target.value }))}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessDialogOpen(false)}>
              닫기
            </Button>
            <Button onClick={saveAccess} disabled={accessSaving}>
              {accessSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
