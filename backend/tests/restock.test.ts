import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * «أخبرني عند توفره» — الاشتراك بمنتج نافد والإعلام عن عودة المخزون.
 *
 * الالتزامات: لا اشتراك بمنتج متوفر، لا إشعار لمن لم يشترك، إشعار واحد
 * يستهلِك الاشتراك (لا تنبيه مكرر للطلب نفسه في تحديث لاحق)، الإدارة ترى
 * الطلب بلا هاتف كامل، وداخل معاملة تحديث المنتج نفسها.
 */
describe('إشعار التوفر (أخبرني عند توفره)', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  it('يرفض الاشتراك بمنتج متوفر — الحاجة لم تنشأ', async () => {
    const { token } = await registerAndLogin();
    const [inStockId] = catalog.productIds;
    await db.query('UPDATE products SET stock = 5 WHERE id = $1', [inStockId]);

    const res = await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: inStockId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_IN_STOCK');
  });

  it('لا اشتراك بمنتج غير موجود', async () => {
    const { token } = await registerAndLogin();
    const res = await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('اشتراك مكرر آمن، و«مفرداتي» تعكس الحالة', async () => {
    const { token } = await registerAndLogin();
    const [productId] = catalog.productIds;
    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);

    const first = await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId })
      .expect(200);
    expect(first.body.data.subscribed).toBe(true);
    expect(first.body.data.alreadySubscribed).toBe(false);

    const repeat = await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId })
      .expect(200);
    expect(repeat.body.data.alreadySubscribed).toBe(true);

    const mine = await api
      .get('/api/restock-subscriptions/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mine.body.data.some((s: { productId: string }) => s.productId === productId)).toBe(true);

    const removed = await api
      .delete(`/api/restock-subscriptions/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(removed.body.data.wasSubscribed).toBe(true);

    const mineAfter = await api
      .get('/api/restock-subscriptions/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mineAfter.body.data.some((s: { productId: string }) => s.productId === productId)).toBe(false);
  });

  it('عودة المخزون تُشعر المشتركين مرة واحدة وتفرغ الاشتراكات', async () => {
    const { token, userId } = await registerAndLogin();
    const [productId] = catalog.productIds;
    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);

    await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId })
      .expect(200);

    // الإدارة تعيد المخزون عبر لوحة التحكم.
    const updated = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 3 })
      .expect(200);
    expect(updated.body.data.stock).toBe(3);

    // إشعار واحد من نوع backInStock باسم المنتج.
    const list = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const notice = (list.body.data.items as { type: string; title: string }[]).find(
      (n) => n.type === 'backInStock',
    );
    expect(notice).toBeDefined();
    expect(notice!.title).toContain('عاد للتوفر');

    // الاشتراك استُهلِك — تحديث آخر لا يولّد إشعاراً ثانياً.
    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 7 })
      .expect(200);

    const afterAgain = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM notifications WHERE user_id = $1 AND type = $2',
      [userId, 'backInStock'],
    );
    expect(Number(afterAgain.rows[0]!.total)).toBe(1);
  });

  it('تعديل سعرٍ أو مخزونٍ لاحقٌ لا يمسح تاريخ إعادة التوفّر', async () => {
    const [productId] = catalog.productIds;
    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);

    const sent = '2026-09-01T10:00:00+03:00';
    const dated = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ restockAt: sent })
      .expect(200);
    expect(dated.body.data.restockAt).toBe(new Date(sent).toISOString());

    // حفظٌ لاحق بلا restockAt (سعر فقط) لا يفرّغ الحقل.
    const saved = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 11999 })
      .expect(200);
    expect(saved.body.data.restockAt).toBe(new Date(sent).toISOString());

    // التصفير صريحٌ يبقى صريحاً.
    const cleared = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ restockAt: null })
      .expect(200);
    expect(cleared.body.data.restockAt).toBeNull();
  });

  it('الإدارة ترى المشترك باسمه وهاتفه كاملاً', async () => {
    // [CRITICAL] تغيّر متعمَّد: كان الرقم يصل مقنَّعاً. المسار إداري منذ
    // البداية (`requireAdmin`)، والتقنيع لم يكن يحرس واجهةً عامة — والطاقم
    // يحتاج الرقم ليخبر المنتظر بالتوفر. الحراسة انتقلت إلى ما يخصّها:
    // ألّا يخرج الرقم من أي مسار عميل (انظر `restock-phone-visibility`).
    const session = await registerAndLogin();
    const [productId] = catalog.productIds;
    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);

    await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ productId })
      .expect(200);

    const demand = await api
      .get('/api/admin/restock/demand')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const entry = (
      demand.body.data as {
        productId: string;
        subscriberCount: number;
        subscribers: { username: string; phone: string }[];
      }[]
    ).find((d: { productId: string }) => d.productId === productId);
    expect(entry).toBeDefined();
    expect(entry!.subscriberCount).toBe(1);

    const phone = entry!.subscribers[0]!.phone;
    expect(phone).toBe(session.phone);
    expect(phone).toMatch(/^\+964\d{10}$/);
    expect(phone).not.toContain('*');
  });

  it('غير المسؤول لا يقرأ طلب إعادة التوفر', async () => {
    const res = await api.get('/api/admin/restock/demand');
    expect(res.status).toBe(401);
  });
});