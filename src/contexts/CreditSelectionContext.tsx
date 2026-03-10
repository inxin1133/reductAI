import * as React from "react"

type CreditSelectionContextValue = {
  selectedAccountId: string | null
  planTier: string | null
  selectedTabHasCredits: boolean
  /** 선택된 계정의 남은 크레딧. 모델별 선검증(마지막 구간) 판단에 사용 */
  remainingCredits: number
  setSelection: (accountId: string | null, planTier: string | null) => void
  setSelectedTabHasCredits: (hasCredits: boolean) => void
  setRemainingCredits: (credits: number) => void
}

const CreditSelectionContext = React.createContext<CreditSelectionContextValue | null>(null)

export function CreditSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null)
  const [planTier, setPlanTier] = React.useState<string | null>(null)
  const [selectedTabHasCredits, setSelectedTabHasCredits] = React.useState(true)
  const [remainingCredits, setRemainingCredits] = React.useState(0)

  const setSelection = React.useCallback((accountId: string | null, tier: string | null) => {
    setSelectedAccountId(accountId)
    setPlanTier(tier)
  }, [])

  const value = React.useMemo(
    () => ({
      selectedAccountId,
      planTier,
      selectedTabHasCredits,
      remainingCredits,
      setSelection,
      setSelectedTabHasCredits,
      setRemainingCredits,
    }),
    [selectedAccountId, planTier, selectedTabHasCredits, remainingCredits, setSelection]
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
