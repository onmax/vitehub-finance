import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Unit tests for pure server logic and the workspace packages. Modules under test import no ViteHub virtual modules,
// except in tests that mock them (test/database.ts); `#shared` is Nuxt's alias for shared/.
export default defineConfig({
  resolve: { alias: { "#shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  test: {
    include: ["test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
  },
})
