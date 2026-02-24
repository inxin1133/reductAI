import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ModelInfo = {
  provider: string
  name: string
  category: string
  description: string
  strengths: string[]
  tier: "free" | "pro" | "premium" | "all"
}

const MODELS: ModelInfo[] = [
  {
    provider: "OpenAI",
    name: "GPT-4o",
    category: "텍스트",
    description: "가장 강력한 범용 텍스트 모델. 복잡한 추론, 코딩, 분석에 최적화",
    strengths: ["추론", "코딩", "다국어"],
    tier: "pro",
  },
  {
    provider: "OpenAI",
    name: "GPT-4o mini",
    category: "텍스트",
    description: "빠른 응답과 효율적인 비용의 경량 모델",
    strengths: ["빠른 응답", "비용 효율"],
    tier: "free",
  },
  {
    provider: "Anthropic",
    name: "Claude 4 Sonnet",
    category: "텍스트",
    description: "뛰어난 분석력과 긴 컨텍스트 처리. 문서 작성 및 코딩에 탁월",
    strengths: ["긴 컨텍스트", "분석", "코딩"],
    tier: "pro",
  },
  {
    provider: "Anthropic",
    name: "Claude 4 Haiku",
    category: "텍스트",
    description: "빠르고 간결한 응답에 최적화된 경량 모델",
    strengths: ["빠른 응답", "요약"],
    tier: "free",
  },
  {
    provider: "Google",
    name: "Gemini 2.5 Pro",
    category: "텍스트",
    description: "멀티모달 이해 및 긴 컨텍스트 처리에 강한 차세대 모델",
    strengths: ["멀티모달", "추론", "긴 컨텍스트"],
    tier: "pro",
  },
  {
    provider: "Google",
    name: "Gemini 2.0 Flash",
    category: "텍스트",
    description: "빠른 속도와 합리적 성능의 경량 모델",
    strengths: ["빠른 응답", "비용 효율"],
    tier: "free",
  },
  {
    provider: "OpenAI",
    name: "DALL·E 3",
    category: "이미지",
    description: "텍스트 설명으로 고품질 이미지 생성. 정확한 프롬프트 해석 능력",
    strengths: ["텍스트 정확도", "고품질"],
    tier: "pro",
  },
  {
    provider: "Stability AI",
    name: "Stable Diffusion XL",
    category: "이미지",
    description: "다양한 스타일의 이미지 생성. 세밀한 제어 가능",
    strengths: ["스타일 다양성", "세밀 제어"],
    tier: "pro",
  },
  {
    provider: "Google",
    name: "Imagen 3",
    category: "이미지",
    description: "포토리얼리스틱 이미지 생성에 특화된 Google의 최신 모델",
    strengths: ["사실적 이미지", "고해상도"],
    tier: "premium",
  },
  {
    provider: "OpenAI",
    name: "Sora",
    category: "영상",
    description: "텍스트로 고품질 영상 생성. 최대 60초 영상 클립 제작",
    strengths: ["영상 생성", "시네마틱"],
    tier: "premium",
  },
  {
    provider: "Google",
    name: "Veo 2",
    category: "영상",
    description: "텍스트 및 이미지를 기반으로 영상을 생성하는 Google의 모델",
    strengths: ["멀티모달 입력", "자연스러운 동작"],
    tier: "premium",
  },
  {
    provider: "Meta",
    name: "MusicGen",
    category: "음악",
    description: "텍스트 설명으로 다양한 장르의 음악을 생성",
    strengths: ["장르 다양성", "길이 조절"],
    tier: "pro",
  },
  {
    provider: "ElevenLabs",
    name: "ElevenLabs TTS",
    category: "음성",
    description: "자연스러운 음성 합성. 다양한 목소리와 감정 표현",
    strengths: ["자연스러운 음성", "다국어"],
    tier: "pro",
  },
  {
    provider: "OpenAI",
    name: "Whisper",
    category: "음성",
    description: "고정밀 음성 인식 및 텍스트 변환",
    strengths: ["높은 정확도", "다국어"],
    tier: "free",
  },
]

const CATEGORIES = ["전체", "텍스트", "이미지", "영상", "음악", "음성"] as const

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro+",
  premium: "Premium+",
  all: "전체",
}

const TIER_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400",
  premium: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
  all: "bg-muted text-muted-foreground",
}

const CATEGORY_COLORS: Record<string, string> = {
  텍스트: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  이미지: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
  영상: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
  음악: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  음성: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
}

import { useState } from "react"

export default function ModelsPage() {
  const [activeCategory, setActiveCategory] = useState<string>("전체")

  const filteredModels =
    activeCategory === "전체"
      ? MODELS
      : MODELS.filter((m) => m.category === activeCategory)

  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            LLM Models
          </span>
          <h1 className="text-4xl font-black text-foreground lg:text-5xl">
            적용 및 튜닝된<br />
            <span className="text-primary">AI 모델</span> 안내
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            ReductAI에서 사용할 수 있는 다양한 AI 모델을 확인하세요.
            각 모델은 최적의 성능을 위해 튜닝되어 있으며, 플랜에 따라 접근 가능합니다.
          </p>
        </div>
      </section>

      {/* Filter */}
      <section className="border-t border-border/40 bg-muted/20 pb-20 pt-8">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Model table (desktop) */}
          <div className="hidden overflow-hidden rounded-xl border border-border/60 bg-card lg:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/40 bg-muted/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">프로바이더</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">모델</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">유형</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">설명</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">강점</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">요금제</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.map((model) => (
                  <tr key={`${model.provider}-${model.name}`} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-card-foreground whitespace-nowrap">
                      {model.provider}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-card-foreground whitespace-nowrap">
                      {model.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", CATEGORY_COLORS[model.category] || "bg-muted text-muted-foreground")}>
                        {model.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs">
                      {model.description}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {model.strengths.map((s) => (
                          <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", TIER_COLORS[model.tier])}>
                        {TIER_LABELS[model.tier]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Model cards (mobile) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:hidden">
            {filteredModels.map((model) => (
              <div
                key={`${model.provider}-${model.name}`}
                className="rounded-xl border border-border/60 bg-card p-5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{model.provider}</span>
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", TIER_COLORS[model.tier])}>
                    {TIER_LABELS[model.tier]}
                  </span>
                </div>
                <h3 className="text-base font-bold text-card-foreground">{model.name}</h3>
                <span className={cn("mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-medium", CATEGORY_COLORS[model.category] || "bg-muted text-muted-foreground")}>
                  {model.category}
                </span>
                <p className="mt-2 text-sm text-muted-foreground">{model.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {model.strengths.map((s) => (
                    <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Note */}
      <section className="py-16">
        <div className="mx-auto max-w-[800px] px-6 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            * 모델 목록은 지속적으로 업데이트됩니다. 최신 AI 모델이 출시되면 검증 후 빠르게 추가됩니다.<br />
            * 일부 모델은 플랜에 따라 접근이 제한될 수 있습니다. 자세한 내용은 요금제를 확인하세요.<br />
            * 모델별 크레딧 소비량은 입출력 토큰 수와 생성 유형에 따라 달라집니다.
          </p>
          <div className="mt-8">
            <Link to="/pricing">
              <Button variant="outline" size="lg">요금제 확인하기</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
