import { z } from 'zod';

export const createFranchiseSchema = z.object({
  name: z.string().trim().min(1, 'اسم الأنمي مطلوب').max(80),
  imageUrl: z.string().trim().max(500).nullish(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateFranchiseSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  imageUrl: z.string().trim().max(500).nullish(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const franchiseIdParamSchema = z.object({
  id: z.string().uuid('معرّف أنمي غير صالح'),
});

// ── مناطق التوصيل ──

export const createZoneSchema = z.object({
  governorateId: z.string().uuid('معرّف محافظة غير صالح'),
  name: z.string().trim().min(1, 'اسم المنطقة مطلوب').max(80),
  deliveryFee: z.coerce.number().min(0, 'رسوم غير صالحة'),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateZoneSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  deliveryFee: z.coerce.number().min(0).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
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
});
