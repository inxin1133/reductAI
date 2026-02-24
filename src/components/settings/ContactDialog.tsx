import { useCallback, useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail, Send, User, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

const CONTACT_EMAIL = "admin@reduct.page"
const CONTACT_API_URL = "http://localhost:3001/auth"

type ContactCategory = "general" | "sales" | "support" | "partnership"

const CATEGORIES: { value: ContactCategory; label: string; icon: string }[] = [
  { value: "general", label: "일반 문의", icon: "💬" },
  { value: "sales", label: "요금제 상담", icon: "💰" },
  { value: "support", label: "기술 지원", icon: "🛠" },
  { value: "partnership", label: "파트너십", icon: "🤝" },
]

type ContactDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContactDialog({ open, onOpenChange }: ContactDialogProps) {
  const [category, setCategory] = useState<ContactCategory>("general")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userName = typeof window !== "undefined"
    ? String(localStorage.getItem("user_name") || "").trim() || null
    : null
  const userEmail = typeof window !== "undefined"
    ? String(localStorage.getItem("user_email") || "").trim() || null
    : null

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setCategory("general")
        setSubject("")
        setMessage("")
        setSent(false)
        setError(null)
      }, 200)
    }
  }, [open])

  const canSubmit = !!(subject.trim() && message.trim() && userName && userEmail)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || sending) return
    setSending(true)
    setError(null)

    try {
      const res = await fetch(`${CONTACT_API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          email: userEmail,
          category,
          subject: subject.trim(),
          message: message.trim(),
        }),
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null
      if (!res.ok || !json?.ok) {
        setError(json?.message || "문의 전송에 실패했습니다.")
        return
      }
      setSent(true)
    } catch {
      setError("문의 전송 중 오류가 발생했습니다.")
    } finally {
      setSending(false)
    }
  }, [canSubmit, category, message, sending, subject, userEmail, userName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-bold">문의하기</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center justify-center px-5 pb-8 pt-4 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
              <CheckCircle2 className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">문의가 접수되었습니다</p>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              {CONTACT_EMAIL}로 전달되었습니다.<br />빠른 시일 내에 답변 드리겠습니다.
            </p>
            <Button variant="outline" size="sm" className="mt-5" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-5">
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            {/* 계정 정보 */}
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{userName || "-"}</p>
                <p className="truncate text-xs text-muted-foreground">{userEmail || "-"}</p>
              </div>
            </div>

            {/* 문의 유형 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">문의 유형</label>
              <div className="grid grid-cols-4 gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center transition-colors",
                      category === cat.value
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border/60 hover:border-primary/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="text-base leading-none">{cat.icon}</span>
                    <span className="text-[11px] font-medium leading-tight">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 제목 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                제목 <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="문의 제목을 입력해 주세요"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            {/* 내용 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                내용 <span className="text-destructive">*</span>
              </label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                placeholder="문의 내용을 자세히 작성해 주세요"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-muted-foreground">
                <Mail className="mr-0.5 inline size-3" />
                {CONTACT_EMAIL}
              </p>
              <Button type="submit" size="sm" disabled={sending || !canSubmit}>
                {sending ? "전송 중..." : "문의 보내기"}
                <Send className="ml-1 size-3.5" />
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
