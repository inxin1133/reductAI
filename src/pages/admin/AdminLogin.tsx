import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTheme } from "@/hooks/useTheme"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Eclipse } from "lucide-react"

export default function AdminLogin() {
  const navigate = useNavigate()
  const { toggleTheme } = useTheme()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleLogin = () => {
    // TODO: Implement admin login logic  
    console.log("Admin Login", email, password)
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
                />
              </div>

              {/* 로그인 버튼 */}
              <Button 
                className="w-full h-9 text-sm font-medium"
                onClick={handleLogin}
              >
                Login
              </Button>
            </div>

            {/* 유저 페이지로 이동 버튼 */}
            <Button
              variant="outline"
              className="w-full h-9 flex items-center justify-center gap-2"
              onClick={handleGoToUserPage}
            >
              {/* 로고 플레이스홀더 또는 아이콘 */}
              <div className="bg-foreground text-background size-5 flex items-center justify-center rounded-sm font-bold text-[10px]">
                RDT
              </div>
              <span className="text-sm font-medium">Go to the User Page</span>
            </Button>
          </div>

          {/* 저작권 정보 */}
          <div className="flex flex-col items-center text-center text-muted-foreground text-xs leading-4">
            <p>Copyright (c) 2025 reduct</p>
            <p>All rights reserved.</p>
          </div>

        </div>
      </div>
    </div>
  )
}

