import { describe, expect, it } from "vitest"
import { linkOrigin, parseOrigin, remembersRequestOrigin } from "../../server/utils/origin"

const none = { built: "", configured: "", remembered: null }

describe("the origin links in emails use", () => {
  it("is the build's domain whatever else is set, then FINANCE_ORIGIN, then the remembered one", () => {
    expect(linkOrigin({ built: "https://finance.example.com", configured: "https://other.example", remembered: "https://evil.example" })).toBe(
      "https://finance.example.com",
    )
    expect(linkOrigin({ ...none, configured: "https://money.example.org/", remembered: "https://evil.example" })).toBe("https://money.example.org")
    expect(linkOrigin({ ...none, remembered: "http://192.168.1.20:3000" })).toBe("http://192.168.1.20:3000")
    expect(linkOrigin(none)).toBeNull()
  })

  it("remembers a request's origin only when the server has none, so a forged Host can't replace it", () => {
    expect(remembersRequestOrigin(none)).toBe(true)
    expect(remembersRequestOrigin({ ...none, remembered: "https://finance.example.com" })).toBe(false)
    expect(remembersRequestOrigin({ ...none, configured: "https://finance.example.com" })).toBe(false)
    expect(remembersRequestOrigin({ ...none, built: "https://finance.example.com" })).toBe(false)
  })

  it("reads only http(s) origins", () => {
    expect(parseOrigin(" https://finance.example.com/connect ")).toBe("https://finance.example.com")
    expect(parseOrigin("finance.example.com")).toBeNull()
    expect(parseOrigin("javascript:alert(1)")).toBeNull()
    expect(parseOrigin("")).toBeNull()
  })
})
