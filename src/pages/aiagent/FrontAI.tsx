import * as React from "react"
import { Sidebar } from "@/components/Sidebar"
import { UserHeader } from "@/components/UserHeader"
import { useNavigate } from "react-router-dom"
import { useRef } from "react"
import { ChatInterface } from "@/components/ChatInterface"



export default function FrontAI() {
  const navigate = useNavigate()
  const alertShownRef = useRef(false)

  // 토큰이 없거나 만료된 경우 접근 차단 및 경고 표시
  React.useEffect(() => {
    const token = localStorage.getItem("token")
    const expiresAt = Number(localStorage.getItem("token_expires_at") || 0)
    const isExpired = !expiresAt || Date.now() > expiresAt

    if (!token || isExpired) {
      if (!alertShownRef.current) {
        alertShownRef.current = true
        localStorage.removeItem("token")
        localStorage.removeItem("token_expires_at")
        localStorage.removeItem("user_email")
        localStorage.removeItem("user_id")
        alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.")
        navigate("/", { replace: true })
      }
      return
    }

    // 토큰이 정상인 경우 경고 상태 초기화
    alertShownRef.current = false
  }, [navigate])

  return (
    <div className="bg-background relative w-full h-screen overflow-hidden flex font-sans">
      
      
      
      {/* Sidebar (GNB) */}
      <Sidebar />


      {/* Main Content - 메인 컨텐츠 시작 */}
      <div className="flex-1 flex flex-col h-full w-full bg-background relative">
        {/* Top Bar */}
        <UserHeader />

        {/* Main Body - 메인 바디 */}        
        <div className="flex flex-[1_0_0] flex-col gap-[40px] items-center justify-center p-[24px] relative shrink-0 w-full">
          
          <ChatInterface />

        </div>
      </div>

    </div>
  );
}
