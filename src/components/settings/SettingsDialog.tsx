import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ChevronsUp,
  Coins,
  CreditCard,
  Gauge,
  HandHelping,
  HardDrive,
  Menu,
  MonitorSmartphone,
  ReceiptText,
  SquareAsterisk,
  User,
  X,
  ClipboardList,
  NotebookPen,
} from "lucide-react"
import { cn } from "@/lib/utils"

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMenu?: SettingsMenuId
}

export type SettingsMenuId =
  | "profile"
  | "password"
  | "credits"
  | "usage"
  | "devices"
  | "storage"
  | "subscription"
  | "invoices"
  | "billing"
  | "payments"
  | "transactions"

const PERSONAL_MENUS = [
  { id: "profile" as const, label: "사용자 정보", icon: User },
  { id: "password" as const, label: "비밀번호 변경", icon: SquareAsterisk },
  { id: "credits" as const, label: "크레딧 관리", icon: Coins },
  { id: "usage" as const, label: "사용내역", icon: Gauge },
  { id: "devices" as const, label: "접속기기", icon: MonitorSmartphone },
  { id: "storage" as const, label: "스토리지", icon: HardDrive },
]

const BILLING_MENUS = [
  { id: "subscription" as const, label: "구독 관리", icon: HandHelping },
  { id: "invoices" as const, label: "청구서", icon: ReceiptText },
  { id: "billing" as const, label: "청구 관리", icon: NotebookPen },
  { id: "payments" as const, label: "결제 수단", icon: CreditCard },
  { id: "transactions" as const, label: "결제 내역", icon: ClipboardList },
]

const SettingsDialogSidebarMenu = ({
  activeId,
  onChange,
}: {
  activeId: SettingsMenuId
  onChange: (id: SettingsMenuId) => void
}) => (
  <>
    <div className="p-2">
      <div className="flex h-8 items-center px-2 text-xs text-sidebar-foreground/70">개인 설정</div>
      <div className="flex flex-col gap-1">
        {PERSONAL_MENUS.map((item) => {
          const Icon = item.icon
          const isActive = activeId === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground transition-colors hover:bg-accent",
                isActive && "bg-accent"
              )}
              onClick={() => onChange(item.id)}
            >
              <Icon className="size-5 shrink-0" />
              <span className="text-sm">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>

    <div className="p-2">
      <div className="flex h-8 items-center px-2 text-xs text-sidebar-foreground/70">결제 관리</div>
      <div className="flex flex-col gap-1">
        {BILLING_MENUS.map((item) => {
          const Icon = item.icon
          const isActive = activeId === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground transition-colors hover:bg-accent",
                isActive && "bg-accent"
              )}
              onClick={() => onChange(item.id)}
            >
              <Icon className="size-5 shrink-0" />
              <span className="text-sm">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>

    <div className="mt-auto p-2">
      <button
        type="button"
        className="flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-border text-xs font-medium text-teal-500"
      >
        <ChevronsUp className="size-4" />
        <span>업그레이드</span>
      </button>
    </div>
  </>
)

export function SettingsDialog({ open, onOpenChange, initialMenu }: SettingsDialogProps) {
  const [activeMenu, setActiveMenu] = useState<SettingsMenuId>("profile")

  const activeLabel = useMemo(() => {
    const menu =
      PERSONAL_MENUS.find((item) => item.id === activeMenu) ??
      BILLING_MENUS.find((item) => item.id === activeMenu)
    return menu?.label ?? "사용자 정보"
  }, [activeMenu])

  useEffect(() => {
    if (!open) return
    if (initialMenu) {
      setActiveMenu(initialMenu)
      return
    }
    setActiveMenu("profile")
  }, [open, initialMenu])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border p-0 shadow-lg sm:max-w-[1000px]"
      >
        <div className="flex h-[700px] max-h-[calc(100vh-2rem)] w-full bg-background">
          <div className="hidden w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            <SettingsDialogSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger
                    className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
                    aria-label="메뉴"
                  >
                    <Menu className="size-4" />
                  </PopoverTrigger>
                  <PopoverContent align="start" side="bottom" sideOffset={8} className="w-56 p-0">
                    <div className="flex flex-col rounded-lg border border-sidebar-border bg-sidebar">
                      <SettingsDialogSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
                    </div>
                  </PopoverContent>
                </Popover>
                <h2 className="text-base font-bold text-foreground">{activeLabel}</h2>
              </div>
              <DialogClose
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </DialogClose>
            </div>

            <div className="mt-6 flex-1 overflow-y-auto pr-2">
              {activeMenu === "profile" ? (
                <div className="grid gap-6">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">기본 정보</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>이름</span>
                        <span className="text-foreground">홍길동</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>이메일</span>
                        <span className="text-foreground">hong@example.com</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>계정 상태</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">
                          활성
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">프로필 설정</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="rounded-md border border-border px-3 py-2">표시 이름 변경 (예: Team Reduct)</div>
                      <div className="rounded-md border border-border px-3 py-2">연락처 번호 (예: 010-0000-0000)</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMenu === "password" ? (
                <div className="grid gap-6">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">비밀번호 변경</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="rounded-md border border-border px-3 py-2">현재 비밀번호</div>
                      <div className="rounded-md border border-border px-3 py-2">새 비밀번호</div>
                      <div className="rounded-md border border-border px-3 py-2">새 비밀번호 확인</div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      8자 이상, 영문/숫자/특수문자를 포함해 주세요.
                    </div>
                    <button className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
                      비밀번호 변경
                    </button>
                  </div>
                </div>
              ) : null}

              {activeMenu === "credits" ? (
                <div className="grid gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {[
                      { label: "보유 크레딧", value: "12,500" },
                      { label: "이번 달 사용", value: "7,340" },
                      { label: "다음 충전일", value: "2026-03-01" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-border p-4">
                        <div className="text-xs text-muted-foreground">{item.label}</div>
                        <div className="mt-2 text-lg font-semibold text-foreground">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">충전 옵션</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="rounded-md border border-border px-3 py-2">+10,000 크레딧 / $20</div>
                      <div className="rounded-md border border-border px-3 py-2">+50,000 크레딧 / $80</div>
                      <div className="rounded-md border border-border px-3 py-2">맞춤형 충전 상담</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMenu === "usage" ? (
                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold text-foreground">최근 사용내역</div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    {[
                      ["2026-02-10", "GPT-5.2", "입력 12K / 출력 4K", "$3.20"],
                      ["2026-02-09", "Gemini 3 Pro", "입력 6K / 출력 2K", "$1.15"],
                      ["2026-02-08", "Sora 2", "영상 20초", "$2.80"],
                    ].map((row) => (
                      <div key={row[0]} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span>{row[0]}</span>
                        <span>{row[1]}</span>
                        <span>{row[2]}</span>
                        <span className="text-foreground">{row[3]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeMenu === "devices" ? (
                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold text-foreground">접속 기기</div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    {[
                      ["MacBook Pro · Chrome", "서울, KR", "현재 사용 중"],
                      ["iPhone 16 · Safari", "부산, KR", "2일 전"],
                      ["Windows · Edge", "도쿄, JP", "7일 전"],
                    ].map((row) => (
                      <div key={row[0]} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <div>
                          <div className="text-foreground">{row[0]}</div>
                          <div className="text-xs text-muted-foreground">{row[1]}</div>
                        </div>
                        <span className="text-xs text-muted-foreground">{row[2]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeMenu === "storage" ? (
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">스토리지 사용량</div>
                    <div className="mt-3 h-2 w-full rounded-full bg-muted">
                      <div className="h-full w-[45%] rounded-full bg-teal-500" />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">45% 사용 (23GB / 50GB)</div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">정리 추천</div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      90일 이상 미사용 파일 128개가 있습니다. 정리하면 약 6GB를 확보할 수 있어요.
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMenu === "subscription" ? (
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">현재 구독</div>
                    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                      <span>Premium · 연간</span>
                      <span className="text-foreground">$600 / 년</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">다음 결제일: 2026-03-01</div>
                  </div>
                  <button className="w-fit rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
                    요금제 변경
                  </button>
                </div>
              ) : null}

              {activeMenu === "invoices" ? (
                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold text-foreground">최근 청구서</div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    {[
                      ["INV-2026-0201", "2026-02-01", "$50.00", "결제 완료"],
                      ["INV-2026-0101", "2026-01-01", "$50.00", "결제 완료"],
                      ["INV-2025-1201", "2025-12-01", "$50.00", "결제 완료"],
                    ].map((row) => (
                      <div key={row[0]} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="text-foreground">{row[0]}</span>
                        <span>{row[1]}</span>
                        <span>{row[2]}</span>
                        <span className="text-xs text-emerald-600">{row[3]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {activeMenu === "billing" ? (
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">청구 정보</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="rounded-md border border-border px-3 py-2">회사명: Reduct AI</div>
                      <div className="rounded-md border border-border px-3 py-2">결제 이메일: billing@reduct.ai</div>
                      <div className="rounded-md border border-border px-3 py-2">세금 번호: KR-123-45-67890</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">청구 주소</div>
                    <div className="mt-3 text-sm text-muted-foreground">서울시 강남구 테헤란로 123, 7층</div>
                  </div>
                </div>
              ) : null}

              {activeMenu === "payments" ? (
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">결제 수단</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="text-foreground">Visa · 1234</span>
                        <span className="text-xs text-emerald-600">기본</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="text-foreground">Mastercard · 5678</span>
                        <span className="text-xs text-muted-foreground">보조</span>
                      </div>
                    </div>
                  </div>
                  <button className="w-fit rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
                    결제 수단 추가
                  </button>
                </div>
              ) : null}

              {activeMenu === "transactions" ? (
                <div className="rounded-lg border border-border p-4">
                  <div className="text-sm font-semibold text-foreground">결제 내역</div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    {[
                      ["2026-02-01", "Premium 연간", "Visa · 1234", "$600.00", "결제 완료"],
                      ["2025-02-01", "Premium 연간", "Visa · 1234", "$600.00", "결제 완료"],
                      ["2024-02-01", "Premium 연간", "Mastercard · 5678", "$600.00", "결제 완료"],
                    ].map((row) => (
                      <div
                        key={`${row[0]}-${row[1]}`}
                        className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-col">
                          <span className="text-foreground">{row[1]}</span>
                          <span className="text-xs text-muted-foreground">{row[0]}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{row[2]}</span>
                        <span className="text-foreground">{row[3]}</span>
                        <button
                          type="button"
                          className="w-fit rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                        >
                          영수증
                        </button>
                        <span className="text-xs text-emerald-600">{row[4]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
