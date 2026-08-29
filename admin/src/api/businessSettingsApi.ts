import { client, get } from './client'
import type { ApiEnvelope } from '../types/api'
import type { BusinessSetting, BusinessSettingKey } from '../types/businessSettings'

export function getBusinessSettings(): Promise<{ items: BusinessSetting[] }> {
  return get<{ items: BusinessSetting[] }>('/admin/settings/business')
}

/**
 * حفظ إعدادات الأعمال.
 *
 * قيمة `null` تعني «عُد إلى الافتراضي» — عمليةٌ مشروعة يحتاجها من غيّر ثم
 * ندم، ولذلك لا تُترجم إلى صفر.
 */
export async function updateBusinessSettings(
  values: Partial<Record<BusinessSettingKey, string | number | null>>,
): Promise<{ items: BusinessSetting[]; message: string }> {
  const response = await client.patch<ApiEnvelope<{ items: BusinessSetting[] }>>(
    '/admin/settings/business',
    values,
  )
  return {
    items: response.data.data?.items ?? [],
    message: response.data.message ?? '',
  }
}
