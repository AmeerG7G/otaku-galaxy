import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/database/pool.js';

export const app: Express = createApp();
export const api = request(app);

export const DEV_CODE = '123456';

/** بذور بيانات مشتركة للاختبارات: قسم + منتجات + محافظة. */
export async function seedTestCatalog() {
  const { rows: [category] } = await db.query<{ id: string }>(
    `INSERT INTO categories (name, image_url)
     VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING id`,
    ['ملابس اختبار', ''],
  );
  const categoryId = category?.id ?? (
    await db.query<{ id: string }>('SELECT id FROM categories WHERE name = $1', ['ملابس اختبار'])
  ).rows[0]!.id;

  const { rows: [subcategory] } = await db.query<{ id: string }>(
    `INSERT INTO subcategories (category_id, name)
     VALUES ($1, $2) ON CONFLICT (category_id, name) DO NOTHING RETURNING id`,
    [categoryId, 'تيشيرتات'],
  );
  const subcategoryId = subcategory?.id ?? (
    await db.query<{ id: string }>(
      'SELECT id FROM subcategories WHERE category_id = $1 AND name = $2',
      [categoryId, 'تيشيرتات'],
    )
  ).rows[0]!.id;

  const productIds: string[] = [];
  for (const name of ['تيشيرت اختبار A', 'تيشيرت اختبار B', 'دفتر اختبار C']) {
    const { rows: [p] } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_offer, is_selected)
       VALUES ($1, $2, $3, $4, $5, 10, TRUE, FALSE)
       ON CONFLICT DO NOTHING RETURNING id`,
      [name, 'وصف اختبار', 15000, categoryId, subcategoryId],
    );
    const productId = p?.id ?? (
      await db.query<{ id: string }>('SELECT id FROM products WHERE name = $1', [name])
    ).rows[0]!.id;
    productIds.push(productId);
  }

  const { rows: [governorate] } = await db.query<{ id: string }>(
    `INSERT INTO governorates (name, delivery_fee)
     VALUES ($1, 4000) ON CONFLICT (name) DO NOTHING RETURNING id`,
    ['بغداد'],
  );
  const governorateId = governorate?.id ?? (
    await db.query<{ id: string }>('SELECT id FROM governorates WHERE name = $1', ['بغداد'])
  ).rows[0]!.id;

  return { categoryId, subcategoryId, productIds, governorateId };
}

/** يسجّل مستخدماً (رقم فريد) ويعيد التوكن. */
export async function registerAndLogin(phone = `077${Math.floor(10000000 + Math.random() * 89999999)}`) {
  const password = 'secret123';
  await api.post('/api/auth/register').send({ username: 'مختبر', phone, password }).expect(200);
  await api.post('/api/auth/verify').send({ phone, code: DEV_CODE }).expect(200);
  const login = await api.post('/api/auth/login').send({ phone, password }).expect(200);
  return { phone, password, token: login.body.data.token as string, userId: login.body.data.user.id as string };
}

export async function createAdminUser() {
  const phone = '07700000000';
  const passwordHash = await bcrypt.hash('admin123', 10);
  await db.query(
    `INSERT INTO users (username, phone, password_hash, role)
     VALUES ($1, $2, $3, 'admin') ON CONFLICT (phone) DO UPDATE SET role = 'admin'`,
    ['مدير', phone, passwordHash],
  );
  const login = await api.post('/api/auth/login').send({ phone, password: 'admin123' }).expect(200);
  return login.body.data.token as string;
}

/** تنظيف مستخدمي الاختبار بترتيب يعتمديات FK (أولاً ما يقيّد الحذف). */
export async function purgeTestUsers(pattern = '077%') {
  const sub = `(SELECT id FROM users WHERE phone LIKE $1)`;
  await db.query(`DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE user_id IN ${sub})`, [pattern]);
  await db.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id IN ${sub})`, [pattern]);
  await db.query(`DELETE FROM orders WHERE user_id IN ${sub}`, [pattern]);
  await db.query(`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN ${sub})`, [pattern]);
  await db.query(`DELETE FROM carts WHERE user_id IN ${sub}`, [pattern]);
  await db.query(`DELETE FROM favorites WHERE user_id IN ${sub}`, [pattern]);
  await db.query('DELETE FROM verification_codes WHERE phone LIKE $1', [pattern]);
  await db.query('DELETE FROM users WHERE phone LIKE $1', [pattern]);
}