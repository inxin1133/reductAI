import * as React from "react"

type CreditSelectionContextValue = {
  selectedAccountId: string | null
  planTier: string | null
  setSelection: (accountId: string | null, planTier: string | null) => void
}

const CreditSelectionContext = React.createContext<CreditSelectionContextValue | null>(null)

export function CreditSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null)
  const [planTier, setPlanTier] = React.useState<string | null>(null)

  const setSelection = React.useCallback((accountId: string | null, tier: string | null) => {
    setSelectedAccountId(accountId)
    setPlanTier(tier)
  }, [])

  const value = React.useMemo(
    () => ({ selectedAccountId, planTier, setSelection }),
    [selectedAccountId, planTier, setSelection]
  )

  return (
    <CreditSelectionContext.Provider value={value}>
      {children}
    </CreditSelectionContext.Provider>
  )
}

export function useCreditSelection() {
  return React.useContext(CreditSelectionContext)
}
