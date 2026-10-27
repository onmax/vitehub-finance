import { translate } from "./translate"
// Dates and times for people: "Today", "Yesterday", "12 Oct", "3 min ago". Transactions, snapshots, and recurring rows
// carry `YYYY-MM-DD` strings; timestamps (last sync, sessions) are ISO strings. Everything formats with the
// active language through Intl.

import { activeLocale, currentFormatLocale as locale } from "../lib/i18n"

/** A `YYYY-MM-DD` day as a local date, without the UTC shift `new Date("2026-10-12")` would apply. */
export function parseDay(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year!, (month ?? 1) - 1, date ?? 1)
}

export function toDay(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const today = () => toDay(new Date())

export function addDays(day: string, days: number) {
  const date = parseDay(day)
  date.setDate(date.getDate() + days)
  return toDay(date)
}

/** Whole days from today to `day`: 0 today, 1 tomorrow, −1 yesterday. */
export function daysFromToday(day: string) {
  const start = parseDay(today()).getTime()
  return Math.round((parseDay(day).getTime() - start) / 86_400_000)
}

/** "Today", "Yesterday", "Tomorrow", "12 Oct", or "12 Oct 2025" outside this year. */
export function formatDay(day: string, { relative = true }: { relative?: boolean } = {}) {
  const offset = daysFromToday(day)
  if (relative && offset === 0) return translate('today')
  if (relative && offset === -1) return translate('yesterday')
  if (relative && offset === 1) return translate('tomorrow')
  const date = parseDay(day)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: activeLocale.value === "es" ? "long" : "short", year: sameYear ? undefined : "numeric" }).format(date)
}

/** "12 Oct 2026". */
export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? (/^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDay(value) : new Date(value)) : value
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: activeLocale.value === "es" ? "long" : "short", year: "numeric" }).format(date)
}

/** "October 2026" for `2026-10`. */
export function formatMonth(month: string, style: "long" | "short" = "long") {
  const date = parseDay(`${month}-01`)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(locale(), { month: style, year: style === "short" && sameYear ? undefined : "numeric" }).format(date)
}

export const currentMonth = () => today().slice(0, 7)

export function addMonths(month: string, months: number) {
  const date = parseDay(`${month}-01`)
  date.setMonth(date.getMonth() + months)
  return toDay(date).slice(0, 7)
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago"; older than a week reads as a date. */
export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return translate("never")
  const date = typeof value === "string" ? new Date(value) : value
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return translate('justNow')
  const format = new Intl.RelativeTimeFormat(locale(), { numeric: "auto", style: "long" })
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute")
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour")
  if (abs < 7 * 86_400) return format.format(Math.round(seconds / 86_400), "day")
  return formatDate(date)
}

/** "12 Oct, 14:05" for a timestamp. */
export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: activeLocale.value === "es" ? "long" : "short", hour: "2-digit", minute: "2-digit" }).format(date)
}

/** Two letters for a monogram: "Mercadona" → "ME", "Lucía Martín" → "LM". */
export function initials(text: string) {
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

/** "12.4%" with a true minus; `null` when there is nothing to compare against. */
export function formatPercent(value: number | null, { signed = false, digits = 0 } = {}) {
  if (value === null || !Number.isFinite(value)) return null
  return new Intl.NumberFormat(locale(), {
    style: "percent",
    maximumFractionDigits: digits,
    signDisplay: signed ? "exceptZero" : "auto",
  })
    .format(value)
    .replace("-", "−")
}

export const formatCount = (value: number) => new Intl.NumberFormat(locale()).format(value)
