/** What a locked control says in the demo. The server refuses the same actions with a 403. */
export const demoLocked = () => translate("notAvailableInTheDemo")

/** Whether this is the public demo build (`FINANCE_DEMO=1`): a fictional household, reset every night. */
export function useDemo() {
  return Boolean(useRuntimeConfig().public.demo)
}
