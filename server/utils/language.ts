import { eq } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { user } from "../databases/config"
import { isLocale, preferredLocale, type Locale } from "../../shared/locale"

export function requestLanguage(headers?: Headers): Locale {
  const explicit = headers?.get("X-Finance-Language")
  if (isLocale(explicit)) return explicit
  const accepted = (headers?.get("Accept-Language") ?? "").split(",").map((part) => {
    const [language = "", weight] = part.trim().split(";")
    return { language, weight: weight ? Number(weight.replace(/^q=/, "")) : 1 }
  }).filter((part) => part.weight > 0).sort((a, b) => b.weight - a.weight)
  return preferredLocale(accepted.map((part) => part.language))
}

export async function emailLanguage(email: string, fallback: Locale = "en"): Promise<Locale> {
  const [person] = await db.select({ language: user.language }).from(user).where(eq(user.email, email.toLowerCase())).limit(1)
  return isLocale(person?.language) ? person.language : fallback
}
