import { describe, expect, it } from "vitest"
import { refuseOverLimit, TOO_MANY_TRIES } from "../../server/utils/rate-limit"

const base = { limit: 10, windowMs: 60_000 }

describe("rate limit answers", () => {
  it("lets an allowed request through", () => {
    expect(() => refuseOverLimit({ ...base, allowed: true })).not.toThrow()
  })

  it("answers 429 with a code the browser translates, and when to retry", () => {
    const error = (() => {
      try {
        refuseOverLimit({ ...base, allowed: false, reason: "limited", retryAfter: 42 })
      } catch (caught) {
        return caught as { status: number; message: string; headers?: Headers; data?: { code?: string } }
      }
    })()
    expect(error).toMatchObject({ status: 429, message: TOO_MANY_TRIES, data: { code: "errorTooManyTriesWaitAMinute" } })
    expect(error?.headers?.get("retry-after")).toBe("42")
  })

  it("answers 503 when the limiter can't count", () => {
    expect(() => refuseOverLimit({ ...base, allowed: false, reason: "unavailable", cause: new Error("down") })).toThrow(
      expect.objectContaining({ status: 503 }),
    )
  })
})
