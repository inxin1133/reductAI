import { useState, useEffect } from "react"
import { AdminPage } from "../../../components/layout/AdminPage"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table"
import { Input } from "../../../components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { Button } from "../../../components/ui/button"
import { Search, ChevronLeft, ChevronRight } from "lucide-react"
import { format } from "date-fns"

interface TranslationHistory {
  id: string
  old_value: string | null
  new_value: string
  change_reason: string | null
  created_at: string
  changed_by: string | null
  key: string
  namespace_name: string
  language_code: string
  language_name: string
  flag_emoji: string
}

interface Namespace {
  id: string
  name: string
}

interface Language {
  code: string
  name: string
  flag_emoji: string
}

interface User {
  id: string
  email: string
  name: string
}

export default function TranslationHistoryPage() {
  const [history, setHistory] = useState<TranslationHistory[]>([])
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [users, setUsers] = useState<Map<string, User>>(new Map())
  
  // 필터 상태
  const [search, setSearch] = useState("")
  const [selectedNamespace, setSelectedNamespace] = useState<string>("all")
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all")
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(false)

  // 기초 데이터 로드 (네임스페이스, 언어, 사용자)
  useEffect(() => {
    const fetchBasics = async () => {
      try {
        const token = localStorage.getItem("token")
        const headers = { Authorization: `Bearer ${token}` }

        // 네임스페이스
        const nsRes = await fetch("/api/i18n/namespaces?limit=100", { headers })
        if (nsRes.ok) {
          const data = await nsRes.json()
          setNamespaces(data.data || [])
        }

        // 언어
        const langRes = await fetch("/api/i18n/languages", { headers })
        if (langRes.ok) {
          const data = await langRes.json()
          setLanguages(data || [])
        }

        // 사용자 (ID 매핑용) - user-service가 3002 포트라고 가정, 프록시 설정이 되어있어야 함
        // vite.config.ts에 /api/users 프록시가 설정되어 있다고 가정
        const userRes = await fetch("/api/users", { headers })
        if (userRes.ok) {
          const data = await userRes.json()
          const userMap = new Map<string, User>()
          // user-service 응답 구조에 따라 다름 (users 배열로 가정)
          if (Array.isArray(data.users)) {
            data.users.forEach((u: any) => userMap.set(u.id, u))
          }
          setUsers(userMap)
        }
      } catch (error) {
        console.error("Failed to fetch basic data", error)
      }
    }
    fetchBasics()
  }, [])

  // 이력 데이터 로드
  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true)
      try {
        const token = localStorage.getItem("token")
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: "20",
        })
        if (search) params.append("search", search)
        if (selectedNamespace !== "all") params.append("namespace_id", selectedNamespace)
        if (selectedLanguage !== "all") params.append("language_code", selectedLanguage)

        const res = await fetch(`/api/i18n/history?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          const data = await res.json()
          setHistory(data.history || [])
          setTotalPages(data.pagination.totalPages)
        }
      } catch (error) {
        console.error("Failed to fetch history", error)
      } finally {
        setIsLoading(false)
      }
    }

    // 디바운스 처리 없이 버튼 클릭 시 검색? 아니면 useEffect 의존성으로 자동 검색?
    // 여기서는 자동 검색으로 구현
    const timer = setTimeout(() => {
      fetchHistory()
    }, 300)

    return () => clearTimeout(timer)
  }, [currentPage, search, selectedNamespace, selectedLanguage])

  // 사용자 이름 표시 헬퍼
  const getUserName = (userId: string | null) => {
    if (!userId) return "-"
    const user = users.get(userId)
    return user ? `${user.name} (${user.email})` : userId
  }

  // 변경 내용 표시 헬퍼
  const renderChange = (oldVal: string | null, newVal: string) => {
    if (oldVal === null) {
      return (
        <span className="text-green-600 font-medium">
          (신규) {newVal}
        </span>
      )
    }
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-red-500 line-through bg-red-50 px-1 rounded w-fit">
          {oldVal}
        </span>
        <span className="text-green-600 font-medium bg-green-50 px-1 rounded w-fit">
          {newVal}
        </span>
      </div>
    )
  }

  return (
    <AdminPage headerTitle="다국어(i18n) > 번역 이력">
      {/* 필터 영역 */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="키, 번역 내용 검색..."
              className="pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
            />
          </div>
        </div>
        <div className="w-full md:w-[200px]">
          <Select
            value={selectedNamespace}
            onValueChange={(val) => {
              setSelectedNamespace(val)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="네임스페이스" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 네임스페이스</SelectItem>
              {namespaces.map((ns) => (
                <SelectItem key={ns.id} value={ns.id}>
                  {ns.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-[150px]">
          <Select
            value={selectedLanguage}
            onValueChange={(val) => {
              setSelectedLanguage(val)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="언어" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 언어</SelectItem>
              {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.flag_emoji} {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 테이블 영역 */}
      <div className="border rounded-lg bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">일시</TableHead>
              <TableHead className="w-[150px]">위치 (NS / Lang)</TableHead>
              <TableHead className="w-[200px]">키 (Key)</TableHead>
              <TableHead>변경 내용 (Old &rarr; New)</TableHead>
              <TableHead className="w-[150px]">작업자</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  이력 데이터가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(item.created_at), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span className="font-medium">{item.namespace_name}</span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        {item.flag_emoji} {item.language_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm break-all">
                    {item.key}
                  </TableCell>
                  <TableCell>
                    {renderChange(item.old_value, item.new_value)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {getUserName(item.changed_by)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-center gap-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {currentPage} / {totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages || totalPages === 0}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </AdminPage>
  )
}

