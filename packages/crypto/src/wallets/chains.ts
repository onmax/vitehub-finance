import type { ChainId } from "../model.ts"

export interface ChainInfo {
  /** For people: "XRP Ledger". */
  name: string
  /** The native coin's ticker. */
  symbol: string
  /** The native coin's name. */
  coin: string
  /** Base units per coin, as a power of ten. */
  decimals: number
  /** What an address starts with, for form placeholders. */
  placeholder: string
  /** Where balances come from: public endpoints, no keys. */
  source: string
}

export const CHAINS: Record<ChainId, ChainInfo> = {
  bitcoin: { name: "Bitcoin", symbol: "BTC", coin: "Bitcoin", decimals: 8, placeholder: "bc1…, 1…, or 3…", source: "mempool.space" },
  ethereum: { name: "Ethereum", symbol: "ETH", coin: "Ether", decimals: 18, placeholder: "0x…", source: "ethereum-rpc.publicnode.com or rpc.flashbots.net" },
  polygon: { name: "Polygon", symbol: "POL", coin: "Polygon", decimals: 18, placeholder: "0x…", source: "polygon-bor-rpc.publicnode.com or polygon.drpc.org" },
  solana: { name: "Solana", symbol: "SOL", coin: "Solana", decimals: 9, placeholder: "Base58 address", source: "api.mainnet-beta.solana.com" },
  xrpl: { name: "XRP Ledger", symbol: "XRP", coin: "XRP", decimals: 6, placeholder: "r…", source: "s1.ripple.com, s2.ripple.com, or xrplcluster.com" },
  nimiq: { name: "Nimiq", symbol: "NIM", coin: "Nimiq", decimals: 5, placeholder: "NQ…", source: "rpc.nimiqwatch.com" },
}
