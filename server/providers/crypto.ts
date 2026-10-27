// Exchanges and wallets through @vitehub-finance/crypto: one `crypto` account per connection, its coins as holdings, and
// for wallets with a public history, what moved in and out.
import { connect, type ChainId, type CryptoTransaction, type ExchangeCredentials, type ExchangeId } from "@vitehub-finance/crypto"
import { mapped, USER_AGENT, type FetchOptions, type ProviderCoinTransaction, type ProviderResult } from "./types"

export interface WalletCredentials {
  address: string
}

const coins = (quantity: number, symbol: string) => `${Math.abs(quantity).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${symbol}`

/** Enough of an address to recognize it: "rUrYCc…Yiws", "NQ08 ACT8 … NVXY". */
export function shortAddress(address: string) {
  const groups = address.split(" ")
  if (groups.length > 3) return `${groups[0]} ${groups[1]} … ${groups.at(-1)}`
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

/** What a wallet transaction changed its holding by: the coins that moved, less the fee. Staking keeps them in the holding. */
export const holdingChange = (transaction: CryptoTransaction) => (transaction.kind === "stake" ? 0 : transaction.quantity) - transaction.fee

/**
 * A wallet transaction as a row people understand. Its amount is what the holding changed by, fee included. Staking
 * moves are left out: the holding counts staked coins, so they change nothing. So are transactions that only cost a fee:
 * a few millionths of a coin, never worth a row (the balance history still counts them). Everything but rewards is a
 * transfer: coins moving between your wallet and an exchange, into an escrow, or swapped for another asset are neither
 * spending nor income.
 */
export function coinTransaction(transaction: CryptoTransaction): ProviderCoinTransaction | null {
  const { kind, quantity, symbol, counterparty } = transaction
  if (kind === "stake" || kind === "fee") return null
  const other = counterparty ? shortAddress(counterparty) : null
  const description =
    kind === "send"
      ? `Sent ${coins(quantity, symbol)}${other ? ` to ${other}` : ""}`
      : kind === "receive"
        ? `Received ${coins(quantity, symbol)}`
        : kind === "reward"
          ? `Received ${coins(quantity, symbol)} in rewards`
          : kind === "escrow"
            ? quantity < 0
              ? `Locked ${coins(quantity, symbol)} in escrow${other ? ` for ${other}` : ""}`
              : `Released ${coins(quantity, symbol)} from escrow`
            : quantity < 0
              ? `Swapped ${coins(quantity, symbol)}`
              : `Swapped for ${coins(quantity, symbol)}`
  return {
    externalId: transaction.id,
    date: transaction.date,
    symbol,
    quantity: quantity - transaction.fee,
    description,
    counterparty: other,
    transfer: kind !== "reward",
  }
}

/**
 * Reads one exchange or wallet. Holdings are priced later, in the household's currency, and wallet transactions valued
 * at their day's price (server/utils/prices.ts).
 */
export function cryptoProvider(id: ExchangeId | ChainId) {
  return async (credentials: ExchangeCredentials | WalletCredentials, options?: FetchOptions): Promise<ProviderResult> =>
    mapped(async () => {
      const provider = connect(id as ChainId, credentials as WalletCredentials, { userAgent: USER_AGENT })
      const holdings = await provider.balances()
      // History is a bonus: when it fails the balance still lands, and the next sync looks back far enough to catch up.
      const read =
        options && provider.transactions
          ? await provider.transactions({ since: options.since }).catch((error) => {
              console.warn(`[finance] ${provider.name} history unavailable`, error)
              return null
            })
          : null
      // Staking too: a read that fails leaves the last complete one in place rather than a partial history.
      const staking = provider.staking
        ? await provider.staking().catch((error) => {
            console.warn(`[finance] ${provider.name} staking unavailable`, error)
            return undefined
          })
        : undefined
      // A payment from a known validator is a staking reward, not money someone sent.
      const payouts = new Set(staking?.events.filter((event) => event.kind === "reward_paid").map((event) => event.id.replace(/:value$/, "")))
      const history = read?.map((row) => (row.kind === "receive" && payouts.has(row.id) ? { ...row, kind: "reward" as const } : row)) ?? null
      return {
        accounts: [
          {
            externalId: provider.address ?? "main",
            name: provider.kind === "wallet" ? `${provider.name} wallet` : provider.name,
            kind: "crypto",
            currency: "EUR",
            institution: provider.name,
            holdings: holdings.map(({ symbol, name, quantity }) => ({ symbol, name, quantity })),
            ...(staking && { staking }),
            coinTransactions: (history ?? []).map(coinTransaction).filter((row) => row !== null),
            ...(history && {
              coinHistory: {
                since: options?.since ?? null,
                changes: history.map((row) => ({ date: row.date, symbol: row.symbol, quantity: holdingChange(row) })).filter((change) => change.quantity !== 0),
              },
            }),
          },
        ],
      }
    })
}
