const DARK_BG_COLOR_MAP: Record<string, string> = {
  "slate-100": "dark:bg-slate-800",
  "gray-100": "dark:bg-gray-800",
  "zinc-100": "dark:bg-zinc-800",
  "neutral-100": "dark:bg-neutral-800",
  "stone-100": "dark:bg-stone-800",
  "red-100": "dark:bg-red-900/60",
  "orange-100": "dark:bg-orange-900/60",
  "amber-100": "dark:bg-amber-900/60",
  "yellow-100": "dark:bg-yellow-900/60",
  "lime-100": "dark:bg-lime-900/60",
  "green-100": "dark:bg-green-900/60",
  "emerald-100": "dark:bg-emerald-900/60",
  "teal-100": "dark:bg-teal-900/60",
  "cyan-100": "dark:bg-cyan-900/60",
  "sky-100": "dark:bg-sky-900/60",
  "blue-100": "dark:bg-blue-900/60",
  "indigo-100": "dark:bg-indigo-900/60",
  "violet-100": "dark:bg-violet-900/60",
  "purple-100": "dark:bg-purple-900/60",
  "fuchsia-100": "dark:bg-fuchsia-900/60",
  "pink-100": "dark:bg-pink-900/60",
  "rose-100": "dark:bg-rose-900/60",
}

export function getBgColorClasses(bgColor?: string | null) {
  if (!bgColor) return ""
  const light = `bg-${bgColor}`
  const dark = DARK_BG_COLOR_MAP[bgColor] || ""
  return [light, dark].filter(Boolean).join(" ")
}
