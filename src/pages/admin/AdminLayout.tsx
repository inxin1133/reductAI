import { Outlet, useNavigate } from "react-router-dom"
import { AdminSidebar } from "@/components/AdminSidebar"
import { AdminHeader } from "@/components/AdminHeader"
import { AdminHeaderActionProvider } from "@/contexts/AdminHeaderActionContext"
import { useEffect } from "react"

export default function AdminLayout() { 
  const navigate = useNavigate()

  // 간단한 세션/토큰 검사 (없거나 만료된 경우 접근 차단)
  useEffect(() => {
    const token = localStorage.getItem("token")
    const expiresAt = Number(localStorage.getItem("token_expires_at") || 0)
    const isExpired = !expiresAt || Date.now() > expiresAt

    if (!token || isExpired) {
      // 보안상 토큰/세션 클리어
      localStorage.removeItem("token")
      localStorage.removeItem("token_expires_at")
      localStorage.removeItem("user_email")
      localStorage.removeItem("user_id")

      alert("세션이 만료되었거나 로그인 정보가 없습니다. 다시 로그인해주세요.")
      navigate("/admin/login", { replace: true })
    }
  }, [navigate])

  return (
    <div className="bg-background flex w-full h-screen overflow-hidden">
      {/* Admin Sidebar */}
      <AdminSidebar />

      {/* Main Content Area */}
      <AdminHeaderActionProvider>
        <div className="flex flex-col flex-1 h-full min-w-0">
          {/* Admin Header */}
          <AdminHeader />

          {/* Page Content */}
          <div className="flex-1 overflow-auto p-6 pt-1 bg-background">
            <Outlet />
          </div>
        </div>
      </AdminHeaderActionProvider>
    </div>
  )
}

