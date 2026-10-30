import { eq } from "drizzle-orm"
import { isLocale, type Locale } from "../../shared/locale"
import { translator } from "./translate"
import { db } from "vite-hub/database/drizzle"
import { DEFAULT_CATEGORIES } from "#shared/categories"
import { category, householdSettings, member, organization, rule, user } from "../databases/config"

const id = () => crypto.randomUUID()

/** A new household with its owner, settings, and the default categories and rules. Runs once per sign-up. */
export async function createHousehold(person: { id: string; name: string }) {
  const [saved] = await db.select({ language: user.language }).from(user).where(eq(user.id, person.id)).limit(1)
  const language = isLocale(saved?.language) ? saved.language : "en"
  const t = await translator(language)
  const householdId = id()
  const first = person.name.trim().split(/\s+/)[0] || t("householdNameFallback")
  await db.insert(organization).values({
    id: householdId,
    name: t("householdName", { name: first }),
    slug: `household-${householdId.slice(0, 8)}`,
  })
  await db.insert(member).values({ id: id(), organizationId: householdId, userId: person.id, role: "owner" })
  await db.insert(householdSettings).values({ householdId })
  await seedCategories(householdId, language)
  return householdId
}

async function seedCategories(householdId: string, language: Locale = "en") {
  const t = await translator(language)
  const rows = DEFAULT_CATEGORIES.map((entry) => ({ ...entry, name: t(`category${entry.name.replace(/[^a-zA-Z]/g, "")}`), id: id(), householdId }))
  // D1 caps bound parameters per statement, so insert in small batches.
  for (let index = 0; index < rows.length; index += 10) {
    await db.insert(category).values(
      rows.slice(index, index + 10).map(({ id, householdId, name, kind, icon, color }) => ({ id, householdId, name, kind, icon, color })),
    )
  }
  const rules = rows.flatMap((row) => (row.match ?? []).map((match) => ({ id: id(), householdId, match, categoryId: row.id })))
  for (let index = 0; index < rules.length; index += 20) await db.insert(rule).values(rules.slice(index, index + 20))
}
