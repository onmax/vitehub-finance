import { describe, expect, it } from "vitest"
import { suggestRules, type SuggestionRow } from "../../server/utils/rule-suggestions-core"

const row = (description: string, extra: Partial<SuggestionRow> = {}): SuggestionRow => ({
  description,
  counterparty: null,
  categoryId: null,
  categorySource: null,
  aiGuessId: null,
  excluded: false,
  excludeSource: null,
  transfer: false,
  ...extra,
})
const times = (n: number, make: (index: number) => SuggestionRow) => Array.from({ length: n }, (_, index) => make(index))

describe("rule suggestions", () => {
  it("suggest excluding the bank's own moves, until a rule excludes them", () => {
    const rows = times(5, () => row("To Revpoints", { counterparty: "Revpoints Spare Change" }))
    expect(suggestRules(rows, [], new Set())).toMatchObject([{ key: "exclude:spare change", kind: "exclude", count: 5 }])
    expect(suggestRules(rows, [{ match: "revpoints spare change", categoryId: null, exclude: true }], new Set())).toEqual([])
  })

  it("leave the bank's moves alone once someone shows one by hand", () => {
    const rows = [...times(4, () => row("Spare change")), row("Spare change", { excludeSource: "manual" })]
    expect(suggestRules(rows, [], new Set())).toEqual([])
  })

  it("file a payee under the category people picked for it by hand", () => {
    const rows = [
      ...times(2, () => row("MATCHI - Padel", { categoryId: "fitness", categorySource: "manual" })),
      row("MATCHI - Padel"),
    ]
    expect(suggestRules(rows, [], new Set())).toMatchObject([{ kind: "file", match: "matchi", categoryId: "fitness", because: "manual", count: 3 }])
  })

  it("take AI's category when it agrees on most rows, else let people pick", () => {
    const guessed = times(4, (index) => row("Upwork payout", { aiGuessId: index < 3 ? "salary" : "shopping" }))
    expect(suggestRules(guessed, [], new Set())).toMatchObject([{ categoryId: "salary", because: "ai" }])
    const unsure = times(3, () => row("Upwork payout"))
    expect(suggestRules(unsure, [], new Set())).toMatchObject([{ categoryId: null, because: "repeats" }])
  })

  it("skip payees a rule files, transfers, ones seen twice, and dismissed ones", () => {
    const rows = times(3, () => row("Netto 1234"))
    expect(suggestRules(rows, [{ match: "netto", categoryId: "groceries" }], new Set())).toEqual([])
    expect(suggestRules(times(3, () => row("Top-up by card", { transfer: true })), [], new Set())).toEqual([])
    expect(suggestRules(times(2, () => row("Netto 1234")), [], new Set())).toEqual([])
    expect(suggestRules(rows, [], new Set(["file:netto"]))).toEqual([])
  })
  it("skip money between the household's members", () => {
    const rows = times(4, () => row("Bizum de Pablo Garcia", { counterparty: "Pablo García" }))
    expect(suggestRules(rows, [], new Set(), ["Pablo García Ruiz", "Lucía Martín"])).toEqual([])
    expect(suggestRules(rows, [], new Set(), ["Lucía Martín"])).toHaveLength(1)
    expect(suggestRules(rows, [], new Set(), ["Ana García Ruiz"])).toHaveLength(1)
  })
})
