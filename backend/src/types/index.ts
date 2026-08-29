/** أنواع مشتركة للـ API (يُعتمد عليها في التحكم والتطبيقات الزبونة). */

export type Role = 'customer' | 'admin';

export type OrderStatus =
  | 'PENDING_ADMIN_CONFIRMATION'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'REJECTED';

/** انتقالات الحالة المسموح بها (المفتاح → الحالات المقبولة). */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_ADMIN_CONFIRMATION: ['CONFIRMED', 'REJECTED'],
  CONFIRMED: ['PREPARING', 'REJECTED'],
  PREPARING: ['OUT_FOR_DELIVERY', 'REJECTED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};

export interface AuthUser {
  id: string;
  role: Role;
  phone: string;
}

/** بيانات المستخدم المكشوفة في الردود (بلا password_hash). */
export interface PublicUser {
  id: string;
  username: string;
  phone: string;
  avatarUrl: string | null;
  role: Role;
  /** هل أثبت المستخدم ملكية رقمه؟ التطبيق يوجّه غير المحقَّق لشاشة الرمز. */
  isPhoneVerified: boolean;
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
  created_at: Date | string;
  updated_at: Date | string;
};

export type BannerRow = {
  id: string;
  image_url: string;
  title: string | null;
  destination_type: 'product' | 'category' | 'subcategory' | 'none';
  destination_value: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type GovernorateRow = {
  id: string;
  name: string;
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
  product_name: string;
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
  product_name: string;
  rating: number;
  comment: string;
  photo_url: string | null;
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
  productName: string;
  orderId: string;
  rating: number;
  comment: string;
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

/** مقادير المنح — مصدر الحقيقة الوحيد لقيم النقاط. */
export const POINTS_AWARDS = {
  // مطابق لمصدر تصميم v2: استلام الطلب يمنح ٢٠ نقطة.
  orderReceived: 20,
  reviewApproved: 1,
  reviewWithPhoto: 5,
} as const;

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
  | 'promotion';

export const NOTIFICATION_TYPES = [
  'orderAccepted',
  'orderRejected',
  'deliveryUpdate',
  'receiptReminder',
  'reviewApproved',
  'reviewRejected',
  'backInStock',
  'promotion',
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

/** نسبة خصم عيد الميلاد — مصدر الحقيقة على الخادم. */
export const BIRTHDAY_DISCOUNT_PERCENT = 5;

// ═══════════════ الوسائط ═══════════════

export type MediaPurpose =
  | 'product'
  | 'review'
  | 'avatar'
  | 'banner'
  | 'franchise'
  | 'category';

export const MEDIA_PURPOSES = [
  'product',
  'review',
  'avatar',
  'banner',
  'franchise',
  'category',
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
