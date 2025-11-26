import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // 로컬 스토리지에서 테마 가져오기
    const savedTheme = localStorage.getItem('theme') as Theme
    if (savedTheme) {
      return savedTheme
    }
    
    // 시스템 설정 확인
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    
    return 'light'
  })

  useEffect(() => {
    const root = window.document.documentElement
    
    // 클래스 제거
    root.classList.remove('light', 'dark')
    
    // 현재 테마 클래스 추가
    root.classList.add(theme)
    
    // 로컬 스토리지에 저장
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  return { theme, toggleTheme }
} 