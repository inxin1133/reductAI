import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Eclipse, ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/useTheme"
import { isSessionExpired } from "@/lib/session"

type HeaderProps = {
  className?: string
}

const PROFILE_IMAGE_CACHE_KEY = "reductai.user.profile_image_url.v1"

export function Header({ className }: HeaderProps) {
  const navigate = useNavigate()
  const { toggleTheme } = useTheme()
  const profileImageUrl = useMemo(() => {
    if (typeof window === "undefined") return null
    try {
      const raw = String(window.localStorage.getItem(PROFILE_IMAGE_CACHE_KEY) || "").trim()
      return raw ? raw : null
    } catch {
      return null
    }
  }, [])
  const [isProfileImageBroken, setIsProfileImageBroken] = useState(false)

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

  const profileImageSrc = useMemo(() => {
    if (!profileImageUrl) return null
    if (typeof window === "undefined") return profileImageUrl
    if (!profileImageUrl.startsWith("/api/ai/media/assets/")) return profileImageUrl
    const token = window.localStorage.getItem("token")
    if (!token) return profileImageUrl
    const sep = profileImageUrl.includes("?") ? "&" : "?"
    return `${profileImageUrl}${sep}token=${encodeURIComponent(token)}`
  }, [profileImageUrl])

  useEffect(() => {
    setIsProfileImageBroken(false)
  }, [profileImageSrc])

  const handleLogoClick = () => {
    if (typeof window === "undefined") return
    navigate(isSessionExpired() ? "/" : "/front-ai")
  }

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
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden bg-muted">
            {profileImageSrc && !isProfileImageBroken ? (
              <img
                src={profileImageSrc}
                alt="프로필 이미지"
                className="size-8 object-cover"
                onError={() => setIsProfileImageBroken(true)}
              />
            ) : profileImageSrc && isProfileImageBroken ? (
              <ImageOff className="size-4 text-muted-foreground" />
            ) : (
              <span className="text-xs font-semibold text-foreground">{profile.initial}</span>
            )}
          </div>
          <div className="flex flex-col text-right">
            <span className="text-sm font-semibold text-foreground">{profile.name}</span>            
          </div>
        </div>
        <button
          type="button"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={toggleTheme}
          aria-label="테마 전환"
        >
          <Eclipse className="size-4 text-foreground" />
        </button>

      </div>
    </header>
  )
}
