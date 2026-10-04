import { get, post } from './client'

/**
 * تكلفة الشراء (D1) — للمسؤول الأعلى وحده. إلحاقٌ فقط: كل إدخالٍ صفٌّ جديد يسري
 * على الطلبات التي تُقبل بعده؛ الطلبات المقبولة سابقاً تحتفظ بلقطتها.
 */
export interface ProductCostEntry {
  id: string
  productId: string
  unitCost: number
  effectiveFrom: string
  enteredBy: string | null
  enteredByName: string | null
  note: string | null
}

export interface ProductCosts {
  productId: string
  productName: string
  current: ProductCostEntry | null
  entries: ProductCostEntry[]
}

export const getProductCosts = (productId: string) => get<ProductCosts>(`/admin/products/${productId}/costs`)

export const addProductCost = (productId: string, input: { unitCost: number; note?: string }) =>
  post<ProductCostEntry>(`/admin/products/${productId}/costs`, input)
