import { defineHandler } from "h3"
import { requireMember } from "../../../utils/identity"
import { param } from "../../../utils/input"
import { refundCandidates } from "../../../utils/transactions"

export default defineHandler(async (event) => refundCandidates(await requireMember(event), param(event)))
