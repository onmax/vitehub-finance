import { describe, expect, it } from "vitest"
import { splitHouseholds } from "../../server/utils/erase-core"

// The demo's nightly reset and account deletion erase only households whose every member is being erased.
describe("splitHouseholds", () => {
  const memberships = [
    { organizationId: "demo", userId: "lucia" },
    { organizationId: "demo", userId: "pablo" },
    { organizationId: "ana-home", userId: "ana" },
    { organizationId: "shared", userId: "ana" },
    { organizationId: "shared", userId: "ben" },
  ]

  it("erases the demo household and nobody else's", () => {
    expect(splitHouseholds(memberships, new Set(["lucia", "pablo"]))).toEqual({ alone: ["demo"], shared: [] })
  })

  it("never selects a household that has someone else in it", () => {
    const visitorInDemo = [...memberships, { organizationId: "demo", userId: "stranger" }]
    expect(splitHouseholds(visitorInDemo, new Set(["lucia", "pablo"]))).toEqual({ alone: [], shared: ["demo"] })
  })

  it("separates a person's own household from the ones they share", () => {
    expect(splitHouseholds(memberships, new Set(["ana"]))).toEqual({ alone: ["ana-home"], shared: ["shared"] })
  })

  it("selects nothing for people with no household", () => {
    expect(splitHouseholds(memberships, new Set(["nobody"]))).toEqual({ alone: [], shared: [] })
  })
})
