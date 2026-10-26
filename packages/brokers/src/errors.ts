/**
 * Why a broker couldn't answer. `invalid_credentials` needs the person to fix something (a token, a query),
 * `rate_limited` passes with time, `unavailable` is the broker or the network. The message is written for people.
 */
export type BrokerErrorCode = "invalid_credentials" | "rate_limited" | "unavailable"

export class BrokerError extends Error {
  readonly code: BrokerErrorCode
  /** The provider id. */
  readonly provider: string

  constructor(code: BrokerErrorCode, message: string, provider: string) {
    super(message)
    this.name = "BrokerError"
    this.code = code
    this.provider = provider
  }
}
