const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  KRW: 0,
  JPY: 0,
  CNY: 2,
  HKD: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
}

export function normalizeCurrency(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : ""
  return raw
}

export function currencyDecimals(currency: string): number {
  const key = normalizeCurrency(currency)
  return CURRENCY_DECIMALS[key] ?? 2
}

export function roundMoney(value: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency)
  return Math.round(value * factor) / factor
}

export function roundMoneyByDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function currencySymbol(currency: string): string {
  const key = normalizeCurrency(currency)
  switch (key) {
    case "KRW":
      return "₩"
    case "USD":
      return "$"
    case "JPY":
      return "¥"
    case "EUR":
      return "€"
    case "GBP":
      return "£"
    case "CNY":
      return "¥"
    case "HKD":
      return "HK$"
    case "SGD":
      return "S$"
    case "AUD":
      return "A$"
    case "CAD":
      return "C$"
    default:
      return key ? `${key} ` : ""
  }
}

export function formatMoney(value: number, currency: string, locale = "ko-KR"): string {
  const decimals = currencyDecimals(currency)
  return value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatMoneyWithCode(value: unknown, currency?: string, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "-"
  const n = Number(value)
  if (!Number.isFinite(n)) return "-"
  const code = currency || "USD"
  return `${code} ${n.toFixed(decimals)}`
}
