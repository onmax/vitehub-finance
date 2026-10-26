import { describe, expect, it } from "vitest"
import { addDays, addMonths } from "../../server/utils/dates"
import {
  detectSeries,
  findInsights,
  merchantKey,
  monthlyAmount,
  nextDueDate,
  type RecurringInput,
  type RecurringItem,
} from "../../server/utils/recurring-core"

const TODAY = "2026-10-26"
let next = 0
const row = (date: string, amountMinor: number, description: string, counterparty: string | null = null, categoryId: string | null = null): RecurringInput => ({
  id: `t${next++}`,
  date,
  amountMinor,
  description,
  counterparty,
  categoryId,
})

/** Netflix on the 5th for a year, 12.99 then 15.99 from the latest charge. */
const netflix = Array.from({ length: 12 }, (_, index) => {
  const date = addMonths("2025-11-05", index)
  return row(date, index === 11 ? -1599 : -1299, `COMPRA TARJ. 5402XXXXXXXX1234 NETFLIX.COM ${date}`, null, "subs")
})
const gym = Array.from({ length: 10 }, (_, index) => row(addDays("2026-10-24", -7 * index), -950, `BASIC-FIT GYM ${4000 + index} REF ${9000 + index}`))

describe("detectSeries", () => {
  it("finds a monthly subscription through a price change, keyed by merchant", () => {
    const [series] = detectSeries(netflix, TODAY)
    expect(series).toMatchObject({
      key: "out:netflix",
      cadence: "monthly",
      amountMinor: -1599,
      previousAmountMinor: -1299,
      lastDate: "2026-10-05",
      nextDate: "2026-11-05",
      occurrences: 12,
      categoryId: "subs",
    })
  })

  it("keeps a price change visible after the second charge at the new price, and ignores variable amounts", () => {
    const twice = netflix.map((entry, index) => (index === 10 ? { ...entry, amountMinor: -1599 } : entry))
    expect(detectSeries(twice, TODAY)[0]!.previousAmountMinor).toBe(-1299)
    const groceries = Array.from({ length: 8 }, (_, index) => row(addDays("2026-10-24", -7 * index), -(5000 + ((index * 731) % 900)), "LIDL MADRID"))
    expect(detectSeries(groceries, TODAY)[0]?.previousAmountMinor ?? null).toBeNull()
  })

  it("finds a weekly gym whose descriptions carry changing reference numbers", () => {
    const [series] = detectSeries(gym, TODAY)
    expect(series).toMatchObject({ cadence: "weekly", amountMinor: -950, previousAmountMinor: null, nextDate: "2026-10-31", occurrences: 10 })
    expect(series!.name).toBe("Basic Fit Gym")
  })

  it("names a series after its counterparty", () => {
    const rows = [0, 1, 2].map((index) => row(addMonths("2026-07-08", index), -1099, "Spotify P1A2B3C4D5", "SPOTIFY AB"))
    expect(detectSeries(rows, TODAY)[0]).toMatchObject({ name: "Spotify Ab", key: "out:spotify ab" })
  })

  it("ignores noise: irregular groceries, a one-off, irregular same-price coffee, and a cancelled subscription", () => {
    const groceries = [3, 6, 15, 16, 29, 40, 41, 58, 77].map((days, index) => row(addDays(TODAY, -days), -(2300 + index * 1700), "MERCADONA VALENCIA"))
    const oneOff = [row("2026-09-14", -45000, "IKEA VALENCIA")]
    const coffee = [1, 4, 30, 31, 60, 90].map((days) => row(addDays(TODAY, -days), -250, "CAFE CENTRAL"))
    const cancelled = [0, 1, 2, 3].map((index) => row(addMonths("2025-12-12", index), -899, "HBO MAX"))
    expect(detectSeries([...groceries, ...oneOff, ...coffee, ...cancelled], TODAY)).toEqual([])
  })

  it("keeps money in and money out from the same counterparty apart, and needs 3 charges", () => {
    const rows = [row("2026-08-01", -5000, "ACME"), row("2026-09-01", -5000, "ACME"), row("2026-08-27", 280000, "ACME"), row("2026-09-27", 280000, "ACME"), row("2026-10-27", 280000, "ACME")]
    const found = detectSeries(rows, "2026-10-27")
    expect(found.map((series) => series.key)).toEqual(["in:acme"])
  })

  it("accepts a yearly charge with two occurrences", () => {
    const rows = [row("2025-10-20", -9900, "AMAZON PRIME ANUAL"), row("2026-10-20", -9900, "AMAZON PRIME ANUAL")]
    expect(detectSeries(rows, TODAY)[0]).toMatchObject({ cadence: "yearly", nextDate: "2027-10-20" })
  })
})

describe("dates", () => {
  it("rolls the next date past today and keeps month ends", () => {
    expect(nextDueDate("2026-08-05", "monthly", TODAY)).toBe("2026-11-05")
    expect(nextDueDate("2026-01-31", "monthly", "2026-02-10")).toBe("2026-02-28")
    expect(nextDueDate("2026-01-31", "monthly", "2026-03-01")).toBe("2026-03-31")
    expect(merchantKey({ description: "PAGO 12/10/2026 *1234 Uber Eats Madrid", counterparty: null })).toBe("uber eats madrid")
  })
  it("normalizes to a monthly cost", () => {
    expect(monthlyAmount(-950, "weekly")).toBe(-4117)
    expect(monthlyAmount(-9900, "yearly")).toBe(-825)
  })
})

describe("findInsights", () => {
  const base = { previousAmountMinor: null, currency: "EUR", cadence: "monthly" as const, status: "detected" as const, categoryId: "subs" }
  const items: RecurringItem[] = [
    { ...base, id: "n", key: "out:netflix", ownerId: "ana", ownerName: "Ana", accountName: "Ana's", name: "Netflix", amountMinor: -1599, previousAmountMinor: -1299, monthlyMinor: -1599 },
    { ...base, id: "s1", key: "out:spotify", ownerId: "ana", ownerName: "Ana", accountName: "Ana's", name: "Spotify", amountMinor: -1099, monthlyMinor: -1099 },
    { ...base, id: "s2", key: "out:spotify", ownerId: "ben", ownerName: "Ben", accountName: "Ben's", name: "Spotify", amountMinor: -1099, monthlyMinor: -1099 },
    { ...base, id: "g", key: "out:gym", ownerId: "ben", ownerName: "Ben", accountName: "Ben's", name: "Gym", amountMinor: -4500, monthlyMinor: -4500 },
  ]
  const options = { currency: "EUR", convert: (minor: number) => minor, format: (minor: number) => `€${minor / 100}`, subscriptionsCategoryId: "subs", largeMonthlyMinor: 3000 }

  it("finds the price increase, the couple's duplicate, and the large subscription, with yearly savings", () => {
    const insights = findInsights(items, options)
    expect(insights.map((insight) => [insight.kind, insight.savingsMinor, insight.recurringIds])).toEqual([
      ["large_subscription", 54000, ["g"]],
      ["duplicate", 13188, ["s1", "s2"]],
      ["price_increase", 3600, ["n"]],
    ])
  })

  it("sees no duplicate when one member pays twice, or when one copy is dismissed", () => {
    const same = items.map((item) => ({ ...item, ownerId: "ana" }))
    expect(findInsights(same, options).some((insight) => insight.kind === "duplicate")).toBe(false)
    const dismissed = items.map((item) => (item.id === "s2" ? { ...item, status: "dismissed" as const } : item))
    expect(findInsights(dismissed, options).some((insight) => insight.kind === "duplicate")).toBe(false)
  })
})
