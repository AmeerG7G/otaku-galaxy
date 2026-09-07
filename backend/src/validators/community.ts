import { z } from 'zod';
import { CLAIMABLE_LEVELS, MAX_REVIEW_PHOTOS } from '../domain/galaxyPoints.js';
import { AUDIENCE_SEGMENTS } from '../repositories/audienceRepo.js';
import { NOTIFICATION_TYPES, REVIEW_STATUSES } from '../types/index.js';
import { MEDIA_PURPOSES } from '../types/index.js';

// ── التقييمات ──

/**
 * صور التقييم — من صفر إلى `MAX_REVIEW_PHOTOS`.
 *
 * [CRITICAL] السقف يُفرض هنا وفي القاعدة معاً، لا في فلاتر. تحقّقُ الواجهة
 * يخدم تجربة المستخدم فقط؛ من يستدعي الـAPI مباشرةً لا يمرّ بها أصلاً.
 * والعدد لا يغيّر المكافأة (خمس نقاط مقطوعة)، لكن مصفوفةً بلا سقف تفتح باب
 * تخزينٍ مفتوح على حساب المتجر.
 *
 * المصدر واحد: الرقم من `galaxyPoints` لا مكتوباً هنا.
 */
const photoUrls = z
  .array(z.string().trim().min(1, 'رابط صورة فارغ').max(500))
  .max(MAX_REVIEW_PHOTOS, `الحد الأقصى ${MAX_REVIEW_PHOTOS} صور للتقييم الواحد`)
  .default([]);

export const submitReviewSchema = z.object({
  orderId: z.string().uuid('معرّف طلب غير صالح'),
  productId: z.string().uuid('معرّف منتج غير صالح'),
  rating: z.coerce.number().int().min(1, 'التقييم من ١ إلى ٥').max(5, 'التقييم من ١ إلى ٥'),
  comment: z.string().trim().max(1000, 'التعليق طويل جداً').default(''),
  photoUrls,
});

/** فلترة صور المجتمع بقسم حقيقي — أي قيمة أخرى تُرفض ولا تُفلتر بصمت. */
export const communityPhotosQuerySchema = z.object({
  categoryId: z.string().uuid('معرّف قسم غير صالح').optional(),
});

export const resubmitReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(''),
  photoUrls,
});

export const reviewIdParamSchema = z.object({
  id: z.string().uuid('معرّف تقييم غير صالح'),
});

export const productIdParamSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const findReviewQuerySchema = z.object({
  orderId: z.string().uuid('معرّف طلب غير صالح'),
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const listReviewsAdminSchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const moderateReviewSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    rejectionReason: z.string().trim().max(300).optional(),
  })
  .refine(
    (value) => value.status !== 'rejected' || Boolean(value.rejectionReason?.trim()),
    { message: 'سبب الرفض مطلوب', path: ['rejectionReason'] },
  );

// ── المجموعات ──

export const collectionNameSchema = z.object({
  name: z.string().trim().min(1, 'اسم المجموعة مطلوب').max(60, 'الاسم طويل جداً'),
});

export const collectionIdParamSchema = z.object({
  id: z.string().uuid('معرّف مجموعة غير صالح'),
});

export const collectionProductParamSchema = z.object({
  id: z.string().uuid('معرّف مجموعة غير صالح'),
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const collectionProductBodySchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

// ── الإشعارات ──

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('معرّف إشعار غير صالح'),
});

// ── مزايا المستويات ──

/**
 * مفتاح المستوى في مسار المطالبة.
 *
 * تعدادٌ مغلق من الشيفرة لا نصّ حر: قيمةٌ غريبة يجب أن تُرفض عند الحدّ لا أن
 * تصل الخدمة فتبحث عن مستوى لا وجود له.
 */
export const rewardLevelParamSchema = z.object({
  levelKey: z.enum(
    CLAIMABLE_LEVELS.map((level) => level.key) as [string, ...string[]],
    { message: 'مستوى غير معروف' },
  ),
});

export const redemptionIdParamSchema = z.object({
  id: z.string().uuid('معرّف مزيّة غير صالح'),
});

/** تفضيل واحد (زر مبدل) — المفتاح محصَّن بالتعداد، والقيمة منطقية صراحةً. */
export const notificationPrefSchema = z.object({
  key: z.enum(['orders', 'reviews', 'stock', 'offers', 'points', 'birthday']),
  enabled: z.boolean(),
});

export const createNotificationSchema = z.object({
  userId: z.string().uuid('معرّف مستخدم غير صالح'),
  type: z.enum(NOTIFICATION_TYPES).default('promotion'),
  title: z.string().trim().min(1, 'العنوان مطلوب').max(120),
  body: z.string().trim().max(500).default(''),
});

/**
 * استهداف بثّ الإشعار.
 *
 * الشكل مميَّز بـ`audience` لا حقولاً اختيارية متناثرة: «الكل» مع قائمة
 * زبائن تناقضٌ يجب أن يُرفض عند الحدود لا أن يُفسَّر بالحدس في الخدمة.
 *
 * [CRITICAL] `.strict()` مقصود. زود يُسقط المفاتيح الزائدة بصمت افتراضياً،
 * فحمولةٌ فيها `audience: 'all'` و`userIds: [زبونان]` كانت تمرّ ويصل
 * الإعلانُ **كل** زبون في المتجر بينما ظنّ المسؤول أنه أرسله لاثنين. الرفض
 * الصريح هو الفرق بين خطأ يظهر فوراً وخطأ لا يُكتشف إلا من شكاوى الزبائن.
 */
const audienceMembers = {
  all: { audience: z.literal('all') },
  users: {
    audience: z.literal('users'),
    userIds: z
      .array(z.string().uuid('معرّف مستخدم غير صالح'))
      .min(1, 'اختر زبوناً واحداً على الأقل')
      // سقفٌ لأن الاستهداف اليدوي لعدد ضخم هو في الحقيقة «شريحة» أُسيء
      // التعبير عنها، ولأن مصفوفةً بلا حدّ تدخل الاستعلام مدخلاً مفتوحاً.
      .max(500, 'حد الاختيار اليدوي ٥٠٠ زبون — استخدم شريحة بدلاً منه'),
  },
  segment: {
    audience: z.literal('segment'),
    segment: z.enum(AUDIENCE_SEGMENTS),
    windowDays: z.coerce.number().int().min(1).max(365).optional(),
  },
} as const;

const messageFields = {
  title: z.string().trim().min(1, 'العنوان مطلوب').max(120),
  body: z.string().trim().max(500).default(''),
} as const;

export const broadcastNotificationSchema = z.discriminatedUnion('audience', [
  z.object({ ...audienceMembers.all, ...messageFields }).strict(),
  z.object({ ...audienceMembers.users, ...messageFields }).strict(),
  z.object({ ...audienceMembers.segment, ...messageFields }).strict(),
]);

/** معاينة حجم الجمهور — نفس الاستهداف بلا نصّ. */
export const audiencePreviewSchema = z.discriminatedUnion('audience', [
  z.object(audienceMembers.all).strict(),
  z.object(audienceMembers.users).strict(),
  z.object(audienceMembers.segment).strict(),
]);

// ── عيد الميلاد ──

export const setBirthdaySchema = z.object({
  day: z.coerce.number().int().min(1, 'يوم غير صالح').max(31, 'يوم غير صالح'),
  month: z.coerce.number().int().min(1, 'شهر غير صالح').max(12, 'شهر غير صالح'),
});

// ── الوسائط ──

export const uploadPurposeSchema = z.object({
  purpose: z.enum(MEDIA_PURPOSES).default('review'),
});
