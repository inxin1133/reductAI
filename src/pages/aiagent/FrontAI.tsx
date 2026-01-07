import * as React from "react"
import { Sidebar } from "@/components/Sidebar"
import { UserHeader } from "@/components/UserHeader"
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
    <div className="bg-background relative w-full h-screen overflow-hidden flex font-sans">
      
      {/* Sidebar (GNB) */}
      <Sidebar />


      {/* Main Content - 메인 컨텐츠 시작 */}
      <div className="flex-1 flex flex-col h-full w-full bg-background relative pt-[56px] md:pt-0">
        {/* Top Bar */}
        <UserHeader>
           {/* 언어 선택 컴포넌트 */}
           <Select value={currentLang} onValueChange={setCurrentLang}>
             <SelectTrigger className="w-[120px] h-9 bg-background">
               <SelectValue placeholder="언어 선택" />
             </SelectTrigger>
             <SelectContent>
               {languages.map(lang => (
                 <SelectItem key={lang.code} value={lang.code}>
                   {lang.flag_emoji} {lang.native_name}
                 </SelectItem>
               ))}
             </SelectContent>
           </Select>
           
        </UserHeader>

        {/* Main Body - 메인 바디 */}        
        <div className="flex flex-[1_0_0] flex-col gap-[40px] items-center justify-center p-[24px] relative shrink-0 w-full">
          
          <ChatInterface
            // FrontAI에서는 "첫 질문 시작"만 하고, 실제 대화는 Timeline에서 이어가도록 합니다.
            submitMode="emit"
            onSubmit={({ input, providerSlug, model, modelType, options }) => {
              const requestId =
                typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                  ? crypto.randomUUID()
                  : `${Date.now()}_${Math.random().toString(16).slice(2)}`
              navigate("/timeline", {
                state: {
                  initial: { requestId, input, providerSlug, model, modelType, options: options || null, sessionLanguage: currentLang || null },
                },
              })
            }}
            sessionLanguage={currentLang || undefined}
          />

        </div>
      </div>

    </div>
  );
}
