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
  discount: number
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
  /** لحظة خروج الطلب للتوصيل — مرجع نافذة التقييم. */
  dispatchedAt: string | null
  /** لحظة تأكيد الاستلام؛ null قبل الاستلام. */
  deliveredAt: string | null
  /** لحظة فتح التقييم للعميل (الاستلام + المهلة). */
  ratingAvailableAt: string | null
  /** هل صار التقييم مفتوحاً للعميل الآن؟ */
  ratingAvailable: boolean
  /** لحظة إرسال تذكير الاستلام؛ null إن لم يُرسل بعد. */
  ratingReminderSentAt: string | null
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