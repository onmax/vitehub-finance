/**
 * Why a provider couldn't answer. `invalid_credentials` and `invalid_address` need the person to fix something,
 * `rate_limited` passes with time, `unavailable` is the provider or the network. The message is written for people.
 */
export type CryptoErrorCode = "invalid_credentials" | "invalid_address" | "rate_limited" | "unavailable"

export class CryptoError extends Error {
  readonly code: CryptoErrorCode
  /** The provider id, or the chain for an address that didn't parse. */
  readonly provider: string

  constructor(code: CryptoErrorCode, message: string, provider: string) {
    super(message)
    this.name = "CryptoError"
    this.code = code
    this.provider = provider
  }
}
