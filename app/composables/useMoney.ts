import { currentFormatLocale } from "~/lib/i18n"
import { scaleLinear } from "d3-scale"
import { type FormatMoneyOptions, formatMoney } from "#shared/money"

/**
 * formatMoney in the person's display currency and the active language. `currency` is the household's, which totals and
 * budgets are kept in; `display` is the one amounts are shown in. `format` converts; `formatOriginal` doesn't.
 */
export function useMoney() {
  const { currency: display, household: currency } = useDisplayCurrency()
  const convert = useConvert()
  const locale = computed(currentFormatLocale)
  const formatOriginal = (minor: number, currencyCode?: string | null, options: FormatMoneyOptions = {}) =>
    formatMoney(minor, currencyCode || currency.value, { ...options, locale: locale.value })
  const format = (minor: number, currencyCode?: string | null, options: FormatMoneyOptions = {}) => {
    const from = currencyCode || currency.value
    const converted = convert(minor, from)
    return converted === null ? formatOriginal(minor, from, options) : formatMoney(converted, display.value, { ...options, locale: locale.value })
  }
  /** Whether `format` shows this currency's amounts converted, so the original is worth showing too. */
  const converts = (currencyCode?: string | null) => {
    const from = currencyCode || currency.value
    return from !== display.value && convert(0, from) !== null
  }
  /**
   * Gridline values for a chart axis in the household's currency, picked so they read as round numbers once `format`
   * converts them: 5,000 kr rather than 5,423 kr.
   */
  const ticks = (domain: [number, number], count: number) => {
    const rate = (convert(100_000_000, currency.value) ?? 0) / 100_000_000
    if (!rate || rate === 1) return scaleLinear().domain(domain).ticks(count)
    return scaleLinear().domain([domain[0] * rate, domain[1] * rate]).ticks(count).map((tick) => tick / rate)
  }
  return { currency, display, format, formatOriginal, converts, ticks, locale }
}
