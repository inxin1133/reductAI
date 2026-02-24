import { useLocation } from "react-router-dom"

const POLICY_TITLES: Record<string, string> = {
  "/terms": "이용약관",
  "/privacy": "개인정보처리방침",
  "/cookies": "쿠키 정책",
  "/refund-policy": "환불 정책",
}

export default function PolicyPage() {
  const location = useLocation()
  const title = POLICY_TITLES[location.pathname] || "정책"

  return (
    <section className="py-20">
      <div className="mx-auto max-w-[800px] px-6">
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <div className="mt-8 rounded-lg border border-border/60 bg-card p-8">
          <p className="text-muted-foreground">
            {title} 내용이 준비 중입니다. 빠른 시일 내에 업데이트하겠습니다.
          </p>
        </div>
      </div>
    </section>
  )
}
