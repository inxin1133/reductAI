import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ClipboardList,
  CreditCard,
  Ellipsis,
  HandHelping,
  Menu,
  NotebookPen,
  Plus,
  ReceiptText,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cardLabel, getCardBrandIcon, normalizeCardBrand } from "@/lib/card"
import { cn } from "@/lib/utils"

type BillingMenuId = "subscription" | "invoices" | "billing" | "payments" | "transactions"

type BillingSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMenu?: BillingMenuId
}

const BILLING_MENUS: Array<{ id: BillingMenuId; label: string; icon: typeof CreditCard }> = [
  { id: "subscription", label: "구독 관리", icon: HandHelping },
  { id: "invoices", label: "청구서", icon: ReceiptText },
  { id: "billing", label: "청구 관리", icon: NotebookPen },
  { id: "payments", label: "결제 수단", icon: CreditCard },
  { id: "transactions", label: "결제 내역", icon: ClipboardList },
]

const BILLING_MENU_STORAGE_KEY = "reductai:billing:activeMenu"
const DAUM_POSTCODE_SCRIPT_ID = "daum-postcode-script"

type BillingFormState = {
  name: string
  email: string
  postalCode: string
  address1: string
  address2: string
  extraAddress: string
  phone: string
}

const INITIAL_BILLING_FORM: BillingFormState = {
  name: "홍길동",
  email: "hong@example.com",
  postalCode: "",
  address1: "",
  address2: "",
  extraAddress: "",
  phone: "",
}

function readBillingMenuFromStorage(): BillingMenuId | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(BILLING_MENU_STORAGE_KEY)
    if (!raw) return null
    return BILLING_MENUS.some((item) => item.id === raw) ? (raw as BillingMenuId) : null
  } catch {
    return null
  }
}

function writeBillingMenuToStorage(value: BillingMenuId) {
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(BILLING_MENU_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

const BillingSidebarMenu = ({
  activeId,
  onChange,
}: {
  activeId: BillingMenuId
  onChange: (id: BillingMenuId) => void
}) => (
  <div className="flex flex-col p-2">
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
)

export function BillingSettingsDialog({ open, onOpenChange, initialMenu }: BillingSettingsDialogProps) {
  const [activeMenu, setActiveMenu] = useState<BillingMenuId>(() => readBillingMenuFromStorage() ?? "subscription")
  const [billingEditOpen, setBillingEditOpen] = useState(false)
  const [billingForm, setBillingForm] = useState<BillingFormState>(INITIAL_BILLING_FORM)
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const detailAddressRef = useRef<HTMLInputElement | null>(null)
  const wasOpenRef = useRef(false)
  const VisaIcon = getCardBrandIcon("visa")
  const MasterIcon = getCardBrandIcon("master")
  const AmexIcon = getCardBrandIcon("amex")

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    if (initialMenu) {
      setActiveMenu(initialMenu)
      return
    }
    const stored = readBillingMenuFromStorage()
    if (stored) setActiveMenu(stored)
  }, [open, initialMenu])

  useEffect(() => {
    writeBillingMenuToStorage(activeMenu)
  }, [activeMenu])

  useEffect(() => {
    if (activeMenu !== "billing") setBillingEditOpen(false)
  }, [activeMenu])

  const activeLabel = useMemo(() => {
    const menu = BILLING_MENUS.find((item) => item.id === activeMenu)
    return menu?.label ?? "결제 관리"
  }, [activeMenu])

  const loadDaumPostcode = useCallback(() => {
    if (typeof window === "undefined") return Promise.reject(new Error("no-window"))
    if ((window as Window & { daum?: { Postcode?: unknown } }).daum?.Postcode) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(DAUM_POSTCODE_SCRIPT_ID) as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener("error", () => reject(new Error("postcode-load-failed")), { once: true })
        return
      }
      const script = document.createElement("script")
      script.id = DAUM_POSTCODE_SCRIPT_ID
      script.async = true
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("postcode-load-failed"))
      document.body.appendChild(script)
    })
  }, [])

  const handleSearchPostcode = useCallback(async () => {
    if (postcodeLoading) return
    setPostcodeLoading(true)
    try {
      await loadDaumPostcode()
      const PostcodeCtor = (window as Window & { daum?: { Postcode?: new (args: unknown) => { open: () => void } } }).daum
        ?.Postcode
      if (!PostcodeCtor) return
      new PostcodeCtor({
        oncomplete: (data: {
          zonecode?: string
          roadAddress?: string
          jibunAddress?: string
          userSelectedType?: "R" | "J"
          bname?: string
          buildingName?: string
          apartment?: "Y" | "N"
        }) => {
          const address =
            data.userSelectedType === "R" ? data.roadAddress || "" : data.jibunAddress || ""
          let extra = ""
          if (data.userSelectedType === "R") {
            if (data.bname && /[동|로|가]$/g.test(data.bname)) extra += data.bname
            if (data.buildingName && data.apartment === "Y") {
              extra += extra ? `, ${data.buildingName}` : data.buildingName
            }
            if (extra) extra = `(${extra})`
          }
          setBillingForm((prev) => ({
            ...prev,
            postalCode: data.zonecode || "",
            address1: address,
            extraAddress: extra,
          }))
          window.setTimeout(() => detailAddressRef.current?.focus(), 0)
        },
      }).open()
    } finally {
      setPostcodeLoading(false)
    }
  }, [loadDaumPostcode, postcodeLoading])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-48px)] overflow-hidden rounded-xl border border-border p-0 shadow-lg sm:max-w-[min(980px,calc(100%-48px))]"
      >
        <div className="flex h-[700px] max-h-[calc(100vh-2rem)] w-full bg-background">
          <div className="hidden w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            <BillingSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {activeMenu === "billing" && billingEditOpen ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => setBillingEditOpen(false)}
                    aria-label="뒤로가기"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                ) : null}
                <Popover>
                  <PopoverTrigger
                    className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
                    aria-label="메뉴"
                  >
                    <Menu className="size-4" />
                  </PopoverTrigger>
                  <PopoverContent align="start" side="bottom" sideOffset={8} className="w-56 p-0">
                    <div className="flex flex-col rounded-lg border border-sidebar-border bg-sidebar">
                      <BillingSidebarMenu activeId={activeMenu} onChange={setActiveMenu} />
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

            <div className="mt-3 min-w-0 flex-1 overflow-y-auto pr-2">
              {activeMenu === "subscription" ? (
                // 구독 관리
                <div className="grid gap-4">
                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2">현재 구독</div>
                    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                      <span>Premium · 연간</span>
                      <span className="text-foreground">$600 / 년</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">다음 결제일: 2026-07-29</div>
                  </div>
                  <Button variant="outline" className="w-fit">
                    요금제 변경
                  </Button>
                </div>
              ) : null}

              {activeMenu === "invoices" ? (
                // 청구서
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-sm">청구서 번호</TableHead>
                        <TableHead className="text-sm">발행일</TableHead>
                        <TableHead className="text-sm">상태</TableHead>
                        <TableHead className="text-sm text-right">금액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ["INV-2026-0201", "2026-02-01", "결제됨", "$50.00"],
                        ["INV-2026-0101", "2026-01-01", "결제됨", "$50.00"],
                        ["INV-2025-1201", "2025-12-01", "결제됨", "$50.00"],
                      ].map((row) => (
                        <TableRow key={row[0]}>
                          <TableCell className="text-muted-foreground">{row[0]}</TableCell>
                          <TableCell className="text-muted-foreground">{row[1]}</TableCell>
                          <TableCell className="text-xs">
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30">
                              {row[2]}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-foreground">{row[3]}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              {activeMenu === "billing" ? (
                // 청구 관리
                <div className="grid gap-3">
                  {!billingEditOpen ? (
                    <>
                      <div className="p-4">
                        <div className="text-sm font-semibold text-foreground border-b border-border pb-2">청구 정보</div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">이름(회사명)</div>
                          <div className="flex items-center gap-2 text-sm text-foreground">홍길동</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">이메일</div>
                          <div className="flex items-center gap-2 text-sm text-foreground">hong@example.com</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">청구주소</div>
                          <div className="flex items-center gap-2 text-sm text-foreground">서울시 강남구 테헤란로 123, 7층</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">전화번호</div>
                          <div className="flex items-center gap-2 text-sm text-foreground">82-10-1234-5678</div>
                        </div>
                      </div>
                      <Button variant="outline" className="w-fit" onClick={() => setBillingEditOpen(true)}>
                        청구 정보 업데이트
                      </Button>
                    </>
                  ) : (
                    <div className="p-4 flex flex-col gap-3">
                      <div className="text-sm font-semibold">청구 정보 수정</div>
                      <div className="mt-4 grid gap-4 text-sm">
                        <div className="grid gap-2">
                          <Label>이름(회사명)</Label>
                          <Input
                            value={billingForm.name}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="예: Reduct AI"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>이메일</Label>
                          <Input
                            type="email"
                            value={billingForm.email}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder="billing@reduct.ai"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>우편번호</Label>
                          <div className="flex items-center gap-2">
                            <Input value={billingForm.postalCode} readOnly placeholder="우편번호" />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={handleSearchPostcode}
                              disabled={postcodeLoading}
                            >
                              {postcodeLoading ? "검색 중..." : "주소 검색"}
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>주소</Label>
                          <Input value={billingForm.address1} readOnly placeholder="도로명/지번 주소" />
                        </div>
                        <div className="grid gap-2">
                          <Label>상세주소</Label>
                          <Input
                            ref={detailAddressRef}
                            value={billingForm.address2}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, address2: e.target.value }))}
                            placeholder="상세주소 입력"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>참고항목</Label>
                          <Input value={billingForm.extraAddress} readOnly placeholder="참고항목" />
                        </div>
                        <div className="grid gap-2">
                          <Label>전화번호</Label>
                          <Input
                            value={billingForm.phone}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, phone: e.target.value }))}
                            placeholder="전화번호"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" onClick={() => setBillingEditOpen(false)}>
                          취소
                        </Button>
                        <Button onClick={() => setBillingEditOpen(false)}>저장</Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {activeMenu === "payments" ? (
                // 결제 수단
                <div className="grid gap-4">
                  <div className="p-4">
                    <div className="text-sm font-semibold text-foreground">등록된 결제 수단</div>
                    <div className="mt-3 grid gap-3">
                      <div className="flex items-center gap-3 rounded-xl border border-border p-3 bg-card">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#1a1f71]">
                          {VisaIcon ? <VisaIcon className="h-6 w-9" /> : <CreditCard className="size-5 text-white" />}
                        </div>
                        <div className="flex flex-1 flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">Visa •••• 1234</span>
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30">기본</span>
                          </div>
                          <span className="text-xs text-muted-foreground">만료 12/28</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 rounded-xl border border-border p-3 bg-card">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#f5f5f5] dark:bg-neutral-800">
                          {MasterIcon ? <MasterIcon className="h-6 w-9" /> : <CreditCard className="size-5 text-foreground" />}
                        </div>
                        <div className="flex flex-1 flex-col min-w-0">
                          <span className="text-sm font-medium text-foreground">Mastercard •••• 5678</span>
                          <span className="text-xs text-muted-foreground">만료 08/27</span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0">
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem className="flex items-center gap-2 text-sm">
                              <Star className="size-4" />
                              기본 카드 설정
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2 text-sm text-destructive">
                              <Trash2 className="size-4" />
                              카드 삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex items-center gap-3 rounded-xl border border-border p-3 bg-card">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#006fcf]">
                          {AmexIcon ? <AmexIcon className="h-6 w-9" /> : <CreditCard className="size-5 text-white" />}
                        </div>
                        <div className="flex flex-1 flex-col min-w-0">
                          <span className="text-sm font-medium text-foreground">Amex •••• 9012</span>
                          <span className="text-xs text-muted-foreground">만료 03/26</span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0">
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem className="flex items-center gap-2 text-sm">
                              <Star className="size-4" />
                              기본 카드 설정
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex items-center gap-2 text-sm text-destructive">
                              <Trash2 className="size-4" />
                              카드 삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" className="w-fit">
                    <Plus className="size-4 mr-2" />
                    결제 수단 추가
                  </Button>
                </div>
              ) : null}

              {activeMenu === "transactions" ? (
                // 결제 내역
                <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">날짜</TableHead>
                        <TableHead className="w-[160px]">플랜</TableHead>
                        <TableHead className="w-[140px]">결제 수단</TableHead>
                        <TableHead className="text-right">금액</TableHead>
                        <TableHead className="text-center">상태</TableHead>
                        <TableHead className="w-[70px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {([
                        { date: "2026-02-01", plan: "Premium 연간", card: "visa" as const, last4: "1234", amount: "$600.00", status: "결제됨" },
                        { date: "2025-02-01", plan: "Premium 연간", card: "visa" as const, last4: "1234", amount: "$600.00", status: "결제됨" },
                        { date: "2024-02-01", plan: "Premium 연간", card: "mastercard" as const, last4: "5678", amount: "$600.00", status: "결제됨" },
                        { date: "2023-02-01", plan: "Premium 연간", card: "amex" as const, last4: "9012", amount: "$600.00", status: "결제됨" },
                      ] as const).map((row) => {
                        const brand = normalizeCardBrand(row.card) ?? "visa"
                        const CardIcon = getCardBrandIcon(brand) ?? CreditCard
                        const brandLabel = cardLabel(brand)
                        return (
                          <TableRow key={`${row.date}-${row.plan}`}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{row.date}</TableCell>
                            <TableCell className="text-xs whitespace-normal break-words break-all">{row.plan}</TableCell>
                            <TableCell className="whitespace-normal break-words">
                              <div className="flex items-center gap-1">
                                <CardIcon className="h-5 w-7 shrink-0 rounded-sm" />
                                <span className="text-xs text-muted-foreground">{brandLabel} · {row.last4}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{row.amount}</TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30">
                                {row.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                영수증
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
