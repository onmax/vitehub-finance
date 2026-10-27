# ViteHub Finance

Your household's money in one place. ViteHub Finance pulls transactions from your banks, exchanges, wallets, and broker every day, lets
you share accounts with a partner while keeping others private, finds subscriptions you both pay for, and forecasts
where your balance is heading. Your agents can read it over MCP.

Built on [ViteHub](https://vitehub.dev) and Nuxt 5. Runs on Cloudflare Workers or any Node host.

## What it does

- **Bank sync** for EU banks through [Enable Banking](https://enablebanking.com) (PSD2), daily, with re-consent reminders.
- **A connect catalog** per kind (banks, crypto, investments): search, each provider's details (what it reads, what it
  can't do, how it signs in), and a step-by-step connect dialog that validates the credentials once before saving.
- **Crypto**: Kraken, Binance, and Coinbase with read-only keys; Bitcoin, Ethereum, Solana, XRP Ledger, and Nimiq
  addresses (staked NIM included). Bitcoin, XRP Ledger, and Nimiq wallets bring their transactions too, valued at each
  day's price and counted as transfers (rewards count as income).
- **Interactive Brokers** through a read-only Flex token: positions and cash per currency, valued at IBKR's own prices.
- **Transfers** between your own accounts (a top-up from another bank, a currency exchange, a broker deposit) are
  found and left out of spending and income.
- **CSV import** for everything else (other brokers, old statements), with column mapping and a preview.
- **Categories** from rules (a starter set, plus one for each "apply to similar"), and optionally from AI for what the
  rules miss: TypeSafe's Jev model, with `TYPESAFE_API_KEY`. See [AI categories](#ai-categories).
- **Households**: invite a partner. Each account is private to its owner or shared with the household; a private
  account never shows up for anyone else, in any list, total, chart, or MCP tool.
- **Recurring payments** detected from transactions, with ways to save: price increases, subscriptions two members both
  pay for, large subscriptions.
- **Forecast** of the next 3–12 months, and "can we afford it?".
- **Budgets and goals**, shared or personal.
- **MCP server** at `/mcp` (OAuth 2.1, or a `fin_` API key): seven tools for overview, accounts, transactions,
  spending, forecast, recurring payments, and categorizing.
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
   your own accounts: link each account in Enable Banking's control panel first.
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
npx wrangler queues create queue--73796e63
pnpm build && pnpm db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET --config .output/server/wrangler.json   # and FINANCE_ENCRYPTION_KEY, ENABLE_BANKING_*, FINANCE_ALLOWED_EMAILS
npx wrangler deploy --config .output/server/wrangler.json
```

The Worker gets D1, KV, a daily Cron Trigger, a Queue that syncs one connection per message, a rate limit for browser
error reports, and Workers Logs. Every request, sync, and browser error is one structured log event; AGENTS.md ("Logs and
errors") says how to read them.

### Any Node host (VPS, Docker, a home server)

```bash
docker build -t vitehub-finance .
docker run -p 3000:3000 -v finance-data:/app/.data \
  -e BETTER_AUTH_SECRET=... -e FINANCE_ENCRYPTION_KEY=... vitehub-finance
```

Or without Docker: `FINANCE_HOST=node pnpm build`, then run `node .output/server/index.mjs` with
`server/databases/migrations` beside `.output`. SQLite and KV live in `.data/`; the daily sync runs in-process. Logs are
JSON lines on stdout.

## AI categories

Rules categorize what they recognize ("mercadona" is Groceries). For the rest ("Five Guys Jv Ltd", "Hetzner Online
Gmbh"), set `TYPESAFE_API_KEY` (a key from [typesafe.ai](https://typesafe.ai)) and ViteHub Finance asks TypeSafe's Jev
model, after the rules and transfer detection, on every sync and CSV import. `/settings/categories` has a button for
what's already there. It uses a category only when Jev is sure (confidence 0.7 or more), marks it with a sparkle, and
never asks about the same transaction twice. About $0.02 per 1,000 transactions.

Jev sees each transaction's description, payee, direction, rounded amount, currency, and account type, with household
members' names, IBANs, and long numbers masked, plus the category names and rule keywords. Never dates, balances, ids,
or who you are. The household's owner can turn it off in Settings; the demo never uses it.

## Keep it private

`FINANCE_ALLOWED_EMAILS=you@example.com,partner@example.com` limits sign-up to those emails (invited people always can).

`/privacy` and `/terms` describe what an instance stores and its terms of use; register their URLs with Enable Banking.
Set `FINANCE_CONTACT_EMAIL` to show a contact address on the privacy page. Anyone can delete their account, and their
household with it, from Settings › Security once nobody else is in that household.

## Public instance

`FINANCE_DEMO=1` builds a public instance, like finance.vitehub.dev: anyone can sign up with any email and use it with
their own data, and the login page also offers "Explore the demo", a fictional household, Lucía and Pablo in Madrid, with
13 months of bank statements, a credit card, savings, an index fund, a bitcoin wallet, budgets, goals, and recurring
payments (including a Netflix price increase and a Spotify both of them pay). A banner switches between the two people,
so visitors see each one's private account stay private. `/privacy` and `/terms` say it's a hosted demo of open-source
software, with no guarantees.

```bash
FINANCE_DEMO=1 pnpm dev                                   # locally
```

On Cloudflare, give it its own Worker and D1 (and KV), with the same secrets as any instance. It has no Queue: syncs run
inline from the daily cron, so it can live in the same account as a private instance.

```bash
npx wrangler d1 create vitehub-finance-demo                # note the database id
export FINANCE_DEMO=1 CLOUDFLARE_WORKER_NAME=vitehub-finance-demo CLOUDFLARE_D1_DATABASE_NAME=vitehub-finance-demo \
  CLOUDFLARE_D1_DATABASE_ID=<id> FINANCE_DOMAIN=finance.vitehub.dev
pnpm build && pnpm db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET --config .output/server/wrangler.json   # and FINANCE_ENCRYPTION_KEY
npx wrangler deploy --config .output/server/wrangler.json
```

- **Sign-up** is open: `FINANCE_ALLOWED_EMAILS` is ignored. Without email in the build, people sign up and in with a
  password or a passkey; magic links and reminders are off.
- **Banks** aren't offered: Enable Banking's restricted apps only reach the accounts their owner linked, so the bank
  page says so and points at CSV import, wallets, exchanges, and Interactive Brokers. Leave `ENABLE_BANKING_*` unset.
- **AI categories** run for everyone but the demo's people when `TYPESAFE_API_KEY` is set, at the operator's cost.
- **Locked for the demo's people only**, on the server and in the UI: every sign-in or account change (password, email,
  passkeys, two-factor, magic links, sessions, deleting the user), inviting or removing people, leaving or renaming the
  household, connecting, syncing, reconnecting, or removing banks, exchanges, and wallets, and deleting accounts. They
  answer "Not available in the demo." Nobody else can sign up, reset a password, or get a magic link for a demo email.
- **Open to the demo's people**: categorizing, notes, rules, budgets, goals, recurring confirm/dismiss, manual accounts,
  CSV import, API keys, and MCP.
- **Nightly reset**: the daily Schedule (05:00 UTC) wipes the demo people, the household only they belong to, and whatever
  visitors made as them, and seeds it again as of that day (server/demo); then it syncs everyone else's connections as
  usual. People who signed up are never touched: only households whose every member is a demo person are erased. The
  first visit seeds the demo too when it's missing; its data is generated from the date, so it always ends today.

## Develop

The bank, crypto, and broker clients are workspace packages you can use on their own:
[`@vitehub-finance/banking`](./packages/banking), [`@vitehub-finance/crypto`](./packages/crypto), and
[`@vitehub-finance/brokers`](./packages/brokers).

- `pnpm test` — unit tests (sync mapping, dedupe, signatures, recurring detection, forecast, the demo scenario, what
  erasing people may delete, translations).
- `node scripts/privacy-check.mjs` — two members against a running server; fails if a private account leaks anywhere.
- `pnpm typecheck`
- [AGENTS.md](./AGENTS.md) has the architecture, the privacy rules, and the full API.
