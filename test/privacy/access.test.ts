import { describe, expect, it } from "vitest"
import { canEdit, canHide, canSeeTransaction, type AccountAccess } from "../../shared/access"

const shared: AccountAccess = { ownerId: "lucia", visibility: "household", householdPermission: "edit" }
const personal: AccountAccess = { ...shared, visibility: "private" }

describe("hidden transactions", () => {
  it("are seen by the account's owner only, even on an account shared for editing", () => {
    expect(canSeeTransaction(shared, { hidden: true }, "lucia")).toBe(true)
    expect(canSeeTransaction(shared, { hidden: true }, "pablo")).toBe(false)
    expect(canSeeTransaction(shared, { hidden: false }, "pablo")).toBe(true)
  })

  it("never make a private account's rows visible", () => {
    expect(canSeeTransaction(personal, { hidden: false }, "pablo")).toBe(false)
    expect(canSeeTransaction(personal, { hidden: true }, "lucia")).toBe(true)
  })

  it("are hidden or shown again by the owner, not by a member who may edit the account", () => {
    expect(canEdit(shared, "pablo")).toBe(true)
    expect(canHide(shared, "pablo")).toBe(false)
    expect(canHide(shared, "lucia")).toBe(true)
  })
})
