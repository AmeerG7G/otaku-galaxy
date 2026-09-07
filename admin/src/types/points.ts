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

// ── قواعد نقاط المجرّة (قراءة فقط) ──
//
// [NOTE] حُذفت `LoyaltyLevel*` بأنواع الإنشاء والتعديل. كان السلّم بيانات
// يبنيها المسؤول؛ صار قاعدة تجارية ثابتة في الخادم
// (`src/domain/galaxyPoints.ts`) ولا واجهة تعدّلها. ما بقي هنا للعرض فقط.

export type GalaxyRewardKind = 'none' | 'discount' | 'gift'

export interface GalaxyLevelRule {
  key: string
  number: number
  requiredPoints: number
  /** صيغتا الاسم العربيتان + صيغة محايدة — يختار التطبيق بينها بجنس القارئ. */
  nameMale: string
  nameFemale: string
  nameNeutral: string
  rewardKind: GalaxyRewardKind
  rewardLabel: string
  percent?: number
  capAmount?: number
  giftAmount?: number
}

export interface GalaxyPointsRules {
  levels: GalaxyLevelRule[]
  purchase: {
    stepIqd: number
    pointsPerStep: number
  }
  review: {
    commentPoints: number
    photosPoints: number
    maxPhotos: number
    capPerOrder: number
  }
}

// ── مطالبات الهدايا ──

/**
 * هدية طالب بها زبون بلغ عتبتها.
 *
 * `fulfilledAt` يبقى `null` حتى يعلّمها المسؤول مسلَّمة — المطالبة وحدها
 * ليست تسليماً. ولا انتهاء صلاحية تلقائياً: مطالبةٌ لم تُسلَّم تبقى ديناً
 * على المتجر لا يسقط بالتقادم.
 */
export interface GiftClaim {
  id: string
  userId: string
  username: string
  phone: string
  levelKey: string
  levelName: string
  kind: 'gift'
  giftAmount: number | null
  claimedAt: string
  fulfilledAt: string | null
  fulfilledByName: string | null
}

export interface GiftClaimsPage {
  items: GiftClaim[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}
