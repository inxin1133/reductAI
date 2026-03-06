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
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Plus, Search, Trash2, Info } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"
import { PLAN_TIER_ORDER, PLAN_TIER_LABELS, type PlanTier } from "@/lib/planTier"

interface Model {
  id: string
  provider_id: string
  provider_product_name?: string
  provider_slug?: string
  display_name: string
  model_id: string
  model_type: string
  status: string
  is_available: boolean
}

interface PlanModelAccessRow {
  id: string
  plan_tier: string
  model_id: string
  created_at: string
  model_display_name?: string
  model_api_id?: string
  model_type?: string
  provider_product_name?: string
  provider_slug?: string
}

const MODELS_API_URL = "/api/ai/models"
const PLAN_MODEL_ACCESS_API_URL = "/api/ai/plan-model-access"

async function tryFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const contentType = res.headers.get("content-type") || ""
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!contentType.includes("application/json")) throw new Error("NOT_JSON")
  return (await res.json()) as T
}

export default function PlanModelAccess() {
  const [selectedTier, setSelectedTier] = useState<PlanTier>("free")
  const [models, setModels] = useState<Model[]>([])
  const [rows, setRows] = useState<PlanModelAccessRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState("")

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchModels = async () => {
    const data = await tryFetchJson<Model[]>(MODELS_API_URL, { headers: { ...authHeaders() } })
    setModels(data.filter((m) => m.is_available && m.status === "active"))
  }

  const fetchRows = async (planTier: PlanTier) => {
    const data = await tryFetchJson<PlanModelAccessRow[]>(
      `${PLAN_MODEL_ACCESS_API_URL}?plan_tier=${encodeURIComponent(planTier)}`,
      { headers: { ...authHeaders() } }
    )
    setRows(data)
  }

  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      try {
        await fetchModels()
        await fetchRows(selectedTier)
      } finally {
        setIsLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchRows(selectedTier)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTier])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = `${r.provider_product_name || ""} ${r.provider_slug || ""} ${r.model_display_name || ""} ${r.model_api_id || ""} ${r.model_type || ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  const alreadyAddedModelIds = useMemo(() => new Set(rows.map((r) => r.model_id)), [rows])
  const availableModels = useMemo(
    () => models.filter((m) => !alreadyAddedModelIds.has(m.id)),
    [models, alreadyAddedModelIds]
  )

  const isRestricted = rows.length > 0

  const handleCreate = () => {
    setSelectedModelId(availableModels[0]?.id || "")
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!selectedModelId) {
      alert("모델을 선택해주세요.")
      return
    }
    setIsSaving(true)
    try {
      await tryFetchJson(PLAN_MODEL_ACCESS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ plan_tier: selectedTier, model_id: selectedModelId }),
      })
      setIsDialogOpen(false)
      await fetchRows(selectedTier)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "알 수 없는 오류"
      alert(`저장 실패: ${msg}`)
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (row: PlanModelAccessRow) => {
    if (!confirm(`정말 삭제하시겠습니까?\n- ${row.provider_product_name || ""} / ${row.model_display_name || row.model_id}`))
      return
    try {
      await fetch(`${PLAN_MODEL_ACCESS_API_URL}/${row.id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      })
      await fetchRows(selectedTier)
    } catch (e) {
      console.error(e)
      alert("삭제 중 오류가 발생했습니다.")
    }
  }

  const handleBulkAllowAll = async () => {
    if (
      !confirm(
        `"${PLAN_TIER_LABELS[selectedTier]}" 플랜을 "모든 모델 허용"으로 전환하시겠습니까?\n\n현재 등록된 ${rows.length}개 모델 제한이 모두 삭제됩니다.`
      )
    )
      return
    try {
      await fetch(
        `${PLAN_MODEL_ACCESS_API_URL}?plan_tier=${encodeURIComponent(selectedTier)}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      )
      await fetchRows(selectedTier)
    } catch (e) {
      console.error(e)
      alert("전환 중 오류가 발생했습니다.")
    }
  }

  const headerContent = (
    <div className="flex items-center gap-2">
      <Button onClick={handleCreate} size="sm" disabled={availableModels.length === 0}>
        <Plus className="mr-2 h-4 w-4" /> 모델 추가
      </Button>
      {rows.length > 0 && (
        <Button onClick={handleBulkAllowAll} size="sm" variant="outline">
          <Trash2 className="mr-2 h-4 w-4" /> 모든 모델 허용으로 전환
        </Button>
      )}
    </div>
  )

  return (
    <AdminPage headerContent={headerContent}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">AI 서비스 - 플랜 모델 접근 관리</div>
          <div className="text-muted-foreground">
            plan_model_access / 플랜 별로 사용 가능한 AI 모델을 관리합니다.
          </div>
        </div>
      </div>
      <Alert className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
        <Info className="h-4 w-4" />
        <AlertDescription>
          {isRestricted ? (
            <>
              <b>{PLAN_TIER_LABELS[selectedTier]}</b> 플랜은 아래 등록된 모델만 사용 가능합니다. (제한 모드)
            </>
          ) : (
            <>
              <b>{PLAN_TIER_LABELS[selectedTier]}</b> 플랜은 행이 없어 <b>모든 모델</b> 사용 가능합니다. (Pro+ 동작)
            </>
          )}
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-[220px]">
          <Select value={selectedTier} onValueChange={(v: PlanTier) => setSelectedTier(v)}>
            <SelectTrigger>
              <SelectValue placeholder="플랜 티어 선택" />
            </SelectTrigger>
            <SelectContent>
              {PLAN_TIER_ORDER.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {PLAN_TIER_LABELS[tier]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="모델/프로바이더 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[320px]"
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
              <TableHead>모델</TableHead>
              <TableHead>model_api_id</TableHead>
              <TableHead>제공업체</TableHead>
              <TableHead>model_type</TableHead>
              <TableHead>등록일</TableHead>
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
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  {rows.length === 0 ? (
                    <span className="text-muted-foreground">등록된 모델이 없습니다. (모든 모델 사용 가능)</span>
                  ) : (
                    "검색 결과가 없습니다."
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{r.model_display_name || "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">{r.model_api_id || "-"}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {r.provider_slug || "-"}
                    </Badge>
                    <div className="text-xs text-muted-foreground">{r.provider_product_name || ""}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.model_type || "-"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleString("ko-KR") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>모델 추가</DialogTitle>
            <DialogDescription>
              {PLAN_TIER_LABELS[selectedTier]} 플랜에서 사용 가능한 모델을 추가합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium">모델</label>
              <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="모델 선택" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.provider_product_name} / {m.display_name} ({m.model_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
