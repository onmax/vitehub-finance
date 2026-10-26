/**
 * Why a bank call failed. `expired` means the consent ended and the person has to reconnect; `invalid_credentials` that
 * the app's own credentials were rejected (a setup problem); `rate_limited` passes with time (PSD2 allows about four
 * background fetches a day); `unavailable` is the bank, the aggregator, or the network. The message is written for people.
 */
export type BankingErrorCode = "expired" | "invalid_credentials" | "rate_limited" | "unavailable"

export class BankingError extends Error {
  readonly code: BankingErrorCode
  readonly provider: string

  constructor(code: BankingErrorCode, message: string, provider: string) {
    super(message)
    this.name = "BankingError"
    this.code = code
    this.provider = provider
  }
}
