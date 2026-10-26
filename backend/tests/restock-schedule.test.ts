import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { formatExpectedRestockDate } from '../src/services/restockService.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * موعد التوفر المتوقَّع: ضبطه، تعديله، وإعلام المنتظِرين.
 *
 * الالتزامات التي تُحرَس هنا:
 *   • الموعد صفةُ المنتج (`products.restock_at`) لا نسخةٌ في كل اشتراك.
 *   • الإشعار عند **تغيّر** الموعد فعلاً لا مع كل ضغطة حفظ.
 *   • من يشترك بعد ضبط الموعد يُعلَم فوراً، ومرة واحدة.
 *   • عودة المخزون تتقدّم على أي موعد متوقَّع.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

/** منتج نافد المخزون بلا موعد — نقطة البداية لكل سيناريو. */
async function outOfStockProduct() {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
     VALUES ('توفر ' || gen_random_uuid(), 'وصف', 25000, $1, $2, 0) RETURNING id`,
    [catalog.categoryId, catalog.subcategoryId],
  );
  return rows[0]!.id;
}

function setRestockAt(productId: string, at: string | null) {
  return api
    .patch(`/api/admin/products/${productId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ restockAt: at });
}

/** يعيد طلب supertest نفسه (لا Promise) ليبقى `.expect()` قابلاً للتسلسل. */
function subscribe(token: string, productId: string) {
  return api
    .post('/api/restock-subscriptions')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId });
}

/** إشعارات موعد التوفر التي وصلت هذا الزبون عن هذا المنتج. */
async function scheduleNotices(userId: string, productId: string) {
  const { rows } = await db.query<{ title: string; body: string }>(
    `SELECT title, body FROM notifications
      WHERE user_id = $1 AND product_id = $2 AND type = 'restockScheduled'
      ORDER BY created_at`,
    [userId, productId],
  );
  return rows;
}

const SEP_15 = '2026-09-15T09:00:00.000Z';
const SEP_20 = '2026-09-20T09:00:00.000Z';

describe('صياغة التاريخ', () => {
  it('يوم وشهر بالعربية', () => {
    expect(formatExpectedRestockDate(SEP_15)).toBe('15 سبتمبر');
    expect(formatExpectedRestockDate('2026-01-03T09:00:00.000Z')).toBe('3 يناير');
  });

  /**
   * التاريخ يُقرأ بمنطقة المتجر لا بـUTC.
   *
   * ٢٢:٠٠ بتوقيت UTC يوم ١٤ هي ٠١:٠٠ من يوم ١٥ ببغداد — والمسؤول الذي ضبط
   * الموعد يقصد اليوم الذي يراه هو.
   */
  it('[CRITICAL] يُحسب بمنطقة المتجر الزمنية', () => {
    expect(formatExpectedRestockDate('2026-09-14T22:00:00.000Z')).toBe('15 سبتمبر');
  });
});

describe('ضبط الموعد بعد اشتراك الزبائن (الحالة أ)', () => {
  it('[CRITICAL] NULL → تاريخ يُعلم كل المنتظِرين', async () => {
    const productId = await outOfStockProduct();
    const a = await registerAndLogin();
    const b = await registerAndLogin();
    await subscribe(a.token, productId).then((r) => expect(r.status).toBe(200));
    await subscribe(b.token, productId).then((r) => expect(r.status).toBe(200));

    // لا إشعار موعد قبل ضبطه.
    expect(await scheduleNotices(a.userId, productId)).toHaveLength(0);

    await setRestockAt(productId, SEP_15).expect(200);

    for (const user of [a, b]) {
      const notices = await scheduleNotices(user.userId, productId);
      expect(notices).toHaveLength(1);
      expect(notices[0]!.body).toContain('15 سبتمبر');
      expect(notices[0]!.body).toContain('متوقّع توفره');
    }
  });

  it('[CRITICAL] حفظ نفس التاريخ لا يُشعر ثانيةً', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();
    await subscribe(user.token, productId).expect(200);

    await setRestockAt(productId, SEP_15).expect(200);
    expect(await scheduleNotices(user.userId, productId)).toHaveLength(1);

    // ثلاث ضغطات حفظ بنفس القيمة.
    for (let i = 0; i < 3; i++) await setRestockAt(productId, SEP_15).expect(200);
    expect(await scheduleNotices(user.userId, productId)).toHaveLength(1);
  });

  it('نفس اللحظة بصيغة إزاحة مختلفة لا تُعدّ تغييراً', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();
    await subscribe(user.token, productId).expect(200);

    await setRestockAt(productId, '2026-09-15T09:00:00.000Z').expect(200);
    expect(await scheduleNotices(user.userId, productId)).toHaveLength(1);

    // نفس اللحظة مكتوبة بإزاحة +03:00.
    await setRestockAt(productId, '2026-09-15T12:00:00+03:00').expect(200);
    expect(await scheduleNotices(user.userId, productId)).toHaveLength(1);
  });

  it('[CRITICAL] تاريخ أ → تاريخ ب يُشعر بالتعديل', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();
    await subscribe(user.token, productId).expect(200);

    await setRestockAt(productId, SEP_15).expect(200);
    await setRestockAt(productId, SEP_20).expect(200);

    const notices = await scheduleNotices(user.userId, productId);
    expect(notices).toHaveLength(2);
    expect(notices[1]!.body).toContain('20 سبتمبر');
    expect(notices[1]!.body).toContain('تم تحديث');
  });

  it('تفريغ الموعد لا يخترع إشعاراً', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();
    await subscribe(user.token, productId).expect(200);

    await setRestockAt(productId, SEP_15).expect(200);
    await setRestockAt(productId, null).expect(200);

    expect(await scheduleNotices(user.userId, productId)).toHaveLength(1);
    const { rows } = await db.query<{ restock_at: Date | null }>(
      'SELECT restock_at FROM products WHERE id = $1',
      [productId],
    );
    expect(rows[0]!.restock_at).toBeNull();
  });

  it('ضبط موعد لمنتج لا ينتظره أحد يمرّ بلا إشعارات', async () => {
    const productId = await outOfStockProduct();
    await setRestockAt(productId, SEP_15).expect(200);

    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications
        WHERE product_id = $1 AND type = 'restockScheduled'`,
      [productId],
    );
    expect(rows[0]!.n).toBe('0');
  });
});

describe('الاشتراك بعد ضبط الموعد (الحالة ب)', () => {
  it('[CRITICAL] الاشتراك يُعلم فوراً بالموعد ويعيده في الردّ', async () => {
    const productId = await outOfStockProduct();
    await setRestockAt(productId, SEP_15).expect(200);

    const user = await registerAndLogin();
    const res = await subscribe(user.token, productId).expect(200);

    expect(res.body.data.subscribed).toBe(true);
    expect(new Date(res.body.data.restockAt as string).toISOString()).toBe(SEP_15);

    const notices = await scheduleNotices(user.userId, productId);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.body).toContain('15 سبتمبر');
  });

  it('[CRITICAL] الاشتراك المتكرّر لا يُكرّر الإشعار', async () => {
    const productId = await outOfStockProduct();
    await setRestockAt(productId, SEP_15).expect(200);
    const user = await registerAndLogin();

    for (let i = 0; i < 5; i++) await subscribe(user.token, productId).expect(200);

    expect(await scheduleNotices(user.userId, productId)).toHaveLength(1);
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM restock_subscriptions
        WHERE user_id = $1 AND product_id = $2`,
      [user.userId, productId],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('اشتراك متزامن: صفّ واحد وإشعار واحد', async () => {
    const productId = await outOfStockProduct();
    await setRestockAt(productId, SEP_15).expect(200);
    const user = await registerAndLogin();

    await Promise.all(
      Array.from({ length: 6 }, () => subscribe(user.token, productId)),
    );

    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM restock_subscriptions
        WHERE user_id = $1 AND product_id = $2`,
      [user.userId, productId],
    );
    expect(rows[0]!.n).toBe('1');
    expect(await scheduleNotices(user.userId, productId)).toHaveLength(1);
  });

  it('الاشتراك بلا موعد يحتفظ بالسلوك القائم — لا إشعار', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();

    const res = await subscribe(user.token, productId).expect(200);
    expect(res.body.data.restockAt).toBeNull();
    expect(await scheduleNotices(user.userId, productId)).toHaveLength(0);
  });
});

describe('حالة الزبون كما يقرؤها التطبيق', () => {
  it('«ما أنتظره» يحمل الموعد الحالي لا لقطةً قديمة', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();
    await setRestockAt(productId, SEP_15).expect(200);
    await subscribe(user.token, productId).expect(200);

    const before = await api
      .get('/api/restock-subscriptions/mine')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const rowBefore = (before.body.data as Record<string, unknown>[]).find(
      (r) => r.productId === productId,
    )!;
    expect(new Date(rowBefore.restockAt as string).toISOString()).toBe(SEP_15);

    // المسؤول يعدّل — والقراءة التالية تعطي الجديد لا المحفوظ.
    await setRestockAt(productId, SEP_20).expect(200);

    const after = await api
      .get('/api/restock-subscriptions/mine')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const rowAfter = (after.body.data as Record<string, unknown>[]).find(
      (r) => r.productId === productId,
    )!;
    expect(new Date(rowAfter.restockAt as string).toISOString()).toBe(SEP_20);
  });

  it('المنتج العام يحمل الموعد ليعرضه التطبيق', async () => {
    const productId = await outOfStockProduct();
    await setRestockAt(productId, SEP_15).expect(200);

    const res = await api.get(`/api/catalog/products/${productId}`).expect(200);
    expect(new Date(res.body.data.restockAt as string).toISOString()).toBe(SEP_15);
    expect(res.body.data.stock).toBe(0);
  });
});

describe('التوفر الفعلي يتقدّم على الموعد المتوقَّع', () => {
  it('[CRITICAL] عودة المخزون تُرسل «عاد للتوفر» وتمسح الموعد والاشتراك', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();
    await setRestockAt(productId, SEP_15).expect(200);
    await subscribe(user.token, productId).expect(200);

    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 7 })
      .expect(200);

    // إشعار التوفر الحقيقي وصل — والسلوك القائم لم يتغيّر.
    const { rows: back } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notifications
        WHERE user_id = $1 AND product_id = $2 AND type = 'backInStock'`,
      [user.userId, productId],
    );
    expect(back[0]!.n).toBe('1');

    // الموعد المتوقَّع تحقّق فلم يعد له معنى.
    const { rows: product } = await db.query<{ restock_at: Date | null; stock: number }>(
      'SELECT restock_at, stock FROM products WHERE id = $1',
      [productId],
    );
    expect(product[0]!.restock_at).toBeNull();
    expect(product[0]!.stock).toBe(7);

    // والاشتراك استُهلك — لا «بانتظار» بعد أن صار متاحاً.
    const mine = await api
      .get('/api/restock-subscriptions/mine')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(
      (mine.body.data as Record<string, unknown>[]).some(
        (r) => r.productId === productId,
      ),
    ).toBe(false);
  });

  /**
   * [CRITICAL] حفظٌ واحد يعيد المخزون **ويضبط** موعداً: «عاد للتوفر» يفوز.
   *
   * إشعارُ «متوقّع توفره يوم كذا» عن منتج صار متاحاً الآن تناقضٌ صريح.
   */
  it('[CRITICAL] الحفظ الذي يعيد المخزون ويضبط موعداً لا يُرسل موعداً', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();
    await subscribe(user.token, productId).expect(200);

    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 4, restockAt: SEP_15 })
      .expect(200);

    expect(await scheduleNotices(user.userId, productId)).toHaveLength(0);
    const { rows } = await db.query<{ restock_at: Date | null }>(
      'SELECT restock_at FROM products WHERE id = $1',
      [productId],
    );
    expect(rows[0]!.restock_at).toBeNull();
  });

  it('نفاد المخزون ثانيةً يعيد المسار الطبيعي', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();
    await subscribe(user.token, productId).expect(200);
    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 3 })
      .expect(200);

    // نفد ثانيةً: الاشتراك متاح من جديد، والموعد يُضبط ويُشعر كالمعتاد.
    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 0 })
      .expect(200);

    await subscribe(user.token, productId).expect(200);
    await setRestockAt(productId, SEP_20).expect(200);
    const notices = await scheduleNotices(user.userId, productId);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.body).toContain('20 سبتمبر');
  });
});

describe('الصلاحيات والتحقق', () => {
  it('[CRITICAL] الزبون لا يضبط موعد التوفر', async () => {
    const productId = await outOfStockProduct();
    const user = await registerAndLogin();

    const res = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ restockAt: SEP_15 });
    expect(res.status).toBe(403);

    const { rows } = await db.query<{ restock_at: Date | null }>(
      'SELECT restock_at FROM products WHERE id = $1',
      [productId],
    );
    expect(rows[0]!.restock_at).toBeNull();
  });

  it('بلا توكن يُرفض كذلك', async () => {
    const productId = await outOfStockProduct();
    const res = await api
      .patch(`/api/admin/products/${productId}`)
      .send({ restockAt: SEP_15 });
    expect(res.status).toBe(401);
  });

  it('[CRITICAL] التواريخ الفاسدة مرفوضة', async () => {
    const productId = await outOfStockProduct();
    for (const bad of [
      '15 سبتمبر',
      '2026-13-45',
      'not-a-date',
      '2026-09-15',
      12345,
      true,
      { at: SEP_15 },
    ]) {
      const res = await api
        .patch(`/api/admin/products/${productId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ restockAt: bad });
      expect([400, 422], JSON.stringify(bad)).toContain(res.status);
    }

    const { rows } = await db.query<{ restock_at: Date | null }>(
      'SELECT restock_at FROM products WHERE id = $1',
      [productId],
    );
    expect(rows[0]!.restock_at).toBeNull();
  });

  it('[CRITICAL] الزبون لا يشترك نيابةً عن غيره ولا يقرأ اشتراكاته', async () => {
    const productId = await outOfStockProduct();
    const owner = await registerAndLogin();
    const stranger = await registerAndLogin();
    await setRestockAt(productId, SEP_15).expect(200);
    await subscribe(owner.token, productId).expect(200);

    // لا حقل مستخدم يُقبل: الخادم يشتقّه من التوكن.
    await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ productId, userId: owner.userId })
      .expect(200);

    const { rows } = await db.query<{ user_id: string }>(
      'SELECT user_id FROM restock_subscriptions WHERE product_id = $1 ORDER BY created_at',
      [productId],
    );
    expect(rows.map((r) => r.user_id).sort()).toEqual(
      [owner.userId, stranger.userId].sort(),
    );

    // وقائمة الغريب لا تحمل إشعارات المالك.
    expect(await scheduleNotices(owner.userId, productId)).toHaveLength(1);
    expect(await scheduleNotices(stranger.userId, productId)).toHaveLength(1);
  });

  it('الاشتراك يحتاج جلسة', async () => {
    const productId = await outOfStockProduct();
    const res = await api.post('/api/restock-subscriptions').send({ productId });
    expect(res.status).toBe(401);
  });

  it('معرّف منتج غير صالح مرفوض عند الحدّ', async () => {
    const user = await registerAndLogin();
    const res = await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: 'not-a-uuid' });
    expect([400, 422]).toContain(res.status);
  });
});
