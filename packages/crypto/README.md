# @vitehub-finance/crypto

One client for crypto balances. Exchanges are read with read-only API keys, wallets from public endpoints by address,
and every provider answers in one model: what it holds, coin by coin, and for wallets with a public history, what moved. It uses only `fetch` and WebCrypto, so it runs on
Cloudflare Workers, Node, Deno, and Bun.

| Provider | Needs | Reads |
| --- | --- | --- |
| `kraken` | API key with only “Query Funds” | spot, staked, and earn balances |
| `binance` | API key with only “Enable Reading” | spot and Simple Earn |
| `coinbase` | CDP key name and private key, “View” only | every account |
| `bitcoin` | address | mempool.space: balance and transactions |
| `ethereum` | address | ethereum-rpc.publicnode.com (ETH only) |
| `solana` | address | api.mainnet-beta.solana.com (SOL only) |
| `xrpl` | address | s1.ripple.com, s2.ripple.com, then xrplcluster.com: balance and transactions |
| `nimiq` | address (`NQ…`) | rpc.nimiqwatch.com: the balance plus staked NIM, and transactions |

## Usage

```ts
import { createCrypto, kraken, nimiq } from "@vitehub-finance/crypto"

const crypto = createCrypto([
  kraken({ key: process.env.KRAKEN_KEY!, secret: process.env.KRAKEN_SECRET! }),
  nimiq("NQ07 0000 0000 0000 0000 0000 0000 0000 0000"),
])

const { holdings, failed } = await crypto.totals()
// [{ symbol: "NIM", name: "Nimiq", quantity: 1250, staked: 1000 }, …]
```

`balances()` on a single provider returns its `Holding[]`. Wallets on Bitcoin, the XRP Ledger, and Nimiq also have
`transactions({ since })`, newest first, at most 10 pages (2,000 transactions on the XRP Ledger and Nimiq, 250 on
Bitcoin). `createCrypto(...).balances()` returns each provider's
result, and one provider failing never hides the others. `connect(id, credentials)` builds a provider from its id, for
code that stores the id.

## Model

- `Holding`: `symbol` (uppercase ticker, with exchange codes like `XXBT` or `LDUSDT` normalized), `name`, `quantity` in
  whole coins with staked coins included, and `staked`, the part of `quantity` that earns rewards.
- `CryptoTransaction`: `id` (the hash), `date` (`YYYY-MM-DD`, UTC), `symbol`, `quantity` in whole coins and signed
  (negative left the address, fee apart), `fee` (what this address paid), `counterparty` (the other address, or null),
  and `kind`: `send`, `receive`, `reward` (block or staking rewards), `stake` (own coins into staking or back),
  `trade` (the XRP Ledger's DEX and AMMs), `escrow` (own XRP locked in an escrow or back; the balance leaves locked XRP
  out), or `fee` (only the fee moved: a setting, a trust line, a failed `tec*` transaction). Only the native coin
  counts: XRP Ledger amounts come from the address's balance change in the transaction's metadata, so other people's
  checks and escrows and issued currencies are left out, and partial payments count what arrived. Each transaction's
  `quantity - fee` (`-fee` for `stake`) is what the holding changed by, so a whole history adds up to the balance. On
  Nimiq, a payment into the staking contract that names the address is a staking reward.
- `CryptoError`: `code` is `invalid_credentials`, `invalid_address`, `rate_limited`, or `unavailable`, and `message` is
  written for people.

## Options

Every factory takes `{ fetch, userAgent, timeoutMs }`. Wallets also take `rpcUrl` for your own node or a keyed provider:
`nimiq(address, { rpcUrl: "http://127.0.0.1:8648" })`.

Without `rpcUrl`, the XRP Ledger reader tries `XRPL_SERVERS` in order. A server that answers 429, says it is rate
limited (xrplcluster.com's "units quota … exhausted", rippled's `slowDown` or `tooBusy`), is out of sync, or doesn't
answer, passes the call to the next one. When all of them fail, the error is `rate_limited` if every one was rate
limiting, `unavailable` otherwise. xrpl.ws and xrpl.link aren't in the list: they are xrplcluster.com under other names
and share its per-IP quota.

`parseAddress(chain, input)` normalizes an address, or returns null when it isn't the chain's. Nimiq addresses are
checked against their IBAN check digits. `fake({ holdings, transactions })` (from `@vitehub-finance/crypto/fake`) answers
what you give it, for tests.
