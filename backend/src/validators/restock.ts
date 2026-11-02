import { z } from 'zod';

/** «أخبرني عند توفره» — الاشتراك بمنتج نافد المخزون. */
export const restockSubscribeSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
  /** لونٌ بعينه في منتجٍ بألوان (088) — الغائب/`null` = المنتج كله كما كان. */
  variantId: z.string().uuid('معرّف لون غير صالح').nullish(),
});

export const restockProductParamSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

/** `DELETE /restock-subscriptions/:productId?variantId=…` — اللون اختياري (088). */
export const restockVariantQuerySchema = z.object({
  variantId: z.string().uuid('معرّف لون غير صالح').optional(),
});
