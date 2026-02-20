import { useEffect, useMemo, useState } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
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
import { Loader2, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type PromptTemplateRow = {
  id: string
  name: string
  purpose: string
  version: number
  is_active: boolean
  created_at?: string
  updated_at?: string
  // 상세 조회에서만 내려올 수 있음
  body?: unknown
  metadata?: Record<string, unknown>
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: PromptTemplateRow[]
}

const API = "/api/ai/prompt-templates"

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function jsonErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null
  const rec = json as Record<string, unknown>
  return typeof rec.message === "string" ? rec.message : null
}

function pretty(obj: unknown) {
  try {
    return JSON.stringify(obj ?? {}, null, 2)
  } catch {
    return "{}"
  }
}

function safeParseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export default function PromptTemplates() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PromptTemplateRow[]>([])
  const [total, setTotal] = useState(0)

  const [q, setQ] = useState("")
  const [purposeFilter, setPurposeFilter] = useState<string>("all")
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "true" | "false">("all")
  const [page, setPage] = useState(0)
  const limit = 50

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PromptTemplateRow | null>(null)

  // form
  const [name, setName] = useState("")
  const [purpose, setPurpose] = useState("")
  const [version, setVersion] = useState(1)
  const [isActive, setIsActive] = useState(true)
  const [bodyText, setBodyText] = useState(pretty({}))
  const [metadataText, setMetadataText] = useState(pretty({}))

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (purposeFilter !== "all") params.set("purpose", purposeFilter)
    if (isActiveFilter !== "all") params.set("is_active", isActiveFilter)
    return params.toString()
  }, [isActiveFilter, limit, page, purposeFilter, q])

  async function fetchList() {
    setLoading(true)
    try {
      const res = await fetch(`${API}?${queryString}`)
      const json = (await res.json().catch(() => ({}))) as ListResponse
      if (!res.ok || !json.ok) throw new Error(jsonErrorMessage(json) || "FAILED_LIST")
      setRows(json.rows || [])
      setTotal(json.total || 0)
    } catch (e) {
      console.error(e)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  async function fetchDetail(id: string) {
    const res = await fetch(`${API}/${id}`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(jsonErrorMessage(json) || "FAILED_GET")
    const row = (json as any)?.row as PromptTemplateRow | undefined
    if (!row) throw new Error("FAILED_GET")
    return row
  }

  function resetForm() {
    setEditing(null)
    setName("")
    setPurpose("")
    setVersion(1)
    setIsActive(true)
    setBodyText(pretty({}))
    setMetadataText(pretty({}))
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  async function openEdit(r: PromptTemplateRow) {
    try {
      const full = await fetchDetail(r.id)
      setEditing(full)
      setName(String(full.name || ""))
      setPurpose(String(full.purpose || ""))
      setVersion(Number(full.version || 1))
      setIsActive(Boolean(full.is_active))
      setBodyText(pretty(full.body ?? {}))
      setMetadataText(pretty(full.metadata ?? {}))
      setOpen(true)
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  async function save() {
    const n = name.trim()
    const p = purpose.trim()
    if (!n) return alert("name을 입력해 주세요.")
    if (!p) return alert("purpose를 입력해 주세요. (예: chat, summary, code)")

    const body = safeParseJsonObject(bodyText)
    if (Object.keys(body).length === 0) return alert("body는 JSON object여야 합니다.")
    const metadata = safeParseJsonObject(metadataText)

    const payload = { name: n, purpose: p, version: Number(version || 1) || 1, is_active: isActive, body, metadata }

    try {
      const isEdit = Boolean(editing?.id)
      const url = isEdit ? `${API}/${editing!.id}` : API
      const method = isEdit ? "PUT" : "POST"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(jsonErrorMessage(json) || "저장 실패")
      setOpen(false)
      resetForm()
      await fetchList()
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  async function remove(r: PromptTemplateRow) {
    const ok = window.confirm(`"${r.name}" 템플릿을 삭제합니다. 계속할까요?`)
    if (!ok) return
    try {
      const res = await fetch(`${API}/${r.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(jsonErrorMessage(json) || "삭제 실패")
      await fetchList()
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))
  const purposeOptions = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.purpose || "")).filter(Boolean))
    return Array.from(set).sort()
  }, [rows])

  return (
    <AdminPage
      headerContent={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchList()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">템플릿 추가</span>
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">AI 서비스 - 프롬프트 템플릿</div>
          <div className="text-sm text-muted-foreground">
            목적(purpose)별로 Responses API 요청 바디(JSON)를 템플릿으로 관리합니다.
          </div>
        </div>
        <div className="flex gap-2" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setPage(0)
            setQ(e.target.value)
          }}
          placeholder="name 검색"
          className="w-[280px]"
        />
        <Select
          value={purposeFilter}
          onValueChange={(v) => {
            setPage(0)
            setPurposeFilter(v)
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="purpose(전체)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">purpose(전체)</SelectItem>
            {purposeOptions.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={isActiveFilter}
          onValueChange={(v) => {
            setPage(0)
            setIsActiveFilter(v as any)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="활성(전체)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">활성(전체)</SelectItem>
            <SelectItem value="true">활성</SelectItem>
            <SelectItem value="false">비활성</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">Name</TableHead>
              <TableHead className="min-w-[140px]">Purpose</TableHead>
              <TableHead className="text-right">Version</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="min-w-[170px]">Updated</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  등록된 템플릿이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.purpose}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.version}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "ON" : "OFF"}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.updated_at ? new Date(r.updated_at).toLocaleString() : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => void openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => void remove(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          총 {total.toLocaleString()}건 · 페이지 {page + 1}/{pageCount}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            이전
          </Button>
          <Button variant="outline" disabled={(page + 1) * limit >= total || loading} onClick={() => setPage((p) => p + 1)}>
            다음
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "프롬프트 템플릿 수정" : "프롬프트 템플릿 추가"}</DialogTitle>
            <DialogDescription>
              <div className="text-xs text-muted-foreground">
                body는 Responses API 요청 바디(JSON object)입니다. (프롬프트/시스템/포맷 등 포함 가능)
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: ko_chat_default" />
            </div>
            <div className="space-y-2">
              <Label>purpose</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: chat" />
            </div>

            <div className="space-y-2">
              <Label>version</Label>
              <Input type="number" value={version} onChange={(e) => setVersion(Number(e.target.value || 1))} />
            </div>
            <div className="space-y-2">
              <Label>is_active</Label>
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={(v) => setIsActive(v)} />
                <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "ON" : "OFF"}</Badge>
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>body (JSON)</Label>
              <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} className="min-h-[220px]" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>metadata (JSON)</Label>
              <Textarea value={metadataText} onChange={(e) => setMetadataText(e.target.value)} className="min-h-[120px]" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={() => void save()}>{editing ? "수정 저장" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}


