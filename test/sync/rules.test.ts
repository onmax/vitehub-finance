import { describe, expect, it } from "vitest"
import { categorize, matchRule, sqliteLowerForms, startsWord } from "../../server/providers/dedupe"

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

  it("say whether the matching rule excludes", () => {
    const rules = [
      { match: "revolut", categoryId: "fees" },
      { match: "revpoints spare change", categoryId: "transfers", exclude: true },
    ]
    expect(matchRule(rules, { description: "To Revpoints", counterparty: "Revpoints Spare Change" })?.exclude).toBe(true)
    expect(matchRule(rules, { description: "Revolut fee" })?.exclude).toBeFalsy()
  })
})

describe("rules in SQL", () => {
  // SQLite's lower() only lowercases ASCII, so a description in capitals keeps its Ø, Ö, or Ñ.
  const sqliteLower = (text: string) => text.replace(/[A-Z]/g, (char) => char.toLowerCase())

  it("find text in capitals with letters beyond ASCII", () => {
    const forms = sqliteLowerForms("Lønoverførsel")
    expect(forms.some((form) => sqliteLower("LØNOVERFØRSEL").includes(form))).toBe(true)
    expect(forms.some((form) => sqliteLower("Lønoverførsel").includes(form))).toBe(true)
    expect(sqliteLowerForms("nómina").some((form) => sqliteLower("NÓMINA OCTUBRE").includes(form))).toBe(true)
  })

  it("keep one form for plain ASCII", () => {
    expect(sqliteLowerForms("Netflix")).toEqual(["netflix"])
  })
})
