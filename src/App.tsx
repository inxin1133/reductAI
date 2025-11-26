import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ThemeToggle"
import './App.css'

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Vite + Shadcn UI</h1>          
          <ThemeToggle />
        </div>

      
        
        <div className="space-y-4">
          <div className="p-6 bg-card border rounded-lg">
            <h2 className="text-xl font-semibold mb-4">버튼 예시</h2>
            <div className="flex gap-4 flex-wrap">
              <Button variant="default">Default</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>
          
          <div className="p-6 bg-card border rounded-lg">
            <h2 className="text-xl font-semibold mb-4">다크모드 테스트</h2>
            <p className="text-muted-foreground">
              이 텍스트는 다크모드에서 색상이 자동으로 변경됩니다. 
              오른쪽 상단의 토글 버튼을 클릭하여 다크모드를 전환해보세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
