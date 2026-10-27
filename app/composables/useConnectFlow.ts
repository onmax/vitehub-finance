import type { InjectionKey, Ref } from "vue"
import type { ConnectionSummary } from "#shared/api"
import type { CatalogProvider } from "~/utils/connect-catalog"

/**
 * What a connect dialog (ConnectDialog) shares with its steps. Each step renders a UForm with `formId`, so the dialog's
 * primary button submits the current step: its validation runs on submit, then the step calls `next()`, or, on the last
 * step, `connect()` with its request.
 */
export interface ConnectFlow {
  entry: CatalogProvider
  formId: string
  pending: Ref<boolean>
  error: Ref<string>
  next: () => void
  connect: (request: () => Promise<ConnectionSummary>, fallback: string) => Promise<void>
}

const FLOW: InjectionKey<ConnectFlow> = Symbol("connect-flow")

export const provideConnectFlow = (flow: ConnectFlow) => provide(FLOW, flow)

export function useConnectFlow() {
  const flow = inject(FLOW)
  if (!flow) throw new Error("A connect step must be inside a ConnectDialog.")
  return flow
}
