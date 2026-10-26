import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { forecast } from "../../utils/forecast"
import { addDays } from "../../utils/dates"
import { requireMember } from "../../utils/identity"
import { money, ScopeInput, signed, text } from "../format"
import { toolInput } from "../schema"

const SURE = { high: "sure", medium: "likely", low: "unsure" } as const

export default defineMcpTool({
  name: "get_forecast",
  title: "Cash-flow forecast",
  description:
    "Projects the cash balance (checking, savings, cash, and credit accounts) day by day: recurring income and bills when they fall due, plus the usual spending and moves to other accounts from the last 3 full months, with a likely range (8 in 10) that widens further ahead. Returns the lowest expected balance and its date, the first day the low end of the range goes below zero, each month's income, bills, everyday spending, money moved out, and end balance, each account's own lowest point, and the expected payments of the next 30 days, incoming (salaries and other income) and outgoing, with how sure each is (sure, likely, unsure: from how regular its date and amount have been). Household currency.",
  annotations: { readOnlyHint: true },
  inputSchema: toolInput(
    v.object({
      months: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24), v.description("Months ahead, 1 to 24; 6 by default."))),
      scope: ScopeInput,
    }),
  ),
  handler: async ({ months, scope }, event) => {
    const who = await requireMember(event)
    const data = await forecast(who, scope ?? "household", months ?? 6)
    const c = data.currency
    const soon = addDays(data.today, 30)
    const series = new Map(data.series.map((entry) => [entry.id, entry]))
    const upcoming = data.payments
      .filter((payment) => payment.date <= soon && series.get(payment.seriesId)?.kind !== "transfer")
      .map((payment) => ({ ...payment, series: series.get(payment.seriesId)! }))
    const line = (payment: (typeof upcoming)[number]) =>
      `- ${payment.date} ${payment.series.name}: ${signed(payment.amountMinor, c)} on ${payment.series.accountName} (${payment.series.ownerName}), ${SURE[payment.series.confidence]}${payment.series.dayRange ? `, lands within ${payment.series.dayRange} days` : ""}${payment.series.amountRange > 0.05 ? `, amount varies ±${Math.round(payment.series.amountRange * 100)}%` : ""}`
    const incoming = upcoming.filter((payment) => payment.amountMinor > 0)
    const outgoing = upcoming.filter((payment) => payment.amountMinor < 0)
    const below = data.accounts.filter((account) => account.kind !== "credit" && account.lowest.balanceMinor < 0)
    const lines = [
      `Today: ${money(data.startMinor, c)}. Usual spending ${money(data.variableMonthlyMinor, c)}/month, moved to other accounts ${signed(-data.movedMonthlyMinor, c)}/month; average income ${money(data.averageMonthlyIncomeMinor, c)}/month; saving ${signed(data.monthlySavingsMinor, c)}/month. Based on ${data.dataDays} days of transactions.`,
      `Lowest expected balance: ${money(data.lowest.balanceMinor, c)} on ${data.lowest.date} (low end ${money(data.lowest.lowMinor, c)}).${data.riskDate ? ` The low end of the range goes below zero on ${data.riskDate}.` : ""}`,
      ...below.map((account) => `${account.name} (${account.ownerName}) may go below zero: ${money(account.lowest.balanceMinor, c)} on ${account.lowest.date}.`),
      "",
      `Incoming in the next 30 days (${money(
        incoming.reduce((sum, payment) => sum + payment.amountMinor, 0),
        c,
      )}):`,
      ...(incoming.length ? incoming.map(line) : ["- None expected."]),
      `Going out in the next 30 days (${money(
        -outgoing.reduce((sum, payment) => sum + payment.amountMinor, 0),
        c,
      )}, plus usual spending):`,
      ...(outgoing.length ? outgoing.map(line) : ["- None expected."]),
      "",
      ...data.months.map(
        (row) =>
          `- End of ${row.label}: ${money(row.balanceMinor, c)} (likely ${money(row.lowMinor, c)} to ${money(row.highMinor, c)}); income ${money(row.incomeMinor, c)}, bills ${money(row.billsMinor, c)}, spending ${money(row.variableOutMinor, c)}, moved out ${signed(-row.movedOutMinor, c)}, net ${signed(row.netMinor, c)}`,
      ),
    ]
    // The daily points are for charts; agents get the months, the series, and the next 30 days' payments.
    const { days: _days, history: _history, ...rest } = data
    return {
      content: text(lines.join("\n")),
      structuredContent: { ...rest, payments: data.payments.filter((payment) => payment.date <= soon), accounts: data.accounts.map(({ weekly: _, ...account }) => account) },
    }
  },
})
