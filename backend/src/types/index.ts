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