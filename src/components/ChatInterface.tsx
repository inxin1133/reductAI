import * as React from "react"
import { cn } from "@/lib/utils"
import { Mic, ChevronDown, Lock, Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel, 
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
type AIModelId = 'chatgpt' | 'gemini' | 'claude' | 'grok' | 'nanobanana' | 'dalle' | 'stable-diffusion' | 'fierfly' | 'sora' | 'runway' | 'veo' | 'pika' | 'stable-video' | 'musiclm' | 'udio' | 'stable-audio' | 'jukebox' | 'elevenlabs' | 'amazon-polly' | 'playai' | 'cloud-text-to-speech';

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
  models: string[]; // 드롭다운에 표시될 구체적인 모델명 리스트
  category: TabType[]; // 해당 모델이 속한 카테고리
}

// 아이콘 래퍼들 (추가적인 아이콘이 필요하면 여기에 추가)
// 임시로 기존 아이콘 재사용 혹은 대체
const InitialGemini = ({ className }: { className?: string }) => <div className={className}>G</div>; // Placeholder
const InitialClaude = ({ className }: { className?: string }) => <div className={className}>C</div>; // Placeholder
const InitialGrok = ({ className }: { className?: string }) => <div className={className}>G</div>; // Placeholder
const InitialChatGPT = ({ className }: { className?: string }) => <div className={className}>D</div>; // Placeholder
const InitialStableDiffusion = ({ className }: { className?: string }) => <div className={className}>S</div>; // Placeholder
const InitialFierfly = ({ className }: { className?: string }) => <div className={className}>F</div>; // Placeholder
const InitialRunway = ({ className }: { className?: string }) => <div className={className}>R</div>; // Placeholder
const InitialPika = ({ className }: { className?: string }) => <div className={className}>P</div>; // Placeholder
const InitialStableVideo = ({ className }: { className?: string }) => <div className={className}>V</div>; // Placeholder
const InitialUdio = ({ className }: { className?: string }) => <div className={className}>U</div>; // Placeholder
const InitialStableAudio = ({ className }: { className?: string }) => <div className={className}>A</div>; // Placeholder
const InitialElevenlabs = ({ className }: { className?: string }) => <div className={className}>E</div>; // Placeholder
const InitialPolly = ({ className }: { className?: string }) => <div className={className}>P</div>; // Placeholder
const InitialPlayai = ({ className }: { className?: string }) => <div className={className}>P</div>; // Placeholder


const AI_MODELS: AIModelConfig[] = [
  // Chat Models
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    provider: 'OpenAI',
    description: "다재다능하고 안정적인 '표준'이며, 코드와 광범위한 통합에 강합니다.",
    icon: typeof IconChatGPT !== "undefined" ? IconChatGPT : InitialChatGPT,
    category: ['chat', 'code', 'extract'],
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
    models: ["Grok-1", "Grok-2", "Grok-3"]
  },



  // Image Models
  {
    id: 'nanobanana',
    name: 'Nano Banana',
    provider: 'Google',
    description: "Nano Banana는 예술적이고 고품질의 이미지를 생성하는 데 특화되어 있습니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini, // Replace with actual icon
    category: ['image'],
    models: ["Nano Banana Pro"]
  },
  {
    id: 'dalle',
    name: 'DALL·E',
    provider: 'OpenAI',
    description: "프롬프트에 충실한 이미지를 생성하며, 편집 기능이 강력합니다.",
    icon: typeof IconChatGPT !== "undefined" ? IconChatGPT : InitialChatGPT, // Replace with actual icon
    category: ['image'],
    models: ["DALL·E 3", "DALL·E 2"]
  },
  {
    id: 'stable-diffusion',
    name: 'Stable Diffusion',
    provider: 'Stability AI',
    description: "오픈소스 기반으로 다양한 스타일과 커스터마이징이 가능합니다.",
    icon: typeof IconStableDiffusion !== "undefined" ? IconStableDiffusion : InitialStableDiffusion, // Replace with actual icon
    category: ['image', 'extract'],
    models: ["SD3", "SDXL 1.0", "SD 1.5"]
  },
  {
    id: 'fierfly',
    name: 'Fierfly',
    provider: 'Adobe',
    description: "Adobe의 최신 멀티모달 모델로, 텍스트와 이미지 처리에 뛰어납니다.",
    icon: typeof IconFierfly !== "undefined" ? IconFierfly : InitialFierfly, // Replace with actual icon
    category: ['image'],
    models: ["SD3", "SDXL 1.0", "SD 1.5"]
  },


  // Video Models
  {
    id: 'sora',
    name: 'Sora',
    provider: 'OpenAI',
    description: "텍스트에서 고화질의 비디오를 생성하는 혁신적인 모델입니다.",
    icon: typeof IconChatGPT !== "undefined" ? IconChatGPT : InitialChatGPT, // Replace with actual icon
    category: ['video'],
    models: ["Sora 1.0"]
  },
  {
    id: 'veo',
    name: 'Veo',
    provider: 'Google',
    description: "영상 편집 및 생성에 특화된 전문적인 AI 툴입니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini, // Replace with actual icon
    category: ['video'],
    models: ["Veo 1.0", "Veo 2.0", "Veo 3.0"]
  },
  {
    id: 'runway',
    name: 'Runway',
    provider: 'Runway ML',
    description: "영상 편집 및 생성에 특화된 전문적인 AI 툴입니다.",
    icon: typeof IconRunway !== "undefined" ? IconRunway : InitialRunway, // Replace with actual icon
    category: ['video'],
    models: ["Gen-3 Alpha", "Gen-2"]
  },
  {
    id: 'pika',
    name: 'Pika',
    provider: 'Pika Labs',
    description: "텍스트나 이미지를 통해 생동감 있는 비디오를 만듭니다.",
    icon: typeof IconPika !== "undefined" ? IconPika : InitialPika, // Replace with actual icon
    category: ['video'],
    models: ["Pika 1.0"]
  },
  {
    id: 'stable-video',
    name: 'Stable Video',
    provider: 'Stability AI',
    description: "텍스트나 이미지를 통해 생동감 있는 비디오를 만듭니다.",
    icon: typeof IconStableVideo !== "undefined" ? IconStableVideo : InitialStableVideo, // Replace with actual icon
    category: ['video'],
    models: ["Stable Video 1.0"]
  },


  // Music Models
  {
    id: 'udio',
    name: 'Udio',
    provider: 'Udio',
    description: "다양한 장르의 음악을 생성하며, 높은 음악성을 자랑합니다.",
    icon: typeof IconUdio !== "undefined" ? IconUdio : InitialUdio, // Replace with actual icon
    category: ['music'],
    models: ["v1"]
  },  
  {
    id: 'stable-audio',
    name: 'Stable Audio',
    provider: 'Stability AI',
    description: "다양한 장르의 음악을 생성하며, 높은 음악성을 자랑합니다.",
    icon: typeof IconStableAudio !== "undefined" ? IconStableAudio : InitialStableAudio, // Replace with actual icon
    category: ['music'],
    models: ["Stable Audio 1.0"]
  },  
  {
    id: 'musiclm',
    name: 'MusicLM',
    provider: 'Google',
    description: "가사와 스타일을 입력하면 고품질의 노래를 생성합니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini, // Replace with actual icon
    category: ['music'],
    models: ["MusicLM 1.0"]
  },
  {
    id: 'jukebox',
    name: 'Jukebox',
    provider: 'OpenAI',
    description: "가사와 스타일을 입력하면 고품질의 노래를 생성합니다.",
    icon: typeof IconChatGPT !== "undefined" ? IconChatGPT : InitialChatGPT, // Replace with actual icon
    category: ['music'],
    models: ["Jukebox 1.0"]
  },


  // Voice Models
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    provider: 'ElevenLabs',
    description: "가장 자연스럽고 감정 표현이 풍부한 음성 합성 AI입니다.",
    icon: typeof IconElevenlabs !== "undefined" ? IconElevenlabs : InitialElevenlabs, // Replace with actual icon
    category: ['voice'],
    models: ["Multilingual v2", "Turbo v2"]
  },
  {
    id: 'amazon-polly',
    name: 'Amazon Polly',
    provider: 'Amazon',
    description: "가장 자연스럽고 감정 표현이 풍부한 음성 합성 AI입니다.",
    icon: typeof IconPolly !== "undefined" ? IconPolly : InitialPolly, // Replace with actual icon
    category: ['voice'],
    models: ["Polly 1.0"]
  },
  {
    id: 'playai',
    name: 'PlayAI',
    provider: 'PlayHT',
    description: "가장 자연스럽고 감정 표현이 풍부한 음성 합성 AI입니다.",
    icon: typeof IconPlayai !== "undefined" ? IconPlayai : InitialPlayai, // Replace with actual icon
    category: ['voice'],
    models: ["PlayAI 1.0"]
  },
  {
    id: 'cloud-text-to-speech',
    name: 'Cloud Text-to-Speech',
    provider: 'Google',
    description: "가장 자연스럽고 감정 표현이 풍부한 음성 합성 AI입니다.",
    icon: typeof IconGemini !== "undefined" ? IconGemini : InitialGemini, // Replace with actual icon
    category: ['voice'],
    models: ["Cloud Text-to-Speech 1.0"]
  },  
  
];

export function ChatInterface({ className }: ChatInterfaceProps) {
  // 선택된 탭 상태 관리
  const [selectedTab, setSelectedTab] = React.useState<TabType>('chat');

  // 선택된 모델 상태 관리
  const [selectedModelId, setSelectedModelId] = React.useState<AIModelId>('chatgpt');
  
  // 선택된 하위 모델(버전) 상태 관리
  const [selectedSubModel, setSelectedSubModel] = React.useState<string>("GPT-4o");

  // Scroll logic
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = React.useState(false);
  const [showRightArrow, setShowRightArrow] = React.useState(false);

  // 현재 탭에 맞는 모델 리스트 필터링
  const currentTabModels = React.useMemo(() => {
    return AI_MODELS.filter(model => model.category.includes(selectedTab));
  }, [selectedTab]);

  // 스크롤 상태 업데이트 함수
  const updateScrollButtons = React.useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 1); // -1 for tolerance
    }
  }, []);

  // 모델 리스트가 변경되거나 창 크기가 변경될 때 스크롤 버튼 상태 초기화
  React.useEffect(() => {
    updateScrollButtons();
    // 리사이즈 이벤트 리스너 추가 (반응형 대응)
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
    // 탭 변경 시 해당 탭의 첫 번째 모델을 자동으로 선택
    const firstModel = AI_MODELS.find(model => model.category.includes(tab));
    if (firstModel) {
      handleModelSelect(firstModel.id);
    }
  };

  // 현재 선택된 모델의 설정 정보
  // 만약 현재 탭에 selectedModelId가 없다면 첫 번째 모델 사용 (안전장치)
  const currentModelConfig = React.useMemo(() => {
    return AI_MODELS.find(m => m.id === selectedModelId && m.category.includes(selectedTab)) 
      || currentTabModels[0] 
      || AI_MODELS[0];
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

  return (
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

        {/* AI Models Grid - AI 모델 선택 그리드 (현재 탭에 해당하는 모델만 표시) */}
        <div className="relative w-full group">
          {/* Left Arrow Button */}
          {showLeftArrow && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 -ml-4">
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

          <div 
            ref={scrollContainerRef}
            className="flex gap-4 items-start relative w-full overflow-x-auto pb-2 scrollbar-hide snap-x"
            onScroll={handleScroll}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} // Hide scrollbar for Firefox and IE/Edge
          >
            {currentTabModels.map((model) => (
              <div 
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
                className={cn(
                  "box-border flex flex-col min-w-[180px] w-[180px] gap-2 items-center overflow-hidden p-4 relative rounded-[8px] shrink-0 cursor-pointer transition-all border snap-start",
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
                  
                  {/* 선택 표시 (라디오 버튼 스타일) 또는 잠금 표시 */}
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

          {/* Right Arrow Button */}
          {showRightArrow && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 -mr-4">
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

        {/* Description - 선택된 모델 설명 */}
        {currentModelConfig && (
          <div className="flex gap-[10px] items-center justify-start w-full min-h-[20px]">
            <p className="font-medium leading-[20px] text-card-foreground text-[14px]">{currentModelConfig.name}</p>
            <p className="font-normal leading-[20px] text-muted-foreground text-[14px]">
              {currentModelConfig.description}
            </p>
          </div>
        )}

        {/* Search Bar & Actions - 검색창 및 액션 (선택된 모델에 따라 변경) */}
        {currentModelConfig && (
          <div className="bg-background border border-border box-border flex flex-col gap-[10px] items-start justify-center pb-[12px] pt-[16px] px-[16px] relative rounded-[24px] shadow-sm shrink-0 w-full">
            <div className="flex flex-col gap-[10px] items-start justify-center relative shrink-0 w-full">
              <input 
                type="text" 
                placeholder={`${currentModelConfig.name}에게 무엇이든 물어보세요`} 
                className="w-full border-none outline-none text-[16px] placeholder:text-muted-foreground bg-transparent"
              />
            </div>
            <div className="flex gap-[16px] items-center relative shrink-0 w-full mt-2">
              <div className="flex flex-[1_0_0] gap-[10px] items-center relative shrink-0">
                <div className="relative shrink-0 size-[24px] cursor-pointer hover:opacity-70 flex items-center justify-center">
                    <Plus className="size-full" />
                </div>
              </div>                  
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" disabled={currentModelConfig.isLocked}>
                    {selectedSubModel}
                    <ChevronDown className="size-4 relative shrink-0 ml-2" />
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

              <Mic className="text-primary size-[24px]" />                                    
            </div>
          </div>
        )}

        {/* Action Badges */}
        <div className="flex gap-[4px] items-start relative shrink-0 w-full">
          <div className="bg-secondary cursor-pointer hover:bg-secondary/80 px-[10px] py-[2px] rounded-[8px]">
            <p className="font-medium leading-[16px] text-secondary-foreground text-[12px]">심층 리서치를 작성해줘</p>
          </div>
          <div className="bg-secondary cursor-pointer hover:bg-secondary/80 px-[10px] py-[2px] rounded-[8px]">
            <p className="font-medium leading-[16px] text-secondary-foreground text-[12px]">잘 생각해줘</p>
          </div>
        </div>
        
      </div>
    </div>
  )
}
