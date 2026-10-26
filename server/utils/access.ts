import { and, eq, inArray, or, type SQL } from "drizzle-orm"
import { type H3Event, HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import { financialAccount } from "../databases/config"
import { canEdit, canView, type AccountAccess, type Scope } from "#shared/access"
import type { Member } from "./identity"

export type { Scope }

/** `?scope=me` limits a view to the caller's own accounts; anything else is the household view. */
export function scopeOf(event: H3Event): Scope {
  return event.url.searchParams.get("scope") === "me" ? "me" : "household"
}

/**
 * The accounts someone may see: their own, plus the ones another member shared with the household. A private account
 * never leaves its owner, in any view, list, total, MCP tool, or API response. Every query that reads accounts or their
 * transactions goes through this condition or `visibleAccountIds`.
 */
export function visibleAccounts(who: Pick<Member, "userId" | "householdId">, scope: Scope = "household"): SQL {
  const mine = eq(financialAccount.ownerId, who.userId)
  return and(
    eq(financialAccount.householdId, who.householdId),
    scope === "me" ? mine : or(mine, eq(financialAccount.visibility, "household")),
  )!
}

export async function visibleAccountIds(who: Pick<Member, "userId" | "householdId">, scope: Scope = "household") {
  const rows = await db.select({ id: financialAccount.id }).from(financialAccount).where(visibleAccounts(who, scope))
  return rows.map((row) => row.id)
}

/** One account the caller may see (or edit), or a 404 that doesn't reveal whether it exists. */
export async function requireAccount(who: Member, accountId: string, need: "view" | "edit" = "view") {
  const [row] = await db
    .select()
    .from(financialAccount)
    .where(and(eq(financialAccount.id, accountId), eq(financialAccount.householdId, who.householdId)))
    .limit(1)
  const access = row as AccountAccess | undefined
  if (!row || !access || !canView(access, who.userId) || (need === "edit" && !canEdit(access, who.userId)))
    throw new HTTPError({ status: 404, statusText: "No such account." })
  return row
}

/** Restricts a list of account ids to the visible ones (for filters that arrive from the client). */
export async function onlyVisible(who: Member, ids: string[], scope: Scope = "household") {
  if (!ids.length) return []
  const rows = await db
    .select({ id: financialAccount.id })
    .from(financialAccount)
    .where(and(visibleAccounts(who, scope), inArray(financialAccount.id, ids)))
  return rows.map((row) => row.id)
}
