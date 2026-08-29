import { z } from 'zod';
import { PRODUCT_SORTS } from '../types/index.js';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const listProductsSchema = paginationSchema.extend({
  categoryId: z.string().uuid('معرّف قسم غير صالح').optional(),
  subcategoryId: z.string().uuid('معرّف قسم فرعي غير صالح').optional(),
  offer: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  selected: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(PRODUCT_SORTS).optional(),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid('معرّف منتج غير صالح'),
});

export const searchSchema = paginationSchema.extend({
  q: z.string().trim().min(1, 'أدخل نص البحث').max(120),
});