import { defineHandler } from "h3"
import type { Overview } from "#shared/api"
import { scopeOf } from "../utils/access"
import { requireMember } from "../utils/identity"
import { overview } from "../utils/overview"

export default defineHandler(async (event): Promise<Overview> => overview(await requireMember(event), scopeOf(event)))
