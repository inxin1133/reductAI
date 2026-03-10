import { Link } from "react-router-dom"

const POLICY_LINKS = [
  { to: "/terms", label: "이용약관" },
  { to: "/privacy", label: "개인정보처리방침" },
  { to: "/cookies", label: "쿠키 정책" },
  { to: "/refund-policy", label: "환불 정책" },
]

const NAV_LINKS = [
  { to: "/product", label: "제품" },
  { to: "/pricing", label: "가격" },
  { to: "/models", label: "LLM 모델" },
  { to: "/about", label: "회사소개" },
  { to: "/contact", label: "문의" },
]

export function LandingFooter() {
  return (
    <footer className="border-t border-border/40 bg-muted/30">
      <div className="mx-auto max-w-[1280px] px-6 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-3">
            <div className="gap-0">
            <Link to="/" className="inline-block text-lg !font-black !text-primary">
              reduct
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              하나의 서비스에서 모든 AI를 전환 사용
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} ReductAI. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            리덕트, 이강우, 399-11-02812
            <br />
            (통신판매번호)제 2026-안양동안-0404 호
            <br />
            경기도 안양시 동안구 갈산로 15
          </p>
        </div>

        {/* Navigation */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">서비스</h4>
          <nav className="flex flex-col gap-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm !text-muted-foreground transition-colors hover:!text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Policies */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">약관 및 정책</h4>
          <nav className="flex flex-col gap-2">
            {POLICY_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm !text-muted-foreground transition-colors hover:!text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Contact */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">문의</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <a
                href="mailto:admin@reduct.page"
                className="transition-colors hover:!text-foreground"
              >
                admin@reduct.page
              </a>
              <p className="text-xs text-muted-foreground">
                개인정보보호책임자(이강우)
              </p>
            </p>
            <p>
              <a
                href="https://reduct.page"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors !text-muted-foreground hover:!text-foreground"
              >
                reduct.page
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
    </footer >
  )
}
