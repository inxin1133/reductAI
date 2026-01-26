import * as React from "react"
import { AppShell } from "@/components/layout/AppShell"
import { useNavigate } from "react-router-dom"
import { useRef } from "react"
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
  const alertShownRef = useRef(false)
  const [languages, setLanguages] = React.useState<Language[]>([]);
  const [currentLang, setCurrentLang] = React.useState("");
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
  const [selectionVersion, setSelectionVersion] = React.useState(0)

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

  React.useEffect(() => {
    const onFocus = () => {
      const next = readSelectionFromStorage()
      setSelection((prev) => {
        if (prev.modelApiId === next.modelApiId && prev.providerSlug === next.providerSlug && prev.modelType === next.modelType) {
          return prev
        }
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
            const def = activeLangs.find((l: Language) => l.is_default)?.code || activeLangs[0].code;
            setCurrentLang(def);
          }
        }
      } catch (error) {
        console.error("Failed to fetch languages:", error);
      }
    };
    fetchLanguages();
  }, []);

  return (
    <AppShell
      headerContent={
        <Select value={currentLang} onValueChange={setCurrentLang}>
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
      <div className="flex flex-1 flex-col gap-[40px] items-center justify-center p-[24px] relative w-full h-full">
        <ChatInterface
          key={`${selection.modelType || "text"}:${selection.providerSlug || "none"}:${selection.modelApiId || "none"}:${selectionVersion}`}
          // FrontAI에서는 "첫 질문 시작"만 하고, 실제 대화는 Timeline에서 이어가도록 합니다.
          submitMode="emit"
          forceSelectionSync
          selectionOverride={{
            modelType: (selection.modelType as "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code") || undefined,
            providerSlug: selection.providerSlug || undefined,
            modelApiId: selection.modelApiId || undefined,
          }}
          initialSelectedModel={selection.modelApiId || undefined}
          initialProviderSlug={selection.providerSlug || undefined}
          initialModelType={(selection.modelType as "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code") || undefined}
          onSelectionChange={(selection) => {
            if (!selection.modelApiId || !selection.providerSlug) return
            try {
              localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify({
                modelApiId: selection.modelApiId || "",
                providerSlug: selection.providerSlug || "",
                modelType: selection.modelType || "",
              }))
              sessionStorage.setItem(LAST_SELECTION_KEY, JSON.stringify({
                modelApiId: selection.modelApiId || "",
                providerSlug: selection.providerSlug || "",
                modelType: selection.modelType || "",
              }))
            } catch {
              // ignore storage issues
            }
            setSelection({
              modelApiId: selection.modelApiId || "",
              providerSlug: selection.providerSlug || "",
              modelType: selection.modelType || "",
            })
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
                  sessionLanguage: currentLang || null,
                  attachments: attachments || null,
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
