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
import { Plus, Trash2, Loader2, Search, Save } from "lucide-react"
import { useAdminHeaderActionContext } from "@/contexts/AdminHeaderActionContext"
import { useEffect as useEffectReact } from "react"

// 간단한 번역 헬퍼: namespace.key 형식으로 키를 찾아서 UI에 적용
// 실제 서비스에서는 전역 i18n 라이브러리 또는 컨텍스트에 연결하면 됨
const buildTranslationMap = (list: TranslationKey[], langs: Language[], preferLang?: string) => {
  // 우선순위: 사용자가 선택한 언어 -> 기본 언어 -> 첫 번째 언어 -> en
  const defaultLang = langs.find(l => l.is_default)?.code || langs[0]?.code || "en"
  const target = preferLang || defaultLang
  const map: Record<string, string> = {}
  list.forEach(item => {
    const fqn = `${item.namespace_name}.${item.key}` // 예: common.save
    const translated = item.translations[target] || item.translations[defaultLang]
    if (translated) {
      map[fqn] = translated
    }
  })
  return map
}

const getText = (map: Record<string, string>, key: string, fallback: string) => map[key] ?? fallback

// --- 타입 정의 ---
interface TranslationKey {
  id: string
  key: string
  description: string
  namespace_id: string
  namespace_name: string
  translations: Record<string, string> // { 'en': 'Hello', 'ko': '안녕' }
}

interface Namespace {
  id: string
  name: string
}

interface Language {
  code: string
  name: string
  is_default: boolean
  flag_emoji: string
  is_active?: boolean
}

// --- API 엔드포인트 ---
const BASE_URL = "http://localhost:3006/api/i18n"

export default function TranslationManager() {
  const { setAction, setTitle } = useAdminHeaderActionContext()
  const [data, setData] = useState<TranslationKey[]>([])
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [translationMap, setTranslationMap] = useState<Record<string, string>>({})
  const [previewLang, setPreviewLang] = useState<string>("")
  
  // 검색 및 필터 상태
  const [search, setSearch] = useState("")
  const [selectedNamespace, setSelectedNamespace] = useState<string>("all")
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })

  // 다이얼로그 상태 (키 생성)
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false)
  const [newKeyData, setNewKeyData] = useState({
    namespace_id: "",
    key: "",
    description: "",
  })

  // 인라인 수정 상태 관리 (임시 저장소)
  // { keyId_langCode: '변경할 텍스트' }
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [savingCell, setSavingCell] = useState<string | null>(null) // 현재 저장 중인 셀 ID

  // 인증 헤더
  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("token")
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    return headers
  }

  // --- 초기 데이터 로드 ---
  useEffect(() => {
    setTitle("다국어(i18n) > 번역 데이터 관리")
    fetchInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- 목록 로드 (검색/필터 변경 시) ---
  useEffect(() => {
    fetchTranslations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search, selectedNamespace])

  // 헤더 액션 (미리보기 언어 선택 + 키 추가 버튼)
  useEffectReact(() => {
    setAction(
      <div className="flex items-center gap-2">
         <Button onClick={() => setIsKeyDialogOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" /> 키 추가
        </Button>
        <Select value={previewLang} onValueChange={setPreviewLang}>
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue placeholder="언어 선택" />
          </SelectTrigger>
          <SelectContent>
            {languages.map(lang => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.flag_emoji} {lang.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
       
      </div>
    )
    return () => setAction(null)
  }, [setAction, previewLang, languages])

  // --- API 호출 함수들 ---
  const fetchInitialData = async () => {
    try {
      // 네임스페이스와 언어 목록을 병렬로 가져옴
      const [nsRes, langRes] = await Promise.all([
        fetch(`${BASE_URL}/namespaces?limit=100`, { headers: { ...authHeaders() } }),
        fetch(`${BASE_URL}/languages`, { headers: { ...authHeaders() } })
      ])

      if (nsRes.ok) {
        const nsData = await nsRes.json()
        setNamespaces(nsData.namespaces || [])
      }
      if (langRes.ok) {
        const langData = await langRes.json()
        const filtered = (langData || []).filter((l: Language) => l.is_active !== false)
        setLanguages(filtered)
        // 미리보기 언어 기본값 설정: 기본 언어 -> 첫 번째
        if (!previewLang && (filtered?.length ?? 0) > 0) {
          const def = filtered.find((l: Language) => l.is_default)?.code || filtered[0].code
          setPreviewLang(def)
        }
      }
    } catch (error) {
      console.error("Failed to fetch init data", error)
    }
  }

  const fetchTranslations = async () => {
    setIsLoading(true)
    try {
      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        search,
        namespace_id: selectedNamespace === "all" ? "" : selectedNamespace,
      })
      const response = await fetch(`${BASE_URL}/translations?${queryParams}`, { 
        headers: { ...authHeaders() } 
      })
      
      if (response.ok) {
        const result = await response.json()
        setData(result.data)
        setPagination(result.pagination)
      }
    } catch (error) {
      console.error("Failed to fetch translations", error)
    } finally {
      setIsLoading(false)
    }
  }

  // 번역 맵 재계산 (데이터/언어/미리보기 언어 변경 시)
  useEffect(() => {
    setTranslationMap(buildTranslationMap(data, languages, previewLang))
  }, [data, languages, previewLang])

  const handleCreateKey = async () => {
    if (!newKeyData.namespace_id || !newKeyData.key) {
      alert("네임스페이스와 키는 필수입니다.")
      return
    }
    try {
      const response = await fetch(`${BASE_URL}/translations/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(newKeyData),
      })

      if (response.ok) {
        setIsKeyDialogOpen(false)
        setNewKeyData({ namespace_id: "", key: "", description: "" }) // 초기화
        fetchTranslations() // 목록 갱신
      } else {
        const err = await response.json()
        alert(`생성 실패: ${err.message}`)
      }
    } catch {
      alert("키 생성 중 오류가 발생했습니다.")
    }
  }

  const handleDeleteKey = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까? 해당 키의 모든 언어 번역도 삭제됩니다.")) return
    try {
      const response = await fetch(`${BASE_URL}/translations/keys/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      if (response.ok) {
        fetchTranslations()
      } else {
        alert("삭제 실패")
      }
    } catch {
      alert("삭제 중 오류가 발생했습니다.")
    }
  }

  // 번역 값 저장 (셀 단위)
  const handleSaveTranslation = async (keyId: string, langCode: string, value: string) => {
    const cellId = `${keyId}_${langCode}`
    setSavingCell(cellId)
    try {
      const response = await fetch(`${BASE_URL}/translations/values`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          translation_key_id: keyId,
          language_code: langCode,
          value,
        }),
      })

      if (response.ok) {
        // 성공 시 로컬 데이터 갱신 (리패치 없이 UI 반영)
        setData(prev => prev.map(item => {
          if (item.id === keyId) {
            return {
              ...item,
              translations: { ...item.translations, [langCode]: value }
            }
          }
          return item
        }))
        // editValues에서 해당 항목 제거 (더 이상 '수정 중' 상태가 아님)
        setEditValues(prev => {
          const next = { ...prev }
          delete next[cellId]
          return next
        })
      } else {
        alert("저장 실패")
      }
    } catch (error) {
      console.error(error)
      alert("저장 중 오류")
    } finally {
      setSavingCell(null)
    }
  }

  return (
    <div className="space-y-4 bg-background h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <p className="text-muted-foreground">
            {getText(translationMap, "ui.translation_manager.description", "시스템 내 모든 다국어 번역 데이터를 조회하고 수정합니다.")}
          </p>
        </div>
      </div>

      {/* 필터 영역 */}
      <div className="flex items-center gap-2 shrink-0">
        <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="네임스페이스 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 네임스페이스</SelectItem>
            {namespaces.map(ns => (
              <SelectItem key={ns.id} value={ns.id}>{ns.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <form onSubmit={(e) => { e.preventDefault(); setPagination(prev => ({...prev, page: 1})); }} className="flex gap-2">
          <Input 
            placeholder={getText(translationMap, "ui.translation_manager.search_placeholder", "키 또는 설명 검색...")} 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[300px]"
          />
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4 mr-2" /> {getText(translationMap, "common.search", "검색")}
          </Button>
        </form>
      </div>

      {/* 테이블 영역 (스크롤 가능) */}
      <div className="border rounded-md flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[200px]">Key (Namespace)</TableHead>
                {/* 언어별 컬럼 생성 */}
                {languages.map(lang => (
                  <TableHead key={lang.code} className="min-w-[200px]">
                    <div className="flex items-center gap-1">
                      <span>{lang.flag_emoji}</span>
                      <span>{lang.name}</span>
                      {lang.is_default && <span className="text-xs text-muted-foreground">(Default)</span>}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={languages.length + 2} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={languages.length + 2} className="h-24 text-center">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="align-top">
                      <div className="flex flex-col">
                        <span className="font-medium text-sm break-all">{item.key}</span>
                        <span className="text-xs text-muted-foreground">{item.namespace_name}</span>
                        {item.description && (
                          <span className="text-xs text-muted-foreground/70 mt-1 italic">{item.description}</span>
                        )}
                      </div>
                    </TableCell>
                    
                    {/* 언어별 입력 셀 */}
                    {languages.map(lang => {
                      const cellId = `${item.id}_${lang.code}`
                      const currentValue = editValues[cellId] ?? item.translations[lang.code] ?? ""
                      const isChanged = (editValues[cellId] !== undefined) && (editValues[cellId] !== (item.translations[lang.code] || ""))
                      const isSaving = savingCell === cellId

                      return (
                        <TableCell key={lang.code} className="align-top p-2">
                          <div className="relative group">
                            <textarea
                              className="w-full min-h-[60px] p-2 text-sm border rounded-md resize-none bg-transparent focus:bg-background focus:ring-1 focus:ring-ring transition-colors"
                              value={currentValue}
                              onChange={(e) => setEditValues(prev => ({ ...prev, [cellId]: e.target.value }))}
                              placeholder={`${lang.name} 번역 입력...`}
                            />
                            {/* 변경사항이 있을 때만 저장 버튼 표시 */}
                            {isChanged && (
                              <div className="absolute bottom-2 right-2">
                                <Button 
                                  size="icon" 
                                  className="h-6 w-6" 
                                  onClick={() => handleSaveTranslation(item.id, lang.code, currentValue)}
                                  disabled={isSaving}
                                >
                                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                </Button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      )
                    })}

                    <TableCell className="align-top">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteKey(item.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-end space-x-2 py-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
          disabled={pagination.page <= 1}
        >
          이전
        </Button>
        <div className="text-sm font-medium">
          {getText(translationMap, "common.page", "페이지")} {pagination.page} / {pagination.totalPages || 1}
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

      {/* 키 생성 다이얼로그 */}
      <Dialog open={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 번역 키 생성</DialogTitle>
            <DialogDescription>
              네임스페이스를 선택하고 고유한 키 이름을 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">네임스페이스</Label>
              <Select 
                value={newKeyData.namespace_id} 
                onValueChange={(val) => setNewKeyData(prev => ({ ...prev, namespace_id: val }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {namespaces.map(ns => (
                    <SelectItem key={ns.id} value={ns.id}>{ns.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">키 이름</Label>
              <Input 
                value={newKeyData.key} 
                onChange={(e) => setNewKeyData(prev => ({ ...prev, key: e.target.value }))}
                className="col-span-3"
                placeholder="예: button.save"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">설명</Label>
              <Input 
                value={newKeyData.description} 
                onChange={(e) => setNewKeyData(prev => ({ ...prev, description: e.target.value }))}
                className="col-span-3"
                placeholder="(선택사항) 설명 입력"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateKey}>생성</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

