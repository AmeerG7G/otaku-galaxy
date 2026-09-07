import { z } from 'zod';
import { GENDERS } from '../types/index.js';
import { BIRTHDAY_FILTERS, CUSTOMER_SORTS } from '../repositories/userRepo.js';
import { BANNER_DESTINATIONS, BANNER_PLACEMENTS } from '../types/index.js';

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

/**
 * مبلغ خصم التوصيل عن القطعة الواحدة.
 *
 * غير سالب، وبمنزلتين عشريتين على الأكثر — العمود `NUMERIC(12,2)`، وقيمةٌ
 * أدقّ منه تُقرَّب في القاعدة بصمت فيحفظ المتجر رقماً غير الذي أدخله المسؤول.
 *
 * السقف عند رسوم التوصيل **لا يقع هنا**: الرسوم تختلف بالمحافظة والمنطقة
 * وتتغيّر بعد ضبط المنتج، فالسقف قرارُ وقتِ الطلب لا وقتِ الضبط.
 */
const deliveryPromoAmount = z
  .number()
  .min(0, 'قيمة خصم التوصيل لا يمكن أن تكون سالبة')
  .max(1_000_000)
  .refine(
    (value) => Number.isInteger(Math.round(value * 100)) && value * 100 % 1 === 0,
    'قيمة خصم التوصيل تقبل منزلتين عشريتين على الأكثر',
  );

/**
 * «مفعَّل ⇔ مبلغ موجب» — نفس ثابت قيد القاعدة
 * (`products_delivery_promo_amount_positive`)، مرفوعاً إلى الحدّ ليصل المسؤول
 * سببٌ مفهوم بدل رسالة القيد العامة «قيمة غير صالحة لأحد حقول المنتج».
 *
 * القيد يبقى: هو الحارس الحقيقي، وهذا تحسينُ رسالةٍ لا بديلٌ عنه.
 */
function assertDeliveryPromoCoherent(
  value: { hasDeliveryPromo?: boolean; deliveryPromoAmount?: number },
  ctx: z.RefinementCtx,
): void {
  const { hasDeliveryPromo, deliveryPromoAmount: amount } = value;
  if (hasDeliveryPromo === true && amount !== undefined && amount <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['deliveryPromoAmount'],
      message: 'فعّلت خصم التوصيل — أدخل قيمة أكبر من صفر',
    });
  }
  if (hasDeliveryPromo === false && amount !== undefined && amount > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['deliveryPromoAmount'],
      message: 'خصم التوصيل معطَّل — القيمة يجب أن تكون صفراً',
    });
  }
}

/** موعد التوفر القادم (إن حدّده المسؤول) — ISO 8601؛ null يفرّغه. */
const restockAt = z
  .string()
  .datetime({ offset: true, message: 'تاريخ توفر غير صالح' })
  .nullable()
  .optional();

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
  deliveryPromoAmount: deliveryPromoAmount.default(0),
  franchiseIds: z.array(z.string().uuid('معرّف أنمي غير صالح')).max(20).default([]),
  restockAt,
}).superRefine(assertDeliveryPromoCoherent);

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
  deliveryPromoAmount: deliveryPromoAmount.optional(),
  franchiseIds: z.array(z.string().uuid('معرّف أنمي غير صالح')).max(20).optional(),
  restockAt,
}).superRefine(assertDeliveryPromoCoherent);

export const adminCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  imageUrl: imageUrl.nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const adminSubcategorySchema = z.object({
  categoryId: z.string().uuid('معرّف قسم غير صالح'),
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const adminBannerSchema = z.object({
  imageUrl,
  title: z.string().trim().max(120).nullable().optional(),
  subtitle: z.string().trim().max(160).optional(),
  placement: z.enum(BANNER_PLACEMENTS).default('promo'),
  destinationType: z.enum(BANNER_DESTINATIONS).default('none'),
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
  subtitle: z.string().trim().max(160).optional(),
  placement: z.enum(BANNER_PLACEMENTS).optional(),
  destinationType: z.enum(BANNER_DESTINATIONS).optional(),
  destinationValue: z.string().trim().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const adminGovernorateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  deliveryFee: z.number().min(0).max(10_000_000),
  isActive: z.boolean().optional(),
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

// [NOTE] حُذف `adminBusinessSettingsSchema` و`businessSettingValue`.
//
// لم تبقَ إعدادات أعمال رقمية تُكتب من اللوحة، فمدقّقٌ لجسم طلبٍ لا وجود
// لمساره يوحي بقدرةٍ أُزيلت.

export type AdminProductCreateInput = z.infer<typeof adminProductCreateSchema>;
export type AdminProductUpdateInput = z.infer<typeof adminProductUpdateSchema>;
export type AdminBannerInput = z.infer<typeof adminBannerSchema>;

// ── الزبائن وأعياد الميلاد ──

/** «true»/«false» من سلسلة استعلام، أو غياب يعني «بلا ترشيح». */
const optionalBoolean = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

export const adminCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(80).optional(),
  isActive: optionalBoolean,
  hasBirthday: optionalBoolean,
  hasOrders: optionalBoolean,
  minPoints: z.coerce.number().int().min(0).optional(),
  maxPoints: z.coerce.number().int().min(0).optional(),
  /**
   * ترشيح بالجنس — تعدادٌ مغلق يشمل `unknown` للحسابات التي لم تُسأل.
   *
   * قيمةٌ خارجه تُرفض عند الحدّ بدل أن تُتجاهل بصمت: مسؤولٌ كتب `Male` يجب
   * أن يرى الرفض لا قائمةً كاملة يظنّها مرشَّحة.
   */
  gender: z.enum([...GENDERS, 'unknown']).optional(),
  sort: z.enum(CUSTOMER_SORTS).optional(),
});

export const adminBirthdayQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  filter: z.enum(BIRTHDAY_FILTERS).default('registered'),
  /** نافذة «قريباً»/«مؤخّراً» — الواجهة تعرض ٧/١٤/٣٠. */
  windowDays: z.coerce.number().int().min(1).max(365).default(7),
});

// ── مزايا مستويات نقاط المجرّة ──
//
// [NOTE] حُذفت `loyaltyLevelCreate/Update/Id`. كانت تسمح ببناء السلّم من
// اللوحة؛ السلّم الآن ثابت في `domain/galaxyPoints.ts` ولا مسار يعدّله، فبقاء
// مدقّقاتٍ لأجسام طلبات لا وجود لها يوحي بقدرةٍ أُزيلت.

/** طابور الهدايا: كلّها أو غير المسلَّمة فقط. */
export const giftClaimsQuerySchema = z.object({
  pending: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── قائمة منتجات الإدارة ──

/**
 * ترشيح قائمة المنتجات بالقسم أو القسم الفرعي.
 *
 * يخدم المسار «الأقسام ← قسم فرعي ← منتجاته»: بدونه كانت الشاشة تُحمّل كل
 * المنتجات ثم تُرشِّحها في المتصفح، فتبدو صحيحة على صفحة واحدة وتُخفي
 * منتجات الصفحات التالية.
 */
export const adminProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  categoryId: z.string().uuid('معرّف قسم غير صالح').optional(),
  subcategoryId: z.string().uuid('معرّف قسم فرعي غير صالح').optional(),
  /**
   * ترشيح العروض/المختارة للإدارة.
   *
   * [CRITICAL] كانت لوحة التحكم تقرأ هذين القسمين من `/api/catalog/products`
   * العام لأن مسار الإدارة لا يقبلهما. ونتيجةُ ذلك أن منتجاً معطّلاً مرفوعاً
   * كعرض لا يظهر في شاشة العروض أصلاً، فلا سبيل لإزالته منها: القائمة العامة
   * تُخفي غير النشط عمداً. الترشيح هنا يقرأ نفس مستودع المنتجات بـ
   * `includeInactive`، فتُدار العروض من مسارٍ يتطلّب صلاحية مسؤول لا من مسارٍ
   * عام.
   *
   * القيمة نصّية لأن معايير الاستعلام نصوص؛ نفس صيغة `listProductsSchema`.
   */
  offer: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  selected: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
