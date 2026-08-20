import { z } from 'zod';

export const addFavoriteSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const favoriteParamSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const addCartItemSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
  quantity: z.number().int().min(1).max(100).default(1),
  optionValue: z
    .string()
    .trim()
    .max(80)
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