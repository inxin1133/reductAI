const COMMON_COUNTRY_CODES = [
  "1",
  "7",
  "20",
  "27",
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "39",
  "40",
  "41",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "81",
  "82",
  "84",
  "86",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "98",
]

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15)
}

function pickCountryCode(digits: string): string {
  if (!digits) return ""
  for (let len = 3; len >= 1; len -= 1) {
    const code = digits.slice(0, len)
    if (COMMON_COUNTRY_CODES.includes(code)) return code
  }
  return digits.length >= 2 ? digits.slice(0, 2) : digits.slice(0, 1)
}

function formatKoreanNumber(digits: string): string {
  if (!digits) return ""
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

function formatInternationalRest(digits: string): string {
  if (!digits) return ""
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

export function formatPhone(value: string): string {
  const digits = normalizePhoneDigits(value)
  if (!digits) return ""
  if (digits.length > 11) {
    const code = pickCountryCode(digits)
    const rest = digits.slice(code.length)
    if (!rest) return code
    if (code === "82") {
      const local = formatKoreanNumber(`0${rest}`)
      return `${code}-${local.replace(/^0/, "")}`
    }
    return `${code}-${formatInternationalRest(rest)}`
  }
  return formatKoreanNumber(digits)
}
