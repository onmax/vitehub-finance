import type { Forecast, ForecastDay } from './api'
import type { ForecastScenario } from './forecast'

export interface PlannedEvent {
  id: string
  name: string
  accountId: string
  kind: 'income' | 'expense'
  amountMinor: number
  date: string
  cadence: 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  endDate: string | null
}

export type DailyAccountForecast = Pick<ForecastDay, 'date' | 'balanceMinor'>
export type PlanningForecast = Forecast & {
  accountDays: Record<string, DailyAccountForecast[]>
  accountFlows: Record<string, { variable: number; moved: number }>
  planning: {
    accounts: Array<{
      id: string
      name: string
      currency: string
      balanceUpdatedAt: string | null
      syncAt: string | null
      fx: 'same' | 'current' | 'stale' | 'missing'
    }>
    fxAt: string | null
    reconstructedHistory: boolean
    protectedGoals: Array<{ id: string; name: string; accountId: string; allocatedMinor: number; monthlyNeededMinor: number }>
    budgetMonthlyMinor: number | null
  }
}

export interface SavedForecastPlan {
  id: string
  name: string
  ownerId: string
  visibility: 'private' | 'household'
  scenario: ForecastScenario
  updatedAt: string
}
