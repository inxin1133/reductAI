import * as React from "react"
import { Sidebar } from "@/components/Sidebar"
import { UserHeader } from "@/components/UserHeader"
import { Button } from "@/components/ui/button"
import { Copy, Volume2, Repeat, ChevronsLeft, PencilLine, GalleryVerticalEnd } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChatInterface } from "@/components/ChatInterface"


import { IconChatGPT } from "@/components/icons/IconChatGPT"

// 더미 데이터: 사이드바 히스토리 메뉴
const HISTORY_MENU = [
  "CMA 설명",
  "이모지 사용 방법",
  "Test 확인 요청",
  "API 인증키",
  "AI 추천 질문 10가지"
]

export default function Timeline() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

  return (
    <div className="bg-background relative w-full h-screen overflow-hidden flex font-sans">
      {/* Global Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-row h-full w-full bg-background relative">
        
        {/* Timeline Sidebar (Local) */}
        {isSidebarOpen && (
          <div className="w-[200px] border-r border-border h-full flex flex-col px-2 py-4 bg-background shrink-0">
             <div className="flex flex-col gap-1 w-full">
               {HISTORY_MENU.map((item, index) => (
                 <div 
                   key={index}
                   className={cn(
                     "flex items-center px-2 py-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors w-full h-8",
                     index === 0 ? "bg-accent" : "" // 첫 번째 아이템 활성화 상태 예시
                   )}
                 >
                   <p className="text-sm text-foreground truncate w-full">{item}</p>
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* Chat Content Area */}
        <div className="flex-1 flex flex-col h-full relative">
           {/* Header */}
           <UserHeader 
             leftContent={
               <div className="flex items-center">
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   className="size-4 p-0 hover:bg-transparent"
                   onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                 >
                   {isSidebarOpen ? (
                     <ChevronsLeft className="size-4" />
                   ) : (
                     <GalleryVerticalEnd className="size-4" />
                   )}
                 </Button>
               </div>
             }
           >
             {/* Header Center Button: Page Save & Edit */}
             <div className="bg-background border border-border flex items-center justify-center gap-[6px] px-3 h-[32px] rounded-lg shadow-sm cursor-pointer hover:bg-accent/50 transition-colors">
               <PencilLine className="size-4" />
               <span className="text-sm font-medium">페이지 저장 및 편집</span>
             </div>
           </UserHeader>

           {/* Chat Messages Scroll Area */}
           <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 items-center">
             
             {/* User Question */}
             <div className="w-full max-w-[800px] flex justify-end">
               <div className="flex items-end gap-2 lg:w-full">

                 <div className="flex lg:flex-row flex-col-reverse gap-4 w-full justify-end items-end lg:items-start">
                    <div className="bg-secondary p-3 rounded-lg max-w-[720px]">
                      <p className="text-base text-primary whitespace-pre-wrap">CMA에 대해 자세히 설명 부탁해</p>
                    </div>
                    {/* User Avatar */}
                    <div className="size-6 bg-teal-500 rounded-[4px] flex items-center justify-center shrink-0">
                      <span className="text-white text-sm font-bold">김</span>
                    </div>
                 </div>
               </div>
             </div>

             {/* AI Answer */}
             <div className="w-full max-w-[800px] flex lg:flex-row flex-col  justify-start gap-4">
                {/* AI Avatar */}
                <div className="size-6 bg-primary rounded-[4px] flex items-center justify-center shrink-0">
                  <div className="size-4 flex items-center justify-center relative">
                      <IconChatGPT className="size-full text-primary-foreground" />
                  </div>
                </div>

                <div className="flex flex-col gap-4 max-w-[720px]">
                   <div className="text-base text-primary whitespace-pre-wrap">
                     <p>좋아요 😊</p>
                     <p>“CMA”는 문맥에 따라 의미가 조금 달라질 수 있는데,</p>
                     <p>보통 금융/투자 분야에서 많이 쓰이는 용어로는 **“Cash Management Account (현금 관리 계좌)”**를 뜻합니다.</p>
                     <p>혹시 다른 분야(예: 부동산 CMA, 마케팅 CMA 등)를 말하는 것인지요?</p>
                     <p>우선 가장 일반적인 금융 CMA 기준으로 자세히 설명드릴게요.</p>
                   </div>
                   
                   <div className="h-px w-full bg-border" />

                   <div className="flex flex-col gap-1">
                     <p className="text-lg font-semibold">🏦 주요 특징</p>
                     
                     <div className="w-full border border-border rounded-md overflow-hidden">
                       {/* Table Header/Row 1 */}
                       <div className="flex border-b border-border bg-muted/50">
                         <div className="w-[150px] p-2 font-bold text-sm border-r border-border">구분</div>
                         <div className="flex-1 p-2 font-bold text-sm">설명</div>
                       </div>
                       {/* Rows */}
                       <div className="flex border-b border-border">
                         <div className="w-[150px] p-2 font-medium text-sm border-r border-border">운용 주체</div>
                         <div className="flex-1 p-2 text-sm">주로 증권사 (미래에셋, 삼성, 한국투자, NH, 키움 등)</div>
                       </div>
                       <div className="flex border-b border-border">
                         <div className="w-[150px] p-2 font-medium text-sm border-r border-border">기본 구조</div>
                         <div className="flex-1 p-2 text-sm">고객이 넣은 돈을 단기 금융상품(예: RP, MMF 등) 으로 자동 투자</div>
                       </div>
                       <div className="flex border-b border-border">
                         <div className="w-[150px] p-2 font-medium text-sm border-r border-border">예금자보호 여부</div>
                         <div className="flex-1 p-2 text-sm">❌ 보호되지 않음 (은행 예금과 달리 투자상품이기 때문)</div>
                       </div>
                       <div className="flex border-b border-border">
                         <div className="w-[150px] p-2 font-medium text-sm border-r border-border">출금 및 결제 기능</div>
                         <div className="flex-1 p-2 text-sm">✔️ 체크카드/이체/자동이체/공과금 납부 등 가능</div>
                       </div>
                       <div className="flex border-b border-border">
                         <div className="w-[150px] p-2 font-medium text-sm border-r border-border">이자(수익)</div>
                         <div className="flex-1 p-2 text-sm">매일 운용 상품에 따라 하루 단위 수익 발생</div>
                       </div>
                       <div className="flex">
                         <div className="w-[150px] p-2 font-medium text-sm border-r border-border">가입 대상</div>
                         <div className="flex-1 p-2 text-sm">누구나 (개인/법인 모두 가능)</div>
                       </div>
                     </div>
                   </div>

                   {/* Action Buttons */}
                   <div className="flex gap-3 items-center">
                     <Copy className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                     <Volume2 className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                     <Repeat className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                     <span className="text-sm text-card-foreground">모델: GPT-4o</span>
                   </div>
                </div>
             </div>

           </div>

           {/* Bottom Panel - Timeline 하단 패널 (ChatInterface compact 모드로 대체) */}
           <div className="p-4 flex flex-col items-center gap-2 w-full">
             <ChatInterface variant="compact" />
           </div>
        </div>
      </div>
    </div>
  )
}

