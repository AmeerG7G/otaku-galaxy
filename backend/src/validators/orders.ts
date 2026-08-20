import { z } from 'zod';
import { ORDER_STATUSES } from '../types/order-status.js';

export const createOrderSchema = z.object({
  governorateId: z.string().uuid('اختر محافظة صالحة'),
  fullAddress: z.string().trim().min(5, 'العنوان قصير جداً').max(300),
  phone: z.string().regex(/^07\d{9}$/, 'رقم الهاتف غير صالح'),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid('معرّف طلب غير صالح'),
});

export const listOrdersSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
});

export const adminOrderIdParamSchema = z.object({
  id: z.string().uuid('معرّف طلب غير صالح'),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional(),
});