// Rules worth adding, found in a household's own transactions, and what "apply to similar" matches on. Pure (no
// database), so vitest runs it directly; server/api/rules/suggestions.get.ts loads the rows and rules it reads.
import type { RuleSuggestion } from "../../shared/api"
import { ruleActions, startsWord, type Rule } from "../providers/dedupe"
import { normalizedWords } from "./recurring-core"

/**
 * What "apply to similar" matches on: the counterparty when the bank names one, else the description's first
 * meaningful words (up to three in a row, skipping card masks, dates, and payment words), as they appear in it.
 */
export function similarMatch(row: { description: string; counterparty: string | null }) {
  const counterparty = row.counterparty?.trim().toLowerCase()
  if (counterparty && counterparty.length >= 3) return counterparty
  const text = row.description.toLowerCase()
  const tokens = [...text.matchAll(/\S+/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    meaningful: !/\d/.test(match[0]) && normalizedWords(match[0]).length > 0,
  }))
  const first = tokens.findIndex((token) => token.meaningful)
  if (first < 0) return null
  let last = first
  while (last + 1 < tokens.length && last - first < 2 && tokens[last + 1]!.meaningful) last++
  const match = text.slice(tokens[first]!.start, tokens[last]!.end).replace(/[.,;:]+$/, "")
  return match.length >= 3 ? match : null
}

/**
 * Moves banks make on their own, which clutter the list without being spending: round-ups into savings, Revolut's
 * spare change and currency exchanges. Specific phrases only, since an excluding rule hides what it matches.
 */
export const AUTOMATIC_MOVES = [
  "spare change",
  "round up",
  "round-up",
  "roundup",
  "redondeo",
  "arrondi",
  "aufrundung",
  "exchanged to",
]

export interface SuggestionRow {
  description: string
  counterparty: string | null
  categoryId: string | null
  categorySource: "rule" | "ai" | "manual" | null
  aiGuessId: string | null
  excluded: boolean
  excludeSource: "rule" | "manual" | null
  /** One side of a detected move between the household's accounts. */
  transfer: boolean
}

/** Rows a suggestion needs before it's worth a rule. */
export const MIN_ROWS = 3
/** At most this many suggestions at once, the ones that would match the most first. */
export const MAX_SUGGESTIONS = 8

const plain = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/**
 * Whether `match` names one of `people` (the household's members): their first name and another word of their name (or
 * the first name alone, for a one-word name). Money between members isn't a payee to file; a relative who shares their
 * surnames is.
 */
export function namesSomeone(match: string, people: string[]) {
  const words = new Set(plain(match).split(/[^\p{L}\p{N}]+/u))
  return people.some((person) => {
    const parts = plain(person).split(/\s+/).filter((part) => part.length >= 3)
    const [first, ...rest] = parts
    return first !== undefined && words.has(first) && (!rest.length || rest.some((part) => words.has(part)))
  })
}

const haystack = (row: Pick<SuggestionRow, "description" | "counterparty">) => `${row.description.toLowerCase()}\n${(row.counterparty ?? "").toLowerCase()}`

/** The most common value and its share of `values`. */
function top(values: string[]) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const [value, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  return { value, count, share: values.length ? count / values.length : 0 }
}

/**
 * Rules the household's transactions call for, not yet covered by `rules` or dismissed:
 * - exclude: at least MIN_ROWS rows from an AUTOMATIC_MOVES phrase that no rule excludes and no one showed by hand;
 * - file: a payee (`similarMatch`) seen at least MIN_ROWS times that no rule files, under the category people picked
 *   by hand for it (at least twice, 80% agreeing), else the one AI picked or guessed for most (60%) of its rows, else
 *   none, for people to pick, when at least MIN_ROWS are uncategorized. Moves between accounts are left out (transfer
 *   detection files them), and so is money between `people`, the household's members.
 * Each one counts the rows its rule would match.
 */
export function suggestRules(rows: SuggestionRow[], rules: Rule[], dismissed: Set<string>, people: string[] = []): RuleSuggestion[] {
  const texts = rows.map(haystack)
  const matching = (match: string) => rows.filter((_, index) => startsWord(texts[index]!, match))
  const suggestions: RuleSuggestion[] = []

  for (const phrase of AUTOMATIC_MOVES) {
    const key = `exclude:${phrase}`
    if (dismissed.has(key)) continue
    const matched = matching(phrase)
    if (matched.some((row) => row.excludeSource === "manual" && !row.excluded)) continue
    const open = matched.filter((row) => !ruleActions(rules, row).exclude)
    if (open.length < MIN_ROWS) continue
    suggestions.push({ key, kind: "exclude", match: phrase, categoryId: null, because: "automatic", count: open.length, example: open[0]!.description })
  }

  const payees = new Map<string, SuggestionRow[]>()
  for (const row of rows) {
    if (row.transfer) continue
    const match = similarMatch(row)
    if (match) payees.set(match, [...(payees.get(match) ?? []), row])
  }
  for (const [match, group] of payees) {
    const key = `file:${match}`
    if (group.length < MIN_ROWS || dismissed.has(key) || AUTOMATIC_MOVES.some((phrase) => match.includes(phrase)) || namesSomeone(match, people)) continue
    const matched = matching(match)
    const open = matched.filter((row) => !row.transfer && !ruleActions(rules, row).categoryId)
    if (open.length < MIN_ROWS) continue
    const manual = top(open.filter((row) => row.categorySource === "manual" && row.categoryId).map((row) => row.categoryId!))
    const ai = top(open.map((row) => (row.categorySource === "ai" ? row.categoryId : row.categoryId ? null : row.aiGuessId)).filter((id): id is string => Boolean(id)))
    const uncategorized = open.filter((row) => !row.categoryId).length
    const suggest = (categoryId: string | null, because: RuleSuggestion["because"]) =>
      suggestions.push({ key, kind: "file", match, categoryId, because, count: open.length, example: open[0]!.description })
    // Rows people filed by hand, or AI did, already have their category; a rule files the next ones at once.
    if (manual.count >= 2 && manual.share >= 0.8) suggest(manual.value, "manual")
    else if (ai.count >= MIN_ROWS && ai.count / open.length >= 0.6) suggest(ai.value, "ai")
    else if (uncategorized >= MIN_ROWS) suggest(null, "repeats")
  }
  return suggestions.sort((a, b) => b.count - a.count).slice(0, MAX_SUGGESTIONS)
}
