import { z } from 'zod';
import { isValidVersionString } from '../services/appVersionService.js';

/**
 * المرادفات: أسماء بديلة يطابقها بحث العميل («قاتل الشياطين» لـDemon Slayer).
 *
 * تُنظَّف هنا لا في الاستعلام: الفراغات والمكرَّرات تنتفخ في العمود وتُبطئ
 * كل بحث لاحق، وتصحيحها عند الكتابة مرة واحدة أرخص من تجاهلها كل قراءة.
 */
const altNames = z
  .array(z.string().trim().min(1).max(80))
  .max(10, 'حد المرادفات عشرة')
  .transform((values) => [...new Set(values.filter(Boolean))]);

/**
 * صورة الأنمي: مرفوعة على الخادم أو رابط خارجي كامل.
 *
 * الفحص هنا هو نفسه المطبَّق على صور المنتجات والفتحات البصرية. كان هذا
 * الحقل الوحيد الذي يقبل أي نصّ حتى ٥٠٠ حرف بلا فحص مخطَّط — فيصلح لتخزين
 * `javascript:` أو `data:text/html`. المسار إداري، لكن اتّساق القاعدة عبر
 * كل حقول الروابط أرخص من تذكّر أيّها استُثني ولماذا.
 */
const franchiseImageUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === '' || value.startsWith('/uploads/') || /^https?:\/\/.+/.test(value),
    'رابط صورة غير صالح — ارفع صورة أو أدخل رابطاً يبدأ بـ http(s)://',
  );

/**
 * الأرقام في أجسام JSON تصل أرقاماً — **لا إكراه**.
 *
 * [CRITICAL] كان `z.coerce.number()` يحوّل `null` و`""` و`[]` إلى ٠ و`true`
 * إلى ١ بصمت، فطلبُ `{deliveryFee: null}` كان يجعل التوصيل مجانياً بدل أن
 * يُرفض. الإكراه مبرَّر لمعاملات الاستعلام (نصوص دائماً) لا للجسم. والسقف
 * يطابق عمود القاعدة (`NUMERIC(12,2)` / `int4`): قيمةٌ تفيض عنه كانت تصل
 * القاعدة فتخرج ٥٠٠ بدل ٤٠٠. سقف الترتيب هو سقف بقية مواضع الإدارة.
 */
const sortOrder = z.number().int().min(0).max(1000);

export const createFranchiseSchema = z.object({
  name: z.string().trim().min(1, 'اسم الأنمي مطلوب').max(80),
  altNames: altNames.optional(),
  imageUrl: franchiseImageUrl.nullish(),
  sortOrder: sortOrder.optional(),
});

export const updateFranchiseSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  altNames: altNames.optional(),
  imageUrl: franchiseImageUrl.nullish(),
  sortOrder: sortOrder.optional(),
  isActive: z.boolean().optional(),
});

export const franchiseIdParamSchema = z.object({
  id: z.string().uuid('معرّف أنمي غير صالح'),
});

// ── مناطق التوصيل ──

/** رسوم المنطقة — نفس سقف رسوم المحافظة (`adminGovernorateSchema`). */
const zoneDeliveryFee = z.number().min(0, 'رسوم غير صالحة').max(10_000_000);

export const createZoneSchema = z.object({
  governorateId: z.string().uuid('معرّف محافظة غير صالح'),
  name: z.string().trim().min(1, 'اسم المنطقة مطلوب').max(80),
  deliveryFee: zoneDeliveryFee,
  sortOrder: sortOrder.optional(),
});

export const updateZoneSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  deliveryFee: zoneDeliveryFee.optional(),
  sortOrder: sortOrder.optional(),
  isActive: z.boolean().optional(),
});

export const zoneIdParamSchema = z.object({
  id: z.string().uuid('معرّف منطقة غير صالح'),
});

export const governorateIdParamSchema = z.object({
  governorateId: z.string().uuid('معرّف محافظة غير صالح'),
});

// ── إعدادات المتجر ──

/** رابط صالح أو نص فارغ (الفارغ يعني «غير مضبوط» فيبقى سلوك التطبيق الآمن). */
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => value === '' || /^https?:\/\/.+/.test(value),
    'أدخل رابطاً يبدأ بـ http(s):// أو اتركه فارغاً',
  );

export const updateSettingsSchema = z.object({
  social_tiktok: optionalUrl.optional(),
  social_instagram: optionalUrl.optional(),
  // واتساب قد يكون رابطاً أو رقماً دولياً.
  social_whatsapp: z
    .string()
    .trim()
    .max(300)
    .refine(
      (value) => value === '' || /^https?:\/\/.+/.test(value) || /^\+?\d{8,15}$/.test(value),
      'أدخل رابط واتساب أو رقماً صالحاً أو اتركه فارغاً',
    )
    .optional(),
  // سطر واحد مشترك تحت صفّ الروابط الاجتماعية (1..60 حرفاً).
  social_description: z.string().trim().max(60).optional(),
});

// ── نسخة التطبيق ──

/** نسخة دلالية صالحة أو نص فارغ (الفارغ = «لا حدّ أدنى» = لا حجب). */
const optionalSemver = z
  .string()
  .trim()
  .max(40)
  .refine(
    (value) => value === '' || isValidVersionString(value),
    'أدخل نسخة بصيغة 1.2.3 أو اتركها فارغة',
  );

/**
 * إعدادات إجبار التحديث.
 *
 * [CRITICAL] الفصل عن `updateSettingsSchema` مقصود: الخطأ هنا يحجب التطبيق
 * عن كل مستخدميه، فلا يجوز أن يُحفظ حدٌّ أدنى بصيغة فاسدة لأنه مرّ ضمن
 * دفعة روابط تواصل. التحقق من الصيغة يقع قبل الكتابة لا بعدها.
 */
export const updateAppVersionSettingsSchema = z.object({
  app_min_supported_version: optionalSemver.optional(),
  app_latest_version: optionalSemver.optional(),
  app_android_store_url: optionalUrl.optional(),
  app_ios_store_url: optionalUrl.optional(),
  app_update_message: z.string().trim().max(300).optional(),
});
