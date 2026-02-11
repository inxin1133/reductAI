import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTheme } from "@/hooks/useTheme"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Eclipse } from "lucide-react"

import { IconReduct } from "@/components/icons/IconReduct"
import { IconPika } from "@/components/icons/IconPika"
import { IconStableAudio } from "@/components/icons/IconStableAudio"
import { IconRunway } from "@/components/icons/IconRunway"
import { IconElevenlabs } from "@/components/icons/IconElevenlabs"
import { IconPlayai } from "@/components/icons/IconPlayai"
import { IconFierfly } from "@/components/icons/IconFierfly"
import { IconPolly } from "@/components/icons/IconPolly"
import { IconStableDiffusion } from "@/components/icons/IconStableDiffusion"
import { IconChatGPT } from "@/components/icons/IconChatGPT"
import { IconClaude } from "@/components/icons/IconClaude"
import { IconGemini } from "@/components/icons/IconGemini"
import { IconGrok } from "@/components/icons/IconGrok"
import { IconUdio } from "@/components/icons/IconUdio"
export default function AdminLogin() {
  const navigate = useNavigate()
  const { toggleTheme } = useTheme()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // API 베이스 URL (환경변수 우선, 없으면 로컬 기본값 사용)
  const AUTH_API_BASE = useMemo(
    () => import.meta.env.VITE_API_BASE_URL || "http://localhost:3001",
    []
  )
  // 관리자 여부를 확인하는 헬퍼 (platformRole slug 기준)
  const isAdminRole = (roleSlug?: string | null) => {
    const slug = (roleSlug || "").toLowerCase()
    return slug === "admin" || slug === "super-admin" || slug === "owner"
  }

  const handleLogin = async () => {
    if (!email || !password) {
      alert("이메일과 비밀번호를 입력해주세요.")
      return
    }

    setIsLoading(true)
    try {
      // 1) 기본 로그인 요청
      const loginRes = await fetch(`${AUTH_API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({}))
        alert(err.message || "로그인에 실패했습니다.")
        return
      }

      const loginData = await loginRes.json()
      const token = loginData.token
      const user = loginData.user

      if (!token || !user?.id) {
        alert("로그인 응답에 필요한 정보가 없습니다.")
        return
      }

      const platformRole = loginData.platformRole
      if (!isAdminRole(platformRole)) {
        alert("관리자 권한이 없습니다. 관리자 계정으로 로그인하세요.")
        return
      }

      // 3) 세션 2시간 유지 (만료 시각 저장)
      const expiresAt = Date.now() + 2 * 60 * 60 * 1000 // 2 hours
      localStorage.setItem("token", token)
      localStorage.setItem("token_expires_at", expiresAt.toString())
      localStorage.setItem("user_email", user.email || email)
      localStorage.setItem("user_id", user.id)

      // 4) 관리자 대시보드로 이동
      navigate("/admin/dashboard")
    } catch (error) {
      console.error("Admin login error", error)
      alert("로그인 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoToUserPage = () => {
    navigate('/')
  }

  return (
    <div className="bg-background relative w-full h-screen flex flex-col">
      {/* 테마 토글이 있는 헤더 */}
      <div className="flex justify-end items-center px-6 py-4">
        <div 
          className="size-4 cursor-pointer relative flex items-center justify-center text-foreground"
          onClick={toggleTheme}
        >
           <Eclipse className="size-full" />
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col items-center justify-center pb-6 px-6">
        <div className="flex flex-col gap-6 items-center w-[384px]">
          
          {/* 로고 및 타이틀 */}
          <div className="flex flex-col gap-7 items-center w-full">
            <div className="flex flex-col gap-2 items-center">
              <p className="font-black text-4xl text-primary leading-10">
                reduct
              </p>
              <p className="font-semibold text-xl text-foreground leading-7 whitespace-pre-wrap text-center">
                Welcome to reduct Admin page
              </p>
            </div>

            {/* 로그인 폼 */}
            <div className="flex flex-col gap-6 w-full">
              {/* 이메일 입력 */}
              <div className="flex flex-col gap-3 w-full">
                <label className="text-sm text-left font-medium text-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="m@example.com"
                  className="h-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* 비밀번호 입력 */}
              <div className="flex flex-col gap-3 w-full">
                <label className="text-sm text-left font-medium text-foreground">
                  Password
                </label>
                <Input
                  type="password"
                  className="h-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleLogin()
                    }
                  }}
                />
              </div>

              {/* 로그인 버튼 */}
              <Button 
                className="w-full h-9 text-sm font-medium"
                onClick={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </div>

            {/* 유저 페이지로 이동 버튼 */}
            <Button
              variant="outline"
              className="w-full h-9 flex items-center justify-center gap-2"
              onClick={handleGoToUserPage}
            >
              {/* 로고 플레이스홀더 또는 아이콘 */}
              <IconReduct className="size-5" />              
              <span className="text-sm font-medium">Go to the User Page</span>
            </Button>
          </div>

          {/* 저작권 정보 */}
          <div className="flex flex-col items-center text-center text-muted-foreground text-xs leading-4">
            <p>Copyright (c) 2025 reduct</p>
            <p>All rights reserved.</p>
          </div>

          <div className="flex items-center gap-2">
            <IconReduct className="relative shrink-0 size-[24px]" />
            <IconChatGPT className="relative shrink-0 size-[24px]" />
            <IconClaude className="relative shrink-0 size-[24px]" />
            <IconGemini className="relative shrink-0 size-[24px]" />
            <IconGrok className="relative shrink-0 size-[24px]" />            
            <IconPika className="relative shrink-0 size-[24px]" />
            <IconStableAudio className="relative shrink-0 size-[24px]" />
            <IconRunway className="relative shrink-0 size-[24px]" />            
            <IconFierfly className="relative shrink-0 size-[24px]" />
            <IconPolly className="relative shrink-0 size-[24px]" />
            <IconPlayai className="relative shrink-0 size-[24px]" />
            <IconStableDiffusion className="relative shrink-0 size-[24px]" />
            <IconStableAudio className="relative shrink-0 size-[24px]" />
            <IconElevenlabs className="relative shrink-0 size-[24px]" />     
            <IconUdio className="relative shrink-0 size-[24px]" />
          </div>

        </div>
      </div>
    </div>
  )
}

