import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
  storeToday,
} from './helpers.js';

/**
 * مزيّة مستوى واحدة لكل طلب، ولا خصمَ مستوى مع خصم الميلاد (STEP 77).
 *
 * قبلها كان الإنشاء يطبّق في الطلب نفسه خصم الميلاد وأقدم خصم مستوى وأقدم
 * هدية مستوى معاً. القاعدة الآن (`loyaltyRewardsService.levelRewardForOrder`):
 *   • أقدم مزيّة مطالَب بها وحدها — خصماً أو هدية؛ الباقية تبقى مفتوحة.
 *   • يوم الميلاد: خصم الميلاد يُطبَّق، وخصم المستوى يُتخطّى بلا استهلاك؛
 *     الهدية ليست خصماً فتجتمع مع الميلاد.
 *   • المعاينة والإنشاء يختاران الشيء نفسه، والمعاينة لا تستهلك شيئاً.
 */

let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  await purgeTestUsers();
  catalog = await seedTestCatalog();
});

afterAll(async () => {
  await purgeTestUsers();
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** زبونٌ برصيدٍ يفتح المستويات المطلوبة، وقد طالب بها بالترتيب المعطى. */
async function customerClaiming(levelKeys: string[], points = 1_000) {
  const user = await registerAndLogin();
  await db.query(
    `INSERT INTO points_ledger (user_id, label, amount, reason)
     VALUES ($1, 'رصيد اختبار', $2, 'manual')`,
    [user.userId, points],
  );
  for (const key of levelKeys) {
    await api.post(`/api/points/rewards/${key}/claim`).set(bearer(user.token)).expect(200);
  }
  return user;
}

async function makeBirthdayToday(userId: string) {
  const today = await storeToday();
  await db.query('UPDATE users SET birth_day = $2, birth_month = $3 WHERE id = $1', [
    userId,
    today.day,
    today.month,
  ]);
}

async function productAt(price: number, stock = 500) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
     VALUES ($1, 'وصف', $2, $3, $4, $5) RETURNING id`,
    [
      `مزيّة-واحدة-${Math.random().toString(36).slice(2, 8)}`,
      price,
      catalog.categoryId,
      catalog.subcategoryId,
      stock,
    ],
  );
  return rows[0]!.id;
}

async function fillCart(token: string, price = 100_000) {
  const productId = await productAt(price);
  await api.post('/api/cart').set(bearer(token)).send({ productId, quantity: 1 }).expect(200);
}

async function quote(token: string) {
  const res = await api
    .get('/api/orders/checkout-quote')
    .query({ governorateId: catalog.governorateId })
    .set(bearer(token));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as {
    birthdayDiscount: number;
    loyaltyDiscount: number;
    loyaltyReward: { levelKey: string } | null;
    loyaltyGiftActivated: boolean;
    discount: number;
    total: number;
    fingerprint: string | null;
  };
}

function submit(token: string, extra: Record<string, unknown> = {}, idempotencyKey?: string) {
  const req = api.post('/api/orders').set(bearer(token));
  if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
  return req
    .send({
      governorateId: catalog.governorateId,
      fullAddress: 'بغداد، الكرادة',
      phone: '07733333333',
      ...extra,
    });
}

async function rewardRows(userId: string) {
  const { rows } = await db.query<{
    level_key: string;
    consumed_order_id: string | null;
    gift_order_id: string | null;
  }>(
    `SELECT r.level_key, r.consumed_order_id,
            (SELECT o.id FROM orders o WHERE o.loyalty_gift_redemption_id = r.id) AS gift_order_id
       FROM loyalty_reward_redemptions r
      WHERE r.user_id = $1`,
    [userId],
  );
  return Object.fromEntries(rows.map((row) => [row.level_key, row]));
}

async function birthdayUsages(userId: string) {
  const { rows } = await db.query<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM birthday_discount_usage WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0]!.n);
}

async function rewardsView(token: string) {
  const res = await api.get('/api/points').set(bearer(token));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.rewards as Array<{
    levelKey: string;
    status: string;
    inOrder: boolean;
    claimed: boolean;
    consumed: boolean;
  }>;
}

describe('مزيّة مستوى واحدة لكل طلب', () => {
  it('[CRITICAL] خصمٌ وهدية مطالَب بهما ⇒ الطلب الأول يأخذ الأقدم وحده، والثاني الأخرى', async () => {
    // explorer = خصم ٣٪، voyager = هدية — طالب بالخصم أولاً.
    const user = await customerClaiming(['explorer', 'voyager']);
    await fillCart(user.token);

    const preview = await quote(user.token);
    expect(preview.loyaltyReward?.levelKey).toBe('explorer');
    expect(preview.loyaltyDiscount).toBeGreaterThan(0);
    expect(preview.loyaltyGiftActivated).toBe(false);

    const first = await submit(user.token, { expectedQuote: preview.fingerprint });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data.loyaltyDiscount).toBe(preview.loyaltyDiscount);
    expect(first.body.data.loyaltyGiftActivated).toBe(false);

    let rows = await rewardRows(user.userId);
    expect(rows.explorer!.consumed_order_id).toBe(first.body.data.id);
    expect(rows.voyager!.gift_order_id).toBeNull();

    await fillCart(user.token);
    const second = await submit(user.token);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(Number(second.body.data.loyaltyDiscount ?? 0)).toBe(0);
    expect(second.body.data.loyaltyGiftActivated).toBe(true);

    rows = await rewardRows(user.userId);
    expect(rows.voyager!.gift_order_id).toBe(second.body.data.id);

    // ثالث: لا مزيّة باقية — ولا يُعاد تفعيل شيءٍ استُعمل.
    await fillCart(user.token);
    const third = await submit(user.token);
    expect(third.status).toBe(201);
    expect(Number(third.body.data.loyaltyDiscount ?? 0)).toBe(0);
    expect(third.body.data.loyaltyGiftActivated).toBe(false);
  });

  it('هدية مطالَب بها أولاً ⇒ الهدية وحدها، والخصم يبقى مفتوحاً للطلب التالي', async () => {
    const user = await customerClaiming(['voyager', 'warrior']);
    await fillCart(user.token);
    const preview = await quote(user.token);
    expect(preview.loyaltyGiftActivated).toBe(true);
    expect(preview.loyaltyDiscount).toBe(0);

    const first = await submit(user.token, { expectedQuote: preview.fingerprint });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data.loyaltyGiftActivated).toBe(true);
    expect(Number(first.body.data.loyaltyDiscount ?? 0)).toBe(0);
    expect((await rewardRows(user.userId)).warrior!.consumed_order_id).toBeNull();

    await fillCart(user.token);
    const next = await quote(user.token);
    expect(next.loyaltyReward?.levelKey).toBe('warrior');
    expect(next.loyaltyGiftActivated).toBe(false);
  });

  it('المعاينة المتكرّرة لا تستهلك ولا تحجز شيئاً', async () => {
    const user = await customerClaiming(['explorer', 'voyager']);
    await fillCart(user.token);
    const a = await quote(user.token);
    const b = await quote(user.token);
    expect(b).toEqual(a);
    const rows = await rewardRows(user.userId);
    expect(rows.explorer!.consumed_order_id).toBeNull();
    expect(rows.voyager!.gift_order_id).toBeNull();
  });
});

describe('خصم المستوى لا يجتمع مع خصم الميلاد', () => {
  it('[CRITICAL] يوم الميلاد ⇒ خصم الميلاد وحده، وخصم المستوى يبقى مفتوحاً غير مستهلك', async () => {
    const user = await customerClaiming(['star']);
    await makeBirthdayToday(user.userId);
    await fillCart(user.token);

    const preview = await quote(user.token);
    expect(preview.birthdayDiscount).toBe(5_000);
    expect(preview.loyaltyDiscount).toBe(0);
    expect(preview.loyaltyReward).toBeNull();
    expect(preview.discount).toBe(5_000);

    const order = await submit(user.token, { expectedQuote: preview.fingerprint });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    expect(Number(order.body.data.discount)).toBe(5_000);
    expect(Number(order.body.data.loyaltyDiscount ?? 0)).toBe(0);
    expect(await birthdayUsages(user.userId)).toBe(1);
    expect((await rewardRows(user.userId)).star!.consumed_order_id).toBeNull();

    // الطلب التالي (الميلاد استُعمل هذه السنة) يأخذ خصم المستوى.
    await fillCart(user.token);
    const next = await quote(user.token);
    expect(next.birthdayDiscount).toBe(0);
    expect(next.loyaltyReward?.levelKey).toBe('star');
    expect(next.loyaltyDiscount).toBe(10_000);
  });

  it('يوم الميلاد مع هدية مستوى ⇒ يجتمعان (الهدية ليست خصماً)', async () => {
    const user = await customerClaiming(['voyager']);
    await makeBirthdayToday(user.userId);
    await fillCart(user.token);
    const preview = await quote(user.token);
    expect(preview.birthdayDiscount).toBe(5_000);
    expect(preview.loyaltyGiftActivated).toBe(true);

    const order = await submit(user.token, { expectedQuote: preview.fingerprint });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    expect(order.body.data.loyaltyGiftActivated).toBe(true);
    expect(Number(order.body.data.discount)).toBe(5_000);
  });

  it('يوم الميلاد، خصمٌ أقدم ثم هدية ⇒ الميلاد + الهدية، والخصم محفوظ', async () => {
    const user = await customerClaiming(['explorer', 'voyager']);
    await makeBirthdayToday(user.userId);
    await fillCart(user.token);
    const order = await submit(user.token);
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    expect(Number(order.body.data.discount)).toBe(5_000);
    expect(Number(order.body.data.loyaltyDiscount ?? 0)).toBe(0);
    expect(order.body.data.loyaltyGiftActivated).toBe(true);
    expect((await rewardRows(user.userId)).explorer!.consumed_order_id).toBeNull();
  });
});

describe('الاستعمال مرة واحدة تحت التزامن والإعادة', () => {
  it('[CRITICAL] طلبان متزامنان ⇒ المزيّة تُستعمل في طلبٍ واحد فقط', async () => {
    const user = await customerClaiming(['voyager']);
    await fillCart(user.token);
    const [a, b] = await Promise.all([submit(user.token), submit(user.token)]);
    const created = [a, b].filter((res) => res.status === 201);
    const withGift = created.filter((res) => res.body.data.loyaltyGiftActivated === true);
    expect(withGift).toHaveLength(1);
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM orders o
         JOIN loyalty_reward_redemptions r ON r.id = o.loyalty_gift_redemption_id
        WHERE r.user_id = $1`,
      [user.userId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('إعادة الإرسال بالمفتاح نفسه لا تستهلك الخصم مرتين', async () => {
    const user = await customerClaiming(['explorer']);
    await fillCart(user.token);
    const key = randomUUID();
    const first = await submit(user.token, {}, key);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const replay = await submit(user.token, {}, key);
    expect([200, 201]).toContain(replay.status);
    expect(replay.body.data.id).toBe(first.body.data.id);
    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM loyalty_reward_redemptions
        WHERE user_id = $1 AND consumed_at IS NOT NULL`,
      [user.userId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('[CRITICAL] هدية سلّمها المسؤول بلا ربط بطلب (قبل 081) لا تُربط بطلبٍ جديد', async () => {
    const user = await customerClaiming(['voyager']);
    await db.query(
      `UPDATE loyalty_reward_redemptions SET fulfilled_at = now(), fulfilled_by = user_id
        WHERE user_id = $1 AND level_key = 'voyager'`,
      [user.userId],
    );
    await fillCart(user.token);
    expect((await quote(user.token)).loyaltyGiftActivated).toBe(false);
    const order = await submit(user.token);
    expect(order.status).toBe(201);
    expect(order.body.data.loyaltyGiftActivated).toBe(false);
  });

  it('القاعدة نفسها ترفض طلباً بخصم مستوى وهدية معاً (089)', async () => {
    const user = await customerClaiming(['voyager']);
    await fillCart(user.token);
    const order = await submit(user.token);
    expect(order.status).toBe(201);
    await expect(
      db.query('UPDATE orders SET discount = 500, loyalty_discount = 500 WHERE id = $1', [
        order.body.data.id,
      ]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'orders_one_level_reward' });
  });
});

describe('طلبات قبل القاعدة (089)', () => {
  /**
   * [CRITICAL REGRESSION — مراجعة STEP 77] طلبٌ قديم أُنشئ بخصم مستوى وهدية
   * معاً يجب أن يبقى قابلاً لتغيير حالته. CHECK (ولو NOT VALID) كان يُفحص
   * على كل UPDATE فيعلق الطلب؛ الزناد يُطلق عند كتابة عمودَي المزيّة وحدهما.
   */
  it('طلبٌ قديم بالمزيّتين معاً يقبل تغيير الحالة، ولا يقبل كتابة مزيّة جديدة', async () => {
    const user = await customerClaiming(['voyager']);
    await fillCart(user.token);
    const order = await submit(user.token);
    expect(order.status).toBe(201);
    const id = order.body.data.id as string;

    // نُعيد بناء صفٍّ «قبل القاعدة» بتعطيل الحارس لحظة الكتابة وحدها.
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE orders DISABLE TRIGGER trg_orders_one_level_reward');
      await client.query('UPDATE orders SET discount = 500, loyalty_discount = 500 WHERE id = $1', [id]);
      await client.query('ALTER TABLE orders ENABLE TRIGGER trg_orders_one_level_reward');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await expect(
      db.query(`UPDATE orders SET status = 'OUT_FOR_DELIVERY' WHERE id = $1`, [id]),
    ).resolves.toBeTruthy();
    await expect(
      db.query('UPDATE orders SET loyalty_discount = 250 WHERE id = $1', [id]),
    ).rejects.toThrow(/level discount and a level gift/);
  });
});

describe('حالة المزيّة كما يراها الزبون', () => {
  it('مطالَب بها ← في طلب (هدية) ← مكتملة بعد التسليم؛ والخصم المستهلك مكتمل', async () => {
    const user = await customerClaiming(['explorer', 'voyager']);
    let view = await rewardsView(user.token);
    const byKey = (key: string) => view.find((r) => r.levelKey === key)!;
    expect(byKey('explorer').status).toBe('claimed');
    expect(byKey('voyager').status).toBe('claimed');
    expect(byKey('warrior').status).toBe('available');

    await fillCart(user.token);
    await submit(user.token).expect(201);
    await fillCart(user.token);
    await submit(user.token).expect(201);

    view = await rewardsView(user.token);
    expect(byKey('explorer').status).toBe('completed');
    expect(byKey('explorer').inOrder).toBe(true);
    expect(byKey('voyager').status).toBe('inOrder');
    expect(byKey('voyager').consumed).toBe(false);

    await db.query(
      `UPDATE loyalty_reward_redemptions SET fulfilled_at = now(), fulfilled_by = user_id
        WHERE user_id = $1 AND level_key = 'voyager'`,
      [user.userId],
    );
    view = await rewardsView(user.token);
    expect(byKey('voyager').status).toBe('completed');
  });

  it('مستوى لم يبلغه الرصيد ⇒ locked', async () => {
    const user = await customerClaiming([], 100);
    const view = await rewardsView(user.token);
    expect(view.find((r) => r.levelKey === 'explorer')!.status).toBe('available');
    expect(view.find((r) => r.levelKey === 'legend')!.status).toBe('locked');
  });
});
