import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  out: "./server/databases/migrations",
  schema: ["./server/databases/auth.ts", "./server/databases/oauth.ts", "./server/databases/finance.ts"],
})
