import type { ComponentType, SVGProps } from "react"
import type { CardBrand } from "@/lib/billingFlow"
import { CardAmex } from "@/components/icons/CardAmex"
import { CardJcb } from "@/components/icons/CardJcb"
import { CardMaster } from "@/components/icons/CardMaster"
import { CardUnion } from "@/components/icons/CardUnion"
import { CardVisa } from "@/components/icons/CardVisa"

export function normalizeCardNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 16)
}

export function formatCardNumber(value: string): string {
  const digits = normalizeCardNumber(value)
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ")
}

export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function normalizeCvv(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4)
}

export function parseExpiry(value: string): { month: number | null; year: number | null } {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (!digits) return { month: null, year: null }
  const month = digits.length >= 2 ? Number(digits.slice(0, 2)) : null
  const year = digits.length >= 4 ? Number(`20${digits.slice(2)}`) : null
  return { month: Number.isFinite(month) ? month : null, year: Number.isFinite(year) ? year : null }
}

export function detectCardBrand(rawDigits: string): CardBrand | null {
  const digits = rawDigits.replace(/\D/g, "")
  if (digits.length < 4) return null
  const first2 = Number(digits.slice(0, 2))
  const first4 = Number(digits.slice(0, 4))

  if (digits.startsWith("4")) return "visa"
  if ((first2 >= 51 && first2 <= 55) || (first4 >= 2221 && first4 <= 2720)) return "master"
  if (digits.startsWith("34") || digits.startsWith("37")) return "amex"
  if (first4 >= 3528 && first4 <= 3589) return "jcb"
  if (digits.startsWith("62")) return "union"
  return null
}

export function formatExpiryLabel(month?: number | null, year?: number | null): string {
  if (!month || !year) return "MM/YY"
  const mm = String(month).padStart(2, "0")
  const yy = String(year).slice(-2)
  return `${mm}/${yy}`
}

export type CardBrandIcon = ComponentType<SVGProps<SVGSVGElement>>

const CARD_BRAND_ICONS: Record<CardBrand, CardBrandIcon> = {
  visa: CardVisa,
  master: CardMaster,
  amex: CardAmex,
  jcb: CardJcb,
  union: CardUnion,
}

export function normalizeCardBrand(value: unknown): CardBrand | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!raw) return null
  if (raw === "mastercard") return "master"
  if (raw === "unionpay") return "union"
  if (raw === "amex") return "amex"
  if (raw === "visa" || raw === "master" || raw === "jcb" || raw === "union") return raw as CardBrand
  return null
}

export function getCardBrandIcon(brand: CardBrand | null | undefined): CardBrandIcon | null {
  if (!brand) return null
  return CARD_BRAND_ICONS[brand] ?? null
}

export function getCardBrandIconFromValue(value: unknown): CardBrandIcon | null {
  return getCardBrandIcon(normalizeCardBrand(value))
}

export function cardLabel(brand: CardBrand): string {
  switch (brand) {
    case "visa":
      return "Visa"
    case "master":
      return "Mastercard"
    case "amex":
      return "Amex"
    case "jcb":
      return "JCB"
    case "union":
      return "UnionPay"
    default:
      return "Card"
  }
}

export function cardBg(brand: CardBrand): string {
  switch (brand) {
    case "visa":
      return "bg-[#1a1f71]"
    case "master":
      return "bg-neutral-100 dark:bg-neutral-800"
    case "amex":
      return "bg-[#006fcf]"
    case "jcb":
      return "bg-neutral-100 dark:bg-neutral-800"
    case "union":
      return "bg-neutral-100 dark:bg-neutral-800"
    default:
      return "bg-neutral-100 dark:bg-neutral-800"
  }
}
