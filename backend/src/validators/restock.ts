import { z } from 'zod';

/** «أخبرني عند توفره» — الاشتراك بمنتج نافد المخزون. */
export const restockSubscribeSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});

export const restockProductParamSchema = z.object({
  productId: z.string().uuid('معرّف منتج غير صالح'),
});