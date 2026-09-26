import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * تفاصيل الطلب في اللوحة: الكمية المطلوبة **والمخزون الحالي** (قرار المالك، STEP 59).
 *
 * المخزون المعروض هو المخزون **الآن** — يُقرأ من `products` عند كل فتحٍ للطلب،
 * لا لقطةٌ من لحظة الإنشاء. وهو معلومةٌ للمسؤول لا قرار: القبول يعيد قراءة المخزون
 * تحت القفل ويستهلكه ذرّياً (§47.1)، فرقمٌ رآه المسؤول قبل لحظة لا يُعتمد أبداً.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PREFIX = 'CURSTOCK';

describe('admin order detail — requested quantity next to the current real stock', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    adminToken = await createAdminUser();
    catalog = await seedTestCatalog();
  });

  afterAll(async () => {
    await purgeTestUsers();
    await db.query(`DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${PREFIX} %')`);
  });

  async function product(name: string, stock: number) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', 10000, $2, $3, TRUE) RETURNING id`,
      [`${PREFIX} ${name} ${Date.now()}`, catalog.categoryId, stock],
    );
    return rows[0]!.id;
  }

  async function order(productId: string, quantity: number) {
    const c = await registerAndLogin();
    await api.post('/api/cart').set(bearer(c.token)).send({ productId, quantity }).expect(200);
    const res = await api.post('/api/orders').set(bearer(c.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة، شارع ٦٢', phone: '07700000000' })
      .expect(201);
    return { id: res.body.data.id as string, customer: c };
  }

  const detail = async (orderId: string) =>
    (await api.get(`/api/admin/orders/${orderId}`).set(bearer(adminToken)).expect(200)).body.data;

  const status = (orderId: string, next: string, note?: string) =>
    api.patch(`/api/admin/orders/${orderId}/status`).set(bearer(adminToken))
      .send(next === 'REJECTED' ? { status: next, note: note ?? 'سبب' } : { status: next });

  const stockOf = async (id: string) =>
    Number((await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id])).rows[0]!.stock);

  it('a pending order shows the requested quantity and the current stock', async () => {
    const p = await product('shown', 6);
    const { id } = await order(p, 3);
    const d = await detail(id);
    expect(d.status).toBe('PENDING_ADMIN_CONFIRMATION');
    expect(d.items).toEqual([expect.objectContaining({ productId: p, quantity: 3, currentStock: 6 })]);
  });

  it('the stock is read when the order is opened, not snapshotted at creation', async () => {
    const p = await product('live', 6);
    const { id } = await order(p, 3);
    await api.patch(`/api/admin/products/${p}`).set(bearer(adminToken)).send({ stock: 2 }).expect(200);
    expect((await detail(id)).items[0].currentStock).toBe(2);
    await api.patch(`/api/admin/products/${p}`).set(bearer(adminToken)).send({ stock: 9 }).expect(200);
    expect((await detail(id)).items[0].currentStock).toBe(9);
  });

  it('[CRITICAL] stock 1, two pending orders: after A is approved B shows 0 — never the old 1 — and B cannot be approved', async () => {
    const p = await product('race', 1);
    const a = await order(p, 1);
    const b = await order(p, 1);
    expect((await detail(b.id)).items[0].currentStock).toBe(1);

    expect((await status(a.id, 'OUT_FOR_DELIVERY')).status).toBe(200);
    expect(await stockOf(p)).toBe(0);
    expect((await detail(b.id)).items[0]).toMatchObject({ quantity: 1, currentStock: 0 });

    // الرقم المعروض قبل لحظة (1) لا يُعتمد: القبول يعيد القراءة تحت القفل.
    const approval = await status(b.id, 'OUT_FOR_DELIVERY');
    expect(approval.status).toBe(409);
    expect(approval.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(p)).toBe(0);
    expect((await detail(b.id)).status).toBe('PENDING_ADMIN_CONFIRMATION');

    // B لم يستهلك شيئاً، فرفضُه لا يُرجع شيئاً.
    expect((await status(b.id, 'REJECTED', 'نفد المخزون')).status).toBe(200);
    expect(await stockOf(p)).toBe(0);

    // A استهلك فعلاً، فرفضُه بعد القبول يُرجع قطعته مرةً واحدة.
    expect((await status(a.id, 'REJECTED', 'رفض الاستلام')).status).toBe(200);
    expect(await stockOf(p)).toBe(1);
    expect((await detail(a.id)).items[0].currentStock).toBe(1);
  });

  it('a product removed from the database shows no stock rather than a guessed number', async () => {
    const p = await product('gone', 4);
    const { id } = await order(p, 1);
    await db.query('UPDATE order_items SET product_id = NULL WHERE order_id = $1', [id]);
    expect((await detail(id)).items[0].currentStock).toBeNull();
  });

  it('the customer never receives the store stock in their order', async () => {
    const p = await product('private', 5);
    const { id, customer } = await order(p, 1);
    const mine = (await api.get(`/api/orders/${id}`).set(bearer(customer.token)).expect(200)).body.data;
    expect(mine.items[0]).not.toHaveProperty('currentStock');
  });
});
