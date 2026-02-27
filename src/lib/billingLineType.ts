export type BillingLineType =
  | "subscription"
  | "seat_overage"
  | "topup"
  | "adjustment"
  | "refund"
  | "upgrade"
  | "downgrade"

export const LINE_TYPE_CONFIG: Record<BillingLineType, { label: string; className: string }> = {
  subscription: { label: "서비스 구독", className: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  seat_overage: { label: "좌석 추가", className: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" },
  topup: { label: "크레딧 충전", className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  adjustment: { label: "조정", className: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  refund: { label: "환불", className: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400" },
  upgrade: { label: "업그레이드", className: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" },
  downgrade: { label: "다운그레이드", className: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" },
}
