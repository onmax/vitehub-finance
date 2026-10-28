import { defineHandler } from "h3"
import type { ConnectionSummary } from "#shared/api"
import { scopeOf } from "../../utils/access"
import { listConnections } from "../../utils/connections"
import { requireMember } from "../../utils/identity"

/** The caller's connections; with `?scope=household`, also other members' that feed an account shared with the household. */
export default defineHandler(async (event): Promise<ConnectionSummary[]> => listConnections(await requireMember(event), { scope: scopeOf(event) }))
