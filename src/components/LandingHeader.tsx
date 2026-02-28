import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { Eclipse, Menu, X } from "lucide-react"
import { useTheme } from "@/hooks/useTheme"
import { LoginModal } from "@/components/LoginModal"
import { Button } from "@/components/ui/button"
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

const NAV_ITEMS = [
  { to: "/product", label: "제품" },
  { to: "/pricing", label: "가격" },
  { to: "/models", label: "LLM 모델" },
  { to: "/about", label: "회사소개" },
  { to: "/contact", label: "문의" },
]

export function LandingHeader() {
  const { toggleTheme } = useTheme()
  const location = useLocation()
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [languages, setLanguages] = React.useState<Language[]>([])
  const [currentLang, setCurrentLang] = React.useState("")

  React.useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const res = await fetch("/api/i18n/languages")
        if (res.ok) {
          const data = await res.json()
          const activeLangs = (data || []).filter((l: Language) => l.is_active !== false)
          setLanguages(activeLangs)
          if (activeLangs.length > 0) {
            const def = activeLangs.find((l: Language) => l.is_default)?.code || activeLangs[0].code
            setCurrentLang(def)
          }
        }
      } catch {
        // silent
      }
    }
    fetchLanguages()
  }, [])

  React.useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-1">
              <span className="text-lg font-black text-primary">reduct</span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:!text-foreground ${
                    location.pathname === item.to
                      ? "!text-foreground"
                      : "!text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsLoginModalOpen(true)}
              size="sm"
              className="hidden sm:inline-flex"
            >
              로그인 및 회원가입
            </Button>

            {languages.length > 0 && (
              <Select value={currentLang} onValueChange={setCurrentLang}>
                <SelectTrigger className="hidden h-9 w-[120px] sm:flex">
                  <SelectValue placeholder="언어" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.flag_emoji} {lang.native_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="테마 전환">
              <Eclipse className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="메뉴"
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-border/40 bg-background px-6 pb-4 md:hidden">
            <nav className="flex flex-col gap-1 pt-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent ${
                    location.pathname === item.to
                      ? "!text-foreground bg-accent"
                      : "!text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-2">
              <Button onClick={() => setIsLoginModalOpen(true)} size="sm" className="w-full">
                로그인 및 회원가입
              </Button>
              {languages.length > 0 && (
                <Select value={currentLang} onValueChange={setCurrentLang}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="언어" />
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.flag_emoji} {lang.native_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}
      </header>

      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />
    </>
  )
}
