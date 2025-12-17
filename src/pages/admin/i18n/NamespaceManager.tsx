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
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Plus, Pencil, Trash2, Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAdminHeaderActionContext } from "@/contexts/AdminHeaderActionContext"
import { useEffect as useEffectReact } from "react"

// 네임스페이스 인터페이스 정의
interface Namespace {
  id: string
  name: string
  description: string
  service_name: string
  is_system: boolean
  created_at: string
}

// API 엔드포인트 설정
const API_URL = "http://localhost:3006/api/i18n/namespaces"

export default function NamespaceManager() {
  const { setAction, setTitle } = useAdminHeaderActionContext()
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingNamespace, setEditingNamespace] = useState<Namespace | null>(null)
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  })
  
  // 폼 데이터 상태
  const [formData, setFormData] = useState<{
    name: string
    description: string
    service_name: string
    is_system: boolean
  }>({
    name: "",
    description: "",
    service_name: "",
    is_system: false,
  })

  // 인증 헤더 가져오기
  const authHeaders = () => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  // 초기 로딩 및 검색/페이지 변경 시 데이터 호출
  useEffect(() => {
    setTitle("다국어(i18n) > 네임스페이스 관리")
    fetchNamespaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search])

  // 네임스페이스 목록 조회
  const fetchNamespaces = async () => {
    setIsLoading(true)
    try {
      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        search,
      })
      const response = await fetch(`${API_URL}?${queryParams}`, { headers: { ...authHeaders() } })
      if (response.ok) {
        const data = await response.json()
        setNamespaces(data.namespaces)
        setPagination(data.pagination)
      } else {
        const errorData = await response.json();
        alert(`목록을 불러오는데 실패했습니다: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error("Failed to fetch namespaces", error)
      alert("서버 통신 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false)
    }
  }

  // 생성 다이얼로그 열기
  const handleCreate = () => {
    setEditingNamespace(null)
    setFormData({
      name: "",
      description: "",
      service_name: "",
      is_system: false,
    })
    setIsDialogOpen(true)
  }

  // 헤더 액션 버튼 설정 (추가 버튼)
  useEffectReact(() => {
    setAction(
      <Button onClick={handleCreate} size="sm">
        <Plus className="mr-2 h-4 w-4" /> 네임스페이스 추가
      </Button>
    )
    return () => setAction(null)
  }, [setAction])

  // 수정 다이얼로그 열기
  const handleEdit = (ns: Namespace) => {
    setEditingNamespace(ns)
    setFormData({
      name: ns.name,
      description: ns.description || "",
      service_name: ns.service_name || "",
      is_system: ns.is_system,
    })
    setIsDialogOpen(true)
  }

  // 삭제 처리
  const handleDelete = async (id: string, is_system: boolean) => {
    if (is_system) {
        alert("시스템 네임스페이스는 삭제할 수 없습니다.");
        return;
    }
    if (!confirm("정말 삭제하시겠습니까? 연결된 번역 키들도 모두 삭제될 수 있습니다.")) return

    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      if (response.ok) {
        fetchNamespaces()
      } else {
        const errorData = await response.json();
        alert(`삭제 실패: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error("Failed to delete namespace", error)
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  }

  // 폼 제출 (생성/수정)
  const handleSubmit = async () => {
    try {
      const method = editingNamespace ? "PUT" : "POST"
      const url = editingNamespace ? `${API_URL}/${editingNamespace.id}` : API_URL
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setIsDialogOpen(false)
        fetchNamespaces()
      } else {
        const errorData = await response.json();
        alert(`저장 실패: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error("Failed to save namespace", error)
      alert("서버 통신 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="space-y-4 bg-background">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground">
            번역 키를 그룹화하여 관리하는 네임스페이스를 설정합니다.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); setPagination(prev => ({...prev, page: 1})); }} className="flex gap-2">
          <Input 
            placeholder="이름, 설명 또는 서비스명 검색..." 
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
              <TableHead>서비스</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>시스템</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : namespaces.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  등록된 네임스페이스가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              namespaces.map((ns) => (
                <TableRow key={ns.id}>
                  <TableCell className="font-medium">{ns.name}</TableCell>
                  <TableCell>
                    {ns.service_name ? <Badge variant="outline">{ns.service_name}</Badge> : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{ns.description}</TableCell>
                  <TableCell>
                    {ns.is_system && (
                      <Badge variant="secondary">System</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(ns.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(ns)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(ns.id, ns.is_system)}
                        disabled={ns.is_system}
                        className={ns.is_system ? "opacity-50 cursor-not-allowed" : ""}
                      >
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

      {/* 페이지네이션 */}
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
          disabled={pagination.page <= 1}
        >
          이전
        </Button>
        <div className="text-sm font-medium">
          페이지 {pagination.page} / {pagination.totalPages || 1}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
          disabled={pagination.page >= pagination.totalPages}
        >
          다음
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingNamespace ? "네임스페이스 수정" : "네임스페이스 추가"}</DialogTitle>
            <DialogDescription>
              네임스페이스 정보를 입력하세요. 시스템 네임스페이스는 신중하게 관리해야 합니다.
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
                placeholder="예: common, auth"
                disabled={!!editingNamespace && editingNamespace.is_system} // 시스템 네임스페이스 이름 변경 주의
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="service_name" className="text-right">
                서비스
              </Label>
              <Input
                id="service_name"
                value={formData.service_name}
                onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
                className="col-span-3"
                placeholder="예: auth-service"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                설명
              </Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="col-span-3"
                placeholder="설명을 입력하세요"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_system" className="text-right">
                시스템 여부
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Switch
                  id="is_system"
                  checked={formData.is_system}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_system: checked })}
                  disabled={editingNamespace?.is_system} // 이미 시스템인 경우 해제 불가 권장
                />
                <Label htmlFor="is_system" className="text-sm text-muted-foreground">
                  시스템 네임스페이스로 지정 (삭제 불가)
                </Label>
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

