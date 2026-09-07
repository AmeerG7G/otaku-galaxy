import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * رسوم التوصيل بالمنطقة داخل المحافظة الواحدة.
 *
 * حالة النجف: «داخل القضاء» و«خارج القضاء» برسوم مختلفة. القيمتان بيانات
 * يديرها المسؤول لا ثوابت في الكود، والحساب على الخادم لا في التطبيق:
 * أي رسوم يرسلها العميل تُتجاهل، والمحفوظ في الطلب هو ما حسبه الخادم.
 */
describe('رسوم التوصيل حسب المنطقة', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  let productId: string;
  let najafId: string;
  let insideId: string;
  let outsideId: string;

  const INSIDE_FEE = 3000;
  const OUTSIDE_FEE = 4000;
  // اسم فريد لكل تشغيل: المحافظة يقيّدها فهرس فريد، والطلبات التي أنشأها
  // تشغيلٌ سابق تمنع حذفها (ON DELETE RESTRICT) — وهو سلوك مقصود لا خلل.
  const NAJAF = `النجف اختبار ${Date.now()}`;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock)
       VALUES ('منتج التوصيل', 'وصف', 10000, $1, 500) RETURNING id`,
      [catalog.categoryId],
    );
    productId = rows[0]!.id;

    // المحافظة ومنطقتاها تُنشآن عبر واجهة الإدارة نفسها التي يستخدمها
    // المسؤول — لا إدراج مباشر يلتفّ على التحقق.
    const governorate = await api
      .post('/api/admin/governorates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: NAJAF, deliveryFee: 5000 })
      .expect(201);
    najafId = governorate.body.data.id;

    const inside = await api
      .post('/api/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ governorateId: najafId, name: 'داخل القضاء', deliveryFee: INSIDE_FEE, sortOrder: 0 })
      .expect(201);
    insideId = inside.body.data.id;

    const outside = await api
      .post('/api/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ governorateId: najafId, name: 'خارج القضاء', deliveryFee: OUTSIDE_FEE, sortOrder: 1 })
      .expect(201);
    outsideId = outside.body.data.id;
  });

  async function order(body: Record<string, unknown>) {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    return api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ fullAddress: 'النجف، حي السلام', phone: '07733333333', ...body });
  }

  /** طلب ناجح — يفشل الاختبار بوضوح إن رفضه الخادم. */
  async function placed(body: Record<string, unknown>) {
    const res = await order(body);
    expect(res.status).toBe(201);
    return res;
  }

  it('النجف + داخل القضاء ← ٣٠٠٠', async () => {
    const res = await placed({ governorateId: najafId, zoneId: insideId });
    expect(res.body.data.deliveryFee).toBe(INSIDE_FEE);
    expect(res.body.data.zoneName).toBe('داخل القضاء');
  });

  it('النجف + خارج القضاء ← ٤٠٠٠', async () => {
    const res = await placed({ governorateId: najafId, zoneId: outsideId });
    expect(res.body.data.deliveryFee).toBe(OUTSIDE_FEE);
    expect(res.body.data.zoneName).toBe('خارج القضاء');
  });

  it('اختيار المنطقة إلزامي متى قُسّمت المحافظة', async () => {
    const res = await order({ governorateId: najafId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ZONE_REQUIRED');
  });

  it('منطقة من محافظة أخرى مرفوضة', async () => {
    const res = await order({ governorateId: catalog.governorateId, zoneId: insideId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ZONE_NOT_SUPPORTED');
  });

  it('محافظة بلا مناطق تستخدم رسومها العامة', async () => {
    const res = await placed({ governorateId: catalog.governorateId });
    // بذرة الاختبارات تضبط رسوم بغداد على ٤٠٠٠.
    expect(res.body.data.deliveryFee).toBe(4000);
    expect(res.body.data.zoneName ?? null).toBeNull();
  });

  it('الرسوم التي يرسلها العميل تُتجاهل — الخادم هو المصدر', async () => {
    const res = await placed({
      governorateId: najafId,
      zoneId: insideId,
      deliveryFee: 0,
      deliveryCost: 0,
      total: 1,
    });
    expect(res.body.data.deliveryFee).toBe(INSIDE_FEE);
    expect(res.body.data.total).toBe(10000 + INSIDE_FEE);
  });

  it('تعديل رسوم المنطقة من اللوحة يسري على الطلب التالي ولا يمسّ السابق', async () => {
    const before = await placed({ governorateId: najafId, zoneId: insideId });
    const beforeId = before.body.data.id as string;

    await api
      .patch(`/api/admin/zones/${insideId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deliveryFee: 3500 })
      .expect(200);

    const after = await placed({ governorateId: najafId, zoneId: insideId });
    expect(after.body.data.deliveryFee).toBe(3500);

    const { rows } = await db.query<{ delivery_fee: string }>(
      'SELECT delivery_fee FROM orders WHERE id = $1',
      [beforeId],
    );
    expect(Number(rows[0]!.delivery_fee)).toBe(INSIDE_FEE);

    await api
      .patch(`/api/admin/zones/${insideId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deliveryFee: INSIDE_FEE })
      .expect(200);
  });

  it('المناطق تُقرأ قبل تسجيل الدخول — شاشة الدفع تحتاجها للعرض', async () => {
    const res = await api
      .get(`/api/catalog/governorates/${najafId}/zones`)
      .expect(200);
    const names = (res.body.data.items as { name: string; deliveryFee: number }[]);
    expect(names.map((zone) => zone.name)).toEqual(['داخل القضاء', 'خارج القضاء']);
    expect(names.map((zone) => zone.deliveryFee)).toEqual([INSIDE_FEE, OUTSIDE_FEE]);
  });

  it('غير المسؤول لا يعدّل رسوم التوصيل', async () => {
    const user = await registerAndLogin();
    const res = await api
      .patch(`/api/admin/zones/${outsideId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ deliveryFee: 0 });
    expect(res.status).toBe(403);
  });
});
