import * as v from "valibot"
import { PaymentsError } from "./errors.ts"
import type { PaymentBalance, PaymentMovement, PaymentRead } from "./model.ts"

const integer = v.pipe(v.number(), v.safeInteger())
const timestamp = v.pipe(integer, v.minValue(0), v.maxValue(253402300799))
const currency = v.pipe(v.string(), v.regex(/^[a-z]{3}$/))
const token = v.pipe(v.string(), v.minLength(1), v.maxLength(100), v.regex(/^[a-z0-9_]+$/))
const transactionId = v.pipe(v.string(), v.regex(/^txn_[a-zA-Z0-9]+$/))
const balanceEntry = v.object({ amount: integer, currency })
const balanceSchema = v.object({ livemode: v.boolean(), available: v.array(balanceEntry), pending: v.array(balanceEntry) })
const movementSchema = v.pipe(v.object({
  id: transactionId,
  amount: integer,
  fee: integer,
  net: integer,
  created: timestamp,
  available_on: timestamp,
  currency,
  status: v.picklist(["pending", "available"]),
  type: token,
  reporting_category: token,
  source: v.nullable(v.pipe(v.string(), v.regex(/^[a-zA-Z0-9_]+$/), v.maxLength(255))),
  balance_type: v.optional(v.string()),
}), v.check((row) => Number.isSafeInteger(row.amount - row.fee) && row.net === row.amount - row.fee))
const pageSchema = v.object({ data: v.array(movementSchema), has_more: v.boolean() })
const accountSchema = v.object({ id: v.pipe(v.string(), v.regex(/^acct_[a-zA-Z0-9]+$/)) })

export interface StripeOptions {
  fetch?: typeof fetch
  userAgent?: string
  timeoutMs?: number
}

const TRANSFERS = new Set([
  "payout", "payout_cancel", "payout_failure", "payout_reversal", "topup", "topup_reversal",
  "payout_minimum_balance_hold", "payout_minimum_balance_release", "reserved_funds", "reserve_hold", "reserve_release",
  "reserve_transaction", "risk_reserved_funds", "connect_reserved_funds", "payment_network_reserve_hold", "payment_network_reserve_release",
  "currency_conversion", "balance_transfer_inbound", "balance_transfer_outbound", "advance", "advance_funding", "tax_fund",
])

/** Connect transfers can pay other merchants; only known movements between the owner's balances are transfers here. */
export const isStripeTransfer = (row: Pick<PaymentMovement, "type" | "reportingCategory">) =>
  TRANSFERS.has(row.type) || TRANSFERS.has(row.reportingCategory)

function parse<S extends v.GenericSchema>(schema: S, value: unknown): v.InferOutput<S> {
  const result = v.safeParse(schema, value)
  if (!result.success) throw new PaymentsError("unavailable", "Stripe returned an unreadable ledger. Try syncing again later.")
  return result.output
}

// Stripe retains hundredths for ISK and UGX although ISO/Intl formats their minor units as whole currency units.
function minor(amount: number, code: string): number {
  const value = code === "isk" || code === "ugx" ? amount / 100 : amount
  if (!Number.isSafeInteger(value)) throw new PaymentsError("unavailable", "Stripe returned an unreadable ledger. Try syncing again later.")
  return value
}

const movement = (row: v.InferOutput<typeof movementSchema>): PaymentMovement => ({
  id: row.id,
  created: row.created,
  currency: row.currency.toUpperCase(),
  grossMinor: minor(row.amount, row.currency),
  feeMinor: minor(row.fee, row.currency),
  netMinor: minor(row.net, row.currency),
  status: row.status,
  availableOn: row.available_on,
  type: row.type,
  reportingCategory: row.reporting_category,
  sourceId: row.source,
})

/** The merchant's Payments balance only. Other Stripe products have separate balances and ledgers. */
export function stripe(credentials: { key: string }, options: StripeOptions = {}) {
  if (!/^rk_live_[a-zA-Z0-9]+$/.test(credentials.key))
    throw new PaymentsError("live_required", "Use a live restricted Stripe key starting with rk_live_.")
  const send = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))

  async function get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`https://api.stripe.com/v1/${path}`)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    let response: Response
    try {
      response = await send(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${credentials.key}`,
          "user-agent": options.userAgent ?? "ViteHubFinance/0.1 (+https://github.com/onmax/vitehub-finance)",
          "stripe-version": "2025-06-30.basil",
        },
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      })
    } catch {
      throw new PaymentsError("unavailable", "Couldn't reach Stripe. Try syncing again later.")
    }
    if (response.status === 401) throw new PaymentsError("invalid_credentials", "Stripe rejected this key. Check it or create a new restricted key.")
    if (response.status === 403) throw new PaymentsError("permissions", "Give the Stripe key Read access to Accounts and Balance, then connect again.")
    if (response.status === 429) throw new PaymentsError("rate_limited", "Stripe is limiting requests. Try syncing again later.")
    if (!response.ok) throw new PaymentsError("unavailable", "Stripe couldn't return the ledger. Try syncing again later.")
    return response.json().catch(() => {
      throw new PaymentsError("unavailable", "Stripe returned an unreadable ledger. Try syncing again later.")
    })
  }

  async function balances(): Promise<PaymentBalance[]> {
    const data = parse(balanceSchema, await get("balance"))
    if (!data.livemode) throw new PaymentsError("live_required", "Use a live restricted Stripe key starting with rk_live_.")
    const currencies = new Map<string, PaymentBalance>()
    for (const state of ["available", "pending"] as const) {
      for (const entry of data[state]) {
        const code = entry.currency.toUpperCase()
        const row = currencies.get(code) ?? { currency: code, availableMinor: 0, pendingMinor: 0 }
        row[state === "available" ? "availableMinor" : "pendingMinor"] += minor(entry.amount, entry.currency)
        if (!Number.isSafeInteger(row.availableMinor + row.pendingMinor))
          throw new PaymentsError("unavailable", "Stripe returned an unreadable ledger. Try syncing again later.")
        currencies.set(code, row)
      }
    }
    return [...currencies.values()]
  }

  return {
    /** Checks identity and every required permission before credentials are persisted. */
    async verify(): Promise<{ accountId: string }> {
      const account = parse(accountSchema, await get("account"))
      await balances()
      parse(pageSchema, await get("balance_transactions", { limit: "1" }))
      return { accountId: account.id }
    },
    async read(input: { since: string | null; pendingIds?: string[] }): Promise<PaymentRead> {
      // Freeze the created-time window so new payments don't move pagination while history is read.
      const params: Record<string, string> = { limit: "100", "created[lte]": String(Math.floor(Date.now() / 1000)) }
      if (input.since) params["created[gte]"] = String(Math.floor(Date.parse(`${input.since}T00:00:00Z`) / 1000))
      const movements = new Map<string, PaymentMovement>()
      let cursor: string | undefined
      for (let page = 0; ; page++) {
        if (page >= 1000) throw new PaymentsError("unavailable", "Stripe history is too large to sync in one read.")
        const result = parse(pageSchema, await get("balance_transactions", { ...params, ...(cursor ? { starting_after: cursor } : {}) }))
        for (const row of result.data)
          if (!row.balance_type || row.balance_type === "payments") movements.set(row.id, movement(row))
        if (!result.has_more) break
        const next = result.data.at(-1)?.id
        if (!next || cursor === next) throw new PaymentsError("unavailable", "Stripe returned an unreadable ledger. Try syncing again later.")
        cursor = next
      }
      // Settlement updates an old row without changing its created timestamp.
      for (const id of new Set(input.pendingIds ?? [])) {
        if (movements.has(id)) continue
        parse(transactionId, id)
        const row = parse(movementSchema, await get(`balance_transactions/${id}`))
        if (!row.balance_type || row.balance_type === "payments") movements.set(row.id, movement(row))
      }
      return { balances: await balances(), movements: [...movements.values()] }
    },
  }
}
