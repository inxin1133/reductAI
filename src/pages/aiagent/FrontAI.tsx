import * as React from "react"
import { AppShell } from "@/components/layout/AppShell"
import { useNavigate } from "react-router-dom"
import { handleSessionExpired, isSessionExpired, resetSessionExpiredGuard } from "@/lib/session"
import { ChatInterface } from "@/components/ChatInterface"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Language {
  code: string
  name: string
  native_name: string
  is_default: boolean
  flag_emoji: string
  is_active?: boolean
}

export default function FrontAI() {
  const navigate = useNavigate()
  const [languages, setLanguages] = React.useState<Language[]>([]);
  const [currentLang, setCurrentLang] = React.useState("");
  const LANGUAGE_STORAGE_KEY = "reductai.language.v1"
  const LAST_SELECTION_KEY = "reductai.frontai.lastSelection.v1"
  
  const readSelectionFromStorage = () => {
    try {
      const raw = localStorage.getItem(LAST_SELECTION_KEY) || sessionStorage.getItem(LAST_SELECTION_KEY)
      if (!raw) return { modelApiId: "", providerSlug: "", modelType: "" }
      const parsed = JSON.parse(raw) as { modelApiId?: string; providerSlug?: string; modelType?: string }
      return {
        modelApiId: typeof parsed?.modelApiId === "string" ? parsed.modelApiId : "",
        providerSlug: typeof parsed?.providerSlug === "string" ? parsed.providerSlug : "",
        modelType: typeof parsed?.modelType === "string" ? parsed.modelType : "",
      }
    } catch {
      return { modelApiId: "", providerSlug: "", modelType: "" }
    }
  }
  
  const [selection, setSelection] = React.useState<{ modelApiId: string; providerSlug: string; modelType: string }>(() => readSelectionFromStorage())
  const selectionRef = React.useRef(selection)
  React.useEffect(() => {
    selectionRef.current = selection
  }, [selection])
  const [selectionVersion, setSelectionVersion] = React.useState(0)
  // 토큰이 없거나 만료된 경우 접근 차단
  React.useEffect(() => {
    if (isSessionExpired()) {
      handleSessionExpired(navigate)
      return
    }
    resetSessionExpiredGuard()
  }, [navigate])

  React.useEffect(() => {
    const onFocus = () => {
      const next = readSelectionFromStorage()
      setSelection((prev) => {
        if (prev.modelApiId === next.modelApiId && prev.providerSlug === next.providerSlug && prev.modelType === next.modelType) {
          return prev
        }
        selectionRef.current = next
        setSelectionVersion((v) => v + 1)
        return next
      })
    }
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return
      const next = readSelectionFromStorage()
      setSelection((prev) => {
        if (prev.modelApiId === next.modelApiId && prev.providerSlug === next.providerSlug && prev.modelType === next.modelType) {
          return prev
        }
        selectionRef.current = next
        setSelectionVersion((v) => v + 1)
        return next
      })
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  React.useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const res = await fetch("/api/i18n/languages");
        if (res.ok) {
          const data = await res.json();
          const activeLangs = (data || []).filter((l: Language) => l.is_active !== false);
          setLanguages(activeLangs);

          if (activeLangs.length > 0) {
            const saved = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || "").trim()
            const savedValid = saved && activeLangs.some((l: Language) => l.code === saved)
            const def = activeLangs.find((l: Language) => l.is_default)?.code || activeLangs[0].code
            const next = savedValid ? saved : def
            setCurrentLang(next)
            if (next) {
              localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch languages:", error);
      }
    };
    fetchLanguages();
  }, []);

  React.useEffect(() => {
    const handleStorage = (ev: StorageEvent) => {
      if (ev.key !== LANGUAGE_STORAGE_KEY) return
      const next = String(ev.newValue || "").trim()
      if (!next) return
      setCurrentLang(next)
    }
    const handleCustom = (ev: Event) => {
      const next = (ev as CustomEvent<{ lang?: string }>).detail?.lang
      if (!next) return
      setCurrentLang(String(next))
    }
    window.addEventListener("storage", handleStorage)
    window.addEventListener("reductai:language", handleCustom as EventListener)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("reductai:language", handleCustom as EventListener)
    }
  }, [])

  return (
    <AppShell
      headerContent={
        <Select
          value={currentLang}
          onValueChange={(value) => {
            setCurrentLang(value)
            localStorage.setItem(LANGUAGE_STORAGE_KEY, value)
            window.dispatchEvent(new CustomEvent("reductai:language", { detail: { lang: value } }))
          }}
        >
          <SelectTrigger className="w-[120px] h-9 bg-background">
            <SelectValue placeholder="언어 선택" />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.flag_emoji} {lang.native_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
        {/* Main Body - 메인 바디 */}
      <div className="flex flex-1 flex-col gap-[40px] items-center justify-center px-[24px] pb-[24px] pt-[84px] relative w-full h-full">
        <ChatInterface
          key={`frontai:${selectionVersion}`}
          // FrontAI에서는 "첫 질문 시작"만 하고, 실제 대화는 Timeline에서 이어가도록 합니다.
          submitMode="emit"
          initialSelectedModel={selection.modelApiId || undefined}
          initialProviderSlug={selection.providerSlug || undefined}
          initialModelType={(selection.modelType as "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code") || undefined}
          onSelectionChange={(selection) => {
            if (!selection.modelApiId || !selection.providerSlug) return
            const next = {
              modelApiId: selection.modelApiId || "",
              providerSlug: selection.providerSlug || "",
              modelType: selection.modelType || "",
            }
            const prev = selectionRef.current
            if (
              prev.modelApiId === next.modelApiId &&
              prev.providerSlug === next.providerSlug &&
              prev.modelType === next.modelType
            ) {
              return
            }
            selectionRef.current = next
            try {
              localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(next))
              sessionStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(next))
            } catch {
              // ignore storage issues
            }
          }}
          onSubmit={({ input, providerSlug, model, modelType, options, attachments }) => {
            try {
              localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify({
                modelApiId: model || "",
                providerSlug: providerSlug || "",
                modelType: modelType || "",
              }))
              sessionStorage.setItem(LAST_SELECTION_KEY, JSON.stringify({
                modelApiId: model || "",
                providerSlug: providerSlug || "",
                modelType: modelType || "",
              }))
            } catch {
              // ignore storage issues
            }
            const requestId =
              typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `${Date.now()}_${Math.random().toString(16).slice(2)}`
            navigate("/timeline", {
              state: {
                initial: {
                  requestId,
                  input,
                  providerSlug,
                  model,
                  modelType,
                  options: options || null,
                  attachments: attachments || null,
                  sessionLanguage: currentLang || null,
                },
              },
            })
          }}
          sessionLanguage={currentLang || undefined}
        />
      </div>
    </AppShell>
  );
}
