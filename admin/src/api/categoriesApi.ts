import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type {
  AdminCategoryListResponse,
  CategoryAdminRow,
  CategoryCreatePayload,
  CategoryUpdatePayload,
  SubcategoryCreatePayload,
  SubcategoryCreateResult,
} from '../types/categories'

export function listAdminCategories(): Promise<AdminCategoryListResponse> {
  return get<AdminCategoryListResponse>('/admin/categories')
}

export async function createCategory(
  payload: CategoryCreatePayload,
): Promise<{ row: CategoryAdminRow; message: string }> {
  const response = await client.post<ApiEnvelope<CategoryAdminRow>>(
    '/admin/categories',
    payload,
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

export async function updateCategory(
  id: string,
  payload: CategoryUpdatePayload,
): Promise<{ row: CategoryAdminRow; message: string }> {
  const response = await client.patch<ApiEnvelope<CategoryAdminRow>>(
    `/admin/categories/${id}`,
    payload,
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

export async function createSubcategory(
  payload: SubcategoryCreatePayload,
): Promise<{ row: SubcategoryCreateResult; message: string }> {
  const response = await client.post<ApiEnvelope<SubcategoryCreateResult>>(
    '/admin/subcategories',
    payload,
  )
  return { row: response.data.data!, message: response.data.message ?? '' }
}

/**
 * حذف قسم.
 *
 * الخادم يرفض بـ409 ما دام منتج أو قسم فرعي يعتمد عليه، ولا يحذف شيئاً
 * تبعاً. الرسالة العائدة تقول ما الذي يمنع الحذف.
 */
export async function deleteCategory(id: string): Promise<{ message: string }> {
  const response = await client.delete<ApiEnvelope<{ id: string }>>(
    `/admin/categories/${id}`,
  )
  return { message: response.data.message ?? '' }
}

export async function updateSubcategory(
  id: string,
  payload: { name?: string; sortOrder?: number; isActive?: boolean },
): Promise<{ message: string }> {
  const response = await client.patch<ApiEnvelope<unknown>>(
    `/admin/subcategories/${id}`,
    payload,
  )
  return { message: response.data.message ?? '' }
}

/** حذف قسم فرعي — مرفوض بـ409 ما دامت منتجات مرتبطة به. */
export async function deleteSubcategory(id: string): Promise<{ message: string }> {
  const response = await client.delete<ApiEnvelope<{ id: string }>>(
    `/admin/subcategories/${id}`,
  )
  return { message: response.data.message ?? '' }
}
