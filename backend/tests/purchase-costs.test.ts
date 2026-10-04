import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';
import { approve, complete, createProduct, placeOrder, reject } from './orderFixtures.js';

/**
 * تكلفة الشراء التاريخية (D1).
 *
 * [CRITICAL] كل بندٍ يحمل التكلفة السارية **لحظة قبول طلبه** وصفّها المرجعي، مرة
 * واحدة. تغيير تكلفة المنتج لاحقاً لا يمسّ ربح أي طلبٍ سابق؛ وبندٌ لمنتجٍ بلا
 * تكلفة مسجّلة يبقى بلا لقطة — «الربح غير متاح» — ولا يُملأ من تكلفةٍ حالية أبداً.
 */

let adminToken: string;
let productsOnly: { token: string };
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function itemCosts(orderId: string) {
  const { rows } = await db.query<{ product_id: string; unit_cost: string | null; cost_entry_id: string | null }>(
    'SELECT product_id, unit_cost, cost_entry_id FROM order_items WHERE order_id = $1 ORDER BY product_id',
    [orderId],
  );
  return rows;
}

beforeAll(async () => {
  adminToken = await createAdminUser();
  productsOnly = await createSubAdmin(['products', 'analytics'], { suffix: 73 });
  catalog = await seedTestCatalog();
});

afterAll(async () => {
  await purgeTestUsers();
  await purgeSubAdmins();
});

describe('سجلّ التكلفة من اللوحة', () => {
  it('[SECURITY] للمسؤول الأعلى وحده — حتى من يملك المنتجات والتحليلات يُرفض', async () => {
    const product = await createProduct({ categoryId: catalog.categoryId, price: 10000 });
    await api.get(`/api/admin/products/${product.id}/costs`).set(bearer(productsOnly.token)).expect(403);
    await api
      .post(`/api/admin/products/${product.id}/costs`)
      .set(bearer(productsOnly.token))
      .send({ unitCost: 4000 })
      .expect(403);
  });

  it('[CRITICAL] إلحاقٌ فقط، الأحدث هو الساري، ويُسجَّل في سجلّ النشاط', async () => {
    const product = await createProduct({ categoryId: catalog.categoryId, price: 10000 });
    await api.post(`/api/admin/products/${product.id}/costs`).set(bearer(adminToken)).send({ unitCost: 4000 }).expect(201);
    const second = await api
      .post(`/api/admin/products/${product.id}/costs`)
      .set(bearer(adminToken))
      .send({ unitCost: 4500.5, note: 'سعر المورّد الجديد' })
      .expect(201);
    const list = await api.get(`/api/admin/products/${product.id}/costs`).set(bearer(adminToken)).expect(200);
    expect(list.body.data.current.id).toBe(second.body.data.id);
    expect(list.body.data.entries.map((e: { unitCost: number }) => e.unitCost)).toEqual([4500.5, 4000]);

    const { rows } = await db.query<{ details: Record<string, unknown> }>(
      "SELECT details FROM admin_audit_log WHERE action = 'product.cost_entry_added' AND target_id = $1 ORDER BY created_at",
      [product.id],
    );
    expect(rows.map((r) => r.details.unitCost)).toEqual([4000, 4500.5]);
  });

  it('مدخلاتٌ غير صالحة تُرفض: صفر، سالب، ثلاث منازل، نص، تأريخ رجعي، منتج غير موجود', async () => {
    const product = await createProduct({ categoryId: catalog.categoryId, price: 10000 });
    for (const body of [
      { unitCost: 0 },
      { unitCost: -1 },
      { unitCost: 10.123 },
      { unitCost: '4000' },
      { unitCost: 4000, effectiveFrom: '2020-01-01' },
    ]) {
      await api.post(`/api/admin/products/${product.id}/costs`).set(bearer(adminToken)).send(body).expect(400);
    }
    await api
      .post('/api/admin/products/00000000-0000-0000-0000-000000000000/costs')
      .set(bearer(adminToken))
      .send({ unitCost: 4000 })
      .expect(404);
  });

  it('منتجات اللوحة لا تكشف التكلفة', async () => {
    const product = await createProduct({ categoryId: catalog.categoryId, price: 10000 });
    await api.post(`/api/admin/products/${product.id}/costs`).set(bearer(adminToken)).send({ unitCost: 4000 }).expect(201);
    const list = await api.get('/api/admin/products').query({ search: product.name }).set(bearer(productsOnly.token)).expect(200);
    expect(JSON.stringify(list.body)).not.toMatch(/unitCost|unit_cost|cost/i);
  });
});

describe('لقطة التكلفة عند القبول', () => {
  it('[CRITICAL] تُلتقط لحظة القبول بصفّها المرجعي، ولا تتبع تغيّر التكلفة بعده', async () => {
    const customer = await registerAndLogin();
    const withCost = await createProduct({ categoryId: catalog.categoryId, price: 10000 });
    const withoutCost = await createProduct({ categoryId: catalog.categoryId, price: 8000 });
    const entry = await api
      .post(`/api/admin/products/${withCost.id}/costs`)
      .set(bearer(adminToken))
      .send({ unitCost: 4000 })
      .expect(201);

    const orderId = await placeOrder(customer.token, catalog.governorateId, [
      { productId: withCost.id, quantity: 2 },
      { productId: withoutCost.id, quantity: 1 },
    ]);
    // قبل القبول: لا لقطة.
    expect((await itemCosts(orderId)).every((row) => row.unit_cost === null)).toBe(true);

    await approve(adminToken, orderId);
    const captured = await itemCosts(orderId);
    expect(captured.find((r) => r.product_id === withCost.id)).toEqual({
      product_id: withCost.id,
      unit_cost: '4000.00',
      cost_entry_id: entry.body.data.id,
    });
    // منتجٌ بلا تكلفة مسجّلة: لا قيمة مختلَقة.
    expect(captured.find((r) => r.product_id === withoutCost.id)).toMatchObject({ unit_cost: null, cost_entry_id: null });

    // تكلفةٌ جديدة بعد القبول — للمنتجين — لا تمسّ الطلب المقبول ولا تملأ الفارغ.
    await api.post(`/api/admin/products/${withCost.id}/costs`).set(bearer(adminToken)).send({ unitCost: 9000 }).expect(201);
    await api.post(`/api/admin/products/${withoutCost.id}/costs`).set(bearer(adminToken)).send({ unitCost: 3000 }).expect(201);
    await complete(adminToken, orderId);
    expect(await itemCosts(orderId)).toEqual(captured);
  });

  it('الطلب المنتظر لا يلتقط شيئاً، والرفض بعد القبول لا يمحو اللقطة', async () => {
    const customer = await registerAndLogin();
    const product = await createProduct({ categoryId: catalog.categoryId, price: 10000 });
    await api.post(`/api/admin/products/${product.id}/costs`).set(bearer(adminToken)).send({ unitCost: 4000 }).expect(201);

    const pending = await placeOrder(customer.token, catalog.governorateId, [{ productId: product.id, quantity: 1 }]);
    await reject(adminToken, pending);
    expect((await itemCosts(pending))[0]!.unit_cost).toBeNull();

    const approved = await placeOrder(customer.token, catalog.governorateId, [{ productId: product.id, quantity: 1 }]);
    await approve(adminToken, approved);
    await reject(adminToken, approved);
    expect((await itemCosts(approved))[0]!.unit_cost).toBe('4000.00');
  });
});
