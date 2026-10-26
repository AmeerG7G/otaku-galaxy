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
 * «قريباً يتوفر» — عقد الحالة على الخادم.
 *
 * [CRITICAL] لا حقل جديد ولا نظام ثانٍ. الحالة **مشتقّة** من حقلين قائمين
 * منذ الهجرة ٠٣٤: `products.stock` و`products.restock_at`. والقاعدة التي
 * تحرسها هذه السويت: **المخزون هو مصدر الحقيقة، لا التاريخ.**
 *
 * الخادم يُصدّر الحقلين ويحرس الشراء؛ التسمية («قريباً يتوفر») قرارُ عرضٍ
 * يقع في التطبيق على `Product.availability` — مصدرٌ واحد هناك أيضاً.
 */
describe('حالة «قريباً يتوفر»', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  let customer: Awaited<ReturnType<typeof registerAndLogin>>;

  let comingSoon: string; // مخزون ٠ + موعد
  let unavailable: string; // مخزون ٠ بلا موعد
  let available: string; // مخزون موجب

  const FUTURE = '2026-10-15T09:00:00.000Z';

  async function makeProduct(name: string, stock: number, restockAt: string | null) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active, restock_at)
       VALUES ($1, 'وصف', 20000, $2, $3, TRUE, $4)
       RETURNING id`,
      [name, catalog.categoryId, stock, restockAt],
    );
    return rows[0]!.id;
  }

  /** المنتج كما يراه الزبون من المسار العام. */
  async function publicProduct(id: string) {
    const res = await api.get(`/api/catalog/products/${id}`).expect(200);
    return res.body.data as { stock: number; restockAt: string | null };
  }

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    customer = await registerAndLogin();
    comingSoon = await makeProduct('قريباً — بموعد', 0, FUTURE);
    unavailable = await makeProduct('قريباً — بلا موعد', 0, null);
    available = await makeProduct('قريباً — متوفر', 5, FUTURE);
  });

  afterAll(async () => {
    await db.query('DELETE FROM products WHERE name LIKE $1', ['قريباً — %']);
    await purgeTestUsers();
  });

  // ═══════════════ عقد الحالة (§16 ١–٣) ═══════════════

  describe('الحقلان يصلان الزبون', () => {
    it('[CRITICAL] مخزون ٠ + موعد ⇒ الحقلان يسمحان باشتقاق «قريباً»', async () => {
      const p = await publicProduct(comingSoon);
      expect(p.stock).toBe(0);
      expect(p.restockAt).toBe(FUTURE);
    });

    it('مخزون ٠ بلا موعد ⇒ غير متوفر', async () => {
      const p = await publicProduct(unavailable);
      expect(p.stock).toBe(0);
      expect(p.restockAt).toBeNull();
    });

    it('[CRITICAL] مخزون موجب + موعد ⇒ متوفر (المخزون يتقدّم)', async () => {
      const p = await publicProduct(available);
      expect(p.stock).toBeGreaterThan(0);
      // الموعد يبقى في القاعدة؛ التطبيق لا يعرضه ما دام المخزون موجباً.
      expect(p.restockAt).toBe(FUTURE);
    });

    it('المنتج بمخزون صفر يبقى منشوراً ومرئياً', async () => {
      // نشرُ منتجٍ بلا مخزون هو جوهر الميزة: لا يُخفى من الكتالوج.
      const list = await api.get('/api/catalog/products?limit=50').expect(200);
      const ids = (list.body.data.items as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(comingSoon);
      expect(ids).toContain(unavailable);
    });

    it('كل منتج في القائمة يحمل الحقلين', async () => {
      const list = await api.get('/api/catalog/products?limit=20').expect(200);
      for (const p of list.body.data.items as Record<string, unknown>[]) {
        expect(p).toHaveProperty('stock');
        expect(p).toHaveProperty('restockAt');
      }
    });
  });

  // ═══════════════ الانتقال ٠ ← ٣ (§16 ٤) ═══════════════

  it('[CRITICAL] المخزون ٠ ← ٣ يجعل المنتج قابلاً للشراء فوراً', async () => {
    const id = await makeProduct('قريباً — انتقال', 0, FUTURE);

    // قبل: الشراء مرفوض.
    const before = await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId: id, quantity: 1 });
    expect(before.status).toBe(409);

    // المسؤول يستلم البضاعة **قبل** الموعد ولا يمسح التاريخ.
    await api
      .patch(`/api/admin/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 3 })
      .expect(200);

    // بعد: الشراء مسموح فوراً، بلا انتظار الموعد.
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId: id, quantity: 1 })
      .expect(200);

    const p = await publicProduct(id);
    expect(p.stock).toBe(3);
  });

  // ═══════════════ تحرير الموعد ومسحه (§16 ٥–٦) ═══════════════

  describe('الموعد يُحرَّر ويُمسَح', () => {
    it('المسؤول يغيّر الموعد فيرى الزبون الجديد وحده', async () => {
      const next = '2026-10-20T09:00:00.000Z';
      await api
        .patch(`/api/admin/products/${comingSoon}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ restockAt: next })
        .expect(200);

      const p = await publicProduct(comingSoon);
      expect(p.restockAt).toBe(next);
      expect(p.restockAt).not.toBe(FUTURE);

      await api
        .patch(`/api/admin/products/${comingSoon}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ restockAt: FUTURE })
        .expect(200);
    });

    it('[CRITICAL] مسح الموعد لا يحذف المشتركين', async () => {
      const id = await makeProduct('قريباً — مسح', 0, FUTURE);
      await api
        .post('/api/restock-subscriptions')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: id })
        .expect(200);

      await api
        .patch(`/api/admin/products/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ restockAt: null })
        .expect(200);

      const p = await publicProduct(id);
      expect(p.restockAt).toBeNull();

      // الاشتراك باقٍ — إزالة الموعد ليست إلغاءً لانتظار الزبون.
      const { rows } = await db.query(
        'SELECT 1 FROM restock_subscriptions WHERE product_id = $1',
        [id],
      );
      expect(rows).toHaveLength(1);
    });

    it('الموعد اختياري — لا يُفرض على المسؤول', async () => {
      const { rows } = await db.query<{ restock_at: string | null }>(
        'SELECT restock_at FROM products WHERE id = $1',
        [unavailable],
      );
      expect(rows[0]!.restock_at).toBeNull();
    });
  });

  // ═══════════════ حراسة الشراء (§16 ٧–٩، §17) ═══════════════

  describe('[CRITICAL] الخادم يحرس الشراء لا الواجهة', () => {
    it('لا إضافة إلى السلة لمنتج بمخزون صفر — بموعد أو بلا موعد', async () => {
      for (const id of [comingSoon, unavailable]) {
        const res = await api
          .post('/api/cart')
          .set('Authorization', `Bearer ${customer.token}`)
          .send({ productId: id, quantity: 1 });
        expect(res.status).toBe(409);
      }
    });

    it('المنتج المتوفر يُضاف ضمن حدود مخزونه', async () => {
      const id = await makeProduct('قريباً — حدود', 3, null);
      // ١ من ٣ ⇒ يمرّ
      await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: id, quantity: 1 })
        .expect(200);
      // +٢ ⇒ المجموع ٣ ⇒ يمرّ
      await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: id, quantity: 2 })
        .expect(200);
      // +١ ⇒ المجموع ٤ ⇒ يُرفض
      const over = await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: id, quantity: 1 });
      expect(over.status).toBe(409);
    });

    it('كمية ٤ دفعةً واحدة من مخزون ٣ تُرفض', async () => {
      const id = await makeProduct('قريباً — دفعة', 3, null);
      const res = await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: id, quantity: 4 });
      expect(res.status).toBe(409);
    });

    it('الطلب يرفض منتجاً نفد بين الإضافة والدفع', async () => {
      const id = await makeProduct('قريباً — سباق', 2, null);
      await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: id, quantity: 2 })
        .expect(200);

      // نفد قبل إتمام الطلب.
      await db.query('UPDATE products SET stock = 0 WHERE id = $1', [id]);

      const res = await api
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          governorateId: catalog.governorateId,
          fullAddress: 'بغداد، الكرادة',
          phone: '07700000000',
        });
      expect(res.status).toBe(409);

      await db.query('DELETE FROM cart_items WHERE product_id = $1', [id]);
    });

    it('[CRITICAL] الزبون لا يُلفّق التوفر في جسم الطلب', async () => {
      const res = await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({
          productId: comingSoon,
          quantity: 1,
          // كلها مُلفَّقة — الخادم يقرأ صفّ المنتج وحده.
          stock: 999,
          inStock: true,
          isAvailable: true,
          availability: 'available',
          restockAt: null,
        });
      expect(res.status).toBe(409);
    });
  });

  // ═══════════════ تجاوز المخزون بالإضافات المتكرّرة ═══════════════

  describe('[CRITICAL] المجموع في العربة لا يتجاوز المخزون', () => {
    it('إضافات متكرّرة لا تراكم أكثر من المتاح', async () => {
      // عطبٌ حقيقي وُجد هنا: `UNIQUE (cart_id, product_id, option_value)`
      // لا يصطدم حين `option_value IS NULL` (NULL ≠ NULL في فهرس فريد)،
      // فكل إضافة كانت تُنشئ صفّاً جديداً بدل أن تُدمَج. الحارس يقرأ سطراً
      // واحداً فيحسب أقلّ من الحقيقة. المقيس قبل الإصلاح: مخزون ٣ خرج منه
      // طلبٌ بخمس قطع.
      const buyer = await registerAndLogin();
      const id = await makeProduct('قريباً — تراكم', 3, null);

      let accepted = 0;
      for (let i = 0; i < 5; i++) {
        const res = await api
          .post('/api/cart')
          .set('Authorization', `Bearer ${buyer.token}`)
          .send({ productId: id, quantity: 1 });
        if (res.status === 200) accepted++;
      }
      expect(accepted).toBe(3);

      const { rows } = await db.query<{ total: string }>(
        `SELECT COALESCE(SUM(ci.quantity), 0)::text AS total
           FROM cart_items ci
           JOIN carts c ON c.id = ci.cart_id
          WHERE ci.product_id = $1 AND c.user_id = $2`,
        [id, buyer.userId],
      );
      expect(Number(rows[0]!.total)).toBe(3);
    });

    it('[CRITICAL] القاعدة تدمج أسطر المنتج بلا خيار في صفّ واحد', async () => {
      const buyer = await registerAndLogin();
      const id = await makeProduct('قريباً — دمج', 9, null);
      for (const q of [1, 2, 3]) {
        await api
          .post('/api/cart')
          .set('Authorization', `Bearer ${buyer.token}`)
          .send({ productId: id, quantity: q })
          .expect(200);
      }
      const { rows } = await db.query(
        `SELECT ci.id FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
          WHERE ci.product_id = $1 AND c.user_id = $2`,
        [id, buyer.userId],
      );
      expect(rows).toHaveLength(1);
    });

    it('[CRITICAL] لا يمرّ طلبٌ يتجاوز المخزون مهما انقسمت الأسطر', async () => {
      const buyer = await registerAndLogin();
      const id = await makeProduct('قريباً — طلب متجاوز', 3, null);

      // انقسامٌ مفروضٌ مباشرةً في القاعدة يتخطّى مسار العربة كلّه — أقسى
      // من أي التفافٍ عبر الـAPI.
      const { rows: cart } = await db.query<{ id: string }>(
        `INSERT INTO carts (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id`,
        [buyer.userId],
      );
      for (const q of [2, 2]) {
        await db.query(
          `INSERT INTO cart_items (cart_id, product_id, option_value, quantity)
           VALUES ($1, $2, $3, $4)`,
          [cart[0]!.id, id, `خيار-${q}-${Math.random()}`, q],
        );
      }

      const res = await api
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({
          governorateId: catalog.governorateId,
          fullAddress: 'بغداد، الكرادة',
          phone: '07700000000',
        });
      expect(res.status).toBe(409);

      const { rows: after } = await db.query<{ stock: number }>(
        'SELECT stock FROM products WHERE id = $1',
        [id],
      );
      expect(Number(after[0]!.stock)).toBe(3);
    });
  });

  // ═══════════════ صلاحية ضبط الحالة (§17) ═══════════════

  describe('[CRITICAL] الحالة يضبطها المسؤول وحده', () => {
    const forgeries = [
      { label: 'الموعد', body: { restockAt: '2027-01-01T00:00:00.000Z' } },
      { label: 'المخزون', body: { stock: 999 } },
      { label: 'النشر', body: { isActive: false } },
    ];

    for (const f of forgeries) {
      it(`زبون يعدّل ${f.label} → 403`, async () => {
        await api
          .patch(`/api/admin/products/${comingSoon}`)
          .set('Authorization', `Bearer ${customer.token}`)
          .send(f.body)
          .expect(403);
      });

      it(`بلا مصادقة يعدّل ${f.label} → 401`, async () => {
        await api
          .patch(`/api/admin/products/${comingSoon}`)
          .send(f.body)
          .expect(401);
      });
    }

    it('توكن مزوَّر بدور مسؤول → 401', async () => {
      for (const forged of [
        'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.x',
        `${customer.token}.admin`,
      ]) {
        await api
          .patch(`/api/admin/products/${comingSoon}`)
          .set('Authorization', `Bearer ${forged}`)
          .send({ stock: 50 })
          .expect(401);
      }
    });

    it('لا شيء تغيّر بعد كل تلك المحاولات', async () => {
      const { rows } = await db.query<{ stock: number; is_active: boolean }>(
        'SELECT stock, is_active FROM products WHERE id = $1',
        [comingSoon],
      );
      expect(Number(rows[0]!.stock)).toBe(0);
      expect(rows[0]!.is_active).toBe(true);
    });

    it('مخزون سالب أو كسري مرفوض من المسؤول نفسه', async () => {
      for (const stock of [-5, 1.5]) {
        const res = await api
          .patch(`/api/admin/products/${comingSoon}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ stock });
        expect(res.status).toBe(400);
      }
    });

    it('موعد معطوب مرفوض', async () => {
      for (const restockAt of ['ليس تاريخاً', '15/10/2026', 123]) {
        const res = await api
          .patch(`/api/admin/products/${comingSoon}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ restockAt });
        expect(res.status).toBe(400);
      }
    });
  });
});
