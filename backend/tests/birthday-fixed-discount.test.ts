import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  BIRTHDAY_DISCOUNT_PERCENT,
  birthdayDiscountAmount,
} from '../src/domain/birthday.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * خصم عيد الميلاد بعد تثبيت نسبته.
 *
 * ما تغيّر: مصدر النسبة فقط — من `store_settings` يضبطها المسؤول، إلى ثابت
 * في `domain/birthday.ts`. وما لم يتغيّر — الأهلية، ومرة واحدة في السنة،
 * ودخول الخصم في حساب نقاط الشراء — هو ما تحرسه هذه السويت.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

async function productAt(price: number) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
     VALUES ('ميلاد ' || gen_random_uuid(), 'وصف', $1, $2, $3, 200) RETURNING id`,
    [price, catalog.categoryId, catalog.subcategoryId],
  );
  return rows[0]!.id;
}

/** زبون له طلب مكتمل (شرط أهلية الميلاد) وتاريخ ميلاد مسجَّل. */
async function eligibleCustomer(seedProductId: string) {
  const user = await registerAndLogin();
  await api
    .post('/api/cart')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ productId: seedProductId, quantity: 1 })
    .expect(200);
  const first = await api
    .post('/api/orders')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      governorateId: catalog.governorateId,
      fullAddress: 'بغداد، الكرادة',
      phone: '07733333333',
    })
    .expect(201);
  for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
    await api
      .patch(`/api/admin/orders/${first.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status })
      .expect(200);
  }

  const today = new Date();
  await api
    .post('/api/birthday')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ day: today.getDate(), month: today.getMonth() + 1 })
    .expect(200);
  return user;
}

function placeOrder(token: string, productId: string) {
  return api
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity: 1 })
    .then(() =>
      api
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          governorateId: catalog.governorateId,
          fullAddress: 'بغداد، الكرادة',
          phone: '07733333333',
        }),
    );
}

describe('نسبة خصم الميلاد ثابتة', () => {
  it('[CRITICAL] النسبة ٥٪ — قاعدة لا إعداد', () => {
    expect(BIRTHDAY_DISCOUNT_PERCENT).toBe(5);
  });

  it('الحساب يطبّق النسبة على مجموع المنتجات', () => {
    expect(birthdayDiscountAmount(100_000)).toBe(5_000);
    expect(birthdayDiscountAmount(30_000)).toBe(1_500);
    // التقريب كما كان قبل التثبيت حرفياً — لا تتغيّر مبالغ الطلبات.
    expect(birthdayDiscountAmount(9_999)).toBe(500);
    expect(birthdayDiscountAmount(0)).toBe(0);
    expect(birthdayDiscountAmount(-5_000)).toBe(0);
  });

  it('[CRITICAL] لا مسار في الـAPI يغيّرها', async () => {
    for (const call of [
      api.get('/api/admin/settings/business'),
      api.patch('/api/admin/settings/business').send({ birthday_discount_percent: 40 }),
    ]) {
      const res = await call.set('Authorization', `Bearer ${adminToken}`);
      expect([404, 405]).toContain(res.status);
    }

    // ولا المسار العام يقبل المفتاح.
    await api
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ birthday_discount_percent: 40 });
    const { rows } = await db.query(
      `SELECT 1 FROM store_settings WHERE key = 'birthday_discount_percent'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('حالة الميلاد التي يقرؤها التطبيق تعلن ٥٪', async () => {
    const seed = await productAt(20_000);
    const user = await eligibleCustomer(seed);

    const res = await api
      .get('/api/birthday')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(res.body.data.discountPercent).toBe(5);
  });
});

describe('تطبيق خصم الميلاد على الطلب', () => {
  it('[CRITICAL] يُطبَّق ٥٪ على مجموع المنتجات', async () => {
    const seed = await productAt(20_000);
    const user = await eligibleCustomer(seed);

    const target = await productAt(100_000);
    const order = await placeOrder(user.token, target);
    expect(order.status).toBe(201);
    expect(Number(order.body.data.discount)).toBe(5_000);
    // وليس مزيّة مستوى — هذا خصم ميلاد.
    expect(Number(order.body.data.loyaltyDiscount)).toBe(0);
  });

  it('[CRITICAL] مرة واحدة في السنة — الطلب التالي بلا خصم', async () => {
    const seed = await productAt(20_000);
    const user = await eligibleCustomer(seed);
    const target = await productAt(100_000);

    const first = await placeOrder(user.token, target);
    expect(Number(first.body.data.discount)).toBe(5_000);

    const second = await placeOrder(user.token, target);
    expect(second.status).toBe(201);
    expect(Number(second.body.data.discount)).toBe(0);

    // وصفّ استهلاك واحد لهذه السنة لا أكثر.
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM birthday_discount_usage
        WHERE user_id = $1 AND used_year = EXTRACT(YEAR FROM now())::int`,
      [(await api.get('/api/auth/me').set('Authorization', `Bearer ${user.token}`)).body
        .data.user.id],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('زبون بلا طلب مكتمل غير مؤهَّل — لا خصم', async () => {
    const user = await registerAndLogin();
    const target = await productAt(100_000);

    const order = await placeOrder(user.token, target);
    expect(order.status).toBe(201);
    expect(Number(order.body.data.discount)).toBe(0);
  });

  /**
   * [CRITICAL] الترابط مع نقاط المجرّة لم ينكسر.
   *
   * قيمة الشراء المؤهَّلة تطرح `discount`، وخصم الميلاد جزء منه. طلبٌ بـ
   * ١٠٠٬٠٠٠ بخصم ميلاد ٥٬٠٠٠ ⇒ ٩٥٬٠٠٠ ⇒ ٤٥ نقطة لا ٥٠.
   */
  it('[CRITICAL] نقاط الشراء تُحسب بعد خصم الميلاد', async () => {
    const seed = await productAt(20_000);
    const user = await eligibleCustomer(seed);
    // الطلب الأول (البذرة) منح نقاطاً: ٢٠٬٠٠٠ ⇒ ١٠ نقاط.
    const before = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const target = await productAt(100_000);
    const order = await placeOrder(user.token, target);
    expect(Number(order.body.data.discount)).toBe(5_000);
    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api
        .patch(`/api/admin/orders/${order.body.data.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }

    const after = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(after.body.data.balance - before.body.data.balance).toBe(45);
  });
});
