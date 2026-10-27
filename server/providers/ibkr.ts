// Interactive Brokers through @vitehub-finance/brokers: one `investment` account per IBKR account in the Flex Query, its
// positions and cash as holdings that carry IBKR's own prices, its trades and cash movements as transactions, and its
// daily net asset value as the balance chart's past. The engine converts them to the household's currency.
import { ibkr, type BrokerAccount, type IbkrCredentials } from "@vitehub-finance/brokers"
import { toMinor } from "../../shared/money"
import { mapped, USER_AGENT, type ProviderHolding, type ProviderResult, type ProviderTransaction } from "./types"

export type { IbkrCredentials }

/**
 * Positions and cash as holdings, priced by IBKR in their own currency; cash takes its currency code as the symbol.
 * An account keeps one holding per symbol, so a symbol seen twice (a ticker listed in two currencies) keeps the second
 * as "SYMBOL CUR".
 */
export function brokerHoldings(account: BrokerAccount): ProviderHolding[] {
  const holdings = new Map<string, ProviderHolding>()
  const add = (holding: ProviderHolding & { quote: { currency: string } }) => {
    const symbol = holdings.has(holding.symbol) ? `${holding.symbol} ${holding.quote.currency}` : holding.symbol
    holdings.set(symbol, { ...holding, symbol })
  }
  for (const position of account.positions)
    add({
      symbol: position.symbol,
      name: position.description,
      quantity: position.quantity,
      quote: { currency: position.currency, price: position.markPrice, value: position.value },
    })
  for (const cash of account.cash)
    add({ symbol: cash.currency, name: "Cash", quantity: cash.amount, quote: { currency: cash.currency, price: 1, value: cash.amount } })
  return [...holdings.values()]
}

const quantityText = (quantity: number) => String(Math.abs(quantity))
const priceText = (price: number, currency: string) => `${price.toLocaleString("en", { maximumFractionDigits: 4 })} ${currency}`

/**
 * Trades and cash movements as the account's transactions. A trade swaps cash for an instrument inside the account and a
 * deposit or withdrawal moves the household's own money, so both are transfers: neither is spending nor income.
 * Dividends, their tax, interest, and fees are.
 */
export function brokerTransactions(account: BrokerAccount): ProviderTransaction[] {
  const trades = account.trades.map((trade) => ({
    externalId: trade.id ? `trade:${trade.id}` : null,
    date: trade.date,
    amountMinor: toMinor(trade.netCash, trade.currency),
    currency: trade.currency,
    description: `${trade.quantity > 0 ? "Buy" : "Sell"} ${quantityText(trade.quantity)} ${trade.symbol} at ${priceText(trade.price, trade.currency)}`,
    counterparty: trade.description,
    transfer: true,
  }))
  const cash = account.cashMovements.map((movement) => ({
    externalId: movement.id ? `cash:${movement.id}` : null,
    date: movement.date,
    amountMinor: toMinor(movement.amount, movement.currency),
    currency: movement.currency,
    description: movement.description,
    transfer: movement.type === "Deposits/Withdrawals",
  }))
  return [...trades, ...cash]
}

/** Reads every account the Flex Query covers. */
export async function ibkrProvider(credentials: IbkrCredentials): Promise<ProviderResult> {
  return mapped(async () => {
    const accounts = await ibkr(credentials, { userAgent: USER_AGENT }).accounts()
    return {
      accounts: accounts.map((account) => ({
        externalId: account.id,
        name: `Interactive Brokers ${account.id}`,
        kind: "investment" as const,
        currency: "EUR",
        institution: "Interactive Brokers",
        holdings: brokerHoldings(account),
        transactions: brokerTransactions(account),
        dailyValues: account.history,
      })),
    }
  })
}
