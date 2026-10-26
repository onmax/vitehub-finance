// Public wallet addresses: the native coin's balance as one holding, read from public endpoints. No keys, no history.
import { describeBody, ProviderError, readBody, request, type ProviderResult } from "./types"

export type Chain = "bitcoin" | "ethereum" | "solana" | "xrpl"

export interface WalletCredentials {
  address: string
}

export const CHAINS: Record<Chain, { name: string; symbol: string; coin: string }> = {
  bitcoin: { name: "Bitcoin", symbol: "BTC", coin: "Bitcoin" },
  ethereum: { name: "Ethereum", symbol: "ETH", coin: "Ether" },
  solana: { name: "Solana", symbol: "SOL", coin: "Solana" },
  xrpl: { name: "XRP Ledger", symbol: "XRP", coin: "XRP" },
}

const BASE58 = "[1-9A-HJ-NP-Za-km-z]"
const PATTERNS: Record<Chain, RegExp> = {
  // Legacy (1…), P2SH (3…), and bech32/bech32m (bc1…, lowercase or uppercase, not mixed).
  bitcoin: new RegExp(`^(?:[13]${BASE58}{25,34}|bc1[02-9ac-hj-np-z]{11,71}|BC1[02-9AC-HJ-NP-Z]{11,71})$`),
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  solana: new RegExp(`^${BASE58}{32,44}$`),
  xrpl: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/,
}

/** The address, trimmed, when it looks like one of this chain's; null otherwise. */
export function validAddress(chain: Chain, address: string) {
  const trimmed = address.trim()
  return PATTERNS[chain].test(trimmed) ? trimmed : null
}

/** Base units (sats, wei, lamports, drops) to coins, through BigInt so 18-decimal wei keeps its precision. */
export function fromBaseUnits(units: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals)
  const whole = units / scale
  const fraction = units % scale
  return Number(whole) + Number(fraction) / Number(scale)
}

async function json(name: string, url: string, init?: RequestInit) {
  const response = await request(name, url, init)
  const body = await readBody(response)
  if (response.status === 429) throw new ProviderError("rate_limited", `${name} is rate limiting requests. Try again later.`)
  if (!response.ok) {
    if (response.status === 400) throw new ProviderError("auth", `${name}: ${describeBody(body, "the address was rejected.")}`)
    throw new ProviderError("unavailable", `${name} answered ${response.status}.`)
  }
  return body as Record<string, any>
}

const rpc = (method: string, params: unknown[]) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
})

async function balance(chain: Chain, address: string): Promise<number> {
  switch (chain) {
    case "bitcoin": {
      const body = await json("mempool.space", `https://mempool.space/api/address/${encodeURIComponent(address)}`)
      const sats = (stats: any) => BigInt(stats?.funded_txo_sum ?? 0) - BigInt(stats?.spent_txo_sum ?? 0)
      return fromBaseUnits(sats(body.chain_stats) + sats(body.mempool_stats), 8)
    }
    case "ethereum": {
      const url = "https://ethereum-rpc.publicnode.com"
      const body = await json("Ethereum RPC", url, rpc("eth_getBalance", [address, "latest"]))
      if (body.error) throw new ProviderError("unavailable", `Ethereum RPC: ${describeBody(body.error, "request failed")}`)
      return fromBaseUnits(BigInt(body.result ?? "0x0"), 18)
    }
    case "solana": {
      const url = "https://api.mainnet-beta.solana.com"
      const body = await json("Solana RPC", url, rpc("getBalance", [address]))
      if (body.error) throw new ProviderError("auth", `Solana RPC: ${describeBody(body.error, "the address was rejected")}`)
      return fromBaseUnits(BigInt(body.result?.value ?? 0), 9)
    }
    case "xrpl": {
      const body = await json("XRP Ledger", "https://xrplcluster.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "account_info", params: [{ account: address, ledger_index: "validated" }] }),
      })
      const result = body.result ?? {}
      // An address nobody has funded yet doesn't exist on the ledger: it holds nothing.
      if (result.error === "actNotFound") return 0
      if (result.error) throw new ProviderError("unavailable", `XRP Ledger: ${result.error_message || result.error}`)
      return fromBaseUnits(BigInt(result.account_data?.Balance ?? "0"), 6)
    }
  }
}

export function wallet(chain: Chain) {
  return async (credentials: WalletCredentials): Promise<ProviderResult<WalletCredentials>> => {
    const address = validAddress(chain, credentials.address)
    if (!address) throw new ProviderError("auth", `That isn't a valid ${CHAINS[chain].name} address.`)
    const quantity = await balance(chain, address)
    const meta = CHAINS[chain]
    return {
      accounts: [
        {
          externalId: address,
          name: `${meta.name} wallet`,
          kind: "crypto",
          currency: "EUR",
          institution: meta.name,
          holdings: [{ symbol: meta.symbol, name: meta.coin, quantity }],
        },
      ],
    }
  }
}
