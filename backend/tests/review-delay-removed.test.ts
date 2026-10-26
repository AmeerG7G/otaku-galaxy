import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { config } from '../src/config/index.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * إزالة مهلة فتح التقييم — لا إعداد، ولا باب خلفي، ولا مسار ميت.
 *
 * [CRITICAL] إخفاءُ حقلٍ من اللوحة ليس إزالة. ما يُقاس هنا أن المفتاح لا
 * يُكتب من أي مسار، وأن لا شيء في المنظومة يقرؤه، وأن العمود الذي كان
 * يحمل المهلة لم يعد يقرّر أهلية أحد.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

async function dispatchedOrder() {
  const user = await registerAndLogin();
  await api
    .post('/api/cart')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ productId: catalog.productIds[0]!, quantity: 1 })
    .expect(200);
  const created = await api
    .post('/api/orders')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      governorateId: catalog.governorateId,
      fullAddress: 'بغداد، الكرادة',
      phone: '07733333333',
    })
    .expect(201);
  const orderId = created.body.data.id as string;
  await api
    .patch(`/api/admin/orders/${orderId}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'OUT_FOR_DELIVERY' })
    .expect(200);
  return { user, orderId };
}

describe('مهلة فتح التقييم أُزيلت', () => {
  it('[CRITICAL] لا مسار يكتب `order_rating_delay_hours`', async () => {
    // المسار المخصّص أُزيل.
    for (const call of [
      api.get('/api/admin/settings/business'),
      api.patch('/api/admin/settings/business').send({ order_rating_delay_hours: 1 }),
    ]) {
      const res = await call.set('Authorization', `Bearer ${adminToken}`);
      expect([404, 405]).toContain(res.status);
    }

    // والمسار العام لا يقبل المفتاح.
    await api
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ order_rating_delay_hours: 1 });

    const { rows } = await db.query(
      `SELECT 1 FROM store_settings WHERE key = 'order_rating_delay_hours'`,
    );
    expect(rows).toHaveLength(0);
  });

  /**
   * [CRITICAL] حتى لو دُسَّ الصفّ في القاعدة يدوياً، لا شيء يقرؤه.
   *
   * هذا هو الفرق بين «أُزيل من الواجهة» و«أُزيل». لو بقي قارئٌ في مكان ما
   * لعادت المهلة بمجرّد إدراج صفّ.
   */
  it('[CRITICAL] صفّ مدسوس في القاعدة لا يؤخّر التقييم', async () => {
    await db.query(
      `INSERT INTO store_settings (key, value) VALUES ('order_rating_delay_hours', '999')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    try {
      const { user, orderId } = await dispatchedOrder();
      const confirmed = await api
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      // ٩٩٩ ساعة في القاعدة، والتقييم مفتوح الآن.
      expect(confirmed.body.data.canReview).toBe(true);
      await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          orderId,
          productId: catalog.productIds[0]!,
          rating: 5,
          comment: 'مفتوح رغم الصفّ المدسوس',
        })
        .expect(201);
    } finally {
      await db.query(
        `DELETE FROM store_settings WHERE key = 'order_rating_delay_hours'`,
      );
    }
  });

  it('العقد لم يعد يحمل موعد فتح التقييم', async () => {
    const { user, orderId } = await dispatchedOrder();
    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const detail = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(detail.body.data.canReview).toBe(true);
    expect(detail.body.data).not.toHaveProperty('ratingAvailable');
    expect(detail.body.data).not.toHaveProperty('ratingAvailableAt');
  });

  it('العمود القديم لم يعد موجوداً باسمه', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'orders'
          AND column_name IN ('rating_available_at', 'rating_reminder_at')`,
    );
    const names = rows.map((r) => r.column_name);
    expect(names).toContain('rating_reminder_at');
    expect(names).not.toContain('rating_available_at');
  });

  /**
   * ما بقي من المهلة يخصّ الإشعار وحده، وهو ثابت تشغيلي في البيئة لا
   * إعداد في المتصفح.
   */
  it('مهلة التذكير ثابت بيئي لا إعداد لوحة', () => {
    expect(config.orders.reviewReminderDelayHours).toBe(16);
    expect(config.orders).not.toHaveProperty('ratingDelayHours');
  });
});
