import { daysInMonth, monthOf, shiftMonth } from "./dates"

export interface MonthlyBudgetPlan {
  effectiveMonth: string
  amountMinor: number
  carryEnabled: boolean
}

export function activeBudgetPlan(versions: MonthlyBudgetPlan[], month: string) {
  let active: MonthlyBudgetPlan | undefined
  let carryStartMonth: string | null = null
  for (const version of versions) {
    if (version.effectiveMonth > month) break
    if (!version.carryEnabled) carryStartMonth = null
    else if (!active?.carryEnabled) carryStartMonth = version.effectiveMonth
    active = version
  }
  return active ? { ...active, carryStartMonth } : null
}

/** Only unused money carries. Turning carry off resets it; enabling it starts at zero. */
export function budgetMonth(versions: MonthlyBudgetPlan[], month: string, spending: Map<string, number>, today: string) {
  const plan = activeBudgetPlan(versions, month)
  if (!plan) return null
  let carriedMinor = 0
  if (plan.carryStartMonth) {
    let index = 0
    for (let previous = plan.carryStartMonth; previous < month; previous = shiftMonth(previous, 1)) {
      while (versions[index + 1] && versions[index + 1]!.effectiveMonth <= previous) index++
      const version = versions[index]
      if (version) carriedMinor = Math.max(0, carriedMinor + version.amountMinor - (spending.get(previous) ?? 0))
    }
  }
  const spentMinor = spending.get(month) ?? 0
  const availableMinor = plan.amountMinor + carriedMinor
  const current = month === monthOf(today)
  const elapsed = Number(today.slice(8))
  return {
    ...plan,
    carriedMinor,
    availableMinor,
    spentMinor,
    expectedSpendMinor: current ? Math.round(availableMinor * elapsed / daysInMonth(month)) : null,
    projectedSpendMinor: current ? Math.round(spentMinor * daysInMonth(month) / elapsed) : null,
  }
}

/** Three recent completed calendar months, excluding a partial first month and months without recorded activity. */
export function suggestionMonths(beforeMonth: string, firstDate: string | null, activity: Set<string>) {
  if (!firstDate) return []
  const months: string[] = []
  for (let offset = -3; offset < 0; offset++) {
    const month = shiftMonth(beforeMonth, offset)
    if (firstDate <= `${month}-01` && activity.has(month)) months.push(month)
  }
  return months
}
