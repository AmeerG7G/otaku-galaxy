import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { BIRTHDAY_DISCOUNT_PERCENT, birthdayDiscountAmount } from '../src/domain/birthday.js';
import {
  DISCOUNT_STEP_IQD,
  discountCeilingIqd,
  roundDiscountIqd,
} from '../src/domain/discountRounding.js';
import { GALAXY_LEVELS, discountRewardAmount } from '../src/domain/galaxyPoints.js';
import { fitProductDiscounts, priceOrder } from '../src/domain/orderPricing.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
  storeToday,
} from './helpers.js';

/**
 * قاعدة تقريب الخصم بالدينار (2026-09-27): كل خصمٍ محسوب يُقرَّب إلى أقرب
 * مضاعفٍ لـ٢٥٠ (النصف صعوداً) وأدناه ٢٥٠ — `max(250, round(x / 250) × 250)`.
 *
 * ما تحرسه السويت:
 *   • القاعدة نفسها عند كل حدّ، وبدقّة تامة لأي مدخل عشري.
 *   • المسارَين اللذين يحسبان خصماً (الميلاد، مزيّة المستوى) عبرها وحدها.
 *   • ملخّص الدفع والإنشاء يعطيان الخصم نفسه بعينه — والمحفوظ والمعروض للزبون
 *     وللوحة والمسجَّل في استهلاك الميلاد هو نفسه.
 *   • CA-12 (لا استهلاك لإرسالٍ لم يُنشئ طلباً) وCA-14 (409 على سعرٍ تغيّر)
 *     سليمان مع التقريب.
 */

/**
 * المرجع بحساب صحيح تام (BigInt): أقرب مضاعفٍ لـ٢٥٠ من `numerator / denominator`،
 * النصف صعوداً، وأدناه ٢٥٠؛ ولا خصم لصفر. مستقلّ عن طريقة التنفيذ.
 */
function oracle(numerator: bigint, denominator = 1n): number {
  if (numerator <= 0n) return 0;
  const step = 250n * denominator;
  const steps = numerator / step;
  const remainder = numerator % step;
  const nearest = (2n * remainder >= step ? steps + 1n : steps) * 250n;
  return Number(nearest > 250n ? nearest : 250n);
}

/** أكبر عددٍ عشري أصغر من [x] (x > 0) — لاختبار الحدود بلا هامش. */
function nextBelow(x: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
}

describe('roundDiscountIqd — the one IQD discount rounding rule', () => {
  // [NOTE] 374 → 250: أقرب إلى ٢٥٠ (فرق ١٢٤) منه إلى ٥٠٠ (فرق ١٢٦)، كما تقضي
  // الصيغة `max(250, round(x / 250) × 250)` ونصّ «٥٠٠ فقط حين يكون أقرب إليها».
  it.each([
    [89, 250],
    [124, 250],
    [125, 250],
    [126, 250],
    [249, 250],
    [250, 250],
    [251, 250],
    [374, 250],
    [375, 500],
    [499, 500],
    [500, 500],
    [501, 500],
    [624, 500],
    [625, 750],
    [650, 750],
    [749, 750],
    [750, 750],
    [876, 1_000],
  ])('%d → %d', (calculated, rounded) => {
    expect(roundDiscountIqd(calculated)).toBe(rounded);
  });

  it('no discount stays no discount — the 250 minimum applies only to a discount that exists', () => {
    expect(roundDiscountIqd(0)).toBe(0);
    expect(roundDiscountIqd(-0)).toBe(0);
    expect(roundDiscountIqd(-89)).toBe(0);
    expect(roundDiscountIqd(Number.NaN)).toBe(0);
    expect(roundDiscountIqd(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundDiscountIqd(0.01)).toBe(250);
  });

  it('matches the stated formula max(250, round(x / 250) × 250) and the exact-integer oracle for every IQD amount 1…200 000', () => {
    const mismatches: number[] = [];
    for (let x = 1; x <= 200_000; x += 1) {
      const rounded = roundDiscountIqd(x);
      if (rounded !== Math.max(250, Math.round(x / 250) * 250) || rounded !== oracle(BigInt(x))) {
        mismatches.push(x);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('[CRITICAL] exact at every half-step boundary — no floating-point drift on either side', () => {
    const mismatches: number[] = [];
    for (let k = 0; k <= 400_000; k += 1) {
      const boundary = 125 + 250 * k; // 125, 375, 625, … 100 000 125
      if (roundDiscountIqd(boundary) !== 250 * (k + 1)) mismatches.push(boundary);
      if (roundDiscountIqd(nextBelow(boundary)) !== Math.max(250, 250 * k)) mismatches.push(-boundary);
    }
    expect(mismatches).toEqual([]);
    expect(roundDiscountIqd(374.99)).toBe(250);
    expect(roundDiscountIqd(374.75)).toBe(250); // لا تقريب مزدوج: ليست ٣٧٥ ← ٥٠٠
    expect(roundDiscountIqd(624.999)).toBe(500);
    expect(roundDiscountIqd(625.001)).toBe(750);
  });

  it('always returns a multiple of 250, within half a step of the calculated amount', () => {
    const mismatches: number[] = [];
    for (let x = 125; x <= 50_000; x += 0.37) {
      const rounded = roundDiscountIqd(x);
      if (rounded % DISCOUNT_STEP_IQD !== 0 || Math.abs(rounded - x) > 125) mismatches.push(x);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('discountCeilingIqd — the largest rounded discount that fits', () => {
  it('floors to a multiple of 250 and never exceeds the amount', () => {
    expect(discountCeilingIqd(0)).toBe(0);
    expect(discountCeilingIqd(-500)).toBe(0);
    expect(discountCeilingIqd(Number.NaN)).toBe(0);
    expect(discountCeilingIqd(249.99)).toBe(0);
    expect(discountCeilingIqd(250)).toBe(250);
    expect(discountCeilingIqd(nextBelow(500))).toBe(250);
    expect(discountCeilingIqd(500)).toBe(500);
    expect(discountCeilingIqd(12_345.67)).toBe(12_250);
    const mismatches: number[] = [];
    for (let k = 1; k <= 400_000; k += 1) {
      if (discountCeilingIqd(250 * k) !== 250 * k) mismatches.push(250 * k);
      if (discountCeilingIqd(nextBelow(250 * k)) !== 250 * (k - 1)) mismatches.push(-250 * k);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('birthday discount (5%) — rounded by the shared rule on the raw percentage', () => {
  it.each([
    [1_780, 250], //   89
    [2_480, 250], //  124
    [7_480, 250], //  374
    [7_495, 250], //  374.75 — كان Math.round ← 375 ← 500
    [7_500, 500], //  375
    [12_480, 500], // 624
    [12_500, 750], // 625
    [17_520, 1_000], // 876
    [100_000, 5_000],
    [0, 0],
    [-5_000, 0],
  ])('products total %d → %d', (productsTotal, discount) => {
    expect(birthdayDiscountAmount(productsTotal)).toBe(discount);
  });

  it('equals the exact-integer oracle for every IQD total 1…300 000', () => {
    const percent = BigInt(BIRTHDAY_DISCOUNT_PERCENT);
    const mismatches: number[] = [];
    for (let total = 1; total <= 300_000; total += 1) {
      if (birthdayDiscountAmount(total) !== oracle(BigInt(total) * percent, 100n)) mismatches.push(total);
    }
    expect(mismatches).toEqual([]);
  });

  it('equals the oracle at every half-step total (and ±1 IQD) up to 1 000 000 000', () => {
    // ٥٪ من المجموع تقع على نصف خطوة (125 + 250k) عند المجموع 2 500 + 5 000k.
    const percent = BigInt(BIRTHDAY_DISCOUNT_PERCENT);
    const mismatches: number[] = [];
    for (let k = 0; k <= 200_000; k += 1) {
      const boundaryTotal = ((125 + 250 * k) * 100) / BIRTHDAY_DISCOUNT_PERCENT;
      for (const total of [boundaryTotal - 1, boundaryTotal, boundaryTotal + 1]) {
        if (birthdayDiscountAmount(total) !== oracle(BigInt(total) * percent, 100n)) mismatches.push(total);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('is exact around every boundary for two-decimal totals (NUMERIC(12,2) prices)', () => {
    const percent = BigInt(BIRTHDAY_DISCOUNT_PERCENT);
    const mismatches: number[] = [];
    for (let k = 0; k <= 40; k += 1) {
      const boundaryFils = ((125 + 250 * k) * 100 * 100) / BIRTHDAY_DISCOUNT_PERCENT;
      for (let fils = boundaryFils - 500; fils <= boundaryFils + 500; fils += 1) {
        if (birthdayDiscountAmount(fils / 100) !== oracle(BigInt(fils) * percent, 10_000n)) {
          mismatches.push(fils / 100);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('loyalty-level discount — percentage, cap, then the shared rule', () => {
  const discountLevels = GALAXY_LEVELS.flatMap((level) =>
    level.reward.kind === 'discount' ? [level.reward] : [],
  );

  it('[CRITICAL] every level cap is a multiple of 250 — rounding never moves a capped discount', () => {
    expect(discountLevels.length).toBeGreaterThan(0);
    for (const reward of discountLevels) {
      expect(reward.capAmount % DISCOUNT_STEP_IQD).toBe(0);
      expect(discountRewardAmount(reward, 10_000_000)).toBe(reward.capAmount);
    }
  });

  it.each([
    [3, 5_000, 4_160, 250], //    124.8
    [3, 5_000, 12_466, 250], //   373.98
    [3, 5_000, 12_500, 500], //   375
    [3, 5_000, 20_000, 500], //   600
    [3, 5_000, 29_200, 1_000], // 876
    [5, 10_000, 100_000, 5_000],
    [10, 20_000, 199_990, 20_000], // 19 999 → 20 000 = السقف، لا يتجاوزه
    [3, 5_000, 1_000_000, 5_000], // مسقوف
    [10, 20_000, 0, 0],
  ])('%d%% capped at %d on %d → %d', (percent, capAmount, productsTotal, discount) => {
    expect(discountRewardAmount({ kind: 'discount', percent, capAmount }, productsTotal)).toBe(discount);
  });

  it('equals the exact-integer oracle (with its cap) for every IQD total 1…250 000 and every level', () => {
    const mismatches: string[] = [];
    for (const reward of discountLevels) {
      const percent = BigInt(reward.percent);
      const capTimes100 = BigInt(reward.capAmount) * 100n;
      for (let total = 1; total <= 250_000; total += 1) {
        const numerator = BigInt(total) * percent;
        const expected = numerator >= capTimes100 ? reward.capAmount : oracle(numerator, 100n);
        if (discountRewardAmount(reward, total) !== expected) mismatches.push(`${reward.percent}%/${total}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('[CRITICAL] a cap that is not a multiple of 250 (legacy claim row) is still never exceeded', () => {
    expect(discountRewardAmount({ kind: 'discount', percent: 10, capAmount: 4_900 }, 1_000_000)).toBe(4_750);
    expect(discountRewardAmount({ kind: 'discount', percent: 10, capAmount: 100 }, 1_000_000)).toBe(0);
  });
});

describe('fitProductDiscounts — both discounts fit in the products total as multiples of 250', () => {
  it('leaves discounts that fit untouched', () => {
    expect(fitProductDiscounts(100_000, { birthday: 5_000, loyalty: 3_000 })).toEqual({ birthday: 5_000, loyalty: 3_000 });
    expect(fitProductDiscounts(500, { birthday: 250, loyalty: 250 })).toEqual({ birthday: 250, loyalty: 250 });
  });

  it('a cart too small for both: the birthday (which expires today) first, the reward keeps what is left or nothing', () => {
    expect(fitProductDiscounts(250, { birthday: 250, loyalty: 250 })).toEqual({ birthday: 250, loyalty: 0 });
    expect(fitProductDiscounts(600, { birthday: 250, loyalty: 500 })).toEqual({ birthday: 250, loyalty: 250 });
    expect(fitProductDiscounts(300, { birthday: 0, loyalty: 250 })).toEqual({ birthday: 0, loyalty: 250 });
    expect(fitProductDiscounts(200, { birthday: 250, loyalty: 250 })).toEqual({ birthday: 0, loyalty: 0 });
  });

  it('never exceeds the products total nor either input, and always yields multiples of 250', () => {
    for (const total of [0, 1, 100, 249, 250, 251, 300, 499, 500, 600, 750, 999, 1_000, 12_345.67]) {
      for (const birthday of [0, 250, 500, 750]) {
        for (const loyalty of [0, 250, 500, 5_000]) {
          const fitted = fitProductDiscounts(total, { birthday, loyalty });
          expect(fitted.birthday % 250).toBe(0);
          expect(fitted.loyalty % 250).toBe(0);
          expect(fitted.birthday).toBeLessThanOrEqual(birthday);
          expect(fitted.loyalty).toBeLessThanOrEqual(loyalty);
          expect(fitted.birthday + fitted.loyalty).toBeLessThanOrEqual(total);
        }
      }
    }
  });
});

describe('priceOrder — only the discount is rounded, never prices or the total', () => {
  it('a total that is not a multiple of 250 stays exact', () => {
    const priced = priceOrder({
      productsTotal: 10_100,
      deliveryFee: 3_100,
      deliveryPromoRaw: 0,
      discount: 500,
      loyaltyDiscount: 250,
    });
    expect(priced).toMatchObject({ productsTotal: 10_100, discount: 500, loyaltyDiscount: 250, total: 12_700 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// عبر الـAPI: ملخّص الدفع = الإنشاء = المحفوظ = المعروض
// ═══════════════════════════════════════════════════════════════════

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function productAt(price: number, stock = 50) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
     VALUES ('تقريب ' || gen_random_uuid(), 'وصف', $1, $2, $3, $4) RETURNING id`,
    [price, catalog.categoryId, catalog.subcategoryId, stock],
  );
  return rows[0]!.id;
}

async function addToCart(token: string, productId: string) {
  await api.post('/api/cart').set(bearer(token)).send({ productId, quantity: 1 }).expect(200);
}

function placeOrder(token: string, extra: Record<string, unknown> = {}) {
  return api.post('/api/orders').set(bearer(token))
    .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07733333333', ...extra });
}

async function quote(token: string) {
  const res = await api.get('/api/orders/checkout-quote')
    .query({ governorateId: catalog.governorateId }).set(bearer(token));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as {
    productsTotal: number;
    birthdayDiscount: number;
    loyaltyDiscount: number;
    discount: number;
    deliveryFee: number;
    total: number;
  };
}

/**
 * زبونٌ جاهز: طلبٌ مكتمل وميلاده اليوم (أهلية الميلاد)، و/أو مزيّة «مستكشف»
 * (٣٪، سقف ٥٬٠٠٠) مطالَبٌ بها.
 */
async function discountCustomer(opts: { birthday: boolean; explorer: boolean }) {
  const user = await registerAndLogin();
  if (opts.birthday) {
    await addToCart(user.token, await productAt(20_000));
    const first = await placeOrder(user.token);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api.patch(`/api/admin/orders/${first.body.data.id}/status`).set(bearer(adminToken))
        .send({ status }).expect(200);
    }
    await api.post('/api/birthday').set(bearer(user.token)).send(await storeToday()).expect(200);
  }
  if (opts.explorer) {
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason) VALUES ($1, 'رصيد اختبار', 100, 'manual')`,
      [user.userId],
    );
    await api.post('/api/points/rewards/explorer/claim').set(bearer(user.token)).expect(200);
  }
  return user;
}

async function explorerOpen(userId: string) {
  const { rows } = await db.query(
    `SELECT 1 FROM loyalty_reward_redemptions
      WHERE user_id = $1 AND level_key = 'explorer' AND consumed_at IS NULL`,
    [userId],
  );
  return rows.length === 1;
}

async function birthdayUsage(userId: string) {
  const { rows } = await db.query<{ order_id: string; amount: string }>(
    'SELECT order_id, amount FROM birthday_discount_usage WHERE user_id = $1',
    [userId],
  );
  return rows.map((row) => ({ orderId: row.order_id, amount: Number(row.amount) }));
}

/**
 * [CRITICAL] المعاينة ثم الإنشاء: الخصم نفسه بعينه في الملخّص، واستجابة الإنشاء،
 * والصفّ المحفوظ، وصفّ استهلاك الميلاد، وطلب الزبون، وطلب اللوحة.
 */
async function quoteThenCreate(
  user: { token: string; userId: string },
  expected: { birthday: number; loyalty: number },
) {
  const shown = await quote(user.token);
  expect({ birthday: shown.birthdayDiscount, loyalty: shown.loyaltyDiscount }).toEqual(expected);
  expect(shown.discount).toBe(expected.birthday + expected.loyalty);
  expect(shown.total).toBe(shown.productsTotal + shown.deliveryFee - shown.discount);

  const created = await placeOrder(user.token);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const orderId = created.body.data.id as string;
  const sameAsShown = {
    discount: shown.discount,
    loyaltyDiscount: shown.loyaltyDiscount,
    total: shown.total,
  };
  const pick = (data: { discount: unknown; loyaltyDiscount: unknown; total: unknown }) => ({
    discount: Number(data.discount),
    loyaltyDiscount: Number(data.loyaltyDiscount),
    total: Number(data.total),
  });
  expect(pick(created.body.data)).toEqual(sameAsShown);

  const { rows: [row] } = await db.query<{ discount: string; loyalty_discount: string; total: string }>(
    'SELECT discount, loyalty_discount, total FROM orders WHERE id = $1',
    [orderId],
  );
  expect(pick({ discount: row!.discount, loyaltyDiscount: row!.loyalty_discount, total: row!.total }))
    .toEqual(sameAsShown);

  const mine = await api.get(`/api/orders/${orderId}`).set(bearer(user.token)).expect(200);
  expect(pick(mine.body.data)).toEqual(sameAsShown);
  const asAdmin = await api.get(`/api/admin/orders/${orderId}`).set(bearer(adminToken)).expect(200);
  expect(pick(asAdmin.body.data)).toEqual(sameAsShown);

  const usages = (await birthdayUsage(user.userId)).filter((usage) => usage.orderId === orderId);
  expect(usages).toEqual(expected.birthday > 0 ? [{ orderId, amount: expected.birthday }] : []);

  for (const amount of [shown.discount, shown.birthdayDiscount, shown.loyaltyDiscount]) {
    expect(amount % DISCOUNT_STEP_IQD).toBe(0);
  }
  return orderId;
}

describe('[CRITICAL] checkout quote and order creation apply the same rounded discount', () => {
  beforeAll(async () => {
    await purgeTestUsers();
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    await purgeTestUsers();
  });

  it.each([
    // السعر     الميلاد ٥٪          المستكشف ٣٪
    [7_480, 250, 250], //  374    → 250 ·  224.4  → 250
    [7_495, 250, 250], //  374.75 → 250 ·  224.85 → 250
    [7_500, 500, 250], //  375    → 500 ·  225    → 250
    [12_480, 500, 250], // 624    → 500 ·  374.4  → 250
    [12_500, 750, 500], // 625    → 750 ·  375    → 500
    [17_520, 1_000, 500], // 876  → 1000 · 525.6  → 500
  ])('birthday + explorer on %d → birthday %d, reward %d', async (price, birthday, loyalty) => {
    const user = await discountCustomer({ birthday: true, explorer: true });
    await addToCart(user.token, await productAt(price));
    const orderId = await quoteThenCreate(user, { birthday, loyalty });
    expect(await explorerOpen(user.userId)).toBe(false);
    const { rows } = await db.query(
      'SELECT 1 FROM loyalty_reward_redemptions WHERE user_id = $1 AND consumed_order_id = $2',
      [user.userId, orderId],
    );
    expect(rows).toHaveLength(1);
  });

  it('birthday only: 89 IQD (5% of 1 780) → 250', async () => {
    const user = await discountCustomer({ birthday: true, explorer: false });
    await addToCart(user.token, await productAt(1_780));
    await quoteThenCreate(user, { birthday: 250, loyalty: 0 });
  });

  it('reward only: 876 IQD (3% of 29 200) → 1 000', async () => {
    const user = await discountCustomer({ birthday: false, explorer: true });
    await addToCart(user.token, await productAt(29_200));
    await quoteThenCreate(user, { birthday: 0, loyalty: 1_000 });
    expect(await explorerOpen(user.userId)).toBe(false);
  });

  it('[CRITICAL] a 250 IQD cart fits one 250 discount: the birthday applies, the reward is not burned', async () => {
    const user = await discountCustomer({ birthday: true, explorer: true });
    await addToCart(user.token, await productAt(250));
    await quoteThenCreate(user, { birthday: 250, loyalty: 0 });
    expect(await explorerOpen(user.userId)).toBe(true);
  });

  it('[CRITICAL] a cart under 250 IQD fits no discount: nothing is applied and nothing is consumed', async () => {
    const user = await discountCustomer({ birthday: true, explorer: true });
    await addToCart(user.token, await productAt(200));
    await quoteThenCreate(user, { birthday: 0, loyalty: 0 });
    expect(await explorerOpen(user.userId)).toBe(true);
    expect((await birthdayUsage(user.userId))).toEqual([]);
  });

  it('[CA-12] a submit that creates no order consumes neither rounded discount; the retry applies exactly the quoted amounts', async () => {
    const user = await discountCustomer({ birthday: true, explorer: true });
    const productId = await productAt(12_500);
    await addToCart(user.token, productId);
    const before = await quote(user.token);

    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);
    const refused = await placeOrder(user.token);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await explorerOpen(user.userId)).toBe(true);
    expect(await birthdayUsage(user.userId)).toEqual([]);

    await db.query('UPDATE products SET stock = 50 WHERE id = $1', [productId]);
    expect(await quote(user.token)).toEqual(before);
    await quoteThenCreate(user, { birthday: 750, loyalty: 500 });
  });

  it('[CA-14] a changed price is refused with 409 before any discount is reserved; the retry is rounded on the new price', async () => {
    const user = await discountCustomer({ birthday: true, explorer: true });
    const productId = await productAt(7_480);
    await addToCart(user.token, productId);
    expect((await quote(user.token)).discount).toBe(500); // 250 + 250

    await api.patch(`/api/admin/products/${productId}`).set(bearer(adminToken)).send({ price: 12_500 }).expect(200);
    const refused = await placeOrder(user.token, { expectedPrices: [{ productId, unitPrice: 7_480 }] });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PRODUCT_PRICE_CHANGED');
    expect(await explorerOpen(user.userId)).toBe(true);
    expect(await birthdayUsage(user.userId)).toEqual([]);

    const shown = await quote(user.token);
    expect({ birthday: shown.birthdayDiscount, loyalty: shown.loyaltyDiscount }).toEqual({ birthday: 750, loyalty: 500 });
    const created = await placeOrder(user.token, { expectedPrices: [{ productId, unitPrice: 12_500 }] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(Number(created.body.data.discount)).toBe(shown.discount);
    expect(Number(created.body.data.loyaltyDiscount)).toBe(shown.loyaltyDiscount);
    expect(Number(created.body.data.total)).toBe(shown.total);
  });
});
