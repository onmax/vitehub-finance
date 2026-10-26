// Category colors are Tailwind palette names (shared/categories.ts CATEGORY_COLORS). Tailwind only emits classes it
// finds in source, so each color's classes are written out here in full.
import type { CATEGORY_COLORS } from "#shared/categories"

export type CategoryColor = (typeof CATEGORY_COLORS)[number]

interface ColorClasses {
  /** A solid swatch: dots, bars. */
  solid: string
  /** A tinted tile behind an icon. */
  soft: string
}

const COLORS: Record<CategoryColor, ColorClasses> = {
  neutral: { solid: "bg-neutral-400", soft: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-300" },
  zinc: { solid: "bg-zinc-500", soft: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" },
  stone: { solid: "bg-stone-500", soft: "bg-stone-500/10 text-stone-600 dark:text-stone-300" },
  red: { solid: "bg-red-500", soft: "bg-red-500/10 text-red-600 dark:text-red-400" },
  orange: { solid: "bg-orange-500", soft: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  amber: { solid: "bg-amber-500", soft: "bg-amber-500/12 text-amber-700 dark:text-amber-400" },
  yellow: { solid: "bg-yellow-500", soft: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  lime: { solid: "bg-lime-500", soft: "bg-lime-500/15 text-lime-700 dark:text-lime-400" },
  green: { solid: "bg-green-500", soft: "bg-green-500/10 text-green-700 dark:text-green-400" },
  emerald: { solid: "bg-emerald-500", soft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  teal: { solid: "bg-teal-500", soft: "bg-teal-500/10 text-teal-700 dark:text-teal-400" },
  cyan: { solid: "bg-cyan-500", soft: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" },
  sky: { solid: "bg-sky-500", soft: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  blue: { solid: "bg-blue-500", soft: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  indigo: { solid: "bg-indigo-500", soft: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  violet: { solid: "bg-violet-500", soft: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  fuchsia: { solid: "bg-fuchsia-500", soft: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" },
  pink: { solid: "bg-pink-500", soft: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
  rose: { solid: "bg-rose-500", soft: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
}

export const categoryColor = (color: string | null | undefined): ColorClasses =>
  COLORS[(color ?? "neutral") as CategoryColor] ?? COLORS.neutral

export const CATEGORY_COLOR_NAMES = Object.keys(COLORS) as CategoryColor[]

/** Icons people can pick for a category or goal. All are in nuxt.config's client bundle. */
export const CATEGORY_ICONS = [
  "i-lucide-shopping-cart",
  "i-lucide-utensils",
  "i-lucide-house",
  "i-lucide-zap",
  "i-lucide-car",
  "i-lucide-heart-pulse",
  "i-lucide-plane",
  "i-lucide-film",
  "i-lucide-shirt",
  "i-lucide-repeat",
  "i-lucide-gift",
  "i-lucide-graduation-cap",
  "i-lucide-receipt",
  "i-lucide-banknote",
  "i-lucide-briefcase",
  "i-lucide-arrow-left-right",
  "i-lucide-baby",
  "i-lucide-dog",
  "i-lucide-dumbbell",
  "i-lucide-smartphone",
  "i-lucide-circle-help",
]

export const GOAL_ICONS = [
  "i-lucide-target",
  "i-lucide-umbrella",
  "i-lucide-palmtree",
  "i-lucide-key-round",
  "i-lucide-bike",
  "i-lucide-house",
  "i-lucide-car",
  "i-lucide-plane",
  "i-lucide-graduation-cap",
  "i-lucide-baby",
  "i-lucide-gift",
  "i-lucide-piggy-bank",
  "i-lucide-heart-pulse",
]
