import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db } from '../src/database/pool.js';
import { api } from './helpers.js';

/**
 * طلبات حقيقية للاختبار — عبر المسارات الفعلية (السلة ← الطلب ← انتقالات الإدارة)،
 * لا بإدراجٍ مباشر في القاعدة: التسعير والخصومات واللقطات والمخزون كلها تمرّ
 * من الشيفرة نفسها التي يمرّ بها الإنتاج.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function createProduct(input: {
  categoryId: string;
  subcategoryId?: string | null;
  price: number;
  previousPrice?: number | null;
  stock?: number;
  label?: string;
}): Promise<{ id: string; name: string }> {
  const name = `${input.label ?? 'منتج'} ${randomUUID().slice(0, 8)}`;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, previous_price, category_id, subcategory_id, stock)
     VALUES ($1, '', $2, $3, $4, $5, $6) RETURNING id`,
    [name, input.price, input.previousPrice ?? null, input.categoryId, input.subcategoryId ?? null, input.stock ?? 50],
  );
  return { id: rows[0]!.id, name };
}

export async function placeOrder(
  token: string,
  governorateId: string,
  lines: Array<{ productId: string; quantity: number }>,
): Promise<string> {
  for (const line of lines) {
    await api.post('/api/cart').set(bearer(token)).send(line).expect(200);
  }
  const order = await api
    .post('/api/orders')
    .set(bearer(token))
    .send({ governorateId, fullAddress: 'عنوان اختبار التحليلات', phone: '07711111111' });
  expect(order.status, JSON.stringify(order.body)).toBe(201);
  return order.body.data.id as string;
}

export async function transition(adminToken: string, orderId: string, status: string, note?: string) {
  const res = await api
    .patch(`/api/admin/orders/${orderId}/status`)
    .set(bearer(adminToken))
    .send(note ? { status, note } : { status });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

export const approve = (adminToken: string, orderId: string) => transition(adminToken, orderId, 'OUT_FOR_DELIVERY');
export const complete = (adminToken: string, orderId: string) => transition(adminToken, orderId, 'COMPLETED');
export const reject = (adminToken: string, orderId: string) =>
  transition(adminToken, orderId, 'REJECTED', 'رفض اختبار');
