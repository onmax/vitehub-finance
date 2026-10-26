# ViteHub Finance

Your household's money in one place. ViteHub Finance pulls transactions from your banks, exchanges, and wallets every day, lets
you share accounts with a partner while keeping others private, finds subscriptions you both pay for, and forecasts
where your balance is heading. Your agents can read it over MCP.

Built on [ViteHub](https://vitehub.dev) and Nuxt 5. Runs on Cloudflare Workers or any Node host.

## What it does

- **Bank sync** for EU banks through [Enable Banking](https://enablebanking.com) (PSD2), daily, with re-consent reminders.
- **Crypto**: Kraken, Binance, and Coinbase with read-only keys; Bitcoin, Ethereum, Solana, and XRP Ledger addresses.
- **CSV import** for everything else (brokers, old statements), with column mapping and a preview.
- **Households**: invite a partner. Each account is private to its owner or shared with the household; a private
  account never shows up for anyone else, in any list, total, chart, or MCP tool.
- **Recurring payments** detected from transactions, with ways to save: price increases, subscriptions two members both
  pay for, large subscriptions.
- **Forecast** of the next 3–12 months, and "can we afford it?".
- **Budgets and goals**, shared or personal.
- **MCP server** at `/mcp` (OAuth 2.1, or a `fin_` API key): seven tools for overview, accounts, transactions,
  spending, forecast, recurring payments, and categorizing.
- Sign in with a password, a passkey, or a magic link; optional two-factor.

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

The Worker gets D1, KV, a daily Cron Trigger, and a Queue that syncs one connection per message.

### Any Node host (VPS, Docker, a home server)

```bash
docker build -t vitehub-finance .
docker run -p 3000:3000 -v finance-data:/app/.data \
  -e BETTER_AUTH_SECRET=... -e FINANCE_ENCRYPTION_KEY=... vitehub-finance
```

Or without Docker: `FINANCE_HOST=node pnpm build`, then run `node .output/server/index.mjs` with
`server/databases/migrations` beside `.output`. SQLite and KV live in `.data/`; the daily sync runs in-process.

## Keep it private

`FINANCE_ALLOWED_EMAILS=you@example.com,partner@example.com` limits sign-up to those emails (invited people always can).

## Develop

- `pnpm test` — unit tests (sync mapping, dedupe, signatures, recurring detection, forecast).
- `node scripts/privacy-check.mjs` — two members against a running server; fails if a private account leaks anywhere.
- `pnpm typecheck`
- [AGENTS.md](./AGENTS.md) has the architecture, the privacy rules, and the full API.
