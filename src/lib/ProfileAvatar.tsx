import { useEffect, useMemo, useState } from "react"
import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"

type RoundedSize = "sm" | "md" | "lg" | "xl" | "full"

type ProfileAvatarProps = {
  src?: string | null
  name?: string | null
  initial?: string | null
  size?: number
  rounded?: RoundedSize
  className?: string
  fallbackClassName?: string
  textClassName?: string
  showBrokenIcon?: boolean
  withAuthToken?: boolean
  alt?: string
}

const ROUNDING: Record<RoundedSize, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
}

const resolveInitial = (name?: string | null, initial?: string | null) => {
  const raw = String(initial || "").trim() || String(name || "").trim()
  if (!raw) return "U"
  return Array.from(raw)[0] || "U"
}

const appendAuthToken = (src: string, withAuthToken: boolean) => {
  if (!withAuthToken) return src
  if (!src.startsWith("/api/ai/media/assets/")) return src
  if (typeof window === "undefined") return src
  const token = window.localStorage.getItem("token")
  if (!token) return src
  const sep = src.includes("?") ? "&" : "?"
  return `${src}${sep}token=${encodeURIComponent(token)}`
}

export function ProfileAvatar({
  src,
  name,
  initial,
  size = 32,
  rounded = "md",
  className,
  fallbackClassName = "bg-muted-foreground",
  textClassName,
  showBrokenIcon = false,
  withAuthToken = true,
  alt = "프로필 이미지",
}: ProfileAvatarProps) {
  const [isBroken, setIsBroken] = useState(false)

  const resolvedSrc = useMemo(() => {
    const raw = String(src || "").trim()
    if (!raw) return ""
    return appendAuthToken(raw, withAuthToken)
  }, [src, withAuthToken])

  useEffect(() => {
    setIsBroken(false)
  }, [resolvedSrc])

  const fontSize = Math.max(11, Math.round(size * 0.5))
  const iconSize = Math.max(12, Math.round(size * 0.5))
  const displayInitial = resolveInitial(name, initial)

  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0 overflow-hidden",
        ROUNDING[rounded],
        fallbackClassName,
        className
      )}
      style={{ width: size, height: size }}
      aria-label={alt}
    >
      {resolvedSrc && !isBroken ? (
        <img
          src={resolvedSrc}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setIsBroken(true)}
        />
      ) : resolvedSrc && isBroken && showBrokenIcon ? (
        <ImageOff className="text-white/80" style={{ width: iconSize, height: iconSize }} />
      ) : (
        <span className={cn("text-white font-semibold", textClassName)} style={{ fontSize }}>
          {displayInitial}
        </span>
      )}
    </div>
  )
}
