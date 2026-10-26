// Calendar math on `YYYY-MM-DD` strings, in UTC so a date never shifts with the host's timezone.
// Pure: tests import it without ViteHub.

const DAY = 86_400_000
const pad = (value: number) => String(value).padStart(2, "0")
const parse = (date: string) => new Date(`${date}T00:00:00Z`)

export const isoDate = (date: Date) => date.toISOString().slice(0, 10)
export const todayIso = () => isoDate(new Date())

export const addDays = (date: string, days: number) => isoDate(new Date(parse(date).getTime() + days * DAY))

export const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / DAY)

/** Same day of the month, clamped to the month's last day (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number]
  const total = year * 12 + (month - 1) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = total - nextYear * 12
  const last = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate()
  return `${nextYear}-${pad(nextMonth + 1)}-${pad(Math.min(day, last))}`
}

export const monthOf = (date: string) => date.slice(0, 7)
export const monthStart = (month: string) => `${month}-01`
export const shiftMonth = (month: string, months: number) => addMonths(monthStart(month), months).slice(0, 7)
export const monthEnd = (month: string) => addDays(monthStart(shiftMonth(month, 1)), -1)
export const daysInMonth = (month: string) => Number(monthEnd(month).slice(8))

/** "Nov 2026" (short) or "November 2026" (long). */
export const monthLabel = (month: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat("en", { month: style, year: "numeric", timeZone: "UTC" }).format(parse(monthStart(month)))

/** Every date from `from` to `to`, both included. */
export function eachDay(from: string, to: string) {
  const days: string[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) days.push(date)
  return days
}

export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isoDate(parse(value)) === value
export const isIsoMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
