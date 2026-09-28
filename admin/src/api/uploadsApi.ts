import { client } from './client'
import type { ApiEnvelope } from '../types/api'

export type UploadPurpose =
  | 'product'
  | 'banner'
  | 'franchise'
  | 'review'
  | 'avatar'
  | 'category'

/**
 * يرفع صورة إلى الخادم ويعيد رابطها العام الجاهز للحفظ مع المنتج/البنر.
 * لا نحدّد Content-Type يدوياً حتى يضبط المتصفح حدود FormData بنفسه.
 */
export async function uploadImage(file: File, purpose: UploadPurpose): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('purpose', purpose)

  const response = await client.post<ApiEnvelope<{ id: string; url: string }>>(
    '/admin/uploads',
    form,
    { headers: { 'Content-Type': undefined } },
  )
  return response.data.data!.url
}
