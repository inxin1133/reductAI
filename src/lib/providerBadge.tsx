import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ProviderStyle = {
  label: string
  className: string
}

const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  kakao: {
    label: "Kakao",
    className: "bg-[#FEE500] text-black border-transparent",
  },
  naver: {
    label: "Naver",
    className: "bg-[#03C75A] text-white border-transparent",
  },
  google: {
    label: "Google",
    className: "bg-[#4285F4] text-white border-transparent",
  },
  local: {
    label: "Email",
    className: "bg-muted text-foreground border-transparent",
  },
}

export function getProviderLabel(provider?: string | null) {
  if (!provider) return ""
  const key = provider.toLowerCase()
  return PROVIDER_STYLES[key]?.label || provider
}

export function ProviderBadge({
  provider,
  className,
}: {
  provider?: string | null
  className?: string
}) {
  if (!provider) return null
  const key = provider.toLowerCase()
  const style = PROVIDER_STYLES[key]
  const label = style?.label || provider
  return (
    <Badge className={cn("border-0", style?.className, className)}>
      {label}
    </Badge>
  )
}
