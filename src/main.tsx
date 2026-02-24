import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

function installSessionExpiryGuard() {
  if (typeof window === 'undefined') return
  const win = window as typeof window & {
    __reductaiSessionGuardInstalled?: boolean
    __reductaiHandlingSessionExpired?: boolean
  }
  if (win.__reductaiSessionGuardInstalled) return
  win.__reductaiSessionGuardInstalled = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const res = await originalFetch(...args)
    if (res.status === 401) {
      const token = window.localStorage.getItem('token')
      if (token) {
        let message = ''
        try {
          const rawText = await res.clone().text()
          if (rawText) {
            try {
              const parsed = JSON.parse(rawText)
              if (parsed && typeof parsed.message === 'string') {
                message = parsed.message
              } else {
                message = rawText
              }
            } catch {
              message = rawText
            }
          }
        } catch {
          // ignore
        }
        if (message.includes('Session expired')) {
          if (!win.__reductaiHandlingSessionExpired) {
            win.__reductaiHandlingSessionExpired = true
            try {
              window.localStorage.removeItem('token')
              window.localStorage.removeItem('user_email')
              window.localStorage.removeItem('user_name')
              window.localStorage.removeItem('user_id')
            } catch {
              // ignore
            }
            if (window.location.pathname !== '/') {
              window.location.replace('/')
            } else {
              window.location.reload()
            }
          }
        }
      }
    }
    return res
  }
}

installSessionExpiryGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
