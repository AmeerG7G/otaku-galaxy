import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { CLAIMABLE_LEVELS, discountRewardAmount } from '../src/domain/galaxyPoints.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * مزايا مستويات نقاط المجرّة: المطالبة، الاستهلاك، التسليم.
 *
 * الضمانة الأولى: كل مزيّة مرة واحدة لكل زبون إلى الأبد، مهما تكرّر الطلب أو
 * تزامن. الحارس قيدٌ في القاعدة لا شرطٌ في الخدمة.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  // طابور الهدايا مرقَّم (٢٠ صفّاً للصفحة) ومرتَّب بالأقدم أولاً — وهو
  // الترتيب الصحيح لطابور عمل. قاعدة الاختبارات لا تُعاد تهيئتها بين
  // التشغيلات، فمطالبات التشغيلات السابقة كانت تدفع مطالبة هذه السويت خارج
  // الصفحة الأولى فتفشل بلا عطل حقيقي. التنظيف هنا نفس ما تفعله سويت لوحة
  // التحكم، ومستخدم المسؤول (‎+96478…) خارج النمط فلا يُمسّ.
  await purgeTestUsers();
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

/** زبون برصيد محدَّد — حركة دفتر واحدة كما يكتبها الخادم. */
async function customerWith(points: number) {
  const user = await registerAndLogin();
  if (points > 0) {
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason)
       VALUES ($1, 'رصيد اختبار', $2, 'manual')`,
      [user.userId, points],
    );
  }
  return user;
}

async function rewardsOf(token: string) {
  const res = await api.get('/api/points').set('Authorization', `Bearer ${token}`).expect(200);
  return Object.fromEntries(
    (res.body.data.rewards as { levelKey: string }[]).map((r) => [r.levelKey, r]),
  ) as Record<string, Record<string, unknown>>;
}

function claim(token: string, levelKey: string) {
  return api
    .post(`/api/points/rewards/${levelKey}/claim`)
    .set('Authorization', `Bearer ${token}`);
}

async function productAt(price: number) {
  const name = `منتج مزايا ${price}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
     VALUES ($1, 'وصف', $2, $3, $4, 500) RETURNING id`,
    [name, price, catalog.categoryId, catalog.subcategoryId],
  );
  return rows[0]!.id;
}

async function placeOrder(token: string, productId: string, quantity = 1) {
  await api
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity })
    .expect(200);
  return api
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      governorateId: catalog.governorateId,
      fullAddress: 'بغداد، الكرادة',
      phone: '07733333333',
    });
}

// ═══════════════ الأهلية ═══════════════

describe('أهلية المزايا', () => {
  it('المزايا الستّ مغلقة عند صفر', async () => {
    const user = await customerWith(0);
    const rewards = await rewardsOf(user.token);
    expect(Object.keys(rewards)).toHaveLength(CLAIMABLE_LEVELS.length);
    for (const reward of Object.values(rewards)) {
      expect(reward.unlocked).toBe(false);
      expect(reward.claimable).toBe(false);
    }
  });

  it('كل عتبة تفتح مزيّتها وما دونها', async () => {
    const user = await customerWith(600);
    const rewards = await rewardsOf(user.token);
    expect(rewards.explorer!.unlocked).toBe(true);
    expect(rewards.voyager!.unlocked).toBe(true);
    expect(rewards.warrior!.unlocked).toBe(true);
    expect(rewards.champion!.unlocked).toBe(true);
    expect(rewards.star!.unlocked).toBe(false);
    expect(rewards.legend!.unlocked).toBe(false);
  });

  it('[CRITICAL] المطالبة دون العتبة مرفوضة', async () => {
    const user = await customerWith(99);
    const res = await claim(user.token, 'explorer');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REWARD_LOCKED');

    const { rows } = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM loyalty_reward_redemptions WHERE user_id = $1',
      [user.userId],
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('[CRITICAL] رصيدٌ يرسله العميل في الحمولة لا أثر له', async () => {
    const user = await customerWith(0);
    const res = await claim(user.token, 'legend').send({
      balance: 999_999,
      points: 999_999,
      unlocked: true,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REWARD_LOCKED');
  });

  it('مستوى غير معروف مرفوض عند الحدّ', async () => {
    const user = await customerWith(1_000);
    for (const key of ['beginner', 'godmode', '../admin', '']) {
      const res = await claim(user.token, key);
      expect([400, 404, 422], key).toContain(res.status);
    }
  });

  it('المطالبة تحتاج جلسة', async () => {
    const res = await api.post('/api/points/rewards/explorer/claim');
    expect(res.status).toBe(401);
  });
});

// ═══════════════ مرة واحدة ═══════════════

describe('المزيّة مرة واحدة', () => {
  it('كل مزيّة تُطالَب مرة، والثانية تعيد نفس الصفّ بلا إنشاء', async () => {
    const user = await customerWith(1_000);
    for (const level of CLAIMABLE_LEVELS) {
      const first = await claim(user.token, level.key).expect(200);
      expect(first.body.data.claimed, level.key).toBe(true);

      const second = await claim(user.token, level.key).expect(200);
      expect(second.body.data.claimed, level.key).toBe(true);
    }

    const { rows } = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM loyalty_reward_redemptions WHERE user_id = $1',
      [user.userId],
    );
    expect(rows[0]!.n).toBe(String(CLAIMABLE_LEVELS.length));
  });

  it('[CRITICAL] عشر مطالبات متزامنة تُنتج صفّاً واحداً', async () => {
    const user = await customerWith(1_000);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => claim(user.token, 'star')),
    );
    for (const res of results) expect([200, 409]).toContain(res.status);

    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM loyalty_reward_redemptions
        WHERE user_id = $1 AND level_key = 'star'`,
      [user.userId],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('إعادة الإرسال بعد نجاحٍ ضائع لا تُنشئ ثانية', async () => {
    const user = await customerWith(400);
    await claim(user.token, 'warrior').expect(200);
    for (let i = 0; i < 5; i++) await claim(user.token, 'warrior').expect(200);

    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM loyalty_reward_redemptions
        WHERE user_id = $1 AND level_key = 'warrior'`,
      [user.userId],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('المطالبة لا تخصم نقاطاً — المزيّة ليست عملة', async () => {
    const user = await customerWith(1_000);
    await claim(user.token, 'legend').expect(200);
    const res = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(res.body.data.balance).toBe(1_000);
  });

  it('مزايا زبون لا تظهر لزبون آخر', async () => {
    const owner = await customerWith(1_000);
    await claim(owner.token, 'explorer').expect(200);

    const stranger = await customerWith(1_000);
    const rewards = await rewardsOf(stranger.token);
    expect(rewards.explorer!.claimed).toBe(false);
  });
});

// ═══════════════ الخصم ═══════════════

describe('مزايا الخصم', () => {
  it('القيمة الصرفة تحترم النسبة والسقف', () => {
    expect(discountRewardAmount({ kind: 'discount', percent: 3, capAmount: 5_000 }, 100_000)).toBe(3_000);
    // ٣٪ من مليون = ٣٠٬٠٠٠ لكن السقف ٥٬٠٠٠.
    expect(discountRewardAmount({ kind: 'discount', percent: 3, capAmount: 5_000 }, 1_000_000)).toBe(5_000);
    expect(discountRewardAmount({ kind: 'discount', percent: 5, capAmount: 10_000 }, 1_000_000)).toBe(10_000);
    expect(discountRewardAmount({ kind: 'discount', percent: 10, capAmount: 20_000 }, 1_000_000)).toBe(20_000);
    expect(discountRewardAmount({ kind: 'discount', percent: 10, capAmount: 20_000 }, 0)).toBe(0);
  });

  it('المزيّة المطالَب بها تُطبَّق على الطلب التالي وتُسجَّل', async () => {
    const user = await customerWith(100);
    await claim(user.token, 'explorer').expect(200);

    const productId = await productAt(100_000);
    const order = await placeOrder(user.token, productId);
    expect(order.status).toBe(201);

    // ٣٪ من ١٠٠٬٠٠٠ = ٣٬٠٠٠ (دون السقف).
    expect(Number(order.body.data.discount)).toBe(3_000);
    expect(Number(order.body.data.loyaltyDiscount)).toBe(3_000);

    const rewards = await rewardsOf(user.token);
    expect(rewards.explorer!.consumed).toBe(true);
  });

  it('[CRITICAL] السقف المالي يقصّ النسبة', async () => {
    const user = await customerWith(800);
    await claim(user.token, 'star').expect(200);

    const productId = await productAt(1_000_000);
    const order = await placeOrder(user.token, productId);
    expect(order.status).toBe(201);
    // ١٠٪ من مليون = ١٠٠٬٠٠٠، والسقف ٢٠٬٠٠٠.
    expect(Number(order.body.data.loyaltyDiscount)).toBe(20_000);
  });

  it('[CRITICAL] المزيّة تُستهلك مرة واحدة — الطلب الثاني بلا خصم', async () => {
    const user = await customerWith(400);
    await claim(user.token, 'warrior').expect(200);

    const productId = await productAt(100_000);
    const first = await placeOrder(user.token, productId);
    expect(first.status).toBe(201);
    expect(Number(first.body.data.loyaltyDiscount)).toBe(5_000);

    const second = await placeOrder(user.token, productId);
    expect(second.status).toBe(201);
    expect(Number(second.body.data.loyaltyDiscount)).toBe(0);
  });

  /**
   * [CRITICAL] الاستهلاك داخل معاملة إنشاء الطلب.
   *
   * طلبٌ يسقط (مخزون نفد) يجب ألا يحرق المزيّة: التراجع يشمل الاستهلاك.
   */
  it('[CRITICAL] الطلب الفاشل لا يستهلك المزيّة', async () => {
    const user = await customerWith(100);
    await claim(user.token, 'explorer').expect(200);

    const productId = await productAt(50_000);
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 3 })
      .expect(200);
    // يُفرَّغ المخزون بعد وضع السلة، فيسقط إنشاء الطلب داخل المعاملة.
    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);

    const failed = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        governorateId: catalog.governorateId,
        fullAddress: 'بغداد، الكرادة',
        phone: '07733333333',
      });
    expect(failed.status).toBe(409);

    // المزيّة ما زالت مطالَباً بها وغير مستهلَكة.
    const rewards = await rewardsOf(user.token);
    expect(rewards.explorer!.claimed).toBe(true);
    expect(rewards.explorer!.consumed).toBe(false);
  });

  it('نقاط الشراء تُحسب بعد خصم المزيّة لا قبله', async () => {
    const user = await customerWith(800);
    await claim(user.token, 'star').expect(200);

    const productId = await productAt(100_000);
    const order = await placeOrder(user.token, productId);
    expect(order.status).toBe(201);
    const orderId = order.body.data.id as string;
    // ١٠٪ من ١٠٠٬٠٠٠ = ١٠٬٠٠٠ (دون سقف ٢٠٬٠٠٠).
    expect(Number(order.body.data.loyaltyDiscount)).toBe(10_000);

    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }

    const res = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    // القيمة المؤهَّلة ٩٠٬٠٠٠ → ٤٥ نقطة، لا ٥٠. الخصم المُموَّل بالنقاط لا
    // يُنتج نقاطاً.
    expect(res.body.data.balance).toBe(800 + 45);
  });
});

// ═══════════════ الهدايا ═══════════════

describe('مزايا الهدايا', () => {
  it('قيم الهدايا ثابتة عند مطالبتها', async () => {
    const user = await customerWith(1_000);
    await claim(user.token, 'voyager').expect(200);
    await claim(user.token, 'champion').expect(200);
    await claim(user.token, 'legend').expect(200);

    const { rows } = await db.query<{ level_key: string; gift_amount: string }>(
      `SELECT level_key, gift_amount FROM loyalty_reward_redemptions
        WHERE user_id = $1 AND kind = 'gift' ORDER BY level_key`,
      [user.userId],
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.level_key, Number(r.gift_amount)]));
    expect(byKey.voyager).toBe(5_000);
    expect(byKey.champion).toBe(10_000);
    expect(byKey.legend).toBe(25_000);
  });

  it('الهدية لا تُطبَّق كخصم على الطلب', async () => {
    const user = await customerWith(1_000);
    await claim(user.token, 'legend').expect(200);

    const productId = await productAt(100_000);
    const order = await placeOrder(user.token, productId);
    expect(order.status).toBe(201);
    expect(Number(order.body.data.loyaltyDiscount)).toBe(0);
    expect(Number(order.body.data.discount)).toBe(0);
  });

  it('المطالبة تُنشئ إشعاراً للزبون مرة واحدة', async () => {
    const user = await customerWith(250);
    await claim(user.token, 'voyager').expect(200);
    await claim(user.token, 'voyager').expect(200);

    const res = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const claims = (res.body.data.items as { type: string }[]).filter(
      (n) => n.type === 'rewardClaimed',
    );
    expect(claims).toHaveLength(1);
  });

  it('`fulfilled_at` يبقى فارغاً حتى يعلّمها المسؤول', async () => {
    const user = await customerWith(250);
    await claim(user.token, 'voyager').expect(200);

    const rewards = await rewardsOf(user.token);
    expect(rewards.voyager!.claimed).toBe(true);
    expect(rewards.voyager!.fulfilledAt).toBeNull();
    expect(rewards.voyager!.consumed).toBe(false);
  });

  it('طابور اللوحة يعرض المطالِب والمستوى والقيمة والتاريخ', async () => {
    const user = await customerWith(600);
    await claim(user.token, 'champion').expect(200);

    const res = await api
      .get('/api/admin/loyalty-rewards')
      .query({ pending: 'true' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const mine = (res.body.data.items as Record<string, unknown>[]).find(
      (r) => r.userId === user.userId,
    );
    expect(mine).toBeTruthy();
    expect(mine!.username).toBeTruthy();
    expect(mine!.phone).toBeTruthy();
    expect(mine!.levelKey).toBe('champion');
    expect(mine!.levelName).toBe('بطل المجرة');
    expect(Number(mine!.giftAmount)).toBe(10_000);
    expect(mine!.claimedAt).toBeTruthy();
    expect(mine!.fulfilledAt).toBeNull();
  });

  it('التسليم يُسجَّل مرة واحدة ويُشعر الزبون', async () => {
    const user = await customerWith(250);
    const claimed = await claim(user.token, 'voyager').expect(200);
    expect(claimed.body.data.claimed).toBe(true);

    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM loyalty_reward_redemptions WHERE user_id = $1 AND level_key = 'voyager'`,
      [user.userId],
    );
    const redemptionId = rows[0]!.id;

    await api
      .post(`/api/admin/loyalty-rewards/${redemptionId}/fulfil`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const repeat = await api
      .post(`/api/admin/loyalty-rewards/${redemptionId}/fulfil`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe('ALREADY_FULFILLED');

    const rewards = await rewardsOf(user.token);
    expect(rewards.voyager!.fulfilledAt).toBeTruthy();
    expect(rewards.voyager!.consumed).toBe(true);
  });

  it('[CRITICAL] عمليتا تسليم متزامنتان تُنتجان تسليماً واحداً', async () => {
    const user = await customerWith(1_000);
    await claim(user.token, 'legend').expect(200);
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM loyalty_reward_redemptions WHERE user_id = $1 AND level_key = 'legend'`,
      [user.userId],
    );
    const id = rows[0]!.id;

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api
          .post(`/api/admin/loyalty-rewards/${id}/fulfil`)
          .set('Authorization', `Bearer ${adminToken}`),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  /**
   * [CRITICAL] حذف الطلب لا يُعيد المزيّة المستهلَكة إلى المتاح.
   *
   * `consumed_order_id` معرَّف `ON DELETE SET NULL`، فحذفُ الطلب يمحو الرابط.
   * لو كان «مفتوح» يعني «بلا رابط» لعادت مزيّةٌ أُنفقت قابلةً للإنفاق ثانيةً.
   * الحقيقة في `consumed_at` وهو لا يُمحى.
   */
  it('[CRITICAL] حذف الطلب لا يُحيي مزيّة استُهلكت', async () => {
    const user = await customerWith(100);
    await claim(user.token, 'explorer').expect(200);

    const productId = await productAt(100_000);
    const order = await placeOrder(user.token, productId);
    expect(order.status).toBe(201);
    const orderId = order.body.data.id as string;
    expect(Number(order.body.data.loyaltyDiscount)).toBe(3_000);

    // حذف الطلب من القاعدة (كما يفعل تنظيف بيانات الاختبار).
    await db.query('DELETE FROM order_status_history WHERE order_id = $1', [orderId]);
    await db.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
    await db.query('DELETE FROM orders WHERE id = $1', [orderId]);

    // ما زالت مستهلَكة، ولا خصم في الطلب التالي.
    const rewards = await rewardsOf(user.token);
    expect(rewards.explorer!.consumed).toBe(true);

    const next = await placeOrder(user.token, productId);
    expect(next.status).toBe(201);
    expect(Number(next.body.data.loyaltyDiscount)).toBe(0);
  });

  it('خصمٌ لا يُسلَّم كهدية', async () => {
    const user = await customerWith(100);
    await claim(user.token, 'explorer').expect(200);
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM loyalty_reward_redemptions WHERE user_id = $1 AND level_key = 'explorer'`,
      [user.userId],
    );

    const res = await api
      .post(`/api/admin/loyalty-rewards/${rows[0]!.id}/fulfil`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_GIFT');
  });

  it('[CRITICAL] العميل لا يسلّم هديته بنفسه', async () => {
    const user = await customerWith(250);
    await claim(user.token, 'voyager').expect(200);
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM loyalty_reward_redemptions WHERE user_id = $1 AND level_key = 'voyager'`,
      [user.userId],
    );

    const res = await api
      .post(`/api/admin/loyalty-rewards/${rows[0]!.id}/fulfil`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(403);

    const { rows: after } = await db.query<{ fulfilled_at: Date | null }>(
      'SELECT fulfilled_at FROM loyalty_reward_redemptions WHERE id = $1',
      [rows[0]!.id],
    );
    expect(after[0]!.fulfilled_at).toBeNull();
  });

  it('طابور الهدايا محجوب عن العميل', async () => {
    const user = await customerWith(0);
    const res = await api
      .get('/api/admin/loyalty-rewards')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(403);
  });

  it('معرّف مزيّة غير موجود → ٤٠٤، وغير صالح → ٤٠٠/٤٢٢', async () => {
    const missing = await api
      .post('/api/admin/loyalty-rewards/00000000-0000-0000-0000-000000000000/fulfil')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);

    const invalid = await api
      .post('/api/admin/loyalty-rewards/not-a-uuid/fulfil')
      .set('Authorization', `Bearer ${adminToken}`);
    expect([400, 422]).toContain(invalid.status);
  });
});

// ═══════════════ القواعد للقراءة في اللوحة ═══════════════

describe('قواعد نقاط المجرّة في اللوحة', () => {
  it('تُقرأ ولا تُكتب', async () => {
    const res = await api
      .get('/api/admin/galaxy-points/rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.purchase).toEqual({ stepIqd: 10_000, pointsPerStep: 5 });
    expect(res.body.data.review).toEqual({
      commentPoints: 1,
      photosPoints: 5,
      maxPhotos: 5,
      capPerOrder: 20,
    });
    expect(res.body.data.levels).toHaveLength(7);

    // لا فعل كتابة على هذا المسار.
    for (const attempt of [
      api.post('/api/admin/galaxy-points/rules'),
      api.patch('/api/admin/galaxy-points/rules'),
      api.delete('/api/admin/galaxy-points/rules'),
    ]) {
      const write = await attempt.set('Authorization', `Bearer ${adminToken}`).send({});
      expect([404, 405]).toContain(write.status);
    }
  });
});
