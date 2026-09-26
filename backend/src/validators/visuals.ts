import { z } from 'zod';

export const slotIdParamSchema = z.object({
  id: z.string().uuid('معرّف فتحة غير صالح'),
});

/**
 * صورة الفتحة: مرجعٌ نسبي لملفٍ مرفوع من اللوحة (`/uploads/...`).
 *
 * لا روابط خارجية: صورةٌ تُحمَّل عند كل زبون من خادمٍ لا نملكه قد يبدّل
 * محتواها أو يسجّل عناوينهم. الوجودُ والغرض (`slot`) يُتحقَّق منهما في الخدمة.
 */
const slotImageUrl = z
  .string()
  .trim()
  .min(1, 'الرابط مطلوب')
  .max(500)
  .refine((value) => value.startsWith('/uploads/'), 'أدخل صورة مرفوعة من اللوحة');

/** الصورة الدائمة. */
export const setSlotImageSchema = z.object({ url: slotImageUrl });

/**
 * الصورة المؤقّتة: الصورة ولحظة انتهائها معاً.
 *
 * `until` لحظةٌ مطلقة ISO 8601 بإزاحتها (كما `restockAt`)؛ «في المستقبل
 * وأقرب من عام» يُحكم في الخدمة بساعة الخادم لا هنا.
 */
export const setSlotTemporaryImageSchema = z.object({
  url: slotImageUrl,
  until: z.string().datetime({ offset: true, message: 'لحظة الانتهاء غير صالحة' }),
});
