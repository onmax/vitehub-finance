import * as v from 'valibot'
const IdDate = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/), v.check(value => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Use YYYY-MM-DD.'))
const IsoDate = IdDate
const Name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))
const PositiveMinor = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const Share = v.pipe(v.number(), v.finite(), v.minValue(-0.9), v.maxValue(3))
const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(200))
const Event = v.pipe(v.object({
  id: v.pipe(Id, v.check(value => value !== 'purchase', 'Use a unique event id.')), name: Name, accountId: Id,
  kind: v.picklist(['income', 'expense']),
  amountMinor: v.pipe(PositiveMinor, v.minValue(1)), date: IsoDate,
  cadence: v.picklist(['once', 'weekly', 'monthly', 'quarterly', 'yearly']),
  endDate: v.nullable(IsoDate),
}), v.check(event => !event.endDate || event.endDate >= event.date, 'End date must follow start date.'))
export const ForecastScenarioSchema = v.object({
  skip: v.pipe(v.array(Id), v.maxLength(500)), incomeChange: Share,
  oneOff: v.nullable(v.object({ date: IsoDate, amountMinor: PositiveMinor, accountId: v.optional(Id) })),
  accountId: v.optional(Id), minimumReserveMinor: v.optional(PositiveMinor), protectGoals: v.optional(v.boolean()),
  spendingMode: v.optional(v.picklist(['history', 'budget'])), spendingChange: v.optional(Share),
  incomeDelayDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(90))),
  events: v.optional(v.pipe(v.array(Event), v.maxLength(100), v.check(events => new Set(events.map(event => event.id)).size === events.length, 'Use unique event ids.'))),
})
export const PlanBody = v.object({ name: Name, visibility: v.picklist(['private', 'household']), scenario: ForecastScenarioSchema })
