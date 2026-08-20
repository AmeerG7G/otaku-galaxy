import { z } from 'zod';

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
  images: z.array(z.string().url('رابط صورة غير صالح').trim()).max(10).default([]),
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
});

export const adminProductUpdateSchema = adminProductCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).max(1_000_000).optional(),
});

export const adminCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  imageUrl: z.string().url('رابط صورة غير صالح').nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const adminSubcategorySchema = z.object({
  categoryId: z.string().uuid('معرّف قسم غير صالح'),
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const adminBannerSchema = z.object({
  imageUrl: z.string().url('رابط صورة غير صالح'),
  title: z.string().trim().max(120).nullable().optional(),
  destinationType: z.enum(['product', 'category', 'subcategory', 'none']).default('none'),
  destinationValue: z.string().trim().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const adminGovernorateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  deliveryFee: z.number().min(0).max(10_000_000),
});

export type AdminProductCreateInput = z.infer<typeof adminProductCreateSchema>;
export type AdminProductUpdateInput = z.infer<typeof adminProductUpdateSchema>;
export type AdminBannerInput = z.infer<typeof adminBannerSchema>;