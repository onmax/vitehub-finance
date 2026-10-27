import type { AiCategorizeResult } from "#shared/api"

/** Rounds per click: the server caps each at a few hundred transactions. */
const MAX_ROUNDS = 10

/**
 * "Categorize with AI" for what the rules missed: asks the server in rounds until nothing's left, then says how it went.
 * Rows AI wasn't sure about stay uncategorized in every list; its guess waits inside each transaction. `ready` is
 * whether the household has a key and AI categories on.
 */
export function useAiCategorize() {
  const { data: me } = useMe()
  const notify = useNotify()
  const ready = computed(() => Boolean(me.value?.ai && me.value.household.aiCategorize))
  const running = useState("ai-categorize-running", () => false)

  async function run() {
    running.value = true
    let asked = 0
    let categorized = 0
    let remaining = 0
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const result = await $fetch<AiCategorizeResult>("/api/transactions/categorize", { method: "POST" })
        asked += result.asked
        categorized += result.categorized
        remaining = result.remaining
        if (!result.remaining || !result.asked) break
      }
      if (!asked) notify.success(translate('nothingToCategorize'), translate('everyTransactionYouCanEditHasACategoryOrAi'))
      else
        notify.success(
          translate('categorizedOf', { value1: formatCount(categorized), value2: formatCount(asked) }),
          [
            categorized < asked ? translate('aiWasnTSureAboutTheRestSoTheyStay') : "",
            remaining ? translate('leftRunItAgainToDoMore', { value1: formatCount(remaining) }) : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        )
      void refreshStems("transactions", "overview", "budgets", "flow", "alerts")
    } catch (cause) {
      notify.error(cause, translate('couldnTCategorizeWithAi'))
    } finally {
      running.value = false
    }
  }
  return { ready, running, run }
}
