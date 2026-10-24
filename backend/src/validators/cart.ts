import { z } from 'zod';
import { MAX_OPTION_VALUE_TEXT_LENGTH } from '../domain/productOptions.js';

/** رسالة `cartService.addItem` نفسها: نصٌّ لا يمكن أن يطابق خيارات أي منتج. */
const INVALID_OPTION = 'اختر قيمة صالحة لكل خيار من خيارات المنتج';

export const addFavoriteSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const favoriteParamSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const addCartItemSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
  quantity: z.number().int().min(1).max(100).default(1),
  // السقف أطول تركيبةٍ صالحة لا طولُ قيمةٍ واحدة — انظر `MAX_OPTION_VALUE_TEXT_LENGTH`.
  optionValue: z
    .string({ error: INVALID_OPTION })
    .trim()
    .max(MAX_OPTION_VALUE_TEXT_LENGTH, INVALID_OPTION)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === null ? null : v)),
});

export const updateCartItemSchema = z.object({
  id: z.string().uuid('معرّف عنصر غير صالح'),
  quantity: z.number().int().min(1).max(100),
});

export const cartItemParamSchema = z.object({
  id: z.string().uuid('معرّف عنصر غير صالح'),
});