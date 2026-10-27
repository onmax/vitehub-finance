# ViteHub Finance

Household finance on ViteHub. People sign up, get a household (a Better Auth organization), invite a partner, connect
banks (Enable Banking, PSD2), crypto exchanges, wallets, and Interactive Brokers, and see their money together: accounts, transactions,
recurring payments, budgets, goals, and a cash-flow forecast. An MCP server lets their agents read it.

Private by default (`FINANCE_ALLOWED_EMAILS`), or public (`FINANCE_DEMO=1`: anyone signs up, plus a demo household),
forkable, deployable to Cloudflare or any Node host.

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
  rule. Balances are bank-reported and still include them. Staking events of a hidden transaction (an event id is the
  wallet transaction's hash, its `externalId`, plus `:value` or `:fee`) are left out of everyone else's `stakingView`.
- Bulk changes to transactions (rules applied, removed, or turned off; AI categories someone asks for) go through
  `writableTransactions(who)` (server/utils/categorize.ts): accounts the caller may edit, minus another owner's hidden rows.
- What goes to an AI gateway (`AiRows` in server/utils/ai-categorize.ts): from the button, only the caller's
  `writableTransactions`; from the sync and CSV import, never a hidden row, and through a key the household set (nothing
  records which owner set it) never a private account's rows. The server's own route may get a private account's rows.
- A connection's `lastError` reaches every member who shares one of its accounts, so it holds only a stable code's
  English copy (`englishError`); other members get that copy even for older rows (`lastErrorFor`). Names and provider
  text of failed accounts go only to `sync_run`, which only the connection's owner reads; logs get codes and account ids.
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

## Translations

- English copy is the source of truth in `app/locales/en.json`; every key must also exist in `es`, `fr`, `de`, and `pt`.
  Add whole messages with named interpolation and plural branches, then use `$t` in templates or `translate` in scripts.
  Keep labels reactive. `pnpm test` checks key/parameter parity, message compilation, plural forms, and locale formatting.
- `app/lib/i18n.ts` lazy-loads the five catalogs through a client-only `vue-i18n` plugin. Routes have no locale prefix.
  `useLanguage` saves signed-in preferences to Better Auth's `user.language`; localStorage remembers signed-out/demo
  choices. Otherwise match the browser language, falling back to English. Use `useMoney` and `app/utils/format.ts` for display.
- API diagnostics and MCP text stay English. Import `HTTPError` from `server/utils/http-error.ts` and register its
  stable message code in `error-codes.ts`; the browser translates `data.code`. Provider packages stay independent:
  map their codes in `server/providers/types.ts`. Store provider codes with sync errors so they follow language changes.
- Emails use `server/utils/translate.ts` with the recipient's saved language, then the request's `X-Finance-Language`
  or `Accept-Language`. Scheduled reminders use the saved language or English. Seed new categories in the creator's
  language; never translate existing category names, rule keywords, user data, or demo data in place.
- Spanish uses tú and Movimientos; French vous and Opérations; German du and Umsätze; Portuguese uses pt-PT and Transações.
  Keep brands and protocol identifiers unchanged. Escape literal `@` and `|` with vue-i18n literal interpolation.

## Packages

A pnpm workspace: the app at the root, and three clients in `packages/` that know nothing about the app.

- `@vitehub-finance/banking`: open banking. `BankingProvider` (institutions, authorize, completeAuthorization,
  balance, transactions, revoke), `readAccounts`, `BankingError`. Providers: `./enable-banking`, `./fake`.
- `@vitehub-finance/crypto`: balances. `CryptoProvider.balances()` returns `Holding[]`; wallets on Bitcoin, the XRP
  Ledger, and Nimiq also have `transactions({ since })` (`CryptoTransaction[]`: hash, day, signed quantity, fee,
  counterparty, kind). Factories per exchange and chain, `connect(id, credentials)`, `createCrypto([...])`,
  `parseAddress`, `CryptoError`. The XRP Ledger reader tries `XRPL_SERVERS` in order and moves on when one rate limits.
  Ethereum and Polygon wallets read the native coin plus a short list of common ERC-20 tokens (`balanceOf`), trying
  two public nodes each. Staking is chain-independent (`staking.ts`: `StakingLedger` in bigint base units,
  `summarizeStaking`, `formatUnits`); a chain with an adapter answers `staking()` (Nimiq: `nimiqStaking`, which fails
  rather than return part of the history). `./fake` for tests.
- `@vitehub-finance/brokers`: brokerage accounts. `ibkr({ token, queryId }).accounts()` runs an Activity Flex Query
  through IBKR's Flex Web Service and returns `BrokerAccount[]` (positions at IBKR's mark prices, cash per currency);
  `parseXml` is its small XML reader (Workers have no DOMParser), `BrokerError`. `myinvestor({ funds }).accounts()`
  prices the funds someone says they hold at Morningstar's latest NAV (MyInvestor has no API for them; its current
  account is a bank), and `morningstar().search()` finds a fund by ISIN or name. `./fake` for tests.

Packages import with `.ts` extensions and only erasable TypeScript, so Node runs their source directly. Their errors
become the app's `ProviderError` in `server/providers/types.ts` (`asProviderError`); `server/providers/*` are thin
adapters that keep what the app stores (sealed credentials) and add dedupe keys. A new exchange or chain goes in the
crypto package, a new broker in the brokers package; the app only needs its id in `ProviderId`, the schema enum,
`PROVIDERS` (app/utils/accounts.ts), and a catalog entry.

## Connect

Three pages, each listing the household's connections of its kind and then how to add more: `/connect/banks` (Enable
Banking's country and bank picker, manual accounts, CSV import), `/connect/crypto` (exchanges and wallets), and
`/connect/investments` (Interactive Brokers, MyInvestor, plus platforms that can't be connected yet). `connectPageOf(provider)`
(app/utils/accounts.ts) says which page a connection belongs on; the sidebar badges each page for connections needing
someone. `/connect` and `/connect/crypto#broker` redirect, keeping query and hash.

- app/utils/connect-catalog.ts is the catalog: per provider its kind, mark, one line, what it reads, what it can't do,
  how it signs in, docs, `soon` for platforms that can't be connected, and `steps`, the components its connect dialog
  walks through. `GET /api/connect/providers` says what the server can connect (`reason: "setup" | "public"` when not).
- `ConnectCatalogPage` (a page's list, catalog, and overlays), `ConnectCatalog` (search, kind chips, groups that are
  section anchors like `#wallet`), `ConnectProviderTile`, `ConnectProviderDetail` (slideover), and `ConnectDialog`
  (the stepper, then the accounts found). The overlays are hash routes (`useConnectRoutes`): `#ibkr` opens the details,
  `#ibkr/connect` the dialog.
- A step (app/components/connect/) renders a `UForm` with `useConnectFlow().formId`; the dialog's primary button submits
  it, so validation runs on submit. It calls `flow.next()`, or on the last step `flow.connect(request, fallback)` with
  the existing endpoint (`/api/connect/exchange`, `/wallet`, `/broker`). New provider: add the entry and, if no step
  fits, a step component.

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
day (`valueCoinTransactions`, from CoinGecko's keyless year of daily prices). They never set the balance. A wallet reads
its whole history (`since: null`, up to the crypto package's page caps) until it has transactions and a balance history
that reaches back to them (`walletHistoryMissing` in sync.ts), then the last ten days. Its `coinHistory` (every change
to the holding, fees and dust included) gives it a balance history: `backfillHoldingSnapshots` (server/utils/snapshots.ts)
walks back from today's quantity day by day (`quantityTimeline`, server/utils/holdings-history.ts) and values each day at
that day's closing price (`closingPrices`), writing only days without a snapshot, for up to a year. Exchanges and IBKR
have no history: the overview holds an account at its first known balance before it (`netWorthSeries` in
server/utils/series.ts), so connecting one doesn't count as growth.

A wallet whose provider answers `staking()` gets a `staking_position` row and its `staking_event`s, replaced by each
complete read (`saveStaking`, server/utils/staking.ts); a failed read keeps the last one. They never touch the balance:
the holding already counts staked coins and the rewards inside them. `stakingView` serves the account page, the overview,
and agents: exact decimal strings of coins, today's-price values, identified rewards per month, and unpaid rewards,
profit, and APY always null. Payments from a known validator also become `reward` transactions (income); moves into
and out of staking stay out of transactions, since the holding counts staked coins.

AI categories come after rules and transfers, in the sync and the CSV import, and from `POST /api/transactions/categorize`
(the button on /settings/categories): `server/utils/ai-categorize.ts` picks uncategorized, unlocked rows AI hasn't seen
(`aiCheckedAt` null) among those `AiRows` allows (see the privacy rules) and writes `categorySource: "ai"`; `server/utils/ai-categorize-core.ts` is the pure part (questions,
answers, thresholds, batches through an AI gateway's `ask()`), tested in test/ai with ViteHub's gateways on a stubbed fetch. It
runs only with a key (the household's or the server's), never in the demo, and not when the household turned `aiCategorize` off. `categorySource` is `rule` (rules, transfers), `ai`, or
`manual` (also sets `categoryLocked`). Never log the transactions' text: the `ai` field has the route (`provider`,
`keySource`), counts, tokens, and cost.

Jev is reached through ViteHub's AI gateways (`typesafe()`, `vercel()`, `cloudflare()` from `vite-hub/gateways`,
pnpm-patched until upstream ships `@vite-hub/gateways`) and their `ask()`: TypeSafe directly, Vercel AI Gateway, or Cloudflare AI Gateway. `server/utils/ai-gateway.ts` `routeFor(householdId)`
picks the household's own route (`householdSettings.aiGateway`, its key and Cloudflare fields sealed in `aiCredentials`
with crypto.ts) when its owner set one in Settings › Categories, else the server's own route from nuxt.config.ts
`vite.env.server` (`cloudflare` when the TypeSafe key, account, and gateway are set, else `typesafe`, else `vercel`), else none. It passes every credential to the preset explicitly, so a
household's route never picks up the server's variables, and the server's comes from its typed `useServerEnv()`. The browser gets only `{ last4 }` of a secret; `GET/PUT
/api/household/ai` and `POST /api/household/ai/test` are owner-only, in the browser, and refused in the demo.

## Demo

`FINANCE_DEMO=1` (scripts/deployment.ts) builds the demo (finance.vitehub.dev) and sets `runtimeConfig.public.demo`.
It has no accounts: sign-up is refused for everyone but the seed (server/auth.ts `user.create.before`), and a signed-out
visitor enters the demo household wherever they arrive (app/middleware/auth.global.ts, `enterDemo()` in
app/composables/useDemo.ts). So it never holds anyone's real data; keep it that way. No bank connections there
(`banksUnavailable()` in server/utils/connections.ts answers `public`), and on Cloudflare no Queue.

The locks are per person. The demo's people are Lucía and Pablo, emails under `DEMO_DOMAIN` (shared/demo.ts,
`isDemoEmail`). server/demo: `scenario.ts` is the pure, date-seeded household (tested in test/demo), `seed.ts` wipes and
rebuilds it (`seedDemo`, `ensureDemo`), `mode.ts` has `isDemo()` (the build), `isDemoPerson(email)`,
`refuseDemoPerson(who)` (403 "Not available in the demo."), and `DEMO_LOCKED_PATHS`, the Better Auth endpoints that
server/auth.ts's `hooks.before` refuses for a demo person's session or for a request naming a demo email (sign-up, magic
links, password resets, invitations). Routes that manage banks, connections, people, the household, or delete accounts
call `refuseDemoPerson(await requireMember(event))` first; data edits never do. In the UI, `useDemoPerson()` and
`<DemoLock>` disable the same controls; `useDemoBuild()` is the build. AI categories never run for the demo's
household. The daily Schedule reseeds it and skips the demo's fake connections.

Erasing goes through server/utils/erase.ts: `erasePeople` deletes people and only the households whose every member is
being erased (`splitHouseholds` in erase-core.ts, tested in test/privacy). The nightly reset erases the demo domain's
people; deleting your account (Better Auth's `/delete-user`, Settings › Security) erases you and your household, and
waits until nobody else is in it. Demo users are only created by the seed
(`seedingEmails` in `user.create.before`).

## Logs and errors

evlog (`evlog/nitro/v3`, `EVLOG` in nuxt.config.ts) prints one wide event per request (a JSON line on Node, an
object Workers Logs indexes on Cloudflare): `method`, `path`, `status`,
`durationMs`, `requestId` (the `cf-ray` on Cloudflare), `userId`, `householdId`, `user.via` (browser, agent, api-key),
`action` where a handler sets one, and `error` (`message`, `stack`) when it failed. Handlers add fields with
`useLogger(event).set({...})` from `evlog/nitro/v3`; work without a request makes its own with `createLogger` from
`evlog` and calls `emit()`. Other events: `action: "sync"` (one per sync run: `sync.connectionId`, `provider`, `trigger`,
`accounts`, `added`, `status`, `code`, `messageCode`, `failures` (failed accounts' ids and codes, never their names or
the provider's text), plus `ai.*`), `action: "schedule"` (the daily run), `action: "client-error"`
(browser errors: `client.kind` vue / unhandled / toast / load, `client.path`, `client.title`, `client.request`,
`client.status`, the browser in `userAgent`). Level `error` means something broke: a 4xx prints as `warn`
(server/observability.ts), as do provider failures people fix themselves (an expired consent). Secrets, emails, IBANs,
and card numbers are masked before printing (`redact` in nuxt.config.ts). Never put a credential, a name, or transaction
text in an event.

Browser errors reach the server through evlog's client transport (`evlog/client`, app/plugins/errors.client.ts) at
`POST /api/_evlog/ingest` (server/handlers/client-errors.ts, 20 per minute per IP): Vue errors, unhandled rejections,
`useNotify().error` toasts, and `<PageError>`. Call `reportClientError(kind, error)` (app/utils/client-errors.ts) for
anything else people see fail.

Production on Cloudflare (Workers Logs keeps 3 days on Free, 7 on Paid). The service is the Worker's name
(`CLOUDFLARE_WORKER_NAME`, default `vitehub-finance`):

```bash
# Live: every invocation with its console lines (`logs[].message[0]` is the event) as it happens.
npx wrangler tail vitehub-finance --format json
# Errors only, one event per line; browser errors only.
npx wrangler tail vitehub-finance --format json | jq -c '.logs[]? | select(.level == "error") | .message[0]'
npx wrangler tail vitehub-finance --format json | jq -c '.logs[]?.message[0] | select(.action? == "client-error")'

# Past events: the Workers Observability query API (wrangler 4.148 has no command for it). The token needs the
# account's "Workers Observability" edit permission. Errors from the last 24 hours, newest first:
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/observability/telemetry/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "content-type: application/json" \
  -d '{"queryId":"finance-errors","view":"events","limit":100,
       "timeframe":{"from":'"$(( ($(date +%s) - 86400) * 1000 ))"',"to":'"$(( $(date +%s) * 1000 ))"'},
       "parameters":{"filters":[
         {"key":"$workers.scriptName","operation":"eq","type":"string","value":"vitehub-finance"},
         {"key":"$metadata.level","operation":"eq","type":"string","value":"error"}]}}' \
  | jq '.result.events.events[] | .source'
```

Add `{"key":"action","operation":"eq","type":"string","value":"client-error"}` to the filters for browser errors only,
or filter on `sync.connectionId`, `userId`, `path`. The dashboard has the same under Workers > vitehub-finance >
Observability. On a Node host the events are JSON lines on stdout: `docker logs <container> | grep '"level":"error"'`.
In `nuxt dev` they print as a readable tree in the terminal.

## Commands

Run heavy commands through `heavy` (shared machine): `heavy pnpm typecheck`, `HEAVY_WAIT=0 heavy pnpm build`.
Tests that need SQL (test/privacy) run server code against an in-memory SQLite with every migration (test/database.ts),
mocking `vite-hub/database/drizzle` and the other ViteHub modules they reach; only synthetic data goes in them.
`FINANCE_HOST=node pnpm build` checks the Node output; plain `pnpm build` checks Cloudflare's.

## API

Every route requires a member (`requireMember`) unless noted. `scope` is `me` | `household` (default). Types: `shared/api.ts`.

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /api/me` | | `MeResponse` |
| `GET /api/legal` (public) | | `LegalInfo` — the contact email and the AI categories route (the caller's household's, else the server's), for /privacy |
| `POST /api/_evlog/ingest` (public, same origin, rate limited) | evlog client event with `clientError` | 204 — logs a browser error |
| `POST /api/demo/session` (public, public builds only; 404 otherwise) | `{ as: "lucia" \| "pablo" }` | `{ ok }` and a session cookie |
| `PATCH /api/household` (owner) | `{ name?, currency?, shareNewAccounts?, aiCategorize? }` | `MeResponse["household"]` |
| `GET /api/household/ai` (owner) | | `AiGatewaySettings` — the household's route for AI categories; secrets only as `{ last4 }` |
| `PUT /api/household/ai` (owner) | `AiGatewayInput`: `{ gateway: "server" }`, `{ gateway: "typesafe" \| "vercel", apiKey? }`, or `{ gateway: "cloudflare", apiKey?, accountId, gatewayId, token?, slug? }` (empty secret keeps the stored one, `token: null` removes it) | `AiGatewaySettings` |
| `POST /api/household/ai/test` (owner) | `AiGatewayInput` | `AiTestResult` — one made-up Jev question through that route, not saved |
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
| `POST /api/transactions/categorize` | | `AiCategorizeResult` — AI categories for up to 200 of the caller's editable, visible, uncategorized rows; 404 without a key (household or server), 409 when the household turned it off |
| `PATCH /api/transactions/:id` | `{ categoryId?, note?, excluded?, hidden?, applyToSimilar? }` (`hidden`: the account's owner, in the browser) | `Transaction` |
| `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id` | `{ name, kind, icon, color }` | `Category[]` / `Category` |
| `GET/POST /api/rules`, `DELETE /api/rules/:id` | `{ match, categoryId }` | `{ id, match, categoryId }[]` |
| `GET /api/budgets` | `scope, month (YYYY-MM)` | `BudgetsResponse` |
| `POST /api/budgets`, `PATCH/DELETE /api/budgets/:id` | `{ categoryId, amountMinor, personal? }` | `Budget` |
| `GET/POST /api/goals`, `PATCH/DELETE /api/goals/:id` | `{ name, icon, targetMinor, savedMinor?, targetDate?, accountId?, personal? }` | `Goal[]` / `Goal` |
| `GET /api/recurring` | `scope` | `RecurringResponse` |
| `PATCH /api/recurring/:id` | `{ status }` | `Recurring` |
| `GET /api/forecast` | `scope, months (1-24)` | `Forecast` |
| `GET /api/connect/providers` | | `ProviderInfo[]` — `available`, and `reason` (`setup`, `public`) when not |
| `GET /api/connect/banks` | `country` (ISO 3166 alpha-2) | `Bank[]` |
| `POST /api/connect/bank` | `{ name, country }` | `{ url }` — open it; the bank returns to `/api/connect/callback` |
| `GET /api/connect/callback` (bank redirect) | `code, state, error` | 302 to `/connect/banks?linked=<id>` or `/connect/banks?error=<message>` |
| `POST /api/connect/exchange` | `{ provider: kraken/binance/coinbase, key, secret, name? }` | `ConnectionSummary` |
| `POST /api/connect/wallet` | `{ chain: bitcoin/ethereum/solana/xrpl/nimiq, address, name? }` | `ConnectionSummary` |
| `POST /api/connect/broker` | `{ provider: ibkr, token, queryId, name? }` (a Flex token and an Activity Flex Query id) | `ConnectionSummary` |
| `GET /api/connections` | | `ConnectionSummary[]` |
| `POST /api/connections/:id/sync` | | `{ ok }` |
| `POST /api/connections/:id/reconnect` | | `{ url }` (bank connections) |
| `DELETE /api/connections/:id` | `keepAccounts=1` | `{ ok }` |
| `GET /api/connections/:id/runs` | | `SyncRun[]` |
| `POST /mcp` | OAuth bearer or `fin_` API key | MCP (Streamable HTTP) |
