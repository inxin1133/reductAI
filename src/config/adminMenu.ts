import {
  Bot,
  Coins,
  DollarSign,
  Globe,
  LayoutDashboard,
  Settings,
  Users,
  WalletCards
} from "lucide-react"

export type SubMenuItem = {
  title: string
  href?: string
}

export type MenuItem = {
  title: string
  icon: React.ElementType
  items?: SubMenuItem[]
  href?: string
}

export type MenuGroup = {
  title: string
  items: MenuItem[]
}

export const adminMenuGroups: MenuGroup[] = [
  {
    title: "일반",
    items: [
      { title: "대시보드", icon: LayoutDashboard, href: "/admin/dashboard" },
    ]
  },
  {
    title: "관리",
    items: [
      {
        title: "회원 및 테넌트",
        icon: Users,
        items: [
          { title: "회원 관리", href: "/admin/users" },
          { title: "회원 연동(SSO)", href: "/admin/users/providers" },
          { title: "테넌트 관리", href: "/admin/tenants" },
          { title: "회원 테넌트 관리", href: "/admin/tenants/memberships" },
          { title: "테넌트 초대 관리", href: "/admin/tenants/invitations" },
          { title: "역할 및 권한 관리", href: "/admin/roles" },
        ]
      },
      {
        title: "AI 서비스",
        icon: Bot,
        items: [
          { title: "AI 제공업체(Providers)", href: "/admin/ai/providers" },
          { title: "AI API Key(Credentials)", href: "/admin/ai/credentials" },
          { title: "AI 모델 관리", href: "/admin/ai/models" },
          { title: "모델 접근 권한", href: "/admin/ai/model-access" },
          { title: "프롬프트 템플릿", href: "/admin/ai/prompt-templates" },
          { title: "예시 프롬프트(Prompt Suggestions)", href: "/admin/ai/prompt-suggestions" },
          { title: "출력 계약(Response Schemas)", href: "/admin/ai/response-schemas" },
          { title: "모델 API 프로필(Model API Profiles)", href: "/admin/ai/model-api-profiles" },
          { title: "Provider 인증 프로필(Auth Profiles)", href: "/admin/ai/provider-auth-profiles" },
          { title: "모델 라우팅 규칙", href: "/admin/ai/model-routing-rules" },
          { title: "모델 사용 로그", href: "/admin/ai/model-usage-logs" },
          { title: "웹검색 정책", href: "/admin/ai/web-search-settings" },
        ]
      },
      {
        title: "가격/요율 관리",
        icon: DollarSign,
        items: [
          { title: "Rate Card/버전 관리", href: "/admin/pricing/rate-cards" },
          { title: "모델/모달리티 요율표", href: "/admin/pricing/rates" },
          { title: "마진 정책", href: "/admin/pricing/markups" },
          { title: "사용자 공개 요금표", href: "/admin/pricing/public-prices" },
        ]
      },
      {
        title: "크레딧/포인트",
        icon: Coins,
        items: [
          { title: "크레딧 계정/풀", href: "/admin/credits/accounts" },
          { title: "크레딧 원장(ledger)", href: "/admin/credits/ledger" },
          { title: "그랜트/분배 정책", href: "/admin/credits/grants" },
          { title: "충전 상품 관리", href: "/admin/credits/topup-products" },
          { title: "크레딧 사용 분배", href: "/admin/credits/usage-allocations" },
        ]
      },
      {
        title: "결제 및 구독", 
        icon: WalletCards, 
        items: [
          { title: "구독 플랜 관리", href: "/admin/billing/plans" },
          { title: "플랜 가격/버전", href: "/admin/billing/plan-prices" },
          { title: "구독 현황", href: "/admin/billing/subscriptions" },
          { title: "청구서(Invoices)", href: "/admin/billing/invoices" },
          { title: "결제 내역(Transactions)", href: "/admin/billing/transactions" },
          { title: "결제 수단/PG 설정", href: "/admin/billing/payment-settings" },
          { title: "세금/환율 관리", href: "/admin/billing/tax-fx" },
        ]
      },
    ]
  },
  {
    title: "설정",
    items: [
      {
        title: "시스템 설정",
        icon: Settings,
        items: [
          { title: "서비스(Services) 관리", href: "/admin/system/services" },
          { title: "보안 정책", href: "/admin/system/security" },
          { title: "감사 로그(Audit)", href: "/admin/system/audit" },
        ]
      },
      {
        title: "다국어(i18n)",
        icon: Globe,
        items: [
          { title: "지원 언어 관리", href: "/admin/i18n/languages" },
          { title: "네임스페이스 관리", href: "/admin/i18n/namespaces" },
          { title: "번역 데이터 관리", href: "/admin/i18n/translations" },
          { title: "번역 이력", href: "/admin/i18n/history" },
        ]
      },
    ]
  }
]

