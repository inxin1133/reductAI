import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

type PolicySection = {
  title: string
  level: "h2" | "h3"
  items?: string[]
  paragraphs?: string[]
}

function Section({ section }: { section: PolicySection }) {
  const Tag = section.level === "h2" ? "h2" : "h3"
  const cls =
    section.level === "h2"
      ? "text-base font-semibold text-foreground mt-8 first:mt-0"
      : "text-sm font-medium text-foreground mt-5 first:mt-0"
  return (
    <div>
      <Tag className={cls}>{section.title}</Tag>
      {section.paragraphs?.map((p, i) => (
        <p key={i} className="mt-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{p}</p>
      ))}
      {section.items && section.items.length > 0 ? (
        <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground list-decimal list-inside">
          {section.items.map((item, i) => (
            <li key={i} className="pl-1">{item}</li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-muted-foreground list-disc list-inside">
      {items.map((item, i) => (
        <li key={i} className="pl-1">{item}</li>
      ))}
    </ul>
  )
}

export type TermsDialogType = "terms" | "privacy" | "marketing" | "refund" | "age" | null

type TermsAgreementDialogProps = {
  type: TermsDialogType
  onOpenChange: (open: boolean) => void
}

const DIALOG_TITLES: Record<string, string> = {
  terms: "이용약관",
  privacy: "개인정보 수집 및 이용",
  marketing: "마케팅 정보 수신 동의",
  refund: "유료서비스, 자동결제 및 환불정책",
  age: "만 14세 이상 확인",
}

function TermsDialogContent() {
  const sections: PolicySection[] = [
    { title: "제 1 장 총칙", level: "h2" },
    { title: "제 1 조 (목적)", level: "h3", paragraphs: ['본 약관은 리덕트(이하 "회사")가 운영하는 AI 기반 LLM 서비스 플랫폼(이하 "서비스")을 통해 제공되는 모든 서비스의 이용조건 및 절차와 회원의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.'] },
    { title: "제 2 조 (용어의 정의)", level: "h3", paragraphs: ["① 본 약관에서 사용하는 용어의 정의는 다음과 같습니다."], items: ['"서비스"란 회사가 웹/앱 등 온라인 시스템을 통해 제공하는 LLM 기반 생성형 기능(텍스트/코드/이미지/오디오/비디오), 프로젝트/페이지 관리, 공유, 저장공간, 크레딧 기반 과금, 고객지원 등 일체를 말합니다.', '"회원"이란 본 약관에 동의하고 회사가 정한 절차에 따라 회원가입을 완료하여 서비스 이용 자격을 부여받은 개인 또는 법인/단체를 말합니다.', '"계정"이란 회원 식별 및 서비스 이용을 위해 생성되는 로그인 단위를 말합니다.', '"테넌트(Tenant)"란 서비스 내에서 권한/데이터/크레딧/저장공간이 구분되는 작업 공간 단위를 말하며, personal / team / group 유형이 있습니다.', '"테넌트 권한"이란 테넌트 내 역할을 의미하며 owner(소유자), admin(관리자), member(멤버), viewer(뷰어)로 구분됩니다.', '"서비스 등급(플랜)"이란 free / pro / premium / business / enterprise(향후 제공) 등 회사가 정한 구독 등급을 말합니다.', '"크레딧(Credit)"이란 서비스 이용 대가 산정 및 결제를 위해 회사가 부여·판매하는 서비스 내 단위를 말하며, 월 기본 크레딧(Subscription Credits)과 추가 충전 크레딧(Top-up Credits)으로 구분됩니다.', '"월 기본 크레딧"이란 구독 등급에 따라 매월 제공되는 크레딧을 말합니다.', '"추가 충전 크레딧"이란 회원이 별도로 구매하여 충전하는 크레딧을 말하며, 회사가 정한 사용기한 및 환불 제한이 적용됩니다.', '"LLM 사용 로그"란 모델명, 입력/출력/캐시 토큰, 이미지/오디오/비디오/검색 등의 과금 요소, 처리시간 등 비용 산정 및 운영을 위해 기록되는 이용내역을 말합니다.', '"운영 환율"이란 결제 시 USD 기준 요금을 각 나라의 환율로 환산하기 위해 회사가 정한 기준 환율을 말합니다.', '"콘텐츠"란 회원이 서비스에 업로드/작성/생성한 텍스트, 이미지, 파일, 링크, 메시지, 프로젝트, 페이지, 결과물 및 메타데이터를 말합니다.'] },
    { title: "제 3 조 (약관의 효력 및 변경)", level: "h3", items: ["본 약관은 서비스 화면에 게시하거나 기타의 방법으로 공지하고, 회원이 동의하여 가입을 완료한 때 효력이 발생합니다.", "회사는 합리적인 사유가 있는 경우 본 약관을 변경할 수 있으며, 변경 내용은 시행일 및 변경 사유와 함께 시행일 이전에 공지합니다.", "회원이 변경 약관에 동의하지 않는 경우 회원은 탈퇴(이용계약 해지)를 요청할 수 있으며, 변경 약관 시행일 이후에도 서비스를 계속 이용하는 경우 변경 약관에 동의한 것으로 봅니다.", "본 약관은 회사가 제공하는 모든 서비스에 우선 적용되며, 개별 서비스/기능별 별도 약관 또는 정책이 있는 경우 그에 따릅니다."] },
    { title: "제 4 조 (약관 외 준칙)", level: "h3", paragraphs: ["본 약관에 명시되지 않은 사항은 관계 법령 및 회사가 정한 운영정책, 공지사항, 서비스별 안내에 따릅니다."] },
    { title: "제 5 조 (서비스의 제공 및 변경)", level: "h3", paragraphs: ["① 회사가 제공하는 주요 서비스는 다음과 같습니다."], items: ["LLM 기반 생성 기능: 텍스트/코드/이미지/오디오/비디오 생성 및 편집 기능", "테넌트 및 협업 기능: personal/team/group 테넌트 운영, 초대, 권한 관리, 공유 페이지 제공", "크레딧 및 과금 기능: 크레딧 부여/차감, 사용내역 제공, 요금제 관리", "저장 및 스토리지 기능: 파일/페이지/자산 저장 및 용량 관리", "고객지원: 문의 접수/답변, 공지사항, FAQ 등", "기타 회사가 추가로 제공하는 기능"] },
    { title: "제 6 조 (서비스의 중단)", level: "h3", paragraphs: ["① 회사는 다음 사유가 있는 경우 서비스 제공을 일시 중단할 수 있습니다."], items: ["설비 보수/점검/교체/장애", "통신사 또는 클라우드 사업자 장애", "이용 폭주, 보안 사고 대응", "천재지변 등 불가항력"] },
    { title: "제 2 장 서비스 이용 계약", level: "h2" },
    { title: "제 7 조 (이용 신청)", level: "h3", paragraphs: ["서비스 이용을 원하는 자는 회사가 정한 회원가입 양식에 따라 정보를 기재하고 약관 및 필수 동의 항목에 동의하여 가입을 신청합니다."] },
    { title: "제 8 조 (서비스 이용 계약의 성립)", level: "h3", items: ['회원가입 시 "동의" 절차를 완료하면 본 약관 및 관련 정책에 동의한 것으로 봅니다.', "회사는 가입 신청자에 대해 본인 확인 또는 이메일 인증 등 필요한 절차를 요구할 수 있습니다.", "회사가 가입 완료를 승인한 시점에 이용계약이 성립하며, 회원은 서비스 이용 자격을 취득합니다.", "회사는 법인/단체 회원에 대해 추가 증빙(사업자 정보 등)을 요청할 수 있습니다."] },
    { title: "제 9 조 (이용 계약의 지연 및 취소)", level: "h3", paragraphs: ["① 다음 사유가 있는 경우 가입 승인이 지연될 수 있습니다."], items: ["기술상 장애", "운영 정책상 제한이 필요한 경우"] },
    { title: "제 10 조 (회원에 대한 통지)", level: "h3", items: ["회사는 회원에게 이메일, 서비스 내 알림, 푸시, SMS(필요 시) 등으로 통지할 수 있습니다.", "불특정 다수 회원에 대한 통지는 서비스 공지사항 게시로 갈음할 수 있습니다. 다만 회원에게 중대한 영향을 미치는 사항은 개별 통지합니다."] },
    { title: "제 11 조 (개인정보의 보호)", level: "h3", paragraphs: ["회사는 개인정보 보호법 등 관계 법령을 준수하며, 개인정보 처리에 관한 사항은 개인정보처리방침에 따릅니다."] },
    { title: "제 12 조 (회원 정보의 변경)", level: "h3", paragraphs: ["회원은 서비스 내 설정을 통해 본인 정보를 열람/수정할 수 있으며, 변경 미반영으로 발생한 불이익은 회원이 부담합니다."] },
    { title: "제 3 장 회사와 회원의 의무", level: "h2" },
    { title: "제 13 조 (회사의 의무)", level: "h3", items: ["회사는 특별한 사정이 없는 한 안정적 서비스 제공을 위해 노력합니다.", "회사는 회원의 불만/문의에 대해 합리적 절차에 따라 처리하며 필요 시 처리 일정 등을 안내합니다.", "회사는 회원 콘텐츠의 진실성·정확성·완전성을 보증하지 않습니다."] },
    { title: "제 14 조 (회원의 의무)", level: "h3", paragraphs: ["① 회원은 관련 법령, 본 약관, 서비스 내 안내 및 공지 사항을 준수해야 합니다.\n② 회원은 다음 행위를 해서는 안 됩니다."], items: ["불법/유해 콘텐츠 생성 또는 유포, 타인 권리 침해", "해킹, 악성코드 유포, 서비스 부하 유발 등 운영 방해", "계정 도용/공유 등 부정 이용", "회사의 사전 허락 없는 영리 목적 재판매/재배포(허용된 범위 제외)", "타인의 개인정보 수집/저장/유포", "기타 공서양속 또는 법령 위반 행위"] },
    { title: "제 15 조 (테넌트 소유자/관리자의 의무)", level: "h3", items: ["owner/admin은 초대·권한 부여·크레딧 배분·공유 범위 설정 등에 관한 책임을 부담합니다.", "owner/admin이 부여한 권한·공유 설정으로 인해 발생한 분쟁은 해당 테넌트 내부 정책 및 당사자 간 해결을 원칙으로 합니다."] },
    { title: "제 4 장 서비스 이용", level: "h2" },
    { title: "제 16 조 (연령 제한)", level: "h3", items: ["본 서비스는 원칙적으로 만 14세 이상만 가입 및 이용할 수 있습니다.", "만 14세 미만의 가입 신청이 확인되는 경우 회사는 가입을 제한하거나 계정을 해지할 수 있습니다."] },
    { title: "제 17 조 (요금제, 결제 및 자동결제)", level: "h3", items: ["유료 서비스는 월/연 선불 결제 방식이며, 결제는 대한민국 내에서는 토스 결제수단을 우선 적용하고, 향후 해외 결제는 Stripe 등으로 확장될 수 있습니다.", "회원은 결제수단(카드)을 등록해야 하며, 결제 주기에 따라 자동결제가 진행됩니다.", "서비스 요금의 기준 통화는 USD이며, 실제 청구는 회사가 정한 운영 환율을 적용하여 KRW로 결제될 수 있습니다.", "운영 환율은 서비스 운영 정책에 따라 변경될 수 있으며, 회사는 변경 시 서비스 내 공지 또는 안내를 할 수 있습니다."] },
    { title: "제 18 조 (크레딧의 부여, 사용, 차감)", level: "h3", items: ["크레딧 환산 기준은 1 USD = 1,000 크레딧입니다.", "크레딧은 모델별 이용요금(실제 모델 비용) 및 회사의 서비스 마진이 포함된 요율에 따라 차감됩니다.", "회원에게 복수 크레딧(개인/다른 테넌트 제공 크레딧 등)이 존재하는 경우, 회원은 사용할 크레딧을 선택할 수 있습니다.", "크레딧 사용 순서는 원칙적으로 회원이 선택한 기본 크레딧 → 잔여 기본 크레딧 → 충전 크레딧 순입니다.", "회사는 크레딧 사용 내역(LLM 로그 포함)을 회원에게 제공할 수 있습니다."] },
    { title: "제 19 조 (추가 충전 크레딧)", level: "h3", items: ["추가 충전 크레딧은 선불 구매이며, 구매 즉시 충전됩니다.", "추가 충전 크레딧은 환불되지 않으며, 사용기한은 구매일로부터 3년입니다(정책에 따라 변경 가능, 변경 시 공지).", "기본 크레딧 소진 시 추가 충전 크레딧이 자동 사용될 수 있습니다."] },
    { title: "제 20 조 (환불 및 구독 해지)", level: "h3", items: ["월 구독은 원칙적으로 환불되지 않으며, 회원이 구독을 취소하는 경우 당월(결제 주기 종료 시점)까지 서비스 이용이 가능하고 다음 결제일부터 갱신되지 않습니다.", "연 구독은 해지 시 사용 개월 수를 월 정상가로 산정하여 차감한 잔액을 환불합니다.", "상세 환불/변경 규칙은 환불정책 및 서비스 내 안내에 따릅니다."] },
    { title: "제 21 조 (스토리지 및 콘텐츠 소유권)", level: "h3", items: ["서비스 등급에 따라 저장 용량이 다르게 제공됩니다.", "콘텐츠의 권리는 원칙적으로 이를 생성/업로드한 회원 또는 해당 테넌트에 귀속됩니다.", "테넌트 공유 파일에서 회원이 제외되는 경우, 해당 파일은 테넌트에 귀속되며, 테넌트 소유자가 소유권 및 용량 귀속을 가집니다.", "회원은 서비스 제공을 위해 필요한 범위에서 회사가 콘텐츠를 저장·처리하는 것에 동의합니다. 다만 회사는 회원 콘텐츠를 회원 동의 없이 영리 목적으로 판매하지 않습니다."] },
    { title: "제 22 조 (게시물 및 생성 콘텐츠의 관리)", level: "h3", paragraphs: ["① 회원이 생성/게시한 콘텐츠에 대한 책임은 회원에게 있습니다.\n② 회사는 다음에 해당하는 콘텐츠를 사전 통지 없이 삭제/차단할 수 있습니다."], items: ["법령/약관 위반 또는 권리 침해", "음란/혐오/폭력/불법 행위 조장", "악성코드/피싱/스팸", "서비스 안정성 저해"] },
    { title: "제 23 조 (서비스 이용시간)", level: "h3", items: ["서비스는 원칙적으로 연중무휴 24시간 제공을 목표로 하나, 점검/장애/불가항력 등으로 중단될 수 있습니다.", "고객지원(사람이 응대하는 업무)은 영업일 기준으로 운영될 수 있습니다."] },
    { title: "제 5 장 계약 해지, 이용 제한 및 분쟁 해결", level: "h2" },
    { title: "제 24 조 (회원 탈퇴)", level: "h3", items: ["회원은 서비스 내 기능을 통해 탈퇴를 신청할 수 있습니다.", "탈퇴 시에도 법령 및 회사 정책에 따라 결제/정산/분쟁 처리를 위한 최소 정보는 일정 기간 보관될 수 있습니다(개인정보처리방침 참조)."] },
    { title: "제 25 조 (이용 제한 및 계약 해지)", level: "h3", paragraphs: ["① 회사는 회원이 약관을 위반하거나 서비스 안정성을 해치는 경우, 사전 통지 없이 이용을 제한하거나 계약을 해지할 수 있습니다.\n② 특히 다음 행위는 중대한 위반으로 간주할 수 있습니다."], items: ["불법 콘텐츠 생성/유포 또는 권리 침해", "결제 부정/차지백 남용", "시스템 공격/대규모 부하 유발", "반복적인 약관 위반"] },
    { title: "제 26 조 (손해배상 및 면책)", level: "h3", items: ["회원이 약관 위반으로 회사에 손해를 발생시킨 경우, 회원은 그 손해를 배상할 책임이 있습니다.", "회사는 회원 콘텐츠의 정확성/유용성/완전성을 보증하지 않으며, 회원이 서비스를 이용하여 얻은 결과에 대해 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.", "회사는 회원 간 또는 회원과 제3자 간 분쟁에 개입할 의무가 없으며, 이로 인한 손해에 대해 책임을 지지 않습니다.", "천재지변, 통신장애 등 불가항력으로 인한 서비스 제공 불능 시 회사의 책임은 면제됩니다(고의/중과실 제외)."] },
    { title: "제 27 조 (양도 금지)", level: "h3", paragraphs: ["회원은 본 약관상 지위 및 이용권을 타인에게 양도, 대여, 담보 제공할 수 없습니다."] },
    { title: "제 28 조 (준거법 및 관할)", level: "h3", items: ["본 약관은 대한민국 법령을 준거법으로 합니다.", "서비스 이용과 관련하여 분쟁이 발생할 경우, 회사와 회원은 성실히 협의하여 해결하도록 노력합니다.", "협의가 어려운 경우, 회사 소재지 관할 법원을 전속 관할로 합니다."] },
  ]

  return (
    <div className="space-y-1">
      {sections.map((s, i) => <Section key={i} section={s} />)}
      <div className="mt-8 border-t border-border/40 pt-4">
        <p className="text-xs text-muted-foreground">본 약관은 2026년 3월 2일부터 시행합니다.</p>
      </div>
    </div>
  )
}

function PrivacyDialogContent() {
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        회사는 개인정보 보호법 등 관계 법령을 준수하며, 서비스 제공을 위해 아래와 같이 개인정보를 수집·이용합니다.
      </p>

      <div>
        <h3 className="text-sm font-medium text-foreground">1. 수집 항목</h3>
        <div className="mt-2 space-y-1.5">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <span className="text-[10px] font-semibold text-foreground">필수</span>
            <p className="mt-0.5 text-xs text-muted-foreground">이메일(아이디), 이름/닉네임(표시명), 비밀번호(암호화), 결제 처리 관련 식별 정보(결제 토큰 등), 고객지원 문의 내용</p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <span className="text-[10px] font-semibold text-foreground">자동 수집</span>
            <p className="mt-0.5 text-xs text-muted-foreground">접속 IP, 기기/브라우저 정보, 쿠키/로그, 서비스 이용 기록(테넌트/권한/설정), LLM 사용 로그(모델명, 토큰/모달리티 사용량, 과금 요소, 처리 시간 등)</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">2. 이용 목적</h3>
        <BulletList items={[
          "회원 가입 및 본인 식별, 계정 관리",
          "서비스 제공(테넌트/협업/저장/생성 기능 제공)",
          "크레딧 차감 및 과금/정산, 청구/결제 처리",
          "부정 이용 방지, 보안 및 서비스 안정화",
          "고객 문의 대응 및 공지 전달",
        ]} />
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">3. 보관 기간</h3>
        <BulletList items={[
          "회원 탈퇴 후: 관계 법령 및 분쟁 처리 목적 범위 내에서 일정 기간 보관 후 파기",
          "결제/정산 관련 기록: 법령상 보관 기간 동안 보관",
          "LLM 사용 로그/과금 내역: 과금·정산 및 분쟁 대응 목적 범위 내 보관",
        ]} />
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">4. 제3자 제공/처리위탁</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          서비스 제공을 위해 결제 처리사(예: 토스, Stripe) 및 AI 모델/API 제공사에 일부 정보가 제공되거나 처리될 수 있습니다. 제공/위탁 범위 및 항목은 개인정보처리방침에 따릅니다.
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          귀하는 동의를 거부할 권리가 있으나, 동의 거부 시 회원가입 및 서비스 이용이 제한됩니다.
        </p>
      </div>

      <div className="border-t border-border/40 pt-4">
        <p className="text-xs text-muted-foreground">시행일: 2026년 3월 2일</p>
      </div>
    </div>
  )
}

function MarketingDialogContent() {
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        회사는 서비스 업데이트, 이벤트, 프로모션, 신규 기능 안내 등을 위해 아래와 같이 마케팅 정보를 전송할 수 있습니다.
      </p>

      <div className="space-y-1.5">
        <BulletList items={[
          "수신 채널: 이메일, 앱 푸시(선택적으로 SMS/알림톡 포함 가능)",
          "수신 내용: 이벤트/프로모션, 할인, 신규 기능, 뉴스레터 등",
          "보관 기간: 동의 철회 또는 회원 탈퇴 시까지",
        ]} />
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30">
        <p className="text-xs text-blue-700 dark:text-blue-400">
          동의하지 않아도 서비스 이용에는 제한이 없으며, 언제든지 설정에서 철회할 수 있습니다.
        </p>
      </div>

      <div className="border-t border-border/40 pt-4">
        <p className="text-xs text-muted-foreground">시행일: 2026년 3월 2일</p>
      </div>
    </div>
  )
}

function AgeDialogContent() {
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        본인은 <strong className="text-foreground">만 14세 이상</strong>이며, 만 14세 미만인 경우 회원가입 및 서비스 이용이 제한될 수 있음에 동의합니다.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        허위 입력 시 책임은 이용자에게 있습니다.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        회사는 만 14세 미만으로 확인되는 경우 회원가입을 취소하거나 이용을 제한할 수 있습니다.
      </p>
    </div>
  )
}

function RefundDialogContent() {
  const sections: PolicySection[] = [
    { title: "제1조 (유료서비스의 이용 및 결제)", level: "h2", items: ["회사는 회원에게 월간 또는 연간 단위의 유료 구독 서비스를 제공한다.", "유료서비스는 선불 결제를 원칙으로 하며, 결제 완료 시 해당 이용기간 동안 서비스 이용 권한이 부여된다.", "월간 구독은 매월 동일 일자에 자동 갱신되며, 연간 구독은 매년 동일 일자에 자동 갱신된다.", "연간 구독은 월간 요금 대비 할인된 금액이 적용되는 약정 요금제로, 이용기간 전체에 대한 이용을 전제로 한다."] },
    { title: "제2조 (자동결제)", level: "h2", items: ["회원이 유료서비스에 가입하는 경우, 회원은 회사가 정한 결제수단을 통해 이용기간 종료 시점에 동일한 조건으로 자동결제가 이루어지는 것에 동의한 것으로 본다.", "자동결제는 해당 이용기간 종료일에 선결제 방식으로 이루어진다.", "회원은 다음 결제일 이전에 구독을 해지함으로써 자동결제를 중단할 수 있다.", "결제 실패 시 회사는 서비스 이용을 제한하거나 자동결제를 재시도할 수 있다."] },
    { title: "제3조 (추가 충전 크레딧)", level: "h2", items: ["추가 충전 크레딧은 선불 구매 상품이며, 결제 즉시 충전된다.", "기본 크레딧 소진 시 추가 충전 크레딧을 사용할 수 있다.", "추가 충전 크레딧은 구매 후 환불되지 않는다.", "추가 충전 크레딧의 사용기한은 구매일로부터 3년이며, 사용기한 경과 시 소멸한다."] },
  ]

  const upgradeGroups = [
    { sub: "① 월간 서비스 등급 업그레이드", items: ["월간 구독 중 상위 등급으로 변경하는 경우, 업그레이드는 즉시 적용된다.", "회사는 기존 요금과 변경 요금의 차액을 남은 이용기간에 대해 일할 계산하여 청구한다.", "업그레이드 시 해당 등급의 월 제공 크레딧은 비례 정산 또는 추가 제공될 수 있다.", "다음 결제일부터는 변경된 등급의 요금이 자동결제된다."] },
    { sub: "② 동일 등급 월간 → 연간 변경", items: ["동일 등급의 월간 구독을 연간 구독으로 변경하는 경우 즉시 적용된다.", "연간 요금에서 기존 월간 구독의 잔여 이용금액을 차감 후 차액을 결제한다.", "결제일은 변경일 기준으로 리셋되며, 새로운 연간 이용기간이 개시된다.", "연간 구독에 해당하는 크레딧은 즉시 제공된다."] },
    { sub: "③ 등급 및 월간 → 연간 동시 업그레이드", items: ["서비스 등급 상향과 동시에 연간 구독으로 변경하는 경우 즉시 적용된다.", "연간 상위 등급 요금에서 기존 월간 구독의 잔여 이용금액을 차감 후 차액을 결제한다.", "결제일은 변경일 기준으로 리셋되며, 새로운 연간 이용기간이 시작된다.", "변경된 등급의 연간 크레딧이 즉시 제공된다."] },
    { sub: "④ 연간 서비스 등급 업그레이드", items: ["연간 구독 중 상위 등급으로 변경하는 경우 즉시 적용된다.", "연간 등급 간 요금 차액을 기준으로, 잔여 이용기간에 대하여 일할 계산된 금액을 추가 청구한다.", "업그레이드 시 해당 상위 등급의 크레딧이 즉시 제공된다.", "다음 연간 갱신일부터는 변경된 등급 요금이 적용된다."] },
  ]

  const downgradeGroups = [
    { sub: "① 월간 등급 다운그레이드", items: ["월간 구독 중 하위 등급으로 변경하는 경우, 변경은 다음 결제일부터 적용된다.", "당월 이용요금의 환불은 이루어지지 아니한다.", "현재 이용기간 동안은 기존 등급이 유지된다."] },
    { sub: "② 연간 → 월간 변경 (동일 등급)", items: ["연간 구독을 월간 구독으로 변경하는 경우, 이는 연간 구독의 중도 해지로 본다.", "연간 해지에 따른 환불금은 제4조 제2항의 기준에 따라 산정된다.", "기존 연간 이용기간은 해당 월 종료일까지 유지될 수 있으며, 이후 월간 구독이 새로 개시된다.", "월간 구독은 별도의 신규 결제로 진행되며, 새로운 결제일이 적용된다."] },
    { sub: "③ 연간 → 월간 및 등급 하향 동시 변경", items: ["연간 구독을 해지함과 동시에 하위 등급의 월간 구독으로 변경하는 경우, 연간 해지 및 환불은 제4조 제2항에 따른다.", "환불금 산정 후, 회원은 새로운 월간 구독을 별도로 결제하여야 한다.", "변경된 월간 등급은 새로운 결제일부터 적용된다."] },
  ]

  return (
    <div className="space-y-1">
      {sections.map((s, i) => <Section key={i} section={s} />)}

      <h2 className="text-base font-semibold text-foreground mt-8">제4조 (구독의 해지)</h2>

      <h3 className="text-sm font-medium text-foreground mt-5">① 월간 구독 해지</h3>
      <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground list-decimal list-inside">
        <li className="pl-1">회원은 구독 취소 페이지를 통해 월간 구독을 해지할 수 있다.</li>
        <li className="pl-1">월간 구독 해지 시 이미 결제된 당월 이용요금에 대한 환불은 이루어지지 아니한다.</li>
        <li className="pl-1">해지 신청 시점부터 해당 월 이용기간 종료일까지는 기존 서비스가 유지되며, 이후 자동결제는 이루어지지 아니한다.</li>
        <li className="pl-1">해지는 &quot;다음 결제일부터 적용되는 예약 해지&quot; 방식으로 처리된다.</li>
      </ol>

      <h3 className="text-sm font-medium text-foreground mt-5">② 연간 구독 해지 및 환불</h3>
      <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground list-decimal list-inside">
        <li className="pl-1">회원은 구독 취소 페이지를 통해 연간 구독을 해지할 수 있다.</li>
        <li className="pl-1">연간 구독은 약정 할인 요금이 적용되므로, 중도 해지 시 실제 이용 개월 수에 대하여는 <strong className="text-foreground">월 정상요금(할인 미적용 요금)</strong>을 기준으로 이용금액을 산정하고, 총 결제금액에서 위 이용금액을 차감한 잔액을 환불한다.</li>
        <li className="pl-1">이용 개월 수는 결제일 기준으로 산정하며, 해당 월이 일부 경과된 경우라도 1개월 전체를 이용한 것으로 본다.</li>
        <li className="pl-1">해지 신청 시 해당 월의 이용은 유지되며, 환불금은 회사의 환불 절차에 따라 처리된다.</li>
      </ol>

      <Section section={{ title: "제5조 (서비스 변경 – 업그레이드)", level: "h2" }} />
      {upgradeGroups.map((g) => (
        <div key={g.sub}>
          <h3 className="text-sm font-medium text-foreground mt-5">{g.sub}</h3>
          <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground list-decimal list-inside">
            {g.items.map((item, i) => <li key={i} className="pl-1">{item}</li>)}
          </ol>
        </div>
      ))}

      <Section section={{ title: "제6조 (서비스 변경 – 다운그레이드)", level: "h2" }} />
      {downgradeGroups.map((g) => (
        <div key={g.sub}>
          <h3 className="text-sm font-medium text-foreground mt-5">{g.sub}</h3>
          <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground list-decimal list-inside">
            {g.items.map((item, i) => <li key={i} className="pl-1">{item}</li>)}
          </ol>
        </div>
      ))}

      <Section section={{ title: "제7조 (연간 약정 할인에 대한 명시)", level: "h2", items: ["연간 요금은 월 정상요금을 기준으로 한 할인 요금제이다.", "연간 약정 기간을 모두 이용하지 아니하고 중도 해지하는 경우, 할인은 적용되지 아니하며 정상 월요금 기준으로 재산정된다.", "회사는 위 재산정 금액을 차감한 후 잔액이 있는 경우에 한하여 환불한다.", "차감 금액이 결제 금액을 초과하는 경우 추가 청구는 하지 아니하나, 환불금 또한 발생하지 아니한다."] }} />

      <h2 className="text-base font-semibold text-foreground mt-8">제8조 (환불의 제한)</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">다음 각 호의 경우 환불이 제한될 수 있다.</p>
      <ol className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground list-decimal list-inside">
        <li className="pl-1">관계 법령에 따라 환불이 제한되는 경우</li>
        <li className="pl-1">회원의 귀책사유로 인한 서비스 이용 제한 또는 계약 해지의 경우</li>
        <li className="pl-1">무료 크레딧, 프로모션 혜택 등 무상 제공분에 대한 부분</li>
      </ol>
    </div>
  )
}

export function TermsAgreementDialog({ type, onOpenChange }: TermsAgreementDialogProps) {
  if (!type) return null

  const title = DIALOG_TITLES[type] ?? ""

  return (
    <Dialog open={!!type} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] max-h-[100vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(80vh-120px)] px-6 py-4">
          {type === "terms" && <TermsDialogContent />}
          {type === "privacy" && <PrivacyDialogContent />}
          {type === "marketing" && <MarketingDialogContent />}
          {type === "age" && <AgeDialogContent />}
          {type === "refund" && <RefundDialogContent />}
        </ScrollArea>
        <div className="border-t border-border/40 px-6 py-4">
          <Button className="w-full font-bold" onClick={() => onOpenChange(false)}>
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
