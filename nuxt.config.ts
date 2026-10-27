import { fileURLToPath } from "node:url"
import evlog from "evlog/nitro/v3"
import type { NuxtConfig } from "nuxt/schema"
import { env, typesafeEnv } from "vite-hub/env"
import { deployment, type Host } from "./scripts/deployment.ts"

const target = deployment()
// `nuxt dev` runs as a Node host whatever the target: local SQLite, KV files, inline syncs. It needs no Cloudflare
// account, and Queue has no local provider. Build with FINANCE_HOST to check a host's output.
const dev = process.argv.includes("dev")
const host: Host = dev ? "node" : target.host
const email = target.email
// A public instance (FINANCE_DEMO=1): open sign-up plus the demo household. It has no Queue, so a Cloudflare account can
// hold it beside a private instance (one queue per name); its people's syncs run inline from the daily Schedule.
const demo = target.demo
const queue = host === "cloudflare" && !demo
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const worker = process.env.CLOUDFLARE_WORKER_NAME || "vitehub-finance"

/**
 * One structured "wide event" per request (evlog): who called, what they did, how long it took, and why it failed.
 * Syncs, the daily Schedule, and browser errors (/api/_evlog/ingest) are events of their own. Workers Logs indexes
 * objects passed to the console field by field, so Cloudflare gets objects; Node gets JSON lines on stdout. See
 * "Logs and errors" in AGENTS.md.
 */
const EVLOG = {
  env: { service: worker },
  stringify: host !== "cloudflare",
  exclude: ["/_nuxt/**", "/_fonts/**", "/favicon.svg", "/__nuxt_error", "/api/_nuxt_icon/**"],
  redact: {
    // Built-in masks (emails, IBANs, card numbers, bearer tokens, JWTs, and keys ending in password, secret, or token)
    // plus ViteHub Finance's own: submitted exchange keys, sealed credentials, PEM keys, fin_ API keys.
    paths: ["**.key", "**.secret", "**.privateKey", "**.credentials", "**.apiKey"],
    patterns: [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, /\bfin_[A-Za-z0-9_-]{8,}/g],
  },
}

/**
 * ViteHub per host. Cloudflare gets a Queue (one sync per message, retried on failure), except public builds; Node syncs
 * inline from the same daily Schedule. Everything else (Database, KV, Auth, Email) is the same code on both.
 */
const VITEHUB: Record<Host, NonNullable<NuxtConfig["vitehub"]>> = {
  cloudflare: {
    preset: "cloudflare",
    database: {
      driver: "d1",
      databaseName: process.env.CLOUDFLARE_D1_DATABASE_NAME || "vitehub-finance",
      // `nuxt dev` and `nuxt prepare` run against a local D1; deploys read the real id from the environment.
      databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || "00000000-0000-4000-8000-000000000000",
    },
    kv: true,
    // Caps client error reports (server/handlers/client-errors.ts) with a Workers Rate Limiting binding.
    rateLimit: true,
    schedule: true,
    ...(queue ? { queue: { provider: "cloudflare" as const } } : {}),
  },
  node: {
    preset: "node",
    database: {
      connection: {
        url: env({ source: env.source("FINANCE_DATABASE_URL"), default: "file:.data/finance.db" }),
      },
    },
    kv: { driver: "fs-lite", base: ".data/kv" },
    // Counted in memory, per server process.
    rateLimit: true,
    schedule: { runtime: { driver: "process" } },
  },
}

const EMAIL = {
  resend: {
    driver: "resend" as const,
    options: { apiKey: env({ secret: true, source: env.source("RESEND_API_KEY") }) },
  },
  cloudflare: { driver: "cloudflare" as const },
}

export default defineNuxtConfig({
  modules: ["@nuxt/ui", "@vueuse/nuxt", "vite-hub/nuxt"],

  vitehub: {
    ...VITEHUB[host],
    auth: true,
    ...(email ? { email: EMAIL[email] } : {}),
  },

  alias: {
    // How a sync request reaches the sync: a Queue message on Cloudflare, a direct call elsewhere (and in public builds).
    "#dispatch": here(`./server/dispatch/${queue ? "queue" : "inline"}.ts`),
    // Sends through ViteHub Email when the build has a provider, otherwise returns the link for the UI to show.
    "#mailer": here(`./server/mailer/${email ? "email" : "none"}.ts`),
  },

  ssr: false,
  devtools: { enabled: false },
  compatibilityDate: "2026-10-01",

  css: ["@fontsource-variable/geist", "@fontsource-variable/geist-mono", "~/assets/css/main.css"],

  runtimeConfig: {
    public: { email: Boolean(email), host, demo },
  },

  routeRules: {
    "/api/**": { headers: { "cache-control": "private, no-store" } },
  },

  // OAuth discovery for MCP clients (server/handlers/oauth-metadata.ts), bare and path-suffixed (`.../mcp`).
  serverHandlers: [
    ...["oauth-protected-resource", "oauth-authorization-server", "openid-configuration"].flatMap((name) => [
      { route: `/.well-known/${name}`, handler: here("./server/handlers/oauth-metadata.ts"), lazy: true },
      { route: `/.well-known/${name}/**`, handler: here("./server/handlers/oauth-metadata.ts"), lazy: true },
    ]),
    // Browser errors, sent by evlog's client transport (app/plugins/errors.client.ts) to its default endpoint.
    { route: "/api/_evlog/ingest", method: "POST" as const, handler: here("./server/handlers/client-errors.ts"), lazy: true },
  ],

  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "ViteHub Finance",
      meta: [
        { name: "color-scheme", content: "light dark" },
        { name: "robots", content: "noindex" },
      ],
      link: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    },
  },

  ui: {
    colorMode: true,
    // Geist is self-hosted from Fontsource (see `css`).
    fonts: false,
    // Prose components (ProseH2, ProseCallout, ProseSteps…) and ContentNavigation/ContentToc render /docs.
    prose: true,
    content: true,
    theme: { colors: ["primary", "secondary", "success", "info", "warning", "error", "neutral"] },
  },

  icon: {
    provider: "none",
    // Brand marks Simple Icons doesn't have (Nimiq, Kraken, the brokers), as `i-finance-<file>`.
    customCollections: [{ prefix: "finance", dir: "./app/assets/icons" }],
    clientBundle: {
      scan: true,
      // Nuxt UI's own icons and the ones picked at runtime (category and account kinds): the scanner reads
      // templates, not app.config or data.
      icons: [
        ...[
          "arrow-down",
          "arrow-left",
          "arrow-right",
          "arrow-up",
          "arrow-up-right",
          "check",
          "chevron-down",
          "chevron-left",
          "chevron-right",
          "chevrons-left",
          "chevrons-right",
          "chevron-up",
          "circle-alert",
          "circle-check",
          "circle-x",
          "copy",
          "copy-check",
          "ellipsis",
          "eye",
          "eye-off",
          "file",
          "grip-vertical",
          "hash",
          "info",
          "lightbulb",
          "loader-circle",
          "menu",
          "minus",
          "monitor",
          "moon",
          "panel-left-close",
          "panel-left-open",
          "plus",
          "rotate-ccw",
          "search",
          "sparkles",
          "square",
          "sun",
          "triangle-alert",
          "upload",
          "x",
          // Navigation (app/utils/navigation.ts).
          "layout-dashboard",
          "bell",
          "badge-percent",
          "trending-down",
          "chart-pie",
          "sliders-horizontal",
          "archive",
          "undo-2",
          "coins",
          "settings",
          "book-open",
          "wallet-cards",
          // Account kinds (shared/accounts.ts).
          "landmark",
          "piggy-bank",
          "credit-card",
          "trending-up",
          "bitcoin",
          "wallet",
          "hand-coins",
          "box",
          // Categories (shared/categories.ts).
          "shopping-cart",
          "utensils",
          "house",
          "zap",
          "car",
          "heart-pulse",
          "plane",
          "film",
          "shirt",
          "repeat",
          "gift",
          "graduation-cap",
          "receipt",
          "banknote",
          "briefcase",
          "arrow-left-right",
          "circle-help",
          "baby",
          "dog",
          "dumbbell",
          "smartphone",
          // Goals (shared/goals.ts).
          "target",
          "umbrella",
          "palmtree",
          "key-round",
          "bike",
        ].map((name) => `lucide:${name}`),
        // Our own brand marks (app/assets/icons), named in shared/banks.ts and InstitutionMark.
        ...["coinbase", "degiro", "ibkr", "kraken", "myinvestor", "nimiq", "scalable-capital", "trade-republic"].map((name) => `finance:${name}`),
        // Bank marks (shared/banks.ts).
        ...["revolut", "n26", "wise", "bunq", "monzo", "caixabank", "starlingbank", "deutschebank", "commerzbank", "barclays", "hsbc", "paypal", "klarna", "sparkasse"].map(
          (name) => `simple-icons:${name}`,
        ),
      ],
    },
  },

  nitro: {
    plugins: [
      here("./server/observability.ts"),
      // Local SQLite applies the migration journal before the server answers its first request.
      ...(host === "node" ? [here("./server/database-migrate.ts")] : []),
    ],
    modules: [evlog(EVLOG)],
    // The docs' Markdown, bundled with the server so a Worker can read it (server/content.ts).
    serverAssets: [{ baseName: "docs", dir: here("./docs") }],
    cloudflare: {
      wrangler: {
        name: worker,
        // Workers Logs keeps every console line (evlog's events) and every invocation (requests, the Schedule, Queue
        // batches) for querying in the dashboard or `wrangler tail`.
        observability: { enabled: true, head_sampling_rate: 1, logs: { enabled: true, invocation_logs: true } },
        placement: { mode: "smart" },
        // The sync Queue (server/queues/sync.ts): ViteHub generates its producer and consumer as the package name plus
        // queue--<hex of "sync">, binding QUEUE_73796E63. This only tunes the consumer: five syncs per batch.
        ...(queue ? { queues: { consumers: [{ queue: "vitehub-finance-queue--73796e63", max_batch_size: 5, max_retries: 3 }] } } : {}),
        ...(process.env.FINANCE_DOMAIN
          ? { routes: [{ pattern: process.env.FINANCE_DOMAIN, custom_domain: true }], workers_dev: false }
          : {}),
      },
    },
  },

  experimental: { typescriptPlugin: true },

  typescript: {
    strict: true,
    typeCheck: false,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        noFallthroughCasesInSwitch: true,
      },
    },
  },

  hooks: {
    // The CLI nightly adds a dev-only socket-cleanup plugin that this Nuxt nightly's server import protection rejects.
    "nitro:config": function (config) {
      config.plugins = config.plugins?.filter((plugin) => !plugin.includes("dev-close-sockets"))
    },
  },

  vite: {
    define: { __VUE_I18N_LEGACY_API__: false, __INTLIFY_PROD_DEVTOOLS__: false },
    env: {
      server: {
        auth: {
          secret: env({ secret: true, source: env.source("BETTER_AUTH_SECRET") }),
        },
        finance: {
          // Emails allowed to create an account, comma-separated. Empty lets anyone sign up. Invited people always may.
          // A public build (FINANCE_DEMO=1) ignores it.
          allowedEmails: env({ secret: true, source: env.source("FINANCE_ALLOWED_EMAILS"), default: "" }),
          // Encrypts bank sessions and exchange keys at rest (AES-GCM). Any long random string; changing it disconnects
          // every connection.
          encryptionKey: env({ secret: true, source: env.source("FINANCE_ENCRYPTION_KEY") }),
          // The sender for invitations and reminders, when the build has Email.
          emailFrom: env({ source: env.source("FINANCE_EMAIL_FROM"), default: "ViteHub Finance <finance@example.com>" }),
          // Optional. Where people write about their data; /privacy shows it (server/api/legal.get.ts) and omits the line when empty.
          contactEmail: env({ source: env.source("FINANCE_CONTACT_EMAIL"), default: "" }),
        },
        // Enable Banking (enablebanking.com): PSD2 access to EU banks. A restricted app is free for your own accounts.
        enableBanking: {
          appId: env({ source: env.source("ENABLE_BANKING_APP_ID"), default: "" }),
          privateKey: env({ secret: true, source: env.source("ENABLE_BANKING_PRIVATE_KEY"), default: "" }),
        },
        // Optional. A CoinGecko demo key raises the price API's rate limit.
        coingecko: {
          apiKey: env({ secret: true, source: env.source("COINGECKO_API_KEY"), default: "" }),
        },
        // Optional. The server's own route for AI categories: Jev (typesafe.ai) categorizes what the rules didn't
        // (server/utils/ai-categorize.ts). Each group sits where ViteHub's AI gateway presets read it
        // (env.server.<preset>.<field>); server/utils/ai-gateway.ts uses the first one set: Cloudflare AI Gateway, TypeSafe,
        // then Vercel AI Gateway. Households without their own key use it.
        typesafe: typesafeEnv(),
        vercel: {
          apiKey: env({ secret: true, source: env.source("AI_GATEWAY_API_KEY"), default: "" }),
        },
        cloudflare: {
          // The TypeSafe key that the gateway forwards is typesafe.apiKey.
          accountId: env({ source: env.source("CLOUDFLARE_ACCOUNT_ID"), default: "" }),
          gatewayId: env({ source: env.source("CLOUDFLARE_AI_GATEWAY_ID"), default: "" }),
          token: env({ secret: true, source: env.source("CLOUDFLARE_AI_GATEWAY_TOKEN"), default: "" }),
          slug: env({ source: env.source("CLOUDFLARE_AI_GATEWAY_SLUG"), default: "typesafe" }),
        },
      },
    },
  },
})
