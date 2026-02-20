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
import { Pencil, Trash2, Loader2, Search, Building2, ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { AdminPage } from "@/components/layout/AdminPage"

interface Tenant {
  id: string
  name: string
  slug: string
  domain: string | null
  tenant_type: 'personal' | 'team' | 'group'
  status: 'active' | 'inactive' | 'suspended'
  owner_id: string
  owner_name?: string
  owner_email?: string
  member_limit?: number | null
  current_member_count?: number | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const API_URL = "http://localhost:3003/api/tenants"

export default function TenantManager() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    slug: string
    domain: string
    tenant_type: 'personal' | 'team' | 'group'
    status: 'active' | 'inactive' | 'suspended'
    owner_id: string
    member_limit: string
  }>({
    name: "",
    slug: "",
    domain: "",
    tenant_type: "personal",
    status: "active",
    owner_id: "",
    member_limit: "",
  })

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  useEffect(() => {
    fetchTenants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search])

  const fetchTenants = async () => {
    setIsLoading(true)
    try {
      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        search,
      })
      const response = await fetch(`${API_URL}?${queryParams}`, { headers: authHeaders() })
      if (response.ok) {
        const data = await response.json()
        setTenants(data.tenants)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error("Failed to fetch tenants", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (tenant: Tenant) => {
    setEditingTenant(tenant)
    setFormData({
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain || "",
      tenant_type: tenant.tenant_type,
      status: tenant.status,
      owner_id: tenant.owner_id,
      member_limit: tenant.member_limit !== null && tenant.member_limit !== undefined ? String(tenant.member_limit) : "",
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까? 테넌트에 속한 데이터가 모두 삭제될 수 있습니다.")) return

    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      if (response.ok) {
        fetchTenants()
      } else {
        alert("삭제 실패")
      }
    } catch (error) {
      console.error("Failed to delete tenant", error)
    }
  }

  const handleSubmit = async () => {
    if (!editingTenant) {
      alert("테넌트는 별도로 생성할 수 없습니다.")
      return
    }

    try {
      const payload = {
        ...formData,
        // 서비스 구독으로 결정되는 값들은 수정 불가
        tenant_type: editingTenant.tenant_type,
        member_limit: editingTenant.member_limit ?? null,
      }
      
      const response = await fetch(`${API_URL}/${editingTenant.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        setIsDialogOpen(false)
        fetchTenants()
      } else {
        const errorData = await response.json();
        alert(`저장 실패: ${errorData.message || '알 수 없는 오류'}\n${errorData.details || ''}`);
      }
    } catch (error) {
      console.error("Failed to save tenant", error)
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'suspended': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <AdminPage>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            시스템 내 테넌트(조직/워크스페이스)를 관리합니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); setPagination(prev => ({...prev, page: 1})); }} className="flex gap-2">
          <Input 
            placeholder="테넌트 이름 또는 Slug 검색..." 
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
              <TableHead>이름</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>멤버</TableHead>
              <TableHead>소유자</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  등록된 테넌트가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((tenant) => {
                const isSystem = tenant.slug === "system" || (tenant.metadata as { system?: boolean } | null)?.system === true
                return (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{tenant.name}</span>
                      {isSystem ? (
                        <Badge variant="outline" className="text-xs">
                          시스템
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      <span className="block max-w-[120px] truncate" title={tenant.slug}>
                        {tenant.slug}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {tenant.tenant_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="text-foreground">
                      {(tenant.current_member_count ?? 0).toLocaleString()}
                    </span>
                    <span className="text-muted-foreground"> / </span>
                    <span className="text-muted-foreground">
                      {tenant.member_limit === null || tenant.member_limit === undefined
                        ? "∞"
                        : tenant.member_limit.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {tenant.owner_name ? (
                        <div className="flex flex-col">
                            <span>{tenant.owner_name}</span>
                            <span className="text-xs text-muted-foreground">{tenant.owner_email}</span>
                        </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`border-0 ${getStatusColor(tenant.status)}`}>
                      {tenant.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(tenant)}
                        disabled={isSystem}
                        aria-disabled={isSystem}
                        title={isSystem ? "system 테넌트는 수정할 수 없습니다." : "수정"}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(tenant.id)}
                        disabled={isSystem}
                        aria-disabled={isSystem}
                        title={isSystem ? "system 테넌트는 삭제할 수 없습니다." : "삭제"}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )})
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          Total {pagination.total} tenants
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>테넌트 수정</DialogTitle>
            <DialogDescription>
              테넌트 정보를 입력하세요.
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
                placeholder="예: My Company"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slug" className="text-right">
                Slug
              </Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="col-span-3"
                placeholder="예: my-company"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="domain" className="text-right">
                도메인
              </Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                className="col-span-3"
                placeholder="예: example.com (선택)"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="tenant_type" className="text-right">
                유형
              </Label>
              <div className="col-span-3 text-sm p-2 bg-muted rounded">
                유형 변경 불가
                <span className="text-muted-foreground">
                  {" "}
                  (현재: {editingTenant?.tenant_type ?? formData.tenant_type})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="owner_id" className="text-right">
                소유자
              </Label>
              <div className="col-span-3 text-sm p-2 bg-muted rounded">
                소유자 변경 불가
                {editingTenant ? (
                  <span className="text-muted-foreground">
                    {" "}
                    (현재: {editingTenant.owner_name || editingTenant.owner_id}
                    {editingTenant.owner_email ? ` / ${editingTenant.owner_email}` : ""})
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                상태
              </Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData({ ...formData, status: value as Tenant["status"] })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="member_limit" className="text-right">
                멤버 한도
              </Label>
              <div className="col-span-3 text-sm p-2 bg-muted rounded">
                멤버 한도 변경 불가
                <span className="text-muted-foreground">
                  {" "}
                  (현재:{" "}
                  {editingTenant?.member_limit === null || editingTenant?.member_limit === undefined
                    ? "∞"
                    : editingTenant.member_limit.toLocaleString()}
                  )
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}

