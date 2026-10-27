/** Only paths on this site: `//evil.example` and absolute URLs fall back to the overview. */
export function safeRedirect(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/"
}

/** The app's pages, for the sidebar and the ⌘K palette. `key` is the `g` shortcut's second key. */
export const MAIN_PAGES = [
  { get label() { return translate('overview') }, icon: "i-lucide-layout-dashboard", to: "/", key: "o" },
  { get label() { return translate('transactions') }, icon: "i-lucide-arrow-left-right", to: "/transactions", key: "t" },
  { get label() { return translate('accounts') }, icon: "i-lucide-wallet-cards", to: "/accounts", key: "a" },
  { get label() { return translate('recurring') }, icon: "i-lucide-repeat", to: "/recurring", key: "r" },
  { get label() { return translate('forecast') }, icon: "i-lucide-chart-line", to: "/forecast", key: "f" },
  { get label() { return translate('budgets') }, icon: "i-lucide-chart-pie", to: "/budgets", key: "b" },
  { get label() { return translate('goals') }, icon: "i-lucide-target", to: "/goals", key: "g" },
] as const

/** Where money comes in from, one page per kind of provider (`connectPageOf` in utils/accounts.ts). */
export const CONNECT_PAGES = [
  { get label() { return translate('banks') }, icon: "i-lucide-landmark", to: "/connect/banks", key: "c" },
  { get label() { return translate('cryptoInvestments') }, icon: "i-lucide-bitcoin", to: "/connect/crypto", key: "k" },
] as const

export const SECONDARY_PAGES = [
  { get label() { return translate('household') }, icon: "i-lucide-users", to: "/household", key: "h" },
  { get label() { return translate('settings') }, icon: "i-lucide-settings", to: "/settings", key: "s" },
] as const
