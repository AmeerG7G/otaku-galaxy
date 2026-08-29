/** سبب منح النقاط — يطابق قيد `points_ledger.reason` في القاعدة. */
export type PointsReason =
  | 'order_received'
  | 'review_approved'
  | 'review_with_photo'
  | 'manual'

/** حركة واحدة في دفتر النقاط، بالمبلغ الذي سُجّل لحظة وقوعها. */
export interface PointsLedgerEntry {
  id: string
  label: string
  amount: number
  reason: PointsReason
  orderId: string | null
  reviewId: string | null
  createdAt: string
}

export interface CustomerPoints {
  customer: {
    id: string
    username: string
    phone: string
    isActive: boolean
    createdAt: string
  }
  balance: number
  ledger: PointsLedgerEntry[]
}

export interface PointsByReason {
  reason: PointsReason
  entries: number
  total: number
}

export interface PointsTopBalance {
  userId: string
  username: string
  phone: string
  balance: number
  entries: number
}

export interface PointsSummary {
  totalInCirculation: number
  totalAwarded: number
  totalRevoked: number
  ledgerEntries: number
  customersWithPoints: number
  byReason: PointsByReason[]
  topBalances: PointsTopBalance[]
}
