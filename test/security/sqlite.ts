import { readdirSync, readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { drizzle } from "drizzle-orm/sqlite-proxy"

/**
 * The app's schema with every migration applied, in memory (Node's own SQLite), to stand in for
 * `vite-hub/database/drizzle`'s `db` in tests that need real queries.
 */
export function memoryDatabase() {
  const sqlite = new DatabaseSync(":memory:")
  const migrations = new URL("../../server/databases/migrations/", import.meta.url)
  for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort())
    for (const statement of readFileSync(new URL(file, migrations), "utf8").split("--> statement-breakpoint"))
      if (statement.trim()) sqlite.exec(statement)
  return drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql)
    if (method === "run") {
      statement.run(...(params as never[]))
      return { rows: [] }
    }
    statement.setReturnArrays(true)
    if (method === "get") return { rows: (statement.get(...(params as never[])) ?? undefined) as unknown as unknown[] }
    return { rows: statement.all(...(params as never[])) as unknown[] }
  })
}
