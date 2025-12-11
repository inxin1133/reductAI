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
import { Pencil, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
}

interface Role {
  id: string
  name: string
  is_global: boolean
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const API_URL = "http://localhost:3002/api/users"
const ROLES_API_URL = "http://localhost:3002/api/roles"

export default function UserManager() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<{
    full_name: string
    status: string
    email_verified: boolean
    role_id: string
  }>({
    full_name: "",
    status: "active",
    email_verified: false,
    role_id: "",
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
      const response = await fetch(ROLES_API_URL, { headers: authHeaders() })
      if (response.ok) {
        const data = await response.json()
        setRoles(data)
      }
    } catch (error) {
      console.error("Failed to fetch roles", error)
    }
  }

  const fetchUsers = async () => {
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
        setUsers(data.users)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error("Failed to fetch users", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPagination(prev => ({ ...prev, page: 1 })) // Reset to page 1 on search
  }

  const getDefaultRoleId = () => {
    const lower = roles.map(r => ({ ...r, ln: r.name.toLowerCase() }))
    return (
      lower.find(r => r.ln === "user")?.id ||
      lower.find(r => r.ln.includes("user"))?.id ||
      roles[0]?.id ||
      ""
    )
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      full_name: user.full_name || "",
      status: user.status,
      email_verified: user.email_verified,
      role_id: user.role_id || getDefaultRoleId(),
    })
    setIsDialogOpen(true)
  }

  // If roles load after opening dialog and no role is selected, apply default role automatically
  useEffect(() => {
    if (isDialogOpen && editingUser && !formData.role_id && roles.length > 0) {
      setFormData(prev => ({ ...prev, role_id: prev.role_id || getDefaultRoleId() }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles])

  const handleSubmit = async () => {
    if (!editingUser) return
    const roleToUse = formData.role_id || getDefaultRoleId()
    if (!roleToUse) {
      alert("부여할 역할을 선택해주세요. (roles에 등록된 역할 중 하나)")
      return
    }

    try {
      setIsSaving(true)
      const response = await fetch(`${API_URL}/${editingUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ ...formData, role_id: roleToUse }),
      })

      if (response.ok) {
        setIsDialogOpen(false)
        fetchUsers()
      } else {
        const msg = await response.text()
        alert(`사용자 업데이트 실패: ${msg || "알 수 없는 오류"}`)
        console.error("Failed to update user", msg)
      }
    } catch (error) {
      console.error("Failed to update user", error)
      alert("사용자 업데이트 중 오류가 발생했습니다.")
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

  return (
    <div className="space-y-4 bg-background">
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
            placeholder="이메일 또는 이름 검색..." 
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
              <TableHead>이메일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>역할</TableHead> {/* New Role Column */}
              <TableHead>이메일 인증</TableHead>
              <TableHead>마지막 로그인</TableHead>
              <TableHead>가입일</TableHead>
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
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  등록된 사용자가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name || '-'}</TableCell>
                  <TableCell>{user.email}</TableCell>
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
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-'}
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
            <DialogTitle>사용자 정보 수정</DialogTitle>
            <DialogDescription>
              사용자 상태 및 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">이메일</Label>
              <div className="col-span-3 text-sm font-medium">{editingUser?.email}</div>
            </div>
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
                      {role.name}
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
    </div>
  )
}
