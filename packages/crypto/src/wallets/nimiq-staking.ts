// Nimiq staking from public data: NimiqWatch's JSON-RPC for the balances, the validator, and the address's transactions;
// NimiqWatch's restake index for rewards added to the stake; and the Nimiq validators directory to tell which senders are
// validators. Read-only: no keys, no signing.
//
// A payment counts as a reward only when it comes from a validator in the directory, the current validator, or that
// validator's on-chain reward address. Anything else that arrives stays unclassified. The directory is today's, so an
// old or custom payout address can be missing: identified rewards are a documented subset, not lifetime earnings.
import { CryptoError, type CryptoErrorCode } from "../errors.ts"
import { describeBody, jsonRpc, readBody, type Request } from "../http.ts"
import type { StakingEvent, StakingLedger } from "../staking.ts"
import { parseNimiqAddress } from "./address.ts"

export const NIMIQ_RPC = "https://rpc.nimiqwatch.com"
export const NIMIQ_WATCH = "https://v2.nimiqwatch.com/api/v2"
export const NIMIQ_VALIDATORS = "https://validators-api-main.je-cf9.workers.dev/api/v1/validators"
/** Proof-of-stake (Albatross) began at this block and time; staking can't be older. */
export const NIMIQ_POS_HEIGHT = 3_456_000
export const NIMIQ_POS_GENESIS = "2024-11-19T16:45:20.000Z"

const PAGE = 100
const MAX_PAGES = 40

export interface NimiqStakingOptions {
  request: Request
  rpcUrl?: string
  watchUrl?: string
  validatorsUrl?: string
  /** The end of the interval; defaults to now. */
  now?: Date
}

/** "NQ07 0000 …" in any spacing or case as "NQ070000…", the form the restake index takes in its URL. */
export const compactNimiq = (address: string) => address.replace(/\s+/g, "").toUpperCase()

/** Where staked NIM sits: deposits go to it, withdrawals come from it. */
export const NIMIQ_STAKING_CONTRACT = compactNimiq("NQ77 0000 0000 0000 0000 0000 0000 0000 0001")

/** When a transaction happened, in milliseconds: proof-of-stake blocks stamp milliseconds, the older chain seconds. */
export function nimiqTime(tx: { blockNumber?: unknown; timestamp?: unknown }) {
  const timestamp = Number(tx.timestamp)
  const height = Number(tx.blockNumber)
  return Number.isFinite(height) && height < NIMIQ_POS_HEIGHT ? timestamp * 1000 : timestamp
}

function atoms(value: unknown, field: string, fail: (message: string) => CryptoError) {
  const text = typeof value === "number" ? (Number.isSafeInteger(value) ? String(value) : "") : typeof value === "string" ? value : ""
  if (!/^\d+$/.test(text)) throw fail(`NimiqWatch sent ${field} that isn't a whole number of base units.`)
  return BigInt(text)
}

async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** One NimiqWatch JSON-RPC call's `result.data`. `absent` names the error message that means "nothing here". */
export async function nimiqRpc(request: Request, url: string, method: string, params: unknown[], absent?: string) {
  const fail = (code: CryptoErrorCode, message: string) => new CryptoError(code, message, "nimiq")
  const { response, body } = await jsonRpc(request, url, method, params)
  if (response.status === 429) throw fail("rate_limited", "The Nimiq server is busy. Try again in a few minutes.")
  if (!response.ok) throw fail("unavailable", `The Nimiq server returned HTTP ${response.status}. Try again later.`)
  if (body.error) {
    const detail = String(body.error.data ?? body.error.message ?? "")
    if (absent && detail.startsWith(absent)) return null
    throw fail("unavailable", `The Nimiq server couldn't answer ${method}. Try again later. Details: ${describeBody(body.error, "unknown error")}`)
  }
  return body.result?.data ?? null
}

async function getJson(request: Request, url: string, label: string) {
  const response = await request(url, { headers: { accept: "application/json" } })
  const body = await readBody(response)
  if (response.status === 429) throw new CryptoError("rate_limited", `${label} is busy. Try again in a few minutes.`, "nimiq")
  if (!response.ok) throw new CryptoError("unavailable", `${label} returned HTTP ${response.status}. Try again later.`, "nimiq")
  return body as any
}

/** Every transaction of the address back to `from`, newest first. Fails rather than return part of the history. */
async function history(request: Request, rpcUrl: string, address: string, from: number) {
  const fail = (message: string) => new CryptoError("unavailable", message, "nimiq")
  const out: any[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const list = await nimiqRpc(request, rpcUrl, "getTransactionsByAddress", [address, PAGE, cursor])
    if (!Array.isArray(list)) throw fail("The Nimiq server sent a transaction page that isn't a list.")
    if (!list.length) return out
    const fresh = list.filter((tx) => !seen.has(tx.hash))
    if (!fresh.length) throw fail("The Nimiq server repeated a page of transactions, so the history is incomplete. Try again later.")
    for (const tx of fresh) {
      seen.add(tx.hash)
      out.push(tx)
    }
    if (list.length < PAGE || Math.min(...fresh.map(nimiqTime)) < from) return out
    cursor = list.at(-1).hash
  }
  throw fail(`This address has more than ${MAX_PAGES * PAGE} transactions, more than one read covers.`)
}

/**
 * The staking ledger of a Nimiq address from proof-of-stake genesis to now. Fails when any part of the history can't be
 * read, so a partial history never reads as smaller earnings.
 */
export async function nimiqStaking(address: string, options: NimiqStakingOptions): Promise<StakingLedger> {
  const { request } = options
  const rpcUrl = options.rpcUrl ?? NIMIQ_RPC
  const fail = (message: string) => new CryptoError("unavailable", message, "nimiq")
  const spaced = parseNimiqAddress(address)
  if (!spaced) throw new CryptoError("invalid_address", "That isn't a valid Nimiq address.", "nimiq")
  const self = compactNimiq(spaced)
  const now = options.now ?? new Date()
  const to = new Date(Math.floor(now.getTime()))
  const from = new Date(NIMIQ_POS_GENESIS)

  const account = await nimiqRpc(request, rpcUrl, "getAccountByAddress", [spaced])
  const staker = await nimiqRpc(request, rpcUrl, "getStakerByAddress", [spaced], "No staker with address")
  const observedAt = new Date().toISOString()
  const validator = staker?.delegation ? compactNimiq(String(staker.delegation)) : null

  const directory = await getJson(request, options.validatorsUrl ?? NIMIQ_VALIDATORS, "The Nimiq validators directory")
  if (!Array.isArray(directory)) throw fail("The Nimiq validators directory sent something that isn't a list.")
  const listed = new Set(directory.filter((entry) => typeof entry?.address === "string").map((entry) => compactNimiq(entry.address)))
  const senders = new Set(listed)
  const notes = [
    "Identified rewards are payments seen from known validators, not complete lifetime earnings.",
    "Rewards are recognized by today's validator directory and the current validator's reward address; older or custom payout addresses can be missing.",
    "Balances are read one after another and can differ by a block.",
  ]
  if (validator) {
    const info = await nimiqRpc(request, rpcUrl, "getValidatorByAddress", [validator])
    senders.add(validator)
    if (info?.rewardAddress) senders.add(compactNimiq(String(info.rewardAddress)))
    if (!listed.has(validator))
      notes.push("The current validator isn't in the public validator directory, so its unpaid rewards and payout schedule are unknown.")
  }

  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  const grouped = await getJson(request, `${options.watchUrl ?? NIMIQ_WATCH}/staker/${self}/events/restake-grouped?${query}`, "NimiqWatch's restake index")
  if (!grouped || !Array.isArray(grouped.groups)) throw fail("NimiqWatch's restake index sent an unexpected answer.")
  if (Date.parse(grouped.from) > from.getTime() || Date.parse(grouped.to) < to.getTime())
    throw fail("NimiqWatch's restake index covered only part of the history. Try again later.")

  const transactions = await history(request, rpcUrl, spaced, from.getTime())
  const events: StakingEvent[] = []
  const wrong = (message: string) => fail(message)
  for (const tx of transactions) {
    const at = nimiqTime(tx)
    if (!Number.isFinite(at) || at < from.getTime() || at >= to.getTime()) continue
    const sender = compactNimiq(String(tx.from ?? ""))
    const recipient = compactNimiq(String(tx.to ?? ""))
    const value = atoms(tx.value ?? 0, "a value", wrong)
    const fee = atoms(tx.fee ?? 0, "a fee", wrong)
    const iso = new Date(at).toISOString()
    const staking = recipient === NIMIQ_STAKING_CONTRACT || sender === NIMIQ_STAKING_CONTRACT
    // The address pays the fee of what it sends; a withdrawal's fee comes out of the stake it returns.
    if (staking && fee > 0n && (sender === self || (sender === NIMIQ_STAKING_CONTRACT && recipient === self)))
      events.push({ id: `${tx.hash}:fee`, at: iso, kind: "fee", atoms: fee, counterparty: NIMIQ_STAKING_CONTRACT, evidence: "Fee of a staking transaction on chain" })
    if (tx.executionResult !== true || value === 0n) continue
    const base = { at: iso, atoms: value, evidence: "Transaction on chain" }
    if (sender === self && recipient === NIMIQ_STAKING_CONTRACT)
      events.push({ ...base, id: `${tx.hash}:value`, kind: "deposit", counterparty: NIMIQ_STAKING_CONTRACT })
    else if (sender === NIMIQ_STAKING_CONTRACT && recipient === self)
      events.push({ ...base, id: `${tx.hash}:value`, kind: "withdrawal", counterparty: NIMIQ_STAKING_CONTRACT })
    else if (recipient === self && sender !== self)
      events.push({
        ...base,
        id: `${tx.hash}:value`,
        kind: senders.has(sender) ? "reward_paid" : "unclassified",
        counterparty: sender,
        evidence: senders.has(sender) ? "Payment on chain from a known validator address" : "Payment on chain from an address that isn't a known validator",
      })
  }
  for (const group of grouped.groups) {
    const sender = compactNimiq(String(group?.sender_address ?? ""))
    const at = Date.parse(group?.time_window)
    if (!sender || !Number.isFinite(at)) throw fail("NimiqWatch's restake index sent a group without a sender or a time.")
    const iso = new Date(at).toISOString()
    events.push({
      id: `restake:${await sha256(`${self}|${sender}|${iso}`)}`,
      at: iso,
      kind: senders.has(sender) ? "reward_restaked" : "unclassified",
      atoms: atoms(group.aggregated_value, "a restake amount", wrong),
      counterparty: sender,
      evidence: senders.has(sender) ? "NimiqWatch restake index, from a known validator address" : "NimiqWatch restake index, from an address that isn't a known validator",
    })
  }

  return {
    asset: { chain: "nimiq", symbol: "NIM", decimals: 5 },
    address: spaced,
    from: from.toISOString(),
    to: to.toISOString(),
    position: {
      liquid: account ? atoms(account.balance ?? 0, "a balance", wrong) : 0n,
      active: staker ? atoms(staker.balance ?? 0, "a stake", wrong) : 0n,
      inactive: staker ? atoms(staker.inactiveBalance ?? 0, "an inactive stake", wrong) : 0n,
      retired: staker ? atoms(staker.retiredBalance ?? 0, "a retired stake", wrong) : 0n,
      validator: validator ? (parseNimiqAddress(validator) ?? validator) : null,
      observedAt,
    },
    events: events.map((event) => ({ ...event, counterparty: event.counterparty ? (parseNimiqAddress(event.counterparty) ?? event.counterparty) : null })),
    validatorListed: validator ? listed.has(validator) : null,
    notes,
  }
}
