import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * الهجرة ٠٥١ — تسوية المنتظر لحظةَ نقل تنزيل المخزون من الإرسال إلى القبول.
 *
 * [CRITICAL] كل طلبٍ منتظر لحظة النشر أُنشئ تحت النموذج القديم: مخزونه
 * نُزِّل عند الإرسال. الشيفرة الجديدة ستنزّله ثانيةً عند القبول. الهجرة
 * تُعيد كمياته مرةً واحدة، فيصير المنتظر «بلا حجز» كما تفترضه الشيفرة.
 *
 * تُختبر بتشغيل SQL الملفّ نفسه داخل معاملة تُرجَع (ROLLBACK) — لا تُفسد
 * قاعدة الاختبار، وتقيس الملفّ الذي سيُطبَّق فعلاً لا نسخةً منه.
 */
const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/database/migrations/051_unreserve_pending_orders.sql',
);

describe('الهجرة ٠٥١: إرجاع مخزون الطلبات المنتظرة مرةً واحدة', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    await db.query(`DELETE FROM order_items WHERE product_id IN
                    (SELECT id FROM products WHERE name LIKE 'M051 %')`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN
                    (SELECT id FROM products WHERE name LIKE 'M051 %')`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE 'M051 %'`);
  });

  async function product(name: string, stock: number) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', 1000, $2, $3, TRUE) RETURNING id`,
      [`M051 ${name}`, catalog.categoryId, stock],
    );
    return rows[0]!.id;
  }

  async function submit(lines: Array<{ productId: string; quantity: number }>) {
    const buyer = await registerAndLogin();
    for (const line of lines) {
      await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`).send(line).expect(200);
    }
    const res = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد', phone: '07700000000' })
      .expect(201);
    return res.body.data.id as string;
  }

  it('يُرجع كميات المنتظر فقط — لا المرفوض ولا المقبول — ويجمع على المنتج', async () => {
    const pendingOnly = await product('منتظر', 10);
    const mixed = await product('مختلط', 10);
    const untouched = await product('بلا طلب', 10);

    // ثلاثة طلبات منتظرة تحت «النموذج القديم»: يُحاكى تنزيلُها عند الإنشاء.
    await submit([{ productId: pendingOnly, quantity: 3 }]);
    await submit([{ productId: pendingOnly, quantity: 2 }]);
    const rejected = await submit([{ productId: mixed, quantity: 4 }]);
    const approved = await submit([{ productId: mixed, quantity: 1 }]);
    await submit([{ productId: mixed, quantity: 2 }]);
    // القديم: كل إرسال نزّل. نُعيد بناء تلك الحال يدوياً.
    await db.query('UPDATE products SET stock = stock - 5 WHERE id = $1', [pendingOnly]);
    await db.query('UPDATE products SET stock = stock - 7 WHERE id = $1', [mixed]);
    // المرفوض أُرجع مخزونه في النموذج القديم؛ المقبول بقي منزَّلاً.
    await api.patch(`/api/admin/orders/${rejected}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'سبب' }).expect(200);
    await db.query('UPDATE products SET stock = stock + 4 WHERE id = $1', [mixed]);
    await db.query(`UPDATE orders SET status = 'OUT_FOR_DELIVERY' WHERE id = $1`, [approved]);

    const sql = await readFile(MIGRATION, 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      const stock = async (id: string) =>
        Number((await client.query<{ stock: string }>('SELECT stock FROM products WHERE id = $1', [id])).rows[0]!.stock);
      // منتظران (٣ + ٢) على مخزونٍ نُزِّل منه ٥ ⇒ يعود ١٠.
      expect(await stock(pendingOnly)).toBe(10);
      // مختلط: نُزِّل ٧، أُرجع ٤ بالرفض ⇒ ٧؛ المنتظر وحده (٢) يُرجَع ⇒ ٩،
      // والمقبول (١) يبقى مستهلَكاً.
      expect(await stock(mixed)).toBe(9);
      expect(await stock(untouched)).toBe(10);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('سطرٌ منتجه محذوف من القاعدة لا يُسقط الهجرة', async () => {
    const survivor = await product('باقٍ', 10);
    const doomed = await product('محذوف', 10);
    await submit([
      { productId: survivor, quantity: 1 },
      { productId: doomed, quantity: 1 },
    ]);
    await db.query('DELETE FROM cart_items WHERE product_id = $1', [doomed]);
    await db.query('DELETE FROM products WHERE id = $1', [doomed]);
    await db.query('UPDATE products SET stock = stock - 1 WHERE id = $1', [survivor]);

    const sql = await readFile(MIGRATION, 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      const { rows } = await client.query<{ stock: string }>(
        'SELECT stock FROM products WHERE id = $1',
        [survivor],
      );
      expect(Number(rows[0]!.stock)).toBe(10);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
