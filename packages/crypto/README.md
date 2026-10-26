# @vitehub-finance/crypto

One client for crypto balances. Exchanges are read with read-only API keys, wallets from public endpoints by address,
and every provider answers in one model: what it holds, coin by coin. It uses only `fetch` and WebCrypto, so it runs on
Cloudflare Workers, Node, Deno, and Bun.

| Provider | Needs | Reads |
| --- | --- | --- |
| `kraken` | API key with only “Query Funds” | spot, staked, and earn balances |
| `binance` | API key with only “Enable Reading” | spot and Simple Earn |
| `coinbase` | CDP key name and private key, “View” only | every account |
| `bitcoin` | address | mempool.space |
| `ethereum` | address | ethereum-rpc.publicnode.com (ETH only) |
| `solana` | address | api.mainnet-beta.solana.com (SOL only) |
| `xrpl` | address | xrplcluster.com |
| `nimiq` | address (`NQ…`) | rpc.nimiqwatch.com: the balance plus staked NIM |

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

`balances()` on a single provider returns its `Holding[]`. `createCrypto(...).balances()` returns each provider's
result, and one provider failing never hides the others. `connect(id, credentials)` builds a provider from its id, for
code that stores the id.

## Model

- `Holding`: `symbol` (uppercase ticker, with exchange codes like `XXBT` or `LDUSDT` normalized), `name`, `quantity` in
  whole coins with staked coins included, and `staked`, the part of `quantity` that earns rewards.
- `CryptoError`: `code` is `invalid_credentials`, `invalid_address`, `rate_limited`, or `unavailable`, and `message` is
  written for people.

## Options

Every factory takes `{ fetch, userAgent, timeoutMs }`. Wallets also take `rpcUrl` for your own node or a keyed provider:
`nimiq(address, { rpcUrl: "http://127.0.0.1:8648" })`.

`parseAddress(chain, input)` normalizes an address, or returns null when it isn't the chain's. Nimiq addresses are
checked against their IBAN check digits. `fake({ holdings })` (from `@vitehub-finance/crypto/fake`) answers what you give
it, for tests.
