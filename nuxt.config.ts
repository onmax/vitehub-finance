import { fileURLToPath } from "node:url"
import type { NuxtConfig } from "nuxt/schema"
import { env } from "vite-hub/env"
import { deployment, type Host } from "./scripts/deployment.ts"

const target = deployment()
// `nuxt dev` runs as a Node host whatever the target: local SQLite, KV files, inline syncs. It needs no Cloudflare
// account, and Queue has no local provider. Build with JOXI_HOST to check a host's output.
const dev = process.argv.includes("dev")
const host: Host = dev ? "node" : target.host
const email = target.email
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * ViteHub per host. Cloudflare gets a Queue (one sync per message, retried on failure); Node syncs inline from the
 * same daily Schedule. Everything else (Database, KV, Auth, Email) is the same code on both.
 */
const VITEHUB: Record<Host, NonNullable<NuxtConfig["vitehub"]>> = {
  cloudflare: {
    preset: "cloudflare",
    database: {
      driver: "d1",
      databaseName: process.env.CLOUDFLARE_D1_DATABASE_NAME || "joxi",
      // `nuxt dev` and `nuxt prepare` run against a local D1; deploys read the real id from the environment.
      databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || "00000000-0000-4000-8000-000000000000",
    },
    kv: true,
    schedule: true,
    queue: true,
  },
  node: {
    preset: "node",
    database: {
      connection: {
        url: env({ source: env.source("JOXI_DATABASE_URL"), default: "file:.data/joxi.db" }),
      },
    },
    kv: { driver: "fs-lite", base: ".data/kv" },
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
    // How a sync request reaches the sync: a Queue message on Cloudflare, a direct call elsewhere.
    "#dispatch": here(`./server/dispatch/${host === "cloudflare" ? "queue" : "inline"}.ts`),
    // Sends through ViteHub Email when the build has a provider, otherwise returns the link for the UI to show.
    "#mailer": here(`./server/mailer/${email ? "email" : "none"}.ts`),
  },

  ssr: false,
  devtools: { enabled: false },
  compatibilityDate: "2026-10-20",

  css: ["@fontsource-variable/geist", "@fontsource-variable/geist-mono", "~/assets/css/main.css"],

  runtimeConfig: {
    public: { email: Boolean(email), host },
  },

  routeRules: {
    "/api/**": { headers: { "cache-control": "private, no-store" } },
  },

  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "Joxi",
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
    theme: { colors: ["primary", "secondary", "success", "info", "warning", "error", "neutral"] },
  },

  icon: {
    provider: "none",
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
          "square",
          "sun",
          "triangle-alert",
          "upload",
          "x",
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
        ].map((name) => `lucide:${name}`),
      ],
    },
  },

  nitro: {
    // Local SQLite applies the migration journal before the server answers its first request.
    plugins: host === "node" ? [here("./server/database-migrate.ts")] : [],
    cloudflare: {
      wrangler: {
        name: process.env.CLOUDFLARE_WORKER_NAME || "joxi",
        observability: { enabled: true, logs: { enabled: true, invocation_logs: true } },
        placement: { mode: "smart" },
        ...(process.env.JOXI_DOMAIN
          ? { routes: [{ pattern: process.env.JOXI_DOMAIN, custom_domain: true }], workers_dev: false }
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
    env: {
      server: {
        auth: {
          secret: env({ secret: true, source: env.source("BETTER_AUTH_SECRET") }),
        },
        joxi: {
          // Emails allowed to create an account, comma-separated. Empty lets anyone sign up. Invited people always may.
          allowedEmails: env({ secret: true, source: env.source("JOXI_ALLOWED_EMAILS"), default: "" }),
          // Encrypts bank sessions and exchange keys at rest (AES-GCM). Any long random string; changing it disconnects
          // every connection.
          encryptionKey: env({ secret: true, source: env.source("JOXI_ENCRYPTION_KEY") }),
          // The sender for invitations and reminders, when the build has Email.
          emailFrom: env({ source: env.source("JOXI_EMAIL_FROM"), default: "Joxi <joxi@example.com>" }),
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
      },
    },
  },
})
