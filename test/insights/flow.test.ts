import { describe, expect, it } from "vitest"
import { buildFlow, MAX_USES, type CategoryInfo } from "../../server/utils/flow-core"

const categories = new Map<string, CategoryInfo>([
  ["salary", { name: "Salary", kind: "income", icon: "i-lucide-briefcase", color: "green" }],
  ["groceries", { name: "Groceries", kind: "expense", icon: "i-lucide-shopping-cart", color: "emerald" }],
  ["subs", { name: "Subscriptions", kind: "expense", icon: "i-lucide-repeat", color: "violet" }],
  ["shopping", { name: "Shopping", kind: "expense", icon: "i-lucide-shirt", color: "pink" }],
  ["transfers", { name: "Transfers", kind: "transfer", icon: "i-lucide-arrow-left-right", color: "neutral" }],
])

describe("money flow", () => {
  it("keeps what income didn't spend, and leaves transfers out", () => {
    const flow = buildFlow(
      [
        { categoryId: "salary", inMinor: 300_000, outMinor: 0 },
        { categoryId: "groceries", inMinor: 0, outMinor: 45_000 },
        { categoryId: "subs", inMinor: 3_000, outMinor: 10_000 },
        { categoryId: "transfers", inMinor: 500_000, outMinor: 500_000 },
      ],
      categories,
    )
    expect(flow.sources.map((node) => [node.name, node.amountMinor])).toEqual([["Salary", 300_000]])
    expect(flow.uses.map((node) => [node.name, node.amountMinor])).toEqual([
      ["Groceries", 45_000],
      ["Subscriptions", 7_000],
      ["Kept", 248_000],
    ])
    expect([flow.inMinor, flow.outMinor]).toEqual([300_000, 52_000])
  })

  it("covers spending past income from savings, and counts uncategorized money on both sides", () => {
    const flow = buildFlow(
      [
        { categoryId: null, inMinor: 18_000, outMinor: 90_000 },
        { categoryId: "shopping", inMinor: 5_000, outMinor: 2_000 },
      ],
      categories,
    )
    expect(flow.sources.map((node) => [node.name, node.amountMinor, node.kind])).toEqual([
      ["Other money in", 18_000, "income"],
      ["Shopping refunds", 3_000, "income"],
      ["From savings", 69_000, "savings"],
    ])
    expect(flow.uses.map((node) => node.name)).toEqual(["Uncategorized"])
  })

  it("folds the smallest uses into one node", () => {
    const many = new Map(categories)
    const totals = Array.from({ length: 12 }, (_, index) => {
      many.set(`c${index}`, { name: `C${index}`, kind: "expense", icon: "i-lucide-circle", color: "sky" })
      return { categoryId: `c${index}`, inMinor: 0, outMinor: (index + 1) * 1_000 }
    })
    const flow = buildFlow(totals, many)
    const uses = flow.uses.filter((node) => node.kind !== "savings")
    expect(uses).toHaveLength(MAX_USES)
    expect(uses.at(-1)).toMatchObject({ id: "other", amountMinor: 15_000 })
    expect(uses.reduce((sum, node) => sum + node.amountMinor, 0)).toBe(78_000)
  })
})
