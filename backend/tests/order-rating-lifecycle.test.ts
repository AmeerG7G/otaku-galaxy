import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { dispatchDueRatingReminders } from '../src/jobs/ratingReminderJob.js';
import {
  api,
  createAdminUser,
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
/**
 * يُزحزح موعد **تذكير** التقييم إلى الماضي فيصير مستحقاً الآن.
 *
 * حلّ محل `fastForwardRatingWindow` المشتركة: تلك كانت تفتح التقييم، وقد صار
 * يُفتح بتأكيد الاستلام بلا انتظار. ما بقي يحتاج زحزحة هو جدولة الإشعار.
 */
async function fastForwardReminder(orderId: string, hours = 25) {
  const { rowCount } = await db.query(
    `UPDATE orders
        SET dispatched_at = dispatched_at - make_interval(hours => $2),
            delivered_at = delivered_at - make_interval(hours => $2),
            rating_reminder_at = rating_reminder_at - make_interval(hours => $2)
      WHERE id = $1 AND dispatched_at IS NOT NULL`,
    [orderId, hours],
  );
  if ((rowCount ?? 0) === 0) {
    throw new Error(`fastForwardReminder: الطلب ${orderId} لم يخرج للتوصيل بعد`);
  }
}

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
    // البرنامج الزمني الجديد: الموافقة تُنقِل الطلب مباشرةً إلى «قيد التوصيل»،
    // فلا مرحلة «تجهيز» بينهما. PREPARING حالة وقديمة يحتفظ بها الأرشيف فقط.
    const path = ['OUT_FOR_DELIVERY', 'COMPLETED'];
    for (const status of path) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
      if (status === target) return;
    }
  }

  // ── أهلية التقييم: الاستلام يفتحها، بلا مهلة ──

  it('a fresh order is not reviewable and carries no delivery stamp', async () => {
    const { order } = await placeOrder(catalog.productIds[0]!);

    expect(order.status).toBe('PENDING_ADMIN_CONFIRMATION');
    expect(order.deliveredAt).toBeNull();
    expect(order.canReview).toBe(false);
  });

  /**
   * [CRITICAL] الاستلام يفتح التقييم في اللحظة نفسها.
   *
   * كان هذا الاختبار يثبّت العكس: «نافذة في المستقبل لا لحظةَ التسليم»،
   * بمهلة ١٦ ساعة يضبطها المسؤول من اللوحة. صار الزبون الذي أكّد استلامه
   * يقيّم فوراً — سؤالُه عن رأيه بعد أن ينسى الطلب لا يخدم أحداً.
   */
  it('receipt opens the review immediately — no waiting window', async () => {
    const { user, orderId } = await placeOrder(catalog.productIds[0]!);
    await advanceTo(orderId, 'COMPLETED');

    const detail = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(detail.body.data.status).toBe('COMPLETED');
    expect(detail.body.data.deliveredAt).not.toBeNull();
    expect(detail.body.data.canReview).toBe(true);

    // ولم يعد يُرسل موعد فتحٍ أصلاً — لم يبقَ للمفهوم وجود في العقد.
    expect(detail.body.data.ratingAvailableAt).toBeUndefined();
    expect(detail.body.data.ratingAvailable).toBeUndefined();
  });

  it('refuses a review for an order whose receipt was not confirmed', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await placeOrder(productId);
    await advanceTo(orderId, 'OUT_FOR_DELIVERY');

    const tooEarly = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'ممتاز' });

    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.error.code).toBe('ORDER_NOT_COMPLETED');

    // ولا يُنشأ أي تقييم في القاعدة.
    const { rows } = await db.query('SELECT 1 FROM reviews WHERE order_id = $1', [orderId]);
    expect(rows).toHaveLength(0);
  });

  it('accepts the review right after the customer confirms receipt', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await placeOrder(productId);
    await advanceTo(orderId, 'OUT_FOR_DELIVERY');

    const confirmed = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    // الردّ نفسه يحمل الأهلية — التطبيق لا يحتاج نداءً ثانياً ليعرف.
    expect(confirmed.body.data.canReview).toBe(true);

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
    expect(detail.body.data.canReview).toBe(false);

    const attempt = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'محاولة' });
    expect(attempt.status).toBe(400);
    expect(attempt.body.error.code).toBe('ORDER_NOT_COMPLETED');
  });

  it('does not move the delivery stamp or reminder when COMPLETED is re-applied', async () => {
    const { orderId } = await placeOrder(catalog.productIds[0]!);
    await advanceTo(orderId, 'COMPLETED');

    const first = await db.query<{ delivered_at: Date; rating_reminder_at: Date }>(
      'SELECT delivered_at, rating_reminder_at FROM orders WHERE id = $1',
      [orderId],
    );

    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    const second = await db.query<{ delivered_at: Date; rating_reminder_at: Date }>(
      'SELECT delivered_at, rating_reminder_at FROM orders WHERE id = $1',
      [orderId],
    );
    expect(second.rows[0]!.delivered_at).toEqual(first.rows[0]!.delivered_at);
    expect(second.rows[0]!.rating_reminder_at).toEqual(first.rows[0]!.rating_reminder_at);
  });

  // ── جدولة تذكير التقييم ──

  it('sends a rating reminder only when it is due, and only once', async () => {
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

    // لم يحن موعد التذكير بعد: لا إشعار — والتقييم مفتوح أصلاً منذ الاستلام.
    await dispatchDueRatingReminders();
    expect(await unreadBefore()).toHaveLength(0);

    // حان موعد التذكير.
    await fastForwardReminder(orderId);
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
    await fastForwardReminder(orderId);

    const forged = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        orderId,
        productId,
        rating: 5,
        comment: 'صورة من خارج المتجر',
        photoUrls: ['https://attacker.example/tracking-pixel.png'],
      });

    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('INVALID_PHOTO_URL');
  });

  it('accepts a review photo that really was uploaded', async () => {
    const productId = catalog.productIds[1]!;
    const { user, orderId } = await placeOrder(productId);
    await advanceTo(orderId, 'COMPLETED');
    await fastForwardReminder(orderId);

    const photoUrl = await registerUploadedPhoto(user.userId);
    const created = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 4, comment: 'حلو', photoUrls: [photoUrl] })
      .expect(201);

    expect(created.body.data.photoUrls).toEqual([photoUrl]);
    // الحقل المشتقّ للعرض يتبع أول صورة.
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
      await advanceTo(orderId, 'OUT_FOR_DELIVERY');

      const pending = await api
        .get('/api/admin/orders?status=PENDING_ADMIN_CONFIRMATION&limit=50')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (pending.body.data.items as { id: string }[]).some((o) => o.id === orderId),
      ).toBe(false);

      const outForDelivery = await api
        .get('/api/admin/orders?status=OUT_FOR_DELIVERY&limit=50')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (outForDelivery.body.data.items as { id: string }[]).some((o) => o.id === orderId),
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
    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
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

  it('defaults to 16 hours after delivery', async () => {
    const { orderId } = await deliveredOrder();
    const { rows } = await db.query<{ delivered_at: Date; rating_reminder_at: Date }>(
      'SELECT delivered_at, rating_reminder_at FROM orders WHERE id = $1',
      [orderId],
    );
    const gap =
      rows[0]!.rating_reminder_at.getTime() - rows[0]!.delivered_at.getTime();
    expect(Math.round(gap / 3_600_000)).toBe(16);
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
   * [CRITICAL] جدولة التذكير لا تمسّ أهلية التقييم.
   *
   * كان هذا الاختبار (SCENARIO D) يثبّت أن التطبيق والجدولة يقرآن نفس
   * الطابع، فيفتح التقييمَ ما يفتح التذكير. صار الاثنان منفصلين: التقييم
   * يُفتح بالاستلام، والتذكير موعد إشعار لا غير. فالمطلوب إثباته الآن هو
   * **الاستقلال**: تأجيل التذكير ٤٨ ساعة يجب ألّا يُغلق تقييماً مفتوحاً.
   */
  it('rescheduling the reminder never changes review eligibility', async () => {
    const { user, orderId } = await deliveredOrder();

    const before = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    // الطلب مستلَم، فالتقييم مفتوح من الآن.
    expect(before.body.data.canReview).toBe(true);

    // الإدارة تؤجّل التذكير إلى ٤٨ ساعة.
    await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delayHours: 48 })
      .expect(200);

    const deferred = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    // التقييم ما زال مفتوحاً — التأجيل يخصّ الإشعار وحده.
    expect(deferred.body.data.canReview).toBe(true);
    // ولحظة الاستلام لم تتحرّك.
    expect(deferred.body.data.deliveredAt).toBe(before.body.data.deliveredAt);

    // والجدولة تتبع الموعد الجديد: لا تذكير الآن.
    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(0);

    // الإدارة تقدّمه إلى الآن — يصل التذكير، والتقييم كما هو مفتوح.
    await api
      .patch(`/api/admin/orders/${orderId}/reminder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delayHours: 0 })
      .expect(200);

    await dispatchDueRatingReminders();
    expect(await remindersFor(user.token, orderId)).toHaveLength(1);

    const after = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(after.body.data.canReview).toBe(true);
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

    // حتى لو صار الموعد المجدول مستحقاً بعدها. نُزحزح الأعمدة معاً عبر
    // المساعد لأن القيد `rating_reminder_at >= dispatched_at` يمنع تحريك
    // الموعد وحده إلى الماضي — وهو قيد صحيح نحترمه بدل الالتفاف عليه.
    await fastForwardReminder(orderId);
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
    for (const next of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
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
      for (const next of ['OUT_FOR_DELIVERY']) {
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
/**
 * التقييم يُفتح بتأكيد الاستلام — وموعد التذكير يبقى مربوطاً بالإرسال.
 *
 * كان هذا الوصف: «نافذة التقييم مربوطة بالإرسال لا بضغطة العميل»، وهي
 * قاعدة صحيحة لمشكلةٍ أُلغيت: لم تعد هناك نافذة تُنتظر. ما بقي مربوطاً
 * بالإرسال هو **موعد التذكير**، وما صار مربوطاً بضغطة العميل هو **فتح
 * التقييم** — وهو المقصود من التغيير كلّه.
 */
describe('review opens on receipt; the reminder stays anchored to dispatch', () => {
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
    for (const s of ['OUT_FOR_DELIVERY']) {
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
      rating_reminder_at: Date | null;
    }>(
      'SELECT dispatched_at, delivered_at, rating_reminder_at FROM orders WHERE id = $1',
      [orderId],
    );
    return rows[0]!;
  };

  it('schedules the reminder the moment the order goes out for delivery', async () => {
    const { orderId } = await dispatched();
    const s = await stamps(orderId);

    expect(s.dispatched_at).not.toBeNull();
    // لم يؤكّد العميل بعد — ومع ذلك موعد التذكير محدَّد.
    expect(s.delivered_at).toBeNull();
    expect(s.rating_reminder_at).not.toBeNull();

    const gap = s.rating_reminder_at!.getTime() - s.dispatched_at!.getTime();
    expect(Math.round(gap / 3_600_000)).toBe(16);
  });

  /**
   * [CRITICAL] المتطلَّب الأساسي لهذه الخطوة.
   *
   * الطلب خرج للتوصيل قبل دقائق، فموعد التذكير ما يزال بعيداً (١٦ ساعة).
   * ومع ذلك يفتح تأكيدُ الاستلام التقييمَ في اللحظة نفسها: لا انتظار،
   * ولا مهلة، ولا علاقة بموعد التذكير.
   */
  it('[CRITICAL] confirming receipt opens the review at once, reminder notwithstanding', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await dispatched();

    const beforeConfirm = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(beforeConfirm.body.data.canReview).toBe(false);

    const confirmed = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(confirmed.body.data.canReview).toBe(true);

    // موعد التذكير ما يزال في المستقبل — وهذا لا يمنع التقييم.
    const s = await stamps(orderId);
    expect(s.rating_reminder_at!.getTime()).toBeGreaterThan(Date.now());

    await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'وصل بسرعة' })
      .expect(201);
  });

  it('the confirmation stamps delivery without touching the reminder', async () => {
    const { user, orderId } = await dispatched();
    const before = await stamps(orderId);

    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const after = await stamps(orderId);
    expect(after.delivered_at).not.toBeNull();
    expect(after.rating_reminder_at).toEqual(before.rating_reminder_at);
    expect(after.dispatched_at).toEqual(before.dispatched_at);
  });

  it('re-applying OUT_FOR_DELIVERY does not move the reminder', async () => {
    const { orderId } = await dispatched();
    const before = await stamps(orderId);

    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);

    const after = await stamps(orderId);
    expect(after.dispatched_at).toEqual(before.dispatched_at);
    expect(after.rating_reminder_at).toEqual(before.rating_reminder_at);
  });

  /**
   * تأكيد الاستلام المتكرّر آمن: الحالة لا تتحرّك ولا الطوابع.
   *
   * الثانية تُرفض بـ409 `ALREADY_CONFIRMED` — وهي الصيغة التي اعتمدها
   * المشروع أصلاً في `confirm-receipt`؛ لا نغيّرها هنا.
   */
  it('repeated receipt confirmation is safe and leaves eligibility open', async () => {
    const { user, orderId } = await dispatched();

    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const first = await stamps(orderId);

    const again = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CONFIRMED');

    const after = await stamps(orderId);
    expect(after.delivered_at).toEqual(first.delivered_at);

    const detail = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(detail.body.data.canReview).toBe(true);
  });

  /** [CRITICAL] لا أحد يؤكّد استلام طلب غيره، ولا يفتح تقييمه. */
  it('[CRITICAL] a stranger cannot confirm receipt to unlock someone else review', async () => {
    const { orderId } = await dispatched();
    const stranger = await registerAndLogin();

    const attempt = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(attempt.status).toBe(404);

    const s = await stamps(orderId);
    expect(s.delivered_at).toBeNull();
  });
});
