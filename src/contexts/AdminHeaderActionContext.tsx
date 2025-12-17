import { createContext, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"

type AdminHeaderActionContextType = {
  action: ReactNode | null
  setAction: (node: ReactNode | null) => void
  title: string
  setTitle: (title: string) => void
}

const AdminHeaderActionContext = createContext<AdminHeaderActionContextType | undefined>(undefined)

export function AdminHeaderActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<ReactNode | null>(null)
  const [title, setTitle] = useState<string>("")

  return (
    <AdminHeaderActionContext.Provider value={{ action, setAction, title, setTitle }}>
      {children}
    </AdminHeaderActionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminHeaderActionContext() {
  const ctx = useContext(AdminHeaderActionContext)
  if (!ctx) {
    throw new Error("useAdminHeaderActionContext must be used within AdminHeaderActionProvider")
  }
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminHeaderAction(node: ReactNode | null) {
  const { setAction } = useAdminHeaderActionContext()
  // Set on mount/update and clear on unmount
  useEffect(() => {
    setAction(node)
    return () => setAction(null)
  }, [node, setAction])
}
