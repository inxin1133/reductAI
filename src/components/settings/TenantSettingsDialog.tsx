import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Box, Coins, Gauge, Menu, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"

type TenantSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type MenuId = "info" | "members" | "credits" | "usage"

const MENU_ITEMS: Array<{ id: MenuId; label: string; icon: typeof Box }> = [
  { id: "info", label: "테넌트 정보", icon: Box },
  { id: "members", label: "멤버", icon: Users },
  { id: "credits", label: "크레딧 운영", icon: Coins },
  { id: "usage", label: "사용내역", icon: Gauge },
]

const TENANT_MENU_STORAGE_KEY = "reductai:tenantSettings:activeMenu"
const TENANT_MENU_IDS = new Set<MenuId>(MENU_ITEMS.map((item) => item.id))

function readTenantMenuFromStorage(): MenuId | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(TENANT_MENU_STORAGE_KEY)
    if (!raw) return null
    return TENANT_MENU_IDS.has(raw as MenuId) ? (raw as MenuId) : null
  } catch {
    return null
  }
}

function writeTenantMenuToStorage(value: MenuId) {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(TENANT_MENU_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

const TenantSettingsSidebarMenu = ({
  activeId,
  onChange,
}: {
  activeId: MenuId
  onChange: (id: MenuId) => void
}) => (
  <div className="flex flex-col p-2">
    <div className="flex h-8 items-center px-2 text-xs text-sidebar-foreground/70">테넌트 관리</div>
    <div className="flex flex-col gap-1">
      {MENU_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground transition-colors hover:bg-accent",
              activeId === item.id && "bg-accent"
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
)

export function TenantSettingsDialog({ open, onOpenChange }: TenantSettingsDialogProps) {
  const [activeMenu, setActiveMenu] = useState<MenuId>(() => readTenantMenuFromStorage() ?? "info")
  const wasOpenRef = useRef(false)

  const activeLabel = useMemo(
    () => MENU_ITEMS.find((item) => item.id === activeMenu)?.label ?? "테넌트 정보",
    [activeMenu]
  )

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    const stored = readTenantMenuFromStorage()
    if (stored) setActiveMenu(stored)
  }, [open])

  useEffect(() => {
    writeTenantMenuToStorage(activeMenu)
  }, [activeMenu])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-48px)] overflow-hidden rounded-xl border border-border p-0 shadow-lg sm:max-w-[min(1000px,calc(100%-48px))]"
      >
        <div className="flex h-[700px] max-h-[calc(100vh-2rem)] w-full bg-background">
          <div className="hidden w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            <TenantSettingsSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
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
                      <TenantSettingsSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
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
              {activeMenu === "info" ? (
                <div className="grid gap-6">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">테넌트 개요</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>테넌트 이름</span>
                        <span className="text-foreground">Reduct Team</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>유형</span>
                        <span className="text-foreground">Team</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>플랜</span>
                        <span className="text-foreground">Premium</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">기본 설정</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="rounded-md border border-border px-3 py-2">슬러그: reduct-team</div>
                      <div className="rounded-md border border-border px-3 py-2">대표 도메인: team.reduct.ai</div>
                      <div className="rounded-md border border-border px-3 py-2">소유자: hong@example.com</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMenu === "members" ? (
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">멤버 현황</div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        { label: "총 멤버", value: "12" },
                        { label: "관리자", value: "2" },
                        { label: "초대 대기", value: "3" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-md border border-border px-3 py-2">
                          <div className="text-xs text-muted-foreground">{item.label}</div>
                          <div className="mt-2 text-lg font-semibold text-foreground">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">최근 멤버</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      {[
                        ["홍길동", "Owner", "2025-11-21"],
                        ["김하늘", "Admin", "2026-01-05"],
                        ["박지민", "Member", "2026-02-01"],
                      ].map((row) => (
                        <div key={row[0]} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span className="text-foreground">{row[0]}</span>
                          <span>{row[1]}</span>
                          <span className="text-xs text-muted-foreground">{row[2]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMenu === "credits" ? (
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">크레딧 운영 요약</div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        { label: "월간 크레딧", value: "50,000" },
                        { label: "이번 달 사용", value: "28,140" },
                        { label: "남은 크레딧", value: "21,860" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-md border border-border px-3 py-2">
                          <div className="text-xs text-muted-foreground">{item.label}</div>
                          <div className="mt-2 text-lg font-semibold text-foreground">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">운영 정책</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="rounded-md border border-border px-3 py-2">멤버별 월간 한도: 5,000</div>
                      <div className="rounded-md border border-border px-3 py-2">관리자 초과 승인: 필요</div>
                      <div className="rounded-md border border-border px-3 py-2">알림 기준: 잔여 20%</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMenu === "usage" ? (
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">최근 사용 내역</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      {[
                        ["2026-02-10", "GPT-5.2", "15,400 tokens", "홍길동"],
                        ["2026-02-10", "Gemini 3 Pro", "8,120 tokens", "김하늘"],
                        ["2026-02-09", "Sora 2", "영상 20초", "박지민"],
                      ].map((row) => (
                        <div key={`${row[0]}-${row[1]}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span>{row[0]}</span>
                          <span>{row[1]}</span>
                          <span>{row[2]}</span>
                          <span className="text-foreground">{row[3]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-semibold text-foreground">상위 사용 모델</div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span>GPT-5.2</span>
                        <span className="text-foreground">42%</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span>Gemini 3 Pro</span>
                        <span className="text-foreground">33%</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span>Sora 2</span>
                        <span className="text-foreground">25%</span>
                      </div>
                    </div>
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
