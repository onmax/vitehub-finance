import type { FxRates } from "#shared/api"
import { type Currency, convertWithRates, isCurrency } from "#shared/money"

const storageKey = "finance.currency"
const stored = () => {
  try {
    const value = localStorage.getItem(storageKey)
    return isCurrency(value) ? value : null
  } catch { return null }
}

/**
 * The currency this person sees amounts in. Saved on their profile (the demo's people keep it in this browser); unset,
 * it follows the household's. Totals are computed in the household's currency and every amount is converted for display
 * at today's ECB rate.
 */
export function useDisplayCurrency() {
  const { $auth } = useNuxtApp()
  const session = useAuthSession()
  const demo = useDemoPerson()
  const notify = useNotify()
  const { data: me } = useMe()
  const local = useState<Currency | null>("display-currency", stored)
  const pending = useState("display-currency-pending", () => false)
  const household = computed(() => me.value?.household.currency ?? "EUR")
  const saved = computed(() => (demo.value || !session.user.value ? local.value : session.user.value.displayCurrency ?? null))
  /** What the person picked, or null to follow the household. */
  const chosen = computed<Currency | null>(() => (isCurrency(saved.value) ? saved.value : null))
  const currency = computed<string>(() => chosen.value ?? household.value)

  async function select(next: Currency | null) {
    // Picking the household's own currency means following it, so a later household change carries over.
    const value = next === household.value ? null : next
    pending.value = true
    try {
      if (!demo.value && session.user.value) {
        const result = await $auth.updateUser({ displayCurrency: value })
        if (result.error) throw result.error
        await session.refresh()
      }
      local.value = value
      try {
        if (value) localStorage.setItem(storageKey, value)
        else localStorage.removeItem(storageKey)
      } catch { /* This visit still uses it. */ }
    } catch (error) { notify.error(error) }
    finally { pending.value = false }
  }

  return { currency, chosen, household, select, pending }
}

/** Today's rates into the display currency, fetched once per currency and shared. */
export function useFxRates() {
  const { currency } = useDisplayCurrency()
  return useFetch<FxRates | null>("/api/fx", {
    key: computed(() => `fx:${currency.value}`),
    query: computed(() => ({ to: currency.value })),
    default: () => null,
    getCachedData: cachedUnlessRefreshed,
  })
}

/**
 * Converts minor units into the display currency, or null while its rates load or when the ECB has no rate for `from`:
 * the caller then shows the amount in its own currency rather than a wrong number.
 */
export function useConvert() {
  const { currency } = useDisplayCurrency()
  const { data: fx } = useFxRates()
  return (minor: number, from: string): number | null => {
    if (from === currency.value) return minor
    return fx.value?.currency === currency.value ? convertWithRates(fx.value.rates, minor, from, currency.value) : null
  }
}
