export type CardBrand = "visa" | "master" | "amex" | "jcb" | "union"

export type BillingCardProfile = {
  brand?: CardBrand
  last4?: string
  holder?: string
  expiry?: string
}

export type BillingInfoProfile = {
  name: string
  email: string
  postalCode: string
  address1: string
  address2: string
  extraAddress: string
  phone: string
}

const BILLING_CARD_STORAGE_KEY = "reductai:billing:card"
const BILLING_INFO_STORAGE_KEY = "reductai:billing:info"

export function readBillingCard(): BillingCardProfile | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(BILLING_CARD_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as BillingCardProfile
  } catch {
    return null
  }
}

export function writeBillingCard(profile: BillingCardProfile) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(BILLING_CARD_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // ignore
  }
}

export function readBillingInfo(): BillingInfoProfile | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(BILLING_INFO_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as BillingInfoProfile
  } catch {
    return null
  }
}

export function writeBillingInfo(profile: BillingInfoProfile) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(BILLING_INFO_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // ignore
  }
}

export function hasBillingCard(): boolean {
  const card = readBillingCard()
  return Boolean(card?.brand && card?.last4)
}

export function hasBillingInfo(): boolean {
  const info = readBillingInfo()
  return Boolean(info?.name && info?.email && info?.address1)
}
