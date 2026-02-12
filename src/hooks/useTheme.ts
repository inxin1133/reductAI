import { useState, useEffect, useMemo, useCallback, useRef } from 'react'

type Theme = 'light' | 'dark'
type ThemeMode = Theme | 'system'

const getSystemTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme') as ThemeMode | null
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved
    }
    return 'system'
  })
  const themeModeRef = useRef(themeMode)
  useEffect(() => {
    themeModeRef.current = themeMode
  }, [themeMode])
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme())
  const resolvedTheme = useMemo<Theme>(() => {
    return themeMode === 'system' ? systemTheme : themeMode
  }, [systemTheme, themeMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = window.document.documentElement

    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)

    localStorage.setItem('theme', themeMode)
    window.dispatchEvent(new CustomEvent('reductai:theme-mode', { detail: { mode: themeMode } }))
  }, [resolvedTheme, themeMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light')
    update()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    // Safari legacy
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isValid = (mode: unknown): mode is ThemeMode =>
      mode === 'light' || mode === 'dark' || mode === 'system'
    const handleCustom = (ev: Event) => {
      const next = (ev as CustomEvent<{ mode?: ThemeMode }>).detail?.mode
      if (!isValid(next)) return
      if (next === themeModeRef.current) return
      setThemeMode(next)
    }
    const handleStorage = (ev: StorageEvent) => {
      if (ev.key !== 'theme') return
      const next = ev.newValue
      if (!isValid(next)) return
      if (next === themeModeRef.current) return
      setThemeMode(next)
    }
    window.addEventListener('reductai:theme-mode', handleCustom as EventListener)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('reductai:theme-mode', handleCustom as EventListener)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      const base = prev === 'system' ? resolvedTheme : prev
      return base === 'light' ? 'dark' : 'light'
    })
  }, [resolvedTheme])

  return { theme: resolvedTheme, themeMode, setThemeMode, toggleTheme }
} 