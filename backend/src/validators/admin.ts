import { z } from 'zod';

/**
 * رابط صورة: إمّا رابط مطلق، أو مسار نسبي تحت /uploads يخدمه الخادم نفسه.
 * النسبي مقبول حتى تبقى الصور صالحة إذا تغيّر أصل الخادم لاحقاً.
 */
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => /^https?:\/\/.+/.test(value) || value.startsWith('/uploads/'),
    'رابط صورة غير صالح',
  );

const idSchema = z.object({ id: z.string().uuid('معرّف غير صالح') });

export const adminProductIdSchema = idSchema;
export const adminCategoryIdSchema = idSchema;
export const adminBannerIdSchema = idSchema;
export const adminGovernorateIdSchema = idSchema;
export const adminUserIdSchema = idSchema;

const price = z.number().positive('السعر يجب أن يكون موجباً').max(1_000_000_000);

export const adminProductCreateSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(3000).default(''),
  price,
  categoryId: z.string().uuid('معرّف قسم غير صالح'),
  subcategoryId: z.string().uuid('معرّف قسم فرعي غير صالح').nullable().optional(),
  stock: z.number().int().min(0).max(100000),
  images: z.array(imageUrl).max(10).default([]),
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        values: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
      }),
    )
    .max(10)
    .default([]),
  isOffer: z.boolean().default(false),
  isSelected: z.boolean().default(false),
  /** السعر قبل الخصم — يجب أن يكون أعلى من السعر الحالي (تتحقق القاعدة أيضاً). */
  previousPrice: z.number().positive().max(1_000_000_000).nullable().optional(),
  hasDeliveryPromo: z.boolean().default(false),
  /** قيمة خصم التوصيل عن كل قطعة — إلزامية موجبة متى فُعِّل الترويج. */
  deliveryPromoAmount: z.number().min(0).max(1_000_000).default(0),
  franchiseIds: z.array(z.string().uuid('معرّف أنمي غير صالح')).max(20).default([]),
});

/**
 * شكل التحديث يختلف عن الإنشاء:
 * الإنشاء يملأ القيم الافتراضية (صور/خيارات فارغة…)؛ أما التحديث فيجب أن يكون
 * «حاضر الوعي» — الحقل الغائب يبقى كما هو في قاعدة البيانات، والحقل الموجود
 * (حتى لو مصفوفة فارغة) يُطبَّق كما هو. اعتماداً على createSchema.partial()
 * كان يُعيد ملء الافتراضات ([]) عند غياب الحقل فيمسح البيانات — خلل موثّق.
 */
export const adminProductUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(3000).optional(),
  price: z.number().positive('السعر يجب أن يكون موجباً').max(1_000_000_000).optional(),
  categoryId: z.string().uuid('معرّف قسم غير صالح').optional(),
  subcategoryId: z.string().uuid('معرّف قسم فرعي غير صالح').nullable().optional(),
  stock: z.number().int().min(0).max(100000).optional(),
  images: z.array(imageUrl).max(10).optional(),
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        values: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
      }),
    )
    .max(10)
    .optional(),
  isOffer: z.boolean().optional(),
  isSelected: z.boolean().optional(),
  isActive: z.boolean().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).max(1_000_000).optional(),
  previousPrice: z.number().positive().max(1_000_000_000).nullable().optional(),
  hasDeliveryPromo: z.boolean().optional(),
  deliveryPromoAmount: z.number().min(0).max(1_000_000).optional(),
  franchiseIds: z.array(z.string().uuid('معرّف أنمي غير صالح')).max(20).optional(),
});

export const adminCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  imageUrl: imageUrl.nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const adminSubcategorySchema = z.object({
  categoryId: z.string().uuid('معرّف قسم غير صالح'),
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const adminBannerSchema = z.object({
  imageUrl,
  title: z.string().trim().max(120).nullable().optional(),
  destinationType: z.enum(['product', 'category', 'subcategory', 'none']).default('none'),
  destinationValue: z.string().trim().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

/**
 * تعديل بنر — **لا قيم افتراضية هنا**.
 *
 * [CRITICAL] `adminBannerSchema.partial()` لا يكفي: `.partial()` في Zod لا
 * يُلغي `.default()`، فالحقل الغائب يُملأ بالافتراضي بدل أن يُترك وشأنه.
 * عملياً كان تعديلُ صورة البنر وحدها يعيد `destinationType` إلى `none`
 * ويترك `destinationValue` كما هو — أي بنر بوجهة معطوبة وحالة متناقضة،
 * بلا أي خطأ يكشف ما جرى.
 *
 * لذلك يُبنى مخطط التعديل صراحةً: كل حقل اختياري وبلا افتراضي، فالغياب
 * يعني «لا تغيير» كما ينبغي في PATCH.
 */
export const adminBannerUpdateSchema = z.object({
  imageUrl: imageUrl.optional(),
  title: z.string().trim().max(120).nullable().optional(),
  destinationType: z.enum(['product', 'category', 'subcategory', 'none']).optional(),
  destinationValue: z.string().trim().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const adminGovernorateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  deliveryFee: z.number().min(0).max(10_000_000),
});

/** تعديل قسم فرعي — القسم الأب لا يتغيّر بعد الإنشاء. */
export const adminSubcategoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const adminSubcategoryIdSchema = idSchema;

/** ترشيح الإشعارات في لوحة التحكم. */
export const adminNotificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z
    .enum([
      'orderAccepted', 'orderRejected', 'deliveryUpdate', 'receiptReminder',
      'reviewApproved', 'reviewRejected', 'backInStock', 'promotion',
    ])
    .optional(),
  userId: z.string().uuid('معرّف مستخدم غير صالح').optional(),
  // نصّ لأن الاستعلام يصل كسلسلة: 'true' / 'false' / غياب = الكل.
  read: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

/** معرّف عميل لمسار النقاط. */
export const adminCustomerIdSchema = idSchema;

/**
 * إعدادات الأعمال.
 *
 * القيم تصل نصّاً أو رقماً أو `null` (إفراغ = عودة للافتراضي). المدى نفسه
 * يُفحص في `businessConfigService` حيث تعيش المواصفات، فلا يُكرَّر هنا رقمٌ
 * قد يتباعد عنه.
 */
const businessSettingValue = z.union([z.string(), z.number(), z.null()]).optional();

/**
 * كل المفاتيح اختيارية: اللوحة ترسل ما غيّره المسؤول فقط.
 *
 * لا تستعمل `z.record` مع مفتاح `enum` هنا: في Zod 4 يصير السجلّ **شاملاً**
 * فيطالب بكل المفاتيح دفعةً واحدة، فيُرفض أي حفظ جزئي بـ400.
 */
export const adminBusinessSettingsSchema = z.object({
  points_order_received: businessSettingValue,
  points_review_approved: businessSettingValue,
  points_review_with_photo: businessSettingValue,
  birthday_discount_percent: businessSettingValue,
  order_rating_delay_hours: businessSettingValue,
});

export type AdminProductCreateInput = z.infer<typeof adminProductCreateSchema>;
export type AdminProductUpdateInput = z.infer<typeof adminProductUpdateSchema>;
export type AdminBannerInput = z.infer<typeof adminBannerSchema>;