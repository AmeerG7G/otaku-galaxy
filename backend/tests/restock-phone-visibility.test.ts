import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  seedTestCatalog,
  purgeTestUsers,
} from './helpers.js';

/**
 * هاتف المشترك في إعادة التوفر — من يراه ومن لا يراه.
 *
 * القاعدة الواحدة التي تحرسها هذه السويت: الرقم الكامل يخرج من
 * `GET /api/admin/restock/demand` وحده، وهو خلف `authenticate` ثم
 * `requireAdmin`. كل مسارٍ آخر — عميلٍ أو عام — لا يحمله بأي صورة.
 *
 * [CRITICAL] «لا يحمله» تُختبر على **نصّ الاستجابة كاملاً** لا على حقلٍ
 * بعينه: تسريبٌ مستقبلي سيأتي من حقلٍ جديد لا أحد يفكّر في اختباره.
 */
describe('رؤية هاتف مشترك إعادة التوفر', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  let subscriber: Awaited<ReturnType<typeof registerAndLogin>>;
  let otherCustomer: Awaited<ReturnType<typeof registerAndLogin>>;
  let productId: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    subscriber = await registerAndLogin();
    otherCustomer = await registerAndLogin();

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ('منتج انتظار الهاتف', 'وصف', 12000, $1, 0, TRUE)
       RETURNING id`,
      [catalog.categoryId],
    );
    productId = rows[0]!.id;

    await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${subscriber.token}`)
      .send({ productId })
      .expect(200);
  });

  afterAll(async () => {
    await db.query('DELETE FROM products WHERE name = $1', ['منتج انتظار الهاتف']);
    await purgeTestUsers();
  });

  /** هل يظهر هذا الرقم في نصّ الاستجابة؟ */
  function leaks(body: unknown, phone: string): boolean {
    const text = JSON.stringify(body ?? {});
    const digits = phone.replace(/\D/g, '');
    return text.includes(phone) || text.includes(digits);
  }

  describe('المسؤول المصرَّح له', () => {
    it('[CRITICAL] يرى الرقم كاملاً بلا تقنيع', async () => {
      const res = await api
        .get('/api/admin/restock/demand')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const entry = (
        res.body.data as {
          productId: string;
          subscribers: { username: string; phone: string }[];
        }[]
      ).find((row) => row.productId === productId);

      expect(entry).toBeDefined();
      expect(entry!.subscribers[0]!.phone).toBe(subscriber.phone);
      expect(entry!.subscribers[0]!.phone).not.toContain('*');
    });

    it('لا يبقى أي حقل هاتف مقنَّع في الاستجابة', async () => {
      const res = await api
        .get('/api/admin/restock/demand')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('maskedPhone');
    });
  });

  describe('من لا يملك الصلاحية', () => {
    it('بلا مصادقة → 401', async () => {
      const res = await api.get('/api/admin/restock/demand');
      expect(res.status).toBe(401);
      expect(leaks(res.body, subscriber.phone)).toBe(false);
    });

    it('[CRITICAL] زبون مصادَق → 403 وبلا أي رقم', async () => {
      const res = await api
        .get('/api/admin/restock/demand')
        .set('Authorization', `Bearer ${otherCustomer.token}`);
      expect(res.status).toBe(403);
      expect(leaks(res.body, subscriber.phone)).toBe(false);
    });

    it('[CRITICAL] المشترك نفسه لا يبلغ المسار الإداري → 403', async () => {
      // حتى صاحبُ الرقم لا يمرّ: الصلاحية دورٌ لا ملكية.
      await api
        .get('/api/admin/restock/demand')
        .set('Authorization', `Bearer ${subscriber.token}`)
        .expect(403);
    });

    it('[CRITICAL] توكن مزوَّر بدور مسؤول → 401', async () => {
      for (const forged of [
        'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.x',
        `${otherCustomer.token}.admin`,
        `${otherCustomer.token}x`,
      ]) {
        const res = await api
          .get('/api/admin/restock/demand')
          .set('Authorization', `Bearer ${forged}`);
        expect(res.status).toBe(401);
        expect(leaks(res.body, subscriber.phone)).toBe(false);
      }
    });
  });

  describe('[CRITICAL] لا تسرّب من مسارات العميل', () => {
    it('«اشتراكاتي» للمشترك نفسه لا تحمل هاتفاً', async () => {
      const res = await api
        .get('/api/restock-subscriptions/mine')
        .set('Authorization', `Bearer ${subscriber.token}`)
        .expect(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('phone');
      expect(text).not.toContain('maskedPhone');
    });

    it('زبون آخر لا يرى هاتف المشترك من أي مسار عميل', async () => {
      for (const path of [
        '/api/restock-subscriptions/mine',
        `/api/catalog/products/${productId}`,
        '/api/catalog/products?limit=50',
        '/api/orders',
      ]) {
        const res = await api
          .get(path)
          .set('Authorization', `Bearer ${otherCustomer.token}`);
        expect(leaks(res.body, subscriber.phone)).toBe(false);
      }
    });

    it('المسارات العامة بلا مصادقة لا تحمل هاتفاً', async () => {
      for (const path of [
        `/api/catalog/products/${productId}`,
        '/api/catalog/products?limit=50',
        '/api/community/photos?limit=20',
      ]) {
        const res = await api.get(path);
        expect(leaks(res.body, subscriber.phone)).toBe(false);
      }
    });

    it('الاشتراك نفسه لا يرجع هاتفاً في استجابته', async () => {
      const res = await api
        .post('/api/restock-subscriptions')
        .set('Authorization', `Bearer ${subscriber.token}`)
        .send({ productId });
      expect(JSON.stringify(res.body)).not.toContain('phone');
    });
  });

  describe('[CRITICAL] لا التفاف عبر المعايير أو مسار بديل', () => {
    it('معايير الاستعلام لا تفتح المسار لغير المسؤول', async () => {
      for (const query of [
        '?full=true',
        '?mask=false',
        '?admin=true',
        '?role=admin',
        '?includePhone=1',
      ]) {
        const res = await api
          .get(`/api/admin/restock/demand${query}`)
          .set('Authorization', `Bearer ${otherCustomer.token}`);
        expect(res.status).toBe(403);
        expect(leaks(res.body, subscriber.phone)).toBe(false);
      }
    });

    it('المعايير لا تغيّر ما يراه المسؤول أصلاً', async () => {
      // لا مفتاح «أظهر الكامل»: الشكل واحد لا شكلان يختلفان بمعيار.
      const plain = await api
        .get('/api/admin/restock/demand')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const withQuery = await api
        .get('/api/admin/restock/demand?mask=true&full=false')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(withQuery.body.data).toEqual(plain.body.data);
    });

    it('لا مسار عميل بديل يخدم طلب إعادة التوفر', async () => {
      for (const path of [
        '/api/restock/demand',
        '/api/restock-subscriptions/demand',
        '/api/catalog/restock/demand',
      ]) {
        const res = await api
          .get(path)
          .set('Authorization', `Bearer ${otherCustomer.token}`);
        expect(res.status).toBe(404);
        expect(leaks(res.body, subscriber.phone)).toBe(false);
      }
    });
  });
});
