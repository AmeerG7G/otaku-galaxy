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

/**
 * نصّ البنر بلغتيه (هجرة ٠٦٧) — أربعة حقول مستقلة يكتبها المسؤول بيده، لا
 * ترجمة آلية ولا نسخ بين اللغتين. كلٌّ اختياري: `null` = لا نصّ بهذه اللغة.
 */
export interface BannerContent {
  titleAr: string | null
  subtitleAr: string | null
  titleCkb: string | null
  subtitleCkb: string | null
}

export interface AdminBanner extends BannerContent {
  id: string
  imageUrl: string
  /** العنوان العربي كما في عموده — للعرض القديم فقط؛ الكتابة بالحقول الصريحة. */
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

/**
 * [CRITICAL] الكتابة بالحقول الصريحة وحدها: الخادم يرفض `title`/`subtitle`
 * منذ ٠٦٧. في التعديل، الحقل الغائب لا يُمسّ — فحفظ لغةٍ لا يلمس الأخرى.
 */
export interface BannerCreatePayload extends Partial<BannerContent> {
  placement?: BannerPlacement
  imageUrl: string
  destinationType?: BannerDestinationType
  destinationValue?: string | null
  sortOrder?: number
}

export interface BannerUpdatePayload extends Partial<BannerContent> {
  placement?: BannerPlacement
  imageUrl?: string
  destinationType?: BannerDestinationType
  destinationValue?: string | null
  sortOrder?: number
  /** الخادم يقبلها في PATCH — كانت الشاشة تفترض خطأً أنه لا يقبلها. */
  isActive?: boolean
}
