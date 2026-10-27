import { describe, expect, it } from "vitest"
import { convertWithRates, formatMoney } from "../../shared/money"

// Frankfurter's shape: units of each currency per one of the target.
const intoSek = { SEK: 1, EUR: 0.0901, JPY: 14.2, DKK: 0.672 }

describe("amounts in someone's display currency", () => {
  it("converts with the ECB rate into the target", () => {
    expect(convertWithRates(intoSek, 10_000, "EUR", "SEK")).toBe(110_988)
    expect(formatMoney(110_988, "SEK", { locale: "en" })).toBe("SEK\u00a01,109.88")
  })

  it("keeps a currency without cents whole, both ways", () => {
    expect(convertWithRates(intoSek, 1_000, "JPY", "SEK")).toBe(7_042)
    expect(convertWithRates({ JPY: 1, SEK: 0.0704 }, 7_042, "SEK", "JPY")).toBe(1_000)
  })

  it("leaves the same currency alone and says when it has no rate", () => {
    expect(convertWithRates(intoSek, 1234, "SEK", "SEK")).toBe(1234)
    expect(convertWithRates(intoSek, 1234, "XRP", "SEK")).toBeNull()
  })
})
