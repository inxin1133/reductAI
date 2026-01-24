import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"

type EnumSpec = { type: "enum"; values: string[]; label?: string; description?: string }
type IntSpec = { type: "int"; min?: number; max?: number; step?: number; label?: string; description?: string }
type NumberSpec = { type: "number"; min?: number; max?: number; step?: number; label?: string; description?: string }
type StringSpec = { type: "string"; label?: string; description?: string; placeholder?: string }
type OptionSpec = EnumSpec | IntSpec | NumberSpec | StringSpec

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function clamp(n: number, min?: number, max?: number) {
  let out = n
  if (typeof min === "number") out = Math.max(min, out)
  if (typeof max === "number") out = Math.min(max, out)
  return out
}

function normalizeSupports(v: unknown): Record<string, boolean> {
  if (!isRecord(v)) return {}
  const out: Record<string, boolean> = {}
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "boolean") out[k] = val
  }
  return out
}

function normalizeLimits(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {}
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries(v)) {
    const n = asNumber(val)
    if (n !== null) out[k] = n
  }
  return out
}

function normalizeOptions(v: unknown): Record<string, OptionSpec> {
  if (!isRecord(v)) return {}
  const out: Record<string, OptionSpec> = {}
  for (const [k, raw] of Object.entries(v)) {
    if (!isRecord(raw)) continue
    const type = asString(raw.type)
    if (type !== "enum" && type !== "int" && type !== "number" && type !== "string") continue

    const label = asString(raw.label) ?? undefined
    const description = asString(raw.description) ?? undefined

    if (type === "enum") {
      const valuesRaw = raw.values
      const values = Array.isArray(valuesRaw) ? valuesRaw.map((x) => String(x)) : []
      if (!values.length) continue
      out[k] = { type: "enum", values, label, description }
      continue
    }
    if (type === "string") {
      const placeholder = asString(raw.placeholder) ?? undefined
      out[k] = { type: "string", label, description, placeholder }
      continue
    }

    const min = asNumber(raw.min) ?? undefined
    const max = asNumber(raw.max) ?? undefined
    const step = asNumber(raw.step) ?? undefined
    out[k] = type === "int" ? { type: "int", min, max, step, label, description } : { type: "number", min, max, step, label, description }
  }
  return out
}

function normalizeDefaults(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {}
}

function inferLimitMaxForKey(limits: Record<string, number>, optionKey: string): number | undefined {
  // required example mapping: n -> max_images_per_request
  if (optionKey === "n" && typeof limits.max_images_per_request === "number") return limits.max_images_per_request

  const a = limits[`max_${optionKey}`]
  if (typeof a === "number") return a
  const b = limits[`${optionKey}_max`]
  if (typeof b === "number") return b
  const c = limits[`max_${optionKey}_per_request`]
  if (typeof c === "number") return c
  return undefined
}

function effectiveMax(specMax: number | undefined, limitMax: number | undefined) {
  if (typeof specMax === "number" && typeof limitMax === "number") return Math.min(specMax, limitMax)
  return typeof specMax === "number" ? specMax : limitMax
}

function computeInitialValue(key: string, spec: OptionSpec, defaults: Record<string, unknown>) {
  const dv = defaults[key]
  if (spec.type === "enum") {
    if (typeof dv === "string" && spec.values.includes(dv)) return dv
    return spec.values[0]
  }
  if (spec.type === "string") {
    return typeof dv === "string" ? dv : ""
  }
  if (spec.type === "int") {
    const n = typeof dv === "number" && Number.isFinite(dv) ? Math.floor(dv) : typeof spec.min === "number" ? Math.floor(spec.min) : 0
    return n
  }
  const n = typeof dv === "number" && Number.isFinite(dv) ? dv : typeof spec.min === "number" ? spec.min : 0
  return n
}

export type ModelOptionsPanelProps = {
  capabilities: unknown
  value: Record<string, unknown>
  onApply: (next: Record<string, unknown>) => void
  className?: string
}

export function ModelOptionsPanel({ capabilities, value, onApply, className }: ModelOptionsPanelProps) {
  const cap = isRecord(capabilities) ? capabilities : {}
  const options = React.useMemo(() => normalizeOptions(cap.options), [cap.options])
  const defaults = React.useMemo(() => normalizeDefaults(cap.defaults), [cap.defaults])
  const supports = React.useMemo(() => normalizeSupports(cap.supports), [cap.supports])
  const limits = React.useMemo(() => normalizeLimits(cap.limits), [cap.limits])

  const optionKeys = React.useMemo(() => Object.keys(options).sort((a, b) => a.localeCompare(b)), [options])
  const visibleKeys = React.useMemo(() => optionKeys.filter((k) => supports[k] !== false), [optionKeys, supports])

  const computedDefaults = React.useMemo(() => {
    const out: Record<string, unknown> = {}
    for (const k of visibleKeys) out[k] = computeInitialValue(k, options[k], defaults)
    return out
  }, [visibleKeys, options, defaults])

  const initialDraft = React.useMemo(() => {
    const out: Record<string, unknown> = { ...computedDefaults }
    for (const k of Object.keys(computedDefaults)) {
      if (k in value) out[k] = value[k]
    }
    return out
  }, [computedDefaults, value])

  const [draft, setDraft] = React.useState<Record<string, unknown>>(initialDraft)

  const sanitizeDraft = React.useCallback((d: Record<string, unknown>) => {
    // sanitize + clamp based on spec + limits
    const out: Record<string, unknown> = {}
    for (const k of visibleKeys) {
      const spec = options[k]
      const limitMax = inferLimitMaxForKey(limits, k)
      const max = spec.type === "int" || spec.type === "number" ? effectiveMax(spec.max, limitMax) : undefined
      const min = spec.type === "int" || spec.type === "number" ? spec.min : undefined
      const v = d[k]

      if (spec.type === "enum") {
        const s = typeof v === "string" && spec.values.includes(v) ? v : spec.values[0]
        out[k] = s
      } else if (spec.type === "string") {
        out[k] = typeof v === "string" ? v : String(v ?? "")
      } else if (spec.type === "int") {
        const n0 = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0
        const clamped = clamp(n0, min, max)
        const step = typeof spec.step === "number" && spec.step > 0 ? spec.step : null
        if (!step) {
          out[k] = clamped
        } else {
          const base = typeof min === "number" ? min : 0
          const snapped = base + Math.floor((clamped - base) / step) * step
          out[k] = clamp(Math.floor(snapped), min, max)
        }
      } else {
        const n = typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : 0
        out[k] = clamp(n, min, max)
      }
    }
    return out
  }, [limits, options, visibleKeys])

  if (!visibleKeys.length) return <div className={cn("text-sm text-muted-foreground", className)}>이 모델은 옵션이 없습니다.</div>

  const setAndApply = (nextDraft: Record<string, unknown>) => {
    setDraft(nextDraft)
    onApply(sanitizeDraft(nextDraft))
  }

  return (
    <div className={cn("w-full", className)}>
      <Card className="max-h-[360px] py-2 overflow-y-scroll overscroll-contain scrollbar-thin border-0 shadow-none rounded-none">
        {/* <CardHeader className="px-4">
          <CardTitle>Options</CardTitle>
          <CardDescription>capabilities.options 기반 (변경 즉시 적용)</CardDescription>
        </CardHeader> */}
        <CardContent className="px-2">
          <div className="flex flex-col gap-4">
            {visibleKeys.map((k) => {
              const spec = options[k]
              const label = spec.label || k
              const desc = spec.description

              const limitMax = inferLimitMaxForKey(limits, k)
              const max = spec.type === "int" || spec.type === "number" ? effectiveMax(spec.max, limitMax) : undefined
              const min = spec.type === "int" || spec.type === "number" ? spec.min : undefined
              const helper =
                spec.type === "enum" || spec.type === "string"
                  ? ""
                  : typeof min === "number" || typeof max === "number"
                    ? `범위: ${typeof min === "number" ? min : "-∞"} ~ ${typeof max === "number" ? max : "∞"}${typeof limitMax === "number" && typeof spec.max === "number" && limitMax !== spec.max ? ` (limits: ${limitMax})` : ""}`
                    : typeof limitMax === "number"
                      ? `limits: ${limitMax}`
                      : ""

              if (spec.type === "enum") {
                const current = typeof draft[k] === "string" ? (draft[k] as string) : spec.values[0]
                const selected = spec.values.includes(current) ? current : spec.values[0]
                return (
                  <div key={k} className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm">{label}</Label>
                      {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                    </div>
                    <Select
                      value={selected}
                      onValueChange={(v) => {
                        const next = { ...draft, [k]: v }
                        setAndApply(next)
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {spec.values.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }

      if (spec.type === "string") {
        const current = typeof draft[k] === "string" ? (draft[k] as string) : String(draft[k] ?? "")
        return (
          <div key={k} className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-sm">{label}</Label>
              {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
              {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
            </div>
            <Input
              value={current}
              placeholder={spec.placeholder || ""}
              onChange={(e) => {
                const next = { ...draft, [k]: e.target.value }
                setAndApply(next)
              }}
            />
          </div>
        )
      }

              if (spec.type === "int") {
                const current = typeof draft[k] === "number" && Number.isFinite(draft[k]) ? (draft[k] as number) : Number(draft[k]) || 0
                const sliderMin = typeof min === "number" ? min : 0
                const sliderMax = typeof max === "number" ? max : sliderMin + 100
                const step = typeof spec.step === "number" && spec.step > 0 ? spec.step : 1
                return (
                  <div key={k} className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm">{label}</Label>
                      {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm tabular-nums">{Math.floor(clamp(current, sliderMin, sliderMax))}</div>
                      <div className="text-xs text-muted-foreground">
                        {sliderMin} ~ {sliderMax}
                      </div>
                    </div>
                    <Slider
                      value={[clamp(Math.floor(current), sliderMin, sliderMax)]}
                      min={sliderMin}
                      max={sliderMax}
                      step={step}
                      onValueChange={(v) => {
                        const n = typeof v?.[0] === "number" ? v[0] : current
                        const next = { ...draft, [k]: clamp(Math.floor(n), sliderMin, sliderMax) }
                        setAndApply(next)
                      }}
                    />
                  </div>
                )
              }

              // number
              const current = typeof draft[k] === "number" && Number.isFinite(draft[k]) ? (draft[k] as number) : Number(draft[k]) || 0
              const step = typeof spec.step === "number" ? spec.step : 0.1
              const sliderMin = typeof min === "number" ? min : 0
              const sliderMax = typeof max === "number" ? max : sliderMin + 1
              return (
                <div key={k} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm">{label}</Label>
                      {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
                      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
                    </div>
                    <div className="text-sm tabular-nums">{current}</div>
                  </div>
                  <Slider
                    value={[clamp(current, sliderMin, sliderMax)]}
                    min={sliderMin}
                    max={sliderMax}
                    step={step}
                    onValueChange={(v) => {
                      const n = typeof v?.[0] === "number" ? v[0] : current
                      const next = { ...draft, [k]: clamp(n, sliderMin, sliderMax) }
                      setAndApply(next)
                    }}
                  />
                </div>
              )
            })}
          </div>
        </CardContent>        
      </Card>
      <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full mt-3"
            onClick={() => {
              setAndApply(computedDefaults)
            }}
          >
            Reset to Defaults
      </Button>
    </div>
  )
}


