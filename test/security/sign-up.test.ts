import { db } from "vite-hub/database/drizzle"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { invitation, organization, user } from "../../server/databases/config"
import { signUpRefusal } from "../../server/utils/sign-up"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("./sqlite")).memoryDatabase() }))

// A build without Email can't prove an address is the signer's: only the first person and invitees sign up by password.
const allowed = "maxi@example.com, partner@example.com"
const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

async function ownerWithInvitation(email: string, expiresAt = inAWeek()) {
  await db.insert(user).values({ id: "maxi", name: "Maxi", email: "maxi@example.com" })
  await db.insert(organization).values({ id: "home", name: "Home", slug: "home" })
  await db.insert(invitation).values({ id: "inv1", organizationId: "home", email, inviterId: "maxi", status: "pending", expiresAt })
}

beforeEach(async () => {
  for (const table of [invitation, organization, user]) await db.delete(table)
})

describe("password sign-up without Email", () => {
  it("lets the instance's first person in when the allowlist names them", async () => {
    expect(await signUpRefusal({ email: "Maxi@example.com" }, allowed)).toBeNull()
    expect(await signUpRefusal({ email: "stranger@example.com" }, allowed)).toMatchObject({ code: "SIGN_UP_NEEDS_INVITATION" })
  })

  it("refuses an allowed email once someone has signed up, so nobody claims it before its owner", async () => {
    await ownerWithInvitation("partner@example.com")
    expect(await signUpRefusal({ email: "partner@example.com" }, allowed)).toMatchObject({ code: "SIGN_UP_NEEDS_INVITATION" })
  })

  it("takes the invitation link for that exact email", async () => {
    await ownerWithInvitation("partner@example.com")
    expect(await signUpRefusal({ email: "Partner@Example.com", invitationId: "inv1" }, allowed)).toBeNull()
  })

  it("refuses an invitation for another email, an unknown one, or one that expired", async () => {
    await ownerWithInvitation("partner@example.com")
    expect(await signUpRefusal({ email: "attacker@example.com", invitationId: "inv1" }, allowed)).toMatchObject({ code: "SIGN_UP_WRONG_INVITATION" })
    expect(await signUpRefusal({ email: "partner@example.com", invitationId: "guess" }, allowed)).toMatchObject({ code: "SIGN_UP_WRONG_INVITATION" })
    await db.update(invitation).set({ expiresAt: new Date(Date.now() - 1000) })
    expect(await signUpRefusal({ email: "partner@example.com", invitationId: "inv1" }, allowed)).toMatchObject({ code: "SIGN_UP_WRONG_INVITATION" })
  })
})
