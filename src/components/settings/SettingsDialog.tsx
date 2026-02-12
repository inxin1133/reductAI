import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Banknote,
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
} from "lucide-react"

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SettingsDialogSidebarMenu = () => (
  <>
    <div className="p-2">
      <div className="flex h-8 items-center px-2 text-xs text-sidebar-foreground/70">개인 설정</div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-md bg-accent px-2 text-left text-sidebar-foreground"
        >
          <User className="size-5 shrink-0" />
          <span className="text-sm">사용자 정보</span>
        </button>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <SquareAsterisk className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">비밀번호 변경</span>
        </button>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <Coins className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">크레딧 관리</span>
        </button>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <Gauge className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">사용내역</span>
        </button>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <MonitorSmartphone className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">접속기기</span>
        </button>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <HardDrive className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">스토리지</span>
        </button>
      </div>
    </div>

    <div className="p-2">
      <div className="flex h-8 items-center px-2 text-xs text-sidebar-foreground/70">결제 관리</div>
      <div className="flex flex-col gap-1">
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <HandHelping className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">구독 관리</span>
        </button>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <ReceiptText className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">청구서</span>
        </button>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <CreditCard className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">결제 수단</span>
        </button>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-2 text-left hover:bg-accent">
          <Banknote className="size-5 shrink-0 text-sidebar-foreground" />
          <span className="text-sm text-sidebar-foreground">결제 관리</span>
        </button>
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

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border p-0 shadow-lg sm:max-w-[1000px]"
      >
        <div className="flex h-[700px] max-h-[calc(100vh-2rem)] w-full bg-background">
          <div className="hidden w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
            <SettingsDialogSidebarMenu />
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
                      aria-label="메뉴"
                    >
                      <Menu className="size-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="bottom" sideOffset={8} className="w-56 p-0">
                    <div className="flex flex-col rounded-lg border border-sidebar-border bg-sidebar">
                      <SettingsDialogSidebarMenu />
                    </div>
                  </PopoverContent>
                </Popover>
                <h2 className="text-base font-bold text-foreground">사용자 정보</h2>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </DialogClose>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
