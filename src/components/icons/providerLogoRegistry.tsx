import React from "react"
import { IconChatGPT } from "./IconChatGPT"
import { IconClaude } from "./IconClaude"
import { IconElevenlabs } from "./IconElevenlabs"
import { IconGemini } from "./IconGemini"
import { IconGrok } from "./IconGrok"
import { IconPika } from "./IconPika"
import { IconPlayai } from "./IconPlayai"
import { IconPolly } from "./IconPolly"
import { IconReduct } from "./IconReduct"
import { IconRunway } from "./IconRunway"
import { IconStableAudio } from "./IconStableAudio"
import { IconStableDiffusion } from "./IconStableDiffusion"
import { IconStableVideo } from "./IconStableVideo"
import { IconUdio } from "./IconUdio"
import { LogoGoogle } from "./LogoGoogle"
import { LogoKakao } from "./LogoKakao"
import { LogoNaver } from "./LogoNaver"

export const PROVIDER_LOGO_REGISTRY = {
  chatgpt: IconChatGPT,
  claude: IconClaude,
  gemini: IconGemini,
  grok: IconGrok,
  elevenlabs: IconElevenlabs,
  playai: IconPlayai,
  polly: IconPolly,
  runway: IconRunway,
  pika: IconPika,
  stable_diffusion: IconStableDiffusion,
  stable_video: IconStableVideo,
  stable_audio: IconStableAudio,
  udio: IconUdio,
  reduct: IconReduct,
  google: LogoGoogle,
  kakao: LogoKakao,
  naver: LogoNaver,
} as const

export type ProviderLogoKey = keyof typeof PROVIDER_LOGO_REGISTRY

export const PROVIDER_LOGO_OPTIONS: Array<{ value: ProviderLogoKey; label: string }> = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "grok", label: "Grok" },
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "playai", label: "PlayAI" },
  { value: "polly", label: "Polly" },
  { value: "runway", label: "Runway" },
  { value: "pika", label: "Pika" },
  { value: "stable_diffusion", label: "Stable Diffusion" },
  { value: "stable_video", label: "Stable Video" },
  { value: "stable_audio", label: "Stable Audio" },
  { value: "udio", label: "Udio" },
  { value: "reduct", label: "Reduct" },
  { value: "google", label: "Google" },
  { value: "kakao", label: "Kakao" },
  { value: "naver", label: "Naver" },
]

export function ProviderLogo({
  logoKey,
  className,
  ...props
}: { logoKey?: string | null } & React.SVGProps<SVGSVGElement>) {
  if (!logoKey) return null
  const Icon = (PROVIDER_LOGO_REGISTRY as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>)[logoKey]
  if (!Icon) return null
  return <Icon className={className} {...props} />
}



