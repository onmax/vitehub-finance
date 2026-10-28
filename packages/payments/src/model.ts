export interface PaymentBalance {
  currency: string
  availableMinor: number
  pendingMinor: number
}

export interface PaymentMovement {
  id: string
  created: number
  currency: string
  grossMinor: number
  feeMinor: number
  netMinor: number
  status: "pending" | "available"
  availableOn: number
  type: string
  reportingCategory: string
  sourceId: string | null
}

export interface PaymentRead {
  balances: PaymentBalance[]
  movements: PaymentMovement[]
}
