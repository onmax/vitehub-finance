import { type FormatMoneyOptions, formatMoney } from "#shared/money"

/** formatMoney with the household's currency and the browser's locale. */
export function useMoney() {
  const { data: me } = useMe()
  const currency = computed(() => me.value?.household.currency ?? "EUR")
  const locale = typeof navigator === "undefined" ? undefined : navigator.language
  const format = (minor: number, currencyCode?: string | null, options: FormatMoneyOptions = {}) =>
    formatMoney(minor, currencyCode || currency.value, { locale, ...options })
  return { currency, format, locale }
}
