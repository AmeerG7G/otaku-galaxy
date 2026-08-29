import { z } from 'zod';
import { ORDER_STATUSES } from '../types/order-status.js';

export const createOrderSchema = z.object({
  governorateId: z.string().uuid('اختر محافظة صالحة'),
  fullAddress: z.string().trim().min(5, 'العنوان قصير جداً').max(300),
  phone: z.string().regex(/^07\d{9}$/, 'رقم الهاتف غير صالح'),
  /** منطقة التوصيل — إلزامية للمحافظات المقسّمة مناطق (النجف). */
  zoneId: z.string().uuid('منطقة التوصيل غير صالحة').nullish(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid('معرّف طلب غير صالح'),
});

export const listOrdersSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
});

export const adminOrderIdParamSchema = z.object({
  id: z.string().uuid('معرّف طلب غير صالح'),
});

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES),
    /**
     * ملاحظة الإدارة: سبب الرفض عند REJECTED (إلزامي)، ووقت الوصول
     * المتوقع عند OUT_FOR_DELIVERY (اختياري، مثل «سيصل غداً»).
     */
    note: z.string().trim().max(300).optional(),
  })
  .refine((value) => value.status !== 'REJECTED' || Boolean(value.note?.trim()), {
    message: 'سبب الرفض مطلوب',
    path: ['note'],
  });
/**
 * إعادة جدولة تذكير الاستلام: إمّا مهلة بالساعات من الآن، أو لحظة صريحة.
 * أحدهما مطلوب ولا يُقبل الاثنان معاً — قيمتان للوقت نفسه تفتحان باب
 * التناقض بلا فائدة.
 */
export const rescheduleReminderSchema = z
  .object({
    delayHours: z.coerce.number().min(0).max(24 * 30).optional(),
    remindAt: z.coerce.date().optional(),
  })
  .refine(
    (v) => (v.delayHours === undefined) !== (v.remindAt === undefined),
    { message: 'حدّد مهلة بالساعات أو وقتاً صريحاً — لا كليهما' },
  );
