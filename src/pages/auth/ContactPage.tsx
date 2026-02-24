import { useState } from "react"
import { Mail, Send, MessageSquare, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const CONTACT_EMAIL = "admin@reduct.page"
const CONTACT_API_URL = "http://localhost:3001/auth"

type ContactCategory = "general" | "sales" | "support" | "partnership"

const CATEGORIES: { value: ContactCategory; label: string; description: string }[] = [
  { value: "general", label: "일반 문의", description: "서비스 관련 일반적인 질문" },
  { value: "sales", label: "요금제 상담", description: "Enterprise 플랜, 대량 구매 상담" },
  { value: "support", label: "기술 지원", description: "서비스 이용 중 기술적 문제" },
  { value: "partnership", label: "파트너십", description: "비즈니스 제휴 및 협력 문의" },
]

export default function ContactPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [category, setCategory] = useState<ContactCategory>("general")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categoryLabels: Record<ContactCategory, string> = {
    general: "일반 문의",
    sales: "요금제 상담",
    support: "기술 지원",
    partnership: "파트너십",
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) return

    setSending(true)
    setError(null)

    try {
      const res = await fetch(`${CONTACT_API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
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
    } catch (err) {
      console.error(err)
      setError("문의 전송 중 오류가 발생했습니다.")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Contact
          </span>
          <h1 className="text-4xl font-black text-foreground lg:text-5xl">문의하기</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            서비스에 대해 궁금한 점이 있으시면 언제든 문의해 주세요.
            <br />
            빠르게 답변 드리겠습니다.
          </p>
        </div>
      </section>

      <section className="border-t border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
            {/* Contact Info */}
            <div className="space-y-8 lg:col-span-2">
              <div>
                <h2 className="text-2xl font-bold text-foreground">연락처 정보</h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  이메일을 통해 문의해 주시면 영업일 기준 1~2일 내에 답변 드립니다.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">이메일</p>
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {CONTACT_EMAIL}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Clock className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">운영 시간</p>
                    <p className="text-sm text-muted-foreground">
                      평일 09:00 - 18:00 (KST)
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MessageSquare className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">평균 응답 시간</p>
                    <p className="text-sm text-muted-foreground">영업일 기준 1~2일</p>
                  </div>
                </div>
              </div>

              {/* Category cards */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">문의 유형</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        category === cat.value
                          ? "border-primary bg-primary/5"
                          : "border-border/60 bg-card hover:border-primary/30"
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground">{cat.label}</p>
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-3">
              <div className="rounded-xl border border-border/60 bg-card p-6 lg:p-8">
                {sent ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
                      <Send className="size-8" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">
                      문의가 접수되었습니다
                    </h3>
                    <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                      접수된 내용은 {CONTACT_EMAIL}로 전달되었습니다.
                      빠른 시일 내에 답변 드리겠습니다.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-6"
                      onClick={() => {
                        setSent(false)
                        setError(null)
                        setName("")
                        setEmail("")
                        setSubject("")
                        setMessage("")
                      }}
                    >
                      새 문의 작성
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <h3 className="text-lg font-bold text-card-foreground">
                      {categoryLabels[category]} 문의 보내기
                    </h3>
                    {error ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {error}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">
                          이름 <span className="text-destructive">*</span>
                        </label>
                        <Input
                          placeholder="홍길동"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">
                          이메일 <span className="text-destructive">*</span>
                        </label>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        제목 <span className="text-destructive">*</span>
                      </label>
                      <Input
                        placeholder="문의 제목을 입력해 주세요"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        내용 <span className="text-destructive">*</span>
                      </label>
                      <textarea
                        className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                        placeholder="문의 내용을 자세히 작성해 주세요"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-muted-foreground">
                        <Mail className="mr-1 inline size-3" />
                        {CONTACT_EMAIL}로 바로 전송됩니다
                      </p>
                      <Button
                        type="submit"
                        disabled={sending || !name.trim() || !email.trim() || !subject.trim() || !message.trim()}
                      >
                        {sending ? "전송 중..." : "문의 보내기"}
                        <Send className="ml-1 size-4" />
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
