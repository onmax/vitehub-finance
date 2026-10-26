import { defineHandler } from "h3"
import { useServerEnv } from "#vitehub/env/server"
import type { LegalInfo } from "#shared/api"
import { aiAvailable } from "../utils/ai-categorize"

/**
 * Public, for /privacy: the instance's contact address (`FINANCE_CONTACT_EMAIL`), if its operator set one, and whether
 * it uses AI categories.
 */
export default defineHandler((): LegalInfo => {
  const email = useServerEnv().finance.contactEmail?.trim()
  return { contactEmail: email || null, ai: aiAvailable() }
})
