import { 
  Bot, 
  Coins, 
  FileText, 
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
      { title: "대시보드", icon: LayoutDashboard, href: "/admin" },
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
          { title: "테넌트 관리", href: "/admin/tenants" },
          { title: "역할 및 권한 관리", href: "/admin/roles" }, // RBAC
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
          { title: "모델 라우팅 규칙", href: "/admin/ai/model-routing-rules" },                    
          { title: "모델 사용 로그", href: "/admin/ai/model-usage-logs" },          
        ]
      },
      { 
        title: "토큰 이코노미", 
        icon: Coins, 
        items: [
          { title: "토큰 상품 관리" },
          { title: "토큰 할당/지급" },
          { title: "토큰 사용 이력" },
          { title: "유저/테넌트 잔액 조회" },
        ]
      },
      { 
        title: "결제 및 구독", 
        icon: WalletCards, 
        items: [
          { title: "구독 플랜 관리" },
          { title: "구독 현황" },
          { title: "결제 내역(Transactions)" },
          { title: "청구서(Invoices)" },
        ]
      },
      { 
        title: "CMS / 게시판", 
        icon: FileText, 
        items: [
          { title: "게시판/카테고리 관리" },
          { title: "게시물 관리" },
          { title: "댓글/신고 관리" },
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
          { title: "서비스(Services) 관리" },
          { title: "보안 정책" },
          { title: "감사 로그(Audit)" },
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

