import { describe, expect, it } from "vitest"
import { decodeCursor, encodeCursor } from "../../server/utils/cursor"
import { carryForward } from "../../server/utils/series"

describe("cursor", () => {
  it("round-trips date and id, URL-safe", () => {
    const cursor = { date: "2026-10-05", id: "e77234a5-463f-4f48-b611-1de02a9c8613" }
    const encoded = encodeCursor(cursor)
    expect(encoded).toMatch(/^[\w-]+$/)
    expect(decodeCursor(encoded)).toEqual(cursor)
  })

  it("rejects what this server didn't make", () => {
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor("")).toBeNull()
    expect(decodeCursor("%%%")).toBeNull()
    expect(decodeCursor(btoa("2026-13-45|abc"))).toBeNull()
    expect(decodeCursor(btoa("2026-10-05|a' or 1=1"))).toBeNull()
    expect(decodeCursor(btoa("no separator"))).toBeNull()
  })
})

describe("carryForward", () => {
  it("carries the last balance over days without a snapshot", () => {
    const days = carryForward([{ date: "2026-10-02", balanceMinor: 500 }, { date: "2026-10-04", balanceMinor: 700 }], "2026-10-01", "2026-10-05", 100)
    expect(days.map((day) => day.value)).toEqual([100, 500, 500, 700, 700])
    expect(carryForward([{ date: "2026-10-03", balanceMinor: 5 }], "2026-10-02", "2026-10-03")[0]!.value).toBeNull()
  })
})
