import * as React from "react"
import { cn } from "@/lib/utils"
import { Mic, ChevronDown, Lock, Plus, ChevronLeft, ChevronRight, Settings2, ChevronsRight, ChevronsLeft, ChevronsUp, Ellipsis, ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel, 
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"


import { IconChatGPT } from "@/components/icons/IconChatGPT"
import { IconClaude } from "@/components/icons/IconClaude"
import { IconGemini } from "@/components/icons/IconGemini"
import { IconGrok } from "@/components/icons/IconGrok"
import { IconStableDiffusion } from "@/components/icons/IconStableDiffusion"
import { IconFierfly } from "@/components/icons/IconFierfly"
import { IconRunway } from "@/components/icons/IconRunway"
import { IconPika } from "@/components/icons/IconPika"
import { IconStableVideo } from "@/components/icons/IconStableVideo"
import { IconUdio } from "@/components/icons/IconUdio"
import { IconStableAudio } from "@/components/icons/IconStableAudio"
import { IconElevenlabs } from "@/components/icons/IconElevenlabs"
import { IconPolly } from "@/components/icons/IconPolly"
import { IconPlayai } from "@/components/icons/IconPlayai"

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


interface ChatInterfaceProps {
  // Future props for user/permission control can be added here
  className?: string;
}

// AI 모델 타입 정의
type AIModelId = 'chatgpt' | 'gemini' | 'claude' | 'grok' | 'nanobanana' | 'dalle' | 'stable-diffusion' | 'fierfly' | 'sora' | 'runway' | 'veo' | 'pika' | 'stable-video' | 'musiclm' | 'udio' | 'stable-audio' | 'jukebox' | 'elevenlabs' | 'amazon-polly' | 'playai' | 'cloud-text-to-speech' | 'copilot';

// 탭 타입 정의
type TabType = 'chat' | 'extract' | 'image' | 'video' | 'music' | 'voice' | 'code';

interface AIModelConfig {
  id: AIModelId;
  name: string;
  provider: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColorClass?: string;
  isLocked?: boolean;
  status?: 'active' | 'inactive'; // 모델 상태
  models: string[]; // 드롭다운에 표시될 구체적인 모델명 리스트
  category: TabType[]; // 해당 모델이 속한 카테고리
  hasOptions?: boolean; // 옵션 패널 존재 여부
}

// 아이콘 래퍼들
const InitialGemini = ({ className }: { className?: string }) => <div className={className}>G</div>;
const InitialClaude = ({ className }: { className?: string }) => <div className={className}>C</div>;
const InitialGrok = ({ className }: { className?: string }) => <div className={className}>G</div>;
const InitialChatGPT = ({ className }: { className?: string }) => <div className={className}>D</div>;
const InitialStableDiffusion = ({ className }: { className?: string }) => <div className={className}>S</div>;
const InitialFierfly = ({ className }: { className?: string }) => <div className={className}>F</div>;
const InitialRunway = ({ className }: { className?: string }) => <div className={className}>R</div>;
const InitialPika = ({ className }: { className?: string }) => <div className={className}>P</div>;
const InitialStableVideo = ({ className }: { className?: string }) => <div className={className}>V</div>;
const InitialUdio = ({ className }: { className?: string }) => <div className={className}>U</div>;
const InitialStableAudio = ({ className }: { className?: string }) => <div className={className}>A</div>;
const InitialElevenlabs = ({ className }: { className?: string }) => <div className={className}>E</div>;
const InitialPolly = ({ className }: { className?: string }) => <div className={className}>P</div>;
const InitialPlayai = ({ className }: { className?: string }) => <div className={className}>P</div>;
const IconCopilot = ({ className }: { className?: string }) => <div className={className}>C</div>;


const AI_MODELS: AIModelConfig[] = [
  // Chat Models
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    provider: 'OpenAI',
    description: "다재다능하고 안정적인 '표준'이며, 코드와 광범위한 통합에 강합니다.",
    icon: typeof IconChatGPT !== "undefined" ? IconChatGPT : InitialChatGPT,
    category: ['chat', 'code', 'extract'],
    status: 'active',
    models: [
      "GPT-5.1", "GPT-5.1-mini", "GPT-5-mini", "GPT-4.5", "GPT-4o", "GPT-4o-mini", "GPT-4", "GPT-3.5-turbo", "GPT-3.5-turbo-mini"
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    provider: 'Google',
    description: "Google의 최신 멀티모달 모델로, 텍스트와 이미지 처리에 뛰어납니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini,
    category: ['chat', 'code', 'extract'],
    status: 'active',
    models: ["Gemini 1.5 Pro", "Gemini 1.5 Flash", "Gemini 1.0 Pro"]
  },
  {
    id: 'claude',
    name: 'Claude',
    provider: 'Anthropic',
    description: "안전하고 신뢰할 수 있는 AI로, 긴 문맥 이해와 자연스러운 대화에 강점이 있습니다.",
    icon: typeof IconClaude !== "undefined" ? IconClaude : InitialClaude,
    isLocked: true,
    category: ['chat', 'code', 'extract'],
    status: 'active',
    models: ["Claude 3 Opus", "Claude 3 Sonnet", "Claude 3 Haiku"]
  },
  {
    id: 'grok',
    name: 'Grok',
    provider: 'xAI',
    description: "실시간 정보 접근이 가능하며, 재치있고 유머러러스한 답변을 제공합니다.",
    icon: typeof IconGrok !== "undefined" ? IconGrok : InitialGrok,
    isLocked: true,
    category: ['chat', 'code'],
    status: 'active',
    models: ["Grok-1", "Grok-2", "Grok-3"]
  },

  // Image Models
  {
    id: 'nanobanana',
    name: 'Nano Banana',
    provider: 'Google',
    description: "Nano Banana는 예술적이고 고품질의 이미지를 생성하는 데 특화되어 있습니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini,
    category: ['image'],
    status: 'active',
    models: ["Nano Banana Pro"],
    hasOptions: true
  },
  {
    id: 'dalle',
    name: 'DALL·E',
    provider: 'OpenAI',
    description: "프롬프트에 충실한 이미지를 생성하며, 편집 기능이 강력합니다.",
    icon: typeof IconChatGPT !== "undefined" ? IconChatGPT : InitialChatGPT,
    category: ['image'],
    status: 'active',
    models: ["DALL·E 3", "DALL·E 2"],
    hasOptions: true
  },
  {
    id: 'stable-diffusion',
    name: 'Stable Diffusion',
    provider: 'Stability AI',
    description: "오픈소스 기반으로 다양한 스타일과 커스터마이징이 가능합니다.",
    icon: typeof IconStableDiffusion !== "undefined" ? IconStableDiffusion : InitialStableDiffusion,
    category: ['image', 'extract'],
    status: 'active',
    models: ["SD3", "SDXL 1.0", "SD 1.5"],
    hasOptions: true
  },
  {
    id: 'fierfly',
    name: 'Fierfly',
    provider: 'Adobe',
    description: "Adobe의 최신 멀티모달 모델로, 텍스트와 이미지 처리에 뛰어납니다.",
    icon: typeof IconFierfly !== "undefined" ? IconFierfly : InitialFierfly,
    category: ['image'],
    status: 'active',
    models: ["SD3", "SDXL 1.0", "SD 1.5"],
    hasOptions: true
  },


  // Video Models
  {
    id: 'sora',
    name: 'Sora',
    provider: 'OpenAI',
    description: "텍스트에서 고화질의 비디오를 생성하는 혁신적인 모델입니다.",
    icon: typeof IconChatGPT !== "undefined" ? IconChatGPT : InitialChatGPT,
    category: ['video'],
    status: 'active',
    models: ["Sora 1.0"]
  },
  {
    id: 'veo',
    name: 'Veo',
    provider: 'Google',
    description: "영상 편집 및 생성에 특화된 전문적인 AI 툴입니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini,
    category: ['video'],
    status: 'active',
    models: ["Veo 1.0", "Veo 2.0", "Veo 3.0"]
  },
  {
    id: 'runway',
    name: 'Runway',
    provider: 'Runway ML',
    description: "영상 편집 및 생성에 특화된 전문적인 AI 툴입니다.",
    icon: typeof IconRunway !== "undefined" ? IconRunway : InitialRunway,
    category: ['video'],
    status: 'active',
    models: ["Gen-3 Alpha", "Gen-2"]
  },
  {
    id: 'pika',
    name: 'Pika',
    provider: 'Pika Labs',
    description: "텍스트나 이미지를 통해 생동감 있는 비디오를 만듭니다.",
    icon: typeof IconPika !== "undefined" ? IconPika : InitialPika,
    category: ['video'],
    status: 'active',
    models: ["Pika 1.0"]
  },
  {
    id: 'stable-video',
    name: 'Stable Video',
    provider: 'Stability AI',
    description: "텍스트나 이미지를 통해 생동감 있는 비디오를 만듭니다.",
    icon: typeof IconStableVideo !== "undefined" ? IconStableVideo : InitialStableVideo,
    category: ['video'],
    status: 'active',
    models: ["Stable Video 1.0"]
  },


  // Music Models
  {
    id: 'udio',
    name: 'Udio',
    provider: 'Udio',
    description: "다양한 장르의 음악을 생성하며, 높은 음악성을 자랑합니다.",
    icon: typeof IconUdio !== "undefined" ? IconUdio : InitialUdio,
    category: ['music'],
    status: 'active',
    models: ["v1"]
  },  
  {
    id: 'stable-audio',
    name: 'Stable Audio',
    provider: 'Stability AI',
    description: "다양한 장르의 음악을 생성하며, 높은 음악성을 자랑합니다.",
    icon: typeof IconStableAudio !== "undefined" ? IconStableAudio : InitialStableAudio,
    category: ['music'],
    status: 'active',
    models: ["Stable Audio 1.0"]
  },  
  {
    id: 'musiclm',
    name: 'MusicLM',
    provider: 'Google',
    description: "가사와 스타일을 입력하면 고품질의 노래를 생성합니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini,
    category: ['music'],
    status: 'active',
    models: ["MusicLM 1.0"]
  },
  {
    id: 'jukebox',
    name: 'Jukebox',
    provider: 'OpenAI',
    description: "가사와 스타일을 입력하면 고품질의 노래를 생성합니다.",
    icon: typeof IconChatGPT !== "undefined" ? IconChatGPT : InitialChatGPT,
    category: ['music'],
    status: 'active',
    models: ["Jukebox 1.0"]
  },

 
  // Voice Models
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    provider: 'ElevenLabs',
    description: "가장 자연스럽고 감정 표현이 풍부한 음성 합성 AI입니다.",
    icon: typeof IconElevenlabs !== "undefined" ? IconElevenlabs : InitialElevenlabs,
    category: ['voice'],
    status: 'active',
    models: ["Multilingual v2", "Turbo v2"]
  },
  {
    id: 'amazon-polly',
    name: 'Amazon Polly',
    provider: 'Amazon',
    description: "가장 자연스럽고 감정 표현이 풍부한 음성 합성 AI입니다.",
    icon: typeof IconPolly !== "undefined" ? IconPolly : InitialPolly,
    category: ['voice'],
    status: 'active',
    models: ["Polly 1.0"]
  },
  {
    id: 'playai',
    name: 'PlayAI',
    provider: 'PlayHT',
    description: "가장 자연스럽고 감정 표현이 풍부한 음성 합성 AI입니다.",
    icon: typeof IconPlayai !== "undefined" ? IconPlayai : InitialPlayai,
    category: ['voice'],
    status: 'active',
    models: ["PlayAI 1.0"]
  },
  {
    id: 'cloud-text-to-speech',
    name: 'Cloud Text-to-Speech',
    provider: 'Google',
    description: "가장 자연스럽고 감정 표현이 풍부한 음성 합성 AI입니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini,
    category: ['voice'],
    status: 'active',
    models: ["Cloud Text-to-Speech 1.0"]
  },  
  
  // Code Models
  {
    id: 'copilot',
    name: 'Copilot',
    provider: 'GitHub',
    description: "코딩에 최적화된 AI 페어 프로그래머입니다.",
    icon: IconCopilot,
    category: ['code'],
    status: 'inactive',
    models: ["Copilot Enterprise", "Copilot Enterprise Pro"]
  }
];

export function ChatInterface({ className }: ChatInterfaceProps) {
  // 선택된 탭 상태 관리
  const [selectedTab, setSelectedTab] = React.useState<TabType>('chat');

  // 선택된 모델 상태 관리
  const [selectedModelId, setSelectedModelId] = React.useState<AIModelId>('chatgpt');
  
  // 선택된 하위 모델(버전) 상태 관리
  const [selectedSubModel, setSelectedSubModel] = React.useState<string>("GPT-4o");

  // 옵션 패널 확장 상태 관리
  const [isOptionExpanded, setIsOptionExpanded] = React.useState(true);

  // Scroll logic
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = React.useState(false);
  const [showRightArrow, setShowRightArrow] = React.useState(false);

  // Input Focus State
  const [isInputFocused, setIsInputFocused] = React.useState(false);

  // 현재 탭에 맞는 모델 리스트 필터링
  const currentTabModels = React.useMemo(() => {
    return AI_MODELS.filter(model => model.category.includes(selectedTab) && model.status !== 'inactive');
  }, [selectedTab]);

  // 스크롤 상태 업데이트 함수
  const updateScrollButtons = React.useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1);
    }
  }, []);

  // 모델 리스트가 변경되거나 창 크기가 변경될 때 스크롤 버튼 상태 초기화
  React.useEffect(() => {
    updateScrollButtons();
    window.addEventListener('resize', updateScrollButtons);
    return () => window.removeEventListener('resize', updateScrollButtons);
  }, [currentTabModels, updateScrollButtons]);

  const handleScroll = () => {
    updateScrollButtons();
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };


  // 탭 변경 시 호출되는 함수
  const handleTabChange = (tab: TabType) => {
    setSelectedTab(tab);
    // 탭 변경 시 해당 탭의 첫 번째 모델을 자동으로 선택 (inactive 모델 제외)
    const firstModel = AI_MODELS.find(model => model.category.includes(tab) && model.status !== 'inactive');
    if (firstModel) {
      handleModelSelect(firstModel.id);
    }
  };

  // 현재 선택된 모델의 설정 정보
  const currentModelConfig = React.useMemo(() => {
    return AI_MODELS.find(m => m.id === selectedModelId && m.category.includes(selectedTab)) 
      || currentTabModels[0] 
      || AI_MODELS.find(m => m.status !== 'inactive');
  }, [selectedModelId, selectedTab, currentTabModels]);


  // 모델 변경 핸들러
  const handleModelSelect = (modelId: AIModelId) => {
    setSelectedModelId(modelId);
    // 모델 변경 시 해당 모델의 첫 번째 하위 모델을 기본값으로 설정
    const modelConfig = AI_MODELS.find(m => m.id === modelId);
    if (modelConfig && modelConfig.models.length > 0) {
      // 우선순위가 있는 모델 자동 선택 로직
      const defaultModel = modelConfig.models.find(m => 
        m.includes("4o") || m.includes("1.5") || m.includes("Opus") || m.includes("v6") || m.includes("Gen-3") || m.includes("v3.5")
      ) || modelConfig.models[0];
      setSelectedSubModel(defaultModel);
    }
  };

  // 공통 옵션 UI 컴포넌트
  const OptionPanelContent = () => (
    <div className="flex flex-col gap-[16px] w-full max-w-[360px]">
      {/* Option: Size */}
      <div className="flex flex-col gap-[4px] w-full">
        <div className="flex items-center justify-start">
          <p className="text-sm font-medium text-foreground">크기</p>
        </div>
        <div className="bg-background border border-border h-[36px] flex items-center justify-between px-[12px] py-[8px] rounded-[6px] shadow-sm w-full cursor-pointer">
          <p className="text-sm text-foreground">1024x1024 (Square)</p>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>

      {/* Option: Quality */}
      <div className="flex flex-col gap-[4px] w-full">
        <div className="flex items-center justify-start">
          <p className="text-sm font-medium text-foreground">품질</p>
        </div>
        <div className="bg-background border border-border h-[36px] flex items-center justify-between px-[12px] py-[8px] rounded-[6px] shadow-sm w-full cursor-pointer">
          <p className="text-sm text-foreground">일반</p>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>

      {/* Option: Style */}
      <div className="flex flex-col gap-[4px] w-full">
        <div className="flex items-center justify-start">
          <p className="text-sm font-medium text-foreground">스타일</p>
        </div>
        <div className="bg-background border border-border h-[36px] flex items-center justify-between px-[12px] py-[8px] rounded-[6px] shadow-sm w-full cursor-pointer">
          <p className="text-sm text-foreground">Vivid (생동감)</p>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>

      {/* Option: Count */}
      <div className="flex flex-col gap-[8px] w-full">
        <div className="flex items-center justify-start w-full">
          <p className="text-sm font-medium text-muted-foreground">생성 개수</p>
          <p className="text-sm font-medium text-foreground">2</p>
        </div>
        <Slider defaultValue={[2]} max={4} step={1} className="w-full" />
      </div>

      {/* Divider */}
      <div className="h-px w-full bg-border" />

      {/* Info: Model & Time */}
      <div className="flex flex-col gap-[8px] w-full">
        <div className="flex items-center justify-between w-full">
          <p className="text-sm font-medium text-muted-foreground">모델</p>
          <p className="text-sm font-medium text-foreground">{selectedSubModel}</p>
        </div>
        <div className="flex items-center justify-between w-full">
          <p className="text-sm font-medium text-muted-foreground">예상 시간</p>
          <p className="text-sm font-medium text-foreground">15초</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-row gap-4 items-end justify-center w-full">
      <div className={`flex flex-col gap-[16px] items-center relative shrink-0 w-full max-w-[800px] ${className || ''}`}>
        
        {/* Token Display - 토큰 디스플레이 */}
        <div className="w-full flex items-center gap-4">
          <PaidToken />
        </div>
        
        <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
          {/* Mode Tabs */}
          <div className="flex flex-col gap-[10px] items-start relative shrink-0 w-full">
            <div className="bg-muted box-border flex h-[36px] items-center justify-center p-[3px] relative rounded-[8px] shrink-0 w-full">
              <div 
                className={cn(
                  "box-border flex flex-[1_0_0] flex-col gap-[10px] h-[29px] items-center justify-center px-[8px] py-[4px] relative rounded-[6px] shrink-0 cursor-pointer transition-colors",
                  selectedTab === 'chat' ? "bg-background border border-border shadow-sm" : "hover:bg-background/50"
                )}
                onClick={() => handleTabChange('chat')}
              >
                <p className={cn("font-medium leading-[20px] text-[14px]", selectedTab === 'chat' ? "text-foreground" : "text-muted-foreground")}>채팅</p>
              </div>
              {['이미지', '영상', '음악', '음성', '추출', '코드'].map((tabLabel) => {
                // 한글 라벨을 내부 TabType으로 매핑
                const tabMap:Record<string, TabType> = {
                  '추출': 'extract',
                  '이미지': 'image',
                  '영상': 'video',
                  '음악': 'music',
                  '음성': 'voice',
                  '코드': 'code'
                };
                const tabKey = tabMap[tabLabel];

                return (
                  <div 
                    key={tabLabel} 
                    className={cn(
                      "box-border flex flex-[1_0_0] flex-col gap-[10px] h-[29px] items-center justify-center px-[8px] py-[4px] relative rounded-[6px] shrink-0 cursor-pointer transition-colors",
                      selectedTab === tabKey ? "bg-background border border-border shadow-sm" : "hover:bg-background/50"
                    )}
                    onClick={() => handleTabChange(tabKey)}
                  >
                    <p className={cn("font-medium leading-[20px] text-[14px]", selectedTab === tabKey ? "text-foreground" : "text-muted-foreground")}>{tabLabel}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Models Grid - 모델 그리드 */}
          <div className="relative w-full group">
            {/* Left Arrow Button - 왼쪽 화살표 버튼 */}
            {showLeftArrow && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 -ml-4 hidden sm:block">
                 <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full bg-background shadow-md border hover:bg-accent h-8 w-8"
                  onClick={scrollLeft}
                >
                   <ChevronLeft className="h-4 w-4" />
                 </Button>
              </div>
            )}

            {/* Desktop View (sm 이상) */}
            <div 
              ref={scrollContainerRef}
              className="hidden sm:flex gap-4 items-start relative w-full overflow-x-auto pb-2 scrollbar-hide snap-x"
              onScroll={handleScroll}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              
              {/* AI Models Grid Items - 모델 그리드 아이템 */}
              {currentTabModels.map((model) => (
                <div 
                  key={model.id}
                  onClick={() => handleModelSelect(model.id)}
                  className={cn(
                    "box-border flex flex-col min-w-[160px] max-w-[188px] w-full gap-2 items-center overflow-hidden p-4 relative rounded-[8px] shrink-0 cursor-pointer transition-all border snap-start",
                    selectedModelId === model.id 
                      ? "bg-accent border-primary text-primary-foreground" // 선택됨
                      : "bg-card border-border hover:bg-accent/50" // 선택되지 않음
                  )}
                >
                  <div className="flex w-full items-start justify-between">
                     <div className={cn(
                      "box-border flex gap-[10px] items-center justify-center relative rounded-[4px] shrink-0 size-[32px]",
                      selectedModelId === model.id ? "bg-primary" : "bg-muted border border-border"
                    )}>              
                      <model.icon className={cn(
                        "relative shrink-0 size-[24px]",
                        selectedModelId === model.id && model.iconColorClass ? model.iconColorClass : ""
                      )} />              
                    </div>
                    
                    <div className="flex flex-col items-center justify-center relative shrink-0">
                      {selectedModelId === model.id ? (
                          <div className="border border-ring rounded-full shadow-sm shrink-0 size-[16px] relative flex items-center justify-center">
                            <div className="size-[8px] rounded-full bg-primary" />
                          </div>
                      ) : (
                          <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-[16px]" />
                      )}
                    </div>
                  </div>
                  
                  <div className="flex w-full flex-col items-start relative shrink-0 mt-2">
                    <div className="flex w-full justify-between items-center">
                       <p className="font-medium text-card-foreground text-[14px] truncate">{model.name}</p>
                       {model.isLocked && <Lock className="size-3 text-muted-foreground ml-1 shrink-0" />}
                    </div>
                    <p className="font-normal text-muted-foreground text-[14px] line-clamp-1 w-full text-left">{model.provider}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile View (sm 미만) */}
            <div className="sm:hidden flex flex-row gap-2 items-center justify-start w-full overflow-x-auto pb-2 scrollbar-hide">
              {currentTabModels.map((model) => (
                 <div 
                   key={model.id}
                   onClick={() => handleModelSelect(model.id)}
                   className={cn(
                     "box-border flex flex-col min-w-[110px] max-w-[140px] w-full gap-1 items-center overflow-hidden p-2 rounded-[8px] cursor-pointer transition-all border snap-start",
                     selectedModelId === model.id 
                       ? "bg-accent border-primary text-primary-foreground" // 선택됨
                       : "bg-card border-border hover:bg-accent/50" // 선택되지 않음
                   )}
                 >
                 
                   <div className="flex w-full items-start justify-between">
                       <div className={cn(
                         "box-border flex gap-[10px] items-center justify-center relative rounded-[4px] shrink-0 size-[32px]",
                         selectedModelId === model.id ? "bg-primary" : "bg-muted border border-border"
                       )}>              
                       <model.icon className={cn(
                         "relative shrink-0 size-[24px]",
                         selectedModelId === model.id && model.iconColorClass ? model.iconColorClass : ""
                       )} />                             
                     </div>
                     
                     <div className="flex flex-col items-center justify-center relative shrink-0">
                       {selectedModelId === model.id ? (
                           <div className="border border-ring rounded-full shadow-sm shrink-0 size-[16px] relative flex items-center justify-center">
                             <div className="size-[8px] rounded-full bg-primary" />
                           </div>
                       ) : (
                           <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-[16px]" />
                       )}
                       {model.isLocked && <Lock className="size-3 text-muted-foreground mt-1 shrink-0" />}
                     </div>
                   </div>
                   
                   <div className="flex w-full flex-col items-start relative shrink-0 mt-2">
                     <div className="flex w-full justify-between items-center">
                         <p className="font-medium text-card-foreground text-[14px] truncate">{model.name}</p>                  
                     </div>
                   </div>
                 </div>
              ))}
            </div>

            {/* Right Arrow Button - 오른쪽 화살표 버튼 */}
            {showRightArrow && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 -mr-4 hidden sm:block">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full bg-background shadow-md border hover:bg-accent h-8 w-8"
                  onClick={scrollRight}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          

          {/* Content Area: Chat/Option Container */}
          <div className="flex gap-[16px] items-start relative shrink-0 w-full">
            
            {/* Main Content (Chat/Input Area) */}
            <div className="flex flex-[1_0_0] flex-col gap-[16px] items-start h-full relative shrink-0">
              {/* Description - 선택된 모델 설명 */}
              {currentModelConfig && (
                <div className="flex gap-[10px] items-center justify-start w-full">
                  <p className="font-medium leading-[20px] text-card-foreground text-[14px] whitespace-nowrap">{currentModelConfig.name}</p>
                  <p className="font-normal leading-[20px] text-muted-foreground text-[14px] line-clamp-1 text-ellipsis overflow-hidden">
                    {currentModelConfig.description}
                  </p>
                </div>
              )}

              {/* Search Bar & Actions - 검색창 및 액션 */}
              {currentModelConfig && (
                <div className="bg-background border border-border box-border flex flex-col gap-[10px] items-start justify-between pb-[12px] pt-[16px] px-[16px] relative rounded-[24px] shadow-sm shrink-0 w-full h-full">
                  <div className="flex flex-col gap-[10px] items-start justify-center relative shrink-0 w-full">                    
                    <input 
                      type="text" 
                      placeholder={`${currentModelConfig.name}에게 무엇이든 물어보세요`} 
                      className="w-full border-none outline-none text-[16px] placeholder:text-muted-foreground bg-transparent"
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                    />
                  </div>
                  <div className="flex gap-[16px] items-center relative shrink-0 w-full mt-auto">
                    <div className="flex flex-[1_0_0] gap-[10px] items-center relative shrink-0">
                      <div className="relative shrink-0 size-[24px] cursor-pointer hover:opacity-70 flex items-center justify-center">
                          <Plus className="size-full" />
                      </div>
                    </div>                  
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-[36px] rounded-[8px] gap-2 px-4" disabled={currentModelConfig.isLocked}>
                          {selectedSubModel}
                          <ChevronDown className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56" align="start">
                        <DropdownMenuLabel>모델 선택</DropdownMenuLabel>
                        <DropdownMenuGroup>
                          {currentModelConfig.models.map((subModel) => (
                            <DropdownMenuItem 
                              key={subModel}
                              onClick={() => setSelectedSubModel(subModel)}
                            >
                              {subModel}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>     
                      </DropdownMenuContent>
                    </DropdownMenu>

                    
                      {isInputFocused ? (
                        <div className="bg-primary rounded-full size-[28px] flex items-center justify-center cursor-pointer">
                        <ArrowUp className="text-primary-foreground size-[24px]" />
                        </div>
                      ) : (
                        <div className="size-[28px] flex items-center justify-center cursor-pointer">
                        <Mic className="text-primary size-[24px]" /> 
                        </div>
                      )}
                    
                  </div>
                </div>
              )}
              
              {/* Example Badges (Optional) - 예시 뱃지 */}
              <div className="flex gap-2 items-start w-full relative">
                
                <div className="flex gap-2 items-start lg:w-full flex-wrap">
                  {['우주를 여행하는 고양이, 디지털 아트', '미래도시의 석양, 사이버펑크 스타일','초현실적인 인물 그림', '미술관 내부 그림', '아이들이 그린 그림'].map((badge) => (
                    <div key={badge} className="hidden lg:block bg-secondary px-[10px] py-[2px] rounded-[8px] cursor-pointer hover:bg-secondary/80">
                      <p className="text-[12px] font-medium text-secondary-foreground">{badge}</p>
                    </div>
                  ))}
                  
                  {/* Mobile Only: Ellipsis Button with Popover  */}
                  <div className="lg:hidden block">
                     <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-9 p-0">
                          <Ellipsis className="size-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        align="start" 
                        side="top"
                        sideOffset={5}
                        className="w-[300px] p-2 flex flex-wrap gap-2"
                      >
                         {['우주를 여행하는 고양이, 디지털 아트', '미래도시의 석양, 사이버펑크 스타일','초현실적인 인물 그림', '미술관 내부 그림', '아이들이 그린 그림'].map((badge) => (
                          <div key={badge} className="bg-secondary px-[10px] py-[2px] rounded-[8px] cursor-pointer hover:bg-secondary/80">
                            <p className="text-[12px] font-medium text-secondary-foreground">{badge}</p>
                          </div>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* 패널 축소 + 모바일 화면 (Drawer Trigger) */}
                {currentModelConfig?.hasOptions && (
                  <div className="xl:hidden lg:w-[420px] w-full">
                    <Drawer>
                      <DrawerTrigger asChild>
                        <div className="bg-card border border-border flex gap-2 items-center p-2 rounded-[8px] w-full cursor-pointer hover:bg-accent/50 transition-colors">                  
                          <Settings2 className="size-4" />
                          <p className="text-sm font-medium text-card-foreground truncate text-ellipsis line-clamp-1 w-full">1024x1024 일반 Vivid 2</p>                    
                          <div className="size-[16px] flex items-center justify-center relative shrink-0">
                            <ChevronsUp className="size-4" />
                          </div>
                        </div>
                      </DrawerTrigger>
                      <DrawerContent>
                        <DrawerHeader>
                          <DrawerTitle>이미지 설정</DrawerTitle>
                          <DrawerDescription>
                            모델 생성 옵션을 설정합니다.
                          </DrawerDescription>
                        </DrawerHeader>
                        <div className="p-4 pb-0 w-full flex justify-center">
                          <OptionPanelContent />
                        </div>
                        <DrawerFooter>
                          <DrawerClose asChild>
                            <div className="w-full flex  items-center justify-center">
                               <Button variant="outline" className="w-full max-w-[360px]">확인</Button>
                            </div>
                          </DrawerClose>
                        </DrawerFooter>
                      </DrawerContent>
                    </Drawer>
                  </div>
                )}

              </div>
            </div>

            {/* Compact Option Panel (Trigger) - Inside Main Container - 패널 축소되었을 때 확장 트리거 (데스크탑 전용) */}
            {currentModelConfig?.hasOptions && !isOptionExpanded && (
              <div 
                className="hidden xl:flex bg-card border border-border flex-col gap-2 items-center p-[16px] rounded-[8px] max-w-[200px] w-full min-w-[120px] cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setIsOptionExpanded(true)}
              >
                <div className="flex items-center w-full gap-[10px]">
                  <Settings2 className="size-6" />                
                  
                  <p className="text-[14px] font-medium text-card-foreground truncate w-full">이미지 설정</p>
                  <div className="size-[16px] flex items-center justify-center relative shrink-0">
                    <ChevronsRight className="size-4" />
                  </div>
                </div>

                <div className="flex items-center justify-start w-full gap-2">
                  <p className="text-[14px] text-muted-foreground whitespace-nowrap">크기</p>
                  <p className="text-[14px] font-medium text-foreground line-clamp-1 text-ellipsis w-full">1024x1024 (Square)</p>
                </div>
                <div className="flex items-center justify-start w-full gap-2">
                  <p className="text-[14px] text-muted-foreground whitespace-nowrap">품질</p>
                  <p className="text-[14px] font-medium text-foreground line-clamp-1 text-ellipsis w-full">일반</p>
                </div>
                <div className="flex items-center justify-start w-full gap-2">
                  <p className="text-[14px] text-muted-foreground whitespace-nowrap">스타일</p>
                  <p className="text-[14px] font-medium text-foreground line-clamp-1 text-ellipsis w-full">Vivid (생동감)</p>
                </div>
                <div className="flex items-center justify-start w-full gap-2">
                  <p className="text-[14px] text-muted-foreground whitespace-nowrap">생성 개수</p>
                  <p className="text-[14px] font-medium text-foreground line-clamp-1 text-ellipsis w-full">2</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Panel (Outside Main Container) - 패널 확장되었을 때 영역 (데스크탑 전용) */}
      {currentModelConfig?.hasOptions && isOptionExpanded && (
        <div className="hidden xl:flex bg-card border border-border flex-col gap-[16px] items-start p-[16px] rounded-[8px] relative shrink-0 w-[260px] animate-in fade-in slide-in-from-left-4 duration-300">
          
          <div className="flex items-center gap-[10px] w-full cursor-pointer"
          onClick={() => setIsOptionExpanded(false)}>
            <div className="size-[16px] flex items-center justify-center relative shrink-0">
              <Settings2 className="size-full" />
            </div>
            
              <p className="text-sm font-medium text-card-foreground truncate w-full">이미지 설정</p>
              <div className="size-[16px] flex items-center justify-center relative shrink-0">
                <ChevronsLeft className="size-full" />
              </div>            
          </div>

          <OptionPanelContent />
        </div>
      )}
    </div>
  )
}
