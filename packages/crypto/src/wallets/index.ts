// Public wallet addresses: the native coin's balance and history, read from public endpoints. Read-only: no keys, no
// signing.
import { CryptoError, type CryptoErrorCode } from "../errors.ts"
import { fromBaseUnits } from "../holdings.ts"
import { describeBody, jsonRpc, readBody, requester, type ClientOptions, type Request } from "../http.ts"
import type { ChainId, CryptoProvider, CryptoTransaction, CryptoTransactionKind, Holding } from "../model.ts"
import { parseAddress } from "./address.ts"
import { CHAINS, type ChainInfo } from "./chains.ts"
import { nimiqRpc, nimiqStaking, nimiqTime } from "./nimiq-staking.ts"

export interface WalletOptions extends ClientOptions {
  /** Another endpoint for the chain's API: your own node, or a provider with a key in the URL. */
  rpcUrl?: string
}

interface Balance {
  /** Base units, staked included. */
  total: bigint
  staked: bigint
}

type Fail = (code: CryptoErrorCode, message: string) => CryptoError

interface Context {
  address: string
  info: ChainInfo
  request: Request
  fail: Fail
  rpcUrl?: string
}

interface Reader {
  balance(context: Context): Promise<Balance>
  /** Tokens the address holds beside the native coin, zero balances left out. */
  tokens?(context: Context): Promise<Holding[]>
  /** Newest first, nothing before `since`. */
  transactions?(context: Context, since: string | null): Promise<CryptoTransaction[]>
}

/** Pages of history read per call at most, so an address with years of activity can't stall a sync. */
const MAX_PAGES = 10
const PAGE_SIZE = 200

const day = (milliseconds: number) => new Date(milliseconds).toISOString().slice(0, 10)

async function okJson(context: Context, url: string, label: string, init?: RequestInit) {
  const response = await context.request(url, init)
  const body = await readBody(response)
  if (response.status === 429) throw context.fail("rate_limited", `${label} is busy. Try again in a few minutes.`)
  if (!response.ok) {
    if (response.status === 400) throw context.fail("invalid_address", `${label} rejected the address. Check it and connect again. Details: ${describeBody(body, "HTTP 400")}`)
    throw context.fail("unavailable", `${label} returned HTTP ${response.status}. Try again later.`)
  }
  return body as any
}

const liquid = (total: bigint): Balance => ({ total, staked: 0n })

/** One movement in base units, before it becomes coins: `moved` is signed and leaves the fee out. */
function movement(context: Context, input: { id: string; time: number; moved: bigint; fee: bigint; counterparty: string | null; kind: CryptoTransactionKind }): CryptoTransaction {
  const { decimals, symbol } = context.info
  return {
    id: input.id,
    date: day(input.time),
    symbol,
    quantity: fromBaseUnits(input.moved, decimals),
    fee: fromBaseUnits(input.fee, decimals),
    counterparty: input.counterparty,
    kind: input.kind,
  }
}

/**
 * Public XRP Ledger JSON-RPC servers, tried in order. Ripple's go first: xrplcluster.com counts its quota per IP, and
 * Workers share their outgoing IPs, so it runs out for reasons that have nothing to do with us. xrpl.ws and xrpl.link
 * are xrplcluster.com under other names and share its quota, so they would add nothing.
 */
export const XRPL_SERVERS = ["https://s1.ripple.com", "https://s2.ripple.com", "https://xrplcluster.com"]

// xrplcluster.com answers "rate limit: units quota (…) exhausted"; rippled itself says slowDown or tooBusy.
const XRPL_RATE_LIMITED = /rate.?limit|quota|slowDown|tooBusy|too much load/i
// A server that isn't in sync with the network can't answer for the validated ledger; another one can.
const XRPL_OUT_OF_SYNC = new Set(["noNetwork", "noCurrent", "noClosed", "amendmentBlocked", "failedToForward", "internal"])

/** One XRP Ledger call, on the first server that answers it. Errors about the request itself (`actNotFound`) come back in the result. */
async function xrplCall(context: Context, method: string, params: Record<string, unknown>): Promise<Record<string, any>> {
  const failures: Array<{ code: CryptoErrorCode; reason: string }> = []
  for (const url of context.rpcUrl ? [context.rpcUrl] : XRPL_SERVERS) {
    const host = new URL(url).host
    let response: Response
    try {
      response = await context.request(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ method, params: [params] }),
      })
    } catch {
      failures.push({ code: "unavailable", reason: `${host} didn't answer` })
      continue
    }
    const body = await readBody(response)
    const result = body && typeof body === "object" ? ((body as { result?: Record<string, any> }).result ?? null) : null
    const reason = String(result?.error_message || result?.error || describeBody(body, `answered ${response.status}`))
    const failed = !response.ok || !result || result.error
    if (response.status === 429 || (failed && XRPL_RATE_LIMITED.test(`${result?.error ?? ""} ${reason}`))) {
      failures.push({ code: "rate_limited", reason: `${host}: ${reason}` })
      continue
    }
    if (!response.ok || !result || XRPL_OUT_OF_SYNC.has(result.error)) {
      failures.push({ code: "unavailable", reason: `${host}: ${reason}` })
      continue
    }
    return result
  }
  const reasons = failures.map((failure) => failure.reason).join("; ")
  if (failures.every((failure) => failure.code === "rate_limited"))
    throw context.fail("rate_limited", "XRP Ledger servers are busy. Try again in a few minutes.")
  throw context.fail("unavailable", `Couldn't reach the XRP Ledger servers. Try again later. Details: ${reasons}`)
}

// The XRP Ledger counts time from 2000-01-01 UTC.
const RIPPLE_EPOCH = 946_684_800
const XRPL_TRADES = new Set(["OfferCreate", "AMMCreate", "AMMDeposit", "AMMWithdraw", "AMMBid", "AMMDelete", "AMMClawback"])

/** How much XRP (drops) this transaction added to or took from the address, fee included, from the ledger's own record. */
function xrpDelta(address: string, meta: any) {
  let delta = 0n
  for (const node of meta?.AffectedNodes ?? []) {
    const entry = node.ModifiedNode ?? node.DeletedNode ?? node.CreatedNode
    if (entry?.LedgerEntryType !== "AccountRoot") continue
    const fields = entry.FinalFields ?? entry.NewFields
    if (fields?.Account !== address) continue
    const after = BigInt(fields.Balance ?? 0)
    const before = node.CreatedNode ? 0n : BigInt(entry.PreviousFields?.Balance ?? fields.Balance ?? 0)
    delta += after - before
  }
  return delta
}

/** When the transaction's ledger closed, in Unix seconds. */
const xrplSeconds = (entry: any) => {
  const tx = entry.tx ?? entry.tx_json
  return typeof tx?.date === "number" ? tx.date + RIPPLE_EPOCH : Date.parse(entry.close_time_iso) / 1000
}

/** Whoever wrote the Check this transaction cashed: the XRP came from them. */
function checkOwner(meta: any): string | undefined {
  for (const node of meta?.AffectedNodes ?? []) if (node.DeletedNode?.LedgerEntryType === "Check") return node.DeletedNode.FinalFields?.Account
  return undefined
}

/**
 * One `account_tx` entry as an XRP movement, or null when it didn't change this address's XRP balance (someone else's
 * check, escrow, or payment in an issued currency that only names it). The amount comes from the address's balance
 * change in the metadata, so partial payments (what `delivered_amount` says arrived), account deletions, escrows, checks,
 * and filled DEX offers all count what really moved. The fee is apart: this address pays it on everything it signs,
 * failed (`tec*`) transactions included, and a transaction that cost only the fee comes back as kind `fee`.
 */
function xrplTransaction(context: Context, entry: any): CryptoTransaction | null {
  const tx = entry.tx ?? entry.tx_json
  if (!tx || entry.validated === false) return null
  const { address } = context
  const fee = tx.Account === address ? BigInt(tx.Fee ?? 0) : 0n
  const moved = xrpDelta(address, entry.meta) + fee
  if (moved === 0n && fee === 0n) return null
  const type: string = tx.TransactionType
  // A swap: an offer, an AMM, a payment to yourself through the DEX, or someone's payment that took your offer.
  const trade = XRPL_TRADES.has(type) || (type === "Payment" && (tx.Destination === tx.Account || (tx.Account !== address && tx.Destination !== address)))
  // XRP this address locked in an escrow, or got back from one of its own (finished to itself, or cancelled).
  const escrow = type === "EscrowCreate" ? tx.Account === address : type.startsWith("Escrow") && tx.Owner === address
  const other = (candidate: unknown) => (typeof candidate === "string" && candidate !== address ? candidate : null)
  // Who the XRP went to or came from: a payment's destination or sender, a cashed check's writer, an escrow's owner.
  let counterparty: string | null = null
  if (escrow) counterparty = moved < 0n ? other(tx.Destination) : null
  else if (!trade && moved < 0n) counterparty = other(tx.Destination) ?? other(tx.Account)
  else if (!trade && moved > 0n) counterparty = other(tx.Owner) ?? (type === "CheckCash" ? other(checkOwner(entry.meta)) : null) ?? other(tx.Account)
  return movement(context, {
    id: tx.hash ?? entry.hash,
    time: xrplSeconds(entry) * 1000,
    moved,
    fee,
    counterparty,
    kind: moved === 0n ? "fee" : trade ? "trade" : escrow ? "escrow" : moved < 0n ? "send" : "receive",
  })
}

// Nimiq's staking contract and the coinbase that pays block rewards.
const NIMIQ_STAKING = "NQ77 0000 0000 0000 0000 0000 0000 0000 0001"
const NIMIQ_COINBASE = "NQ81 C01N BASE 0000 0000 0000 0000 0000 0000"

/**
 * One Nimiq transaction from this address's point of view, or null when it moved nothing. A transaction from another
 * address into the staking contract that names this one adds to its stake: that is how validators pay staking rewards.
 */
function nimiqTransaction(context: Context, tx: any): CryptoTransaction | null {
  const { address } = context
  if (tx.executionResult === false) return null
  const value = BigInt(tx.value ?? 0)
  const fee = tx.from === address ? BigInt(tx.fee ?? 0) : 0n
  const base = { id: tx.hash, time: nimiqTime(tx), fee }
  if (value === 0n || (tx.from === address && tx.to === address)) return null
  if (tx.from === address)
    return tx.to === NIMIQ_STAKING
      ? movement(context, { ...base, moved: -value, counterparty: null, kind: "stake" })
      : movement(context, { ...base, moved: -value, counterparty: tx.to, kind: "send" })
  if (tx.to === address) {
    if (tx.from === NIMIQ_STAKING) return movement(context, { ...base, moved: value, counterparty: null, kind: "stake" })
    if (tx.from === NIMIQ_COINBASE) return movement(context, { ...base, moved: value, counterparty: null, kind: "reward" })
    return movement(context, { ...base, moved: value, counterparty: tx.from, kind: "receive" })
  }
  if (tx.to === NIMIQ_STAKING) return movement(context, { ...base, moved: value, counterparty: tx.from, kind: "reward" })
  return null
}

/** One mempool.space transaction: what the address's outputs gained minus what its inputs spent. */
function bitcoinTransaction(context: Context, tx: any): CryptoTransaction | null {
  if (!tx.status?.confirmed) return null
  const mine = (output: any) => output?.scriptpubkey_address === context.address
  const inputs: any[] = tx.vin ?? []
  const outputs: any[] = tx.vout ?? []
  const spent = inputs.filter((input) => mine(input.prevout)).reduce((sum: bigint, input) => sum + BigInt(input.prevout.value ?? 0), 0n)
  const received = outputs.filter(mine).reduce((sum: bigint, output) => sum + BigInt(output.value ?? 0), 0n)
  const fee = spent > 0n ? BigInt(tx.fee ?? 0) : 0n
  const moved = received - spent + fee
  if (moved === 0n) return null
  const other =
    moved < 0n
      ? outputs.find((output) => output.scriptpubkey_address && !mine(output))?.scriptpubkey_address
      : inputs.find((input) => input.prevout?.scriptpubkey_address && !mine(input.prevout))?.prevout.scriptpubkey_address
  const coinbase = inputs.some((input) => input.is_coinbase)
  return movement(context, {
    id: tx.txid,
    time: tx.status.block_time * 1000,
    moved,
    fee,
    counterparty: other ?? null,
    kind: coinbase ? "reward" : moved < 0n ? "send" : "receive",
  })
}

/** An ERC-20 token worth checking: most addresses hold one of a few. Symbols are ours where the contract's mislead. */
interface Token {
  contract: string
  symbol: string
  name: string
  decimals: number
}

/**
 * EVM chains: the native coin, and the common tokens below through `balanceOf`. Public JSON-RPC servers, tried in order;
 * a token nobody lists here isn't read (there's no keyless index of every token an address holds). Each contract's
 * symbol and decimals were checked on chain.
 */
const EVM: Record<"ethereum" | "polygon", { rpcs: string[]; tokens: Token[] }> = {
  ethereum: {
    rpcs: ["https://ethereum-rpc.publicnode.com", "https://rpc.flashbots.net"],
    tokens: [
      { contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6 },
      { contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether", decimals: 6 },
      { contract: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai", decimals: 18 },
      { contract: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    ],
  },
  polygon: {
    rpcs: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
    tokens: [
      { contract: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", name: "USD Coin", decimals: 6 },
      // Bridged from Ethereum before Circle issued USDC on Polygon; its contract calls itself USDC too.
      { contract: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", symbol: "USDC.e", name: "USD Coin (bridged)", decimals: 6 },
      // Its contract calls itself USDT0 since Tether's upgrade.
      { contract: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT", name: "Tether", decimals: 6 },
      { contract: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", symbol: "DAI", name: "Dai", decimals: 18 },
      { contract: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    ],
  },
}

/** One EVM JSON-RPC call's result, from the first server that answers it without an error. */
async function evmCall(context: Context, chain: "ethereum" | "polygon", method: string, params: unknown[]): Promise<string> {
  const reasons: string[] = []
  for (const url of context.rpcUrl ? [context.rpcUrl] : EVM[chain].rpcs) {
    try {
      const { response, body } = await jsonRpc(context.request, url, method, params)
      if (response.ok && !body.error && typeof body.result === "string") return body.result
      reasons.push(`${new URL(url).host}: ${describeBody(body.error, `HTTP ${response.status}`)}`)
    } catch {
      reasons.push(`${new URL(url).host} didn't answer`)
    }
  }
  throw context.fail("unavailable", `The ${context.info.name} servers returned errors. Try again later. Details: ${reasons.join("; ")}`)
}

function evmReader(chain: "ethereum" | "polygon"): Reader {
  return {
    async balance(context) {
      return liquid(BigInt(await evmCall(context, chain, "eth_getBalance", [context.address, "latest"])))
    },
    async tokens(context) {
      // balanceOf(address): its selector, then the address left-padded to 32 bytes.
      const data = `0x70a08231${context.address.slice(2).toLowerCase().padStart(64, "0")}`
      const out: Holding[] = []
      for (const token of EVM[chain].tokens) {
        const result = await evmCall(context, chain, "eth_call", [{ to: token.contract, data }, "latest"])
        const units = result === "0x" ? 0n : BigInt(result)
        if (units > 0n) out.push({ symbol: token.symbol, name: token.name, quantity: fromBaseUnits(units, token.decimals), staked: 0 })
      }
      return out
    },
  }
}

const READERS: Record<ChainId, Reader> = {
  bitcoin: {
    async balance(context) {
      const body = await okJson(context, `${context.rpcUrl ?? "https://mempool.space/api"}/address/${encodeURIComponent(context.address)}`, "mempool.space")
      const sats = (stats: any) => BigInt(stats?.funded_txo_sum ?? 0) - BigInt(stats?.spent_txo_sum ?? 0)
      return liquid(sats(body.chain_stats) + sats(body.mempool_stats))
    },
    // Confirmed transactions, 25 a page; the next page starts after the last one seen.
    async transactions(context, since) {
      const base = `${context.rpcUrl ?? "https://mempool.space/api"}/address/${encodeURIComponent(context.address)}/txs/chain`
      const out: CryptoTransaction[] = []
      let last: string | null = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const list: any[] = await okJson(context, last ? `${base}/${last}` : base, "mempool.space")
        for (const tx of list) {
          if (since && tx.status?.block_time && day(tx.status.block_time * 1000) < since) return out
          const parsed = bitcoinTransaction(context, tx)
          if (parsed) out.push(parsed)
        }
        if (list.length < 25) break
        last = list.at(-1).txid
      }
      return out
    },
  },
  ethereum: evmReader("ethereum"),
  polygon: evmReader("polygon"),
  solana: {
    async balance({ request, fail, address, rpcUrl = "https://api.mainnet-beta.solana.com" }) {
      const { response, body } = await jsonRpc(request, rpcUrl, "getBalance", [address])
      if (response.status === 429) throw fail("rate_limited", "The Solana server is busy. Try again in a few minutes.")
      if (!response.ok) throw fail("unavailable", `The Solana server returned HTTP ${response.status}. Try again later.`)
      if (body.error) throw fail("invalid_address", `The Solana server rejected the address. Check it and connect again. Details: ${describeBody(body.error, "invalid address")}`)
      return liquid(BigInt(body.result?.value ?? 0))
    },
  },
  xrpl: {
    async balance(context) {
      const result = await xrplCall(context, "account_info", { account: context.address, ledger_index: "validated" })
      // An address nobody has funded yet doesn't exist on the ledger: it holds nothing.
      if (result.error === "actNotFound") return liquid(0n)
      if (result.error) throw context.fail("unavailable", `The XRP Ledger server returned an error. Try again later. Details: ${result.error_message || result.error}`)
      return liquid(BigInt(result.account_data?.Balance ?? "0"))
    },
    async transactions(context, since) {
      const out: CryptoTransaction[] = []
      let marker: unknown
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await xrplCall(context, "account_tx", {
          account: context.address,
          ledger_index_min: -1,
          ledger_index_max: -1,
          limit: PAGE_SIZE,
          forward: false,
          ...(marker ? { marker } : {}),
        })
        if (result.error === "actNotFound") return []
        if (result.error) throw context.fail("unavailable", `The XRP Ledger server returned an error. Try again later. Details: ${result.error_message || result.error}`)
        for (const entry of result.transactions ?? []) {
          const seconds = xrplSeconds(entry)
          if (since && Number.isFinite(seconds) && day(seconds * 1000) < since) return out
          const parsed = xrplTransaction(context, entry)
          if (parsed) out.push(parsed)
        }
        marker = result.marker
        if (!marker) break
      }
      return out
    },
  },
  /**
   * Nimiq (Albatross) through NimiqWatch's public JSON-RPC, the replacement the community named when nimiqscan's RPC
   * closed. The account's balance plus what it stakes: staked NIM sits in the staking contract, not in the account.
   */
  nimiq: {
    async balance(context) {
      const url = context.rpcUrl ?? "https://rpc.nimiqwatch.com"
      const account = await nimiqRpc(context.request, url, "getAccountByAddress", [context.address])
      // An address that never staked answers "No staker with address…": it stakes nothing. Any other error is an error,
      // not a stake of zero.
      const staker = await nimiqRpc(context.request, url, "getStakerByAddress", [context.address], "No staker with address")
      const stake = staker ? ["balance", "inactiveBalance", "retiredBalance"].reduce((sum, key) => sum + BigInt(staker[key] ?? 0), 0n) : 0n
      return { total: BigInt(account?.balance ?? 0) + stake, staked: stake }
    },
    // Newest first; the next page starts after the hash it names.
    async transactions(context, since) {
      const out: CryptoTransaction[] = []
      let startAt: string | null = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const body = await nimiqCall(context, "getTransactionsByAddress", [context.address, PAGE_SIZE, startAt])
        if (body.error) throw context.fail("unavailable", `The Nimiq server returned an error. Try again later. Details: ${describeBody(body.error, "unknown error")}`)
        const list: any[] = body.result?.data ?? []
        for (const tx of list) {
          if (since && day(nimiqTime(tx)) < since) return out
          const parsed = nimiqTransaction(context, tx)
          if (parsed) out.push(parsed)
        }
        if (list.length < PAGE_SIZE) break
        startAt = list.at(-1).hash
      }
      return out
    },
  },
}

async function nimiqCall(context: Context, method: string, params: unknown[]) {
  const { response, body } = await jsonRpc(context.request, context.rpcUrl ?? "https://rpc.nimiqwatch.com", method, params)
  if (response.status === 429) throw context.fail("rate_limited", "The Nimiq server is busy. Try again in a few minutes.")
  if (!response.ok) throw context.fail("unavailable", `The Nimiq server returned HTTP ${response.status}. Try again later.`)
  return body
}

/** A wallet that reads an address's balance. Throws `invalid_address` right away when the address isn't the chain's. */
export function wallet(chain: ChainId, address: string, options: WalletOptions = {}): CryptoProvider {
  const info = CHAINS[chain]
  const parsed = parseAddress(chain, address)
  if (!parsed) throw new CryptoError("invalid_address", `That isn't a valid ${info.name} address.`, chain)
  const context: Context = {
    address: parsed,
    info,
    request: requester(chain, `the ${info.name} servers`, options),
    fail: (code, message) => new CryptoError(code, message, chain),
    rpcUrl: options.rpcUrl,
  }
  const reader = READERS[chain]
  return {
    id: chain,
    name: info.name,
    kind: "wallet",
    address: parsed,
    async balances() {
      const balance = await reader.balance(context)
      const tokens = reader.tokens ? await reader.tokens(context) : []
      // A wallet always lists its coin, even at zero, so an emptied wallet reads as empty rather than unknown.
      return [{ symbol: info.symbol, name: info.coin, quantity: fromBaseUnits(balance.total, info.decimals), staked: fromBaseUnits(balance.staked, info.decimals) }, ...tokens]
    },
    ...(reader.transactions && { transactions: (options) => reader.transactions!(context, options?.since ?? null) }),
    ...(chain === "nimiq" && { staking: () => nimiqStaking(parsed, { request: context.request, rpcUrl: options.rpcUrl }) }),
  }
}

export const bitcoin = (address: string, options?: WalletOptions) => wallet("bitcoin", address, options)
export const ethereum = (address: string, options?: WalletOptions) => wallet("ethereum", address, options)
export const polygon = (address: string, options?: WalletOptions) => wallet("polygon", address, options)
export const solana = (address: string, options?: WalletOptions) => wallet("solana", address, options)
export const xrpl = (address: string, options?: WalletOptions) => wallet("xrpl", address, options)
export const nimiq = (address: string, options?: WalletOptions) => wallet("nimiq", address, options)
