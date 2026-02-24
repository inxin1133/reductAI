import { useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

const API_URL = "http://localhost:3001/auth"

type Step = "email" | "verify"

export default function SsoEmail() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const initialToken = params.get("sso_token") || ""
  const initialProvider = params.get("provider") || ""
  const initialEmailHint = params.get("email_hint") || ""

  const [step, setStep] = useState<Step>("email")
  const [ssoToken] = useState(initialToken)
  const [provider] = useState(initialProvider)
  const [email, setEmail] = useState(initialEmailHint)
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const providerLabel = useMemo(() => {
    if (provider === "naver") return "네이버"
    if (provider === "kakao") return "카카오"
    return "SSO"
  }, [provider])

  const isSlowMailDomain = useMemo(() => {
    const lower = email.trim().toLowerCase()
    return lower.endsWith("@daum.net") || lower.endsWith("@kakao.com")
  }, [email])

  const handleCancel = () => {
    navigate("/", { replace: true })
  }

  const handleSendCode = async () => {
    if (!ssoToken) {
      setError("SSO 세션이 없습니다. 다시 로그인해 주세요.")
      return
    }
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("이메일을 입력해주세요.")
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setError("이메일 형식이 아닙니다. 다시 작성해 주세요")
      return
    }
    if (trimmedEmail !== email) setEmail(trimmedEmail)

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/sso/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sso_token: ssoToken, email: trimmedEmail }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || "인증번호 발송 실패")
      }
      setStep("verify")
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!ssoToken) {
      setError("SSO 세션이 없습니다. 다시 로그인해 주세요.")
      return
    }
    if (otp.length !== 6) {
      setError("인증번호 6자리를 입력해주세요.")
      return
    }
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("이메일을 입력해주세요.")
      return
    }
    if (trimmedEmail !== email) setEmail(trimmedEmail)

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/sso/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sso_token: ssoToken, email: trimmedEmail, code: otp }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || "인증번호 확인 실패")
      }
      if (data?.redirect_url) {
        window.location.replace(String(data.redirect_url))
        return
      }
      throw new Error("로그인 처리에 실패했습니다.")
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
    } finally {
      setLoading(false)
    }
  }

  if (!ssoToken) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex min-h-[calc(100vh-60px)] items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">SSO 세션이 만료되었습니다.</p>
            <Button className="mt-4 w-full" onClick={handleCancel}>
              로그인 화면으로 돌아가기
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex min-h-[calc(100vh-60px)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-2 text-center space-y-2">
            <h1 className="text-lg font-semibold">{providerLabel} 이메일 인증</h1>          
            <p className="text-sm text-muted-foreground">
              {providerLabel} 정책상 아이디, 이메일을 제공받을 수 없어, <br />
              이메일 인증을 추가로 진행합니다.
            </p>
            <p className="text-sm text-foreground">
              이메일 인증 완료 후 로그인이 완료됩니다. 
            </p>
          </div>

        {error ? <p className="mt-4 text-xs text-destructive">{error}</p> : null}

        {step === "email" ? (
          <div className="mt-6 flex flex-col gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">이메일</p>
              <Input
                type="email"
                placeholder="이메일 주소"
                className="h-[36px]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">인증번호는 20분간 유효합니다.</p>
              {isSlowMailDomain ? (
                <p className="text-xs text-amber-600">
                  daum.net 또는 kakao.com 메일은 도착이 느릴 수 있습니다.
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 h-[36px]" onClick={handleCancel}>
                취소
              </Button>
              <Button className="flex-1 h-[36px]" onClick={handleSendCode} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "인증번호 받기"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium">인증번호 입력</span>
              <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={loading}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-[36px] w-[36px]" />
                  <InputOTPSlot index={1} className="h-[36px] w-[36px]" />
                  <InputOTPSlot index={2} className="h-[36px] w-[36px]" />
                  <InputOTPSlot index={3} className="h-[36px] w-[36px]" />
                  <InputOTPSlot index={4} className="h-[36px] w-[36px]" />
                  <InputOTPSlot index={5} className="h-[36px] w-[36px]" />
                </InputOTPGroup>
              </InputOTP>
              <p className="text-xs text-muted-foreground">{email} 주소로 받은 인증 코드를 입력하세요.</p>
              <p className="text-xs text-muted-foreground">인증번호는 20분간 유효합니다.</p>
              {isSlowMailDomain ? (
                <p className="text-xs text-amber-600">
                  daum.net 또는 kakao.com 메일은 도착이 느릴 수 있습니다.
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 h-[36px]" onClick={() => setStep("email")}>
                이메일 수정
              </Button>
              <Button className="flex-1 h-[36px]" onClick={handleVerify} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "확인"}
              </Button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
