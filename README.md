# ViteHub Finance

[![Built with ViteHub](https://comark-ui.onmax.me/badge.svg?label=built%20with&value=ViteHub&icon=package)](https://vitehub.dev)
[![Comark UI](https://comark-ui.onmax.me/badge.svg?label=docs&value=Comark%20UI&icon=comark)](https://comark-ui.onmax.me)
[![Documentation](https://comark-ui.onmax.me/badge.svg?label=docs&value=finance.onmax.me)](https://finance.onmax.me/docs)

Your household's money in one place. ViteHub Finance pulls transactions from your banks, exchanges, wallets, and broker every day, lets
you share accounts with a partner while keeping others private, finds subscriptions you both pay for, and forecasts
where your balance is heading. Your agents can read it over MCP.

Built on [ViteHub](https://vitehub.dev) and Nuxt 5, with [Comark UI](https://comark-ui.onmax.me) for the documentation. Runs on Cloudflare Workers or any Node host.

## What it does

- **Bank sync** for EU banks through [Enable Banking](https://enablebanking.com) (PSD2), daily, with re-consent reminders.
- **A connect catalog** per kind (banks, crypto, investments): search, each provider's details (what it reads, what it
  can't do, how it signs in), and a step-by-step connect dialog that validates the credentials once before saving.
- **Crypto**: Kraken, Binance, and Coinbase with read-only keys; Bitcoin, Ethereum, Solana, XRP Ledger, and Nimiq
  addresses (staked NIM included). Bitcoin, XRP Ledger, and Nimiq wallets bring their transactions too, valued at each
  day's price and counted as transfers (rewards count as income).
- **Stripe** under Payments: restricted read-only key, available and pending balances per currency, and net transaction history with fees, refunds, and payouts. [Setup guide](https://finance.onmax.me/docs/providers/stripe).
- **Interactive Brokers** through a read-only Flex token: positions and cash per currency, valued at IBKR's own prices.
- **Transfers** between your own accounts (a top-up from another bank, a currency exchange, a broker deposit) are
  found and left out of spending and income.
- **CSV import** for everything else (other brokers, old statements), with column mapping and a preview.
- **Categories** from rules (a starter set, plus one for each "apply to similar"), and optionally from AI for what the
  rules miss: TypeSafe's Jev model, directly or through Vercel or Cloudflare AI Gateway, with the server's key or each
  household's own. See [AI categories](#ai-categories).
- **Households**: invite a partner. Each account is private to its owner or shared with the household; a private
  account never shows up for anyone else, in any list, total, chart, or MCP tool.
- **Recurring payments** detected from transactions, with ways to save: price increases, subscriptions two members both
  pay for, large subscriptions.
- **Forecast** of the next 3–12 months with account-specific scenarios, dated planned events, reserve and goal protection, saved/shared plans, comparisons, and input provenance.
- **Budgets and goals**, shared or personal: dated budget amounts, optional unused-budget rollover, historical suggestions, pacing, and explicitly allocated goal funding.
- **Transaction review** with a queue, household assignments, bulk actions and Undo, category splits, and linked refunds.
- **Setup checklist and monthly check-ins** that remain available after the first account is connected.
- **MCP server** at `/mcp` (OAuth 2.1, or a `fin_` API key): four tools. `get_finances` reads the overview, accounts
  (with holdings and staking), spending, recurring payments, and the forecast; `search_transactions` finds and sums
  transactions; `update_transaction` sets categories and notes; `add_transactions` adds rows from any statement.
- Sign in with a password, a passkey, or a magic link; optional two-factor.
- English, Spanish, French, German, and European Portuguese, with a saved language preference, localized amounts and dates, and translated emails.

## Run it locally

```bash
pnpm install
cp .env.example .env   # set BETTER_AUTH_SECRET and FINANCE_ENCRYPTION_KEY (openssl rand -hex 32)
pnpm dev
```

`pnpm dev` uses a local SQLite file in `.data/`, whatever host you deploy to. Sign up at `/signup`; try the importer
with `public/samples/household-sample.csv`.

## Connect banks

1. Create an application at [enablebanking.com](https://enablebanking.com). A restricted production app is free for
   your own accounts: link each account once in Enable Banking's control panel, then connect it in the app.
2. Register `https://<your domain>/api/connect/callback` as its redirect URL.
3. Set `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY` (the app's PKCS#8 PEM; convert a PKCS#1 key with
   `openssl pkcs8 -topk8 -nocrypt -in key.pem`).

Consent lasts up to 180 days per bank, and banks allow about four background fetches a day, so ViteHub Finance syncs once a day
and emails a reminder a week before a consent expires (when the build has email).

## Deploy

### Cloudflare

```bash
npx wrangler d1 create vitehub-finance                       # note the database id
export CLOUDFLARE_D1_DATABASE_ID=<id> FINANCE_DOMAIN=finance.example.com
npx wrangler kv namespace create KV               # then add its id to the generated wrangler.json, or let wrangler provision it
npx wrangler queues create vitehub-finance-queue--73796e63   # ViteHub names it <package name>-queue--<hex of "sync">
pnpm build && pnpm db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET --config .output/server/wrangler.json   # and FINANCE_ENCRYPTION_KEY, ENABLE_BANKING_*, FINANCE_ALLOWED_EMAILS
npx wrangler deploy --config .output/server/wrangler.json
```

The Worker gets D1, KV, a daily Cron Trigger, a Queue that syncs one connection per message, rate limits (browser error
reports, demo sessions, AI categories, manual syncs), and Workers Logs. Every request, sync, and browser error is one
structured log event; AGENTS.md ("Logs and errors") says how to read them. `FINANCE_DOMAIN` is read at build time: it
routes the domain to the Worker, and links in emails always point at `https://<FINANCE_DOMAIN>`.

### Any Node host (VPS, Docker, a home server)

```bash
docker build -t vitehub-finance .
docker run -p 3000:3000 -v finance-data:/app/.data \
  -e BETTER_AUTH_SECRET=... -e FINANCE_ENCRYPTION_KEY=... vitehub-finance
```

Or without Docker: `FINANCE_HOST=node pnpm build`, then run `node .output/server/index.mjs` with
`server/databases/migrations` beside `.output`. SQLite and KV live in `.data/`; the daily sync runs in-process. Logs are
JSON lines on stdout.

Set `FINANCE_ORIGIN=https://finance.example.com` (or build with `FINANCE_DOMAIN`) so reminder emails link to your
public address. Without either, they use the first address someone connected a bank, exchange, or wallet from, and no
later request changes it; to change it, set `FINANCE_ORIGIN`.

## AI categories

Rules categorize what they recognize ("mercadona" is Groceries). For the rest ("Five Guys Jv Ltd", "Hetzner Online
Gmbh"), ViteHub Finance asks TypeSafe's Jev model, after the rules and transfer detection, on every sync and CSV import.
`/settings/categories` has a button for what's already there.

It reaches Jev through one of ViteHub's AI gateways (`typesafe()`, `vercel()`, or `cloudflare()`), one of three ways:

| Route | Server variables | Household form |
| --- | --- | --- |
| TypeSafe, directly (default) | `TYPESAFE_API_KEY` | a TypeSafe key |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` (used when `TYPESAFE_API_KEY` is not set) | an AI Gateway key |
| Cloudflare AI Gateway | `TYPESAFE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, optional `CLOUDFLARE_AI_GATEWAY_TOKEN` and `CLOUDFLARE_AI_GATEWAY_SLUG` | the TypeSafe key, account ID, gateway ID, optional gateway token and slug |

The server's key is optional. Each household's owner can pick a route and paste their own key in Settings › Categories
instead; it's encrypted like connection credentials, the browser only ever sees its last four characters, and Test asks
Jev one made-up question to check it. A household's own key wins over the server's. For Cloudflare, create the gateway's
custom provider once (dashboard: AI Gateway › Custom Providers), with the base URL `https://api.typesafe.ai` and the slug
`typesafe`. It uses a category only when Jev is sure (confidence 0.7 or more), marks it with a sparkle, and
never asks about the same transaction twice. About $0.02 per 1,000 transactions.

Jev sees each transaction's description, payee, direction, rounded amount, currency, and account type, with household
members' names, IBANs, and long numbers masked, plus the category names and rule keywords. Never dates, balances, ids,
or who you are. The household's owner can turn it off in Settings; the demo never uses it. Through a gateway, Vercel or
Cloudflare handles the requests too (Cloudflare can log them in the gateway owner's account); /privacy names the route.

## Keep it private

`FINANCE_ALLOWED_EMAILS=you@example.com,partner@example.com` limits sign-up to those emails (invited people always can).

`/privacy` and `/terms` describe what an instance stores and its terms of use; register their URLs with Enable Banking.
Set `FINANCE_CONTACT_EMAIL` to show a contact address on the privacy page. Anyone can delete their account, and their
household with it, from Settings › Security once nobody else is in that household.

## Demo

`FINANCE_DEMO=1` builds the demo, like finance.vitehub.dev: visitors land straight in a fictional household, Lucía and
Pablo in Madrid, with 13 months of bank statements, a credit card, savings, an index fund, a bitcoin wallet, budgets,
goals, and recurring payments (including a Netflix price increase and a Spotify both of them pay). A banner switches
between the two people, so visitors see each one's private account stay private. There's no sign-up and no sign-in:
the demo holds no one's real data, and `/privacy` and `/terms` say only that.

```bash
FINANCE_DEMO=1 pnpm dev                                   # locally
```

On Cloudflare, give it its own Worker and D1 (and KV), with `BETTER_AUTH_SECRET` and `FINANCE_ENCRYPTION_KEY`. It has no
Queue and needs no Enable Banking keys.

```bash
npx wrangler d1 create vitehub-finance-demo                # note the database id
export FINANCE_DEMO=1 CLOUDFLARE_WORKER_NAME=vitehub-finance-demo CLOUDFLARE_D1_DATABASE_NAME=vitehub-finance-demo \
  CLOUDFLARE_D1_DATABASE_ID=<id> FINANCE_DOMAIN=finance.vitehub.dev
pnpm build && pnpm db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET --config .output/server/wrangler.json   # and FINANCE_ENCRYPTION_KEY
npx wrangler deploy --config .output/server/wrangler.json
```

- **Read-only** for the demo's people, on the server and in the UI, since every visitor shares them: no edits,
  imports, rules, budgets, goals, API keys, agent consents, sign-in or account changes, people, household, or
  connection changes. They answer "Not available in the demo."; the UI disables create and save buttons and says so.
- **Open**: looking at everything as Lucía or Pablo, switching between them, and choosing language, currency, and
  appearance (kept in the browser).
- **Nightly reset**: the daily Schedule (05:00 UTC) wipes the demo household and seeds it again as of that day
  (server/demo). The first visit seeds it too when it's missing.

## Develop

The bank, crypto, and broker clients are workspace packages you can use on their own:
[`@vitehub-finance/banking`](./packages/banking), [`@vitehub-finance/crypto`](./packages/crypto), and
[`@vitehub-finance/brokers`](./packages/brokers).

- `pnpm test` — unit tests (sync mapping, dedupe, signatures, recurring detection, forecast, the demo scenario, what
  erasing people may delete, translations).
- `node scripts/privacy-check.mjs` — two members against a running server; fails if a private account leaks anywhere.
- `pnpm typecheck`
- [AGENTS.md](./AGENTS.md) has the architecture, the privacy rules, and the full API.
