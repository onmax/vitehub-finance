# ViteHub Finance

Household finance on ViteHub. People sign up, get a household (a Better Auth organization), invite a partner, connect
banks (Enable Banking, PSD2), crypto exchanges, and wallets, and see their money together: accounts, transactions,
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

A pnpm workspace: the app at the root, and two clients in `packages/` that know nothing about the app.

- `@vitehub-finance/banking`: open banking. `BankingProvider` (institutions, authorize, completeAuthorization,
  balance, transactions, revoke), `readAccounts`, `BankingError`. Providers: `./enable-banking`, `./fake`.
- `@vitehub-finance/crypto`: balances. `CryptoProvider.balances()` returns `Holding[]`; factories per exchange and chain,
  `connect(id, credentials)`, `createCrypto([...])`, `parseAddress`, `CryptoError`. `./fake` for tests.

Packages import with `.ts` extensions and only erasable TypeScript, so Node runs their source directly. Their errors
become the app's `ProviderError` in `server/providers/types.ts` (`asProviderError`); `server/providers/*` are thin
adapters that keep what the app stores (sealed credentials) and add dedupe keys. A new exchange or chain goes in the
crypto package; the app only needs its id in `ProviderId`, the schema enum, and the UI lists.

## Sync

`server/utils/sync.ts` `syncConnection(connectionId, trigger)` runs one connection: the provider fetches accounts,
balances, holdings, and transactions (`server/providers/*`); new transactions dedupe on `(accountId, dedupeKey)` and
get categories from rules; balances snapshot daily; `detectTransfers` (server/utils/transfers.ts) pairs moves between
the household's accounts and gives them the transfer category, so they leave spending; `detectRecurring`
(server/utils/recurring.ts) runs on the touched accounts. The daily Schedule (`server/schedules/daily.ts`) dispatches every active connection through `#dispatch`.

AI categories come after rules and transfers, in the sync and the CSV import, and from `POST /api/transactions/categorize`
(the button on /settings/categories): `server/utils/ai-categorize.ts` picks uncategorized, unlocked rows AI hasn't seen
(`aiCheckedAt` null) and writes `categorySource: "ai"`; `server/utils/ai-categorize-core.ts` is the pure part (request,
answers, thresholds, the HTTP call), tested in test/ai with a stubbed fetch. It runs only with `TYPESAFE_API_KEY`, never in
the demo, and not when the household turned `aiCategorize` off. `categorySource` is `rule` (rules, transfers), `ai`, or
`manual` (also sets `categoryLocked`). Never log the transactions' text: the `ai` field has counts, tokens, and cost.

## Demo

`FINANCE_DEMO=1` (scripts/deployment.ts) sets `runtimeConfig.public.demo`; on Cloudflare it also drops the Queue
(`#dispatch` is inline). server/demo: `scenario.ts` is the pure, date-seeded household (tested in test/demo),
`seed.ts` wipes and rebuilds it (`seedDemo`, `ensureDemo`), `mode.ts` has `isDemo()`, `refuseInDemo()` (403 "Not available
in the demo."), and the Better Auth paths the demo disables. Routes that manage banks, connections, people, the household,
or delete accounts call `refuseInDemo()` first; data edits never do. In the UI, `useDemo()` and `<DemoLock>` disable the
same controls. The daily Schedule reseeds instead of syncing. Demo users are only created by the seed
(`seedingEmails` in `user.create.before`).

## Logs and errors

evlog (`evlog/nitro/v3`, `EVLOG` in nuxt.config.ts) prints one wide event per request (a JSON line on Node, an
object Workers Logs indexes on Cloudflare): `method`, `path`, `status`,
`durationMs`, `requestId` (the `cf-ray` on Cloudflare), `userId`, `householdId`, `user.via` (browser, agent, api-key),
`action` where a handler sets one, and `error` (`message`, `stack`) when it failed. Handlers add fields with
`useLogger(event).set({...})` from `evlog/nitro/v3`; work without a request makes its own with `createLogger` from
`evlog` and calls `emit()`. Other events: `action: "sync"` (one per sync run: `sync.connectionId`, `provider`, `trigger`,
`accounts`, `added`, `status`, `code`, plus `ai.*`), `action: "schedule"` (the daily run), `action: "client-error"`
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
`FINANCE_HOST=node pnpm build` checks the Node output; plain `pnpm build` checks Cloudflare's.

## API

Every route requires a member (`requireMember`) unless noted. `scope` is `me` | `household` (default). Types: `shared/api.ts`.

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /api/me` | | `MeResponse` |
| `GET /api/legal` (public) | | `LegalInfo` — the contact email and whether AI categories are on, for /privacy |
| `POST /api/_evlog/ingest` (public, same origin, rate limited) | evlog client event with `clientError` | 204 — logs a browser error |
| `POST /api/demo/session` (public, demo builds only; 404 otherwise) | `{ as: "lucia" \| "pablo" }` | `{ ok }` and a session cookie |
| `PATCH /api/household` (owner) | `{ name?, currency?, shareNewAccounts?, aiCategorize? }` | `MeResponse["household"]` |
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
| `POST /api/transactions/categorize` | | `AiCategorizeResult` — AI categories for up to 200 of the caller's editable, uncategorized rows; 404 without a TypeSafe key, 409 when the household turned it off |
| `PATCH /api/transactions/:id` | `{ categoryId?, note?, excluded?, applyToSimilar? }` | `Transaction` |
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
| `GET /api/connections` | | `ConnectionSummary[]` |
| `POST /api/connections/:id/sync` | | `{ ok }` |
| `POST /api/connections/:id/reconnect` | | `{ url }` (bank connections) |
| `DELETE /api/connections/:id` | `keepAccounts=1` | `{ ok }` |
| `GET /api/connections/:id/runs` | | `SyncRun[]` |
| `POST /mcp` | OAuth bearer or `fin_` API key | MCP (Streamable HTTP) |
