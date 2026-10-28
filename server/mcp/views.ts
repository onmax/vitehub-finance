// What get_finances answers, one function per view. Each reads through the same utils as the REST API and the pages,
// so an agent sees exactly what its user sees, and returns the text an agent reads plus the same data as structured
// content.
import { HTTPError } from "h3"
import { currencyDigits } from "#shared/money"
import type { Scope } from "#shared/access"
import { accountDetail, baseCurrency, householdCurrency, listAccounts } from "../utils/accounts"
import { addDays, isIsoMonth, monthLabel, monthOf, todayIso } from "../utils/dates"
import { forecast } from "../utils/forecast"
import type { Member } from "../utils/identity"
import { categorySpending, overview } from "../utils/overview"
import { recurringOverview } from "../utils/recurring"
import { accountLine, money, recurringLine, signed, text } from "./format"

const SURE = { high: "sure", medium: "likely", low: "unsure" } as const

// A coin's price can be a fraction of a cent (NIM): from the holding's value, to four significant digits.
const unitPrice = (valueMinor: number, quantity: number, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency, maximumSignificantDigits: 4 }).format(quantity ? valueMinor / 10 ** currencyDigits(currency) / quantity : 0)

export async function overviewView(who: Member, scope: Scope) {
  const data = await overview(who, scope)
  const c = data.currency
  const lines = [
    `Net worth: ${money(data.netWorthMinor, c)} across ${data.accountCount} ${data.accountCount === 1 ? "account" : "accounts"}.`,
    `${data.month.label}: in ${money(data.month.inMinor, c)}, out ${money(data.month.outMinor, c)} (last month: in ${money(data.month.previousInMinor, c)}, out ${money(data.month.previousOutMinor, c)}).`,
    data.spending.length
      ? `Spending this month: ${data.spending
          .slice(0, 8)
          .map((row) => `${row.name} ${money(row.amountMinor, c)}`)
          .join(", ")}.`
      : "No spending this month yet.",
    data.upcoming.length
      ? `Due in the next 14 days: ${data.upcoming.map((row) => `${row.name} ${signed(row.amountMinor, row.currency)} on ${row.nextDate}`).join(", ")}.`
      : "Nothing recurring due in the next 14 days.",
    ...(data.attention.length
      ? [
          `Needs attention: ${data.attention
            .map((row) => `${row.name} (${row.status}${row.consentExpiresAt ? `, consent until ${row.consentExpiresAt.slice(0, 10)}` : ""})`)
            .join(", ")}.`,
        ]
      : []),
    ...data.staking.map(
      (row) =>
        `Staking on ${row.accountName}: ${row.staked} ${row.symbol} staked${row.stakedValueMinor === null ? "" : ` (${money(row.stakedValueMinor, c)})`}, ${row.rewards} ${row.symbol} in identified rewards (a documented subset, not lifetime earnings). Use get_finances view "account" for details.`,
    ),
    data.recent.length
      ? `Latest: ${data.recent.map((row) => `${row.date} ${row.counterparty ?? row.description} ${signed(row.amountMinor, row.currency)}`).join("; ")}.`
      : "No transactions yet.",
  ]
  return { content: text(lines.join("\n")), structuredContent: { ...data } }
}

export async function accountsView(who: Member, scope: Scope, archived: boolean) {
  const [accounts, currency] = await Promise.all([
    listAccounts(who, { scope, archived }),
    householdCurrency(who.householdId),
  ])
  const total = accounts.filter((row) => row.includeInNetWorth && !row.archived).reduce((sum, row) => sum + row.balanceBaseMinor, 0)
  const body = accounts.length
    ? `${accounts.map((row) => accountLine(row, currency)).join("\n")}\nNet worth: ${money(total, currency)}.`
    : "No accounts the user can see yet. They add them in the browser by connecting a bank, exchange, wallet, or broker, or by adding a manual account."
  return { content: text(body), structuredContent: { currency, accounts } }
}

export async function spendingView(who: Member, scope: Scope, month: string | undefined) {
  const wanted = month ?? monthOf(todayIso())
  if (!isIsoMonth(wanted)) throw new HTTPError({ status: 400, message: "month must be YYYY-MM." })
  const { currency, convert } = await baseCurrency(who)
  const categories = await categorySpending(who, scope, wanted, convert)
  const totalMinor = categories.reduce((sum, row) => sum + row.amountMinor, 0)
  const body = categories.length
    ? `${monthLabel(wanted, "long")}: ${money(totalMinor, currency)} spent.\n${categories
        .map((row) => `- ${row.name}: ${money(row.amountMinor, currency)} (${Math.round((row.amountMinor / totalMinor) * 100)}%)`)
        .join("\n")}`
    : `No spending in ${monthLabel(wanted, "long")}.`
  return { content: text(body), structuredContent: { currency, month: wanted, totalMinor, categories } }
}

export async function recurringView(who: Member, scope: Scope) {
  const data = await recurringOverview(who, scope)
  const c = data.currency
  const lines = [
    `Recurring charges: ${money(data.totals.monthlyOutMinor, c)}/month (${money(data.totals.yearlyOutMinor, c)}/year); recurring income ${money(data.totals.monthlyInMinor, c)}/month.`,
    ...data.items.map((row) => recurringLine(row, c)),
    ...(data.insights.length
      ? ["Ways to save:", ...data.insights.map((row) => `- ${row.title}. ${row.detail} (saves ${money(row.savingsMinor, c)}/year)`)]
      : []),
  ]
  return { content: text(data.items.length ? lines.join("\n") : "No recurring payments found yet. They appear once a payment repeats in the transactions."), structuredContent: { ...data } }
}

export async function forecastView(who: Member, scope: Scope, months: number | undefined) {
  const data = await forecast(who, scope, months ?? 6)
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
}

/** One account: its balance, what it holds, its staking, and how its balance moved over the last 180 days. */
export async function accountView(who: Member, accountId: string) {
  const account = await accountDetail(who, accountId)
  if (!account) throw new HTTPError({ status: 404, message: `No account with id ${accountId}. Take ids from get_finances view "accounts".` })
  const base = await householdCurrency(who.householdId)
  const c = account.currency
  const first = account.history[0]
  const lines = [
    accountLine(account, base).slice(2),
    ...(first && first.date !== account.history.at(-1)?.date ? [`Balance on ${first.date}: ${money(first.balanceMinor, c)}; now ${money(account.balanceMinor, c)}.`] : []),
    ...(account.holdings.length
      ? ["Holdings:", ...account.holdings.map((row) => `- ${row.symbol}${row.name ? ` (${row.name})` : ""}: ${row.quantity}${row.priceMinor === null ? ", no price" : ` at ${unitPrice(row.valueMinor, row.quantity, c)}`} = ${money(row.valueMinor, c)}`)]
      : []),
  ]
  const staking = account.staking
  if (staking) {
    const a = staking.amounts
    const s = staking.symbol
    lines.push(
      `Staking (read ${staking.observedAt}): liquid ${a.liquid} ${s}, active ${a.active} ${s}, inactive ${a.inactive} ${s}, retired ${a.retired} ${s}. These are already in the holdings above.`,
      `Validator: ${staking.validator ?? "none"}${staking.validatorListed === false ? " (not in the public validator directory)" : ""}.`,
      `Identified rewards: ${a.rewardsPaid} ${s} paid, ${a.rewardsRestaked} ${s} restaked, ${a.fees} ${s} in staking fees. A documented subset from known validator addresses, not lifetime earnings.`,
      ...staking.monthly.map((row) => `- ${row.month}: ${row.paid} paid, ${row.restaked} restaked${row.valueMinor === null ? "" : ` (${money(row.valueMinor, c)} at today's price)`}`),
      `Principal moved (gross, never earnings): ${a.deposits} ${s} into staking, ${a.withdrawals} ${s} out; ${a.unclassified} ${s} arrived from other addresses.`,
      "Unpaid rewards, investment profit, and APY are unknown: don't estimate them.",
    )
  }
  return { content: text(lines.join("\n")), structuredContent: { ...account, history: account.history.slice(-30) } }
}
