import { defineConfig } from "vitest/config"

// Unit tests for pure server logic (providers, parsing). Modules under test import no ViteHub virtual modules.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
})
