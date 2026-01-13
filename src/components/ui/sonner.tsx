import { Toaster as Sonner } from "sonner"
import type { ToasterProps } from "sonner"
import type { CSSProperties } from "react"
import { useEffect, useState } from "react"

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<ToasterProps["theme"]>("system")

  // This project doesn't currently wrap the app with next-themes' ThemeProvider,
  // so derive theme from the root html class.
  useEffect(() => {
    const el = document.documentElement
    const apply = () => {
      setTheme(el.classList.contains("dark") ? "dark" : "light")
    }
    apply()
    const obs = new MutationObserver(apply)
    obs.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
