/** Only paths on this site: `//evil.example` and absolute URLs fall back to the overview. */
export function safeRedirect(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/"
}

/** The app's pages, for the sidebar and the ⌘K palette. `key` is the `g` shortcut's second key. */
export const MAIN_PAGES = [
  { label: "Overview", icon: "i-lucide-layout-dashboard", to: "/", key: "o" },
  { label: "Transactions", icon: "i-lucide-arrow-left-right", to: "/transactions", key: "t" },
  { label: "Accounts", icon: "i-lucide-landmark", to: "/accounts", key: "a" },
  { label: "Recurring", icon: "i-lucide-repeat", to: "/recurring", key: "r" },
  { label: "Forecast", icon: "i-lucide-chart-line", to: "/forecast", key: "f" },
  { label: "Budgets", icon: "i-lucide-chart-pie", to: "/budgets", key: "b" },
  { label: "Goals", icon: "i-lucide-target", to: "/goals", key: "g" },
  { label: "Connect", icon: "i-lucide-plug", to: "/connect", key: "c" },
] as const

export const SECONDARY_PAGES = [
  { label: "Household", icon: "i-lucide-users", to: "/household", key: "h" },
  { label: "Settings", icon: "i-lucide-settings", to: "/settings", key: "s" },
] as const
