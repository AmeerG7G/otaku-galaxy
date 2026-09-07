import { z } from 'zod';
import { ROTATION_MODES } from '../repositories/visualsRepo.js';

/**
 * مفتاح الفتحة عقدٌ بين الخادم وكود التطبيق.
 *
 * القيد هنا يطابق قيد القاعدة حرفياً: حروف صغيرة وأرقام وشرطة سفلية فقط.
 * مفتاح فيه مسافة أو حرف عربي يُكتب في القاعدة بلا مشكلة ثم لا يطابقه أي
 * `ManagedArtwork` في التطبيق — فتحة تبدو مضبوطة ولا تظهر أبداً.
 */
const slotKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{2,48}$/, 'مفتاح الفتحة: حروف إنجليزية صغيرة وأرقام وشرطة سفلية');

/** رابط وسائط: مرجع نسبي يخدمه الخادم، أو رابط خارجي كامل. */
const mediaUrl = z
  .string()
  .trim()
  .min(1, 'الرابط مطلوب')
  .max(500)
  .refine(
    (value) => value.startsWith('/uploads/') || /^https?:\/\/.+/.test(value),
    'أدخل صورة مرفوعة أو رابطاً كاملاً',
  );

/** مجموعة العرض — منطقة التطبيق التي تنتمي إليها الفتحة. */
const groupKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,30}$/, 'مفتاح المجموعة: حروف إنجليزية صغيرة وأرقام');

export const createSlotSchema = z.object({
  slotKey,
  label: z.string().trim().max(120).default(''),
  location: z.string().trim().max(200).default(''),
  groupKey: groupKey.default('other'),
  rotationMode: z.enum(ROTATION_MODES).default('fixed'),
});

export const updateSlotSchema = z.object({
  label: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  groupKey: groupKey.optional(),
  isActive: z.boolean().optional(),
  rotationMode: z.enum(ROTATION_MODES).optional(),
});

export const slotIdParamSchema = z.object({
  id: z.string().uuid('معرّف فتحة غير صالح'),
});

export const slotImageParamSchema = z.object({
  id: z.string().uuid('معرّف فتحة غير صالح'),
  imageId: z.string().uuid('معرّف صورة غير صالح'),
});

export const addSlotImageSchema = z.object({
  url: mediaUrl,
  /**
   * `append` — تُضاف إلى مجموعة التدوير.
   * `replace` — تحلّ محلّ كل ما في الفتحة وتصير المعروضة فوراً.
   */
  mode: z.enum(['append', 'replace']).default('append'),
});

export const updateSlotImageSchema = z.object({
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export const reorderSlotImagesSchema = z.object({
  imageIds: z.array(z.string().uuid('معرّف صورة غير صالح')).min(1).max(50),
});
