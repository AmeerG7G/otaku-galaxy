import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { dispatchDueRatingReminders } from '../src/jobs/ratingReminderJob.js';
import {
  api,
  createAdminUser,
  fastForwardRatingWindow,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
} from './helpers.js';

/**
 * دورة حياة الطلب كاملة: من السلة إلى التقييم المنشور.
 *
 * الغرض إثبات أن الحالة الحقيقية في قاعدة البيانات هي المرجع في كل خطوة —
 * لا حالة محلية في التطبيق ولا مؤقّت في الواجهة.
 */
describe('order → delivery → rating lifecycle', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();

    // هذا الملف ينشئ عشرات الطلبات، وكل طلب ينزّل المخزون فعلاً (وهو
    // السلوك الصحيح). بذور الكتالوج تعطي ١٠ قطع فقط و`ON CONFLICT DO
    // NOTHING` لا يعيد ضبطها بين التشغيلات، فنرفع المخزون هنا بدل تعطيل
    // التحقق من المخزون في مسار الطلب.
    await db.query(
      'UPDATE products SET stock = 500 WHERE id = ANY($1::uuid[])',
      [catalog.productIds],
    );
  });

  async function placeOrder(productId: string, quantity = 1) {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity })
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
    return { user, orderId: created.body.data.id as string, order: created.body.data };
  }

  async function advanceTo(orderId: string, target: string) {
    const path = ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED'];
    for (const status of path) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
      if (status === target) return;
    }
  }

  // ── نافذة التقييم ──

  it('a fresh order carries no delivery or rating window', async () => {
    const { order } = await placeOrder(catalog.productIds[0]!);

    expect(order.status).toBe('PENDING_ADMIN_CONFIRMATION');
    expect(order.deliveredAt).toBeNull();
    expect(order.ratingAvailableAt).toBeNull();
    expect(order.ratingAvailable).toBe(false);
  });

  it('delivery opens a rating window in the future, not immediately', async () => {
    const { user, orderId } = await placeOrder(catalog.productIds[0]!);
    await advanceTo(orderId, 'COMPLETED');

    const detail = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(detail.body.data.status).toBe('COMPLETED');
    expect(detail.body.data.deliveredAt).not.toBeNull();
    expect(detail.body.data.ratingAvailableAt).not.toBeNull();
    // المهلة الافتراضية يوم كامل — التقييم ليس متاحاً لحظة الاستلام.
    expect(detail.body.data.ratingAvailable).toBe(false);

    const delivered = new Date(detail.body.data.deliveredAt as string).getTime();
    const available = new Date(detail.body.data.ratingAvailableAt as string).getTime();
    expect(available - delivered).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
  });

  it('refuses a rating submitted before the window opens', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await placeOrder(productId);
    await advanceTo(orderId, 'COMPLETED');

    const tooEarly = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'ممتاز' });

    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('RATING_NOT_YET_AVAILABLE');

    // ولا يُنشأ أي تقييم في القاعدة.
    const { rows } = await db.query('SELECT 1 FROM reviews WHERE order_id = $1', [orderId]);
    expect(rows).toHaveLength(0);
  });

  it('accepts the rating once the window has opened', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await placeOrder(productId);
    await advanceTo(orderId, 'COMPLETED');
    await fastForwardRatingWindow(orderId);

    const detail = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.data.ratingAvailable).toBe(true);

    await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'وصل بسرعة' })
      .expect(201);
  });

  it('never opens a rating window for a rejected order', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await placeOrder(productId);
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'نفد المخزون' })
      .expect(200);

    const detail = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.data.deliveredAt).toBeNull();
    expect(detail.body.data.ratingAvailable).toBe(false);

    const attempt = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'محاولة' });
    expect(attempt.status).toBe(400);
    expect(attempt.body.error.code).toBe('ORDER_NOT_COMPLETED');
  });

  it('does not move the rating window when COMPLETED is re-applied', async () => {
    const { orderId } = await placeOrder(catalog.productIds[0]!);
    await advanceTo(orderId, 'COMPLETED');

    const first = await db.query<{ delivered_at: Date; rating_available_at: Date }>(
      'SELECT delivered_at, rating_available_at FROM orders WHERE id = $1',
      [orderId],
    );

    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    const second = await db.query<{ delivered_at: Date; rating_available_at: Date }>(
      'SELECT delivered_at, rating_available_at FROM orders WHERE id = $1',
      [orderId],
    );
    expect(second.rows[0]!.delivered_at).toEqual(first.rows[0]!.delivered_at);
    expect(second.rows[0]!.rating_available_at).toEqual(first.rows[0]!.rating_available_at);
  });

  // ── جدولة تذكير التقييم ──

  it('sends a rating reminder only when the window is due, and only once', async () => {
    const { user, orderId } = await placeOrder(catalog.productIds[0]!);
    await advanceTo(orderId, 'COMPLETED');

    const unreadBefore = async () => {
      const list = await api
        .get('/api/notifications')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);
      return (list.body.data.items as { orderId: string | null; title: string }[]).filter(
        (n) => n.orderId === orderId && n.title.includes('شلونها'),
      );
    };

    // لم تحن المهلة بعد: لا تذكير.
    await dispatchDueRatingReminders();
    expect(await unreadBefore()).toHaveLength(0);

    // حان الموعد.
    await fastForwardRatingWindow(orderId);
    await dispatchDueRatingReminders();
    expect(await unreadBefore()).toHaveLength(1);

    // دورات لاحقة لا تكرّر التذكير — الحارس عمود في القاعدة لا ذاكرة عملية.
    await dispatchDueRatingReminders();
    await dispatchDueRatingReminders();
    expect(await unreadBefore()).toHaveLength(1);
  });

  it('does not remind for orders that were never delivered', async () => {
    const { orderId } = await placeOrder(catalog.productIds[0]!);
    await dispatchDueRatingReminders();

    const { rows } = await db.query(
      'SELECT 1 FROM notifications WHERE order_id = $1 AND title LIKE $2',
      [orderId, '%شلونها%'],
    );
    expect(rows).toHaveLength(0);
  });

  // ── تتبّع الطلب ──

  it('exposes a timestamped status history without leaking who changed it', async () => {
    const { user, orderId } = await placeOrder(catalog.productIds[0]!);
    await advanceTo(orderId, 'OUT_FOR_DELIVERY');

    const detail = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const history = detail.body.data.statusHistory as {
      status: string;
      createdAt: string;
      note: string | null;
    }[];
    expect(history.map((h) => h.status)).toEqual([
      'PENDING_ADMIN_CONFIRMATION',
      'CONFIRMED',
      'PREPARING',
      'OUT_FOR_DELIVERY',
    ]);
    for (const entry of history) {
      expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
      expect(entry).not.toHaveProperty('changedBy');
      expect(entry).not.toHaveProperty('changed_by');
    }
  });

  // ── أمان صورة التقييم ──

  it('refuses a review photo that was never uploaded to this server', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await placeOrder(productId);
    await advanceTo(orderId, 'COMPLETED');
    await fastForwardRatingWindow(orderId);

    const forged = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        orderId,
        productId,
        rating: 5,
        comment: 'صورة من خارج المتجر',
        photoUrl: 'https://attacker.example/tracking-pixel.png',
      });

    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('INVALID_PHOTO_URL');
  });

  it('accepts a review photo that really was uploaded', async () => {
    const productId = catalog.productIds[1]!;
    const { user, orderId } = await placeOrder(productId);
    await advanceTo(orderId, 'COMPLETED');
    await fastForwardRatingWindow(orderId);

    const photoUrl = await registerUploadedPhoto(user.userId);
    const created = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 4, comment: 'حلو', photoUrl })
      .expect(201);

    expect(created.body.data.photoUrl).toBe(photoUrl);
  });

  // ── السلة تحمل بيانات ترويج التوصيل ──

  it('cart lines carry the delivery promo fields the checkout preview needs', async () => {
    const productId = catalog.productIds[2]!;
    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hasDeliveryPromo: true, deliveryPromoAmount: 1000 })
      .expect(200);

    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 2 })
      .expect(200);

    const cart = await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const line = (cart.body.data.items as Record<string, unknown>[]).find(
      (l) => l.productId === productId,
    )!;
    expect(line.hasDeliveryPromo).toBe(true);
    expect(Number(line.deliveryPromoAmount)).toBe(1000);

    // وتعود إلى الصفر متى أُطفئ الترويج — لا شارة بلا خصم.
    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hasDeliveryPromo: false })
      .expect(200);
    const after = await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const cleared = (after.body.data.items as Record<string, unknown>[]).find(
      (l) => l.productId === productId,
    )!;
    expect(cleared.hasDeliveryPromo).toBe(false);
    expect(Number(cleared.deliveryPromoAmount)).toBe(0);
  });

  // ── لوحة الإدارة ترى الطلب فعلاً ──
  //
  // انحدار: كان `GET /api/admin/orders` يرمي 500 دائماً لأن المتحكّم استدعى
  // ‎.partial()‎ على مخطّط يحمل ‎.refine()‎، وZod يرفض ذلك. لم يكن أي اختبار
  // يلمس هذا المسار، فبقيت صفحة الطلبات ولوحة التحكم معطّلتين بلا إنذار.
  describe('admin order listing', () => {
    it('lists orders, unfiltered', async () => {
      const { orderId } = await placeOrder(catalog.productIds[0]!);

      const list = await api
        .get('/api/admin/orders?limit=50')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(list.body.data.items)).toBe(true);
      expect(list.body.data.statusCounts).toBeDefined();
      expect(
        (list.body.data.items as { id: string }[]).some((o) => o.id === orderId),
      ).toBe(true);
    });

    it('filters by status', async () => {
      const { orderId } = await placeOrder(catalog.productIds[0]!);
      await advanceTo(orderId, 'CONFIRMED');

      const pending = await api
        .get('/api/admin/orders?status=PENDING_ADMIN_CONFIRMATION&limit=50')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (pending.body.data.items as { id: string }[]).some((o) => o.id === orderId),
      ).toBe(false);

      const confirmed = await api
        .get('/api/admin/orders?status=CONFIRMED&limit=50')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (confirmed.body.data.items as { id: string }[]).some((o) => o.id === orderId),
      ).toBe(true);
    });

    it('rejects an unknown status instead of ignoring it', async () => {
      const bad = await api
        .get('/api/admin/orders?status=NOT_A_STATUS')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(bad.status).toBe(400);
    });

    it('is closed to a normal customer', async () => {
      const user = await registerAndLogin();
      await api
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(403);
    });

    it('carries the delivery discount so the admin total reconciles', async () => {
      const { orderId } = await placeOrder(catalog.productIds[0]!);
      const detail = await api
        .get(`/api/admin/orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const o = detail.body.data;
      expect(o).toHaveProperty('deliveryDiscount');
      const payableDelivery = o.deliveryFee - o.deliveryDiscount;
      expect(o.total).toBe(o.productsTotal + payableDelivery - o.discount);
    });
  });

  // ── الملكية ──

  it('a customer cannot read another customer order', async () => {
    const { orderId } = await placeOrder(catalog.productIds[0]!);
    const stranger = await registerAndLogin();

    const attempt = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(attempt.status).toBe(403);
  });
});

/**
 * تذكير الاستلام القابل للضبط من لوحة الإدارة.
 *
 * الجدولة تقرأ عموداً في القاعدة لا مؤقّتاً في الذاكرة، فتعديل الموعد
 * ينعكس تلقائياً ولا يترك تذكيراً قديماً «معلّقاً».
 */
describe('admin-controlled delivery reminder', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    await db.query('UPDATE products SET stock = 500 WHERE id = ANY($1::uuid[])', [
      catalog.productIds,
    ]);
  });

  async function deliveredOrder() {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: catalog.productIds[0]!, quantity: 1 })
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
    const orderId = created.body.data.id as string;
    for (const status of ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }
    return { user, orderId };
  }

  const remindersFor = async (token: string, orderId: string) => {
    const list = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (list.body.data.items as { orderId: string | null; title: string }[]).filter(
      (n) => n.orderId === orderId && n.title.includes('شلونها'),
    );
  };

  it('defaults to 24 hours after delivery', async () => {
    const { orderId } = await deliveredOrder();
    const { rows } = await db.query<{ delivered_at: Date; rating_available_at: Date }>(
      'SELECT delivered_at, rating_available_at FROM orders WHERE id = $1',
      [orderId],
    );
    const gap =
      rows[0]!.rating_available_at.getTime() - rows[0]!.delivered_at.getTime();
    expect(Math.round(gap / 3_600_000)).toBe(24);
  });

  it('admin can shorten the delay and the scheduler honours the new time', async () => {
    const { user, orderId } = await deliveredOrder();

    // لم تحن المهلة الافتراضية.
    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(0);

    // الإدارة تنقله إلى «قبل ساعة» — أي مستحق الآن.
    await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ remindAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(200);

    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(1);
  });

  it('rescheduling never leaves the old schedule pending as a duplicate', async () => {
    const { user, orderId } = await deliveredOrder();

    for (const hours of [1, 6, 48]) {
      await api
        .patch(`/api/admin/orders/${orderId}/reminder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ delayHours: hours })
        .expect(200);
    }
    // آخر قيمة هي 48 ساعة — لا شيء مستحق الآن رغم مرور 1 و6 في الطريق.
    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(0);

    await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delayHours: 0 })
      .expect(200);
    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(1);
  });

  /**
   * [SCENARIO D] الإدارة تغيّر التوقيت — والطرفان يتبعان القيمة المحفوظة.
   *
   * الاختبارات أعلاه تثبت أن **الجدولة** تتبع الموعد الجديد. هذا يثبت
   * النصف الآخر: ما يقرؤه التطبيق (`ratingAvailableAt` و`ratingAvailable`)
   * هو نفس الصفّ الذي تقرؤه الجدولة — فلا يمكن أن يفتح أحدهما التقييم
   * بينما يراه الآخر مغلقاً.
   */
  it('SCENARIO D — تعديل الإدارة ينعكس على ما يقرؤه التطبيق، لا الجدولة وحدها', async () => {
    const { user, orderId } = await deliveredOrder();

    const before = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(before.body.data.ratingAvailable).toBe(false);
    const originalStamp = before.body.data.ratingAvailableAt as string;
    expect(originalStamp).toBeTruthy();

    // الإدارة تؤجّل إلى 48 ساعة.
    await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delayHours: 48 })
      .expect(200);

    const deferred = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    // التطبيق يرى الموعد الجديد، ولا يزال مغلقاً.
    expect(deferred.body.data.ratingAvailableAt).not.toBe(originalStamp);
    expect(deferred.body.data.ratingAvailable).toBe(false);

    // والقيمة التي يراها التطبيق هي حرفياً القيمة المخزَّنة التي تقرؤها الجدولة.
    const { rows } = await db.query<{ rating_available_at: Date; delivered_at: Date }>(
      'SELECT rating_available_at, delivered_at FROM orders WHERE id = $1',
      [orderId],
    );
    expect(new Date(deferred.body.data.ratingAvailableAt as string).toISOString()).toBe(
      rows[0]!.rating_available_at.toISOString(),
    );
    // ولحظة الاستلام لم تتحرّك: التعديل يخصّ موعد التقييم لا تاريخ التسليم.
    expect(new Date(deferred.body.data.deliveredAt as string).toISOString()).toBe(
      rows[0]!.delivered_at.toISOString(),
    );
    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(0);

    // الإدارة تقدّمه إلى الآن — الطرفان يفتحان معاً.
    await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delayHours: 0 })
      .expect(200);

    const open = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(open.body.data.ratingAvailable).toBe(true);
    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(1);
  });

  it('"send now" delivers exactly one notification, however many times it is pressed', async () => {
    const { user, orderId } = await deliveredOrder();

    await api
      .post(`/api/admin/orders/${orderId}/reminder/send-now`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(await remindersFor(user.token, orderId)).toHaveLength(1);

    // ضغطات متكرّرة.
    for (let i = 0; i < 3; i++) {
      const again = await api
        .post(`/api/admin/orders/${orderId}/reminder/send-now`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('REMINDER_ALREADY_SENT');
    }
    expect(await remindersFor(user.token, orderId)).toHaveLength(1);
  });

  it('the scheduler will not re-send what "send now" already sent', async () => {
    const { user, orderId } = await deliveredOrder();

    await api
      .post(`/api/admin/orders/${orderId}/reminder/send-now`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // حتى لو صار الموعد المجدول مستحقاً بعدها. نُزحزح العمودين معاً عبر
    // المساعد لأن القيد `rating_available_at >= delivered_at` يمنع تحريك
    // النافذة وحدها إلى الماضي — وهو قيد صحيح نحترمه بدل الالتفاف عليه.
    await fastForwardRatingWindow(orderId);
    await dispatchDueRatingReminders();
    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(1);
  });

  it('reports the sent state so the dashboard can reflect it', async () => {
    const { orderId } = await deliveredOrder();

    const before = await api
      .get(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(before.body.data.ratingReminderSentAt).toBeNull();

    await api
      .post(`/api/admin/orders/${orderId}/reminder/send-now`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const after = await api
      .get(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.data.ratingReminderSentAt).not.toBeNull();
  });

  it('refuses rescheduling once the reminder has gone out', async () => {
    const { orderId } = await deliveredOrder();
    await api
      .post(`/api/admin/orders/${orderId}/reminder/send-now`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const late = await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delayHours: 6 });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('REMINDER_ALREADY_SENT');
  });

  it('refuses a reminder for an order that was never delivered', async () => {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: catalog.productIds[0]!, quantity: 1 })
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

    const attempt = await api
      .post(`/api/admin/orders/${created.body.data.id}/reminder/send-now`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(attempt.status).toBe(409);
    expect(attempt.body.error.code).toBe('ORDER_NOT_DELIVERED');
  });

  it('is closed to customers — both endpoints', async () => {
    const { user, orderId } = await deliveredOrder();

    await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ delayHours: 1 })
      .expect(403);

    await api
      .post(`/api/admin/orders/${orderId}/reminder/send-now`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);

    await api.post(`/api/admin/orders/${orderId}/reminder/send-now`).expect(401);
  });

  it('rejects a body that sets both a delay and an explicit time', async () => {
    const { orderId } = await deliveredOrder();
    const bad = await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delayHours: 6, remindAt: new Date().toISOString() });
    expect(bad.status).toBe(400);
  });
});

/**
 * تأكيد الاستلام عند فتح التطبيق + قسم أعياد الميلاد في لوحة الإدارة.
 *
 * كلاهما يقرأ حالة الخادم لا علامة محلية: طلب في `OUT_FOR_DELIVERY` هو
 * السؤال المعلّق، وعمود `birth_day` هو دليل أن الطلب لن يُعاد.
 */
describe('pending delivery confirmation + birthday registry', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    await db.query('UPDATE products SET stock = 500 WHERE id = ANY($1::uuid[])', [
      catalog.productIds,
    ]);
  });

  async function orderAt(status: string) {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: catalog.productIds[0]!, quantity: 1 })
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
    const orderId = created.body.data.id as string;
    for (const next of ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: next })
        .expect(200);
      if (next === status) break;
    }
    return { user, orderId };
  }

  const pending = (token: string) =>
    api
      .get('/api/orders/pending-confirmation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

  it('reports nothing for a customer with no order out for delivery', async () => {
    const user = await registerAndLogin();
    expect((await pending(user.token)).body.data).toBeNull();
  });

  it('reports the order once it is out for delivery', async () => {
    const { user, orderId } = await orderAt('OUT_FOR_DELIVERY');
    const body = (await pending(user.token)).body.data;
    expect(body).not.toBeNull();
    expect(body.id).toBe(orderId);
    expect(body.status).toBe('OUT_FOR_DELIVERY');
  });

  it('stops reporting it the moment the customer confirms', async () => {
    const { user, orderId } = await orderAt('OUT_FOR_DELIVERY');
    expect((await pending(user.token)).body.data.id).toBe(orderId);

    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    // «فتح التطبيق مجدداً» — لا سؤال معلّق بعد الإجابة.
    expect((await pending(user.token)).body.data).toBeNull();
  });

  it('asks about one order at a time, oldest first', async () => {
    const user = await registerAndLogin();
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ productId: catalog.productIds[0]!, quantity: 1 })
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
      const id = created.body.data.id as string;
      ids.push(id);
      for (const next of ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY']) {
        await api
          .patch(`/api/admin/orders/${id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: next })
          .expect(200);
      }
    }

    expect((await pending(user.token)).body.data.id).toBe(ids[0]);
    await api
      .post(`/api/orders/${ids[0]}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect((await pending(user.token)).body.data.id).toBe(ids[1]);
  });

  it('never leaks another customer as a pending confirmation', async () => {
    await orderAt('OUT_FOR_DELIVERY');
    const stranger = await registerAndLogin();
    expect((await pending(stranger.token)).body.data).toBeNull();
  });

  it('requires authentication', async () => {
    await api.get('/api/orders/pending-confirmation').expect(401);
  });

  // ── سجل أعياد الميلاد ──

  it('lists only customers who registered a birthday, and never asks them twice', async () => {
    const { user } = await orderAt('COMPLETED');

    // الحدّ الأقصى للصفحة ٥٠ (paginationSchema)، فنتصفّح بدل طلب صفحة ضخمة.
    const findInRegistry = async (userId: string) => {
      for (let page = 1; page <= 20; page++) {
        const res = await api
          .get(`/api/admin/customers/birthdays?page=${page}&limit=50`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        const hit = (res.body.data.items as Record<string, unknown>[]).find(
          (c) => c.id === userId,
        );
        if (hit) return hit;
        if (!res.body.data.hasMore) return null;
      }
      return null;
    };

    expect(await findInRegistry(user.userId)).toBeNull();

    // الخيار مفتوح لأنه استلم أول طلب.
    const status = await api
      .get('/api/birthday')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(status.body.data.unlocked).toBe(true);
    expect(status.body.data.hasBirthday).toBe(false);

    await api
      .post('/api/birthday')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ day: 9, month: 4 })
      .expect(200);

    const row = (await findInRegistry(user.userId))!;
    expect(row).not.toBeNull();
    expect(row.birthDay).toBe(9);
    expect(row.birthMonth).toBe(4);
    expect(row.birthdaySetAt).not.toBeNull();
    expect(row.completedOrders).toBeGreaterThanOrEqual(1);
    // ولا كلمة مرور ولا عنوان في الحمولة.
    expect(row).not.toHaveProperty('passwordHash');
    expect(row).not.toHaveProperty('password_hash');

    // والطلب لا يُعاد على العميل مهما تكرّرت الطلبات.
    expect(
      (await api.get('/api/birthday').set('Authorization', `Bearer ${user.token}`)).body
        .data.hasBirthday,
    ).toBe(true);
  });

  it('keeps the birthday registry closed to customers', async () => {
    const user = await registerAndLogin();
    await api
      .get('/api/admin/customers/birthdays')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);
    await api.get('/api/admin/customers/birthdays').expect(401);
  });
});

/**
 * مرجع نافذة التقييم.
 *
 * انحدار: كانت النافذة تُحسب عند COMPLETED، وCOMPLETED في مسار العميل هو
 * لحظة ضغطه «استلمت الطلب» — فيبدأ المؤقّت من عنده. هذه المجموعة تثبّت أن
 * المرجع صار فعل الإدارة (الإرسال للتوصيل) وأن تأكيد العميل لا يحرّكه.
 */
describe('rating window is anchored to dispatch, never to the customer tap', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    await db.query('UPDATE products SET stock = 500 WHERE id = ANY($1::uuid[])', [
      catalog.productIds,
    ]);
  });

  /** يوصل طلباً إلى OUT_FOR_DELIVERY ويعيده مع صاحبه. */
  async function dispatched() {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: catalog.productIds[0]!, quantity: 1 })
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
    const orderId = created.body.data.id as string;
    for (const s of ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY']) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: s })
        .expect(200);
    }
    return { user, orderId };
  }

  const stamps = async (orderId: string) => {
    const { rows } = await db.query<{
      dispatched_at: Date | null;
      delivered_at: Date | null;
      rating_available_at: Date | null;
    }>(
      'SELECT dispatched_at, delivered_at, rating_available_at FROM orders WHERE id = $1',
      [orderId],
    );
    return rows[0]!;
  };

  it('sets the window the moment the order goes out for delivery', async () => {
    const { orderId } = await dispatched();
    const s = await stamps(orderId);

    expect(s.dispatched_at).not.toBeNull();
    // لم يؤكّد العميل بعد — ومع ذلك الموعد محدَّد.
    expect(s.delivered_at).toBeNull();
    expect(s.rating_available_at).not.toBeNull();

    const gap =
      s.rating_available_at!.getTime() - s.dispatched_at!.getTime();
    expect(Math.round(gap / 3_600_000)).toBe(24);
  });

  it('SCENARIO A — confirming shortly after dispatch does not restart the 24h', async () => {
    const { user, orderId } = await dispatched();
    const before = await stamps(orderId);

    // «مرّ نصف ساعة» منذ الإرسال.
    await db.query(
      `UPDATE orders
          SET dispatched_at = dispatched_at - interval '30 minutes',
              rating_available_at = rating_available_at - interval '30 minutes'
        WHERE id = $1`,
      [orderId],
    );

    const confirmed = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const after = await stamps(orderId);
    // الموعد لم يتحرّك عن مرجعه؛ فقط أُزيح معه في المحاكاة.
    expect(
      Math.round(
        (after.rating_available_at!.getTime() - after.dispatched_at!.getTime()) /
          3_600_000,
      ),
    ).toBe(24);
    // والفارق عن لحظة التأكيد أقلّ من المهلة — أي أن التأكيد لم يُعِد الحساب.
    const fromConfirm =
      after.rating_available_at!.getTime() - after.delivered_at!.getTime();
    expect(fromConfirm).toBeLessThan(24 * 3_600_000);
    expect(confirmed.body.data.ratingAvailable).toBe(false);
    expect(before.rating_available_at).not.toBeNull();
  });

  it('SCENARIO B — a window that already elapsed unlocks rating on confirmation', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await dispatched();

    // أُرسل للتوصيل قبل ٢٥ ساعة، فالنافذة مضت قبل أن يؤكّد.
    await db.query(
      `UPDATE orders
          SET dispatched_at = dispatched_at - interval '25 hours',
              rating_available_at = rating_available_at - interval '25 hours'
        WHERE id = $1`,
      [orderId],
    );

    const confirmed = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(confirmed.body.data.ratingAvailable).toBe(true);

    // وقابل للتقييم فوراً، بلا انتظار.
    await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'وصل بسرعة' })
      .expect(201);
  });

  it('the confirmation stamps delivery without touching the window', async () => {
    const { user, orderId } = await dispatched();
    const before = await stamps(orderId);

    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const after = await stamps(orderId);
    expect(after.delivered_at).not.toBeNull();
    expect(after.rating_available_at).toEqual(before.rating_available_at);
    expect(after.dispatched_at).toEqual(before.dispatched_at);
  });

  it('re-applying OUT_FOR_DELIVERY does not move the window either', async () => {
    const { orderId } = await dispatched();
    const before = await stamps(orderId);

    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);

    const after = await stamps(orderId);
    expect(after.dispatched_at).toEqual(before.dispatched_at);
    expect(after.rating_available_at).toEqual(before.rating_available_at);
  });

  /**
   * المهلة القابلة للضبط (§21.6) تسري على الطلبات الجديدة وحدها.
   *
   * يربط هذا البند ٣ (توقيت الإدارة) ببند ٤ (الجدولة): تغيير الإعداد يجب
   * أن يُنتج نافذةً جديدة للطلب التالي، وألّا يمسّ نافذةً مثبَّتة سلفاً —
   * وإلّا انقلب عدّاد عميلٍ ينتظر بلا أن يفعل شيئاً.
   */
  it('المهلة المضبوطة تسري على الطلب التالي ولا تمسّ طلباً قائماً', async () => {
    // طلب أُرسل للتوصيل بالمهلة الافتراضية.
    const existing = await dispatched();
    const beforeChange = (await stamps(existing.orderId)).rating_available_at!;

    try {
      await api
        .patch('/api/admin/settings/business')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ order_rating_delay_hours: 1 })
        .expect(200);

      // الطلب القائم لم يتحرّك موعده.
      expect((await stamps(existing.orderId)).rating_available_at!.toISOString()).toBe(
        beforeChange.toISOString(),
      );

      // طلب جديد يأخذ المهلة الجديدة (ساعة واحدة من لحظة الإرسال).
      const fresh = await dispatched();
      const s = await stamps(fresh.orderId);
      const gapHours =
        (s.rating_available_at!.getTime() - s.dispatched_at!.getTime()) / 3_600_000;
      expect(Math.round(gapHours)).toBe(1);

      // والتطبيق يقرأ نفس القيمة.
      const seen = await api
        .get(`/api/orders/${fresh.orderId}`)
        .set('Authorization', `Bearer ${fresh.user.token}`)
        .expect(200);
      expect(new Date(seen.body.data.ratingAvailableAt as string).toISOString()).toBe(
        s.rating_available_at!.toISOString(),
      );
    } finally {
      // إفراغ الإعداد يعيد الافتراضي — لا نترك أثراً على بقية الاختبارات.
      await db.query(
        "DELETE FROM store_settings WHERE key = 'order_rating_delay_hours'",
      );
    }
  });

  it('SCENARIO D — scheduler and the API read the same timestamp', async () => {
    const { user, orderId } = await dispatched();
    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    // قبل حلول الموعد: لا التطبيق يفتح التقييم ولا الجدولة ترسل.
    const locked = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(locked.body.data.ratingAvailable).toBe(false);
    await dispatchDueRatingReminders();
    let notes = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(
      (notes.body.data.items as { orderId: string | null; title: string }[]).filter(
        (n) => n.orderId === orderId && n.title.includes('شلونها'),
      ),
    ).toHaveLength(0);

    // بعد حلول الموعد: كلاهما يتفق.
    await fastForwardRatingWindow(orderId);
    const open = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(open.body.data.ratingAvailable).toBe(true);
    await dispatchDueRatingReminders();
    notes = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(
      (notes.body.data.items as { orderId: string | null; title: string }[]).filter(
        (n) => n.orderId === orderId && n.title.includes('شلونها'),
      ),
    ).toHaveLength(1);
  });
});
