import { defineHandler } from "h3"
import { useServerEnv } from "#vitehub/env/server"
import type { LegalInfo } from "#shared/api"

/** Public, for /privacy: the instance's contact address (`FINANCE_CONTACT_EMAIL`), if its operator set one. */
export default defineHandler((): LegalInfo => {
  const email = useServerEnv().finance.contactEmail?.trim()
  return { contactEmail: email || null }
})
