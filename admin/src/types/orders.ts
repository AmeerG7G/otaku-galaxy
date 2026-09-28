export type OrderStatus =
  | 'PENDING_ADMIN_CONFIRMATION'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'REJECTED'

export interface OrderCustomer {
  id: string
  name: string
  phone: string
}

export interface OrderItem {
  productId: string
  productName: string
  imageUrl: string | null
  optionValue: string | null
  price: number
  quantity: number
  lineTotal: number
  /**
   * مخزون المنتج **الآن** — يرسله `GET /admin/orders/:id` وحده، مقروءاً عند فتح
   * الطلب. `null` لمنتجٍ حُذف؛ غائبٌ في القوائم التي لا تحمله.
   */
  currentStock?: number | null
}

export interface AdminOrder {
  id: string
  number: string
  status: OrderStatus
  province: string
  deliveryFee: number
  fullAddress: string
  phone: string
  productsTotal: number
  /** الخصم على المنتجات كلّه (الميلاد + مزيّة المستوى) كما حُفظ مع الطلب. */
  discount: number
  /**
   * الجزء الآتي من مزيّة مستوى داخل `discount` — `orders.loyalty_discount`.
   *
   * اختياري لأن خادماً أقدم لا يرسله؛ غيابه يعني صفراً.
   */
  loyaltyDiscount?: number
  total: number
  customer: OrderCustomer | null
  createdAt: string
  items: OrderItem[]
  /** منطقة التوصيل داخل المحافظة وقت الطلب (النجف)؛ null لغيرها. */
  zoneName: string | null
  /** وقت الوصول المتوقع الذي أدخلته الإدارة عند الخروج للتوصيل. */
  deliveryNote: string | null
  /** سبب الرفض كما يراه العميل. */
  rejectionReason: string | null
  /** خصم التوصيل المطبَّق وقت الطلب — بدونه لا تتطابق الإجماليات المعروضة. */
  deliveryDiscount: number
  /**
   * ما تجاوز رسوم التوصيل من ترويج المنتجات — مبلغ محتفَظ به للمتجر.
   *
   * [CRITICAL] ليس خصماً للزبون: لا يدخل `total` ولا ينقص `productsTotal`.
   * يصل من مسار `/admin/orders/:id` وحده ولا يخرج في أي استجابة للعميل،
   * لذلك هو اختياري — قوائم الطلبات لا تحمله.
   */
  deliveryDiscountExcess?: number
  /** لحظة خروج الطلب للتوصيل — مرجع نافذة التقييم. */
  dispatchedAt: string | null
  /** لحظة تأكيد الاستلام؛ null قبل الاستلام. */
  deliveredAt: string | null
  /**
   * موعد إرسال تذكير التقييم — **ليس** موعد فتح التقييم.
   *
   * [CRITICAL] الاسم كما يرسله الخادم (`orderRepo.mapOrder`). كانت اللوحة
   * تقرأ `ratingAvailableAt`/`ratingAvailable` — حقلين لم يعد الخادم يرسلهما
   * منذ صار التقييم يُفتح بالاستلام — فتعرض «—» مكان موعدٍ موجود.
   */
  ratingReminderAt: string | null
  /** لحظة إرسال تذكير الاستلام؛ null إن لم يُرسل بعد. */
  ratingReminderSentAt: string | null
  /** هل يستطيع الزبون تقييم منتجات الطلب الآن؟ يقرّره الخادم من الاستلام. */
  canReview: boolean
  /** منتجات الطلب التي لم يقيّمها صاحبه بعد — من الخادم. */
  reviewableProductCount: number
  /** مسار الطلب بأوقاته. */
  statusHistory: OrderStatusEvent[]
}

/** حدث واحد في مسار الطلب. */
export interface OrderStatusEvent {
  status: OrderStatus
  note: string | null
  createdAt: string
}

export interface StatusCounts {
  PENDING_ADMIN_CONFIRMATION: number
  CONFIRMED: number
  PREPARING: number
  OUT_FOR_DELIVERY: number
  COMPLETED: number
  REJECTED: number
}

export interface AdminOrderList {
  items: AdminOrder[]
  page: number
  limit: number
  total: number
  hasMore: boolean
  statusCounts: StatusCounts
}

export interface ListOrdersParams {
  status?: OrderStatus
  page?: number
  limit?: number
}