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

## Sync

`server/utils/sync.ts` `syncConnection(connectionId, trigger)` runs one connection: the provider fetches accounts,
balances, holdings, and transactions (`server/providers/*`); new transactions dedupe on `(accountId, dedupeKey)` and
get categories from rules; balances snapshot daily; `detectRecurring` (server/utils/recurring.ts) runs on the touched
accounts. The daily Schedule (`server/schedules/daily.ts`) dispatches every active connection through `#dispatch`.

## Commands

Run heavy commands through `heavy` (shared machine): `heavy pnpm typecheck`, `HEAVY_WAIT=0 heavy pnpm build`.
`FINANCE_HOST=node pnpm build` checks the Node output; plain `pnpm build` checks Cloudflare's.

## API

Every route requires a member (`requireMember`) unless noted. `scope` is `me` | `household` (default). Types: `shared/api.ts`.

| Route | Body / query | Returns |
| --- | --- | --- |
| `GET /api/me` | | `MeResponse` |
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
| `POST /api/connect/wallet` | `{ chain: bitcoin/ethereum/solana/xrpl, address, name? }` | `ConnectionSummary` |
| `GET /api/connections` | | `ConnectionSummary[]` |
| `POST /api/connections/:id/sync` | | `{ ok }` |
| `POST /api/connections/:id/reconnect` | | `{ url }` (bank connections) |
| `DELETE /api/connections/:id` | `keepAccounts=1` | `{ ok }` |
| `GET /api/connections/:id/runs` | | `SyncRun[]` |
| `POST /mcp` | OAuth bearer or `fin_` API key | MCP (Streamable HTTP) |
