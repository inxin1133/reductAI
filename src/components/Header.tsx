import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Eclipse } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/useTheme"
import { isSessionExpired } from "@/lib/session"
import { withActiveTenantHeader } from "@/lib/tenantContext"
import { type PlanTier, resolveServiceTier } from "@/lib/planTier"
import { Button } from "@/components/ui/button"
import { LoginModal } from "@/components/LoginModal"
import { ProfileAvatar } from "@/lib/ProfileAvatar"

const TENANT_INFO_CACHE_KEY = "reductai:sidebar:tenantInfo:v1"

type HeaderProps = {
  className?: string
}

const PROFILE_IMAGE_CACHE_KEY = "reductai.user.profile_image_url.v1"

export function Header({ className }: HeaderProps) {
  const navigate = useNavigate()
  const { toggleTheme } = useTheme()
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const profileImageUrl = useMemo(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = String(window.localStorage.getItem(PROFILE_IMAGE_CACHE_KEY) || "").trim()
      return raw ? raw : null
    } catch {
      return null
    }
  }, [])

  const profile = useMemo(() => {
    if (typeof window === "undefined") {
      return { name: "사용자", email: "", initial: "U" }
    }
    const rawName = String(localStorage.getItem("user_name") || "").trim()
    const rawEmail = String(localStorage.getItem("user_email") || "").trim()
    const nameFromEmail = rawEmail ? rawEmail.split("@")[0] : ""
    const name = rawName || nameFromEmail || "사용자"
    const initial = Array.from(name.trim() || "U")[0] || "U"
    return { name, email: rawEmail, initial }
  }, [])


  const handleLogoClick = () => {
    if (typeof window === "undefined") return
    navigate(isSessionExpired() ? "/" : "/front-ai")
  }

  const authState = useMemo(() => {
    if (typeof window === "undefined") {
      return { isLoggedIn: false }
    }
    const token = String(localStorage.getItem("token") || "").trim()
    const expiresAt = Number(localStorage.getItem("token_expires_at") || 0)
    const email = String(localStorage.getItem("user_email") || "").trim()
    const userId = String(localStorage.getItem("user_id") || "").trim()
    const expired = !token || !expiresAt || Date.now() > expiresAt
    const isLoggedIn = !expired && !!email && !!userId
    return { isLoggedIn }
  }, [])

  const [currentTier, setCurrentTier] = useState<PlanTier>("free")
  const loadTenantTier = useCallback(() => {
    if (typeof window === "undefined" || !authState.isLoggedIn) return
    const token = localStorage.getItem("token")
    if (!token) return
    const headers = withActiveTenantHeader({ Authorization: `Bearer ${token}` })
    fetch("/api/posts/tenant/current", { headers })
      .then((res) => res.json().catch(() => null) as Promise<{ tenant_type?: string; plan_tier?: string } | null>)
      .then((data) => {
        if (data?.tenant_type != null || data?.plan_tier != null) {
          setCurrentTier(resolveServiceTier({ tenant_type: data.tenant_type, plan_tier: data.plan_tier }))
        }
      })
      .catch(() => {})
  }, [authState.isLoggedIn])

  useEffect(() => {
    if (!authState.isLoggedIn) return
    try {
      const raw = localStorage.getItem(TENANT_INFO_CACHE_KEY)
      const j = raw ? JSON.parse(raw) : null
      if (j && (j.tenant_type != null || j.plan_tier != null)) {
        setCurrentTier(resolveServiceTier({ tenant_type: j.tenant_type, plan_tier: j.plan_tier }))
      }
    } catch {
      // ignore
    }
    loadTenantTier()
  }, [authState.isLoggedIn, loadTenantTier])

  const showLoginButton = !authState.isLoggedIn

  return (
    <header className={cn("flex h-[60px] items-center justify-between px-6", className)}>
      <button
        type="button"
        className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
        onClick={handleLogoClick}
        aria-label="reduct 홈으로 이동"
      >       
        <span className="text-lg font-black">reduct</span>
      </button>
      <div className="flex items-center gap-4">
        {showLoginButton ? (
          <Button variant="ghost" onClick={() => setIsLoginModalOpen(true)}>
            로그인 및 회원가입
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <ProfileAvatar
              size={24}
              rounded="md"
              src={profileImageUrl}
              name={profile.name}
              initial={profile.initial}
              tier={currentTier}
              textClassName="text-xs text-foreground"
              showBrokenIcon
            />
            <div className="flex flex-col text-right">
              <span className="text-sm font-semibold text-foreground">{profile.name}</span>            
            </div>
          </div>
        )}
        <Button
          variant="ghost" size="icon"
          onClick={toggleTheme}
          aria-label="테마 전환"
        >
          <Eclipse className="size-4 text-foreground" />
        </Button>

      </div>
      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />
    </header>
  )
}
