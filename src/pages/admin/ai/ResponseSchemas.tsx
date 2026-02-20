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

type ResponseSchemaRow = {
  id: string
  name: string
  version: number
  strict: boolean
  is_active: boolean
  description?: string | null
  created_at?: string
  updated_at?: string
  schema?: unknown
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: ResponseSchemaRow[]
}

const API = "/api/ai/response-schemas"

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

export default function ResponseSchemas() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ResponseSchemaRow[]>([])
  const [total, setTotal] = useState(0)

  const [q, setQ] = useState("")
  const [nameFilter, setNameFilter] = useState<string>("all")
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "true" | "false">("all")
  const [page, setPage] = useState(0)
  const limit = 50

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ResponseSchemaRow | null>(null)

  const [name, setName] = useState("")
  const [version, setVersion] = useState(1)
  const [strict, setStrict] = useState(true)
  const [isActive, setIsActive] = useState(true)
  const [description, setDescription] = useState("")
  const [schemaText, setSchemaText] = useState(pretty({}))

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (nameFilter !== "all") params.set("name", nameFilter)
    if (isActiveFilter !== "all") params.set("is_active", isActiveFilter)
    return params.toString()
  }, [isActiveFilter, limit, nameFilter, page, q])

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
    const row = (json as any)?.row as ResponseSchemaRow | undefined
    if (!row) throw new Error("FAILED_GET")
    return row
  }

  function resetForm() {
    setEditing(null)
    setName("")
    setVersion(1)
    setStrict(true)
    setIsActive(true)
    setDescription("")
    setSchemaText(pretty({}))
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  async function openEdit(r: ResponseSchemaRow) {
    try {
      const full = await fetchDetail(r.id)
      setEditing(full)
      setName(String(full.name || ""))
      setVersion(Number(full.version || 1))
      setStrict(Boolean(full.strict))
      setIsActive(Boolean(full.is_active))
      setDescription(String(full.description || ""))
      setSchemaText(pretty(full.schema ?? {}))
      setOpen(true)
    } catch (e) {
      console.error(e)
      alert(errorMessage(e))
    }
  }

  async function save() {
    const n = name.trim()
    if (!n) return alert("name을 입력해 주세요. (예: block_json)")
    const schema = safeParseJsonObject(schemaText)
    if (Object.keys(schema).length === 0) return alert("schema는 JSON object여야 합니다.")

    const payload = {
      name: n,
      version: Number(version || 1) || 1,
      strict,
      schema,
      description: description.trim() || null,
      is_active: isActive,
    }

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

  async function remove(r: ResponseSchemaRow) {
    const ok = window.confirm(`"${r.name}" v${r.version} 출력 계약을 삭제합니다. 계속할까요?`)
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
  const nameOptions = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.name || "")).filter(Boolean))
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
            <span className="ml-2">계약 추가</span>
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">AI 서비스 - 출력 계약(Response Schemas)</div>
          <div className="text-sm text-muted-foreground">모델이 사용하는 JSON Schema 기반 출력 계약을 관리합니다.</div>
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
          placeholder="name/description 검색"
          className="w-[280px]"
        />
        <Select
          value={nameFilter}
          onValueChange={(v) => {
            setPage(0)
            setNameFilter(v)
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="name(전체)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">name(전체)</SelectItem>
            {nameOptions.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
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
              <TableHead className="text-right">Version</TableHead>
              <TableHead>Strict</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="min-w-[260px]">Description</TableHead>
              <TableHead className="min-w-[170px]">Updated</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  등록된 계약이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.id}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.version}</TableCell>
                  <TableCell>
                    <Badge variant={r.strict ? "default" : "secondary"}>{r.strict ? "strict" : "loose"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "ON" : "OFF"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.description || "-"}</TableCell>
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
            <DialogTitle>{editing ? "출력 계약 수정" : "출력 계약 추가"}</DialogTitle>
            <DialogDescription>
              <div className="text-xs text-muted-foreground">OpenAI `response_format: json_schema`에 사용되는 JSON Schema를 등록합니다.</div>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: block_json" />
            </div>
            <div className="space-y-2">
              <Label>version</Label>
              <Input type="number" value={version} onChange={(e) => setVersion(Number(e.target.value || 1))} />
            </div>

            <div className="space-y-2">
              <Label>strict</Label>
              <div className="flex items-center gap-2">
                <Switch checked={strict} onCheckedChange={(v) => setStrict(v)} />
                <Badge variant={strict ? "default" : "secondary"}>{strict ? "TRUE" : "FALSE"}</Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label>is_active</Label>
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={(v) => setIsActive(v)} />
                <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "ON" : "OFF"}</Badge>
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="설명(선택)" />
            </div>

            <div className="space-y-2 col-span-2">
              <Label>schema (JSON)</Label>
              <Textarea value={schemaText} onChange={(e) => setSchemaText(e.target.value)} className="min-h-[320px]" />
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


