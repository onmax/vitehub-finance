# @vitehub-finance/banking

One client for bank accounts through open banking (PSD2). A provider lists banks, sends people to their bank for
consent, and reads the consented accounts' balances and booked transactions, all in one model. It uses only `fetch` and
WebCrypto, so it runs on Cloudflare Workers, Node, Deno, and Bun.

Providers:

- `@vitehub-finance/banking/enable-banking`: [Enable Banking](https://enablebanking.com), 2,500+ European banks. A
  free restricted production app reads the accounts you link in its control panel.
- `@vitehub-finance/banking/fake`: a bank that answers what you give it, for tests and demos.

## Usage

```ts
import { readAccounts } from "@vitehub-finance/banking"
import { enableBanking } from "@vitehub-finance/banking/enable-banking"

const bank = enableBanking({ appId: process.env.EB_APP_ID!, privateKey: process.env.EB_PRIVATE_KEY! })

const [revolut] = await bank.institutions("LT")
const url = await bank.authorize({ institution: revolut, state: "random", redirectUrl: "https://example.com/callback" })
// …the person approves at their bank and comes back with ?code=…&state=…
const consent = await bank.completeAuthorization(code)
const reads = await readAccounts(bank, consent.id, consent.accounts, { since: "2026-10-01" })
```

`readAccounts` reads every account under a consent. If one account fails, the others are still read. An expired consent
or rejected app credentials throw. A rate limit stops the remaining calls, and the accounts it skipped are marked.

## Model

- Money is integer minor units (`amountMinor`) and an ISO 4217 `currency`. Payments out are negative.
- `BankAccount.name` is the bank and currency ("Revolut SEK"), never the holder's name, which is what Enable Banking puts
  in `name`.
- `BankingError`: `code` is `expired` (reconnect), `invalid_credentials` (the app's own credentials), `rate_limited`
  (PSD2 allows about four background fetches a day), or `unavailable`.

Every provider takes `{ fetch, userAgent, timeoutMs }`.
