// Public wallet addresses: the native coin's balance, read from public endpoints. Read-only: no keys, no signing.
import { CryptoError, type CryptoErrorCode } from "../errors.ts"
import { fromBaseUnits } from "../holdings.ts"
import { describeBody, jsonRpc, readBody, requester, type ClientOptions, type Request } from "../http.ts"
import type { ChainId, CryptoProvider } from "../model.ts"
import { parseAddress } from "./address.ts"
import { CHAINS } from "./chains.ts"

export interface WalletOptions extends ClientOptions {
  /** Another endpoint for the chain's API: your own node, or a provider with a key in the URL. */
  rpcUrl?: string
}

interface Balance {
  /** Base units, staked included. */
  total: bigint
  staked: bigint
}

type Reader = (address: string, request: Request, fail: (code: CryptoErrorCode, message: string) => CryptoError, rpcUrl?: string) => Promise<Balance>

async function okJson(request: Request, url: string, fail: (code: CryptoErrorCode, message: string) => CryptoError, label: string, init?: RequestInit) {
  const response = await request(url, init)
  const body = await readBody(response)
  if (response.status === 429) throw fail("rate_limited", `${label} is rate limiting requests. Try again later.`)
  if (!response.ok) {
    if (response.status === 400) throw fail("invalid_address", `${label}: ${describeBody(body, "the address was rejected.")}`)
    throw fail("unavailable", `${label} answered ${response.status}.`)
  }
  return body as Record<string, any>
}

const liquid = (total: bigint): Balance => ({ total, staked: 0n })

const READERS: Record<ChainId, Reader> = {
  async bitcoin(address, request, fail, rpcUrl = "https://mempool.space/api") {
    const body = await okJson(request, `${rpcUrl}/address/${encodeURIComponent(address)}`, fail, "mempool.space")
    const sats = (stats: any) => BigInt(stats?.funded_txo_sum ?? 0) - BigInt(stats?.spent_txo_sum ?? 0)
    return liquid(sats(body.chain_stats) + sats(body.mempool_stats))
  },
  async ethereum(address, request, fail, rpcUrl = "https://ethereum-rpc.publicnode.com") {
    const { response, body } = await jsonRpc(request, rpcUrl, "eth_getBalance", [address, "latest"])
    if (!response.ok || body.error) throw fail("unavailable", `Ethereum RPC: ${describeBody(body.error, `answered ${response.status}`)}`)
    return liquid(BigInt(body.result ?? "0x0"))
  },
  async solana(address, request, fail, rpcUrl = "https://api.mainnet-beta.solana.com") {
    const { response, body } = await jsonRpc(request, rpcUrl, "getBalance", [address])
    if (response.status === 429) throw fail("rate_limited", "Solana RPC is rate limiting requests. Try again later.")
    if (!response.ok) throw fail("unavailable", `Solana RPC answered ${response.status}.`)
    if (body.error) throw fail("invalid_address", `Solana RPC: ${describeBody(body.error, "the address was rejected")}`)
    return liquid(BigInt(body.result?.value ?? 0))
  },
  async xrpl(address, request, fail, rpcUrl = "https://xrplcluster.com") {
    const body = await okJson(request, rpcUrl, fail, "XRP Ledger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "account_info", params: [{ account: address, ledger_index: "validated" }] }),
    })
    const result = body.result ?? {}
    // An address nobody has funded yet doesn't exist on the ledger: it holds nothing.
    if (result.error === "actNotFound") return liquid(0n)
    if (result.error) throw fail("unavailable", `XRP Ledger: ${result.error_message || result.error}`)
    return liquid(BigInt(result.account_data?.Balance ?? "0"))
  },
  /**
   * Nimiq (Albatross) through NimiqWatch's public JSON-RPC, the replacement the community named when nimiqscan's RPC
   * closed. The account's balance plus what it stakes: staked NIM sits in the staking contract, not in the account.
   */
  async nimiq(address, request, fail, rpcUrl = "https://rpc.nimiqwatch.com") {
    const call = async (method: string) => {
      const { response, body } = await jsonRpc(request, rpcUrl, method, [address])
      if (response.status === 429) throw fail("rate_limited", "Nimiq RPC is rate limiting requests. Try again later.")
      if (!response.ok) throw fail("unavailable", `Nimiq RPC answered ${response.status}.`)
      return body
    }
    const account = await call("getAccountByAddress")
    if (account.error) throw fail("unavailable", `Nimiq RPC: ${describeBody(account.error, "the request failed")}`)
    const staker = await call("getStakerByAddress")
    // An address that never staked answers "No staker with address…": it stakes nothing.
    const stake = staker.error
      ? 0n
      : ["balance", "inactiveBalance", "retiredBalance"].reduce((sum, key) => sum + BigInt(staker.result?.data?.[key] ?? 0), 0n)
    return { total: BigInt(account.result?.data?.balance ?? 0) + stake, staked: stake }
  },
}

/** A wallet that reads an address's balance. Throws `invalid_address` right away when the address isn't the chain's. */
export function wallet(chain: ChainId, address: string, options: WalletOptions = {}): CryptoProvider {
  const info = CHAINS[chain]
  const parsed = parseAddress(chain, address)
  if (!parsed) throw new CryptoError("invalid_address", `That isn't a valid ${info.name} address.`, chain)
  const request = requester(chain, info.name, options)
  const fail = (code: CryptoErrorCode, message: string) => new CryptoError(code, message, chain)
  return {
    id: chain,
    name: info.name,
    kind: "wallet",
    address: parsed,
    async balances() {
      const balance = await READERS[chain](parsed, request, fail, options.rpcUrl)
      // A wallet always lists its coin, even at zero, so an emptied wallet reads as empty rather than unknown.
      return [{ symbol: info.symbol, name: info.coin, quantity: fromBaseUnits(balance.total, info.decimals), staked: fromBaseUnits(balance.staked, info.decimals) }]
    },
  }
}

export const bitcoin = (address: string, options?: WalletOptions) => wallet("bitcoin", address, options)
export const ethereum = (address: string, options?: WalletOptions) => wallet("ethereum", address, options)
export const solana = (address: string, options?: WalletOptions) => wallet("solana", address, options)
export const xrpl = (address: string, options?: WalletOptions) => wallet("xrpl", address, options)
export const nimiq = (address: string, options?: WalletOptions) => wallet("nimiq", address, options)
