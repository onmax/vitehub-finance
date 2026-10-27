import { currentFormatLocale } from "~/lib/i18n"
import { type FormatMoneyOptions, formatMoney } from "#shared/money"

/** formatMoney with the household's currency and the active language. */
export function useMoney() {
  const { data: me } = useMe()
  const currency = computed(() => me.value?.household.currency ?? "EUR")
  const locale = computed(currentFormatLocale)
  const format = (minor: number, currencyCode?: string | null, options: FormatMoneyOptions = {}) =>
    formatMoney(minor, currencyCode || currency.value, { ...options, locale: locale.value })
  return { currency, format, locale }
}
