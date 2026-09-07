import { get, patch, post, remove } from './client'
import type {
  CreateSlotPayload,
  UpdateSlotPayload,
  VisualSlot,
} from '../types/visuals'

/**
 * الرسوم المُدارة — فتحات الشخصيات.
 *
 * الرفع يمرّ بـ`uploadsApi` القائم بغرض `slot`؛ لا مسار رفع ثانٍ هنا.
 * هذه الوحدة تربط رابطاً مرفوعاً بفتحة فقط.
 */
export function listVisualSlots(): Promise<{ items: VisualSlot[] }> {
  return get<{ items: VisualSlot[] }>('/admin/visual-slots')
}

export function createVisualSlot(payload: CreateSlotPayload) {
  return post<VisualSlot>('/admin/visual-slots', payload)
}

export function updateVisualSlot(id: string, payload: UpdateSlotPayload) {
  return patch<VisualSlot>(`/admin/visual-slots/${id}`, payload)
}

export function deleteVisualSlot(id: string) {
  return remove<null>(`/admin/visual-slots/${id}`)
}

/**
 * يضيف صورة إلى فتحة.
 *
 * `append` يبني مجموعة تدوير. `replace` يوقف كل الصور القائمة ويضع الجديدة
 * في المقدمة، فتصير هي المعروضة فوراً — وهو ما يقصده المسؤول حين يقول
 * «غيّر هذه الصورة».
 */
export function addSlotImage(
  slotId: string,
  url: string,
  mode: 'append' | 'replace' = 'append',
) {
  return post<VisualSlot>(`/admin/visual-slots/${slotId}/images`, { url, mode })
}

export function updateSlotImage(
  slotId: string,
  imageId: string,
  payload: { isActive?: boolean; sortOrder?: number },
) {
  return patch<VisualSlot>(`/admin/visual-slots/${slotId}/images/${imageId}`, payload)
}

export function deleteSlotImage(slotId: string, imageId: string) {
  return remove<VisualSlot>(`/admin/visual-slots/${slotId}/images/${imageId}`)
}

export function reorderSlotImages(slotId: string, imageIds: string[]) {
  return patch<VisualSlot>(`/admin/visual-slots/${slotId}/images/reorder`, { imageIds })
}
