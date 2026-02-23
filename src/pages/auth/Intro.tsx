import * as React from "react"
import { Eclipse } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { useTheme } from "@/hooks/useTheme"
import { LoginModal } from "@/components/LoginModal"
import { ChatInterface } from "@/components/ChatInterface"
import { consumeSessionExpiredNotice } from "@/lib/session"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
 
interface Language {
  code: string
  name: string
  native_name: string
  is_default: boolean
  flag_emoji: string
  is_active?: boolean
}

export default function Intro() {
  const { toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);
  const [languages, setLanguages] = React.useState<Language[]>([]);
  const [currentLang, setCurrentLang] = React.useState("");
  const [sessionExpiredOpen, setSessionExpiredOpen] = React.useState(false);

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

  React.useEffect(() => {
    if (consumeSessionExpiredNotice()) {
      setSessionExpiredOpen(true);
    }
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const error = params.get("error");
    const provider = params.get("provider");
    if (error) {
      const providerLabel =
        provider === "naver" ? "네이버" : provider === "kakao" ? "카카오" : provider === "google" ? "구글" : "SSO";
      const errorMessageMap: Record<string, string> = {
        email_required: `${providerLabel} 로그인에 이메일 제공 동의가 필요합니다.`,
        token_exchange_failed: `${providerLabel} 인증 토큰 발급에 실패했습니다.`,
        invalid_state: `${providerLabel} 인증 상태값이 만료되었습니다. 다시 시도해 주세요.`,
        oauth_not_configured: `${providerLabel} OAuth 설정이 누락되었습니다.`,
        profile_missing: `${providerLabel} 프로필 정보를 가져오지 못했습니다.`,
        oauth_failed: `${providerLabel} 인증 처리 중 오류가 발생했습니다.`,
      };
      const message = errorMessageMap[error] || "SSO 로그인 중 오류가 발생했습니다.";
      console.error("SSO error:", error, provider);
      alert(message);
      navigate("/", { replace: true });
      return;
    }
    if (!token) return;

    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem("token", token);
    localStorage.setItem("token_expires_at", String(expiresAt));

    const userEmail = params.get("user_email");
    const userName = params.get("user_name");
    const userId = params.get("user_id");
    const tenantId = params.get("tenant_id");
    const platformRole = params.get("platform_role");

    if (userEmail) localStorage.setItem("user_email", userEmail);
    if (userName) localStorage.setItem("user_name", userName);
    if (userId) localStorage.setItem("user_id", userId);
    if (tenantId) localStorage.setItem("tenant_id", tenantId);
    if (platformRole) localStorage.setItem("platform_role", platformRole);

    navigate("/front-ai", { replace: true });
  }, [location.search, navigate]);

  return (
    <div className="bg-background relative w-full h-screen overflow-hidden flex justify-center font-sans">
      <div className="relative w-full max-w-[1280px] h-full flex flex-col">
        {/* Header */}
        <div className="box-border flex gap-[16px] h-[60px] items-center px-[24px] py-0 relative shrink-0 w-full">
          <div className="flex flex-[1_0_0] gap-[10px] items-center relative shrink-0">
            <p className="font-black leading-[24px] text-primary text-[16px]">
              reduct
            </p>
          </div>
          <a onClick={() => setIsLoginModalOpen(true)} className="bg-primary box-border cursor-pointer flex flex-col gap-[10px] h-[36px] items-center justify-center px-[16px] py-[8px] relative rounded-[8px] shadow-sm shrink-0">
            <div className="flex gap-[10px] items-center justify-center relative shrink-0">
              <p className="font-medium leading-[20px] text-primary-foreground text-[14px]">
                로그인 및 회원가입
              </p>
            </div>
          </a>
            {/* 언어 선택 컴포넌트 */}
            <Select value={currentLang} onValueChange={setCurrentLang}>
              <SelectTrigger className="w-[120px] h-9">
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
            
          <div 
            className="overflow-clip relative shrink-0 size-[16px] flex items-center justify-center cursor-pointer"
            onClick={toggleTheme}
          >
            <Eclipse className="size-full text-foreground" />
          </div>
        </div>

        {/* Main Content */}
        <div className="box-border flex flex-[1_0_0] flex-col gap-[40px] items-center justify-center p-[24px] relative shrink-0 w-full">
          {/* Intro Text Section */}
          <div className="flex flex-col gap-[16px] items-start justify-center relative shrink-0 w-full max-w-[800px]">
            <div className="flex items-start relative shrink-0 w-full">
              <div className="flex flex-[1_0_0] flex-col items-start justify-center relative shrink-0 text-primary">
                <p className="font-black leading-[36px] text-[30px]">
                  reduct<span className="text-primary text-[18px] font-normal">.page</span>
                </p>
                <p className="font-normal leading-[28px] text-[18px]">
                  AI Agent
                </p>
              </div>
              {/* Navigation Pills */}
              <div className="flex flex-col gap-[10px] items-start relative shrink-0 w-[300px]">
                <div className="bg-muted box-border flex h-[36px] items-center justify-center p-[3px] relative rounded-[8px] shrink-0 w-full">
                  <div className="bg-background border border-border box-border flex flex-[1_0_0] flex-col gap-[10px] h-[29px] items-center justify-center px-[8px] py-[4px] relative rounded-[6px] shadow-sm shrink-0">
                    <div className="flex gap-[10px] items-center justify-center relative shrink-0">
                      <p className="font-medium leading-[20px] text-foreground text-[14px]">
                        프론트AI
                      </p>
                    </div>
                  </div>
                  {['페이지', '팀/그룹', '요금제'].map((item) => (
                    <div key={item} className="box-border flex flex-[1_0_0] flex-col gap-[10px] h-[29px] items-center justify-center px-[8px] py-[4px] relative rounded-[6px] shrink-0 cursor-pointer hover:bg-background/50 transition-colors">
                      <div className="flex gap-[10px] items-center justify-center relative shrink-0">
                        <p className="font-medium leading-[20px] text-foreground text-[14px]">
                          {item}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Feature List */}
            <div className="flex flex-col gap-2 w-full">
              <p className="text-left font-medium leading-[20px] text-card-foreground text-[14px] overflow-hidden text-ellipsis whitespace-nowrap">
                🧭  하나의 서비스에서 모든 다양한 생성형 AI를 전환하여 사용할 수 있습니다.
              </p>
              <p className="text-left font-medium leading-[20px] text-card-foreground text-[14px] overflow-hidden text-ellipsis whitespace-nowrap">
                🎥  이미지, 영상, 음악, 음성, 프로그램 코딩에 전문화된 모델을 자유롭게 선택해 사용할 수 있습니다.
              </p>
              <p className="text-left font-medium leading-[20px] text-card-foreground text-[14px] overflow-hidden text-ellipsis whitespace-nowrap">
                📚 나만의 페이지에 생성된 AI의 답변을 자유롭게 저장하고 편집할 수 있습니다. 나만의 지식 라이브러리를 구성해보세요.
              </p>
              <p className="text-left font-medium leading-[20px] text-card-foreground text-[14px] overflow-hidden text-ellipsis whitespace-nowrap">
                👫 팀/그룹을 구성해 유료 LLM모델을 공유해 사용할 수 있습니다.
              </p>
              <p className="text-left font-medium leading-[20px] text-card-foreground text-[14px] overflow-hidden text-ellipsis whitespace-nowrap">
                💰  물론, 가장 중요한 것은 비용을 줄일 수 있다는 것 입니다.
              </p>
            </div>
          </div>

          {/* Chat Interface */}
          <ChatInterface />
        </div>
      </div>
      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />
      <AlertDialog open={sessionExpiredOpen} onOpenChange={setSessionExpiredOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>로그 세션이 종료되었습니다.</AlertDialogTitle>
            <AlertDialogDescription>다시 로그인해 주세요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction autoFocus>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
