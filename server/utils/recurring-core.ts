// Finds repeating payments in one account's transactions. Pure (no database), so vitest runs it directly;
// server/utils/recurring.ts loads the rows and stores what this returns.
import type { Cadence } from "#shared/api"
import { addDays, addMonths, daysBetween } from "./dates"

export interface RecurringInput {
  id: string
  date: string
  amountMinor: number
  description: string
  counterparty: string | null
  categoryId: string | null
}

export interface DetectedSeries {
  key: string
  name: string
  amountMinor: number
  previousAmountMinor: number | null
  cadence: Cadence
  lastDate: string
  nextDate: string
  occurrences: number
  categoryId: string | null
  transactionIds: string[]
}

/** How far back detection looks. */
export const WINDOW_DAYS = 400

/** Median days between charges for each cadence. Anything between the ranges is not a series. */
const CADENCES: Array<{ cadence: Cadence; min: number; max: number; minOccurrences: number }> = [
  { cadence: "weekly", min: 5, max: 9, minOccurrences: 3 },
  { cadence: "monthly", min: 26, max: 35, minOccurrences: 3 },
  { cadence: "quarterly", min: 85, max: 98, minOccurrences: 3 },
  { cadence: "yearly", min: 350, max: 380, minOccurrences: 2 },
]

const PERIOD_DAYS: Record<Cadence, number> = { weekly: 7, monthly: 30, quarterly: 91, yearly: 365 }

/** Charges per year, for yearly savings and monthly costs. */
export const PER_YEAR: Record<Cadence, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }

/** The cost per month of one charge at this cadence. */
export const monthlyAmount = (amountMinor: number, cadence: Cadence) => Math.round((amountMinor * PER_YEAR[cadence]) / 12)

/** The charge after `date`. */
export const advance = (date: string, cadence: Cadence, steps = 1) =>
  cadence === "weekly"
    ? addDays(date, 7 * steps)
    : addMonths(date, steps * (cadence === "monthly" ? 1 : cadence === "quarterly" ? 3 : 12))

/** The first charge after `lastDate` that falls on or after `today`. */
export function nextDueDate(lastDate: string, cadence: Cadence, today: string) {
  let steps = 1
  // Stepping from the same anchor keeps a 31st-of-the-month charge on the 31st when the month has one.
  while (advance(lastDate, cadence, steps) < today) steps++
  return advance(lastDate, cadence, steps)
}

/** Charges of a series in `[from, to]`, counting forward from its next date. */
export function occurrencesBetween(nextDate: string, cadence: Cadence, from: string, to: string) {
  const dates: string[] = []
  for (let steps = 0; ; steps++) {
    const date = steps === 0 ? nextDate : advance(nextDate, cadence, steps)
    if (date > to) break
    if (date >= from) dates.push(date)
  }
  return dates
}

// Words that say how someone paid, not whom: "COMPRA TARJ. NETFLIX" and "CARD PAYMENT NETFLIX" are one merchant.
const NOISE = new Set([
  "compra",
  "compras",
  "tarj",
  "tarjeta",
  "pago",
  "pagos",
  "recibo",
  "adeudo",
  "cargo",
  "en",
  "de",
  "card",
  "payment",
  "purchase",
  "pos",
  "debit",
  "direct",
  "dd",
  "sepa",
  "visa",
  "mastercard",
  "contactless",
  // Domains and company suffixes: "NETFLIX.COM" and "Netflix" are one merchant, "LANDLORD S.L." is "landlord".
  "www",
  "com",
  "es",
  "net",
  "org",
  "io",
  "sl",
  "sa",
  "slu",
  "ltd",
  "inc",
  "bv",
  "gmbh",
  "online",
  "ref",
  "the",
])

/** The words that name a payment, lowercased, with dates, card masks, reference numbers, and digits removed. */
export function normalizedWords(text: string) {
  return text
    .toLowerCase()
    .replace(/\b\d{1,4}[/.-]\d{1,2}(?:[/.-]\d{1,4})?\b/g, " ") // dates
    .replace(/[x*]{2,}\s?\d{2,}|\d{2,}\s?[x*]{2,}/g, " ") // card masks: ****1234, XX1234, 4111********
    .replace(/\b(?:ref|reference|referencia|nr|no|id|txn|auth)\b[\s.:#-]*(?=\S*\d)\S+/g, " ") // reference numbers
    .replace(/\b(?=\w*\d)\w{6,}\b/g, " ") // long codes that mix letters and digits
    .replace(/\d+/g, " ")
    .replace(/[^\p{L}\s]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !NOISE.has(word))
}

/** The merchant part of a transaction: its counterparty when the bank names one, else the description's first words. */
export function merchantKey(row: Pick<RecurringInput, "description" | "counterparty">) {
  const words = normalizedWords(row.counterparty?.trim() || row.description)
  return words.slice(0, 3).join(" ")
}

/** Identifies a series within an account: the merchant and whether money goes in or out. */
export function seriesKey(row: Pick<RecurringInput, "description" | "counterparty" | "amountMinor">) {
  const merchant = merchantKey(row)
  return merchant ? `${row.amountMinor < 0 ? "out" : "in"}:${merchant}` : null
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const titleCase = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(/-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())

function mostCommon<T>(values: T[]) {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const [value, count] of counts) if (count > bestCount) [best, bestCount] = [value, count]
  return { value: best, count: bestCount }
}

/** One series from a group of same-merchant, same-direction transactions, or null when they don't repeat. */
function seriesOf(key: string, rows: RecurringInput[], today: string): DetectedSeries | null {
  // Two charges on one day (a retry, a split payment) count as one occurrence.
  const byDate = new Map<string, RecurringInput>()
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) byDate.set(row.date, row)
  const series = [...byDate.values()]
  if (series.length < 2) return null

  const intervals = series.slice(1).map((row, index) => daysBetween(series[index]!.date, row.date))
  const interval = median(intervals)
  const match = CADENCES.find((entry) => interval >= entry.min && interval <= entry.max)
  if (!match || series.length < match.minOccurrences) return null
  // Most gaps must fit too: a median can land in range by chance when purchases are irregular.
  const fitting = intervals.filter((days) => days >= match.min && days <= match.max).length
  if (fitting < Math.ceil((intervals.length * 2) / 3)) return null

  const amounts = series.map((row) => Math.abs(row.amountMinor))
  const typical = median(amounts)
  const close = amounts.every((amount) => Math.abs(amount - typical) <= typical * 0.25)
  const same = mostCommon(amounts).count >= amounts.length * 0.8
  if (!close && !same) return null

  const last = series.at(-1)!
  // A series that stopped (a cancelled subscription) is no longer recurring.
  if (daysBetween(last.date, today) > PERIOD_DAYS[match.cadence] * 2 + 5) return null
  const named = [...series].reverse().find((row) => row.counterparty?.trim())
  return {
    key,
    name: titleCase(named?.counterparty ?? key.slice(key.indexOf(":") + 1)),
    amountMinor: last.amountMinor,
    previousAmountMinor: priceChange(series, today),
    cadence: match.cadence,
    lastDate: last.date,
    nextDate: nextDueDate(last.date, match.cadence, today),
    occurrences: series.length,
    categoryId: mostCommon(series.map((row) => row.categoryId).filter((id): id is string => Boolean(id))).value ?? null,
    transactionIds: rows.map((row) => row.id),
  }
}

/**
 * The old price when a fixed-price series changed price in the last 180 days: at least two charges at the old amount,
 * then every charge since at the new one. Variable bills (groceries, fuel) never qualify, so they never read as a
 * "price went up" insight, and the change stays visible after the second charge at the new price.
 */
export function priceChange(series: Array<Pick<RecurringInput, "amountMinor" | "date">>, today: string) {
  const last = series.at(-1)
  if (!last) return null
  let change = series.length - 1
  while (change > 0 && series[change - 1]!.amountMinor === last.amountMinor) change--
  if (change === 0) return null
  const previous = series[change - 1]!.amountMinor
  if (change < 2 || series[change - 2]!.amountMinor !== previous) return null
  return daysBetween(series[change]!.date, today) <= 180 ? previous : null
}

/** Every series in one account's transactions (already without excluded rows), as of `today`. */
export function detectSeries(rows: RecurringInput[], today: string): DetectedSeries[] {
  const since = addDays(today, -WINDOW_DAYS)
  const groups = new Map<string, RecurringInput[]>()
  for (const row of rows) {
    if (row.date < since || row.date > today || row.amountMinor === 0) continue
    const key = seriesKey(row)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  const found: DetectedSeries[] = []
  for (const [key, group] of groups) {
    const series = seriesOf(key, group, today)
    if (series) found.push(series)
  }
  return found.sort((a, b) => a.key.localeCompare(b.key))
}

/** A listed recurring row plus what insights need and the API doesn't return. */
export interface RecurringItem {
  id: string
  key: string
  ownerId: string
  ownerName: string
  accountName: string
  name: string
  amountMinor: number
  previousAmountMinor: number | null
  currency: string
  cadence: Cadence
  categoryId: string | null
  status: "detected" | "confirmed" | "dismissed"
  /** Household currency, negative for charges. */
  monthlyMinor: number
}

export interface InsightOptions {
  /** Household currency, for the text. */
  currency: string
  convert: (minor: number, from: string) => number
  format: (minor: number, currency: string) => string
  /** The household's Subscriptions category, if it has one. */
  subscriptionsCategoryId: string | null
  /** A subscription costing at least this per month (household currency) is "large". */
  largeMonthlyMinor: number
}

const CADENCE_WORD: Record<Cadence, string> = { weekly: "a week", monthly: "a month", quarterly: "a quarter", yearly: "a year" }

/**
 * Ways to save: price increases, the same subscription paid by two members (a couple both paying Spotify), and large
 * subscriptions. `items` must already be only what the caller may see.
 */
export function findInsights(items: RecurringItem[], options: InsightOptions) {
  const money = (minor: number, currency = options.currency) => options.format(minor, currency)
  const charges = items.filter((item) => item.status !== "dismissed" && item.amountMinor < 0)
  const yearly = (item: RecurringItem) => -item.monthlyMinor * 12
  const insights: Array<{
    kind: "price_increase" | "duplicate" | "unused" | "large_subscription"
    title: string
    detail: string
    savingsMinor: number
    recurringIds: string[]
  }> = []

  for (const item of charges) {
    if (item.previousAmountMinor === null || item.previousAmountMinor >= 0) continue
    const latest = -item.amountMinor
    const previous = -item.previousAmountMinor
    if (latest < previous * 1.03) continue
    const percent = Math.round(((latest - previous) / previous) * 100)
    const savingsMinor = options.convert((latest - previous) * PER_YEAR[item.cadence], item.currency)
    insights.push({
      kind: "price_increase",
      title: `${item.name} went up ${percent}%`,
      detail: `${money(previous, item.currency)} → ${money(latest, item.currency)} ${CADENCE_WORD[item.cadence]} on ${item.accountName}: ${money(savingsMinor)} more a year.`,
      savingsMinor,
      recurringIds: [item.id],
    })
  }

  const byKey = new Map<string, RecurringItem[]>()
  // By brand (the merchant's first word, with the direction): "netflix" and "netflix premium" are one service.
  const brand = (key: string) => key.split(" ")[0]!
  for (const item of charges) byKey.set(brand(item.key), [...(byKey.get(brand(item.key)) ?? []), item])
  for (const group of byKey.values()) {
    const owners = [...new Set(group.map((item) => item.ownerId))]
    if (owners.length < 2) continue
    const sorted = [...group].sort((a, b) => yearly(b) - yearly(a))
    const savingsMinor = sorted.slice(1).reduce((sum, item) => sum + yearly(item), 0)
    const names = [...new Set(group.map((item) => item.ownerName))]
    const who = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`
    insights.push({
      kind: "duplicate",
      title: `${sorted[0]!.name} is paid ${group.length === 2 ? "twice" : `${group.length} times`}`,
      detail: `${who} each pay for ${sorted[0]!.name} (${sorted.map((item) => `${money(-item.monthlyMinor)}`).join(" + ")} a month). One shared or family plan saves up to ${money(savingsMinor)} a year.`,
      savingsMinor,
      recurringIds: sorted.map((item) => item.id),
    })
  }

  if (options.subscriptionsCategoryId)
    for (const item of charges) {
      if (item.categoryId !== options.subscriptionsCategoryId || -item.monthlyMinor < options.largeMonthlyMinor) continue
      insights.push({
        kind: "large_subscription",
        title: `${item.name} costs ${money(-item.monthlyMinor)} a month`,
        detail: `${money(yearly(item))} a year on ${item.accountName}. Worth checking it's still used, or whether a cheaper plan fits.`,
        savingsMinor: yearly(item),
        recurringIds: [item.id],
      })
    }

  return insights.sort((a, b) => b.savingsMinor - a.savingsMinor)
}
