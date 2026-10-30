// Who may see and change an account. The server's SQL (server/utils/access.ts) and the UI follow these same rules.

export type Scope = "me" | "household"

interface AccountAccess {
  ownerId: string
  visibility: "private" | "household"
  householdPermission: "view" | "edit"
}

export const canView = (account: AccountAccess, userId: string) =>
  account.ownerId === userId || account.visibility === "household"

/** Categorize, add notes, rename. Only the owner changes who sees an account or deletes it. */
export const canEdit = (account: AccountAccess, userId: string) =>
  account.ownerId === userId || (account.visibility === "household" && account.householdPermission === "edit")

export const canManage = (account: AccountAccess, userId: string) => account.ownerId === userId

/** A hidden transaction stays with its account's owner: nobody else sees it, in any list or total. */
export const canSeeTransaction = (account: AccountAccess, transaction: { hidden: boolean }, userId: string) =>
  canView(account, userId) && (!transaction.hidden || account.ownerId === userId)

/** Only the account's owner hides one of its transactions or shows it again. */
export const canHide = canManage
