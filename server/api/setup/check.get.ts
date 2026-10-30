import { defineHandler } from "h3"
import type { SetupCheck } from "#shared/api"
import { refuseDemoPerson } from "../../demo/mode"
import { requireMember } from "../../utils/identity"
import { setupCheck } from "../../utils/setup-check"

/** Where the setup guide's steps stand (docs/1.guides/0.setup.md). The demo has nothing to set up. */
export default defineHandler(async (event): Promise<SetupCheck> => {
  const who = await requireMember(event)
  refuseDemoPerson(who)
  return setupCheck(event, who)
})
