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

type RoutingRule = {
  id: string
  rule_name: string
  priority: number
  conditions: Record<string, unknown>
  is_active: boolean
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
  target_model_id: string
  target_model_display_name: string
  target_model_api_id: string
  fallback_model_id?: string | null
  fallback_model_display_name?: string | null
  fallback_model_api_id?: string | null
}

type AiModel = {
  id: string
  display_name: string
  model_id: string
  provider_display_name?: string
  provider_slug?: string
  status: string
  is_available: boolean
}

type ListResponse = {
  ok: boolean
  total: number
  limit: number
  offset: number
  rows: RoutingRule[]
}

const RULES_API = "/api/ai/routing-rules"
const MODELS_API = "/api/ai/models"

function nowIso() {
  return new Date().toISOString()
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

function pretty(obj: unknown) {
  try {
    return JSON.stringify(obj ?? {}, null, 2)
  } catch {
    return "{}"
  }
}

export default function ModelRoutingRules() {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<RoutingRule[]>([])
  const [total, setTotal] = useState(0)

  const [models, setModels] = useState<AiModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  const [q, setQ] = useState("")
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "true" | "false">("all")
  const [page, setPage] = useState(0)
  const limit = 50

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RoutingRule | null>(null)

  // form
  const [ruleName, setRuleName] = useState("")
  const [priority, setPriority] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [targetModelId, setTargetModelId] = useState<string>("")
  const [fallbackModelId, setFallbackModelId] = useState<string>("__none__")
  const [conditionsText, setConditionsText] = useState<string>(pretty({ feature: "chat" }))
  const [metadataText, setMetadataText] = useState<string>(pretty({}))

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set("limit", String(limit))
    params.set("offset", String(page * limit))
    if (q.trim()) params.set("q", q.trim())
    if (isActiveFilter !== "all") params.set("is_active", isActiveFilter)
    return params.toString()
  }, [isActiveFilter, limit, page, q])

  async function fetchModels() {
    setModelsLoading(true)
    try {
      const res = await fetch(`${MODELS_API}?status=active&is_available=true`)
      const json = (await res.json()) as AiModel[]
      setModels(Array.isArray(json) ? json : [])
    } catch (e) {
      console.error(e)
      setModels([])
    } finally {
      setModelsLoading(false)
    }
  }

  async function fetchRules() {
    setLoading(true)
    try {
      const res = await fetch(`${RULES_API}?${queryString}`)
      const json = (await res.json()) as ListResponse
      if (!res.ok || !json.ok) throw new Error("FAILED_LIST")
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

  function resetForm() {
    setEditing(null)
    setRuleName("")
    setPriority(0)
    setIsActive(true)
    setTargetModelId("")
    setFallbackModelId("__none__")
    setConditionsText(pretty({ feature: "chat" }))
    setMetadataText(pretty({}))
  }

  function openCreate() {
    resetForm()
    setOpen(true)
  }

  function openEdit(r: RoutingRule) {
    setEditing(r)
    setRuleName(r.rule_name)
    setPriority(Number(r.priority || 0))
    setIsActive(Boolean(r.is_active))
    setTargetModelId(r.target_model_id)
    setFallbackModelId(r.fallback_model_id ? String(r.fallback_model_id) : "__none__")
    setConditionsText(pretty(r.conditions || {}))
    setMetadataText(pretty(r.metadata || {}))
    setOpen(true)
  }

  async function saveRule() {
    const name = ruleName.trim()
    if (!name) return alert("규칙 이름(rule_name)을 입력해 주세요.")
    if (!targetModelId) return alert("대상 모델(target_model_id)을 선택해 주세요.")

    const conditions = safeParseJsonObject(conditionsText)
    if (Object.keys(conditions).length === 0) return alert("conditions는 JSON object여야 합니다.")
    const metadata = safeParseJsonObject(metadataText)

    const payload = {
      rule_name: name,
      priority,
      is_active: isActive,
      target_model_id: targetModelId,
      fallback_model_id: fallbackModelId === "__none__" ? null : fallbackModelId,
      conditions,
      metadata,
    }

    try {
      const isEdit = Boolean(editing?.id)
      const url = isEdit ? `${RULES_API}/${editing!.id}` : RULES_API
      const method = isEdit ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String((json as any)?.message || "저장 실패"))
      setOpen(false)
      resetForm()
      await fetchRules()
    } catch (e: any) {
      console.error(e)
      alert(String(e?.message || e))
    }
  }

  async function toggleActive(r: RoutingRule, next: boolean) {
    try {
      const res = await fetch(`${RULES_API}/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String((json as any)?.message || "수정 실패"))
      await fetchRules()
    } catch (e: any) {
      console.error(e)
      alert(String(e?.message || e))
    }
  }

  async function deleteRule(r: RoutingRule) {
    const ok = window.confirm(`"${r.rule_name}" 규칙을 삭제합니다. 계속할까요?`)
    if (!ok) return
    try {
      const res = await fetch(`${RULES_API}/${r.id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String((json as any)?.message || "삭제 실패"))
      await fetchRules()
    } catch (e: any) {
      console.error(e)
      alert(String(e?.message || e))
    }
  }

  useEffect(() => {
    fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchRules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString])

  const pageCount = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">AI 서비스 - 모델 라우팅 규칙</div>
          <div className="text-sm text-muted-foreground">
            조건(conditions)에 따라 사용할 모델(target/fallback)을 결정하는 규칙을 관리합니다.
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchRules()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span className="ml-2">새로고침</span>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">규칙 추가</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setPage(0)
            setQ(e.target.value)
          }}
          placeholder="규칙 이름 검색"
          className="w-[280px]"
        />
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
              <TableHead className="min-w-[200px]">규칙</TableHead>
              <TableHead className="text-right">Priority</TableHead>
              <TableHead>활성</TableHead>
              <TableHead className="min-w-[260px]">Target</TableHead>
              <TableHead className="min-w-[260px]">Fallback</TableHead>
              <TableHead className="min-w-[340px]">Conditions</TableHead>
              <TableHead className="min-w-[160px]">업데이트</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline-block animate-spin mr-2" />
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  등록된 라우팅 규칙이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.rule_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.id}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.priority}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} />
                      <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "ON" : "OFF"}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{r.target_model_display_name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.target_model_api_id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.fallback_model_id ? (
                      <div className="flex flex-col">
                        <span className="font-medium">{r.fallback_model_display_name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{r.fallback_model_api_id}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <pre className="text-xs whitespace-pre-wrap break-all max-h-[120px] overflow-auto bg-muted/30 p-2 rounded">
                      {pretty(r.conditions)}
                    </pre>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(r.updated_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteRule(r)}>
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
          <Button
            variant="outline"
            disabled={(page + 1) * limit >= total || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "라우팅 규칙 수정" : "라우팅 규칙 추가"}</DialogTitle>
            <DialogDescription>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>conditions 예시(JSON object):</div>
                <pre className="bg-muted/30 p-2 rounded text-xs whitespace-pre-wrap break-all">
{`{
  "feature": "chat",
  "language": "ko",
  "max_tokens": { "$lte": 1000 }
}`}
                </pre>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>규칙 이름(rule_name)</Label>
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="예: ko_chat_small" />
            </div>
            <div className="space-y-2">
              <Label>우선순위(priority)</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value || 0))}
              />
            </div>

            <div className="space-y-2">
              <Label>활성(is_active)</Label>
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={(v) => setIsActive(v)} />
                <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "ON" : "OFF"}</Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label>대상 모델(target_model_id)</Label>
              <Select value={targetModelId} onValueChange={(v) => setTargetModelId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder={modelsLoading ? "모델 로딩..." : "모델 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {(m.provider_slug ? `${m.provider_slug} · ` : "") + `${m.display_name} (${m.model_id})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>폴백 모델(fallback_model_id)</Label>
              <Select value={fallbackModelId} onValueChange={(v) => setFallbackModelId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder={modelsLoading ? "모델 로딩..." : "폴백 모델 선택(선택)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(없음)</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {(m.provider_slug ? `${m.provider_slug} · ` : "") + `${m.display_name} (${m.model_id})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>conditions (JSON)</Label>
              <Textarea value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} className="min-h-[180px]" />
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
            <Button onClick={saveRule}>{editing ? "수정 저장" : "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


