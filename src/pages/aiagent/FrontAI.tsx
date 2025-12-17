import * as React from "react"
import { cn } from "@/lib/utils"
import { 
   Mic, 
   ChevronDown,    
   Plus 
} from "lucide-react"
import { Sidebar } from "@/components/Sidebar"
import { UserHeader } from "@/components/UserHeader"
import { useNavigate } from "react-router-dom"
import { useRef } from "react"

const imgIconsGrok = "https://www.figma.com/api/mcp/asset/956f5384-69cd-4631-9bb8-3d0b71c7e689";
const imgVector3 = "https://www.figma.com/api/mcp/asset/5cbcace5-43b3-4afa-85c7-a3b42cfb70c7";
const imgVector4 = "https://www.figma.com/api/mcp/asset/b0ab5da9-42de-45c5-8d8f-390ae35266c4";
const imgChatGpt = "https://www.figma.com/api/mcp/asset/e82c08a0-9465-4100-9657-3ceaf4d343f1";




type PaidTokenProps = {
  className?: string;
  selected?: "personal" | "team/group";
};

function PaidToken({ className }: PaidTokenProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="bg-primary flex gap-[10px] items-center justify-center px-[12px] py-[6px] rounded-full shadow-sm shrink-0">
        <p className="font-medium leading-[20px] text-primary-foreground text-[14px]">
          개인:Pro
        </p>
        <div className="bg-primary-foreground flex flex-col gap-[10px] h-[20px] items-center justify-center px-[4px] py-[2px] rounded-full shrink-0">
          <p className="font-medium leading-[16px] text-primary text-[12px] font-mono">
            20.000
          </p>
        </div>
      </div>
      <button className="bg-primary-foreground border border-border cursor-pointer flex gap-[10px] items-center justify-center px-[12px] py-[6px] rounded-full shadow-sm shrink-0 hover:bg-accent/50" type="button">
        <p className="font-medium leading-[20px] text-primary text-[14px]">
          KIA:Premium
        </p>
        <div className="bg-primary flex flex-col gap-[10px] h-[20px] items-center justify-center px-[4px] py-[2px] rounded-full shrink-0">
          <p className="font-medium leading-[16px] text-primary-foreground text-[12px]">
            20.000
          </p>
        </div>
      </button>
    </div>
  );
}

type MicButtonProps = {
  className?: string;
  chat?: boolean;
};

function MicButton({ className }: MicButtonProps) {
  return (
    <button className={cn("flex items-center justify-center", className)}>
      <div className="overflow-clip relative shrink-0 size-[24px] flex items-center justify-center">
        <Mic className="size-full" />
      </div>
    </button>
  );
}

type ModeButtonProps = {
  className?: string;
  label?: string;
  hover?: boolean;
};

function ModeButton({ className, label = "내용" }: ModeButtonProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="content-stretch flex flex-[1_0_0] gap-[10px] items-center min-h-px min-w-px relative shrink-0">
        <p className="font-[family-name:var(--font-sans,'Inter','Noto_Sans_KR',sans-serif)] font-normal leading-[20px] not-italic relative shrink-0 text-foreground text-[14px]">
          {label}
        </p>
      </div>
      <div className="overflow-clip relative shrink-0 size-[24px] flex items-center justify-center">
        <ChevronDown className="size-full" />
      </div>
    </div>
  );
}

function IconsGrok({ className }: { className?: string }) {
  return (
    <div className={className}>
      <img alt="Grok" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgIconsGrok} />
    </div>
  );
}

function IconsClaude({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="absolute bottom-0 left-[0.04%] right-[0.04%] top-0">
        <div className="absolute inset-0">
          <img alt="Claude" className="block max-w-none size-full" src={imgVector4} />
        </div>
      </div>
    </div>
  );
}

function IconsGemini({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="absolute inset-[8.34%_8.33%]">
        <div className="absolute inset-0">
          <img alt="Gemini" className="block max-w-none size-full" src={imgVector3} />
        </div>
      </div>
    </div>
  );
}

export default function FrontAI() {
  const navigate = useNavigate()
  const alertShownRef = useRef(false)

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

  return (
    <div className="bg-background relative w-full h-screen overflow-hidden flex font-sans">
      
      
      
      {/* Sidebar (GNB) */}
      <Sidebar />


      {/* Main Content - 메인 컨텐츠 시작 */}
      <div className="flex-1 flex flex-col h-full bg-background relative">
        {/* Top Bar */}
        <UserHeader />

        {/* Main Body - 메인 바디 */}
        <div className="flex-1 flex flex-col items-center p-6 pt-3 gap-6 overflow-y-auto">
          <div className="w-full max-w-[800px] flex flex-col gap-4 items-center">
             {/* Token Display - 토큰 디스플레이 */}
             <div className="w-full flex items-center gap-4">
                <PaidToken />
             </div>

             {/* Tab Navigation - 탭 네비게이션 */}
             <div className="w-full">
                <div className="w-full bg-muted rounded-lg p-0.5 flex h-9 items-center">
                   <div className="flex-1 h-[29px] bg-background rounded-md shadow-sm flex items-center justify-center cursor-default">
                      <span className="text-sm font-medium text-foreground">채팅</span>
                   </div>
                   {['이미지', '영상', '음악', '음성', '추출'].map((tab) => (
                      <div key={tab} className="flex-1 h-[29px] flex items-center justify-center cursor-pointer hover:bg-background/50 rounded-md transition-colors">
                         <span className="text-sm font-medium text-foreground">{tab}</span>
                      </div>
                   ))}
                </div>
             </div>

             {/* AI Models Grid - AI 모델 그리드 */}
             <div className="w-full flex gap-4 items-start">
                {/* ChatGPT - 채팅GPT */}
                <div className="flex-1 bg-accent border border-primary rounded-lg p-4 flex gap-3 items-center overflow-hidden">
                    <div className="size-8 bg-primary rounded flex items-center justify-center shrink-0">
                       <div className="size-6 relative">
                          <img src={imgChatGpt} alt="ChatGPT" className="absolute inset-0 size-full object-contain" />
                       </div>
                    </div>
                    <div className="flex flex-col flex-1 gap-1">
                       <span className="text-sm font-medium text-card-foreground">ChatGPT</span>
                       <span className="text-sm text-muted-foreground">OpenAI</span>
                    </div>
                    <div className="border border-ring rounded-full shadow-sm shrink-0 size-4 relative flex items-center justify-center">
                       <div className="size-2 rounded-full bg-primary" />
                    </div>
                </div>

                {/* Gemini - 지미니 */}
                <div className="flex-1 bg-card border border-border rounded-lg p-4 flex gap-3 items-center overflow-hidden hover:bg-accent/50 cursor-pointer transition-colors">
                    <div className="size-8 bg-muted border border-border rounded flex items-center justify-center shrink-0">
                       <IconsGemini className="size-6 relative shrink-0" />
                    </div>
                    <div className="flex flex-col flex-1 gap-1">
                       <span className="text-sm font-medium text-card-foreground">Gemini</span>
                       <span className="text-sm text-muted-foreground">Google</span>
                    </div>
                    <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-4" />
                </div>

                 {/* Claude - 클로이드 */}
                 <div className="flex-1 bg-card border border-border rounded-lg p-4 flex gap-3 items-center overflow-hidden hover:bg-accent/50 cursor-pointer transition-colors">
                    <div className="size-8 bg-muted border border-border rounded flex items-center justify-center shrink-0">
                       <IconsClaude className="size-6 relative shrink-0" />
                    </div>
                    <div className="flex flex-col flex-1 gap-1">
                       <span className="text-sm font-medium text-card-foreground">Claude</span>
                       <span className="text-sm text-muted-foreground">Anthropic</span>
                    </div>
                    <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-4" />
                </div>

                 {/* Grok - 그록 */}
                 <div className="flex-1 bg-card border border-border rounded-lg p-4 flex gap-3 items-center overflow-hidden hover:bg-accent/50 cursor-pointer transition-colors">
                    <div className="size-8 bg-muted border border-border rounded flex items-center justify-center shrink-0">
                       <IconsGrok className="size-6 relative shrink-0" />
                    </div>
                    <div className="flex flex-col flex-1 gap-1">
                       <span className="text-sm font-medium text-card-foreground">Grok</span>
                       <span className="text-sm text-muted-foreground">xAI</span>
                    </div>
                    <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-4" />
                </div>
             </div>

             {/* Chat Interface Area - 채팅 인터페이스 영역 */}
             <div className="w-full flex flex-col gap-4 items-center mt-4">
                <div className="flex gap-2.5 items-center text-sm">
                   <span className="font-medium text-card-foreground">ChatGPT</span>
                   <span className="text-muted-foreground">다재다능하고 안정적인 '표준'이며, 코드와 광범위한 통합에 강합니다.</span>
                </div>

                {/* Search Bar - 검색 바 */}
                <div className="w-full bg-background border border-border rounded-3xl p-4 pb-3 shadow-sm flex flex-col gap-2.5">
                   <input 
                      type="text" 
                      placeholder="무엇이든 물어보세요" 
                      className="w-full border-none outline-none text-base placeholder:text-muted-foreground bg-transparent"
                   />
                   <div className="flex items-center gap-4 mt-2">
                      <div className="flex-1 flex items-center gap-2.5">
                         <div className="size-6 relative cursor-pointer hover:opacity-70 flex items-center justify-center">
                            <Plus className="size-full" />
                         </div>
                      </div>
                      <ModeButton className="bg-secondary hover:bg-secondary/80 cursor-pointer px-4 py-2 rounded-lg w-[130px] justify-center" label="빠른 모드" />
                      <MicButton className="bg-primary hover:bg-primary/90 text-primary-foreground size-7 rounded-full p-0" />
                   </div>
                </div>

                {/* Action Badges - 액션 배지 */}
                <div className="w-full flex gap-1">
                   <div className="bg-secondary px-2.5 py-0.5 rounded-lg cursor-pointer hover:bg-secondary/80">
                      <span className="text-xs font-medium text-secondary-foreground">심층 리서치를 작성해줘</span>
                   </div>
                   <div className="bg-secondary px-2.5 py-0.5 rounded-lg cursor-pointer hover:bg-secondary/80">
                      <span className="text-xs font-medium text-secondary-foreground">잘 생각해줘</span>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
