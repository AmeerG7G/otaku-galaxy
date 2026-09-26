import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * اختبارات سلامة البيانات (Data Integrity Regressions):
 * 1) PATCH المنتج: الحقول الغائبة (صور/خيارات/وصف/عروض) يجب ألا تُمسح،
 *    والمصفوفة الفارغة الصريحة تُطبَّق كما هي.
 * 2) دورة المخزون: الإرسال ورفضُ المنتظر لا يمسّانه، والقبول يستهلكه مرة
 *    واحدة، ورفضُ ما قُبل يُرجعه مرة واحدة.
 */

describe('admin product PATCH integrity', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  let extraProducts: string[] = [];

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();

    for (const name of ['منتج اختبار PATCH1', 'منتج اختبار PATCH2', 'منتج اختبار PATCH3', 'منتج اختبار PATCH4']) {
      const { rows: [p] } = await db.query<{ id: string }>(
        `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_offer, is_selected)
         VALUES ($1, $2, $3, $4, $5, 10, FALSE, FALSE)
         ON CONFLICT DO NOTHING RETURNING id`,
        [name, 'وصف أصلي', 15000, catalog.categoryId, catalog.subcategoryId],
      );
      const productId = p?.id ?? (
        await db.query<{ id: string }>('SELECT id FROM products WHERE name = $1', [name])
      ).rows[0]!.id;
      extraProducts.push(productId);
    }

    await seedProductDetails(extraProducts[0], ['https://img.test/1.png', 'https://img.test/2.png'], ['المقاس']);
    await seedProductDetails(extraProducts[1], ['https://img.test/3.png'], ['اللون']);
    await seedProductDetails(extraProducts[2], ['https://img.test/4.png'], ['الحجم']);
  });

  async function seedProductDetails(productId: string, urls: string[], optionNames: string[]) {
    await db.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
    await db.query('DELETE FROM product_options WHERE product_id = $1', [productId]);
    for (const [i, url] of urls.entries()) {
      await db.query(
        'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3)',
        [productId, url, i],
      );
    }
    for (const name of optionNames) {
      await db.query(
        'INSERT INTO product_options (product_id, name, values) VALUES ($1, $2, $3)',
        [productId, name, ['M', 'L']],
      );
    }
  }

  async function readDetails(productId: string) {
    const [images, options] = await Promise.all([
      db.query<{ url: string }>('SELECT url FROM product_images WHERE product_id = $1 ORDER BY sort_order', [productId]),
      db.query<{ name: string; values: string[] }>('SELECT name, values FROM product_options WHERE product_id = $1', [productId]),
    ]);
    return { images: images.rows.map((r) => r.url), options: options.rows };
  }

  it('PATCH with price only keeps images, options, description and flags untouched', async () => {
    const productId = extraProducts[0];
    const res = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 20000 });
    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(20000);

    const details = await readDetails(productId);
    expect(details.images).toEqual(['https://img.test/1.png', 'https://img.test/2.png']);
    expect(details.options.map((o) => o.name)).toEqual(['المقاس']);

    const publicProduct = await api
      .get(`/api/catalog/products/${productId}`)
      .expect(200);
    expect(publicProduct.body.data.description).toBe('وصف أصلي');
    expect(publicProduct.body.data.isOffer).toBe(false);
  });

  it('PATCH with images only replaces images and keeps options', async () => {
    const productId = extraProducts[1];
    const res = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ images: ['https://img.test/new3.png', 'https://img.test/new4.png'] });
    expect(res.status).toBe(200);

    const details = await readDetails(productId);
    expect(details.images).toEqual(['https://img.test/new3.png', 'https://img.test/new4.png']);
    expect(details.options.map((o) => o.name)).toEqual(['اللون']);
  });

  it('PATCH with options only replaces options and keeps images', async () => {
    const productId = extraProducts[2];
    const res = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: 'المقاس', values: ['XL', 'XXL'] }] });
    expect(res.status).toBe(200);

    const details = await readDetails(productId);
    expect(details.images).toEqual(['https://img.test/4.png']);
    expect(details.options).toEqual([{ name: 'المقاس', values: ['XL', 'XXL'] }]);
  });

  it('PATCH with explicit empty images/options clears them', async () => {
    const productId = extraProducts[3];
    const res = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ images: [], options: [] });
    expect(res.status).toBe(200);

    const details = await readDetails(productId);
    expect(details.images).toEqual([]);
    expect(details.options).toEqual([]);
  });

  it('PATCH still validates images and options shapes', async () => {
    const productId = extraProducts[0];
    const badImage = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ images: ['not-a-url'] });
    expect(badImage.status).toBe(400);

    const badOption = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ options: [{ name: '', values: [] }] });
    expect(badOption.status).toBe(400);
  });
});

describe('order stock lifecycle — consumed at approval only', () => {
  let adminToken: string;
  let governorateId: string;
  let rejectProductId: string;
  let cancelProductId: string;

  beforeAll(async () => {
    const catalog = await seedTestCatalog();
    governorateId = catalog.governorateId;
    adminToken = await createAdminUser();

    for (const name of ['منتج اختبار رفض', 'منتج اختبار إلغاء']) {
      const { rows: [p] } = await db.query<{ id: string }>(
        `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_offer, is_selected)
         VALUES ($1, $2, $3, $4, $5, 10, FALSE, FALSE)
         ON CONFLICT DO NOTHING RETURNING id`,
        [name, 'وصف', 10000, catalog.categoryId, catalog.subcategoryId],
      );
      const productId = p?.id ?? (
        await db.query<{ id: string }>('SELECT id FROM products WHERE name = $1', [name])
      ).rows[0]!.id;
      if (name === 'منتج اختبار رفض') rejectProductId = productId;
      else cancelProductId = productId;
    }
  });

  async function stockOf(productId: string) {
    const { rows } = await db.query<{ stock: string }>('SELECT stock FROM products WHERE id = $1', [productId]);
    return Number(rows[0]!.stock);
  }

  async function placeOrder(productId: string, quantity: number) {
    const { token } = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity })
      .expect(200);
    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ governorateId, fullAddress: 'بغداد، الكرادة', phone: '07733333333' });
    if (order.status !== 201) throw new Error(`order placement failed: ${order.status}`);
    return { orderId: order.body.data.id as string, token };
  }

  /**
   * [CONTRACT 2026-09-14] كان هذا الاختبار «الرفض يُرجع المخزون مرة واحدة»
   * لأن الإرسال كان ينزّله. صار الإرسال بلا أثر على المخزون، فالرفض بلا
   * استرجاع — والاختبار يثبت الغياب لا الاسترجاع.
   */
  it('submission leaves stock untouched; rejection (and its retry) changes nothing', async () => {
    const before = await stockOf(rejectProductId!);
    const { orderId } = await placeOrder(rejectProductId!, 2);
    expect(await stockOf(rejectProductId!)).toBe(before);

    const rejected = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'المنتج غير متوفر' });
    expect(rejected.status).toBe(200);
    expect(await stockOf(rejectProductId!)).toBe(before);

    // سبب الرفض إلزامي دائماً — حتى في إعادة المحاولة على طلب مرفوض.
    const retry = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'المنتج غير متوفر' });
    expect(retry.status).toBe(200);
    expect(retry.body.data.status).toBe('REJECTED');
    expect(await stockOf(rejectProductId!)).toBe(before);
  });

  it('approval consumes stock exactly once; a later rejection restores it once', async () => {
    const before = await stockOf(rejectProductId!);
    const { orderId } = await placeOrder(rejectProductId!, 1);
    expect(await stockOf(rejectProductId!)).toBe(before);

    // الموافقة تنقل مباشرةً إلى «قيد التوصيل» — وهنا وحده يُستهلك المخزون.
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    expect(await stockOf(rejectProductId!)).toBe(before - 1);

    // تكرار القبول لا ينزّل ثانيةً.
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    expect(await stockOf(rejectProductId!)).toBe(before - 1);

    // رفضُ طلبٍ مقبول يُرجع ما استُهلك عند القبول — القاعدة القائمة.
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'نفد المخزون' })
      .expect(200);
    expect(await stockOf(rejectProductId!)).toBe(before);

    // وتكرار الرفض لا يُرجع ثانيةً.
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'نفد المخزون' })
      .expect(200);
    expect(await stockOf(rejectProductId!)).toBe(before);
  });

  it('rejection without a reason is refused', async () => {
    const { orderId } = await placeOrder(rejectProductId!, 1);
    const response = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED' });
    // نفس اصطلاح بقية أخطاء التحقق في هذا المشروع.
    expect(response.status).toBe(400);
  });

  /**
   * [PRODUCT] الإلغاء صلاحية إدارة لا عميل.
   *
   * لا يكفي أن يردّ المسار 404: يُقاس المخزون والحالة بعد المحاولة أيضاً —
   * الطلب يبقى منتظراً، ولا بابَ خلفياً يُغيّر شيئاً بطلبٍ من العميل.
   */
  it('[PRODUCT] العميل لا يملك إلغاء — والطلب يبقى منتظراً', async () => {
    const before = await stockOf(cancelProductId!);
    const { orderId, token } = await placeOrder(cancelProductId!, 2);
    expect(await stockOf(cancelProductId!)).toBe(before);

    const attempt = await api
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(attempt.status).toBe(404);

    expect(await stockOf(cancelProductId!)).toBe(before);
    const still = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(still.body.data.status).toBe('PENDING_ADMIN_CONFIRMATION');

    // وللإدارة وحدها أن ترفضه — بلا أثر على المخزون.
    const rejected = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'أُلغي من قبل الإدارة' });
    expect(rejected.status).toBe(200);
    expect(await stockOf(cancelProductId!)).toBe(before);
  });
});
