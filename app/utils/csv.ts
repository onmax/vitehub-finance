// Bank exports as CSV, parsed in the browser: quoted fields (with "" escapes and line breaks inside), `;`, `,`, or
// tab delimiters, a byte-order mark, and a header row or none. Then dates and amounts in the formats banks use.
import { parseAmount } from "#shared/money"

export type CsvDelimiter = "," | ";" | "\t" | "|"
export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "DD-MM-YYYY" | "DD.MM.YYYY"
export type DecimalSeparator = "auto" | "," | "."

export const CSV_DELIMITERS: Array<{ value: CsvDelimiter; label: string }> = [
  { value: ";", label: "Semicolon (;)" },
  { value: ",", label: "Comma (,)" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe (|)" },
]

export const CSV_DATE_FORMATS: DateFormat[] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "DD.MM.YYYY"]

/** Rows of fields. Blank lines are dropped; the last field of each row keeps its inner line breaks. */
export function parseCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const input = text.replace(/^﻿/, "")
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index++
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"' && field.trim() === "") {
      quoted = true
      field = ""
    } else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.map((cells) => cells.map((cell) => cell.trim())).filter((cells) => cells.some((cell) => cell !== ""))
}

/** The delimiter that splits the first lines into the most, and most consistent, columns. */
export function detectCsvDelimiter(text: string): CsvDelimiter {
  const sample = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim()).slice(0, 20).join("\n")
  let best: CsvDelimiter = ","
  let bestScore = -1
  for (const { value } of CSV_DELIMITERS) {
    const counts = parseCsv(sample, value).map((row) => row.length)
    if (!counts.length) continue
    const mode = mostCommon(counts)
    if (mode < 2) continue
    const consistent = counts.filter((count) => count === mode).length / counts.length
    const score = consistent * 10 + mode
    if (score > bestScore) {
      bestScore = score
      best = value
    }
  }
  return best
}

function mostCommon(values: number[]) {
  const tally = new Map<number, number>()
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1)
  return [...tally].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0
}

/** A header row has no dates or amounts in it, while the rows below do. */
export function detectCsvHeader(rows: string[][]) {
  const [first, ...rest] = rows
  if (!first || !rest.length) return false
  const looksLikeData = (cell: string) => looksLikeDate(cell) || (/\d/.test(cell) && parseAmount(cell) !== null && /^[\s\d.,+\-()€$£]+$/.test(cell))
  const firstData = first.filter(looksLikeData).length
  const restData = rest.slice(0, 5).map((row) => row.filter(looksLikeData).length)
  return firstData === 0 && restData.some((count) => count > 0)
}

const looksLikeDate = (cell: string) => /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/.test(cell.trim())

export interface ColumnGuess {
  date: number | null
  amount: number | null
  debit: number | null
  credit: number | null
  description: number | null
  counterparty: number | null
}

const NAMES: Record<keyof ColumnGuess, RegExp> = {
  date: /^(fecha( (valor|operaci[oó]n|contable))?|date|booking date|transaction date|f\. ?valor|datum|data)$/i,
  amount: /^(importe|amount|cantidad|monto|betrag|valor|importe \(eur\)|amount \(eur\))$/i,
  debit: /^(debit|d[eé]bito|cargo|cargos|withdrawal|paid out|money out)$/i,
  credit: /^(credit|cr[eé]dito|abono|abonos|deposit|paid in|money in)$/i,
  description: /^(concepto|description|descripci[oó]n|details|memo|narrative|movimiento|reference|referencia|text)$/i,
  counterparty: /^(beneficiario|ordenante|payee|counterparty|merchant|comercio|name|nombre|contrapartida)$/i,
}

/** Which column holds what, from the header's words or, without one, from what the cells look like. */
export function guessCsvColumns(rows: string[][], hasHeader: boolean): ColumnGuess {
  const guess: ColumnGuess = { date: null, amount: null, debit: null, credit: null, description: null, counterparty: null }
  const header = hasHeader ? rows[0] ?? [] : []
  header.forEach((name, index) => {
    for (const key of Object.keys(NAMES) as Array<keyof ColumnGuess>) {
      if (guess[key] === null && NAMES[key].test(name.trim())) guess[key] = index
    }
  })
  const body = rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 10)
  const width = Math.max(0, ...rows.map((row) => row.length))
  const share = (index: number, test: (cell: string) => boolean) =>
    body.filter((row) => test(row[index] ?? "")).length / Math.max(1, body.length)
  const taken = () => new Set(Object.values(guess).filter((value): value is number => value !== null))
  if (guess.date === null) {
    for (let index = 0; index < width; index++) if (share(index, looksLikeDate) > 0.8) {
      guess.date = index
      break
    }
  }
  if (guess.amount === null && guess.debit === null) {
    for (let index = 0; index < width; index++) {
      if (taken().has(index)) continue
      if (share(index, (cell) => /\d/.test(cell) && /^[\s\d.,+\-()€$£]+$/.test(cell) && !looksLikeDate(cell)) > 0.8) {
        guess.amount = index
        break
      }
    }
  }
  if (guess.description === null) {
    let longest = -1
    for (let index = 0; index < width; index++) {
      if (taken().has(index)) continue
      const average = body.reduce((sum, row) => sum + (/[a-z]/i.test(row[index] ?? "") ? (row[index] ?? "").length : 0), 0)
      if (average > longest) {
        longest = average
        guess.description = index
      }
    }
  }
  return guess
}

/** Which of the date formats every sample parses with, the first that fits. */
export function detectCsvDateFormat(cells: string[]): DateFormat {
  const filled = cells.filter(Boolean).slice(0, 30)
  for (const format of CSV_DATE_FORMATS) if (filled.length && filled.every((cell) => parseCsvDate(cell, format) !== null)) return format
  return "DD/MM/YYYY"
}

/** A bank's date as `YYYY-MM-DD`, or null when it doesn't fit the format or isn't a real day. */
export function parseCsvDate(cell: string, format: DateFormat): string | null {
  const parts = cell.trim().split(/\s+/)[0]?.split(/[/.\-]/)
  if (!parts || parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return null
  const [a, b, c] = parts.map(Number) as [number, number, number]
  let year: number
  let month: number
  let day: number
  if (format === "YYYY-MM-DD") [year, month, day] = [a, b, c]
  else if (format === "MM/DD/YYYY") [month, day, year] = [a, b, c]
  else [day, month, year] = [a, b, c]
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** An amount in major units. With a decimal separator chosen, the other one is a thousands separator. */
export function parseCsvAmount(cell: string, decimal: DecimalSeparator): number | null {
  const trimmed = cell.trim()
  if (!trimmed) return null
  if (decimal === "auto") return parseAmount(trimmed)
  const negative = /^\(.*\)$/.test(trimmed) || /^-|-$|^−|−$/.test(trimmed.replace(/[^\d,.\-−()]/g, ""))
  const thousands = decimal === "," ? "." : ","
  const digits = trimmed.replace(/[^\d,.]/g, "").split(thousands).join("").replace(decimal, ".")
  if (!/\d/.test(digits)) return null
  const value = Number(digits)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

export interface CsvMapping {
  hasHeader: boolean
  date: number | null
  /** One signed amount column, or separate debit (out) and credit (in) columns. */
  amountMode: "single" | "split"
  amount: number | null
  debit: number | null
  credit: number | null
  description: number | null
  counterparty: number | null
  dateFormat: DateFormat
  decimal: DecimalSeparator
  /** Flip signs, for exports that list spending as positive numbers. */
  invert: boolean
}

export interface ImportRow {
  date: string
  amount: number
  description: string
  counterparty?: string | null
}

export type ParsedRow = { line: number; cells: string[] } & ({ ok: true; row: ImportRow } | { ok: false; error: string })

/** Every data row turned into what /api/accounts/:id/import takes, or the reason it can't be. */
export function mapCsvRows(rows: string[][], mapping: CsvMapping): ParsedRow[] {
  const body = rows.slice(mapping.hasHeader ? 1 : 0)
  const offset = mapping.hasHeader ? 2 : 1
  return body.map((cells, index): ParsedRow => {
    const line = index + offset
    const cell = (column: number | null) => (column === null ? "" : (cells[column] ?? "").replace(/\s+/g, " ").trim())
    const date = parseCsvDate(cell(mapping.date), mapping.dateFormat)
    if (!date) return { line, cells, ok: false, error: cell(mapping.date) ? `“${cell(mapping.date)}” isn’t a ${mapping.dateFormat} date` : "No date" }
    let amount: number | null
    if (mapping.amountMode === "split") {
      const out = parseCsvAmount(cell(mapping.debit), mapping.decimal)
      const into = parseCsvAmount(cell(mapping.credit), mapping.decimal)
      amount = out === null && into === null ? null : (into ?? 0) - Math.abs(out ?? 0)
    } else amount = parseCsvAmount(cell(mapping.amount), mapping.decimal)
    if (amount === null) return { line, cells, ok: false, error: "No amount" }
    if (mapping.invert) amount = -amount
    const description = cell(mapping.description) || cell(mapping.counterparty)
    if (!description) return { line, cells, ok: false, error: "No description" }
    const counterparty = cell(mapping.counterparty) || null
    return {
      line,
      cells,
      ok: true,
      row: { date, amount: Math.round(amount * 100) / 100, description: description.slice(0, 500), counterparty: counterparty?.slice(0, 200) ?? null },
    }
  })
}

/** Starting choices for a file: its delimiter, header, columns, date format, and decimal separator. */
export function suggestCsvMapping(text: string) {
  const delimiter = detectCsvDelimiter(text)
  const rows = parseCsv(text, delimiter)
  const hasHeader = detectCsvHeader(rows)
  const columns = guessCsvColumns(rows, hasHeader)
  const body = rows.slice(hasHeader ? 1 : 0)
  const dateFormat = detectCsvDateFormat(columns.date === null ? [] : body.map((row) => row[columns.date!] ?? ""))
  const amountCells = columns.amount === null ? [] : body.slice(0, 50).map((row) => row[columns.amount!] ?? "")
  const decimal: DecimalSeparator = amountCells.some((cell) => /,\d{1,2}$/.test(cell.trim()))
    ? ","
    : amountCells.some((cell) => /\.\d{1,2}$/.test(cell.trim()))
      ? "."
      : "auto"
  const mapping: CsvMapping = {
    hasHeader,
    date: columns.date,
    amountMode: columns.amount === null && (columns.debit !== null || columns.credit !== null) ? "split" : "single",
    amount: columns.amount,
    debit: columns.debit,
    credit: columns.credit,
    description: columns.description,
    counterparty: columns.counterparty,
    dateFormat,
    decimal,
    invert: false,
  }
  return { delimiter, rows, mapping }
}
