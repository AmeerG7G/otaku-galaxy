/** أنماط التدوير المدعومة. `sequential`/`random` مؤجَّلان عمداً — انظر الوثائق. */
export const ROTATION_MODES = ['fixed', 'daily'] as const

export type RotationMode = (typeof ROTATION_MODES)[number]

export const ROTATION_LABELS: Record<RotationMode, string> = {
  fixed: 'ثابتة',
  daily: 'يومية',
}

export const ROTATION_HINTS: Record<RotationMode, string> = {
  fixed: 'تُعرض الصورة الأولى في الترتيب دائماً.',
  daily: 'تتبدّل الصورة كل يوم بتوقيت المتجر، بترتيب ثابت لا عشوائي.',
}

export interface VisualSlotImage {
  id: string
  url: string
  mediaId: string | null
  isActive: boolean
  sortOrder: number
}

export interface VisualSlot {
  id: string
  /** المفتاح الذي يعرفه كود التطبيق — لا يُترجم ولا يُعاد تسميته. */
  slotKey: string
  /** الاسم المعروض. */
  label: string
  /** أين يظهر هذا الرسم بالضبط داخل التطبيق. */
  location: string
  /** منطقة التطبيق — تُجمَّع بها الفتحات. */
  groupKey: string
  sortOrder: number
  isActive: boolean
  rotationMode: RotationMode
  images: VisualSlotImage[]
  /**
   * معرّف الصورة التي يخدمها الخادم الآن — يحسبها الخادم لا المتصفح.
   *
   * `null` إذا كانت الفتحة معطّلة أو بلا صورة نشطة، أي لا يصل الزبونَ منها
   * شيء ويعرض التطبيقُ الأصلَ المضمَّن.
   */
  currentImageId: string | null
}

/**
 * مجموعات العرض — مناطق التطبيق كما يعرفها صاحب المتجر.
 *
 * التجميع ليس ترتيباً بصرياً: قائمة مسطّحة بأربعين اسماً تجعل إيجاد «شخصية
 * السلة الفارغة» بحثاً في كل مرة. المجموعة تجيب عن السؤال الحقيقي — «أين
 * أغيّر رسم شاشة الدخول؟» — بلا أن يعرف المسؤول أي اسم ملف.
 */
export const GROUP_LABELS: Record<string, string> = {
  auth: 'المصادقة',
  home: 'الرئيسية',
  shopping: 'التسوّق',
  search: 'البحث',
  orders: 'الطلبات',
  rewards: 'المكافآت',
  community: 'المجتمع والتقييمات',
  collections: 'المجموعات',
  account: 'الحساب والإشعارات',
  onboarding: 'الترحيب والتخصيص',
  other: 'أخرى',
}

/** ترتيب المجموعات — يتبع رحلة الزبون لا الأبجدية. */
export const GROUP_ORDER = [
  'auth',
  'onboarding',
  'home',
  'shopping',
  'search',
  'orders',
  'rewards',
  'community',
  'collections',
  'account',
  'other',
]

export interface CreateSlotPayload {
  slotKey: string
  label?: string
  location?: string
  groupKey?: string
  rotationMode?: RotationMode
}

export interface UpdateSlotPayload {
  label?: string
  location?: string
  groupKey?: string
  isActive?: boolean
  rotationMode?: RotationMode
}
