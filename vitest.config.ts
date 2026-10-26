import { defineConfig } from "vitest/config"

// Unit tests for pure server logic and the workspace packages. Modules under test import no ViteHub virtual modules.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    environment: "node",
  },
})
