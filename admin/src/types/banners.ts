export type BannerDestinationType =
  | 'product'
  | 'category'
  | 'subcategory'
  | 'anime'
  | 'none'

/** أين يظهر البنر في الرئيسية. */
export type BannerPlacement = 'hero' | 'promo'

export const PLACEMENT_LABELS: Record<BannerPlacement, string> = {
  hero: 'اللوحة الكبيرة',
  promo: 'الشريط الترويجي',
}

export const PLACEMENT_HINTS: Record<BannerPlacement, string> = {
  hero: 'أعلى الرئيسية. تُعرض واحدة فقط — الأولى ترتيباً بين البنرات المفعّلة.',
  promo: 'الشريط الأفقي تحت اللوحة الكبيرة. عدد مفتوح، والترتيب يحدّده «الترتيب».',
}

export interface AdminBanner {
  id: string
  imageUrl: string
  title: string | null
  subtitle: string
  placement: BannerPlacement
  destinationType: BannerDestinationType
  destinationValue: string | null
  sortOrder: number
  isActive: boolean
}

export interface AdminBannerListResponse {
  items: AdminBanner[]
}

export interface BannerCreatePayload {
  subtitle?: string
  placement?: BannerPlacement
  imageUrl: string
  title?: string | null
  destinationType?: BannerDestinationType
  destinationValue?: string | null
  sortOrder?: number
}

export interface BannerUpdatePayload {
  subtitle?: string
  placement?: BannerPlacement
  imageUrl?: string
  title?: string | null
  destinationType?: BannerDestinationType
  destinationValue?: string | null
  sortOrder?: number
  /** الخادم يقبلها في PATCH — كانت الشاشة تفترض خطأً أنه لا يقبلها. */
  isActive?: boolean
}

export interface BannerAdminRow {
  id: string
  image_url: string
  title: string | null
  destination_type: BannerDestinationType
  destination_value: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}