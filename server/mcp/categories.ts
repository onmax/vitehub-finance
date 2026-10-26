import { eq } from "drizzle-orm"
import { HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import { category } from "../databases/config"
import type { Member } from "../utils/identity"

export async function categoryNames(who: Member) {
  const rows = await db.select({ id: category.id, name: category.name }).from(category).where(eq(category.householdId, who.householdId))
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** Agents may name a category instead of passing its id; "none" stays as the uncategorized filter. */
export async function resolveCategory(who: Member, ref: string, names?: Map<string, string>) {
  if (ref === "none") return ref
  const known = names ?? (await categoryNames(who))
  if (known.has(ref)) return ref
  const wanted = ref.trim().toLowerCase()
  for (const [id, name] of known) if (name.toLowerCase() === wanted) return id
  throw new HTTPError({
    status: 400,
    message: `No category "${ref}". Categories: ${[...known.values()].sort().join(", ")}.`,
  })
}
