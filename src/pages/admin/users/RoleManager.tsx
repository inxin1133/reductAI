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
import { Textarea } from "@/components/ui/textarea"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Pencil, Trash2, Loader2, Plus, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAdminHeaderActionContext } from "@/contexts/AdminHeaderActionContext"
import { useEffect as useEffectReact } from "react"

interface Permission {
  id: string
  name: string
  slug: string
  resource: string
  action: string
  description: string
}

type RoleScope = "platform" | "tenant_base" | "tenant_custom"

interface Role {
  id: string
  name: string
  slug: string
  description: string
  scope: RoleScope
  tenant_id?: string | null
  is_system_role: boolean
  created_at: string
  permissions?: Permission[]
}

interface Tenant {
  id: string
  name: string
  slug: string
}

const API_URL = "http://localhost:3002/api"
const TENANTS_API_URL = "http://localhost:3003/api/tenants"

export default function RoleManager() {
  const { setAction } = useAdminHeaderActionContext()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    slug: string
    description: string
    scope: RoleScope
    tenant_id: string
    permissionIds: string[]
  }>({
    name: "",
    slug: "",
    description: "",
    scope: "platform",
    tenant_id: "",
    permissionIds: [],
  })

  const authHeaders = () => {
    const token = localStorage.getItem("token")
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  useEffect(() => {
    fetchRoles()
    fetchPermissions()
    fetchTenants()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchRoles = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${API_URL}/roles`, { headers: { ...authHeaders() } })
      if (response.ok) {
        const data = await response.json()
        setRoles(data)
      }
    } catch (error) {
      console.error("Failed to fetch roles", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPermissions = async () => {
    try {
      const response = await fetch(`${API_URL}/permissions`, { headers: { ...authHeaders() } })
      if (response.ok) {
        const data = await response.json()
        setPermissions(data)
      }
    } catch (error) {
      console.error("Failed to fetch permissions", error)
    }
  }

  const fetchTenants = async () => {
    try {
      const response = await fetch(`${TENANTS_API_URL}?limit=200`, { headers: { ...authHeaders() } })
      if (response.ok) {
        const data = await response.json()
        setTenants(data.tenants || [])
      }
    } catch (error) {
      console.error("Failed to fetch tenants", error)
    }
  }

  const handleCreate = () => {
    setEditingRole(null)
    setFormData({
      name: "",
      slug: "",
      description: "",
      scope: "platform",
      tenant_id: "",
      permissionIds: [],
    })
    setIsDialogOpen(true)
  }

  // 헤더 액션 등록 (역할 추가 버튼)
  useEffectReact(() => {
    setAction(
      <Button onClick={handleCreate} size="sm">
        <Plus className="mr-2 h-4 w-4" /> 역할 추가
      </Button>
    )
    return () => setAction(null)
  }, [setAction])

  const handleEdit = async (role: Role) => {
    // Fetch role details to get assigned permissions
    try {
      const response = await fetch(`${API_URL}/roles/${role.id}`, { headers: { ...authHeaders() } })
      if (response.ok) {
        const detailedRole = await response.json()
        setEditingRole(detailedRole)
        setFormData({
          name: detailedRole.name,
          slug: detailedRole.slug,
          description: detailedRole.description || "",
          scope: detailedRole.scope,
          tenant_id: detailedRole.tenant_id || "",
          permissionIds: detailedRole.permissions?.map((p: Permission) => p.id) || [],
        })
        setIsDialogOpen(true)
      }
    } catch (error) {
      console.error("Failed to fetch role details", error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까? 이 역할이 할당된 사용자의 권한이 제거될 수 있습니다.")) return

    try {
      const response = await fetch(`${API_URL}/roles/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      if (response.ok) {
        fetchRoles()
      } else {
        const errorData = await response.json();
        alert(`역할 삭제 실패: ${errorData.message}`);
      }
    } catch (error) {
      console.error("Failed to delete role", error)
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  }

  const handleSubmit = async () => {
    try {
      const method = editingRole ? "PUT" : "POST"
      const url = editingRole ? `${API_URL}/roles/${editingRole.id}` : `${API_URL}/roles`
      
      if (formData.scope === "tenant_custom" && !formData.tenant_id) {
        alert("테넌트 커스텀 역할은 테넌트 선택이 필요합니다.")
        return
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          description: formData.description,
          scope: formData.scope,
          tenant_id: formData.scope === "tenant_custom" ? formData.tenant_id : null,
          permissions: formData.permissionIds,
        }),
      })

      if (response.ok) {
        setIsDialogOpen(false)
        fetchRoles()
      } else {
        const errorData = await response.json();
        alert(`저장 실패: ${errorData.message || '알 수 없는 오류'}\n${errorData.details || ''}`);
      }
    } catch (error) {
      console.error("Failed to save role", error)
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  }

  const togglePermission = (permId: string) => {
    setFormData(prev => {
      const newIds = prev.permissionIds.includes(permId)
        ? prev.permissionIds.filter(id => id !== permId)
        : [...prev.permissionIds, permId]
      return { ...prev, permissionIds: newIds }
    })
  }

  const getTenantLabel = (tenantId?: string | null) => {
    if (!tenantId) return null
    const found = tenants.find(t => t.id === tenantId)
    return found ? `${found.name} (${found.slug})` : tenantId
  }

  // Group permissions by resource
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) acc[perm.resource] = []
    acc[perm.resource].push(perm)
    return acc
  }, {} as Record<string, Permission[]>)

  return (
    <div className="space-y-4 bg-background">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            시스템 역할 및 권한을 관리합니다.
          </p>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>식별자(Slug)</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>System</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  등록된 역할이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      {role.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {role.slug}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate" title={role.description}>
                    {role.description}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {role.scope === "platform" ? (
                        <Badge variant="default" className="bg-purple-100 text-purple-800 hover:bg-purple-200">Platform</Badge>
                      ) : role.scope === "tenant_base" ? (
                        <Badge variant="outline">Tenant Base</Badge>
                      ) : (
                        <Badge variant="outline">Tenant Custom</Badge>
                      )}
                    </div>
                    {role.scope === "tenant_custom" && role.tenant_id ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {getTenantLabel(role.tenant_id)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {role.is_system_role ? <Badge variant="secondary">System</Badge> : "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(role.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(role)} disabled={role.is_system_role}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(role.id)} disabled={role.is_system_role}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? "역할 수정" : "역할 추가"}</DialogTitle>
            <DialogDescription>
              역할 정보를 입력하고 권한을 할당하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                이름
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                placeholder="예: 일반 관리자"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slug" className="text-right">
                식별자
              </Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="col-span-3"
                placeholder="예: admin-basic"
                disabled={!!editingRole} // Slug usually shouldn't change
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                설명
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="col-span-3"
                placeholder="역할에 대한 설명을 입력하세요."
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="scope" className="text-right">
                범위
              </Label>
              <Select
                value={formData.scope}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    scope: value as RoleScope,
                    tenant_id: value === "tenant_custom" ? prev.tenant_id : "",
                  }))
                }
                disabled={!!editingRole?.is_system_role}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">Platform</SelectItem>
                  <SelectItem value="tenant_base">Tenant Base</SelectItem>
                  <SelectItem value="tenant_custom">Tenant Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.scope === "tenant_custom" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="tenant_id" className="text-right">
                  테넌트
                </Label>
                <Select
                  value={formData.tenant_id}
                  onValueChange={(value) => setFormData({ ...formData, tenant_id: value })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        테넌트가 없습니다.
                      </div>
                    ) : (
                      tenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.name} ({tenant.slug})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="border-t pt-4 mt-2">
              <Label className="mb-4 block text-base">권한 할당</Label>
              <div className="space-y-6">
                {Object.entries(groupedPermissions).map(([resource, perms]) => (
                  <div key={resource} className="space-y-3">
                    <h4 className="font-semibold text-sm capitalize flex items-center gap-2">
                      <Badge variant="secondary" className="uppercase">{resource}</Badge>
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {perms.map((perm) => (
                        <div key={perm.id} className="flex items-start space-x-2 border p-2 rounded-md hover:bg-accent/50">
                          <Checkbox 
                            id={perm.id} 
                            checked={formData.permissionIds.includes(perm.id)}
                            onCheckedChange={() => togglePermission(perm.id)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor={perm.id}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {perm.name}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {perm.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
