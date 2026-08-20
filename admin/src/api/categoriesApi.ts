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