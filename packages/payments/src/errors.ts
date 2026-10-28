export type PaymentsErrorCode = "invalid_credentials" | "permissions" | "live_required" | "rate_limited" | "unavailable"

export class PaymentsError extends Error {
  readonly provider = "stripe"
  readonly code: PaymentsErrorCode

  constructor(code: PaymentsErrorCode, message: string) {
    super(message)
    this.name = "PaymentsError"
    this.code = code
  }
}
