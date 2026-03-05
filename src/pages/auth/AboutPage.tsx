import { Link } from "react-router-dom"
import { Lightbulb, Target, Shield, Zap, Globe, Users, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-[1000px] px-6 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            About Us
          </span>
          <h1 className="text-4xl font-black text-foreground lg:text-5xl">
            reduct<span className="text-primary">AI</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            "Reduct"는 <strong className="text-foreground">Reduce(줄이다)</strong>와 <strong className="text-foreground">Conduct(이끌다)</strong>의 합성어입니다.
            <br />
            AI 사용의 복잡성과 비용을 줄이고(Reduce), 사용자를 더 나은 생산성으로 이끄는(Conduct) 것이 우리의 미션입니다.
          </p>
        </div>
      </section>

      {/* Name meaning */}
      <section className="border-t border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-[1000px] px-6">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-6">리덕트AI의 뜻</h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
                    <Target className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Reduce — 줄이다</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      여러 AI 서비스를 개별적으로 구독하고 관리하는 번거로움을 줄입니다.
                      하나의 플랫폼에서 모든 AI를 사용함으로써 비용과 시간, 학습 비용을 절감합니다.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    <Lightbulb className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Conduct — 이끌다</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      사용자가 AI를 효과적으로 활용할 수 있도록 안내합니다.
                      목적에 맞는 최적의 모델을 추천하고, 결과물을 체계적으로 관리할 수 있도록 이끕니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-8">
              <blockquote className="space-y-4">
                <p className="text-xl font-bold text-card-foreground leading-relaxed">
                  "모든 사람이 AI의 혁신적인 힘을
                  <br />
                  쉽고 저렴하게 활용할 수 있는 세상"
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  우리는 AI 기술이 특정 기업이나 전문가의 전유물이 아닌,
                  모든 개인과 팀이 일상에서 자연스럽게 사용할 수 있어야 한다고 믿습니다.
                  ReductAI는 그 믿음을 현실로 만들기 위해 존재합니다.
                </p>
              </blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* Service Direction */}
      <section className="py-20">
        <div className="mx-auto max-w-[1000px] px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-foreground">서비스 지향점</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              ReductAI가 지향하는 핵심 가치와 서비스 방향입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="group text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 transition-transform group-hover:scale-110 dark:bg-teal-950 dark:text-teal-400">
                <Zap className="size-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">통합과 단순화</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                분산된 AI 도구들을 하나의 인터페이스로 통합합니다.
                사용자는 복잡한 설정 없이 원하는 AI를 즉시 사용할 수 있습니다.
              </p>
            </div>

            <div className="group text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition-transform group-hover:scale-110 dark:bg-indigo-950 dark:text-indigo-400">
                <Shield className="size-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">비용 최적화</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                크레딧 기반의 유연한 과금 체계로 실제 사용량만큼만 비용을 지불합니다.
                팀 단위 공유를 통해 라이선스 비용을 더욱 절감할 수 있습니다.
              </p>
            </div>

            <div className="group text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition-transform group-hover:scale-110 dark:bg-amber-950 dark:text-amber-400">
                <Globe className="size-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">최신 기술 접근</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                새로운 AI 모델이 출시되면 검증 후 빠르게 플랫폼에 추가합니다.
                사용자는 항상 최신 AI 기술을 가장 먼저 사용할 수 있습니다.
              </p>
            </div>

            <div className="group text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition-transform group-hover:scale-110 dark:bg-rose-950 dark:text-rose-400">
                <Users className="size-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">팀 협업 중심</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                개인의 생산성뿐 아니라 팀 전체의 AI 활용도를 높이는 것이 목표입니다.
                크레딧 공유, 지식 공유, 협업 페이지를 통해 팀워크를 극대화합니다.
              </p>
            </div>

            <div className="group text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 transition-transform group-hover:scale-110 dark:bg-violet-950 dark:text-violet-400">
                <Heart className="size-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">사용자 경험 우선</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                기술의 복잡성은 뒤로 숨기고, 사용자에게는 직관적이고 아름다운 인터페이스만 보여줍니다.
                AI를 처음 접하는 분도 쉽게 시작할 수 있습니다.
              </p>
            </div>

            <div className="group text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-110 dark:bg-emerald-950 dark:text-emerald-400">
                <Lightbulb className="size-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">지속적 혁신</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                AI 기술의 빠른 발전에 발맞춰 서비스를 지속적으로 개선합니다.
                사용자 피드백을 적극 반영하여 진정으로 필요한 기능을 만들어갑니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-[1000px] px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground">
            함께 만들어가요
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            ReductAI에 대해 더 알고 싶거나, 파트너십을 논의하고 싶으시다면 언제든 문의해 주세요.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/contact">
              <Button size="lg">문의하기</Button>
            </Link>
            <Link to="/">
              <Button variant="outline" size="lg">
                서비스 시작하기
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
