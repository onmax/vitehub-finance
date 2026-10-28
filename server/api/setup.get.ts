import { defineHandler } from "h3"
import { scopeOf } from "../utils/access"
import { requireMember } from "../utils/identity"
import { setupStatus } from "../utils/setup"
export default defineHandler(async event => setupStatus(await requireMember(event), scopeOf(event)))
