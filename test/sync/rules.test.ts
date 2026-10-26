import { describe, expect, it } from "vitest"
import { categorize, startsWord } from "../../server/providers/dedupe"

describe("rules", () => {
  it("match at the start of a word, not inside one", () => {
    expect(startsWord("bank fee october", "fee")).toBe(true)
    expect(startsWord("coffee shop", "fee")).toBe(false)
    expect(startsWord("compra netflix.com", "netflix")).toBe(true)
    expect(startsWord("pago*spotify", "spotify")).toBe(true)
  })

  it("pick the longest matching rule", () => {
    const rules = [
      { match: "amazon", categoryId: "shopping" },
      { match: "amazon prime", categoryId: "subscriptions" },
    ]
    expect(categorize(rules, { description: "AMAZON PRIME ES" })).toBe("subscriptions")
    expect(categorize(rules, { description: "Coffee at Amazon" })).toBe("shopping")
  })
})
