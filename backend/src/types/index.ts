/** أنواع مشتركة للـ API (يُعتمد عليها في التحكم والتطبيقات الزبونة). */

import type { AppLocale } from '../utils/locale.js';

export type Role = 'customer' | 'admin';

/**
 * جنس صاحب الحساب — لتصريف الخطاب العربي لا لأي منطق تجاري.
 *
 * `null` حالةٌ مشروعة دائمة: الحسابات التي أُنشئت قبل هذا الحقل لم تُسأل،
 * ولا يجوز أن يُخمَّن لها شيء. طبقةُ العرض تخاطبها بصيغة محايدة.
 */
export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export type OrderStatus =
  | 'PENDING_ADMIN_CONFIRMATION'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'REJECTED';

/**
 * انتقالات الحالة المسموح بها (المفتاح → الحالات المقبولة).
 *
 * [CRITICAL] `CONFIRMED` و`PREPARING` لم تعودا مرحلةً تشغيلية يمرّ بها طلب جديد.
 *
 * الدمج الأول: ضغطتا «تأكيد» ثم «بدء التجهيز» كانتا لا تنتجان شيئاً، فصار
 * التأكيد ينقل مباشرةً إلى التجهيز.
 * الدمج الثاني: «قيد التجهيز» هي النشاط الذي يقوله المسؤول بالضربة نفسها —
 * القبول ثم بدء العمل فعلان في نفس اللحظة عند كل متجر فعلي. لذلك صار القبول
 * ينقل الطلب مباشرةً إلى `OUT_FOR_DELIVERY`؛ تُثبَّت نافذة التقييم ويرسل
 * إشعار القبول في نفس الانتقال.
 *
 * الحالتان تبقَيان قيمتين مشروعتين في القاعدة ولهما انتقالهما الخارج، لأن
 * طلبات سابقة توقّفت عندهما فعلاً؛ حذفهما كان سيترك صفوفاً في حالة لا
 * تعرفها آلة الحالات ولا سبيل لتحريكها. ولا مسار جديد ينتجهما بعد اليوم.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // القبول يرسل للتوضيب مباشرةً — لا مرحلة «قيد التجهيز» منفصلة في الواجهة.
  PENDING_ADMIN_CONFIRMATION: ['OUT_FOR_DELIVERY', 'REJECTED'],
  CONFIRMED: ['PREPARING', 'REJECTED'],
  PREPARING: ['OUT_FOR_DELIVERY', 'REJECTED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};

/**
 * الحالات التي يمرّ بها طلبٌ جديد اليوم — ما تعرضه لوحة التحكم كمراحل.
 *
 * تُقصي `CONFIRMED` و`PREPARING` (مرحلتان موروثتان) و`REJECTED` (نهاية لا
 * مرحلة). القبول اليوم يغادر الانتظار إلى التوصيل مباشرةً.
 */
export const ACTIVE_ORDER_STAGES = [
  'PENDING_ADMIN_CONFIRMATION',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
] as const satisfies readonly OrderStatus[];

export interface AuthUser {
  id: string;
  role: Role;
  phone: string;
  /** لغة المخاطبة المختارة — تقودها `resolveLocale` والإشعارات. */
  locale: AppLocale;
}

/** بيانات المستخدم المكشوفة في الردود (بلا password_hash). */
export interface PublicUser {
  id: string;
  username: string;
  phone: string;
  avatarUrl: string | null;
  role: Role;
  /** `null` لمن لم يُسأل بعد — لا افتراض. */
  gender: Gender | null;
  /** هل أثبت المستخدم ملكية رقمه؟ التطبيق يوجّه غير المحقَّق لشاشة الرمز. */
  isPhoneVerified: boolean;
  /**
   * لغة المخاطبة المختارة — يقرؤها التطبيق عند الدخول ليوافق حالته المحلية.
   *
   * بدونها كان جهازٌ ثانٍ لنفس الحساب يبدأ بالعربية بينما إشعاراته تصل
   * بالكردية: التفضيل على الخادم والحالة المحلية مصدران لا يلتقيان.
   */
  preferredLanguage: AppLocale;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/** صف قاعدة البيانات categories (أسماء الأعمدة كما في SQL). */
export type CategoryRow = {
  id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type SubcategoryRow = {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type ProductOptionRow = {
  id: string;
  product_id: string;
  name: string;
  values: string[];
  created_at: Date;
  updated_at: Date;
};

/** صف قاعدة البيانات products (أسماء الأعمدة كما في SQL). */
export type ProductRow = {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  name: string;
  description: string;
  /**
   * النسخة الكردية — `null` تعني «ناقصة» (منتج قديم؛ هجرة ٠٤٦). لا فراغ أبداً:
   * الهجرة ٠٦٦ تمنع النصّ الفارغ في العمودين، فـ`null` هي صورة النقص الوحيدة.
   * `name`/`description` هما **العربية** (انظر تعليقات الأعمدة في ٠٦٦).
   */
  name_ckb: string | null;
  description_ckb: string | null;
  price: string | number;
  stock: number;
  is_active: boolean;
  is_offer: boolean;
  is_selected: boolean;
  offer_rank: number | null;
  selected_rank: number | null;
  rating: string | number | null;
  review_count: number;
  /** السعر قبل الخصم — مصدر شارة «‎−٪‎» والسعر المشطوب. */
  previous_price: string | number | null;
  has_delivery_promo: boolean;
  delivery_promo_amount: string | number;
  /** موعد التوفر القادم الذي يحدده المسؤول — معلومة إرشادية لا تغيّر المخزون. */
  restock_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

/** أين يظهر البنر في الرئيسية. */
export const BANNER_PLACEMENTS = ['hero', 'promo'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const BANNER_DESTINATIONS = [
  'product',
  'category',
  'subcategory',
  'anime',
  'none',
] as const;
export type BannerDestination = (typeof BANNER_DESTINATIONS)[number];

export type BannerRow = {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string;
  placement: BannerPlacement;
  destination_type: BannerDestination;
  destination_value: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type GovernorateRow = {
  id: string;
  name: string;
  name_ckb: string | null;
  delivery_fee: string | number;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

export type CartItemRow = {
  id: string;
  cart_id: string;
  product_id: string;
  option_value: string | null;
  quantity: number;
  created_at: Date;
  updated_at: Date;
};

/** صف قاعدة البيانات orders (أسماء الأعمدة كما في SQL). */
export type OrderRow = {
  id: string;
  number: string;
  user_id: string;
  status: OrderStatus;
  governorate_name: string;
  delivery_fee: string | number;
  full_address: string;
  phone: string;
  notes: string | null;
  items_total: string | number;
  total: string | number;
  created_at: Date;
  updated_at: Date;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  /** لقطة الاسم العربي وقت الطلب. */
  product_name: string;
  /** لقطة الاسم الكردي وقت الطلب؛ `null` = لم تكن للمنتج كردية حينها (٠٦٦). */
  product_name_ckb: string | null;
  image_url: string | null;
  option_value: string | null;
  price: string | number;
  quantity: number;
  line_total: string | number;
  created_at: Date;
  updated_at: Date;
};

// ═══════════════ التقييمات ═══════════════

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const satisfies
  readonly ReviewStatus[];

export type ReviewRow = {
  id: string;
  user_id: string;
  order_id: string;
  product_id: string | null;
  /** لقطة الاسم العربي — من لقطة سطر الطلب. */
  product_name: string;
  /** لقطة الاسم الكردي — من لقطة سطر الطلب؛ `null` = بلا كردية (٠٦٦). */
  product_name_ckb: string | null;
  rating: number;
  comment: string;
  /** من صفر إلى خمس صور — السقف تفرضه القاعدة لا الواجهة. */
  photo_urls: string[];
  status: ReviewStatus;
  rejection_reason: string | null;
  customer_name: string;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  /** يُملآن فقط في استعلام صور المجتمع (ربط بالمنتج والقسم). */
  category_id?: string | null;
  category_name?: string | null;
};

/** شكل التقييم كما يتوقعه تطبيق فلاتر (Review.fromJson). */
export interface ReviewDto {
  id: string;
  productId: string;
  /** لقطة الاسم العربي — الحقل القديم، باقٍ بمعناه لعملاءٍ أقدم. */
  productName: string;
  /** لقطة الاسم بالعربية صراحةً (= `productName`). */
  productNameAr: string;
  /** لقطة الاسم بالكردية؛ `null` = بلا كردية وقت الطلب. التطبيق يختار بلغة واجهته. */
  productNameCkb: string | null;
  orderId: string;
  rating: number;
  comment: string;
  /** صور التقييم بترتيب إضافتها (صفر إلى خمس). */
  photoUrls: string[];
  /**
   * أول صورة، أو `null`.
   *
   * حقلٌ مشتقّ للعرض لا مصدرٌ ثانٍ: شاشة المجتمع وبطاقةُ التقييم في اللوحة
   * تعرضان صورةً واحدة، فتقرآن هذا بدل أن يعرف كلٌّ منهما أن الأولى هي
   * المقصودة.
   */
  photoUrl: string | null;
  status: ReviewStatus;
  rejectionReason: string | null;
  customerName: string;
  createdAt: string;
  /** قسم المنتج — يُرسل في صور المجتمع فقط، ومفتاحُ الفلترة المستقر. */
  categoryId?: string | null;
  categoryName?: string | null;
}

// ═══════════════ نقاط المجرّة ═══════════════

export type PointsReason =
  | 'order_received'
  | 'review_approved'
  | 'review_with_photo'
  | 'manual';

/**
 * [NOTE] `POINTS_AWARDS` حُذف. مقادير المنح لم تعد إعداداً ولا ثابتاً هنا:
 * القواعد الثابتة كلها في `src/domain/galaxyPoints.ts` وهي مصدرها الوحيد.
 */

export type PointsLedgerRow = {
  id: string;
  user_id: string;
  label: string;
  amount: number;
  reason: PointsReason;
  order_id: string | null;
  review_id: string | null;
  created_at: Date | string;
};

/** شكل حركة النقاط كما يتوقعه تطبيق فلاتر (PointsActivity.fromJson). */
export interface PointsActivityDto {
  id: string;
  label: string;
  amount: number;
  occurredAt: string;
}

// ═══════════════ المجموعات ═══════════════

export type CollectionRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
};

/** شكل المجموعة كما يتوقعه تطبيق فلاتر (Collection.fromJson). */
export interface CollectionDto {
  id: string;
  name: string;
  productIds: string[];
}

// ═══════════════ الإشعارات ═══════════════

export type NotificationType =
  | 'orderAccepted'
  | 'orderRejected'
  | 'deliveryUpdate'
  | 'receiptReminder'
  | 'reviewApproved'
  | 'reviewRejected'
  | 'backInStock'
  | 'promotion'
  | 'rewardClaimed'
  | 'restockScheduled';

export const NOTIFICATION_TYPES = [
  'orderAccepted',
  'orderRejected',
  'deliveryUpdate',
  'receiptReminder',
  'reviewApproved',
  'reviewRejected',
  'backInStock',
  'promotion',
  'rewardClaimed',
  'restockScheduled',
] as const satisfies readonly NotificationType[];

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  order_id: string | null;
  review_id: string | null;
  product_id: string | null;
  read_at: Date | string | null;
  created_at: Date | string;
};

/** شكل الإشعار كما يتوقعه تطبيق فلاتر (AppNotification.fromJson). */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  /** وجهة الإشعار — يفتحها التطبيق عند الضغط عليه. */
  orderId: string | null;
  reviewId: string | null;
  productId: string | null;
}

// ═══════════════ الامتيازات (الأنمي) ═══════════════

export type FranchiseRow = {
  id: string;
  name: string;
  /** مرادفات الاسم — يطابقها البحث. فارغة لا `null` (القيد NOT NULL). */
  alt_names: string[];
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

// ═══════════════ مناطق التوصيل ═══════════════

export type GovernorateZoneRow = {
  id: string;
  governorate_id: string;
  name: string;
  name_ckb: string | null;
  delivery_fee: string | number;
  sort_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

// ═══════════════ عيد الميلاد ═══════════════

/** حالة عيد الميلاد كما تتوقعها واجهة فلاتر (BirthdayStorage). */
export interface BirthdayStatusDto {
  /** يصبح true بعد استلام العميل أول طلب. */
  unlocked: boolean;
  day: number | null;
  month: number | null;
  hasBirthday: boolean;
  isBirthdayToday: boolean;
  /** الخصم متاح: يوم الميلاد + لم يُستهلك هذه السنة. */
  rewardAvailable: boolean;
  /** نسبة الخصم المطبّقة يوم الميلاد. */
  discountPercent: number;
}

/**
 * [NOTE] `BIRTHDAY_DISCOUNT_PERCENT` انتقل إلى `src/domain/birthday.ts`.
 * النسبة قاعدة تجارية ثابتة، ومكانها طبقةُ القواعد لا ملفُّ أنواع الـAPI.
 */

// ═══════════════ الوسائط ═══════════════

export type MediaPurpose =
  | 'product'
  | 'review'
  | 'avatar'
  | 'banner'
  | 'franchise'
  | 'category'
  // صفوفٌ تاريخية من ميزة «رسوم الشخصيات» المحذوفة (الهجرة 065) — تُقرأ ولا
  // تُرفع بعد اليوم (ليست في [MEDIA_PURPOSES]).
  | 'slot';

export const MEDIA_PURPOSES = [
  'product',
  'review',
  'avatar',
  'banner',
  'franchise',
  'category',
] as const satisfies readonly MediaPurpose[];

/**
 * الأغراض التي يقبلها قيد القاعدة `media_files_purpose_check` — ما يُرفع
 * اليوم **وما رُفع سابقاً**.
 *
 * `slot` ليس غرض رفعٍ منذ الهجرة 065 (أُزيلت «رسوم الشخصيات»)، لكن صفوفه
 * التاريخية ما زالت في الجدول ويجب أن تبقى صالحةً للقيد؛ إسقاطه من القيد
 * يستلزم حذفها أو تزوير غرضها. الفرق بين القائمتين مقصود ومحروس
 * (`api-contract-audit.test.ts`).
 */
export const STORED_MEDIA_PURPOSES = [
  ...MEDIA_PURPOSES,
  'slot',
] as const satisfies readonly MediaPurpose[];

// ═══════════════ ترتيب المنتجات ═══════════════

/**
 * خيارات ترتيب قوائم المنتجات.
 *
 * قائمة مغلقة عمداً: تُترجَم إلى `ORDER BY` عبر خريطة ثابتة على الخادم،
 * فلا يصل أي نص من العميل إلى جملة SQL.
 */
export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'rating';

export const PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'rating',
] as const satisfies readonly ProductSort[];
