import { Link } from "react-router-dom"
import {
  Bot,
  FileText,
  Image,
  Video,
  Music,
  Code,
  ArrowRightLeft,
  BookOpen,
  Share2,
  Lock,
  Users,
  Layers,
  Sparkles,
  Clock,
  FolderOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="group rounded-xl border border-border/60 bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md">
      <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary/20">
        <Icon className="size-6" />
      </div>
      <h3 className="mb-2 text-lg font-bold text-card-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

export default function ProductPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden py-20 lg:py-28">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            제품 소개
          </span>
          <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight text-foreground lg:text-5xl">
            하나의 플랫폼에서<br />
            <span className="text-primary">모든 생성형 AI</span>를 사용하세요
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            ReductAI는 텍스트, 이미지, 영상, 음악, 코드 생성 등 다양한 AI 모델을 하나의 인터페이스에서
            자유롭게 전환하며 사용할 수 있는 통합 AI 에이전트 플랫폼입니다.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/">
              <Button size="lg">무료로 시작하기</Button>
            </Link>
            <Link to="/pricing">
              <Button variant="outline" size="lg">
                요금제 보기
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* AI Agent Section */}
      <section className="border-t border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-600 dark:bg-teal-950 dark:text-teal-400">
              <Bot className="size-4" />
              AI Agent
            </div>
            <h2 className="text-3xl font-bold text-foreground">프론트AI 에이전트</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              대화형 인터페이스에서 목적에 맞는 AI 모델을 자유롭게 선택하고 전환하며 최적의 결과를 만들어 보세요.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={ArrowRightLeft}
              title="멀티 모델 전환"
              description="하나의 대화 안에서 GPT, Claude, Gemini 등 다양한 LLM 모델을 자유롭게 전환하며 사용할 수 있습니다. 각 모델의 강점을 최대한 활용하세요."
            />
            <FeatureCard
              icon={Image}
              title="이미지 생성"
              description="DALL·E, Stable Diffusion 등 이미지 생성 모델로 아이디어를 시각화하세요. 프롬프트 하나로 고품질 이미지를 생성합니다."
            />
            <FeatureCard
              icon={Video}
              title="영상 생성"
              description="텍스트 설명만으로 짧은 영상 클립을 생성합니다. 마케팅 콘텐츠, 프로토타입 영상 등을 빠르게 제작하세요."
            />
            <FeatureCard
              icon={Music}
              title="음악 · 음성 생성"
              description="배경 음악, 효과음, 음성 합성까지 오디오 생성 전문 모델을 활용하여 멀티미디어 콘텐츠를 완성하세요."
            />
            <FeatureCard
              icon={Code}
              title="코드 생성"
              description="프로그래밍 언어에 특화된 모델을 사용해 코드 작성, 리팩토링, 디버깅을 지원받으세요. 개발 생산성을 극대화합니다."
            />
            <FeatureCard
              icon={Clock}
              title="타임라인"
              description="모든 AI 대화 기록을 타임라인 형태로 관리하세요. 과거 대화를 쉽게 검색하고 이어서 작업할 수 있습니다."
            />
          </div>
        </div>
      </section>

      {/* File Management Section */}
      <section className="py-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              <FolderOpen className="size-4" />
              파일 관리
            </div>
            <h2 className="text-3xl font-bold text-foreground">생성 파일 관리</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              AI가 생성한 모든 이미지, 영상, 음악, 코드 파일을 체계적으로 관리하세요.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Layers}
              title="통합 파일 저장소"
              description="AI가 생성한 이미지, 영상, 음악, 문서 등 모든 파일을 하나의 저장소에서 관리합니다. 유형별 필터링과 검색을 지원합니다."
            />
            <FeatureCard
              icon={Sparkles}
              title="자동 정리"
              description="생성된 파일은 대화, 날짜, 유형별로 자동 분류됩니다. 수동 정리 없이도 필요한 파일을 빠르게 찾을 수 있습니다."
            />
            <FeatureCard
              icon={Share2}
              title="공유 및 다운로드"
              description="생성된 파일을 팀원과 공유하거나 다양한 포맷으로 다운로드하세요. 팀 프로젝트에 바로 활용할 수 있습니다."
            />
          </div>
        </div>
      </section>

      {/* Page Section */}
      <section className="border-t border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <FileText className="size-4" />
              Page
            </div>
            <h2 className="text-3xl font-bold text-foreground">나만의 지식 라이브러리</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              AI의 답변을 자유롭게 저장하고 편집하여 나만의 지식 베이스를 구축하세요.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={BookOpen}
              title="개인 페이지"
              description="AI 대화에서 얻은 유용한 답변을 나만의 페이지로 저장하세요. 블록 에디터를 활용해 자유롭게 편집하고 구성할 수 있습니다."
            />
            <FeatureCard
              icon={Share2}
              title="공유 페이지"
              description="작성한 페이지를 팀원이나 외부에 공유하세요. 협업 문서로 활용하거나 지식을 공유하는 데 이상적입니다."
            />
            <FeatureCard
              icon={Lock}
              title="권한 관리"
              description="페이지별 열람 및 편집 권한을 세밀하게 설정할 수 있습니다. 민감한 정보는 안전하게 보호하세요."
            />
            <FeatureCard
              icon={Users}
              title="팀 협업"
              description="팀 단위로 페이지를 공유하고 함께 편집하세요. 팀의 집단 지성을 하나의 공간에 모을 수 있습니다."
            />
            <FeatureCard
              icon={Sparkles}
              title="AI 연동 편집"
              description="페이지 내에서 바로 AI에게 질문하고, 답변을 페이지에 삽입할 수 있습니다. 문서 작성 워크플로우가 한층 빨라집니다."
            />
            <FeatureCard
              icon={FolderOpen}
              title="체계적 정리"
              description="폴더, 태그, 검색 기능으로 수백 개의 페이지도 체계적으로 관리하세요. 필요한 지식을 언제든 빠르게 찾을 수 있습니다."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <h2 className="text-3xl font-bold text-foreground">
            지금 바로 시작하세요
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            무료 플랜으로 ReductAI의 모든 핵심 기능을 체험해 보세요.
            신용카드 없이 바로 시작할 수 있습니다.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/">
              <Button size="lg">무료로 시작하기</Button>
            </Link>
            <Link to="/contact">
              <Button variant="outline" size="lg">
                문의하기
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
