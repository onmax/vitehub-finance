/**
 * Which households erasing `people` may delete: `alone`, the ones whose every member is one of them. A household with
 * anyone else in it is `shared` and never erased; their own rows in it stay with it.
 */
export function splitHouseholds(memberships: Array<{ organizationId: string; userId: string }>, people: ReadonlySet<string>) {
  const theirs = [...new Set(memberships.filter((row) => people.has(row.userId)).map((row) => row.organizationId))]
  const isAlone = (household: string) =>
    memberships.filter((row) => row.organizationId === household).every((row) => people.has(row.userId))
  return { alone: theirs.filter(isAlone), shared: theirs.filter((household) => !isAlone(household)) }
}
