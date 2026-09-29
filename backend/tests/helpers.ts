import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';

export const app: Express = createApp();
export const api = request(app);

/**
 * الاعتماد الافتراضي للتسجيل في الاختبارات.
 *
 * ═══ لم يعد هناك رمز تحقق ═══ كان هنا `DEV_CODE = '123456'` يُرسل إلى
 * `/api/auth/verify`. التسجيل صار طلباً تحسمه الإدارة، فالتفعيل في
 * الاختبارات يمرّ من **المسار الإداري الحقيقي** (`approveAsAdmin`) لا من
 * رمزٍ ولا من كتابة مباشرة في القاعدة — حتى يبقى الاختبار شاهداً على أن
 * لا مسار عاماً يفعّل حساباً.
 */
export const TEST_PASSWORD = 'secret123';

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
    ['بغداد اختبار'],
  );
  const governorateId = governorate?.id ?? (
    await db.query<{ id: string }>('SELECT id FROM governorates WHERE name = $1', ['بغداد اختبار'])
  ).rows[0]!.id;

  return { categoryId, subcategoryId, productIds, governorateId };
}

/**
 * يسجّل مستخدماً (رقم فريد) ويعيد التوكن.
 *
 * `gender` جزءٌ من التسجيل الآن ولا يُقبل الطلب بدونه — لذلك يُرسَل هنا في
 * المُساعد المشترك بدل تكرارِه في كل سويت. القيمة الافتراضية `male` اختيارُ
 * تثبيتٍ لا افتراضٌ عن المستخدمين؛ سويت الجنس تختبر الصيغتين صراحةً.
 */
export async function registerAndLogin(
  phone = `077${Math.floor(10000000 + Math.random() * 89999999)}`,
  gender: 'male' | 'female' = 'male',
) {
  const password = TEST_PASSWORD;
  const registered = await api
    .post('/api/auth/register')
    .send({ username: 'مختبر', phone, password, gender })
    .expect(202);
  // الحساب لا يفتح جلسةً قبل موافقة الإدارة — وهذا ما يُختبر صراحةً في
  // `account-requests.test.ts`. هنا نوافق عبر المسار الإداري الحقيقي.
  await approveAsAdmin(registered.body.data.request.id as string);
  const login = await api.post('/api/auth/login').send({ phone, password }).expect(200);
  // الرقم يُعاد بالصيغة التي خزّنها الخادم لا بالتي أُرسلت، فتصحّ أي مقارنة
  // في السويتات بلا أن تعرف كلٌّ منها قاعدة التطبيع.
  return {
    phone: login.body.data.user.phone as string,
    password,
    token: login.body.data.token as string,
    userId: login.body.data.user.id as string,
    gender,
  };
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
  // [CRITICAL] النطاق ‎+96478… لا +96477…. المسؤول المشترك كان `07700000000`
  // (الآن `+9647700000000`)، وهو يطابق نمط `purgeTestUsers` فيُحذف كلما
  // نظّفت سويتٌ مستخدميها. كل سويت أخرى تحمل توكن هذا المسؤول كانت تتلقّى
  // بعدها 401 لأن صفّه اختفى — وهو مصدر فشلٍ يتنقّل بحسب ترتيب التنفيذ
  // فتختلف النتيجة بين تشغيلين على شيفرة واحدة. فصلُ النطاقين يجعل التنظيف
  // لا يمسّ المسؤول أبداً. الرقم بالصيغة المخزنة مباشرةً (تطبيع الـ API لا
  // يشمل هذا الإدراج المباشر، والقيد الجديد يفرض الصيغة الدولية).
  const phone = '+9647800000000';
  const passwordHash = await bcrypt.hash(ADMIN_TEST_PASSWORD, 10);
  await db.query(
    // المسؤول المشترك **أعلى** (هجرة ٠٦٨) — يملك كل الأقسام كما كان يملكها
    // المسؤول الوحيد قبل التقسيم، فلا تتغيّر دلالة أي اختبارٍ قائم.
    `INSERT INTO users (username, phone, password_hash, role, phone_verified_at,
                        is_super_admin, admin_permissions)
     VALUES ($1, $2, $3, 'admin', now(), TRUE, '{}')
     ON CONFLICT (phone) DO UPDATE
       SET role = 'admin',
           is_super_admin = TRUE,
           admin_permissions = '{}',
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

/**
 * مسؤولٌ **فرعي** بصلاحياتٍ محدَّدة — لاختبارات الصلاحيات.
 *
 * نطاق الأرقام ‎+964780000xxxx (اللاحقة ١..٩٩٩٩): خارج `purgeTestUsers` (‎+96477…) كالمسؤول
 * المشترك، فلا يحذفه تنظيف سويتٍ أخرى. كل نداء يعيد ضبط صلاحيات الرقم
 * نفسه، فالاختبار يحدّد ما يملكه المسؤول لا ما تبقّى من اختبارٍ سابق.
 * `purgeSubAdmins` يحذف هذه الصفوف في `afterAll`.
 */
export async function createSubAdmin(
  permissions: string[],
  options: { suffix?: number; username?: string } = {},
): Promise<{ token: string; userId: string; phone: string; password: string }> {
  const n = options.suffix ?? 1;
  // ‎+9647800000000 هو المسؤول المشترك (الأعلى) — اللاحقة صفر تعيد ضبطه فرعياً.
  if (!Number.isInteger(n) || n < 1 || n > 9999) throw new Error('createSubAdmin: suffix 1..9999');
  const phone = `+964780000${String(n).padStart(4, '0')}`;
  const password = 'sub-admin-password-1';
  const passwordHash = await bcrypt.hash(password, 4);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (username, phone, password_hash, role, phone_verified_at,
                        is_super_admin, admin_permissions)
     VALUES ($1, $2, $3, 'admin', now(), FALSE, $4::text[])
     ON CONFLICT (phone) DO UPDATE
       SET role = 'admin',
           is_super_admin = FALSE,
           admin_permissions = EXCLUDED.admin_permissions,
           password_hash = EXCLUDED.password_hash,
           is_active = TRUE,
           phone_verified_at = now()
     RETURNING id`,
    [options.username ?? 'مسؤول فرعي', phone, passwordHash, permissions],
  );
  const login = await api.post('/api/auth/login').send({ phone, password }).expect(200);
  return { token: login.body.data.token as string, userId: rows[0]!.id, phone, password };
}

/** حذف المسؤولين الفرعيين الذين أنشأتهم الاختبارات (‎+964780000xxxx، غير الأعلى). */
export async function purgeSubAdmins() {
  await db.query(
    `DELETE FROM users WHERE phone LIKE '+964780000%' AND role = 'admin' AND NOT is_super_admin`,
  );
}

/**
 * يوافق على طلب تسجيلٍ بصفة مسؤول — عبر `POST /api/admin/account-requests/:id/approve`.
 *
 * المسار الإداري نفسه الذي تستعمله اللوحة: لا كتابة مباشرة في
 * `phone_verified_at`، فلو انكسر التفعيل الحقيقي انكسرت كل الاختبارات معه.
 */
export async function approveAsAdmin(requestId: string) {
  const adminToken = await createAdminUser();
  await api
    .post(`/api/admin/account-requests/${requestId}/approve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
}

/**
 * تنظيف مستخدمي الاختبار بترتيب يعتمديات FK (أولاً ما يقيّد الحذف).
 *
 * النمط بالصيغة المعتمدة `+96477%` لأن الأرقام تُخزَّن الآن دولية. وهو
 * يغطّي مستخدمي `registerAndLogin` (‎077…) ولا يغطّي المسؤول (‎078…) عمداً.
 */
export async function purgeTestUsers(pattern = '+96477%') {
  const sub = `(SELECT id FROM users WHERE phone LIKE $1)`;
  await db.query(`DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE user_id IN ${sub})`, [pattern]);
  await db.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id IN ${sub})`, [pattern]);
  await db.query(`DELETE FROM orders WHERE user_id IN ${sub}`, [pattern]);
  await db.query(`DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN ${sub})`, [pattern]);
  await db.query(`DELETE FROM carts WHERE user_id IN ${sub}`, [pattern]);
  await db.query(`DELETE FROM favorites WHERE user_id IN ${sub}`, [pattern]);
  await db.query('DELETE FROM account_requests WHERE submitted_phone LIKE $1', [pattern]);
  await db.query('DELETE FROM users WHERE phone LIKE $1', [pattern]);
}
/**
 * [NOTE] `fastForwardRatingWindow` حُذفت.
 *
 * كانت تُزحزح `rating_available_at` إلى الماضي لتجعل التقييم مستحقاً، لأن
 * التقييم كان يُفتح بعد مهلة من الخروج للتوصيل. صار يُفتح بتأكيد الاستلام
 * نفسه، فلا نافذة تُنتظر ولا زمن يُزحزَح: كل طلبٍ بلغ COMPLETED قابل
 * للتقييم فوراً.
 *
 * ما بقي من `rating_reminder_at` يخصّ **إشعار** التذكير وحده، وتزحزحه
 * سويت التذكيرات بنفسها حين تحتاجه.
 */

/**
 * يسجّل صورة مرفوعة فعلاً ويعيد رابطها.
 *
 * صورة التقييم يجب أن تكون ملفاً يعرفه الخادم (صفّاً في `media_files`)، لا
 * أي رابط يرسله العميل. تكتب هذه الدالة الصفّ مباشرةً بدل المرور بـ
 * multipart، فيبقى فحص الملكية مفعَّلاً في الاختبار بدل الالتفاف عليه.
 */
/**
 * «اليوم» (يوم/شهر) بتقويم المتجر — كما يقيسه الخادم في كل استعلام ميلاد.
 *
 * السويتات التي تسجّل «عيد ميلادي اليوم» يجب أن تسأل التقويم نفسه لا
 * `new Date().getDate()`: على خادم تكامل يعمل بـUTC يختلف التاريخان ثلاث
 * ساعات كل ليلة، فيتحوّل اختبارٌ صحيح إلى فشلٍ عابر بحسب ساعة التشغيل.
 */
export async function storeToday(): Promise<{ day: number; month: number }> {
  const { rows } = await db.query<{ d: string; m: string }>(
    `SELECT EXTRACT(DAY FROM (now() AT TIME ZONE $1))::text AS d,
            EXTRACT(MONTH FROM (now() AT TIME ZONE $1))::text AS m`,
    [config.storeTimezone],
  );
  return { day: Number(rows[0]!.d), month: Number(rows[0]!.m) };
}

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
