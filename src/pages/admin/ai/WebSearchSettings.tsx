import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, RefreshCcw, Save } from "lucide-react"
import { AdminPage } from "@/components/layout/AdminPage"

type WebSearchPolicy = {
  enabled: boolean
  default_allowed: boolean
  provider: string
  enabled_providers: string[]
  max_search_calls: number
  max_total_snippet_tokens: number
  timeout_ms: number
  retry_max: number
  retry_base_delay_ms: number
  retry_max_delay_ms: number
}

type ApiResponse = {
  ok: boolean
  row: WebSearchPolicy
}

const API = "/api/ai/web-search-settings"

function toNumber(value: string, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export default function WebSearchSettings() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [policy, setPolicy] = useState<WebSearchPolicy | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(API)
      const json = (await res.json().catch(() => ({}))) as ApiResponse
      if (!res.ok || !json?.row) throw new Error(json && "message" in json ? String((json as any).message || "") : "로드 실패")
      setPolicy(json.row)
    } catch (e) {
      console.error(e)
      alert("웹검색 정책을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const toggleProvider = (key: string) => {
    if (!policy) return
    const cur = new Set((policy.enabled_providers || []).map((p) => String(p || "").toLowerCase()))
    if (cur.has(key)) cur.delete(key)
    else cur.add(key)
    setPolicy({ ...policy, enabled_providers: Array.from(cur) })
  }

  const save = async () => {
    if (!policy) return
    setSaving(true)
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      })
      const json = (await res.json().catch(() => ({}))) as ApiResponse
      if (!res.ok || !json?.row) throw new Error(json && "message" in json ? String((json as any).message || "") : "저장 실패")
      setPolicy(json.row)
      alert("웹검색 정책이 저장되었습니다.")
    } catch (e) {
      console.error(e)
      alert("웹검색 정책 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const providerList = [
    { key: "openai", label: "OpenAI (GPT)" },
    { key: "google", label: "Google (Gemini)" },
    { key: "anthropic", label: "Anthropic (Claude)" },
  ]

  return (
    <AdminPage
      className="flex flex-col gap-4"
      headerContent={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
            새로고침
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !policy}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            저장
          </Button>
        </div>
      }
    >
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">AI 서비스 - 웹검색 정책</div>
        <div className="flex gap-2" />
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <Label>웹검색 기능 활성화</Label>
            <Switch
              checked={Boolean(policy?.enabled)}
              onCheckedChange={(v) => policy && setPolicy({ ...policy, enabled: Boolean(v) })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>기본 웹 허용 상태</Label>
            <Switch
              checked={Boolean(policy?.default_allowed)}
              onCheckedChange={(v) => policy && setPolicy({ ...policy, default_allowed: Boolean(v) })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>웹검색 공급자</Label>
            <Input value={policy?.provider || ""} disabled placeholder="serper" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>허용 Provider Family</Label>
            <div className="flex flex-wrap gap-2">
              {providerList.map((p) => {
                const enabled = policy?.enabled_providers?.includes(p.key) ?? false
                return (
                  <Button
                    key={p.key}
                    type="button"
                    variant={enabled ? "default" : "outline"}
                    onClick={() => toggleProvider(p.key)}
                  >
                    {p.label}
                  </Button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <Label>최대 검색 횟수</Label>
            <Input
              type="number"
              value={policy?.max_search_calls ?? 0}
              onChange={(e) => policy && setPolicy({ ...policy, max_search_calls: toNumber(e.target.value, policy.max_search_calls) })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>최대 스니펫 토큰</Label>
            <Input
              type="number"
              value={policy?.max_total_snippet_tokens ?? 0}
              onChange={(e) =>
                policy &&
                setPolicy({
                  ...policy,
                  max_total_snippet_tokens: toNumber(e.target.value, policy.max_total_snippet_tokens),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>검색 타임아웃(ms)</Label>
            <Input
              type="number"
              value={policy?.timeout_ms ?? 0}
              onChange={(e) => policy && setPolicy({ ...policy, timeout_ms: toNumber(e.target.value, policy.timeout_ms) })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>재시도 횟수</Label>
            <Input
              type="number"
              value={policy?.retry_max ?? 0}
              onChange={(e) => policy && setPolicy({ ...policy, retry_max: toNumber(e.target.value, policy.retry_max) })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>재시도 기본 지연(ms)</Label>
            <Input
              type="number"
              value={policy?.retry_base_delay_ms ?? 0}
              onChange={(e) =>
                policy && setPolicy({ ...policy, retry_base_delay_ms: toNumber(e.target.value, policy.retry_base_delay_ms) })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>재시도 최대 지연(ms)</Label>
            <Input
              type="number"
              value={policy?.retry_max_delay_ms ?? 0}
              onChange={(e) =>
                policy && setPolicy({ ...policy, retry_max_delay_ms: toNumber(e.target.value, policy.retry_max_delay_ms) })
              }
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          웹검색은 SERPER_API_KEY가 설정되어 있어야 동작합니다. GPT는 도구 호출 방식, Gemini는 검색 결과를 컨텍스트로 주입하는 방식으로
          처리됩니다.
        </div>
      </Card>
    </AdminPage>
  )
}
