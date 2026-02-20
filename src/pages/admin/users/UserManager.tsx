import { useEffect, useState } from "react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Pencil, Loader2, ChevronLeft, ChevronRight, Search, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { AdminPage } from "@/components/layout/AdminPage"
import { type PlanTier, PLAN_TIER_LABELS, PLAN_TIER_STYLES } from "@/lib/planTier"

interface User {
  id: string
  email: string
  full_name: string
  status: 'active' | 'inactive' | 'suspended' | 'locked'
  email_verified: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
  role_name?: string
  role_slug?: string
  role_id?: string
  tenant_id?: string | null
  tenant_name?: string | null
  tenant_slug?: string | null
  tenant_domain?: string | null
  tenant_type?: 'personal' | 'team' | 'group' | null
  tenant_plan_tier?: string | null
  tenant_current_member_count?: number | null
  tenant_included_seats?: number | null
}

interface Role {
  id: string
  name: string
  slug?: string
  scope: 'platform' | 'tenant_base' | 'tenant_custom'
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface TenantMemberRow {
  id: string
  user_id: string
  tenant_id: string
  role_id?: string | null
  membership_status?: string | null
  user_email?: string | null
  user_name?: string | null
  role_name?: string | null
  role_slug?: string | null
}

const API_PATH = "/api/users"
const ROLES_API_PATH = "/api/roles"

const readResponseErrorMessage = async (response: Response) => {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null)
    const msg = typeof data?.message === "string" ? data.message : ""
    const details = typeof data?.details === "string" ? data.details : ""
    const combined = [msg, details].filter(Boolean).join("\n").trim()
    return combined || response.statusText
  }

  const text = await response.text().catch(() => "")
  const m = text.match(/<pre>\s*(Cannot[^<]+)\s*<\/pre>/i)
  return m?.[1]?.trim() || text.trim() || response.statusText
}

export default function UserManager() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [memberPopoverTenantId, setMemberPopoverTenantId] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState("")
  const [memberListByTenant, setMemberListByTenant] = useState<Record<string, TenantMemberRow[]>>({})
  const [memberLoadingByTenant, setMemberLoadingByTenant] = useState<Record<string, boolean>>({})
  const [memberErrorByTenant, setMemberErrorByTenant] = useState<Record<string, string>>({})
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<{
    email: string
    password: string
    full_name: string
    status: string
    email_verified: boolean
    role_id: string
    tenant_name: string
    tenant_slug: string
    tenant_domain: string
  }>({
    email: "",
    password: "",
    full_name: "",
    status: "active",
    email_verified: false,
    role_id: "",
    tenant_name: "",
    tenant_slug: "",
    tenant_domain: "",
  })
  const [isSaving, setIsSaving] = useState(false)

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  useEffect(() => {
    fetchUsers()
    fetchRoles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search])

  const fetchRoles = async () => {
    try {
      // Fetch global roles or all roles?
      // Since we are likely assigning global roles to system users, let's filter or just fetch all.
      // Backend getRoles supports tenant_id filtering, but without it returns all?
      const response = await fetch(`${ROLES_API_PATH}?scope=platform`, { headers: authHeaders() })
      if (response.ok) {
        const data = await response.json()
        setRoles(data)
      } else {
        const msg = await readResponseErrorMessage(response)
        console.error("Failed to fetch roles", msg)
      }
    } catch (error) {
      console.error("Failed to fetch roles", error)
    }
  }

  const fetchUsers = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        search,
      })
      const response = await fetch(`${API_PATH}?${queryParams}`, { headers: authHeaders() })
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
        setPagination(data.pagination)
      } else {
        const msg = await readResponseErrorMessage(response)
        setUsers([])
        setErrorMessage(msg || "사용자 목록을 불러오지 못했습니다.")
      }
    } catch (error) {
      console.error("Failed to fetch users", error)
      setUsers([])
      setErrorMessage("서버 통신 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchTenantMembers = async (tenantId: string) => {
    if (!tenantId) return
    setMemberLoadingByTenant((prev) => ({ ...prev, [tenantId]: true }))
    setMemberErrorByTenant((prev) => ({ ...prev, [tenantId]: "" }))
    try {
      const params = new URLSearchParams({
        tenant_id: tenantId,
        status: "active",
        limit: "200",
      })
      const response = await fetch(`/api/tenants/memberships?${params.toString()}`, { headers: authHeaders() })
      if (!response.ok) {
        const msg = await readResponseErrorMessage(response)
        throw new Error(msg || "멤버 목록을 불러오지 못했습니다.")
      }
      const data = await response.json()
      const rows = Array.isArray(data?.rows) ? data.rows : []
      setMemberListByTenant((prev) => ({ ...prev, [tenantId]: rows }))
    } catch (error) {
      const message = error instanceof Error ? error.message : "멤버 목록 로드 실패"
      setMemberListByTenant((prev) => ({ ...prev, [tenantId]: [] }))
      setMemberErrorByTenant((prev) => ({ ...prev, [tenantId]: message }))
    } finally {
      setMemberLoadingByTenant((prev) => ({ ...prev, [tenantId]: false }))
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPagination(prev => ({ ...prev, page: 1 })) // Reset to page 1 on search
  }

  const getDefaultRoleId = () => {
    const lower = roles.map(r => ({
      ...r,
      ln: r.name.toLowerCase(),
      sl: (r.slug || "").toLowerCase(),
    }))
    return (
      lower.find(r => r.sl === "user" || r.ln === "user")?.id ||
      lower.find(r => r.sl.includes("user") || r.ln.includes("user"))?.id ||
      roles[0]?.id ||
      ""
    )
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      email: user.email || "",
      password: "",
      full_name: user.full_name || "",
      status: user.status,
      email_verified: user.email_verified,
      role_id: user.role_id || getDefaultRoleId(),
      tenant_name: user.tenant_name || "",
      tenant_slug: user.tenant_slug || "",
      tenant_domain: user.tenant_domain || "",
    })
    setIsDialogOpen(true)
  }

  const handleCreate = () => {
    setEditingUser(null)
    setFormData({
      email: "",
      password: "",
      full_name: "",
      status: "active",
      email_verified: false,
      role_id: getDefaultRoleId(),
      tenant_name: "",
      tenant_slug: "",
      tenant_domain: "",
    })
    setIsDialogOpen(true)
  }

  // If roles load after opening dialog and no role is selected, apply default role automatically
  useEffect(() => {
    if (isDialogOpen && !formData.role_id && roles.length > 0) {
      setFormData(prev => ({ ...prev, role_id: prev.role_id || getDefaultRoleId() }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles])

  const handleSubmit = async () => {
    const roleToUse = formData.role_id || getDefaultRoleId()
    if (!roleToUse) {
      alert("부여할 역할을 선택해주세요. (roles에 등록된 역할 중 하나)")
      return
    }

    try {
      setIsSaving(true)
      if (editingUser) {
        const response = await fetch(`${API_PATH}/${editingUser.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            full_name: formData.full_name,
            status: formData.status,
            email_verified: formData.email_verified,
            role_id: roleToUse,
            tenant_name: formData.tenant_name,
            tenant_slug: formData.tenant_slug,
            tenant_domain: formData.tenant_domain,
          }),
        })

        if (response.ok) {
          setIsDialogOpen(false)
          fetchUsers()
        } else {
          const msg = await readResponseErrorMessage(response)
          alert(`사용자 업데이트 실패: ${msg || "알 수 없는 오류"}`)
          console.error("Failed to update user", msg)
        }
      } else {
        if (!formData.email.trim() || !formData.password.trim()) {
          alert("이메일과 비밀번호는 필수입니다.")
          return
        }
        const response = await fetch(API_PATH, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            email: formData.email.trim(),
            password: formData.password,
            full_name: formData.full_name.trim(),
            status: formData.status,
            email_verified: formData.email_verified,
            role_id: roleToUse,
          }),
        })

        if (response.ok) {
          setIsDialogOpen(false)
          fetchUsers()
        } else {
          const msg = await readResponseErrorMessage(response)
          alert(`사용자 생성 실패: ${msg || "알 수 없는 오류"}`)
          console.error("Failed to create user", msg)
        }
      }
    } catch (error) {
      console.error("Failed to save user", error)
      alert("사용자 처리 중 오류가 발생했습니다.")
    } finally {
      setIsSaving(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'suspended': return 'bg-red-100 text-red-800'
      case 'locked': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const truncateText = (value: string, max: number) => {
    if (value.length <= max) return value
    return `${value.slice(0, max)}...`
  }

  const formatMemberCount = (current?: number | null, included?: number | null) => {
    const safeCurrent = Number.isFinite(current) ? Math.max(0, Number(current)) : 0
    const safeIncluded = Number.isFinite(included) && Number(included) > 0 ? Number(included) : 1
    return `${safeCurrent}/${safeIncluded}`
  }

  const filterMembers = (members: TenantMemberRow[]) => {
    const query = memberSearch.trim().toLowerCase()
    if (!query) return members
    return members.filter((member) => {
      const name = String(member.user_name || "").toLowerCase()
      const email = String(member.user_email || "").toLowerCase()
      const role = String(member.role_name || member.role_slug || "").toLowerCase()
      return name.includes(query) || email.includes(query) || role.includes(query)
    })
  }

  const renderPlanTierBadge = (tier?: string | null, tenantType?: string | null) => {
    const fallback = tenantType === "personal" ? "free" : "-"
    const rawTier = tier || fallback
    const key = String(rawTier || "").toLowerCase() as PlanTier
    const label = PLAN_TIER_LABELS[key] || rawTier || "-"
    const style = PLAN_TIER_STYLES[key]
    if (!style) {
      return <Badge variant="outline">{label}</Badge>
    }
    return (
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}>
        {label}
      </span>
    )
  }

  return (
    <AdminPage
      headerContent={
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" /> 사용자 생성
        </Button>
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            시스템 사용자 목록을 조회하고 관리합니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input 
            placeholder="이메일 또는 이름, 역할, 테넌트 검색" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[300px]"
          />
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4 mr-2" /> 검색
          </Button>
        </form>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름/이메일</TableHead>
              <TableHead>테넌트/Slug</TableHead>
              <TableHead>테넌트 유형</TableHead>
              <TableHead>서비스 등급</TableHead>
              <TableHead>멤버</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>이메일 인증</TableHead>
              <TableHead>마지막 로그인</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : errorMessage ? (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center text-destructive">
                  {errorMessage}
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center">
                  등록된 사용자가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium">{user.full_name || "-"}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <div>{user.tenant_name || "-"}</div>
                    <div
                      className="text-xs text-muted-foreground"
                      title={user.tenant_slug || ""}
                    >
                      {user.tenant_slug ? truncateText(user.tenant_slug, 10) : "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {user.tenant_type || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {renderPlanTierBadge(user.tenant_plan_tier, user.tenant_type)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Popover
                      open={memberPopoverTenantId === (user.tenant_id || null)}
                      onOpenChange={(open) => {
                        const nextId = open ? user.tenant_id || null : null
                        setMemberPopoverTenantId(nextId)
                        if (open && user.tenant_id) {
                          setMemberSearch("")
                          if (!memberListByTenant[user.tenant_id]) {
                            fetchTenantMembers(user.tenant_id)
                          }
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 font-mono text-xs"
                          disabled={!user.tenant_id}
                        >
                          {formatMemberCount(user.tenant_current_member_count, user.tenant_included_seats)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-3" align="start">
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">검색</div>
                          <Input
                            placeholder="이름/이메일/역할 검색"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                          />
                        </div>
                        <div className="mt-3 max-h-60 overflow-auto space-y-2">
                          {user.tenant_id ? (
                            (() => {
                              const tenantId = user.tenant_id
                              const loading = memberLoadingByTenant[tenantId]
                              const error = memberErrorByTenant[tenantId]
                              const members = filterMembers(memberListByTenant[tenantId] || [])

                              if (loading) {
                                return (
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    불러오는 중...
                                  </div>
                                )
                              }
                              if (error) {
                                return <div className="text-xs text-destructive">{error}</div>
                              }
                              if (members.length === 0) {
                                return <div className="text-xs text-muted-foreground">표시할 멤버가 없습니다.</div>
                              }

                              return members.map((member) => (
                                <div key={member.id} className="rounded-md border border-border/60 px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium">
                                      {member.user_name || member.user_email || "-"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {member.role_name || member.role_slug || "-"}
                                    </div>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    ({member.user_email || "-"})
                                  </div>
                                </div>
                              ))
                            })()
                          ) : (
                            <div className="text-xs text-muted-foreground">테넌트 정보가 없습니다.</div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`border-0 ${getStatusColor(user.status)}`}>
                      {user.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {user.role_name || user.role_slug || '미지정'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.email_verified ? (
                      <span className="text-green-600 font-medium text-xs">Verified</span>
                    ) : (
                      <span className="text-gray-400 font-medium text-xs">Unverified</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleString("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          Total {pagination.total} users
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <div className="inline-flex items-center text-sm font-medium">
            Page {pagination.page} of {pagination.totalPages || 1}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page >= pagination.totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? "사용자 정보 수정" : "사용자 생성"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "사용자 상태 및 정보를 수정합니다." : "새로운 사용자를 생성합니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {editingUser ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">이메일</Label>
                <div className="col-span-3 text-sm font-medium">{editingUser?.email}</div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email" className="text-right">
                    이메일
                  </Label>
                  <Input
                    id="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="col-span-3"
                    placeholder="user@example.com"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="password" className="text-right">
                    비밀번호
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="col-span-3"
                    placeholder="임시 비밀번호"
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="full_name" className="text-right">
                이름
              </Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="col-span-3"
              />
            </div>

            {editingUser ? (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tenant_name" className="text-right">
                    테넌트 이름
                  </Label>
                  <Input
                    id="tenant_name"
                    value={formData.tenant_name}
                    onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
                    className="col-span-3"
                    placeholder="테넌트 이름"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tenant_slug" className="text-right">
                    Slug
                  </Label>
                  <Input
                    id="tenant_slug"
                    value={formData.tenant_slug}
                    onChange={(e) => setFormData({ ...formData, tenant_slug: e.target.value })}
                    className="col-span-3"
                    placeholder="tenant-slug"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tenant_domain" className="text-right">
                    도메인
                  </Label>
                  <Input
                    id="tenant_domain"
                    value={formData.tenant_domain}
                    onChange={(e) => setFormData({ ...formData, tenant_domain: e.target.value })}
                    className="col-span-3"
                    placeholder="example.com"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">테넌트 유형</Label>
                  <div className="col-span-3 text-sm font-medium">
                    {editingUser?.tenant_type || "-"}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">서비스 등급</Label>
                  <div className="col-span-3 text-sm font-medium">
                    {renderPlanTierBadge(editingUser?.tenant_plan_tier, editingUser?.tenant_type)}
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">테넌트</Label>
                <div className="col-span-3 text-sm text-muted-foreground">
                  personal / free로 자동 생성됩니다.
                </div>
              </div>
            )}
            
            {/* Role Selection */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="role" className="text-right">
                역할
              </Label>
              <Select 
                value={formData.role_id} 
                onValueChange={(value) => setFormData({ ...formData, role_id: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name} {role.slug ? `(${role.slug})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                상태
              </Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email_verified" className="text-right">
                이메일 인증
              </Label>
              <Select 
                value={formData.email_verified ? "true" : "false"} 
                onValueChange={(value) => setFormData({ ...formData, email_verified: value === "true" })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Verification status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Verified</SelectItem>
                  <SelectItem value="false">Unverified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
