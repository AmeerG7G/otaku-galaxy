import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
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

/** كلمة مرور المسؤول في الاختبارات — قيمة محلية للسويت لا قيمة افتراضية للمنتج. */
const ADMIN_TEST_PASSWORD = 'test-admin-password-not-a-default';

/**
 * مسؤول جاهز للاختبارات.
 *
 * `phone_verified_at` يُضبط صراحةً لأن الإدراج المباشر يتخطّى مسار التحقق،
 * وتسجيل الدخول صار يرفض أي حساب لم يُثبت ملكية رقمه.
 */
export async function createAdminUser() {
  const phone = '07700000000';
  const passwordHash = await bcrypt.hash(ADMIN_TEST_PASSWORD, 10);
  await db.query(
    `INSERT INTO users (username, phone, password_hash, role, phone_verified_at)
     VALUES ($1, $2, $3, 'admin', now())
     ON CONFLICT (phone) DO UPDATE
       SET role = 'admin',
           password_hash = EXCLUDED.password_hash,
           is_active = TRUE,
           phone_verified_at = now()`,
    ['مدير', phone, passwordHash],
  );
  const login = await api
    .post('/api/auth/login')
    .send({ phone, password: ADMIN_TEST_PASSWORD })
    .expect(200);
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
/**
 * محاكاة مرور مهلة التقييم.
 *
 * تُزحزح الطوابع الثلاثة معاً (الإرسال، الاستلام، النافذة) بنفس المقدار،
 * فيبقى القيد `rating_available_at >= dispatched_at` صحيحاً ويصير التقييم
 * مستحقاً الآن. هذا أصدق من تعطيل المهلة في الاختبارات: القاعدة الإنتاجية
 * نفسها تبقى مفعَّلة، والاختبار هو من ينقل الزمن.
 */
export async function fastForwardRatingWindow(orderId: string, hours = 25) {
  const { rowCount } = await db.query(
    `UPDATE orders
        SET dispatched_at = dispatched_at - make_interval(hours => $2),
            delivered_at = delivered_at - make_interval(hours => $2),
            rating_available_at = rating_available_at - make_interval(hours => $2)
      WHERE id = $1 AND dispatched_at IS NOT NULL`,
    [orderId, hours],
  );
  if ((rowCount ?? 0) === 0) {
    throw new Error(
      `fastForwardRatingWindow: الطلب ${orderId} لم يخرج للتوصيل بعد`,
    );
  }
}

/**
 * يسجّل صورة مرفوعة فعلاً ويعيد رابطها.
 *
 * صورة التقييم يجب أن تكون ملفاً يعرفه الخادم (صفّاً في `media_files`)، لا
 * أي رابط يرسله العميل. تكتب هذه الدالة الصفّ مباشرةً بدل المرور بـ
 * multipart، فيبقى فحص الملكية مفعَّلاً في الاختبار بدل الالتفاف عليه.
 */
export async function registerUploadedPhoto(uploadedBy?: string) {
  const storageKey = `review/test/${randomUUID()}.png`;
  // [CRITICAL] مرجع نسبي — نفس ما يكتبه سائق التخزين في الإنتاج.
  //
  // كان هذا السطر يبني رابطاً مطلقاً من `publicBaseUrl`، فتفحص الاختباراتُ
  // تمثيلاً لا تنتجه المنظومة أصلاً منذ توحيد الوسائط (هجرة 021). أي عطل
  // يخصّ المرجع النسبي كان سيمرّ بلا أن يمسّه اختبار.
  const url = `${config.uploads.publicPath}/${storageKey}`;
  await db.query(
    `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, 'review', 'image/png', 1024, $3)`,
    [storageKey, url, uploadedBy ?? null],
  );
  return url;
}
