import { useEffect, useMemo, useRef, useState, } from "react"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Box, CirclePause, Coins, Database, Gauge, HardDrive, Menu, PackageOpen, ShieldCheck, UserPlus, UserRoundCheck, Users, UsersRound, X, ChevronsUp, Settings2, HandCoins, } from "lucide-react"
import { cn } from "@/lib/utils"

type TenantSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type MenuId = "info" | "members" | "invitations" | "credits" | "topupCredits" | "usage"

const MENU_ITEMS: Array<{ id: MenuId; label: string; icon: typeof Box }> = [
  { id: "info", label: "테넌트 정보", icon: Box },
  { id: "members", label: "멤버 관리", icon: Users },
  { id: "invitations", label: "멤버 초대 관리", icon: UserPlus },
  { id: "credits", label: "서비스 크레딧 운영", icon: Coins },
  { id: "topupCredits", label: "충전 크레딧 운영", icon: HandCoins },
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
  const [usagePage, setUsagePage] = useState(1)
  const wasOpenRef = useRef(false)

  const activeLabel = useMemo(
    () => MENU_ITEMS.find((item) => item.id === activeMenu)?.label ?? "테넌트 정보",
    [activeMenu]
  )
  const usageRows = useMemo(
    () => [
      { date: "2026-02-10", model: "GPT-5.2", user: "홍길동", usage: "15,400 tokens", credits: "2,120" },
      { date: "2026-02-10", model: "Gemini 3 Pro", user: "김하늘", usage: "8,120 tokens", credits: "1,040" },
      { date: "2026-02-09", model: "Sora 2", user: "박지민", usage: "영상 20초", credits: "980" },
      { date: "2026-02-08", model: "GPT-5.2", user: "이수진", usage: "12,350 tokens", credits: "1,840" },
      { date: "2026-02-07", model: "Gemini 3 Pro", user: "최민호", usage: "입력 5K / 출력 2K", credits: "920" },
      { date: "2026-02-07", model: "GPT-5.2", user: "김하늘", usage: "입력 9K / 출력 3K", credits: "1,420" },
      { date: "2026-02-06", model: "Sora 2", user: "홍길동", usage: "영상 12초", credits: "650" },
      { date: "2026-02-06", model: "Gemini 3 Pro", user: "박지민", usage: "입력 7K / 출력 2K", credits: "980" },
      { date: "2026-02-05", model: "GPT-5.2", user: "이수진", usage: "입력 10K / 출력 4K", credits: "1,760" },
      { date: "2026-02-05", model: "Sora 2", user: "최민호", usage: "영상 18초", credits: "780" },
    ],
    []
  )
  const usagePageSize = 10
  const usageTotalPages = Math.max(1, Math.ceil(usageRows.length / usagePageSize))
  const usagePageSafe = Math.min(usagePage, usageTotalPages)
  const usagePageRows = useMemo(() => {
    const start = (usagePageSafe - 1) * usagePageSize
    return usageRows.slice(start, start + usagePageSize)
  }, [usagePageSafe, usagePageSize, usageRows])

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
  useEffect(() => {
    if (usagePage > usageTotalPages) setUsagePage(usageTotalPages)
  }, [usagePage, usageTotalPages])

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
                // 테넌트 정보
                <div className="grid gap-4">
                  {/* 테넌트 개요 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">테넌트 개요</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">테넌트 이름</div>
                        <div className="flex items-center gap-2 text-foreground">리덕트</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">테넌트 유형</div>
                        <div className="flex items-center gap-2 text-foreground">Team</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">서비스 플랜</div>
                        <div className="flex items-center gap-2 text-foreground">
                          <span className="rounded-full px-3 py-1 text-xs font-semibold bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500">Premium</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 테넌트 서비스 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">테넌트 서비스</div>
                    <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">월 서비스 크레딧</div>
                        <div className="flex items-center gap-2 text-foreground">50,000 크레딧</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">스토리지 용량</div>
                        <div className="flex items-center gap-2 text-foreground">50GB</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">좌석 수</div>
                        <div className="flex items-center gap-2 text-foreground">4/5명</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end px-4">
                    <Button variant="outline" size="sm" className="text-blue-500 hover:text-blue-600">
                      <ChevronsUp className="size-4" />업그레이드
                    </Button>
                  </div>

                </div>
              ) : null}

              {activeMenu === "members" ? (
                // 멤버 관리
                <div className="grid gap-4">
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">멤버 현황</div>
                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                      {[
                        { label: "총 좌석", value: "5", sub: "명", icon: UsersRound, accent: "text-foreground", bg: "bg-muted/60", ring: "" },
                        { label: "활성", value: "3", sub: "명", icon: UserRoundCheck, accent: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/40", ring: "ring-1 ring-teal-200 dark:ring-teal-800" },
                        { label: "대기", value: "1", sub: "명", icon: ShieldCheck, accent: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40", ring: "ring-1 ring-amber-200 dark:ring-amber-800" },
                        { label: "정지", value: "1", sub: "명", icon: CirclePause, accent: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/40", ring: "ring-1 ring-rose-200 dark:ring-rose-800" },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className={cn("relative rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <Icon className={cn("size-4 shrink-0", item.accent)} />
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                              <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.value}</span>
                              <span className="text-xs text-muted-foreground">{item.sub}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">멤버 목록</div>

                    <div className="mt-3 overflow-x-auto rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead className="">이름</TableHead>
                            <TableHead className="hidden sm:table-cell">이메일</TableHead>
                            <TableHead className="text-center">역할</TableHead>
                            <TableHead className="w-[60px] text-center">스토리지</TableHead>
                            <TableHead className="w-[60px] text-center">상태</TableHead>
                            <TableHead className="hidden text-center sm:table-cell">가입일</TableHead>
                            <TableHead className="w-[40px] text-center">관리</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {[
                            { name: "홍길동", email: "lee@example.com", role: "소유자", storage: "10GB", status: "활성", date: "2026-02-15", statusColor: "text-teal-600 bg-teal-50 ring-teal-500" },
                            { name: "김하늘", email: "choi@example.com", role: "관리자", storage: "10GB", status: "활성", date: "2026-02-14", statusColor: "text-teal-600 bg-teal-50 ring-teal-500" },
                            { name: "박지민", email: "jung@example.com", role: "멤버", storage: "10GB", status: "대기", date: "2026-02-12", statusColor: "text-amber-600 bg-amber-50 ring-amber-500" },
                            { name: "이수진", email: "kang@example.com", role: "멤버", storage: "10GB", status: "정지", date: "2026-02-10", statusColor: "text-rose-600 bg-rose-50 ring-rose-500" },
                            { name: "최민호", email: "yoon@example.com", role: "맴버", storage: "10GB", status: "활성", date: "2026-01-20", statusColor: "text-teal-600 bg-teal-50 ring-teal-500" },
                          ].map((row) => (
                            <TableRow key={row.email} className="hover:bg-accent/40">
                              <TableCell className="text-foreground">
                                <div className="flex items-center gap-1">
                                  <div className="flex items-center justify-center gap-2 w-6 h-6 bg-teal-500 rounded-sm">
                                    <span className="text-white font-semibold text-sm">이</span>
                                  </div>
                                  <div className="text-xs truncate">{row.name}</div>
                                </div>
                              </TableCell>
                              <TableCell className="text-foreground hidden sm:table-cell">
                                <span className="text-xs block w-[120px] truncate">{row.email}</span>
                              </TableCell>
                              <TableCell className="text-center">{row.role}</TableCell>
                              <TableCell className="text-center">{row.storage}</TableCell>
                              <TableCell className="text-center">
                                <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1", row.statusColor)}>
                                  {row.status}
                                </span>
                              </TableCell>
                              <TableCell className="hidden text-xs text-center sm:table-cell">{row.date}</TableCell>
                              <TableCell className="text-center">
                                {row.role !== "소유자" ? (
                                  <Button variant="outline" size="sm" className="text-blue-500 hover:text-blue-600">
                                    <Settings2 className="size-4" />
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>


                  </div>
                </div>
              ) : null}

              {activeMenu === "invitations" ? (
                // 멤버 초대 관리
                <div className="grid gap-4">
                  {/* 초대 현황 요약 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">초대 현황</div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {[
                        { label: "대기 중", value: "3", sub: "건", icon: UserPlus, accent: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40", ring: "ring-1 ring-amber-200 dark:ring-amber-800" },
                        { label: "수락 완료", value: "9", sub: "건", icon: UserRoundCheck, accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "ring-1 ring-emerald-200 dark:ring-emerald-800" },
                        { label: "만료/거절/취소", value: "2", sub: "건", icon: CirclePause, accent: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/40", ring: "ring-1 ring-rose-200 dark:ring-rose-800" },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className={cn("relative rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <Icon className={cn("size-4 shrink-0", item.accent)} />
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                              <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.value}</span>
                              <span className="text-xs text-muted-foreground">{item.sub}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 초대 내역 테이블 */}
                  <div className="px-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">초대 내역</div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <UserPlus className="size-3.5" />
                        새 초대
                      </button>
                    </div>

                    <div className="mt-3 overflow-y-auto rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead className="text-left">이메일</TableHead>
                            <TableHead className="text-center">역할</TableHead>
                            <TableHead className="w-[60px] px-3 py-2 text-center">상태</TableHead>
                            <TableHead className="text-center">초대일</TableHead>
                            <TableHead className="w-[40px] px-3 py-2 text-center">관리</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {[
                            { email: "lee@example.com", role: "멤버", status: "대기 중", date: "2026-02-15", statusColor: "text-amber-600 bg-amber-50 ring-amber-500" },
                            { email: "choi@example.com", role: "관리자", status: "대기 중", date: "2026-02-14", statusColor: "text-amber-600 bg-amber-50 ring-amber-500" },
                            { email: "jung@example.com", role: "멤버", status: "대기 중", date: "2026-02-12", statusColor: "text-amber-600 bg-amber-50 ring-amber-500" },
                            { email: "kang@example.com", role: "멤버", status: "수락", date: "2026-02-10", statusColor: "text-emerald-600 bg-emerald-50 ring-emerald-500" },
                            { email: "yoon@example.com", role: "멤버", status: "만료", date: "2026-01-20", statusColor: "text-rose-600 bg-rose-50 ring-rose-500" },
                          ].map((row) => (
                            <TableRow key={row.email} className="hover:bg-accent/40">
                              <TableCell className="text-foreground">
                                <span className="text-xs block w-[120px] truncate">{row.email}</span>
                              </TableCell>
                              <TableCell className="text-center">{row.role}</TableCell>
                              <TableCell className="text-center">
                                <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1", row.statusColor)}>
                                  {row.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-center text-xs">{row.date}</TableCell>
                              <TableCell className="text-center">
                                {row.status === "대기 중" ? (
                                  <button type="button" className="text-xs text-destructive hover:underline">취소</button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeMenu === "credits" ? (
                //  서비스 크레딧 운영
                <div className="grid gap-4">
                  {/* 스토리지 사용 현황 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">서비스 크레딧 사용 현황</div>
                    <div className="mt-4">
                      {/* 전체 사용량 바 */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">전체 사용량</span>
                        <span className="font-semibold text-foreground">32,320 / 50,000 크레딧</span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: "64.8%" }} />
                      </div>
                      <div className="mt-1 text-right text-xs text-muted-foreground">64.8% 사용 중</div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: "전체 용량", value: 50000, unit: "크레딧", icon: Database, accent: "text-foreground", bg: "bg-muted/60", ring: "" },
                        { label: "사용 중", value: 32320, unit: "크레딧", icon: HardDrive, accent: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40", ring: "ring-1 ring-sky-200 dark:ring-sky-800" },
                        { label: "남은 용량", value: 17680, unit: "크레딧", icon: PackageOpen, accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "ring-1 ring-emerald-200 dark:ring-emerald-800" },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className={cn("relative rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <Icon className={cn("size-4 shrink-0", item.accent)} />
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                              <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.value.toLocaleString()}</span>
                              <span className="text-xs text-muted-foreground">{item.unit}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 멤버별 사용량 */}
                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">멤버 크레딧 사용량/제공 현황</div>
                    <div className="mt-3 overflow-hidden rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead className="">멤버</TableHead>
                            <TableHead className="w-full hidden sm:table-cell">사용량</TableHead>
                            <TableHead className="text-right">크레딧</TableHead>
                            <TableHead className="w-[40px] text-center">관리</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {[
                            { name: "홍길동", used: 10000, limit: 10000, percent: 100 },
                            { name: "김하늘", used: 8700, limit: 10000, percent: 87 },
                            { name: "박지민", used: 6200, limit: 10000, percent: 62 },
                            { name: "이수진", used: 3800, limit: 10000, percent: 38 },
                            { name: "최민호", used: 1400, limit: 10000, percent: 14 },
                          ].map((row) => (
                            <TableRow key={row.name} className="hover:bg-accent/40">
                              <TableCell className="text-foreground">
                                <div className="flex items-center gap-1">
                                  <div className="flex items-center justify-center gap-2 w-6 h-6 bg-teal-500 rounded-sm">
                                    <span className="text-white font-semibold text-sm">이</span>
                                  </div>
                                  <div className="text-xs block max-w-[120px] truncate">{row.name}</div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        row.percent >= 100 ? "bg-destructive" : row.percent >= 80 ? "bg-amber-500" : "bg-primary"
                                      )}
                                      style={{ width: `${Math.min(row.percent, 100)}%` }}
                                    />
                                  </div>
                                  <span className="w-[36px] text-right text-xs">{row.percent}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {row.used.toLocaleString()} / {row.limit.toLocaleString()} 크레딧
                              </TableCell>
                              <TableCell className="text-center">
                                <Button variant="outline" size="sm" className="text-blue-500 hover:text-blue-600">
                                  <Settings2 className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                </div>


                // <div className="grid gap-4">
                //   <div className="rounded-lg border border-border p-4">
                //     <div className="text-sm font-semibold text-foreground">크레딧 운영 요약</div>
                //     <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                //       {[
                //         { label: "월간 크레딧", value: "50,000" },
                //         { label: "이번 달 사용", value: "28,140" },
                //         { label: "남은 크레딧", value: "21,860" },
                //       ].map((item) => (
                //         <div key={item.label} className="rounded-md border border-border px-3 py-2">
                //           <div className="text-xs text-muted-foreground">{item.label}</div>
                //           <div className="mt-2 text-lg font-semibold text-foreground">{item.value}</div>
                //         </div>
                //       ))}
                //     </div>
                //   </div>

                //   <div className="rounded-lg border border-border p-4">
                //     <div className="text-sm font-semibold text-foreground">운영 정책</div>
                //     <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                //       <div className="rounded-md border border-border px-3 py-2">멤버별 월간 한도: 5,000</div>
                //       <div className="rounded-md border border-border px-3 py-2">관리자 초과 승인: 필요</div>
                //       <div className="rounded-md border border-border px-3 py-2">알림 기준: 잔여 20%</div>
                //     </div>
                //   </div>
                // </div>

              ) : null}


              {activeMenu === "topupCredits" ? (
                // 충전 크레딧 운영
                <div className="grid gap-4">

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">충전 크레딧 보유량</div>
                  </div>

                  <div className="px-4 ">
                    <div className="text-sm font-semibold text-foreground">충전 크레딧 허용 관리</div>

                    <div className="mt-3 overflow-x-auto rounded-md border border-border">
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                          <TableRow className="border-b-0">
                            <TableHead className="">이름</TableHead>                            
                            <TableHead className="text-center">역할</TableHead>
                            <TableHead className="w-[60px] text-center">상태</TableHead>
                            <TableHead className="hidden text-center sm:table-cell">가입일</TableHead>
                            <TableHead className="w-[40px] text-center">관리</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-muted-foreground">
                          {[
                            { name: "홍길동", email: "lee@example.com", role: "소유자", status: "활성", date: "2026-02-15", statusColor: "text-teal-600 bg-teal-50 ring-teal-500" },
                            { name: "김하늘", email: "choi@example.com", role: "관리자", status: "활성", date: "2026-02-14", statusColor: "text-teal-600 bg-teal-50 ring-teal-500" },
                            { name: "박지민", email: "jung@example.com", role: "멤버", status: "대기", date: "2026-02-12", statusColor: "text-amber-600 bg-amber-50 ring-amber-500" },
                            { name: "이수진", email: "kang@example.com", role: "멤버", status: "정지", date: "2026-02-10", statusColor: "text-rose-600 bg-rose-50 ring-rose-500" },
                            { name: "최민호", email: "yoon@example.com", role: "맴버", status: "활성", date: "2026-01-20", statusColor: "text-teal-600 bg-teal-50 ring-teal-500" },
                          ].map((row) => (
                            <TableRow key={row.email} className="hover:bg-accent/40">
                              <TableCell className="text-foreground">
                                <div className="flex items-center gap-1">
                                  <div className="flex items-center justify-center gap-2 w-6 h-6 bg-teal-500 rounded-sm">
                                    <span className="text-white font-semibold text-sm">이</span>
                                  </div>
                                  <div className="text-xs truncate">{row.name}</div>
                                </div>
                              </TableCell>                              
                              <TableCell className="text-center">{row.role}</TableCell>
                              <TableCell className="text-center">
                                <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1", row.statusColor)}>
                                  {row.status}
                                </span>
                              </TableCell>
                              <TableCell className="hidden text-xs text-center sm:table-cell">{row.date}</TableCell>
                              <TableCell className="text-center">
                                {row.role !== "소유자" ? (
                                  <button type="button" className="text-xs text-muted-foreground border border-border rounded-md px-2 py-1">관리</button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>


                </div>
              ) : null}



              {activeMenu === "usage" ? (
                // 사용내역
                <div className="flex h-full flex-col min-h-0 gap-4">
                  {/* <div className="rounded-lg border border-border p-4">
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
                  </div> */}

                  <div className="px-4 pb-4">
                    <div className="text-sm font-semibold text-foreground">상위 사용 모델</div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      {[
                        { name: "GPT-5.2", percent: "42%", accent: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/40", ring: "ring-1 ring-violet-200 dark:ring-violet-800", dot: "bg-violet-500" },
                        { name: "Gemini 3 Pro", percent: "33%", accent: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40", ring: "ring-1 ring-sky-200 dark:ring-sky-800", dot: "bg-sky-500" },
                        { name: "Sora 2", percent: "25%", accent: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40", ring: "ring-1 ring-amber-200 dark:ring-amber-800", dot: "bg-amber-500" },
                      ].map((item) => (
                        <div key={item.name} className={cn("rounded-xl px-4 py-3 transition-shadow hover:shadow-sm", item.bg, item.ring)}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("size-2 shrink-0 rounded-full", item.dot)} />
                            <span className="text-xs font-medium text-muted-foreground truncate">{item.name}</span>
                          </div>
                          <div className="mt-2">
                            <span className={cn("text-2xl font-bold tracking-tight", item.accent)}>{item.percent}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 사용자별 사용내역 테이블 */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="px-4">
                      <div className="text-sm font-semibold text-foreground">사용자별 사용 내역</div>
                      <div className="mt-3 overflow-x-auto rounded-md border border-border">
                        <Table>
                          <TableHeader className="bg-muted/50 text-xs font-medium text-muted-foreground">
                            <TableRow className="border-b-0">
                              <TableHead className="text-xs">날짜</TableHead>
                              <TableHead className="text-xs">사용자</TableHead>
                              <TableHead className="text-xs">모델</TableHead>
                              <TableHead className="text-xs">사용량</TableHead>
                              <TableHead className="text-right text-xs">크레딧</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {usagePageRows.map((row) => (
                              <TableRow key={`${row.date}-${row.model}-${row.user}`}>
                                <TableCell className="text-muted-foreground text-xs">{row.date}</TableCell>
                                <TableCell className="text-foreground text-xs">{row.user}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{row.model}</TableCell>
                                <TableCell className="text-muted-foreground text-xs whitespace-normal break-words break-all">{row.usage}</TableCell>
                                <TableCell className="text-right text-foreground text-xs">{row.credits}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                  <div className="sticky bottom-0 mt-3 border-t border-border bg-background pt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        총 {usageRows.length}개 · {usagePageSafe}/{usageTotalPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setUsagePage((prev) => Math.max(1, prev - 1))}
                          disabled={usagePageSafe <= 1}
                        >
                          이전
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setUsagePage((prev) => Math.min(usageTotalPages, prev + 1))}
                          disabled={usagePageSafe >= usageTotalPages}
                        >
                          다음
                        </Button>
                      </div>
                    </div>
                  </div>


                </div>
              ) : null}







            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog >
  )
}
