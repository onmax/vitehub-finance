import { defineHandler } from "h3"
import type { ConnectionSummary } from "#shared/api"
import { listConnections } from "../../utils/connections"
import { requireMember } from "../../utils/identity"

/** The caller's connections, and other members' that feed an account shared with the household. */
export default defineHandler(async (event): Promise<ConnectionSummary[]> => listConnections(await requireMember(event)))
