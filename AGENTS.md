# Joxi

Household finance on ViteHub. People sign up, get a household (a Better Auth organization), invite a partner, connect
banks (Enable Banking, PSD2), crypto exchanges, and wallets, and see their money together: accounts, transactions,
recurring payments, budgets, goals, and a cash-flow forecast. An MCP server lets their agents read it.

Private by default (`JOXI_ALLOWED_EMAILS`), forkable, deployable to Cloudflare or any Node host.

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
`JOXI_HOST=node pnpm build` checks the Node output; plain `pnpm build` checks Cloudflare's.
