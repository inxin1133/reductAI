import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Checkbox } from "@/components/ui/checkbox"
import { Info, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Asset URLs from Figma
const imgGoogle = "https://www.figma.com/api/mcp/asset/20f95895-9d79-4ac0-a707-52df26035fad"
const imgNaver = "https://www.figma.com/api/mcp/asset/245a06ec-85c2-4760-b280-15853ac758c9"
const imgKakao = "https://www.figma.com/api/mcp/asset/8829f16c-6093-4f3c-adf6-60e04288acc6"

const API_URL = 'http://localhost:3001/auth'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'login' | 'verification' | 'info' | 'completion'

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const navigate = useNavigate()
  const [step, setStep] = React.useState<Step>('login')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
  // Form State
  const [email, setEmail] = React.useState("")
  const [otp, setOtp] = React.useState("")
  const [name, setName] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [passwordConfirm, setPasswordConfirm] = React.useState("")
  const [termsAccepted, setTermsAccepted] = React.useState(false)
  const [termsViewed, setTermsViewed] = React.useState(false)

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('login')
        setEmail("")
        setOtp("")
        setName("")
        setPassword("")
        setPasswordConfirm("")
        setTermsAccepted(false)
        setTermsViewed(false)
        setError(null)
      }, 300)
    }
  }, [open])

  const handleLoginContinue = async () => {
    if (!email) {
      setError("이메일을 입력해주세요.")
      return
    }
    
    setIsLoading(true)
    setError(null)
    try {
      // First, try to login or check user existence.
      // For this flow, we'll first try to send verification code.
      const response = await fetch(`${API_URL}/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || '인증번호 발송 실패')
      }
      
      setStep('verification')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOTP = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || '인증번호 재발송 실패')
      }
      
      alert("인증번호가 재발송되었습니다.")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerificationConfirm = async () => {
    if (otp.length !== 6) {
      setError("인증번호 6자리를 입력해주세요.")
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || '인증번호 확인 실패')
      }
      
      if (data.isExistingUser) {
        // User exists, usually login logic here
        // For now, let's just proceed to completion or show message
        alert("이미 가입된 사용자입니다. 로그인 처리를 진행합니다.")
        // Example: Log user in directly
        // onOpenChange(false)
        // navigate('/front-ai')
        // For this task flow, we proceed to info step but maybe pre-fill?
        // Let's assume this flow is specifically for SIGNUP as requested.
        // If user exists, we might stop here or allow password reset.
        // Let's proceed to Info step to simulate signup flow as per Figma
        setStep('info') 
      } else {
        setStep('info')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInfoSubmit = async () => {
    if (!name || !password || !passwordConfirm) {
      setError("모든 정보를 입력해주세요.")
      return
    }
    
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }

    if (!termsAccepted || !termsViewed) {
      setError("약관에 동의해주세요.")
      return
    }
    
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || '회원가입 실패')
      }
      
      // Store token if needed
      if (data.token) {
        localStorage.setItem('token', data.token)
      }
      
      setStep('completion')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoginNow = async () => {
    setIsLoading(true)
    setError(null)
    try {
        // Try automatic login
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })

        const data = await response.json()

        if (response.ok && data.token) {
            localStorage.setItem('token', data.token)
            onOpenChange(false)
            navigate('/front-ai')
        } else {
            // Fallback
             onOpenChange(false)
             navigate('/front-ai')
        }
    } catch (e) {
         onOpenChange(false)
         navigate('/front-ai')
    } finally {
        setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "bg-background p-6 gap-6 transition-all duration-300",
        step === 'login' ? "sm:max-w-[400px]" : "sm:max-w-[400px]"
      )}>
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-lg font-semibold">
            {step === 'login' && "로그인 또는 회원가입"}
            {(step === 'verification' || step === 'info') && "회원가입"}
            {step === 'completion' && "회원가입 완료"}
          </DialogTitle>
        </DialogHeader>
        
        {/* Error Message */}
        {error && (
            <div className="text-destructive text-sm text-center font-medium">
                {error}
            </div>
        )}
        
        {/* Step 1: Login / Initial */}
        {step === 'login' && (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground text-center break-keep">
                SSO 인증 또는 아이디를 통한 로그인 또는 신규계정 생성을 진행합니다.
              </p>
            </div>
            
            <div className="flex flex-col gap-2 w-full">
              <button 
                type="button"
                className="flex items-center justify-center gap-2 w-full h-[36px] bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 transition-colors"
              >
                <div className="w-4 h-4 flex items-center justify-center overflow-hidden">
                   <img src={imgGoogle} alt="Google" className="w-full h-full object-contain" />
                </div>
                <span className="text-sm font-medium text-black">Google</span>
              </button>

              <button 
                type="button"
                className="flex items-center justify-center gap-2 w-full h-[36px] bg-white border border-[#66c76b] rounded-md shadow-sm hover:bg-gray-50 transition-colors"
              >
                <div className="w-4 h-4 flex items-center justify-center overflow-hidden">
                   <img src={imgNaver} alt="Naver" className="w-full h-full object-contain" />
                </div>
                <span className="text-sm font-medium text-black">NAVER</span>
              </button>

              <button 
                 type="button"
                 className="flex items-center justify-center gap-2 w-full h-[36px] bg-[#fde047] border border-[#3e2727] rounded-md shadow-sm hover:opacity-90 transition-opacity"
              >
                <div className="w-4 h-4 flex items-center justify-center overflow-hidden">
                   <img src={imgKakao} alt="Kakao" className="w-full h-full object-contain" />
                </div>
                <span className="text-sm font-medium text-black">Kakao</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">또는</span>
              <Separator className="flex-1" />
            </div>

            <div className="flex flex-col gap-2 w-full">
              <Input 
                type="email" 
                placeholder="이메일 주소" 
                className="h-[36px]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
              <Button className="w-full h-[36px]" onClick={handleLoginContinue} disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "계속"}
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Email Verification */}
        {step === 'verification' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground text-center break-keep">
                검색된 계정이 없어 해당 계정을 신규생성합니다.
              </p>
            </div>

            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm font-medium">인증번호입력</span>
              <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={isLoading}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="w-[36px] h-[36px]" />
                  <InputOTPSlot index={1} className="w-[36px] h-[36px]" />
                  <InputOTPSlot index={2} className="w-[36px] h-[36px]" />
                  <InputOTPSlot index={3} className="w-[36px] h-[36px]" />
                  <InputOTPSlot index={4} className="w-[36px] h-[36px]" />
                  <InputOTPSlot index={5} className="w-[36px] h-[36px]" />
                </InputOTPGroup>
              </InputOTP>
              <p className="text-sm text-muted-foreground text-center mt-2">
                {email || "abc@naver.com"} 주소로 받은 인증 코드를 입력하세요
              </p>
            </div>

            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 h-[36px]" onClick={handleResendOTP} disabled={isLoading}>
                 {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "인증번호 재발송"}
              </Button>
              <Button className="flex-1 h-[36px]" onClick={handleVerificationConfirm} disabled={isLoading}>
                 {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "확인"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: User Info Input */}
        {step === 'info' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-muted-foreground break-keep">
                아래 정보를 입력하고 약관동의를 하면 계정이 생성됩니다.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-bold">이름</p>
                <Input 
                  placeholder="이름 입력" 
                  className="h-[36px] font-bold placeholder:font-bold placeholder:text-muted-foreground" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <p className="text-sm font-bold">비밀번호</p>
                <div className="relative">
                  <Input 
                    type="password" 
                    placeholder="비밀번호 입력" 
                    className="h-[36px] font-bold placeholder:font-bold placeholder:text-muted-foreground pr-10" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="bg-accent rounded-sm w-6 h-6 flex items-center justify-center">
                      <Info className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-bold">비밀번호확인</p>
                <Input 
                  type="password" 
                  placeholder="비밀번호 다시 입력" 
                  className="h-[36px] font-bold placeholder:font-bold placeholder:text-muted-foreground" 
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* Terms Section */}
              <div className="border rounded-md p-4 space-y-4">
                <div className="flex items-start gap-2">
                  <Checkbox 
                    id="terms" 
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                    disabled={!termsViewed || isLoading}
                  />
                  <div className="flex-1">
                     <div className="flex items-center justify-between">
                        <label htmlFor="terms" className="text-sm font-bold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          약관동의
                        </label>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-[32px] text-sm font-bold"
                          onClick={() => setTermsViewed(true)}
                          disabled={isLoading}
                        >
                          열기
                        </Button>
                     </div>
                     <p className="text-[10px] text-muted-foreground mt-1">약관내용</p>
                  </div>
                </div>
              </div>
              
              {!termsViewed && (
                <p className="text-sm font-bold text-muted-foreground text-center">
                  약관동의를 반드시 열람 해야 계정생성 버튼이 활성화 됩니다.
                </p>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              <Button variant="secondary" className="flex-1 h-[36px] font-bold" onClick={() => setStep('login')} disabled={isLoading}>
                취소
              </Button>
              <Button 
                className="flex-1 h-[36px] font-bold" 
                onClick={handleInfoSubmit}
                disabled={!termsAccepted || !termsViewed || isLoading}
              >
                {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "계정생성"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Completion */}
        {step === 'completion' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground text-center break-keep">
                회원가입이 완료되었습니다.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-center">아이디(이메일 주소)</p>
                <p className="text-sm text-muted-foreground text-center">{email || "abc@naver.com"}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-center">이름</p>
                <p className="text-sm text-muted-foreground text-center">{name || "김가나"}</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground text-center break-keep">
              지금 바로 리덕트AI를 통해 당신의 창의성을 전환하세요.
            </p>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 h-[36px]" onClick={() => onOpenChange(false)} disabled={isLoading}>
                취소
              </Button>
              <Button className="flex-1 h-[36px]" onClick={handleLoginNow} disabled={isLoading}>
                 {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "바로 로그인"}
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}
