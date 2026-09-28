import type pg from 'pg';
import type { GalaxyLevelKey } from '../domain/galaxyPoints.js';

/**
 * استرداد مزايا المستويات — صفٌّ واحد لكل (زبون، مستوى) إلى الأبد.
 *
 * [CRITICAL] وحدةُ الاسترداد يفرضها `UNIQUE (user_id, level_key)` في القاعدة
 * لا شرطٌ في الخدمة. «اقرأ ثم اكتب» يمرّ منه طلبان متزامنان معاً — وهذا
 * بالضبط ما تنتجه الضغطةُ المزدوجة وإعادةُ المحاولة بعد انقطاع الشبكة.
 */

export interface RedemptionRow {
  id: string;
  user_id: string;
  level_key: GalaxyLevelKey;
  kind: 'discount' | 'gift';
  percent: number | null;
  cap_amount: string | number | null;
  gift_amount: string | number | null;
  claimed_at: Date | string;
  consumed_order_id: string | null;
  consumed_at: Date | string | null;
  fulfilled_at: Date | string | null;
  fulfilled_by: string | null;
}

export interface RedemptionDto {
  id: string;
  levelKey: GalaxyLevelKey;
  kind: 'discount' | 'gift';
  percent: number | null;
  capAmount: number | null;
  giftAmount: number | null;
  claimedAt: string;
  consumedOrderId: string | null;
  consumedAt: string | null;
  fulfilledAt: string | null;
}

const num = (value: string | number | null) =>
  value === null ? null : Number(value);

const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

export function shapeRedemption(row: RedemptionRow): RedemptionDto {
  return {
    id: row.id,
    levelKey: row.level_key,
    kind: row.kind,
    percent: row.percent,
    capAmount: num(row.cap_amount),
    giftAmount: num(row.gift_amount),
    claimedAt: new Date(row.claimed_at).toISOString(),
    consumedOrderId: row.consumed_order_id,
    consumedAt: iso(row.consumed_at),
    fulfilledAt: iso(row.fulfilled_at),
  };
}

/** «الخصم المفتوح» الأقدم للزبون — تعريفٌ واحد للحجز وللمعاينة. */
const OPEN_DISCOUNT_SQL = `SELECT * FROM loyalty_reward_redemptions
        WHERE user_id = $1 AND kind = 'discount' AND consumed_at IS NULL
        ORDER BY claimed_at
        LIMIT 1`;

export const rewardRedemptionRepo = {
  async listForUser(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rows } = await db.query<RedemptionRow>(
      'SELECT * FROM loyalty_reward_redemptions WHERE user_id = $1',
      [userId],
    );
    return rows.map(shapeRedemption);
  },

  /**
   * تسجيل المطالبة.
   *
   * `ON CONFLICT DO NOTHING` ثم قراءة الصفّ القائم: النتيجة واحدة سواء كانت
   * هذه أول مطالبة أو الخامسة بعد أربع محاولات فاشلة على شبكة رديئة. لا خطأ
   * يُعرض للزبون على شيءٍ نجح أصلاً، ولا مزيّة ثانية تُخلق.
   */
  async claim(
    db: pg.Pool | pg.PoolClient,
    input: {
      userId: string;
      levelKey: GalaxyLevelKey;
      kind: 'discount' | 'gift';
      percent?: number | null;
      capAmount?: number | null;
      giftAmount?: number | null;
    },
  ): Promise<{ redemption: RedemptionDto; created: boolean }> {
    const { rows } = await db.query<RedemptionRow>(
      `INSERT INTO loyalty_reward_redemptions
         (user_id, level_key, kind, percent, cap_amount, gift_amount)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, level_key) DO NOTHING
       RETURNING *`,
      [
        input.userId,
        input.levelKey,
        input.kind,
        input.percent ?? null,
        input.capAmount ?? null,
        input.giftAmount ?? null,
      ],
    );
    if (rows[0]) return { redemption: shapeRedemption(rows[0]), created: true };

    const existing = await db.query<RedemptionRow>(
      'SELECT * FROM loyalty_reward_redemptions WHERE user_id = $1 AND level_key = $2',
      [input.userId, input.levelKey],
    );
    return { redemption: shapeRedemption(existing.rows[0]!), created: false };
  },

  /**
   * أقدم خصم مطالَب به ولم يُستهلك — مرشّح الاستهلاك في الطلب القادم.
   *
   * `FOR UPDATE` لأن القارئ سيكتب: طلبان متزامنان من نفس الزبون كانا
   * سيختاران نفس الصفّ ويستهلكانه مرتين لولا القفل.
   *
   * [CRITICAL] الشرط على `consumed_at` لا على `consumed_order_id`. المفتاح
   * `ON DELETE SET NULL`، فحذفُ الطلب كان سيُفرغ الرابط ويُعيد مزيّةً
   * أُنفقت فعلاً إلى قائمة المتاح — استهلاكٌ ثانٍ لمزيّةٍ «مرة واحدة» عبر
   * بابٍ لا علاقة له بالمزايا. الطابع الزمني لا يُمحى بحذف أي شيء.
   */
  async findOpenDiscount(client: pg.PoolClient, userId: string) {
    const { rows } = await client.query<RedemptionRow>(
      `${OPEN_DISCOUNT_SQL}
        FOR UPDATE`,
      [userId],
    );
    return rows[0] ? shapeRedemption(rows[0]) : null;
  },

  /**
   * الخصم المفتوح نفسه الذي سيختاره [findOpenDiscount] — **بلا قفل**.
   *
   * لمعاينة شاشة الدفع وحدها (`orderService.checkoutQuote`): قراءةٌ لا تحجز
   * شيئاً ولا تستهلك شيئاً. الشرط والترتيب واحد (`OPEN_DISCOUNT_SQL`)، فما
   * يُعرض على الزبون هو المرشّح الذي سيحجزه الإنشاء — والحكم النهائي يبقى
   * للإنشاء تحت القفل.
   */
  async peekOpenDiscount(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rows } = await db.query<RedemptionRow>(OPEN_DISCOUNT_SQL, [userId]);
    return rows[0] ? shapeRedemption(rows[0]) : null;
  },

  /**
   * استهلاك خصم في طلب.
   *
   * الشرط `consumed_at IS NULL` داخل التحديث هو الحارس: لو سبقنا أحدٌ إليه
   * لا يُحدَّث شيء ونعرف ذلك من `rowCount`. نفس نمط استهلاك خصم الميلاد.
   * وهذا يجري داخل معاملة إنشاء الطلب، فسقوطُ الطلب لأي سبب يُرجع المزيّة
   * كما كانت — لا خصم يُحرق على طلب لم يُنشأ.
   */
  async consume(
    client: pg.PoolClient,
    redemptionId: string,
    orderId: string,
  ): Promise<boolean> {
    const { rowCount } = await client.query(
      `UPDATE loyalty_reward_redemptions
          SET consumed_order_id = $2, consumed_at = now()
        WHERE id = $1 AND consumed_at IS NULL`,
      [redemptionId, orderId],
    );
    return (rowCount ?? 0) > 0;
  },

  /** طابور الهدايا للإدارة — غير المسلَّمة أولاً، ثم الأقدم. */
  async listGiftClaims(
    db: pg.Pool | pg.PoolClient,
    options: { pending?: boolean; page: number; limit: number },
  ) {
    const conditions = ["r.kind = 'gift'"];
    if (options.pending) conditions.push('r.fulfilled_at IS NULL');
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [data, count] = await Promise.all([
      db.query<
        RedemptionRow & { username: string; phone: string; fulfilled_by_name: string | null }
      >(
        `SELECT r.*, u.username, u.phone,
                f.username AS fulfilled_by_name
           FROM loyalty_reward_redemptions r
           JOIN users u ON u.id = r.user_id
           LEFT JOIN users f ON f.id = r.fulfilled_by
          ${where}
          ORDER BY (r.fulfilled_at IS NOT NULL), r.claimed_at
          LIMIT $1 OFFSET $2`,
        [options.limit, (options.page - 1) * options.limit],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM loyalty_reward_redemptions r ${where}`,
      ),
    ]);

    return {
      items: data.rows.map((row) => ({
        ...shapeRedemption(row),
        userId: row.user_id,
        username: row.username,
        phone: row.phone,
        fulfilledByName: row.fulfilled_by_name,
      })),
      total: Number(count.rows[0]?.total ?? 0),
    };
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<RedemptionRow>(
      'SELECT * FROM loyalty_reward_redemptions WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  },

  /**
   * تسليم هدية.
   *
   * الشرط `fulfilled_at IS NULL` يجعل التسليم مرة واحدة: ضغطتان على «سُلّمت»
   * لا تُنتجان تسليمَين ولا تستبدلان اسم من سلّمها فعلاً باسم من ضغط ثانية.
   */
  async fulfilGift(
    db: pg.Pool | pg.PoolClient,
    id: string,
    adminId: string,
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE loyalty_reward_redemptions
          SET fulfilled_at = now(), fulfilled_by = $2
        WHERE id = $1 AND kind = 'gift' AND fulfilled_at IS NULL`,
      [id, adminId],
    );
    return (rowCount ?? 0) > 0;
  },

  /** عدّاد الهدايا المنتظرة — شارة لوحة التحكم. */
  async countPendingGifts(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM loyalty_reward_redemptions
        WHERE kind = 'gift' AND fulfilled_at IS NULL`,
    );
    return Number(rows[0]?.total ?? 0);
  },
};
