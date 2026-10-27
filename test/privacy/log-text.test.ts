import { describe, expect, it } from "vitest"
import { scrubLogText, URL_QUERY } from "../../server/utils/log-text"

describe("browser error text in the logs", () => {
  it("drops every URL's query and fragment, and keeps the path", () => {
    expect(scrubLogText('[GET] "/api/transactions?q=farmacia&account=42": 500', 500)).toBe('[GET] "/api/transactions": 500')
    expect(scrubLogText("Failed https://finance.example.com/api/connect/callback?code=abc123&state=f00d#top then", 500)).toBe(
      "Failed https://finance.example.com/api/connect/callback then",
    )
    expect(scrubLogText("/connect/banks#ibkr/connect", 500)).toBe("/connect/banks")
    // Not a URL: a question stays a question.
    expect(scrubLogText("Why? Who knows #2", 500)).toBe("Why? Who knows #2")
  })

  it("masks emails, IBANs, and long digit runs, and keeps stack frames readable", () => {
    expect(scrubLogText("No user lucia.garcia+bank@example.es here", 500)).toBe("No user [email] here")
    expect(scrubLogText("IBAN ES91 2100 0418 4502 0005 1332 and DE89370400440532013000", 500)).toBe("IBAN [iban] and [iban]")
    expect(scrubLogText("Card 4111 1111 1111 1111, phone 612-345-678, amount 1234567", 500)).toBe("Card [number], phone [number], amount [number]")
    expect(scrubLogText("Row 12 of 3400 failed", 500)).toBe("Row 12 of 3400 failed")
    const frame = "at setup (https://finance.example.com/_nuxt/entry.B3kd8f.js:1:104523)\nfn@https://finance.example.com/_nuxt/node_modules/@vue/runtime.js:12:345678"
    expect(scrubLogText(frame, 500)).toBe(frame)
  })

  it("cuts to size after cleaning, and reads no more than twice that", () => {
    expect(scrubLogText("a".repeat(5000), 100)).toHaveLength(100)
    // Past twice the size, " tail" is never read.
    expect(scrubLogText(`/x?${"q".repeat(50)} tail`, 20)).toBe("/x")
  })

  it("matches only the query, for evlog's redaction to replace", () => {
    expect("GET /api/connect/callback?code=abc in 3ms".replace(URL_QUERY, "[REDACTED]")).toBe("GET /api/connect/callback[REDACTED] in 3ms")
  })
})
