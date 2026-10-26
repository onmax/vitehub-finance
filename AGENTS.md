# ViteHub Finance

Household finance on ViteHub. People sign up, get a household (a Better Auth organization), invite a partner, connect
banks (Enable Banking, PSD2), crypto exchanges, wallets, and Interactive Brokers, and see their money together: accounts, transactions,
recurring payments, budgets, goals, and a cash-flow forecast. An MCP server lets their agents read it.

Private by default (`FINANCE_ALLOWED_EMAILS`), forkable, deployable to Cloudflare or any Node host.

## Stack

- Nuxt 5 nightly (`app/` srcDir, SPA: `ssr: false`), Nitro v3, h3 v2. Server handlers use `defineHandler` from `h3`;
  read JSON with `await event.req.json()`, query with `event.url.searchParams`, throw `new HTTPError({ status, statusText })`.
  Server code imports explicitly; nothing under `server/` is auto-imported.
- ViteHub (`vite-hub/*`): `database` (Drizzle on SQLite: D1 on Cloudflare, a libsql file on Node and in `nuxt dev`),
  `kv`, `schedule`, `queue` (Cloudflare only, see `#dispatch`), `auth` (Better Auth), `email` (optional, see `#mailer`), `env`.
- Better Auth 1.7.10 with `organization` (households), `passkey`, `twoFactor`, `magicLink`, `apiKey`, `lastLoginMethod`,
  `jwt` + `oauthProvider` (MCP OAuth). Client: `useNuxtApp().$auth` (app/plugins/auth.ts).
- Nuxt UI 4 themed like shadcn/ui (app/assets/css/main.css, app/app.config.ts), VueUse, Lucide icons (`i-lucide-*`).
- valibot for input validation.

## Rules that keep data private

- Every read of accounts or transactions goes through `server/utils/access.ts`: `visibleAccounts(who, scope)` (SQL
  condition), `visibleAccountIds`, `requireAccount(who, id, "view" | "edit")`, `onlyVisible`. A private account is
  visible to its owner only, in every list, total, chart, MCP tool, and API response. `shared/access.ts` holds the same
  rules for the UI (`canView`, `canEdit`, `canManage`).
- Transactions, their sums, and anything derived from them (recurring series, transfer labels, the forecast) read
  through `visibleTransactions(who, scope)`, which adds to `visibleAccounts`: a `hidden` transaction is seen only by
  its account's owner. Only that owner sets `hidden`, in the browser (not agents or API keys; `canHide`). Hidden rows
  never make a recurring series, pair as transfers only with the owner's own accounts, and never become a household
  rule. Balances are bank-reported and still include them.
- The caller is `await requireMember(event)` (server/utils/identity.ts): `{ userId, householdId, role, via }`. Never take
  a household id or owner id from the request body or query.
- `scope` (`?scope=me|household`, `scopeOf(event)`) narrows a view to the caller's own accounts.
- Agents (`via: "agent"`) and API keys never manage people or household settings (`requireOwner`).

## Data

- Schema: `server/databases/{auth,oauth,finance}.ts`, registered in `server/databases/config.ts`. After a schema change
  run `npx drizzle-kit generate --name <what>`; `nuxt dev` and Node builds apply migrations on start.
- Money is integer minor units (`amountMinor`, `balanceMinor`) plus a `currency`. `shared/money.ts` formats and parses.
  Totals across accounts convert to the household currency with `server/utils/fx.ts` (`converterTo(base)`).
- Dates are `YYYY-MM-DD` strings in transactions, snapshots, and recurring rows.
- D1 limits a statement to 100 bound parameters: insert in chunks. There are no interactive transactions.
- API response types live in `shared/api.ts`. Server handlers return them; pages type `useFetch` with them.

## Packages

A pnpm workspace: the app at the root, and three clients in `packages/` that know nothing about the app.

- `@vitehub-finance/banking`: open banking. `BankingProvider` (institutions, authorize, completeAuthorization,
  balance, transactions, revoke), `readAccounts`, `BankingError`. Providers: `./enable-banking`, `./fake`.
- `@vitehub-finance/crypto`: balances. `CryptoProvider.balances()` returns `Holding[]`; wallets on Bitcoin, the XRP
  Ledger, and Nimiq also have `transactions({ since })` (`CryptoTransaction[]`: hash, day, signed quantity, fee,
  counterparty, kind). Factories per exchange and chain, `connect(id, credentials)`, `createCrypto([...])`,
  `parseAddress`, `CryptoError`. The XRP Ledger reader tries `XRPL_SERVERS` in order and moves on when one rate limits.
  `./fake` for tests.
- `@vitehub-finance/brokers`: brokerage accounts. `ibkr({ token, queryId }).accounts()` runs an Activity Flex Query
  through IBKR's Flex Web Service and returns `BrokerAccount[]` (positions at IBKR's mark prices, cash per currency);
  `parseXml` is its small XML reader (Workers have no DOMParser), `BrokerError`. `./fake` for tests.

Packages import with `.ts` extensions and only erasable TypeScript, so Node runs their source directly. Their errors
become the app's `ProviderError` in `server/providers/types.ts` (`asProviderError`); `server/providers/*` are thin
adapters that keep what the app stores (sealed credentials) and add dedupe keys. A new exchange or chain goes in the
crypto package, a new broker in the brokers package; the app only needs its id in `ProviderId`, the schema enum, and the
UI lists.

## Sync

`server/utils/sync.ts` `syncConnection(connectionId, trigger)` runs one connection: the provider fetches accounts,
balances, holdings, and transactions (`server/providers/*`); new transactions dedupe on `(accountId, dedupeKey)` and
get categories from rules, or the transfer category when the provider marks them `transfer`; balances snapshot daily;
`detectTransfers` (server/utils/transfers.ts) pairs moves between the household's accounts and gives them the transfer
category, so they leave spending; `detectRecurring` (server/utils/recurring.ts) runs on the touched accounts. The daily
Schedule (`server/schedules/daily.ts`) dispatches every active connection through `#dispatch`.

An account with holdings (crypto, investment) is worth its holdings in the household's currency (`valueHoldings` in
server/utils/prices.ts): coins at CoinGecko's price, and a holding with the provider's own `quote` (IBKR's mark price) at
that price, converted with fx.ts. A wallet's `coinTransactions` become transactions valued at the coin's price on their
day (`valueCoinTransactions`, from CoinGecko's keyless year of daily prices). They never set the balance, and holdings
accounts get no balance history backfilled from transactions, since their past value depends on past prices.

## Demo

`FINANCE_DEMO=1` (scripts/deployment.ts) sets `runtimeConfig.public.demo`; on Cloudflare it also drops the Queue
(`#dispatch` is inline). server/demo: `scenario.ts` is the pure, date-seeded household (tested in test/demo),
`seed.ts` wipes and rebuilds it (`seedDemo`, `ensureDemo`), `mode.ts` has `isDemo()`, `refuseInDemo()` (403 "Not available
in the demo."), and the Better Auth paths the demo disables. Routes that manage banks, connections, people, the household,
or delete accounts call `refuseInDemo()` first; data edits never do. In the UI, `useDemo()` and `<DemoLock>` disable the
same controls. The daily Schedule reseeds instead of syncing. Demo users are only created by the seed
(`seedingEmails` in `user.create.before`).

## Commands

Run heavy commands through `heavy` (shared machine): `heavy pnpm typecheck`, `HEAVY_WAIT=0 heavy pnpm build`.
`FINANCE_HOST=node pnpm build` checks the Node output; plain `pnpm build` checks Cloudflare's.

## API

Every route requires a member (`requireMember`) unless noted. `scope` is `me` | `household` (default). Types: `shared/api.ts`.

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /api/me` | | `MeResponse` |
| `GET /api/legal` (public) | | `LegalInfo` — the contact email for /privacy |
| `POST /api/demo/session` (public, demo builds only; 404 otherwise) | `{ as: "lucia" \| "pablo" }` | `{ ok }` and a session cookie |
| `PATCH /api/household` (owner) | `{ name?, currency?, shareNewAccounts? }` | `MeResponse["household"]` |
| `DELETE /api/household/members/:userId` (owner) | | `{ ok }` — their accounts move to a new household of their own |
| `POST /api/household/leave` | | `{ ok }` — same, for yourself (not the last owner) |
| `GET /api/overview` | `scope` | `Overview` |
| `GET /api/accounts` | `scope`, `archived=1` | `AccountSummary[]` |
| `POST /api/accounts` | `{ name, kind, currency, balanceMinor, visibility, institution? }` | `AccountSummary` (manual account) |
| `GET /api/accounts/:id` | | `AccountDetail` |
| `PATCH /api/accounts/:id` | `{ name?, kind?, visibility?, householdPermission?, includeInNetWorth?, archived?, balanceMinor? }` | `AccountSummary` |
| `DELETE /api/accounts/:id` | | `{ ok }` (owner) |
| `POST /api/accounts/:id/import` | `{ rows: [{ date, amount, description, counterparty? }] }` (amount in major units) | `{ added, skipped }` |
| `GET /api/transactions` | `scope, q, account, category (id or "none"), from, to, direction (in/out), cursor, limit` | `TransactionPage` |
| `PATCH /api/transactions/:id` | `{ categoryId?, note?, excluded?, hidden?, applyToSimilar? }` (`hidden`: the account's owner, in the browser) | `Transaction` |
| `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id` | `{ name, kind, icon, color }` | `Category[]` / `Category` |
| `GET/POST /api/rules`, `DELETE /api/rules/:id` | `{ match, categoryId }` | `{ id, match, categoryId }[]` |
| `GET /api/budgets` | `scope, month (YYYY-MM)` | `BudgetsResponse` |
| `POST /api/budgets`, `PATCH/DELETE /api/budgets/:id` | `{ categoryId, amountMinor, personal? }` | `Budget` |
| `GET/POST /api/goals`, `PATCH/DELETE /api/goals/:id` | `{ name, icon, targetMinor, savedMinor?, targetDate?, accountId?, personal? }` | `Goal[]` / `Goal` |
| `GET /api/recurring` | `scope` | `RecurringResponse` |
| `PATCH /api/recurring/:id` | `{ status }` | `Recurring` |
| `GET /api/forecast` | `scope, months (1-24)` | `Forecast` |
| `GET /api/connect/providers` | | `ProviderInfo[]` |
| `GET /api/connect/banks` | `country` (ISO 3166 alpha-2) | `Bank[]` |
| `POST /api/connect/bank` | `{ name, country }` | `{ url }` — open it; the bank returns to `/api/connect/callback` |
| `GET /api/connect/callback` (bank redirect) | `code, state, error` | 302 to `/connect?linked=<id>` or `/connect?error=<message>` |
| `POST /api/connect/exchange` | `{ provider: kraken/binance/coinbase, key, secret, name? }` | `ConnectionSummary` |
| `POST /api/connect/wallet` | `{ chain: bitcoin/ethereum/solana/xrpl/nimiq, address, name? }` | `ConnectionSummary` |
| `POST /api/connect/broker` | `{ provider: ibkr, token, queryId, name? }` (a Flex token and an Activity Flex Query id) | `ConnectionSummary` |
| `GET /api/connections` | | `ConnectionSummary[]` |
| `POST /api/connections/:id/sync` | | `{ ok }` |
| `POST /api/connections/:id/reconnect` | | `{ url }` (bank connections) |
| `DELETE /api/connections/:id` | `keepAccounts=1` | `{ ok }` |
| `GET /api/connections/:id/runs` | | `SyncRun[]` |
| `POST /mcp` | OAuth bearer or `fin_` API key | MCP (Streamable HTTP) |
