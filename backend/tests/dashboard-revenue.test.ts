import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { statsRepo } from '../src/repositories/statsRepo.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';
import { approve, complete, createProduct, placeOrder } from './orderFixtures.js';

/**
 * إيراد «الرئيسية» (D4) — يبقى تحت صلاحية `dashboard`، بتعريفٍ مصحَّح.
 *
 * [CRITICAL] كان `SUM(orders.total)`: يشمل رسوم التوصيل التي يدفعها الزبون، ويعدّ
 * طلبات المسؤولين، و«هذا الشهر» بمنطقة جلسة القاعدة. الآن: مجموع المنتجات ناقص
 * خصوماتها، لطلبات الأعمال، وحدود الشهر بتوقيت المتجر — مطابقاً للتحليلات.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function stats() {
  const res = await api.get('/api/admin/stats').set(bearer(adminToken)).expect(200);
  return res.body.data as { revenue: { completed: number; completedThisMonth: number; inProgress: number }; customers: { total: number } };
}

beforeAll(async () => {
  adminToken = await createAdminUser();
  catalog = await seedTestCatalog();
});

afterAll(async () => {
  await purgeTestUsers();
});

describe('إيراد الرئيسية', () => {
  it('[CRITICAL] طلبٌ مكتمل يضيف مجموع منتجاته بلا رسوم التوصيل', async () => {
    const customer = await registerAndLogin();
    const product = await createProduct({ categoryId: catalog.categoryId, price: 12000 });
    const before = await stats();
    const orderId = await placeOrder(customer.token, catalog.governorateId, [{ productId: product.id, quantity: 1 }]);
    const pending = await stats();
    expect(pending.revenue.inProgress - before.revenue.inProgress).toBe(12000);
    await approve(adminToken, orderId);
    await complete(adminToken, orderId);
    const after = await stats();
    // الطلب الكلي ١٦٠٠٠ (مع توصيل ٤٠٠٠) — الإيراد ١٢٠٠٠.
    expect(after.revenue.completed - before.revenue.completed).toBe(12000);
    expect(after.revenue.completedThisMonth - before.revenue.completedThisMonth).toBe(12000);
    expect(after.revenue.inProgress).toBe(before.revenue.inProgress);
  });

  it('[CRITICAL] طلب الحساب الداخلي لا يدخل الإيراد', async () => {
    const customer = await registerAndLogin();
    await api
      .patch(`/api/admin/customers/${customer.userId}/internal`)
      .set(bearer(adminToken))
      .send({ isInternal: true, reason: 'حساب اختبار' })
      .expect(200);
    const product = await createProduct({ categoryId: catalog.categoryId, price: 9000 });
    const before = await stats();
    const orderId = await placeOrder(customer.token, catalog.governorateId, [{ productId: product.id, quantity: 1 }]);
    await approve(adminToken, orderId);
    await complete(adminToken, orderId);
    const after = await stats();
    expect(after.revenue.completed).toBe(before.revenue.completed);
  });

  it('[CRITICAL] «هذا الشهر» يبدأ عند منتصف ليل بغداد لا منتصف ليل الخادم', async () => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [bounds] } = await client.query<{ start: Date }>(
        `SELECT date_trunc('month', now() AT TIME ZONE $1) AT TIME ZONE $1 AS start`,
        [config.storeTimezone],
      );
      const { rows: [user] } = await client.query<{ id: string }>(
        `INSERT INTO users (username, phone, password_hash, gender, phone_verified_at)
         VALUES ('حدود', $1, 'x', 'male', now()) RETURNING id`,
        [`+96477${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`],
      );
      const before = await statsRepo.dashboard(client, config.storeTimezone);
      for (const [offsetMs, amount] of [[-1000, 1000], [0, 3000]] as const) {
        await client.query(
          `INSERT INTO orders (number, user_id, governorate_id, province, full_address, phone, products_total,
                               delivery_fee, discount, total, status, created_at, delivered_at)
           VALUES ($1, $2, $3, 'بغداد', 'عنوان', '+9647700000000', $4, 0, 0, $4, 'COMPLETED', $5, $5)`,
          [`DR-${randomUUID().slice(0, 8)}`, user!.id, catalog.governorateId, amount, new Date(bounds!.start.getTime() + offsetMs)],
        );
      }
      const after = await statsRepo.dashboard(client, config.storeTimezone);
      expect(after.revenue.completedThisMonth - before.revenue.completedThisMonth).toBe(3000);
      expect(after.revenue.completed - before.revenue.completed).toBe(4000);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('طلب تسجيلٍ معلَّق ليس زبوناً', async () => {
    const before = await stats();
    await api
      .post('/api/auth/register')
      .send({ username: 'معلّق', phone: `077${Math.floor(10000000 + Math.random() * 89999999)}`, password: 'secret123', gender: 'female' })
      .expect(202);
    const after = await stats();
    expect(after.customers.total).toBe(before.customers.total);
  });
});
