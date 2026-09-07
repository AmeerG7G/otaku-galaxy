import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * دورة حياة الطلب بعد دمج «تم تأكيده» و«قيد التجهيز» في انتقال القبول.
 *
 * الموافقة اليوم تُنقِل الطلب من الانتظار إلى «قيد التوصيل» في خطوة واحدة
 * (قبول = إرسال للتوصيل)، فتشغّل نافذة التقييم وإشعار القبول معاً. هذه
 * السويت تثبّت أن القبول يغادر مباشرةً، وأن ما بُني على المرحلتين
 * الموروثتين (الإشعار، إلغاء العميل، سجل الحالات، الطلبات الموروثة)
 * ظل سليماً.
 */
describe('دورة حالة الطلب المبسّطة', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  let productId: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock)
       VALUES ('منتج دورة الحالة', 'وصف', 12000, $1, 500)
       RETURNING id`,
      [catalog.categoryId],
    );
    productId = rows[0]!.id;
  });

  async function placeOrder() {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 1 })
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
    return { user, orderId: created.body.data.id as string };
  }

  function setStatus(orderId: string, status: string, note?: string) {
    return api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(note === undefined ? { status } : { status, note });
  }

  it('القبول ينقل الطلب من الانتظار إلى قيد التوصيل في خطوة واحدة', async () => {
    const { orderId } = await placeOrder();
    const accepted = await setStatus(orderId, 'OUT_FOR_DELIVERY').expect(200);
    expect(accepted.body.data.status).toBe('OUT_FOR_DELIVERY');
  });

  it('لا مسار يُنتج الحالتين الموروثتين «تم تأكيده» أو «قيد التجهيز»', async () => {
    const { orderId } = await placeOrder();

    const confirmed = await setStatus(orderId, 'CONFIRMED');
    expect(confirmed.status).toBe(409);

    const preparing = await setStatus(orderId, 'PREPARING');
    expect(preparing.status).toBe(409);

    const { rows } = await db.query<{ status: string }>(
      'SELECT status FROM orders WHERE id = $1',
      [orderId],
    );
    expect(rows[0]!.status).toBe('PENDING_ADMIN_CONFIRMATION');
  });

  it('المسار الكامل: انتظار ← توصيل ← تسليم', async () => {
    const { orderId } = await placeOrder();
    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
      const res = await setStatus(orderId, status).expect(200);
      expect(res.body.data.status).toBe(status);
    }

    const detail = await api
      .get(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const history = (detail.body.data.statusHistory as { status: string }[]).map(
      (entry) => entry.status,
    );
    // لا أثر للمرحلتين الموروثتين في السجل — الطلب لم يمرّ بهما أصلاً.
    expect(history).toEqual([
      'PENDING_ADMIN_CONFIRMATION',
      'OUT_FOR_DELIVERY',
      'COMPLETED',
    ]);
  });

  it('القبول يرسل إشعار قبول واحداً بنصّ الدفع عند الاستلام', async () => {
    const { user, orderId } = await placeOrder();
    await setStatus(orderId, 'OUT_FOR_DELIVERY').expect(200);

    const { rows } = await db.query<{ total: string; title: string; body: string }>(
      `SELECT COUNT(*)::text AS total, MIN(title) AS title, MIN(body) AS body
         FROM notifications
        WHERE user_id = $1 AND order_id = $2 AND type = 'orderAccepted'`,
      [user.userId, orderId],
    );
    expect(Number(rows[0]!.total)).toBe(1);
    expect(rows[0]!.title).toContain('تم قبول طلبك');
    expect(rows[0]!.body).toContain('خرج للتوصيل');
  });

  it('العميل يلغي قبل القبول والمخزون يُسترجع', async () => {
    const before = await stockOf(productId);
    const { user, orderId } = await placeOrder();
    expect(await stockOf(productId)).toBe(before - 1);

    const cancelled = await api
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(cancelled.body.data.status).toBe('REJECTED');
    expect(await stockOf(productId)).toBe(before);
  });

  it('لا إلغاء بعد خروج الطلب للتوصيل', async () => {
    const { user, orderId } = await placeOrder();
    await setStatus(orderId, 'OUT_FOR_DELIVERY').expect(200);

    const refused = await api
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(refused.status).toBe(409);
  });

  /**
   * طلب موروث توقّف عند «تم تأكيده» قبل الدمج: يجب أن يبقى قابلاً للتحريك،
   * وألّا يصل صاحبه إشعار قبول ثانٍ عن الطلب نفسه.
   */
  it('الطلب الموروث في «تم تأكيده» يتحرك للتوصيل بلا إشعار قبول مكرّر', async () => {
    const { user, orderId } = await placeOrder();
    // تثبيت الحالة الموروثة مباشرةً في القاعدة — لا مسار API ينتجها اليوم.
    await db.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, 'CONFIRMED']);
    await db.query(
      `INSERT INTO order_status_history (order_id, status) VALUES ($1, 'CONFIRMED')`,
      [orderId],
    );
    await db.query(
      `INSERT INTO notifications (user_id, order_id, type, title, body)
       VALUES ($1, $2, 'orderAccepted', 'تم قبول طلبك 🎉', '')`,
      [user.userId, orderId],
    );

    const moved = await setStatus(orderId, 'PREPARING').expect(200);
    expect(moved.body.data.status).toBe('PREPARING');

    const { rows } = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM notifications
        WHERE user_id = $1 AND order_id = $2 AND type = 'orderAccepted'`,
      [user.userId, orderId],
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it('الرفض يشترط سبباً ويسترجع المخزون — من الانتظار أو قيد التوصيل', async () => {
    const before = await stockOf(productId);

    // رفضاً من الانتظار.
    const { orderId: pendingOrder } = await placeOrder();
    const noReason = await setStatus(pendingOrder, 'REJECTED');
    expect(noReason.status).toBe(400);
    expect(await stockOf(productId)).toBe(before - 1);
    await setStatus(pendingOrder, 'REJECTED', 'نفد المخزون').expect(200);
    expect(await stockOf(productId)).toBe(before);

    // رفضاً من بعد خروج الطلب للتوصيل.
    const { orderId: shippedOrder } = await placeOrder();
    await setStatus(shippedOrder, 'OUT_FOR_DELIVERY').expect(200);
    expect(await stockOf(productId)).toBe(before - 1);
    await setStatus(shippedOrder, 'REJECTED', 'العميل لم يستلم').expect(200);
    expect(await stockOf(productId)).toBe(before);
  });
});

async function stockOf(productId: string) {
  const { rows } = await db.query<{ stock: number }>(
    'SELECT stock FROM products WHERE id = $1',
    [productId],
  );
  return Number(rows[0]!.stock);
}