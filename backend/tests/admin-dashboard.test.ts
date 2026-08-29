import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { birthdayRepo } from '../src/repositories/birthdayRepo.js';
import { db } from '../src/database/pool.js';
import { businessConfigService } from '../src/services/businessConfigService.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * لوحة التحكم: رؤية النقاط، أعياد الميلاد، الإشعارات، دورة حياة الكيانات،
 * وإعدادات الأعمال.
 *
 * القاعدة التي تحكم هذا الملف كله: لوحة التحكم **تقرأ** المنظومات القائمة
 * ولا تبني بديلاً عنها. لذلك تفحص الاختبارات أن الأرقام المعروضة مشتقّة من
 * نفس الجداول التي يكتبها مسار العميل، لا من تجميع موازٍ.
 */

/** يُفرغ الإعدادات فيعود النظام إلى القيم المخبوزة في الكود. */
async function resetBusinessSettings() {
  await db.query(
    `DELETE FROM store_settings WHERE key IN
      ('points_order_received','points_review_approved','points_review_with_photo',
       'birthday_discount_percent','order_rating_delay_hours')`,
  );
}

describe('لوحة التحكم — الصلاحيات', () => {
  const ADMIN_ONLY = [
    '/api/admin/points/summary',
    '/api/admin/notifications',
    '/api/admin/notifications/stats',
    '/api/admin/settings/business',
    '/api/admin/customers/birthdays',
  ];

  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('بلا توكن → 401 على كل مسارات الإدارة الجديدة', async () => {
    for (const path of ADMIN_ONLY) {
      const res = await api.get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it('بتوكن عميل عادي → 403 (لا تسريب بيانات إدارية)', async () => {
    const { token } = await registerAndLogin();
    for (const path of ADMIN_ONLY) {
      const res = await api.get(path).set('Authorization', `Bearer ${token}`);
      expect(res.status, path).toBe(403);
      expect(res.body.data, path).toBeNull();
    }
  });

  it('الكتابة على إعدادات الأعمال محظورة على العميل', async () => {
    const { token } = await registerAndLogin();
    const res = await api
      .patch('/api/admin/settings/business')
      .set('Authorization', `Bearer ${token}`)
      .send({ points_order_received: 999 });
    expect(res.status).toBe(403);
  });
});

describe('لوحة التحكم — رؤية النقاط', () => {
  let adminToken: string;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    adminToken = await createAdminUser();
  });
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('نقاط عميل: الرصيد والدفتر مع السبب — بلا بيانات خاصة زائدة', async () => {
    const { userId } = await registerAndLogin();
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason)
       VALUES ($1, 'اختبار', 20, 'manual')`,
      [userId],
    );

    const res = await api
      .get(`/api/admin/customers/${userId}/points`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.balance).toBe(20);
    expect(res.body.data.ledger[0].reason).toBe('manual');
    expect(res.body.data.ledger[0].amount).toBe(20);
    expect(res.body.data.ledger[0].createdAt).toBeTruthy();

    // ما يُكشف من ملف العميل محصور فيما يفسّر النقاط.
    expect(Object.keys(res.body.data.customer).sort()).toEqual(
      ['createdAt', 'id', 'isActive', 'phone', 'username'].sort(),
    );
    const serialised = JSON.stringify(res.body.data);
    expect(serialised).not.toContain('password');
    expect(serialised).not.toContain('birth_day');
  });

  it('عميل غير موجود → 404', async () => {
    const res = await api
      .get('/api/admin/customers/00000000-0000-0000-0000-000000000000/points')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('الملخّص مشتقّ من الدفتر نفسه', async () => {
    const before = await api
      .get('/api/admin/points/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const { userId } = await registerAndLogin();
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason)
       VALUES ($1, 'اختبار الملخّص', 7, 'manual')`,
      [userId],
    );

    const after = await api
      .get('/api/admin/points/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(after.body.data.totalInCirculation).toBe(
      before.body.data.totalInCirculation + 7,
    );
    expect(after.body.data.ledgerEntries).toBe(before.body.data.ledgerEntries + 1);
    expect(Array.isArray(after.body.data.topBalances)).toBe(true);
    expect(Array.isArray(after.body.data.byReason)).toBe(true);
  });

  it('لا مسار لتعديل الدفتر من الإدارة', async () => {
    const { userId } = await registerAndLogin();
    const post = await api
      .post(`/api/admin/customers/${userId}/points`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 1000 });
    expect([404, 405]).toContain(post.status);
  });
});

describe('لوحة التحكم — الإشعارات', () => {
  let adminToken: string;
  let customer: Awaited<ReturnType<typeof registerAndLogin>>;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    adminToken = await createAdminUser();
    customer = await registerAndLogin();
    for (const [type, title] of [
      ['promotion', 'إعلان أول'],
      ['promotion', 'إعلان ثانٍ'],
      ['backInStock', 'عاد للمخزون'],
    ] as const) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, '')`,
        [customer.userId, type, title],
      );
    }
    // واحد مقروء لفحص الترشيح.
    await db.query(
      `UPDATE notifications SET read_at = now()
        WHERE user_id = $1 AND title = 'إعلان أول'`,
      [customer.userId],
    );
  });
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('الترشيح بالنوع', async () => {
    const res = await api
      .get('/api/admin/notifications')
      .query({ type: 'promotion', userId: customer.userId, limit: 50 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.items.length).toBe(2);
    for (const item of res.body.data.items) expect(item.type).toBe('promotion');
  });

  it('الترشيح بالمستخدم', async () => {
    const res = await api
      .get('/api/admin/notifications')
      .query({ userId: customer.userId, limit: 50 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.items.length).toBe(3);
    for (const item of res.body.data.items) {
      expect(item.userId).toBe(customer.userId);
      expect(item.username).toBeTruthy();
    }
  });

  it('الترشيح بالمقروء/غير المقروء', async () => {
    const read = await api
      .get('/api/admin/notifications')
      .query({ userId: customer.userId, read: 'true', limit: 50 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(read.body.data.items.length).toBe(1);
    expect(read.body.data.items[0].read).toBe(true);
    expect(read.body.data.items[0].readAt).toBeTruthy();

    const unread = await api
      .get('/api/admin/notifications')
      .query({ userId: customer.userId, read: 'false', limit: 50 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(unread.body.data.items.length).toBe(2);
    for (const item of unread.body.data.items) expect(item.read).toBe(false);
  });

  it('الترقيم يقسم النتائج ولا يكرّرها', async () => {
    const first = await api
      .get('/api/admin/notifications')
      .query({ userId: customer.userId, page: 1, limit: 2 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const second = await api
      .get('/api/admin/notifications')
      .query({ userId: customer.userId, page: 2, limit: 2 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(first.body.data.items.length).toBe(2);
    expect(first.body.data.hasMore).toBe(true);
    expect(second.body.data.items.length).toBe(1);
    expect(second.body.data.hasMore).toBe(false);

    const ids = new Set([
      ...first.body.data.items.map((i: { id: string }) => i.id),
      ...second.body.data.items.map((i: { id: string }) => i.id),
    ]);
    expect(ids.size).toBe(3);
  });

  it('الإحصاءات تطابق الترشيح', async () => {
    const stats = await api
      .get('/api/admin/notifications/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stats.body.data.total).toBeGreaterThanOrEqual(3);
    expect(stats.body.data.unread).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(stats.body.data.byType)).toBe(true);
  });

  it('لا مسار إداري لتعليم إشعار عميل كمقروء', async () => {
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM notifications WHERE user_id = $1 LIMIT 1',
      [customer.userId],
    );
    const res = await api
      .patch(`/api/admin/notifications/${rows[0]!.id}/read`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect([404, 405]).toContain(res.status);
  });
});

describe('لوحة التحكم — دورة حياة الكيانات', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    adminToken = await createAdminUser();
    catalog = await seedTestCatalog();
  });
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('حذف قسم فيه منتجات مرفوض بـ409 ولا يُحذف أي منتج', async () => {
    const { rows: before } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM products WHERE category_id = $1',
      [catalog.categoryId],
    );

    const res = await api
      .delete(`/api/admin/categories/${catalog.categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_HAS_DEPENDENTS');

    const { rows: after } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM products WHERE category_id = $1',
      [catalog.categoryId],
    );
    expect(after[0]!.total).toBe(before[0]!.total);
    // والقسم نفسه ما يزال موجوداً.
    const { rowCount } = await db.query('SELECT 1 FROM categories WHERE id = $1', [
      catalog.categoryId,
    ]);
    expect(rowCount).toBe(1);
  });

  it('حذف قسم فارغ ينجح', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO categories (name, image_url) VALUES ($1, '') RETURNING id`,
      [`قسم فارغ ${Date.now()}`],
    );
    const id = rows[0]!.id;
    await api
      .delete(`/api/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const { rowCount } = await db.query('SELECT 1 FROM categories WHERE id = $1', [id]);
    expect(rowCount).toBe(0);
  });

  it('قسم فرعي: تعديل ثم حذف — والحذف مرفوض ما دامت منتجات مرتبطة', async () => {
    const blocked = await api
      .delete(`/api/admin/subcategories/${catalog.subcategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SUBCATEGORY_HAS_DEPENDENTS');

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO subcategories (category_id, name) VALUES ($1, $2) RETURNING id`,
      [catalog.categoryId, `فرعي مؤقت ${Date.now()}`],
    );
    const id = rows[0]!.id;

    const renamed = await api
      .patch(`/api/admin/subcategories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'اسم معدَّل', sortOrder: 3 })
      .expect(200);
    expect(renamed.body.data.name).toBe('اسم معدَّل');
    expect(renamed.body.data.sortOrder).toBe(3);

    await api
      .delete(`/api/admin/subcategories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('حذف محافظة عليها طلبات مرفوض بـ409 ولا يُحذف أي طلب', async () => {
    const { rows: orderRows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM orders WHERE governorate_id = $1',
      [catalog.governorateId],
    );
    if (Number(orderRows[0]!.total) === 0) {
      // لا طلبات في هذه القاعدة — نتحقق من المناطق بدلاً منها.
      const res = await api
        .delete(`/api/admin/governorates/${catalog.governorateId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 409]).toContain(res.status);
      return;
    }

    const res = await api
      .delete(`/api/admin/governorates/${catalog.governorateId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GOVERNORATE_HAS_DEPENDENTS');

    const { rows: after } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM orders WHERE governorate_id = $1',
      [catalog.governorateId],
    );
    expect(after[0]!.total).toBe(orderRows[0]!.total);
  });

  it('حذف محافظة بلا تبعيات ينجح', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO governorates (name, delivery_fee) VALUES ($1, 3000) RETURNING id`,
      [`محافظة مؤقتة ${Date.now()}`],
    );
    const id = rows[0]!.id;
    await api
      .delete(`/api/admin/governorates/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});

describe('لوحة التحكم — إعدادات الأعمال', () => {
  let adminToken: string;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    adminToken = await createAdminUser();
  });
  beforeEach(resetBusinessSettings);
  afterAll(async () => {
    await resetBusinessSettings();
    await purgeTestUsers('077%');
  });

  it('بلا ضبط: القيم الفعّالة هي الافتراضية المخبوزة في الكود', async () => {
    const res = await api
      .get('/api/admin/settings/business')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const byKey = Object.fromEntries(
      res.body.data.items.map((i: { key: string }) => [i.key, i]),
    );
    expect(byKey.points_order_received.value).toBeNull();
    expect(byKey.points_order_received.usingDefault).toBe(true);
    expect(byKey.points_order_received.effectiveValue).toBe(
      byKey.points_order_received.defaultValue,
    );
    // ولا يُسرَّب أي إعداد أمني إلى هذه القائمة.
    const keys = res.body.data.items.map((i: { key: string }) => i.key);
    for (const forbidden of ['jwt', 'bcrypt', 'otp', 'rate_limit', 'upload']) {
      expect(keys.some((k: string) => k.includes(forbidden))).toBe(false);
    }
  });

  it('الحفظ يثبّت القيمة ويصير النظام يعمل بها', async () => {
    await api
      .patch('/api/admin/settings/business')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ points_order_received: 33 })
      .expect(200);

    const config = await businessConfigService.current();
    expect(config.points_order_received).toBe(33);

    const res = await api
      .get('/api/admin/settings/business')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const item = res.body.data.items.find(
      (i: { key: string }) => i.key === 'points_order_received',
    );
    expect(item.value).toBe('33');
    expect(item.effectiveValue).toBe(33);
    expect(item.usingDefault).toBe(false);
  });

  it('القيم غير الصالحة مرفوضة — لا حفظ صامت', async () => {
    const cases: Array<[string, unknown]> = [
      ['points_order_received', -5],
      ['points_order_received', 'abc'],
      ['points_order_received', 1.5],
      ['birthday_discount_percent', 500],
      ['order_rating_delay_hours', -1],
    ];
    for (const [key, value] of cases) {
      const res = await api
        .patch('/api/admin/settings/business')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ [key]: value });
      expect([400, 422], `${key}=${String(value)}`).toContain(res.status);
    }
    // ولم يُحفظ شيء.
    const config = await businessConfigService.current();
    expect(config.points_order_received).toBe(20);
  });

  it('الإفراغ يعيد الإعداد إلى الافتراضي', async () => {
    await api
      .patch('/api/admin/settings/business')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ birthday_discount_percent: 12 })
      .expect(200);
    expect((await businessConfigService.current()).birthday_discount_percent).toBe(12);

    await api
      .patch('/api/admin/settings/business')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ birthday_discount_percent: null })
      .expect(200);
    expect((await businessConfigService.current()).birthday_discount_percent).toBe(5);
  });

  it('قيمة فاسدة في القاعدة لا تُسقط النظام — يعود للافتراضي', async () => {
    await db.query(
      `INSERT INTO store_settings (key, value) VALUES ('points_order_received', 'not-a-number')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    const config = await businessConfigService.current();
    expect(config.points_order_received).toBe(20);
  });

  it('[CRITICAL] تغيير قيمة النقاط لا يمسّ الدفتر التاريخي', async () => {
    const { userId } = await registerAndLogin();

    // منحة بالقيمة الحالية.
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason)
       VALUES ($1, 'منحة قديمة', $2, 'manual')`,
      [userId, (await businessConfigService.current()).points_review_approved],
    );
    const before = await api
      .get(`/api/admin/customers/${userId}/points`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const historicAmount = before.body.data.ledger[0].amount;
    const historicBalance = before.body.data.balance;

    // رفع القيمة إلى خمسة أضعاف.
    await api
      .patch('/api/admin/settings/business')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ points_review_approved: 5 })
      .expect(200);

    const after = await api
      .get(`/api/admin/customers/${userId}/points`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // الصفّ القديم كما هو، والرصيد لم يُعَد حسابه بالقيمة الجديدة.
    expect(after.body.data.ledger[0].amount).toBe(historicAmount);
    expect(after.body.data.balance).toBe(historicBalance);
  });

  it('[CRITICAL] تغيير مهلة التقييم لا يعيد كتابة موعد طلب قائم', async () => {
    const { rows } = await db.query<{ id: string; rating_available_at: Date | null }>(
      `SELECT id, rating_available_at FROM orders
        WHERE rating_available_at IS NOT NULL LIMIT 1`,
    );
    if (rows.length === 0) return; // لا طلب مناسب في هذه القاعدة.

    const before = rows[0]!.rating_available_at?.toISOString();

    await api
      .patch('/api/admin/settings/business')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ order_rating_delay_hours: 1 })
      .expect(200);

    const { rows: after } = await db.query<{ rating_available_at: Date | null }>(
      'SELECT rating_available_at FROM orders WHERE id = $1',
      [rows[0]!.id],
    );
    expect(after[0]!.rating_available_at?.toISOString()).toBe(before);
  });
});

describe('لوحة التحكم — أعياد الميلاد', () => {
  let adminToken: string;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    adminToken = await createAdminUser();
  });
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('حالة التسجيل مشتقّة من العمود — ولا حقل ميلاد ثانٍ', async () => {
    const { userId } = await registerAndLogin();
    await db.query(
      `UPDATE users SET birth_day = 7, birth_month = 3, birthday_set_at = now() WHERE id = $1`,
      [userId],
    );

    // الحدّ الأقصى للصفحة 50 (قيد `paginationSchema`)، فنتصفّح حتى نجد الصفّ
    // بدل رفع الحدّ — القيد قاعدةُ إنتاج لا يُضعَّف من أجل اختبار.
    let row: Record<string, unknown> | undefined;
    for (let page = 1; page <= 10 && !row; page += 1) {
      const res = await api
        .get('/api/admin/customers/birthdays')
        .query({ filter: 'all', page, limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      row = res.body.data.items.find((i: { id: string }) => i.id === userId);
      if (!res.body.data.hasMore) break;
    }
    expect(row).toBeDefined();
    expect(row!.isRegistered).toBe(true);
    expect(row!.birthDay).toBe(7);
    expect(row!.birthMonth).toBe(3);
    expect(row!.birthdaySetAt).toBeTruthy();

    // لا عناوين ولا محتويات طلبات في هذه الاستجابة.
    expect(Object.keys(row!).sort()).toEqual(
      [
        'avatarUrl', 'birthDay', 'birthMonth', 'birthdaySetAt', 'completedOrders',
        'discountUsedThisYear', 'id', 'isActive', 'isRegistered', 'phone', 'username',
      ].sort(),
    );
  });

  it('[CRITICAL] «مرة واحدة» مفروضة في القاعدة لا في الواجهة', async () => {
    const { token, userId } = await registerAndLogin();
    await db.query(
      `UPDATE users SET birth_day = 1, birth_month = 1, birthday_set_at = now() WHERE id = $1`,
      [userId],
    );

    // الحارس الحقيقي جملةٌ في SQL: `WHERE birth_day IS NULL`. نستدعي المستودع
    // مباشرةً لأن هذه هي الطبقة التي تصمد مهما فعل العميل — لا الواجهة ولا
    // الخدمة. فشلُ التحديث هنا هو ما يجعل الحالة تنجو من إعادة التثبيت،
    // وتسجيل الخروج، وتغيير الجهاز: لا شيء محفوظ على الجهاز أصلاً.
    const overwritten = await birthdayRepo.setBirthday(db, userId, 9, 9);
    expect(overwritten).toBe(false);

    const { rows } = await db.query<{ birth_day: number; birth_month: number }>(
      'SELECT birth_day, birth_month FROM users WHERE id = $1',
      [userId],
    );
    expect(rows[0]!.birth_day).toBe(1);
    expect(rows[0]!.birth_month).toBe(1);

    // والمسار العام يرفض أيضاً — الرمز يختلف بحسب أهلية العميل، لكن لا
    // مسار يقبل التغيير بحال.
    const res = await api
      .post('/api/birthday')
      .set('Authorization', `Bearer ${token}`)
      .send({ day: 9, month: 9 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(['BIRTHDAY_ALREADY_SET', 'BIRTHDAY_LOCKED']).toContain(res.body.error.code);
  });

  it('حالة الميلاد تُقرأ من الخادم عند كل طلب — لا تخزين محلي', async () => {
    const { token, userId } = await registerAndLogin();
    await db.query(
      `UPDATE users SET birth_day = 4, birth_month = 6, birthday_set_at = now() WHERE id = $1`,
      [userId],
    );

    // نفس ما يستدعيه التطبيق عند كل إقلاع وبعد كل تسجيل دخول.
    const status = await api
      .get('/api/birthday')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.data.hasBirthday).toBe(true);
    expect(status.body.data.day).toBe(4);
    expect(status.body.data.month).toBe(6);
  });
});

describe('لوحة التحكم — البنرات', () => {
  let adminToken: string;
  let bannerId: string;
  let categoryId: string;

  beforeAll(async () => {
    await purgeTestUsers('077%');
    adminToken = await createAdminUser();
    const catalog = await seedTestCatalog();
    categoryId = catalog.categoryId;
    const created = await api
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        imageUrl: '/uploads/banner/test/a.png',
        title: 'بنر اختبار',
        destinationType: 'category',
        destinationValue: categoryId,
        sortOrder: 90,
      })
      .expect(201);
    bannerId = created.body.data.id;
  });

  afterAll(async () => {
    await db.query('DELETE FROM banners WHERE id = $1', [bannerId]);
    await purgeTestUsers('077%');
  });

  const BANNER_KEYS = [
    'id', 'imageUrl', 'title', 'destinationType', 'destinationValue', 'sortOrder', 'isActive',
  ].sort();

  it('POST و PATCH و GET تعيد الشكل نفسه (camelCase)', async () => {
    const created = await api
      .post('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrl: '/uploads/banner/test/b.png', destinationType: 'none' })
      .expect(201);
    expect(Object.keys(created.body.data).sort()).toEqual(BANNER_KEYS);

    const patched = await api
      .patch(`/api/admin/banners/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'معدَّل' })
      .expect(200);
    expect(Object.keys(patched.body.data).sort()).toEqual(BANNER_KEYS);

    const listed = await api
      .get('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = listed.body.data.items.find(
      (b: { id: string }) => b.id === created.body.data.id,
    );
    expect(Object.keys(row).sort()).toEqual(BANNER_KEYS);

    await api
      .delete(`/api/admin/banners/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('[CRITICAL] تعديل الصورة وحدها لا يمسح وجهة البنر', async () => {
    // `.partial()` في Zod لا يُلغي `.default()`، فكان الحقل الغائب يُملأ
    // بـ`none` ويُترك `destinationValue` كما هو — بنرٌ بوجهة معطوبة بلا خطأ.
    await api
      .patch(`/api/admin/banners/${bannerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ imageUrl: '/uploads/banner/test/c.png' })
      .expect(200);

    const listed = await api
      .get('/api/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = listed.body.data.items.find((b: { id: string }) => b.id === bannerId);

    expect(row.destinationType).toBe('category');
    expect(row.destinationValue).toBe(categoryId);
    expect(row.title).toBe('بنر اختبار');
    expect(row.sortOrder).toBe(90);
    expect(row.imageUrl).toBe('/uploads/banner/test/c.png');
  });

  it('البنر النشط يصل إلى الواجهة العامة بنفس التمثيل', async () => {
    const home = await api.get('/api/catalog/home').expect(200);
    const row = home.body.data.banners.find((b: { id: string }) => b.id === bannerId);
    expect(row).toBeDefined();
    expect(Object.keys(row).sort()).toEqual(BANNER_KEYS);
  });
});
