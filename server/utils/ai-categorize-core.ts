// Categories for transactions the rules left uncategorized, from Jev (TypeSafe's System One model,
// https://docs.typesafe.ai). Pure logic and the HTTP call, no database: what we send, how answers become categories,
// and when an answer is sure enough to use. server/utils/ai-categorize.ts picks the rows and writes the results.
import { currencyDigits } from "../../shared/money"

export const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone"
export const JEV_MODEL = "jev-latest"
/** Dollars per million input tokens (jev-1.14). Output tokens are free. Only used to estimate cost in the logs. */
export const JEV_PRICE_PER_MTOK = 0.042

/**
 * Transactions per request: one Choice and one Noul each, about 7k tokens, well under Jev's 64k per request and 32k
 * per question. Smaller batches also keep the state short: unrelated rows in it cost accuracy.
 */
export const BATCH_SIZE = 20
/** Requests in flight at once, under TypeSafe's per-organization requests-per-second limit. */
export const CONCURRENCY = 3
/**
 * The category is used only when the Choice's confidence (0 for an even split, 1 for all probability on one option)
 * reaches this. TypeSafe suggests a 0.5–0.6 floor for low-stakes actions; a category feeds budgets without anyone
 * looking, so it's stricter. People can still change it, and the UI marks it as suggested.
 */
export const MIN_CONFIDENCE = 0.7
/** And only when the companion Noul says the row fits one of the categories at all: TypeSafe's suggested "yes". */
export const MIN_FITS = 0.7
/** Rule keywords per option description: enough to show what a category means, few enough to stay cheap. */
const KEYWORDS_PER_OPTION = 8

export type CategoryKind = "expense" | "income" | "transfer"

export interface AiCategory {
  id: string
  name: string
  kind: CategoryKind
  /** The household's rule keywords for it ("mercadona", "lidl"), which say what it covers. */
  keywords: string[]
}

export interface AiRow {
  id: string
  amountMinor: number
  currency: string
  description: string
  counterparty: string | null
  accountKind: string
}

export interface ChoiceQuestion {
  type: "choice"
  instructions: string
  criteria: Record<string, string>
}

export interface NoulQuestion {
  type: "noul"
  instructions: string
}

export interface JevRequest {
  model: string
  state: {
    spending_categories: string[]
    income_categories: string[]
    transactions: Array<{ direction: "money out" | "money in"; amount: string; description: string; counterparty?: string; account: string }>
  }
  questions: Record<string, ChoiceQuestion | NoulQuestion>
}

export interface JevResponse {
  model?: string
  answers?: Record<string, unknown>
  usage?: { input_tokens?: number; output_tokens?: number }
}

/** One batch, ready to send: the body, and per row which questions ask about it and what each option means. */
export interface Batch {
  body: JevRequest
  rows: Array<{ id: string; choice: string; fits: string; options: Map<string, string> }>
}

/**
 * What a request may say about a transaction: its text with people's names, IBANs, and long numbers (cards, accounts,
 * references) masked. `names` are the household members' names; any word of three letters or more from one goes.
 */
export function scrub(text: string, names: string[]) {
  let result = text
    .replace(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){2,7}(?:[ -]?[A-Z0-9]{1,3})?\b/g, "[account]")
    .replace(/[*xX]*\d[\d *-]{4,}\d/g, "[number]")
  const words = new Set(names.flatMap((name) => name.split(/\s+/)).filter((word) => word.length >= 3))
  for (const word of words) result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, "giu"), "[person]")
  return result.replace(/\s+/g, " ").trim().slice(0, 200)
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** "about 12 EUR", "about 1,200 EUR": two significant digits, the size without the exact amount. */
export function roughAmount(amountMinor: number, currency: string) {
  const major = Math.abs(amountMinor) / 10 ** currencyDigits(currency)
  if (major < 1) return `under 1 ${currency}`
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(major)) - 1)
  return `about ${(Math.round(major / magnitude) * magnitude).toLocaleString("en")} ${currency}`
}

function describe(category: AiCategory) {
  const what = category.kind === "income" ? `Money received: ${category.name.toLowerCase()}.` : `Money spent on ${category.name.toLowerCase()}.`
  const keywords = category.keywords.slice(0, KEYWORDS_PER_OPTION)
  return keywords.length ? `${what} For example: ${keywords.join(", ")}.` : what
}

/** Option names must be unique; two categories with one name get a number. */
function optionsFor(categories: AiCategory[]) {
  const options = new Map<string, AiCategory>()
  for (const category of categories) {
    let name = category.name.trim().slice(0, 80) || "Unnamed"
    for (let n = 2; options.has(name); n++) name = `${category.name.trim().slice(0, 76)} (${n})`
    options.set(name, category)
  }
  return options
}

/**
 * The rows split into requests. Money out chooses among spending categories, money in among income ones; transfers
 * are code's job (server/utils/transfers.ts). A direction with fewer than two categories has nothing to choose, so its
 * rows aren't sent. Each row gets a Choice (which category) and a Noul (does any fit), TypeSafe's recommended
 * alternative to a "none of the above" option. Options start at a different place for each row, since Jev leans
 * toward the first option.
 */
export function buildBatches(rows: AiRow[], categories: AiCategory[], options: { names?: string[]; batchSize?: number } = {}): Batch[] {
  const names = options.names ?? []
  // Rule keywords are household text too ("apply to similar" saves a payee): a keyword naming a member is left out.
  const described = categories.map((category) => ({
    ...category,
    keywords: category.keywords.map((keyword) => scrub(keyword, names)).filter((keyword) => keyword && !keyword.includes("[")),
  }))
  const spending = optionsFor(described.filter((category) => category.kind === "expense"))
  const income = optionsFor(described.filter((category) => category.kind === "income"))
  const size = options.batchSize ?? BATCH_SIZE
  const sendable = rows.filter((row) => row.amountMinor !== 0 && (row.amountMinor < 0 ? spending : income).size >= 2)
  const batches: Batch[] = []
  for (let start = 0; start < sendable.length; start += size) {
    const slice = sendable.slice(start, start + size)
    const body: JevRequest = {
      model: JEV_MODEL,
      state: { spending_categories: [...spending.keys()], income_categories: [...income.keys()], transactions: [] },
      questions: {},
    }
    const batch: Batch = { body, rows: [] }
    slice.forEach((row, index) => {
      const out = row.amountMinor < 0
      const pool = out ? spending : income
      const list = out ? "spending_categories" : "income_categories"
      const counterparty = row.counterparty ? scrub(row.counterparty, names) : ""
      body.state.transactions.push({
        direction: out ? "money out" : "money in",
        amount: roughAmount(row.amountMinor, row.currency),
        description: scrub(row.description, names),
        ...(counterparty ? { counterparty } : {}),
        account: row.accountKind,
      })
      const entries = [...pool.entries()]
      const shift = index % entries.length
      const rotated = [...entries.slice(shift), ...entries.slice(0, shift)]
      const choice = `category_${index}`
      const fits = `fits_${index}`
      body.questions[choice] = {
        type: "choice",
        instructions: `Which category does the bank transaction \`transactions[${index}]\` belong to?`,
        criteria: Object.fromEntries(rotated.map(([name, category]) => [name, describe(category)])),
      }
      body.questions[fits] = {
        type: "noul",
        instructions: `Does the bank transaction \`transactions[${index}]\` clearly belong to one of \`${list}\`?`,
      }
      batch.rows.push({ id: row.id, choice, fits, options: new Map(rotated.map(([name, category]) => [name, category.id])) })
    })
    batches.push(batch)
  }
  return batches
}

export interface Decision {
  id: string
  /** The category to give it, or null when Jev wasn't sure enough. */
  categoryId: string | null
  confidence: number | null
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** The answers of one batch as decisions, one per row. A missing or malformed answer is "not sure". */
export function readAnswers(batch: Batch, response: JevResponse): Decision[] {
  const answers = isRecord(response.answers) ? response.answers : {}
  return batch.rows.map((row) => {
    const choice = answers[row.choice]
    const fits = answers[row.fits]
    const confidence = isRecord(choice) && typeof choice.confidence === "number" ? choice.confidence : null
    const picked = isRecord(choice) && typeof choice.choice === "string" ? row.options.get(choice.choice) : undefined
    const fitsYes = isRecord(fits) && typeof fits.noul === "number" ? fits.noul : 0
    const sure = picked !== undefined && confidence !== null && confidence >= MIN_CONFIDENCE && fitsYes >= MIN_FITS
    return { id: row.id, categoryId: sure ? picked : null, confidence }
  })
}

export class JevError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "JevError"
  }
}

export interface AskOptions {
  apiKey: string
  fetch?: typeof fetch
  /** Waits before a retry; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>
}

const RETRY_STATUSES = new Set([429, 529, 502, 503, 504])

/** POSTs one request, retrying once on 429 and 529 (TypeSafe's "back off and retry"), after `retry-after` up to 10 s. */
export async function askJev(body: JevRequest, options: AskOptions): Promise<JevResponse> {
  const call = options.fetch ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  for (let attempt = 0; ; attempt++) {
    const response = await call(TYPESAFE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (response.ok) return (await response.json()) as JevResponse
    if (attempt === 0 && RETRY_STATUSES.has(response.status)) {
      const after = Number(response.headers.get("retry-after"))
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 10) * 1000 : 2000)
      continue
    }
    // TypeSafe's error body names the field or rule; it never echoes the state back.
    const detail = (await response.text().catch(() => "")).slice(0, 300)
    throw new JevError(response.status, `TypeSafe answered ${response.status}${detail ? `: ${detail}` : ""}`)
  }
}

export interface Usage {
  calls: number
  failedCalls: number
  inputTokens: number
  outputTokens: number
  model?: string
  /** The last failure, for the logs. */
  error?: { status: number; message: string }
}

export const costUsd = (usage: Pick<Usage, "inputTokens">) => (usage.inputTokens / 1_000_000) * JEV_PRICE_PER_MTOK

/**
 * Asks Jev about every row, a few batches at a time, and returns the decisions it could make, plus the rows there was
 * nothing to ask about (`unsent`: no amount, or fewer than two categories to choose from). A batch whose request fails
 * yields no decisions (its rows stay as they were, to try again later); when every batch fails, the last error is
 * thrown.
 */
export async function classify(rows: AiRow[], categories: AiCategory[], options: AskOptions & { names?: string[]; batchSize?: number }) {
  const batches = buildBatches(rows, categories, options)
  const usage: Usage = { calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0 }
  const decisions: Decision[] = []
  let failure: unknown
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]!
      try {
        const response = await askJev(batch.body, options)
        usage.calls++
        usage.inputTokens += response.usage?.input_tokens ?? 0
        usage.outputTokens += response.usage?.output_tokens ?? 0
        usage.model ??= response.model
        decisions.push(...readAnswers(batch, response))
      } catch (error) {
        usage.failedCalls++
        usage.error = { status: error instanceof JevError ? error.status : 0, message: error instanceof Error ? error.message : String(error) }
        failure = error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))
  if (batches.length && usage.failedCalls === batches.length) throw failure
  const sent = new Set(batches.flatMap((batch) => batch.rows.map((row) => row.id)))
  return { decisions, usage, unsent: rows.filter((row) => !sent.has(row.id)).map((row) => row.id) }
}
