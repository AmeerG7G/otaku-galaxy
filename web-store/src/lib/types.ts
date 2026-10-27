/**
 * The subset of the existing API contract the storefront reads. Shapes were
 * taken from the live API (`/api/catalog/*`, `/api/cart`,
 * `/api/orders/checkout-quote`, `/api/orders`) — fields the website does not
 * use are simply not declared.
 */

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface Subcategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  subcategories: Subcategory[];
}

export interface ProductOption {
  id?: string;
  name: string;
  values: string[];
}

/**
 * A colour of a product (STEP 74, migration 087) — its own image and its own
 * stock. Customers never see an inactive colour; a colour with stock 0 is shown
 * as unavailable and cannot be chosen.
 */
export interface ProductVariant {
  id: string;
  /** Resolved for the request language (the store asks for Arabic). */
  colorName: string;
  colorNameAr: string;
  colorNameCkb: string | null;
  /** `#RRGGBB` or `null`. */
  colorHex: string | null;
  imageUrl: string;
  stock: number;
  isActive: boolean;
  sortOrder: number;
}

/**
 * The colour snapshot on a cart line, a quote line and an order item — all
 * `null` (or absent from an older API) for a line without a colour.
 * `variantColorName` is Arabic, like `productName`.
 */
export interface LineVariant {
  variantId?: string | null;
  variantColorName?: string | null;
  variantColorNameAr?: string | null;
  variantColorNameCkb?: string | null;
  variantColorHex?: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  /** `null` = coming soon, price not announced yet: shown, never sold (the API refuses it, PRODUCT_NOT_PRICED). */
  price: number | null;
  /** Price for two pieces of this product, any options (migration 085); `null`/absent = no offer. */
  pairPrice?: number | null;
  stock: number;
  images: string[];
  categoryId: string;
  subcategoryId: string | null;
  isActive: boolean;
  previousPrice: number | null;
  discountPercent: number | null;
  hasDeliveryPromo: boolean;
  deliveryPromoAmount: number;
  restockAt: string | null;
  options?: ProductOption[];
  /** Ordered colours; `[]`/absent = no colours (the product's own stock is sold). */
  variants?: ProductVariant[];
}

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'rating'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface Governorate {
  id: string;
  name: string;
  deliveryFee: number;
  isActive: boolean;
}

export interface Zone {
  id: string;
  governorateId: string;
  name: string;
  deliveryFee: number;
}

export interface CartLine extends LineVariant {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  optionValue: string | null;
  quantity: number;
  unitPrice: number;
  pairPrice?: number | null;
  /** From the server, after the two-piece offer across this product's lines — never computed here. */
  lineTotal: number;
  /** The colour's stock for a colour line, else the product's. */
  stock: number;
  hasDeliveryPromo: boolean;
  deliveryPromoAmount: number;
}

export interface CartAdjustment {
  lineId?: string;
  productId?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface Cart {
  items: CartLine[];
  adjustments: CartAdjustment[];
}

export interface CheckoutQuote {
  productsTotal: number;
  birthdayDiscount: number;
  loyaltyDiscount: number;
  discount: number;
  deliveryFee: number | null;
  deliveryDiscount: number;
  total: number | null;
  /** The priced lines the order would be created from — what the shopper reviews. */
  lines: QuoteLine[];
  /** What would make the API refuse the order right now (unavailable product, short stock). */
  issues: QuoteIssue[];
  /**
   * Sent back as `expectedQuote`: the API refuses the order (409
   * QUOTE_CHANGED) if anything the shopper reviewed has changed. `null` while
   * nothing is submittable yet (no destination, empty cart, open issues).
   */
  fingerprint: string | null;
}

export interface QuoteLine extends LineVariant {
  productId: string;
  optionValue: string | null;
  quantity: number;
  unitPrice: number;
  pairPrice?: number | null;
  lineTotal: number;
}

export type QuoteIssue = (
  | { code: 'PRODUCT_UNAVAILABLE'; productId: string }
  | { code: 'PRODUCT_NOT_PRICED'; productId: string }
  | { code: 'INSUFFICIENT_STOCK'; productId: string; available: number }
  | { code: 'VARIANT_UNAVAILABLE'; productId: string }
) & { variantId?: string | null };

export interface OrderItem extends LineVariant {
  productId: string | null;
  productName: string;
  imageUrl: string | null;
  optionValue: string | null;
  price: number;
  /** Two-piece price at order time (085); `null`/absent = no offer or an older order. */
  pairPrice?: number | null;
  quantity: number;
  /** What the shopper paid for the line — below `price × quantity` when the two-piece offer applied. */
  lineTotal: number;
}

export interface OrderStatusEvent {
  status: string;
  note: string | null;
  createdAt: string;
}

export interface OrderPage extends Paginated<Order> {
  statusCounts: Record<string, number>;
}

export interface Order {
  id: string;
  number: string;
  status: string;
  province: string;
  zoneName: string | null;
  deliveryFee: number;
  deliveryDiscount: number;
  fullAddress: string;
  phone: string;
  productsTotal: number;
  discount: number;
  loyaltyDiscount: number;
  total: number;
  createdAt: string;
  items: OrderItem[];
  rejectionReason: string | null;
  deliveryNote: string | null;
  statusHistory: OrderStatusEvent[];
}

export interface PublicUser {
  id: string;
  username: string;
  phone: string;
  role: 'customer' | 'admin';
  gender: 'male' | 'female' | null;
}

export interface LoyaltyLevel {
  key: string;
  number: number;
  nameNeutral: string;
}
