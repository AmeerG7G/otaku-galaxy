import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * [CRITICAL] تعديل المخزون من اللوحة: مقارنةٌ ثم كتابة (compare-and-set).
 *
 * ═══ العطل ═══ صفحة تعديل المنتج كانت تعيد إرسال `stock` في كل حفظ بالقيمة
 * التي فُتحت عليها، والخادم يكتبها قيمةً مطلقة. قبولُ طلبٍ بين فتح الصفحة
 * وحفظها ينزّل المخزون، ثم يمحو الحفظُ التنزيلَ — فتعود القطع المستهلكة
 * للبيع ويُقبل عليها طلبٌ آخر: بيعٌ فوق المخزون الفعلي.
 *
 * ═══ العقد ═══ `expectedStock` هو المخزون الذي فُتحت عليه الصفحة. إن اختلف
 * عن المخزون الحالي تحت القفل ⇒ `409 STOCK_CHANGED` ولا يُكتب أي حقل. غيابه
 * (لوحةٌ أقدم) يُبقي الكتابة المطلقة كما كانت — انظر Phase 17 في
 * `order-concurrency-audit.test.ts`.
 */
describe('[CRITICAL] تعديل المخزون من اللوحة لا يمحو قبولاً وقع بعد فتح الصفحة', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    const owned = `(SELECT id FROM products WHERE name LIKE 'STOCKCAS %')`;
    await db.query(`DELETE FROM order_items WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM restock_subscriptions WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM notifications WHERE product_id IN ${owned}`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE 'STOCKCAS %'`);
  });

  async function product(name: string, stock: number) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', 1000, $2, $3, TRUE) RETURNING id`,
      [`STOCKCAS ${name}`, catalog.categoryId, stock],
    );
    return rows[0]!.id;
  }

  async function row(id: string) {
    const { rows } = await db.query<{ stock: number; name: string }>(
      'SELECT stock, name FROM products WHERE id = $1',
      [id],
    );
    return { stock: Number(rows[0]!.stock), name: rows[0]!.name };
  }

  async function submitAndApprove(productId: string, quantity: number) {
    const buyer = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId, quantity })
      .expect(200);
    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07700000000' })
      .expect(201);
    await api
      .patch(`/api/admin/orders/${order.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
  }

  function patch(productId: string, body: Record<string, unknown>) {
    return api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
  }

  it('[CRITICAL] حفظٌ من صفحةٍ فُتحت قبل القبول ⇒ 409 STOCK_CHANGED، والمخزون والحقول الأخرى لا تُمسّ', async () => {
    const id = await product('قديم', 5);
    // المسؤول يفتح الصفحة: المخزون 5. ثم يُقبل طلب بثلاث قطع: المخزون 2.
    await submitAndApprove(id, 3);
    expect((await row(id)).stock).toBe(2);

    const res = await patch(id, { nameAr: 'STOCKCAS قديم مصحَّح', stock: 5, expectedStock: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STOCK_CHANGED');
    // الرسالة تقول القيمة الحالية ليقرّر المسؤول من جديد.
    expect(res.body.message).toContain('2');

    const after = await row(id);
    expect(after.stock).toBe(2);
    // لا كتابة جزئية: الاسم في الطلب المرفوض نفسه لم يُحفظ.
    expect(after.name).toBe('STOCKCAS قديم');
  });

  it('حفظٌ لا يرسل المخزون لا يمسّه — تعديل الوصف بعد القبول يُبقي التنزيل', async () => {
    const id = await product('وصف', 5);
    await submitAndApprove(id, 3);

    await patch(id, { nameAr: 'STOCKCAS وصف معدَّل' }).expect(200);
    const after = await row(id);
    expect(after.stock).toBe(2);
    expect(after.name).toBe('STOCKCAS وصف معدَّل');
  });

  it('تعديلٌ مقصود بقيمةٍ مبنيّة على المخزون الحالي يُكتب', async () => {
    const id = await product('مقصود', 5);
    await submitAndApprove(id, 3);

    await patch(id, { stock: 7, expectedStock: 2 }).expect(200);
    expect((await row(id)).stock).toBe(7);
  });

  it('[CRITICAL] الرفض يسبق «عاد للتوفر»: لا إشعار كاذب للمشتركين ولا تفريغ لاشتراكاتهم', async () => {
    const id = await product('توفر', 2);
    await submitAndApprove(id, 2);
    expect((await row(id)).stock).toBe(0);

    const subscriber = await registerAndLogin();
    await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${subscriber.token}`)
      .send({ productId: id })
      .expect((res) => expect([200, 201]).toContain(res.status));

    // صفحةٌ فُتحت والمخزون 2 تحاول حفظه 2 — كان سيُعلن «عاد للتوفر» زوراً.
    const res = await patch(id, { stock: 2, expectedStock: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STOCK_CHANGED');

    const { rows: notified } = await db.query(
      `SELECT 1 FROM notifications WHERE product_id = $1 AND type = 'backInStock'`,
      [id],
    );
    expect(notified).toHaveLength(0);
    const { rows: subs } = await db.query(
      'SELECT 1 FROM restock_subscriptions WHERE product_id = $1',
      [id],
    );
    expect(subs).toHaveLength(1);
  });

  it('توافقٌ مع لوحةٍ أقدم: المخزون بلا `expectedStock` يُكتب قيمةً مطلقة كما كان', async () => {
    const id = await product('أقدم', 5);
    await submitAndApprove(id, 3);

    await patch(id, { stock: 9 }).expect(200);
    expect((await row(id)).stock).toBe(9);
  });

  it('`expectedStock` بلا `stock` مرفوض — لا فحص بلا قيمة يحرسها', async () => {
    const id = await product('بلا قيمة', 5);
    const res = await patch(id, { expectedStock: 5 });
    expect(res.status).toBe(400);
    expect((await row(id)).stock).toBe(5);
  });
});
