export interface TransactionSplit {
  categoryId: string | null
  amountMinor: number
}

export interface TransactionReviewState {
  reviewedAt: string | null
  reviewedBy: string | null
  assignedTo: string | null
  splits: TransactionSplit[]
  reimbursementOf: string | null
  revision: string
}

export interface TransactionBulkResult {
  items: import("./api").Transaction[]
  undoToken: string
}
