import { z } from 'zod';
import { ORDER_STATUSES } from '../types/order-status.js';
import { normalizeIraqiPhone } from '../utils/phone.js';

/**
 * محارف التحكّم والتنسيق غير المرئية مرفوضة في النصّ الحرّ.
 *
 * `\n` مسموح داخل العنوان (سطر للمنطقة وسطر للمعلم القريب مثلاً)، أما بقية
 * محارف التحكّم ومحارف قلب الاتجاه فلا تظهر للعين وتُستعمل لإخفاء محتوى
 * داخل نصٍّ يبدو طبيعياً على شاشة الموظّف الذي يجهّز الطلب.
 */
const ADDRESS_TEXT = /^[^\p{Cc}\p{Cf}\n]*(\n[^\p{Cc}\p{Cf}\n]*)*$/u;

export const createOrderSchema = z.object({
  governorateId: z.string().uuid('اختر محافظة صالحة'),
  /**
   * العنوان الكامل — العناوين العراقية وصفية بطبعها («المحلة، الزقاق، أقرب
   * نقطة دالّة»)، فالحدّ ٣٠٠ حرف يتّسع لها بلا تقتير، والحدّ الأدنى يمنع
   * «بيتي» وحدها. العربية والترقيم يمرّان كما هما.
   */
  fullAddress: z
    .string()
    .trim()
    .min(5, 'العنوان قصير جداً')
    .max(300, 'العنوان طويل جداً')
    .regex(ADDRESS_TEXT, 'العنوان يحتوي محارف غير مسموحة'),
  /** يُطبَّع إلى `+9647XXXXXXXXX` كما في مسارات المصادقة — تنفيذ واحد للتطبيع. */
  phone: z
    .string()
    .refine((v) => normalizeIraqiPhone(v) !== null, {
      message: 'رقم الهاتف غير صالح — أدخل رقم موبايل عراقي مثل 07XXXXXXXXX',
    })
    .transform((v) => normalizeIraqiPhone(v)!),
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
