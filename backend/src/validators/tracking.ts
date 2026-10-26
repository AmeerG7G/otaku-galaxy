import { z } from 'zod';

/** إشارة المشاركة (D3) — نتيجة ورقة المشاركة كما يعيدها النظام. */
export const shareSignalSchema = z.strictObject({
  productId: z.string().uuid('معرّف منتج غير صالح'),
  result: z.enum(['opened', 'success', 'dismissed', 'unavailable']),
});

export const notificationIdParamSchema = z.object({ id: z.string().uuid('معرّف غير صالح') });
