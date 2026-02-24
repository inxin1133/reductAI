import * as React from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { LoginModal } from "@/components/LoginModal"
import { ChatInterface } from "@/components/ChatInterface"
import { consumeSessionExpiredNotice } from "@/lib/session"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ArrowRight,
  Bot,
  FileText,
  DollarSign,
  Users,
} from "lucide-react"

export default function Intro() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false)
  const [sessionExpiredOpen, setSessionExpiredOpen] = React.useState(false)

  React.useEffect(() => {
    if (consumeSessionExpiredNotice()) {
      setSessionExpiredOpen(true)
    }
  }, [])

  React.useEffect(() => {
    const params = new URLSearchParams(location.search)
    const token = params.get("token")
    const error = params.get("error")
    const provider = params.get("provider")
    if (error) {
      const providerLabel =
        provider === "naver" ? "네이버" : provider === "kakao" ? "카카오" : provider === "google" ? "구글" : "SSO"
      const errorMessageMap: Record<string, string> = {
        email_required: `${providerLabel} 로그인에 이메일 제공 동의가 필요합니다.`,
        token_exchange_failed: `${providerLabel} 인증 토큰 발급에 실패했습니다.`,
        invalid_state: `${providerLabel} 인증 상태값이 만료되었습니다. 다시 시도해 주세요.`,
        oauth_not_configured: `${providerLabel} OAuth 설정이 누락되었습니다.`,
        profile_missing: `${providerLabel} 프로필 정보를 가져오지 못했습니다.`,
        oauth_failed: `${providerLabel} 인증 처리 중 오류가 발생했습니다.`,
      }
      const message = errorMessageMap[error] || "SSO 로그인 중 오류가 발생했습니다."
      console.error("SSO error:", error, provider)
      alert(message)
      navigate("/", { replace: true })
      return
    }
    if (!token) return

    const expiresAt = Date.now() + 24 * 60 * 60 * 1000
    localStorage.setItem("token", token)
    localStorage.setItem("token_expires_at", String(expiresAt))

    const userEmail = params.get("user_email")
    const userName = params.get("user_name")
    const userId = params.get("user_id")
    const tenantId = params.get("tenant_id")
    const platformRole = params.get("platform_role")

    if (userEmail) localStorage.setItem("user_email", userEmail)
    if (userName) localStorage.setItem("user_name", userName)
    if (userId) localStorage.setItem("user_id", userId)
    if (tenantId) localStorage.setItem("tenant_id", tenantId)
    if (platformRole) localStorage.setItem("platform_role", platformRole)

    navigate("/front-ai", { replace: true })
  }, [location.search, navigate])

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 lg:py-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-4xl font-black leading-tight text-primary lg:text-6xl">
              reductAI
            </h1>
            <p className="mt-2 text-lg font-bold text-foreground">
              reduct<span className="font-normal text-muted-foreground">.page</span>
            </p>

            <div className="mt-8 flex flex-col gap-3 text-left sm:text-center">
              <p className="text-sm font-medium text-card-foreground sm:text-base">
                <span className="mr-2">🧭</span>
                하나의 서비스에서 모든 다양한 생성형 AI를 전환하여 사용할 수 있습니다.
              </p>
              <p className="text-sm font-medium text-card-foreground sm:text-base">
                <span className="mr-2">🎥</span>
                이미지, 영상, 음악, 음성, 프로그램 코딩에 전문화된 모델을 자유롭게 선택해 사용할 수 있습니다.
              </p>
              <p className="text-sm font-medium text-card-foreground sm:text-base">
                <span className="mr-2">📚</span>
                나만의 페이지에 생성된 AI의 답변을 자유롭게 저장하고 편집할 수 있습니다.
              </p>
              <p className="text-sm font-medium text-card-foreground sm:text-base">
                <span className="mr-2">👫</span>
                팀/그룹을 구성해 유료 LLM모델을 공유해 사용할 수 있습니다.
              </p>
              <p className="text-sm font-medium text-card-foreground sm:text-base">
                <span className="mr-2">💰</span>
                물론, 가장 중요한 것은 비용을 줄일 수 있다는 것 입니다.
              </p>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <Button size="lg" onClick={() => setIsLoginModalOpen(true)}>
                무료로 시작하기
                <ArrowRight className="ml-1 size-4" />
              </Button>
              <Link to="/product">
                <Button variant="outline" size="lg">
                  더 알아보기
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Chat Demo */}
      <section className="border-t border-border/40 bg-muted/20 py-12">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="mx-auto max-w-[800px]">
            <ChatInterface />
          </div>
        </div>
      </section>

      {/* Quick Feature Overview */}
      <section className="py-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <h2 className="mb-10 text-center text-3xl font-bold text-foreground">
            왜 ReductAI인가요?
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/product" className="group rounded-xl border border-border/60 bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md">
              <Bot className="mb-3 size-8 text-teal-500" />
              <h3 className="text-base font-bold text-card-foreground group-hover:text-primary">통합 AI 에이전트</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                GPT, Claude, Gemini 등 다양한 모델을 하나의 인터페이스에서 자유롭게 전환
              </p>
            </Link>

            <Link to="/product" className="group rounded-xl border border-border/60 bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md">
              <FileText className="mb-3 size-8 text-indigo-500" />
              <h3 className="text-base font-bold text-card-foreground group-hover:text-primary">지식 라이브러리</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                AI 답변을 페이지로 저장하고 편집하여 나만의 지식 베이스를 구축
              </p>
            </Link>

            <Link to="/pricing" className="group rounded-xl border border-border/60 bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md">
              <DollarSign className="mb-3 size-8 text-amber-500" />
              <h3 className="text-base font-bold text-card-foreground group-hover:text-primary">비용 절감</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                크레딧 기반 과금으로 여러 AI 구독 비용을 획기적으로 절감
              </p>
            </Link>

            <Link to="/pricing" className="group rounded-xl border border-border/60 bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md">
              <Users className="mb-3 size-8 text-rose-500" />
              <h3 className="text-base font-bold text-card-foreground group-hover:text-primary">팀 협업</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                팀 단위 크레딧 공유와 지식 협업으로 조직 전체의 AI 활용도 극대화
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40 bg-muted/20 py-16">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <h2 className="text-2xl font-bold text-foreground">
            지금 바로 AI의 힘을 경험하세요
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            무료 플랜으로 시작하여 ReductAI의 모든 핵심 기능을 체험해 보세요.
          </p>
          <div className="mt-6">
            <Button size="lg" onClick={() => setIsLoginModalOpen(true)}>
              무료로 시작하기
            </Button>
          </div>
        </div>
      </section>

      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />
      <AlertDialog open={sessionExpiredOpen} onOpenChange={setSessionExpiredOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>로그 세션이 종료되었습니다.</AlertDialogTitle>
            <AlertDialogDescription>다시 로그인해 주세요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction autoFocus>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
