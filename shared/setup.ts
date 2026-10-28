export interface SetupStatus {
  dismissed: boolean
  sharingReviewed: boolean
  recurringReviewed: boolean
  forecastReviewed: boolean
  accountCount: number
  transactionCount: number
  needsReview: number
  assignedToMe: number
  planCount: number
  month: string
  checkins: Array<{ userId: string; name: string; complete: boolean }>
}
