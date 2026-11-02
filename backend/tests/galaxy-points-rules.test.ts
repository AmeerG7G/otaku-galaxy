import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  MAX_REVIEW_PHOTOS,
  REVIEW_POINTS_CAP_PER_ORDER,
  eligiblePurchaseValue,
  purchasePointsFor,
  reviewPointsFor,
} from '../src/domain/galaxyPoints.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
} from './helpers.js';

/**
 * القواعد الثابتة لنقاط المجرّة، من الدالة الصرفة إلى المسار الكامل.
 *
 * كل رقم هنا قرار تجاري لا إعداد: خمس نقاط لكل ١٠٬٠٠٠ دينار، نقطة للتعليق،
 * خمسٌ مقطوعة للصور، خمس صور حدّاً أقصى، وعشرون نقطة سقفاً لكل طلب.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

/** منتج بسعر محدّد — لصنع قيم شراء دقيقة. */
async function productAt(price: number, stock = 500) {
  const name = `منتج قواعد ${price}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
     VALUES ($1, 'وصف', $2, $3, $4, $5) RETURNING id`,
    [name, price, catalog.categoryId, catalog.subcategoryId, stock],
  );
  return rows[0]!.id;
}

/** يوصل طلباً إلى COMPLETED ويفتح نافذة التقييم. */
async function completedOrder(items: { productId: string; quantity: number }[]) {
  const user = await registerAndLogin();
  for (const item of items) {
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: item.productId, quantity: item.quantity })
      .expect(200);
  }
  const order = await api
    .post('/api/orders')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      governorateId: catalog.governorateId,
      fullAddress: 'بغداد، الكرادة',
      phone: '07733333333',
    })
    .expect(201);
  const orderId = order.body.data.id as string;

  for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status })
      .expect(200);
  }
  return { user, orderId, order: order.body.data };
}

async function balanceOf(token: string) {
  const res = await api.get('/api/points').set('Authorization', `Bearer ${token}`).expect(200);
  return res.body.data.balance as number;
}

async function approve(reviewId: string) {
  await api
    .patch(`/api/admin/reviews/${reviewId}/moderate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'approved' })
    .expect(200);
}

// ═══════════════ نقاط الشراء ═══════════════

describe('نقاط الشراء — القاعدة الصرفة', () => {
  it('الجدول المرجعي: كل ١٠٬٠٠٠ دينار تمنح ٥ نقاط', () => {
    expect(purchasePointsFor(10_000)).toBe(5);
    expect(purchasePointsFor(50_000)).toBe(25);
    expect(purchasePointsFor(100_000)).toBe(50);
    expect(purchasePointsFor(500_000)).toBe(250);
    expect(purchasePointsFor(1_000_000)).toBe(500);
    expect(purchasePointsFor(2_000_000)).toBe(1_000);
  });

  it('الباقي يُهمَل ولا يُرحَّل', () => {
    expect(purchasePointsFor(9_999)).toBe(0);
    expect(purchasePointsFor(19_999)).toBe(5);
    expect(purchasePointsFor(99_999)).toBe(45);
    // ولا أثر لطلبٍ سابق: الدالة صرفة بلا ذاكرة.
    expect(purchasePointsFor(9_999)).toBe(0);
  });

  it('القيم الصفرية والسالبة والفاسدة تعطي صفراً لا استثناءً', () => {
    expect(purchasePointsFor(0)).toBe(0);
    expect(purchasePointsFor(-50_000)).toBe(0);
    expect(purchasePointsFor(Number.NaN)).toBe(0);
    expect(purchasePointsFor(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('قيمة الشراء المؤهَّلة = مجموع المنتجات ناقص الخصم', () => {
    expect(eligiblePurchaseValue({ productsTotal: 100_000, discount: 0 })).toBe(100_000);
    expect(eligiblePurchaseValue({ productsTotal: 100_000, discount: 30_000 })).toBe(70_000);
    // لا قيمة سالبة مهما بلغ الخصم.
    expect(eligiblePurchaseValue({ productsTotal: 10_000, discount: 50_000 })).toBe(0);
  });
});

describe('نقاط الشراء — المسار الكامل', () => {
  it('طلب بـ١٠٠٬٠٠٠ دينار يمنح ٥٠ نقطة عند الاستلام', async () => {
    const productId = await productAt(100_000);
    const { user } = await completedOrder([{ productId, quantity: 1 }]);
    expect(await balanceOf(user.token)).toBe(50);
  });

  it('طلب بمليون دينار يمنح ٥٠٠ نقطة', async () => {
    const productId = await productAt(500_000);
    const { user } = await completedOrder([{ productId, quantity: 2 }]);
    expect(await balanceOf(user.token)).toBe(500);
  });

  it('طلب بمليونين يمنح ١٬٠٠٠ نقطة', async () => {
    const productId = await productAt(1_000_000);
    const { user } = await completedOrder([{ productId, quantity: 2 }]);
    expect(await balanceOf(user.token)).toBe(1_000);
  });

  it('طلب دون العتبة لا يمنح شيئاً ولا يكتب صفّاً بصفر', async () => {
    const productId = await productAt(4_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);
    expect(await balanceOf(user.token)).toBe(0);

    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM points_ledger WHERE order_id = $1`,
      [orderId],
    );
    expect(rows[0]!.n).toBe('0');
  });

  /**
   * [CRITICAL] رسوم التوصيل خارج الحساب.
   *
   * الطلب هنا ٥٬٠٠٠ منتجات + ٤٬٠٠٠ توصيل = ٩٬٠٠٠ إجمالاً. لو دخل التوصيل
   * في القيمة المؤهَّلة لظلّ صفراً هنا، لكنه كان سيغيّر النتيجة في طلبات
   * أخرى — ويكافئ سكنى المحافظة البعيدة لا الشراء.
   */
  it('[CRITICAL] رسوم التوصيل لا تدخل قيمة الشراء المؤهَّلة', async () => {
    const productId = await productAt(8_000);
    const { user, order } = await completedOrder([{ productId, quantity: 1 }]);

    expect(Number(order.deliveryFee)).toBeGreaterThan(0);
    // ٨٬٠٠٠ منتجات → صفر نقاط، رغم أن الإجمالي مع التوصيل يتجاوز ١٠٬٠٠٠.
    expect(Number(order.total)).toBeGreaterThan(10_000);
    expect(await balanceOf(user.token)).toBe(0);
  });

  it('الاستلام المكرَّر لا يمنح نقاط شراء ثانية', async () => {
    const productId = await productAt(50_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);
    expect(await balanceOf(user.token)).toBe(25);

    for (let i = 0; i < 3; i++) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }
    expect(await balanceOf(user.token)).toBe(25);
  });
});

// ═══════════════ نقاط التقييم ═══════════════

describe('نقاط التقييم — القاعدة الصرفة', () => {
  it('التعليق وحده نقطة', () => {
    expect(reviewPointsFor({ hasComment: true, photoCount: 0 }).total).toBe(1);
  });

  it('من صورة إلى خمس: خمس نقاط مقطوعة لا خمسٌ لكل صورة', () => {
    for (let photos = 1; photos <= MAX_REVIEW_PHOTOS; photos++) {
      expect(reviewPointsFor({ hasComment: false, photoCount: photos }).total, `${photos}`).toBe(5);
    }
  });

  it('التعليق مع الصور يتجمّعان: ٦ حدّاً أقصى', () => {
    expect(reviewPointsFor({ hasComment: true, photoCount: 1 }).total).toBe(6);
    expect(reviewPointsFor({ hasComment: true, photoCount: 5 }).total).toBe(6);
  });

  it('لا تعليق ولا صورة: صفر', () => {
    expect(reviewPointsFor({ hasComment: false, photoCount: 0 }).total).toBe(0);
  });
});

describe('نقاط التقييم — المسار الكامل', () => {
  it('تعليق بلا صورة يمنح نقطة واحدة', async () => {
    const productId = await productAt(1_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);

    const review = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'ممتاز' })
      .expect(201);
    await approve(review.body.data.id);

    expect(await balanceOf(user.token)).toBe(1);
  });

  it('صورة بلا تعليق تمنح خمساً', async () => {
    const productId = await productAt(1_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);

    const review = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        orderId,
        productId,
        rating: 5,
        comment: '',
        photoUrls: [await registerUploadedPhoto(user.userId)],
      })
      .expect(201);
    await approve(review.body.data.id);

    expect(await balanceOf(user.token)).toBe(5);
  });

  it('من صورة إلى خمس صور: المنحة خمسٌ في كل الحالات', async () => {
    for (let count = 1; count <= MAX_REVIEW_PHOTOS; count++) {
      const productId = await productAt(1_000);
      const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);
      const photos = await Promise.all(
        Array.from({ length: count }, () => registerUploadedPhoto(user.userId)),
      );

      const review = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ orderId, productId, rating: 5, comment: '', photoUrls: photos })
        .expect(201);
      expect(review.body.data.photoUrls, `${count} صور`).toHaveLength(count);
      await approve(review.body.data.id);

      expect(await balanceOf(user.token), `${count} صور`).toBe(5);
    }
  });

  it('تعليق + صور يمنح ٦ — الحدّ الأقصى للتقييم الواحد', async () => {
    const productId = await productAt(1_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);
    const photos = await Promise.all(
      Array.from({ length: 5 }, () => registerUploadedPhoto(user.userId)),
    );

    const review = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'رائع جداً', photoUrls: photos })
      .expect(201);
    await approve(review.body.data.id);

    expect(await balanceOf(user.token)).toBe(6);
  });

  it('[CRITICAL] ست صور مرفوضة على الخادم', async () => {
    const productId = await productAt(1_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);
    const photos = await Promise.all(
      Array.from({ length: 6 }, () => registerUploadedPhoto(user.userId)),
    );

    const res = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'ست صور', photoUrls: photos });
    expect([400, 422]).toContain(res.status);

    // ولا صفّ في القاعدة.
    const { rows } = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM reviews WHERE user_id = $1',
      [user.userId],
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('التقييم المعتمد مرتين لا يمنح نقاطاً مرتين', async () => {
    const productId = await productAt(1_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);

    const review = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 4, comment: 'جيد' })
      .expect(201);
    await approve(review.body.data.id);
    const once = await balanceOf(user.token);

    for (let i = 0; i < 3; i++) await approve(review.body.data.id);
    expect(await balanceOf(user.token)).toBe(once);
  });

  it('إعادة إرسال تقييم مرفوض لا تمنح نقاطاً', async () => {
    const productId = await productAt(1_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);

    const review = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 1, comment: 'نص مرفوض' })
      .expect(201);
    const reviewId = review.body.data.id as string;

    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'لغة غير مناسبة' })
      .expect(200);
    expect(await balanceOf(user.token)).toBe(0);

    await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ rating: 4, comment: 'تعليق مهذّب' })
      .expect(200);
    // ما زال بانتظار المراجعة — الاعتماد وحده هو الحدث المؤهِّل.
    expect(await balanceOf(user.token)).toBe(0);
  });

  it('الرفض بعد الاعتماد يسحب نقاط التقييم ولا يمسّ نقاط الشراء', async () => {
    const productId = await productAt(30_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);
    expect(await balanceOf(user.token)).toBe(15);

    const review = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'ممتاز' })
      .expect(201);
    await approve(review.body.data.id);
    expect(await balanceOf(user.token)).toBe(16);

    await api
      .patch(`/api/admin/reviews/${review.body.data.id}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'مراجعة ثانية' })
      .expect(200);
    expect(await balanceOf(user.token)).toBe(15);
  });
});

// ═══════════════ تقييم واحد لكل منتج ═══════════════

describe('تقييم واحد لكل زبون لكل منتج', () => {
  it('لا تقييم ثانٍ لنفس المنتج في نفس الطلب', async () => {
    const productId = await productAt(1_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);

    await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'الأول' })
      .expect(201);

    const second = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 1, comment: 'الثاني' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('REVIEW_EXISTS');
  });

  /**
   * [CRITICAL] شراء المنتج نفسه مرة ثانية لا يفتح تقييماً ثانياً.
   *
   * كان القيد `(order_id, product_id)`، فطلبٌ ثانٍ لنفس المنتج كان يمنح
   * مكافأة تقييم ثانية — باب حصد نقاط بإعادة شراء أرخص منتج.
   */
  it('[CRITICAL] إعادة شراء المنتج لا تفتح تقييماً ثانياً ولا مكافأة ثانية', async () => {
    const productId = await productAt(1_000);
    const first = await completedOrder([{ productId, quantity: 1 }]);

    const review = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${first.user.token}`)
      .send({ orderId: first.orderId, productId, rating: 5, comment: 'أعجبني' })
      .expect(201);
    await approve(review.body.data.id);
    const afterFirst = await balanceOf(first.user.token);

    // نفس الزبون يشتري نفس المنتج في طلب جديد.
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${first.user.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const second = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${first.user.token}`)
      .send({
        governorateId: catalog.governorateId,
        fullAddress: 'بغداد، الكرادة',
        phone: '07733333333',
      })
      .expect(201);
    const secondOrderId = second.body.data.id as string;
    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api
        .patch(`/api/admin/orders/${secondOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }

    const attempt = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${first.user.token}`)
      .send({ orderId: secondOrderId, productId, rating: 5, comment: 'مرة ثانية' });
    expect(attempt.status).toBe(409);
    expect(attempt.body.error.code).toBe('REVIEW_EXISTS');

    // النقاط لم تزد إلا بنقاط شراء الطلب الثاني (وهي صفر هنا: ١٬٠٠٠ دينار).
    expect(await balanceOf(first.user.token)).toBe(afterFirst);

    // والتقييم الأول ما زال تقييمه.
    const mine = await api
      .get('/api/reviews')
      .set('Authorization', `Bearer ${first.user.token}`)
      .expect(200);
    const forProduct = (mine.body.data as { productId: string }[]).filter(
      (r) => r.productId === productId,
    );
    expect(forProduct).toHaveLength(1);
  });

  it('البحث عن تقييم منتج يجده أياً كان الطلب المسؤول عنه', async () => {
    const productId = await productAt(1_000);
    const { user, orderId } = await completedOrder([{ productId, quantity: 1 }]);
    await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 4, comment: 'رأيي' })
      .expect(201);

    const found = await api
      .get('/api/reviews/find')
      .query({ orderId: '00000000-0000-0000-0000-000000000000', productId })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(found.body.data?.productId).toBe(productId);
  });
});

// ═══════════════ سقف نقاط التقييم لكل طلب ═══════════════

describe('سقف نقاط التقييم لكل طلب', () => {
  /**
   * طلبٌ فيه ستة منتجات رخيصة، كل تقييم بـ٦ نقاط = ٣٦ نظرياً.
   * السقف يقصّها إلى ٢٠، ونقاط الشراء تبقى خارج السقف.
   */
  it('[CRITICAL] لا تتجاوز نقاط التقييم عشرين للطلب الواحد', async () => {
    const productIds = await Promise.all(
      Array.from({ length: 6 }, () => productAt(1_000)),
    );
    const { user, orderId } = await completedOrder(
      productIds.map((productId) => ({ productId, quantity: 1 })),
    );
    // ٦٬٠٠٠ دينار → صفر نقاط شراء، فيبقى الرصيد قياساً صافياً للتقييمات.
    expect(await balanceOf(user.token)).toBe(0);

    for (const productId of productIds) {
      const photos = [await registerUploadedPhoto(user.userId)];
      const review = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ orderId, productId, rating: 5, comment: 'ممتاز', photoUrls: photos })
        .expect(201);
      await approve(review.body.data.id);
    }

    expect(await balanceOf(user.token)).toBe(REVIEW_POINTS_CAP_PER_ORDER);
  });

  it('نقاط الشراء خارج السقف — تُضاف فوقه', async () => {
    const expensive = await productAt(100_000);
    const cheap = await Promise.all(Array.from({ length: 5 }, () => productAt(1_000)));
    const { user, orderId } = await completedOrder([
      { productId: expensive, quantity: 1 },
      ...cheap.map((productId) => ({ productId, quantity: 1 })),
    ]);

    // ١٠٥٬٠٠٠ دينار → ٥٠ نقطة شراء.
    expect(await balanceOf(user.token)).toBe(50);

    for (const productId of [expensive, ...cheap]) {
      const review = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          orderId,
          productId,
          rating: 5,
          comment: 'ممتاز',
          photoUrls: [await registerUploadedPhoto(user.userId)],
        })
        .expect(201);
      await approve(review.body.data.id);
    }

    // ٦ تقييمات × ٦ = ٣٦ نظرياً، مقصوصة إلى ٢٠. المجموع ٥٠ + ٢٠.
    expect(await balanceOf(user.token)).toBe(50 + REVIEW_POINTS_CAP_PER_ORDER);
  });

  /**
   * [CRITICAL] اعتمادان متزامنان لتقييمين من الطلب نفسه.
   *
   * بدون قفل صفّ الطلب يقرأ كلٌّ منهما «المُنح حتى الآن» قبل أن يكتب الآخر،
   * فيمنحان معاً فوق السقف. هذا الاختبار يقيس النتيجة لا التوقيت.
   */
  it('[CRITICAL] الاعتمادات المتزامنة لا تتجاوز السقف', async () => {
    const productIds = await Promise.all(
      Array.from({ length: 5 }, () => productAt(1_000)),
    );
    const { user, orderId } = await completedOrder(
      productIds.map((productId) => ({ productId, quantity: 1 })),
    );

    const reviewIds: string[] = [];
    for (const productId of productIds) {
      const review = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          orderId,
          productId,
          rating: 5,
          comment: 'ممتاز',
          photoUrls: [await registerUploadedPhoto(user.userId)],
        })
        .expect(201);
      reviewIds.push(review.body.data.id as string);
    }

    // خمسة اعتمادات دفعةً واحدة: ٣٠ نقطة نظرياً.
    await Promise.all(
      reviewIds.map((id) =>
        api
          .patch(`/api/admin/reviews/${id}/moderate`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'approved' }),
      ),
    );

    expect(await balanceOf(user.token)).toBeLessThanOrEqual(REVIEW_POINTS_CAP_PER_ORDER);
  });

  /**
   * الحصّة تُملأ بالتعليق أولاً، ولا تُمنح مكافأة صور مجزّأة.
   *
   * أربعة تقييمات بستّ نقاط = ٢٤ نظرياً. الأول ٦ (يبقى ١٤)، الثاني ٦ (يبقى
   * ٨)، الثالث ٦ (يبقى ٢)، والرابع ينال نقطة التعليق فقط لأن ما بقي (٢) لا
   * يكفي مكافأة الصور المقطوعة (٥) — فالمجموع ١٩ لا ٢٠.
   *
   * هذا مقصود: السقف حدٌّ أعلى لا هدفٌ يُبلَغ. منح «٢» من مكافأة الصور كان
   * سيكتب في دفتر الزبون سطراً لا يطابق أي قاعدة معلنة.
   */
  it('لا تُمنح مكافأة صور مجزّأة لملء السقف', async () => {
    const productIds = await Promise.all(
      Array.from({ length: 4 }, () => productAt(1_000)),
    );
    const { user, orderId } = await completedOrder(
      productIds.map((productId) => ({ productId, quantity: 1 })),
    );

    const ids: string[] = [];
    for (const productId of productIds) {
      const review = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          orderId,
          productId,
          rating: 5,
          comment: 'ممتاز',
          photoUrls: [await registerUploadedPhoto(user.userId)],
        })
        .expect(201);
      ids.push(review.body.data.id as string);
      await approve(review.body.data.id);
    }
    expect(await balanceOf(user.token)).toBe(19);

    await api
      .patch(`/api/admin/reviews/${ids[0]}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'مراجعة' })
      .expect(200);

    // سحب الاعتماد يحذف صفوف ذلك التقييم من الدفتر، فينزل الرصيد وتُفتح
    // مساحةٌ في السقف لتقييم لاحق من نفس الطلب.
    const after = await balanceOf(user.token);
    expect(after).toBe(19 - 6);
  });
});
