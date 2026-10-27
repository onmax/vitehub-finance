import { cloudflare, typesafe } from "vite-hub/agent/gateways"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CATEGORIES } from "../../shared/categories"
import {
  BATCH_SIZE,
  buildBatches,
  classify,
  MIN_CONFIDENCE,
  MIN_FITS,
  readAnswers,
  roughAmount,
  scrub,
  type AiCategory,
  type AiRow,
  type JevState,
} from "../../server/utils/ai-categorize-core"

const CATEGORIES: AiCategory[] = DEFAULT_CATEGORIES.map((entry, index) => ({
  id: `c${index}`,
  name: entry.name,
  kind: entry.kind,
  keywords: entry.match ?? [],
}))
const idOf = (name: string) => CATEGORIES.find((category) => category.name === name)!.id

let next = 0
const row = (description: string, amountMinor: number, extra: Partial<AiRow> = {}): AiRow => ({
  id: `t${++next}`,
  amountMinor,
  currency: "EUR",
  description,
  counterparty: null,
  accountKind: "checking",
  ...extra,
})

/**
 * A stand-in for TypeSafe's API (what ViteHub's `typesafe()` gateway sends and reads): picks the option whose name appears in a
 * lookup for the row's description, sure of it, and says the row fits; anything it doesn't know gets an even split and a
 * "no".
 */
function fakeJev(known: Record<string, string>) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body)) as {
      state: JevState
      questions: Record<string, { type: "noul" } | { type: "choice"; criteria: Record<string, string> }>
    }
    const answers: Record<string, unknown> = {}
    for (const [id, question] of Object.entries(body.questions)) {
      const index = Number(id.split("_")[1])
      const pick = known[body.state.transactions[index]!.description]
      if (question.type === "noul") answers[id] = { type: "noul", noul: pick ? 0.95 : 0.1 }
      else {
        const options = Object.keys(question.criteria)
        const probabilities = Object.fromEntries(options.map((option) => [option, pick ? (option === pick ? 1 : 0) : 1 / options.length]))
        answers[id] = { type: "choice", choice: pick ?? options[0], confidence: pick ? 1 : 0, probabilities }
      }
    }
    return Response.json({ model: "jev-1.14.0", answers, usage: { input_tokens: 1000, output_tokens: 50 } })
  })
}

describe("what a request sends", () => {
  it("masks IBANs, long numbers, and household members' names", () => {
    expect(scrub("Transfer to ES91 2100 0418 4502 0005 1332 from Maxi Garcia", ["Maxi Garcia"])).toBe("Transfer to [account] from [person] [person]")
    expect(scrub("CARD 4111 1111 1111 1111 COOP ESLOV", [])).toBe("CARD [number] COOP ESLOV")
    // Words inside other words stay: "Ana" isn't masked in "Banana Republic".
    expect(scrub("Banana Republic", ["Ana Ruiz"])).toBe("Banana Republic")
  })

  it("rounds amounts to their size", () => {
    expect(roughAmount(-1240, "EUR")).toBe("about 12 EUR")
    expect(roughAmount(-123_456, "EUR")).toBe("about 1,200 EUR")
    expect(roughAmount(50, "EUR")).toBe("under 1 EUR")
    expect(roughAmount(-1500, "JPY")).toBe("about 1,500 JPY")
  })

  it("asks a Choice among spending categories for money out and income ones for money in, plus a companion Noul", () => {
    const rows = [
      row("Five Guys Jv Ltd", -1890, { counterparty: "FIVE GUYS", accountKind: "credit" }),
      row("Hetzner refund", 400),
    ]
    const [batch] = buildBatches(rows, CATEGORIES, { names: ["Maxi Garcia"] })
    const body = batch!
    expect(body.state.transactions).toEqual([
      { direction: "money out", amount: "about 19 EUR", description: "Five Guys Jv Ltd", counterparty: "FIVE GUYS", account: "credit" },
      { direction: "money in", amount: "about 4 EUR", description: "Hetzner refund", account: "checking" },
    ])
    const out = body.questions.category_0!
    const income = body.questions.category_1!
    expect(out.type).toBe("choice")
    if (out.type !== "choice" || income.type !== "choice") return
    expect(Object.keys(out.criteria)).toContain("Eating out")
    expect(Object.keys(out.criteria)).not.toContain("Salary")
    // Transfers are paired by code, never guessed.
    expect(Object.keys(out.criteria)).not.toContain("Transfers")
    expect(Object.keys(income.criteria).sort()).toEqual(["Other income", "Salary"])
    expect(out.criteria["Groceries"]).toMatch(/^Money spent on groceries\. For example: mercadona, carrefour/)
    expect(body.questions.fits_0).toEqual({ type: "chance", instructions: expect.stringContaining("`transactions[0]`") })
    // No ids, dates, or names leave the server.
    expect(JSON.stringify({ state: body.state, questions: body.questions })).not.toMatch(/t\d+|Maxi|\d{4}-\d{2}-\d{2}/)
  })

  it("starts each row's options somewhere else, so Jev's lean toward the first option doesn't favor one category", () => {
    const [batch] = buildBatches([row("a", -100), row("b", -100)], CATEGORIES)
    const first = (id: string) => {
      const question = batch!.questions[id]!
      return question.type === "choice" ? Object.keys(question.criteria)[0] : null
    }
    expect(first("category_0")).not.toBe(first("category_1"))
  })

  it("splits rows into batches and leaves out what has nothing to choose from", () => {
    const rows = Array.from({ length: BATCH_SIZE + 5 }, (_, index) => row(`Shop ${index}`, -500))
    expect(buildBatches(rows, CATEGORIES).map((batch) => batch.rows.length)).toEqual([BATCH_SIZE, 5])
    const onlyOneIncome = CATEGORIES.filter((category) => category.name !== "Other income")
    expect(buildBatches([row("Payroll", 100_000), row("zero", 0)], onlyOneIncome)).toEqual([])
  })
})

describe("reading answers", () => {
  const [batch] = buildBatches([row("Waymo", -2300)], CATEGORIES)
  const answer = (confidence: number, fits: number, choice = "Transport") => ({
    category_0: { type: "choice", choice, confidence, probabilities: {} },
    fits_0: { type: "chance", chance: fits },
  })

  it("uses a category only when the Choice is confident and the Noul says it fits", () => {
    expect(readAnswers(batch!, answer(MIN_CONFIDENCE, MIN_FITS))[0]!.categoryId).toBe(idOf("Transport"))
    expect(readAnswers(batch!, answer(MIN_CONFIDENCE - 0.01, 0.99))[0]!.categoryId).toBeNull()
    expect(readAnswers(batch!, answer(1, MIN_FITS - 0.01))[0]!.categoryId).toBeNull()
  })

  it("treats an unknown option or a missing answer as unsure", () => {
    expect(readAnswers(batch!, answer(1, 1, "Rockets"))[0]!.categoryId).toBeNull()
    expect(readAnswers(batch!, {})).toEqual([{ id: batch!.rows[0]!.id, categoryId: null, confidence: null }])
  })
})

describe("asking Jev through ViteHub's AI gateways", () => {
  const client = (fetch: typeof globalThis.fetch) => typesafe({ apiKey: "ts_test", fetch })

  it("posts each batch with the key and returns the sure answers with token usage", async () => {
    const rows = [row("Hetzner Online Gmbh", -2_500), row("Coop Eslov", -34_900), row("Card payment", -1_000)]
    const fetch = fakeJev({ "Hetzner Online Gmbh": "Subscriptions", "Coop Eslov": "Groceries" })
    const result = await classify(rows, CATEGORIES, { gateway: client(fetch) })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe("https://api.typesafe.ai/v1/systemone")
    expect(new Headers(init!.headers).get("authorization")).toBe("Bearer ts_test")
    expect(JSON.parse(String(init!.body))).toMatchObject({ model: "jev-latest", questions: { fits_0: { type: "noul" } } })
    expect(result.decisions.map((decision) => decision.categoryId)).toEqual([idOf("Subscriptions"), idOf("Groceries"), null])
    expect(result.usage).toMatchObject({ calls: 1, failedCalls: 0, inputTokens: 1000, outputTokens: 50, model: "jev-1.14.0" })
  })

  it("asks the same questions through a Cloudflare AI Gateway", async () => {
    const fetch = fakeJev({ Waymo: "Transport" })
    const gateway = cloudflare({ apiKey: "ts_test", accountId: "acc", gatewayId: "finance", token: "cf", fetch })
    const result = await classify([row("Waymo", -2_300)], CATEGORIES, { gateway })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe("https://gateway.ai.cloudflare.com/v1/acc/finance/custom-typesafe/v1/systemone")
    expect(new Headers(init!.headers).get("cf-aig-authorization")).toBe("Bearer cf")
    expect(result.decisions[0]!.categoryId).toBe(idOf("Transport"))
  })

  it("lets ViteHub retry a 429", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockImplementation(fakeJev({ Waymo: "Transport" }))
    const result = await classify([row("Waymo", -2_300)], CATEGORIES, { gateway: client(fetch) })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.decisions[0]!.categoryId).toBe(idOf("Transport"))
  })

  it("keeps what the other batches answered when one fails, and throws when all do", async () => {
    const rows = Array.from({ length: BATCH_SIZE + 1 }, (_, index) => row(index === BATCH_SIZE ? "Waymo" : `Shop ${index}`, -500))
    const answer = fakeJev({ Waymo: "Transport" })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response("bad key", { status: 401 })).mockImplementation(answer)
    const result = await classify(rows, CATEGORIES, { gateway: client(fetch) })
    expect(result.usage.failedCalls).toBe(1)
    expect(result.usage.error).toMatchObject({ status: 401 })
    expect(result.decisions).toHaveLength(1)

    const down = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}", { status: 422 }))
    await expect(classify([row("Waymo", -2_300)], CATEGORIES, { gateway: client(down) })).rejects.toMatchObject({ status: 422 })
  })
})
