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
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { useEffect as useEffectReact } from "react"
import { useAdminHeaderActionContext } from "@/contexts/AdminHeaderActionContext"

interface Language {
  id: string
  code: string
  name: string
  native_name: string
  direction: "ltr" | "rtl"
  is_active: boolean
  is_default: boolean
  flag_emoji: string
  display_order: number
}

const API_URL = "http://localhost:3006/api/i18n/languages"

export default function LanguageManager() {
  const { setAction } = useAdminHeaderActionContext()
  const [languages, setLanguages] = useState<Language[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingLanguage, setEditingLanguage] = useState<Language | null>(null)
  const [formData, setFormData] = useState<Partial<Language>>({
    code: "",
    name: "",
    native_name: "",
    direction: "ltr",
    is_active: true,
    is_default: false,
    flag_emoji: "",
    display_order: 0,
  })

  const authHeaders = () => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  useEffect(() => {
    fetchLanguages()
  }, [])

  const fetchLanguages = async () => {
    try {
      const response = await fetch(API_URL, { headers: { ...authHeaders() } })
      if (response.ok) {
        const data = await response.json()
        setLanguages(data)
      }
    } catch (error) {
      console.error("Failed to fetch languages", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingLanguage(null)
    setFormData({
      code: "",
      name: "",
      native_name: "",
      direction: "ltr",
      is_active: true,
      is_default: false,
      flag_emoji: "",
      display_order: 0,
    })
    setIsDialogOpen(true)
  }

  // 헤더 액션 등록 (언어 추가 버튼)
  useEffectReact(() => {
    setAction(
      <Button onClick={handleCreate} size="sm">
        <Plus className="mr-2 h-4 w-4" /> 언어 추가
      </Button>
    )
    return () => setAction(null)
  }, [setAction])

  const handleEdit = (lang: Language) => {
    setEditingLanguage(lang)
    setFormData(lang)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return

    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      if (response.ok) {
        fetchLanguages()
      }
    } catch (error) {
      console.error("Failed to delete language", error)
    }
  }

  const handleSubmit = async () => {
    try {
      const method = editingLanguage ? "PUT" : "POST"
      const url = editingLanguage ? `${API_URL}/${editingLanguage.id}` : API_URL
      
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
        fetchLanguages()
      }
    } catch (error) {
      console.error("Failed to save language", error)
    }
  }

  return (
    <div className="space-y-4 bg-background">
      <div className="flex items-center justify-between">
        <div>
          {/* <h2 className="text-2xl font-bold tracking-tight">지원 언어 관리</h2> */}
          <p className="text-muted-foreground">
            시스템에서 지원하는 다국어 설정을 관리합니다.
          </p>
        </div>
        {/* <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> 언어 추가
        </Button> */}
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">코드</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>원어 이름</TableHead>
              <TableHead>국기</TableHead>
              <TableHead>방향</TableHead>
              <TableHead>순서</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>기본</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : languages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  등록된 언어가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              languages.map((lang) => (
                <TableRow key={lang.id}>
                  <TableCell className="font-medium">{lang.code}</TableCell>
                  <TableCell>{lang.name}</TableCell>
                  <TableCell>{lang.native_name}</TableCell>
                  <TableCell className="text-2xl">{lang.flag_emoji}</TableCell>
                  <TableCell>{lang.direction.toUpperCase()}</TableCell>
                  <TableCell>{lang.display_order}</TableCell>
                  <TableCell>
                    <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${lang.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                      {lang.is_active ? "Active" : "Inactive"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {lang.is_default && (
                      <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-foreground">
                        Default
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(lang)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(lang.id)}>
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingLanguage ? "언어 수정" : "언어 추가"}</DialogTitle>
            <DialogDescription>
              지원할 언어 정보를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="code" className="text-right">
                코드
              </Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="col-span-3"
                placeholder="Ex: ko, en"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                이름
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="col-span-3"
                placeholder="Ex: Korean"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="native_name" className="text-right">
                원어 이름
              </Label>
              <Input
                id="native_name"
                value={formData.native_name}
                onChange={(e) => setFormData({ ...formData, native_name: e.target.value })}
                className="col-span-3"
                placeholder="Ex: 한국어"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="flag_emoji" className="text-right">
                이모지
              </Label>
              <Input
                id="flag_emoji"
                value={formData.flag_emoji}
                onChange={(e) => setFormData({ ...formData, flag_emoji: e.target.value })}
                className="col-span-3"
                placeholder="Ex: 🇰🇷"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="direction" className="text-right">
                방향
              </Label>
              <Select 
                value={formData.direction} 
                onValueChange={(value: "ltr" | "rtl") => setFormData({ ...formData, direction: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ltr">LTR (Left to Right)</SelectItem>
                  <SelectItem value="rtl">RTL (Right to Left)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="display_order" className="text-right">
                표시 순서
              </Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_active" className="text-right">
                활성 상태
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_default" className="text-right">
                기본 언어
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
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

