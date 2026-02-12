import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Info, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { LogoGoogle } from "@/components/icons/LogoGoogle"
import { LogoNaver } from "@/components/icons/LogoNaver"
import { LogoKakao } from "@/components/icons/LogoKakao"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"

// Asset URLs from Figma
// const imgGoogle = "https://www.figma.com/api/mcp/asset/20f95895-9d79-4ac0-a707-52df26035fad"
// const imgNaver = "https://www.figma.com/api/mcp/asset/245a06ec-85c2-4760-b280-15853ac758c9"
// const imgKakao = "https://www.figma.com/api/mcp/asset/8829f16c-6093-4f3c-adf6-60e04288acc6"

const API_URL = 'http://localhost:3001/auth'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'login' | 'password_input' | 'forgot_password_verify' | 'reset_password' | 'reset_complete' | 'verification' | 'info' | 'completion'

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const navigate = useNavigate()
  const [step, setStep] = React.useState<Step>('login')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
  // Form State
  const [email, setEmail] = React.useState("")
  const [rememberEmail, setRememberEmail] = React.useState(false)
  const [otp, setOtp] = React.useState("")
  const [name, setName] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [passwordConfirm, setPasswordConfirm] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("")
  const [termsAccepted, setTermsAccepted] = React.useState(false)
  const [termsViewed, setTermsViewed] = React.useState(false)

  // Ref for password input
  const passwordInputRef = React.useRef<HTMLInputElement>(null)
  const REMEMBER_EMAIL_KEY = "reductai:login:rememberEmail"
  const REMEMBER_EMAIL_ENABLED_KEY = "reductai:login:rememberEmailEnabled"

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep('login')
        setEmail("")
        setRememberEmail(false)
        setOtp("")
        setName("")
        setPassword("")
        setPasswordConfirm("")
        setNewPassword("")
        setConfirmNewPassword("")
        setTermsAccepted(false)
        setTermsViewed(false)
        setError(null)
      }, 300)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    try {
      const enabled = localStorage.getItem(REMEMBER_EMAIL_ENABLED_KEY) === "1"
      setRememberEmail(enabled)
      if (enabled) {
        const saved = localStorage.getItem(REMEMBER_EMAIL_KEY) || ""
        if (saved) setEmail(saved)
      }
    } catch {
      // ignore
    }
  }, [REMEMBER_EMAIL_ENABLED_KEY, REMEMBER_EMAIL_KEY, open])

  React.useEffect(() => {
    if (!open) return
    try {
      if (rememberEmail) {
        localStorage.setItem(REMEMBER_EMAIL_ENABLED_KEY, "1")
        if (email) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, email)
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY)
        }
      } else {
        localStorage.setItem(REMEMBER_EMAIL_ENABLED_KEY, "0")
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }
    } catch {
      // ignore
    }
  }, [REMEMBER_EMAIL_ENABLED_KEY, REMEMBER_EMAIL_KEY, email, open, rememberEmail])

  // Focus password input when step changes to 'password_input'
  React.useEffect(() => {
    if (step === 'password_input' && open) {
      // setTimeout을 사용하여 렌더링 후 포커스
      setTimeout(() => {
        passwordInputRef.current?.focus()
      }, 100)
    }
  }, [step, open])

  // 비밀번호 유효성 검사 함수
  const validatePassword = (pwd: string) => {
    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    const isValidLength = pwd.length >= 8;
    return hasLetter && hasNumber && hasSpecial && isValidLength;
  };

  // 실시간 비밀번호 피드백 함수
  const getPasswordFeedback = (pwd: string) => {
    if (!pwd) return null;

    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    const isValidLength = pwd.length >= 8;

    if (!isValidLength) {
      return <p className="text-xs text-muted-foreground mt-1">➡️ 최소 8자 이상으로 입력해주세요.</p>;
    }

    if (hasLetter && hasNumber && hasSpecial) {
      return <p className="text-xs text-green-600 font-medium mt-1">✅ 완벽합니다! 안전하고 강력한 비밀번호가 생성되었습니다.</p>;
    }

    if (hasLetter && hasNumber) return <p className="text-xs text-amber-600 mt-1">⚠️ 특수문자가 한개 이상 포함되어야 합니다.</p>;
    if (hasLetter && hasSpecial) return <p className="text-xs text-amber-600 mt-1">⚠️ 숫자가 반드시 포함되어야 합니다.</p>;
    if (hasNumber && hasSpecial) return <p className="text-xs text-amber-600 mt-1">⚠️ 영문이 반드시 포함되어야 합니다.</p>;
    
    if (hasNumber) return <p className="text-xs text-amber-600 mt-1">⚠️ 영문과 특수문자가 반드시 포함되어야 합니다.</p>;
    if (hasLetter) return <p className="text-xs text-amber-600 mt-1">⚠️ 숫자와 특수문자가 반드시 포함되어야 합니다.</p>;
    
    // Only special or none
    return <p className="text-xs text-amber-600 mt-1">⚠️ 영문과 숫자가 반드시 포함되어야 합니다.</p>;
  };

  // 비밀번호 확인 피드백 함수
  const getPasswordConfirmFeedback = () => {
    if (!passwordConfirm) return null;
    
    if (password !== passwordConfirm) {
      return <p className="text-xs text-destructive mt-1">작성한 비밀번호가 맞지 않습니다.</p>;
    } else {
      return <p className="text-xs text-green-600 font-medium mt-1">작성한 비밀번호가 일치합니다.</p>;
    }
  };

  const handleLoginContinue = async () => {
    if (!email) {
      setError("이메일을 입력해주세요.")
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError("이메일 형식이 아닙니다. 다시 작성해 주세요")
      return
    }
    
    setIsLoading(true)
    setError(null)
    try {
      // Check if user exists
      const checkResponse = await fetch(`${API_URL}/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      const checkData = await checkResponse.json()
      
      if (!checkResponse.ok) {
        throw new Error(checkData.message || '이메일 확인 실패')
      }

      if (checkData.exists) {
        // User exists, go to password input
        setStep('password_input')
      } else {
        // User does not exist, send verification code for signup
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
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
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
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
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
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleInfoSubmit = async () => {
    if (!name || !password || !passwordConfirm) {
      setError("모든 정보를 입력해주세요.")
      return
    }
    
    // 비밀번호 유효성 검사
    if (!validatePassword(password)) {
      // setError("비밀번호는 영문, 숫자, 특수문자를 포함하여 8자 이상이어야 합니다.")
      // 실시간 피드백이 있으므로 여기서는 상세 에러 메시지보다는 간단히 표시하거나,
      // 혹은 상세 메시지를 그대로 둬도 무방. 사용자 경험상 놔두는게 확실함.
      setError("비밀번호 규칙을 확인해주세요.") 
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
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoginNow = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (response.ok && data.token) {
        // 토큰과 만료 시간을 저장하여 세션 유지 (기본 24시간)
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000
        localStorage.setItem('token', data.token)
        localStorage.setItem('token_expires_at', expiresAt.toString())
        localStorage.setItem('user_email', email)
        if (data.user?.full_name) {
          localStorage.setItem('user_name', String(data.user.full_name))
        }
        if (data.user?.id) {
          localStorage.setItem('user_id', data.user.id)
        }
        onOpenChange(false)
        navigate('/front-ai')
      } else {
        throw new Error(data.message || '로그인 실패')
      }
    } catch (err) {
      console.error(err)
      setError("로그인 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordLogin = async () => {
    if (!password) {
      setError("비밀번호를 입력해주세요.")
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (response.ok && data.token) {
        // 토큰과 만료 시간을 저장하여 세션 유지 (기본 24시간)
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000
        localStorage.setItem('token', data.token)
        localStorage.setItem('token_expires_at', expiresAt.toString())
        localStorage.setItem('user_email', email)
        if (data.user?.full_name) {
          localStorage.setItem('user_name', String(data.user.full_name))
        }
        if (data.user?.id) {
          localStorage.setItem('user_id', data.user.id)
        }
        onOpenChange(false)
        navigate('/front-ai')
      } else {
        throw new Error(data.message || '로그인 실패')
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setIsLoading(true)
    setError(null)
    setOtp("") // Reset OTP
    try {
      const response = await fetch(`${API_URL}/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || '인증번호 발송 실패')
      }
      
      setStep('forgot_password_verify')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyResetCode = async () => {
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
      
      setStep('reset_password')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      setError("비밀번호를 입력해주세요.")
      return
    }
    
    // 비밀번호 유효성 검사
    if (!validatePassword(newPassword)) {
      setError("비밀번호 규칙을 확인해주세요.")
      return
    }

    if (newPassword !== confirmNewPassword) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp, newPassword })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || '비밀번호 변경 실패')
      }
      
      setStep('reset_complete')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("알 수 없는 오류가 발생했습니다.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  // 계정 생성 버튼 활성화 조건
  const isSignupFormValid = 
    name && 
    validatePassword(password) && 
    password === passwordConfirm && 
    termsAccepted && 
    termsViewed;

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
            {step === 'password_input' && "비밀번호 입력"}
            {step === 'forgot_password_verify' && "비밀번호 찾기"}
            {step === 'reset_password' && "비밀번호 변경"}
            {step === 'reset_complete' && "비밀번호 변경 완료"}
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
        
        {/* Step: Password Input (User Exists) */}
        {step === 'password_input' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-left text-muted-foreground text-center break-keep">
                계정 비밀번호를 입력하세요.
              </p>
            </div>

            <div className="flex flex-col gap-2 w-full">
               <div className="relative">
                 <Input 
                   ref={passwordInputRef}
                   type="password" 
                   placeholder="비밀번호 입력" 
                   className="h-[36px] font-bold placeholder:font-bold placeholder:text-muted-foreground pr-10"
                   value={password}
                   onChange={(e) => setPassword(e.target.value)}
                   onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePasswordLogin()
                    }
                  }}
                   disabled={isLoading}
                 />
                 <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-accent rounded-sm w-6 h-6 flex items-center justify-center cursor-pointer">
                            <Info className="w-4 h-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center">
                          영문+숫자, 특수문자 포함 8자
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
               </div>
            </div>

            <div className="flex items-center justify-between">
               <span className="text-sm cursor-pointer hover:underline" onClick={handleForgotPassword}>비밀번호 찾기</span>
               <div className="flex gap-2">
                  <Button variant="secondary" className="h-[36px]" onClick={() => setStep('login')}>취소</Button>
                  <Button className="h-[36px]" onClick={handlePasswordLogin} disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "로그인"}
                  </Button>
               </div>
            </div>
          </div>
        )}

        {/* Step: Forgot Password - Verify Code */}
        {step === 'forgot_password_verify' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground text-center break-keep">
                등록된 주소로 인증 메일을 송부 했습니다.
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
                {email} 주소로 받은 인증 코드를 입력하세요
              </p>
            </div>

            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 h-[36px]" onClick={handleResendOTP} disabled={isLoading}>
                 {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "인증번호 재발송"}
              </Button>
              <Button className="flex-1 h-[36px]" onClick={handleVerifyResetCode} disabled={isLoading}>
                 {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "확인"}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Reset Password - Input New Password */}
        {step === 'reset_password' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground text-center break-keep">
                변경할 비밀번호를 입력해주세요.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-bold">비밀번호</p>
                <div className="relative">
                  <Input 
                    type="password" 
                    placeholder="비밀번호 입력" 
                    className="h-[36px] font-bold placeholder:font-bold placeholder:text-muted-foreground pr-10" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isLoading}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-accent rounded-sm w-6 h-6 flex items-center justify-center cursor-pointer">
                            <Info className="w-4 h-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center">
                          영문+숫자, 특수문자 포함 8자
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                {/* Real-time Feedback for Reset Password */}
                {getPasswordFeedback(newPassword)}
              </div>

              <div className="space-y-1">
                <p className="text-sm font-bold">비밀번호확인</p>
                <Input 
                  type="password" 
                  placeholder="비밀번호 다시 입력" 
                  className="h-[36px] font-bold placeholder:font-bold placeholder:text-muted-foreground" 
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <Button variant="secondary" className="flex-1 h-[36px]" onClick={() => setStep('login')}>취소</Button>
              <Button className="flex-1 h-[36px]" onClick={handleResetPassword} disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "비밀번호 변경"}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Reset Complete */}
        {step === 'reset_complete' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground text-center break-keep">
                비밀번호가 성공적으로 변경되었습니다.
              </p>
            </div>

            <div className="flex gap-2 w-full">
              <Button variant="secondary" className="flex-1 h-[36px]" onClick={() => onOpenChange(false)}>취소</Button>
              <Button className="flex-1 h-[36px]" onClick={() => setStep('password_input')}>
                바로 로그인
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Login / Initial */}
        {step === 'login' && (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-left text-muted-foreground text-center break-keep">
                SSO 인증 또는 아이디를 통한 로그인 또는 신규계정 생성을 진행합니다.
              </p>
            </div>
            
            <div className="flex flex-col gap-2 w-full">
              <button 
                type="button"
                className="flex items-center justify-center gap-2 w-full h-[40px] bg-primary-foreground text-primary border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 transition-colors"
              >
                <div className="size-[24px] flex items-center justify-center overflow-hidden">
                   <LogoGoogle className="relative shrink-0 size-[24px]" />
                </div>
                <span className="text-base text-primary">Google</span>
              </button>

              <button 
                type="button"
                className="flex items-center justify-center gap-2 w-full h-[40px] bg-primary-foreground text-primary border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 transition-colors"
              >
                <div className="size-[24px] flex items-center justify-center overflow-hidden">
                   
                   <LogoNaver className="relative shrink-0 size-[24px]" />
                </div>
                <span className="text-base text-primary">NAVER</span>
              </button>

              <button 
                type="button"
                className="flex items-center justify-center gap-2 w-full h-[40px] bg-yellow-400 text-yellow-900 border border-gray-200 rounded-md shadow-sm hover:bg-yellow-300 transition-colors"
              >
                <div className="size-[24px] flex items-center justify-center overflow-hidden">
                   <LogoKakao className="relative shrink-0 size-[24px]" />
                </div>
                <span className="text-base text-black">KAKAO</span>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLoginContinue()
                  }
                }}
                disabled={isLoading}
              />
              <label className="flex items-center justify-end gap-2 text-xs text-muted-foreground pb-2 px-2">
                <span>아이디 기억하기</span>
                <Switch
                  checked={rememberEmail}
                  onCheckedChange={(checked) => setRememberEmail(Boolean(checked))}
                  disabled={isLoading}
                />
              </label>
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
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-accent rounded-sm w-6 h-6 flex items-center justify-center cursor-pointer">
                            <Info className="w-4 h-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center">
                          영문+숫자, 특수문자 포함 8자
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                {/* Real-time Feedback for Signup Password */}
                {getPasswordFeedback(password)}
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
                {/* Real-time Feedback for Signup Password Confirm */}
                {getPasswordConfirmFeedback()}
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
                disabled={!isSignupFormValid || isLoading}
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
