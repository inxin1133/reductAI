import * as React from "react"
import { Mic, ChevronDown, Lock, Plus, Eclipse } from "lucide-react"
import { useTheme } from "@/hooks/useTheme"
import { Button } from "@/components/ui/button"
import { LoginModal } from "@/components/LoginModal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
 

function IconsGrok({ className }: { className?: string }) {
  return (
    <div className={className}>
      {/* <img alt="Grok" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={grokImg} /> */}
      <div className="relative shrink-0 size-[24px]">          
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M9.26904 14.7636L17.2479 8.87699C17.639 8.58841 18.1981 8.70097 18.3845 9.14925C19.3655 11.5133 18.9272 14.3543 16.9755 16.3049C15.0238 18.2555 12.3082 18.6833 9.82611 17.709L7.11461 18.9637C11.0037 21.6204 15.7263 20.9634 18.6774 18.0119C21.0182 15.6724 21.7432 12.4835 21.0653 9.60774L21.0714 9.61385C20.0884 5.38925 21.3131 3.70063 23.8219 0.247664C23.8812 0.165792 23.9406 0.0839191 24 0L20.6987 3.29946V3.28922L9.26702 14.7657"
         fill="currentColor"              
         className="text-primary"
        />
        <path d="M7.62253 16.1944C4.83114 13.5294 5.31241 9.40506 7.69418 7.02672C9.4554 5.26644 12.341 4.54802 14.86 5.60417L17.5653 4.35561C17.078 4.00356 16.4533 3.6249 15.7365 3.35882C12.4967 2.02635 8.61781 2.68951 5.98414 5.31966C3.45081 7.85156 2.65416 11.7446 4.0222 15.0666C5.04412 17.5494 3.36889 19.3055 1.68137 21.0781C1.08337 21.7064 0.483316 22.3348 0 23L7.62045 16.1964"
         fill="currentColor"              
         className="text-primary"
        />
      </svg>
        </div>
    </div>
  );
}

function IconsClaude({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative shrink-0 size-[24px]">          
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <g clip-path="url(#clip0_26_2463)">
            <path d="M4.71397 15.956L9.43197 13.308L9.51097 13.078L9.43097 12.95H9.20097L8.41097 12.902L5.71597 12.829L3.37897 12.732L1.11397 12.61L0.543972 12.489L0.00897217 11.785L0.0639722 11.432L0.543972 11.111L1.22897 11.171L2.74697 11.275L5.02397 11.432L6.67497 11.53L9.12197 11.785H9.51097L9.56497 11.627L9.43197 11.53L9.32897 11.432L6.97297 9.836L4.42297 8.148L3.08697 7.176L2.36497 6.685L1.99997 6.223L1.84197 5.215L2.49797 4.493L3.37797 4.553L3.60197 4.614L4.49497 5.3L6.40097 6.776L8.89097 8.609L9.25497 8.913L9.40097 8.809L9.41897 8.737L9.25497 8.463L7.90097 6.017L6.45597 3.527L5.81197 2.495L5.64197 1.876C5.57784 1.63815 5.54324 1.39331 5.53897 1.147L6.28697 0.133L6.69997 0L7.69497 0.134L8.11497 0.498L8.73397 1.913L9.73497 4.14L11.29 7.17L11.745 8.068L11.988 8.9L12.078 9.155H12.237V9.01L12.364 7.304L12.601 5.209L12.831 2.514L12.911 1.754L13.287 0.844L14.034 0.352L14.617 0.632L15.097 1.317L15.03 1.761L14.744 3.612L14.186 6.515L13.821 8.457H14.034L14.277 8.215L15.26 6.909L16.912 4.845L17.64 4.025L18.49 3.121L19.037 2.69H20.069L20.828 3.819L20.488 4.985L19.425 6.332L18.545 7.474L17.282 9.174L16.492 10.534L16.566 10.644L16.754 10.624L19.607 10.018L21.149 9.738L22.989 9.423L23.821 9.811L23.911 10.206L23.584 11.013L21.617 11.499L19.31 11.961L15.874 12.774L15.831 12.804L15.88 12.865L17.428 13.011L18.09 13.047H19.71L22.728 13.272L23.518 13.794L23.991 14.432L23.911 14.917L22.698 15.537L21.058 15.148L17.233 14.238L15.923 13.909H15.74V14.019L16.833 15.087L18.836 16.897L21.344 19.227L21.471 19.805L21.15 20.26L20.81 20.211L18.606 18.554L17.756 17.807L15.831 16.187H15.704V16.357L16.147 17.006L18.49 20.527L18.612 21.607L18.442 21.96L17.835 22.173L17.167 22.051L15.795 20.127L14.38 17.959L13.239 16.016L13.099 16.096L12.425 23.35L12.109 23.72L11.381 24L10.774 23.539L10.452 22.792L10.774 21.316L11.162 19.392L11.478 17.862L11.763 15.962L11.933 15.33L11.921 15.288L11.781 15.306L10.349 17.273L8.16897 20.218L6.44497 22.063L6.03197 22.227L5.31597 21.857L5.38197 21.195L5.78297 20.606L8.16897 17.57L9.60797 15.688L10.537 14.602L10.531 14.444H10.476L4.13797 18.56L3.00797 18.706L2.52297 18.25L2.58297 17.504L2.81397 17.261L4.72097 15.949L4.71397 15.956Z"
             fill="currentColor"              
             className="text-primary"
             />
          </g>
          <defs>
            <clipPath id="clip0_26_2463">
              <rect width="24" height="24" fill="white"/>
            </clipPath>
          </defs>
        </svg>
        </div>
    </div>
  );
}

function IconsGemini({ className }: { className?: string }) {
  return (
    <div className={className}>
        <div className="relative shrink-0 size-[24px]">          
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path 
              d="M22.9956 12.0198C20.1412 12.1944 17.4492 13.4073 15.427 15.4299C13.4048 17.4525 12.1922 20.145 12.0176 23H11.9736C11.6216 17.0984 6.8993 12.3763 1 12.0198V11.9758C6.8993 11.6237 11.6216 6.90048 11.978 1H12.022C12.3784 6.90048 17.1007 11.6237 23 11.9802V12.0198H22.9956Z" 
              fill="currentColor"              
              className="text-primary"
            />
          </svg>
        </div>
      
    </div>
  );
}


export default function Intro() {
  const { toggleTheme } = useTheme();
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);

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
            
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="한국어" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>언어</SelectLabel>
                    <SelectItem value="Korean" aria-checked>한국어</SelectItem>
                    <SelectItem value="English">영어</SelectItem>
                    <SelectItem value="Japanese">일본어</SelectItem>
                    <SelectItem value="Chinese">중국어</SelectItem>
                    <SelectItem value="Spanish">스페인어</SelectItem>
                    <SelectItem value="French">프랑스어</SelectItem>
                    <SelectItem value="German">독일어</SelectItem>
                    <SelectItem value="Italian">이탈리아어</SelectItem>
                    <SelectItem value="Portuguese">포르투갈어</SelectItem>
                    <SelectItem value="Russian">러시아어</SelectItem>
                    <SelectItem value="Arabic">아랍어</SelectItem>
                    <SelectItem value="Turkish">터키어</SelectItem>
                    <SelectItem value="Dutch">네덜란드어</SelectItem>
                    <SelectItem value="Polish">폴란드어</SelectItem>
                    <SelectItem value="Czech">체코어</SelectItem>
                    <SelectItem value="Hungarian">헝가리어</SelectItem>
                </SelectGroup>
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
        <div className="box-border flex flex-[1_0_0] flex-col gap-[40px] items-center justify-center pb-[24px] pt-[12px] px-[24px] relative shrink-0 w-full">
          {/* Intro Text Section */}
          <div className="flex flex-col gap-[16px] items-start justify-center relative shrink-0 w-full max-w-[800px]">
            <div className="flex items-start relative shrink-0 w-full">
              <div className="flex flex-[1_0_0] flex-col items-start justify-center relative shrink-0 text-primary">
                <p className="font-black leading-[36px] text-[30px]">
                  reduct
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
          <div className="flex flex-col gap-[16px] items-center relative shrink-0 w-full max-w-[800px]">
            <div className="flex flex-col gap-[16px] items-start relative shrink-0 w-full">
              {/* Mode Tabs */}
              <div className="flex flex-col gap-[10px] items-start relative shrink-0 w-full">
                <div className="bg-muted box-border flex h-[36px] items-center justify-center p-[3px] relative rounded-[8px] shrink-0 w-full">
                  <div className="bg-background border border-border box-border flex flex-[1_0_0] flex-col gap-[10px] h-[29px] items-center justify-center px-[8px] py-[4px] relative rounded-[6px] shadow-sm shrink-0">
                    <p className="font-medium leading-[20px] text-foreground text-[14px]">채팅</p>
                  </div>
                  {['추출', '이미지', '영상', '음악', '음성', '코드'].map((tab) => (
                    <div key={tab} className="box-border flex flex-[1_0_0] flex-col gap-[10px] h-[29px] items-center justify-center px-[8px] py-[4px] relative rounded-[6px] shrink-0 cursor-pointer hover:bg-background/50 transition-colors">
                      <p className="font-medium leading-[20px] text-foreground text-[14px]">{tab}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Models Grid */}
              <div className="flex gap-[16px] items-start relative shrink-0 w-full">
                {/* ChatGPT */}
                <div className="bg-accent border border-primary box-border flex flex-[1_0_0] gap-[12px] items-center overflow-hidden p-[16px] relative rounded-[8px] shrink-0">
                  <div className="bg-primary flex gap-[10px] items-center justify-center relative rounded-[4px] shrink-0 size-[32px]">
                    <div className="relative shrink-0 size-[24px]">                      
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path 
                            d="M10.8206 1C12.5546 1.00015 14.0957 1.82153 15.0632 3.09087C17.3422 2.44903 19.8615 3.37767 21.1059 5.49159H21.1047C21.5547 6.25266 21.8008 7.11691 21.8182 8.00087C21.8328 8.74179 21.6833 9.4743 21.3886 10.1505C23.093 11.7726 23.5321 14.3857 22.2864 16.5023L22.2852 16.5046C21.8322 17.2663 21.1959 17.9027 20.4342 18.3557C19.7863 18.741 19.0645 18.9809 18.3186 19.0659C17.739 21.3331 15.6514 22.9997 13.1816 23C12.304 23.0024 11.4393 22.7892 10.6645 22.3769C9.98831 22.017 9.39925 21.5156 8.93562 20.9091C6.6563 21.5503 4.13614 20.6215 2.89177 18.5073V18.5061C2.44276 17.7453 2.19766 16.8813 2.18053 15.998C2.16622 15.2571 2.31409 14.5244 2.60908 13.8483C0.906637 12.2263 0.468458 9.6153 1.71353 7.49879L1.71466 7.49652C2.16788 6.73458 2.8048 6.09841 3.56682 5.64538C4.21456 5.26034 4.93563 5.01901 5.68133 4.9341C6.26079 2.66722 8.3487 1 10.8206 1ZM17.3213 12.3308L15.6251 11.3334L15.5279 17.0248C15.5243 17.2294 15.4129 17.4167 15.235 17.5178L10.1263 20.4127C10.1039 20.4254 10.0799 20.4365 10.0573 20.4489C10.3839 20.815 10.7727 21.1227 11.2084 21.3546C11.8151 21.6775 12.4922 21.8452 13.1793 21.8432H13.1816L13.3953 21.8375C15.5907 21.7282 17.3213 19.9495 17.3213 17.7903V12.3308ZM3.56795 14.5709C3.4084 15.0204 3.3291 15.4963 3.33841 15.9765C3.35177 16.6607 3.54102 17.33 3.88909 17.9192L3.89022 17.9204C5.03108 19.8587 7.56775 20.5304 9.55527 19.4051L14.3757 16.6731L14.4084 14.7541L9.32686 17.5234C9.15129 17.6191 8.93886 17.6163 8.76488 17.5178L3.65502 14.6229C3.62553 14.6062 3.59699 14.5881 3.56795 14.5709ZM5.52302 6.12824C5.04312 6.21746 4.5805 6.38947 4.15821 6.6405C3.56225 6.99482 3.06417 7.49317 2.70972 8.08907L2.70859 8.08794C1.5736 10.0205 2.24527 12.4942 4.22492 13.6154L9.05435 16.3508L10.7652 15.419L5.80684 12.4992C5.63018 12.3952 5.52189 12.2056 5.52189 12.0006V6.21079C5.52189 6.18322 5.52259 6.15571 5.52302 6.12824ZM9.62877 10.5441V13.405L11.9513 14.7733L14.4311 13.422L14.4786 10.6594L12.0441 9.2278L9.62877 10.5441ZM20.1074 6.07961C18.9665 4.14122 16.4309 3.46974 14.4435 4.59599L9.62877 7.32351V9.22554L14.673 6.47766C14.8487 6.382 15.0621 6.38473 15.2362 6.48332L20.3449 9.3782C20.3736 9.39446 20.4014 9.41237 20.4297 9.42908C20.5892 8.9795 20.6698 8.50376 20.6604 8.02348C20.6468 7.33919 20.4568 6.66992 20.1086 6.08075L20.1074 6.07961ZM18.4769 17.8717C18.9568 17.7825 19.4194 17.6117 19.8417 17.3606C20.363 17.0506 20.8091 16.6306 21.15 16.1314L21.2902 15.912C22.4249 13.9807 21.7547 11.5068 19.775 10.3858L14.9444 7.64918L13.2302 8.58211L18.1942 11.5019C18.3709 11.6059 18.4791 11.7955 18.4791 12.0006V17.7903C18.4791 17.8175 18.4773 17.8446 18.4769 17.8717ZM6.67978 11.6692L8.47088 12.7243V6.98653C8.47092 6.77827 8.58271 6.58618 8.76375 6.48332L13.8725 3.58843C13.8958 3.5752 13.9202 3.56283 13.9437 3.54998C13.1848 2.69816 12.0683 2.15809 10.8206 2.15795C8.52244 2.15795 6.67978 3.9817 6.67978 6.21079V11.6692Z" 
                            fill="currentColor"
                            className="text-primary-foreground"
                          />
                        </svg>                      
                    </div>
                  </div>
                  <div className="flex flex-[1_0_0] flex-col gap-[4px] items-start relative shrink-0">
                    <p className="font-medium leading-[20px] text-card-foreground text-[14px]">ChatGPT</p>
                    <p className="font-normal leading-[20px] text-muted-foreground text-[14px]">OpenAI</p>
                  </div>
                  <div className="flex items-center self-stretch">
                    <div className="border border-ring rounded-full shadow-sm shrink-0 size-[16px] relative flex items-center justify-center">
                       <div className="size-[8px] rounded-full bg-primary" />
                    </div>
                  </div>
                </div>

                {/* Gemini */}
                <div className="bg-card border border-border box-border flex flex-[1_0_0] gap-[12px] items-center overflow-hidden p-[16px] relative rounded-[8px] shrink-0">
                  <div className="bg-muted border border-border box-border flex gap-[10px] items-center justify-center relative rounded-[4px] shrink-0 size-[32px]">
                    <IconsGemini className="relative shrink-0 size-[24px]" />
                  </div>
                  <div className="flex flex-[1_0_0] flex-col gap-[4px] items-start relative shrink-0">
                    <p className="font-medium leading-[20px] text-card-foreground text-[14px]">Gemini</p>
                    <p className="font-normal leading-[20px] text-muted-foreground text-[14px]">Google</p>
                  </div>
                  <div className="flex items-center self-stretch">
                     <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-[16px]" />
                  </div>
                </div>

                {/* Claude */}
                <div className="bg-card border border-border box-border flex flex-[1_0_0] gap-[12px] items-center overflow-hidden p-[16px] relative rounded-[8px] shrink-0">
                  <div className="bg-muted border border-border box-border flex gap-[10px] items-center justify-center relative rounded-[4px] shrink-0 size-[32px]">
                    <IconsClaude className="relative shrink-0 size-[24px]" />
                  </div>
                  <div className="flex flex-[1_0_0] flex-col gap-[4px] items-start relative shrink-0">
                    <p className="font-medium leading-[20px] text-card-foreground text-[14px]">Claude</p>
                    <p className="font-normal leading-[20px] text-muted-foreground text-[14px]">Anthropic</p>
                  </div>
                  <div className="flex flex-col h-full items-center justify-between relative shrink-0">
                    <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-[16px]" />
                    <div className="relative shrink-0 size-[16px] flex items-center justify-center">
                        <Lock className="size-3" />
                    </div>
                  </div>
                </div>

                {/* Grok */}
                <div className="bg-card border border-border box-border flex flex-[1_0_0] gap-[12px] items-center overflow-hidden p-[16px] relative rounded-[8px] shrink-0">
                  <div className="bg-muted border border-border box-border flex gap-[10px] items-center justify-center relative rounded-[4px] shrink-0 size-[32px]">
                    <IconsGrok className="relative shrink-0 size-[24px]" />
                  </div>
                  <div className="flex flex-[1_0_0] flex-col gap-[4px] items-start relative shrink-0">
                    <p className="font-medium leading-[20px] text-card-foreground text-[14px]">Grok</p>
                    <p className="font-normal leading-[20px] text-muted-foreground text-[14px]">xAI</p>
                  </div>
                  <div className="flex flex-col h-full items-center justify-between relative shrink-0">
                     <div className="bg-background border border-border rounded-full shadow-sm shrink-0 size-[16px]" />
                     <div className="relative shrink-0 size-[16px] flex items-center justify-center">
                        <Lock className="size-3" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="flex gap-[10px] items-center justify-center w-full">
                <p className="font-medium leading-[20px] text-card-foreground text-[14px]">ChatGPT</p>
                <p className="font-normal leading-[20px] text-muted-foreground text-[14px]">
                  다재다능하고 안정적인 '표준'이며, 코드와 광범위한 통합에 강합니다.
                </p>
              </div>

              {/* Search Bar */}
              <div className="bg-background border border-border box-border flex flex-col gap-[10px] items-start justify-center pb-[12px] pt-[16px] px-[16px] relative rounded-[24px] shadow-sm shrink-0 w-full">
                <div className="flex flex-col gap-[10px] items-start justify-center relative shrink-0 w-full">
                  <input 
                    type="text" 
                    placeholder="무엇이든 물어보세요" 
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
                      <Button variant="ghost">빠른 모드<ChevronDown className="size-4 relative shrink-0 ml-2" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="start">
                      <DropdownMenuLabel>My Account</DropdownMenuLabel>
                      <DropdownMenuGroup>
                        <DropdownMenuItem>
                          Profile
                          <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          Billing
                          <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          Settings
                          <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          Keyboard shortcuts
                          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem>Team</DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Invite users</DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem>Email</DropdownMenuItem>
                              <DropdownMenuItem>Message</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>More...</DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                        <DropdownMenuItem>
                          New Team
                          <DropdownMenuShortcut>⌘+T</DropdownMenuShortcut>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>GitHub</DropdownMenuItem>
                      <DropdownMenuItem>Support</DropdownMenuItem>
                      <DropdownMenuItem disabled>API</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        Log out
                        <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Mic className="text-primary size-[24px]" />                                    
                </div>
              </div>

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
        </div>
      </div>
      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />
    </div>
  );
}
