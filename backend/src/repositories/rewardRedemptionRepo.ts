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
  /** الطلب المربوط بالهدية (081) — يُقرأ في [listForUser] وحده. */
  gift_order_id?: string | null;
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
  /** الطلب الذي استُعملت فيه: خصمٌ استُهلك فيه، أو هدية رُبطت به. */
  orderId: string | null;
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
    orderId: row.consumed_order_id ?? row.gift_order_id ?? null,
  };
}

/**
 * مزايا الزبون المفتوحة لطلبه القادم بترتيب المطالبة — تعريفٌ واحد للحجز
 * وللمعاينة.
 *
 * خصمٌ مفتوح = لم يُستهلك. هديةٌ مفتوحة = لم تُربط بطلب **ولم تُسلَّم**.
 *
 * [CRITICAL] شرط `fulfilled_at IS NULL`: هديةٌ سلّمها المسؤول يدوياً قبل
 * وجود الربط بالطلب (081) لا رابط لها، فكانت تُعدّ مفتوحة وتُربط بطلبٍ جديد
 * — هديةٌ واحدة تُسلَّم مرتين.
 */
const OPEN_REWARDS_SQL = `SELECT r.*
         FROM loyalty_reward_redemptions r
        WHERE r.user_id = $1
          AND (
            (r.kind = 'discount' AND r.consumed_at IS NULL)
            OR (
              r.kind = 'gift'
              AND r.fulfilled_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM orders o WHERE o.loyalty_gift_redemption_id = r.id
              )
            )
          )
        ORDER BY r.claimed_at, r.id`;

export const rewardRedemptionRepo = {
  async listForUser(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rows } = await db.query<RedemptionRow>(
      `SELECT r.*,
              (SELECT o.id FROM orders o
                WHERE o.loyalty_gift_redemption_id = r.id) AS gift_order_id
         FROM loyalty_reward_redemptions r
        WHERE r.user_id = $1`,
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
   * المزايا المفتوحة ([OPEN_REWARDS_SQL]) — مرشّحات مزيّة الطلب القادم.
   *
   * `lock` لإنشاء الطلب: `FOR UPDATE` لأن القارئ سيكتب، فطلبان متزامنان من
   * نفس الزبون لا يختاران المزيّة نفسها. بلا قفل لمعاينة شاشة الدفع وحدها —
   * قراءةٌ لا تحجز شيئاً، والحكم النهائي للإنشاء تحت القفل.
   *
   * [CRITICAL] الخصم يُعدّ مستهلكاً بـ`consumed_at` لا بـ`consumed_order_id`.
   * المفتاح `ON DELETE SET NULL`، فحذفُ الطلب كان سيُفرغ الرابط ويُعيد مزيّةً
   * أُنفقت فعلاً إلى قائمة المتاح. الطابع الزمني لا يُمحى بحذف أي شيء.
   */
  async openRewards(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    options: { lock: boolean },
  ): Promise<RedemptionDto[]> {
    const { rows } = await db.query<RedemptionRow>(
      options.lock ? `${OPEN_REWARDS_SQL}\n        FOR UPDATE OF r` : OPEN_REWARDS_SQL,
      [userId],
    );
    return rows.map(shapeRedemption);
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

  /**
   * ربط هدية بطلب — الخطوة الثانية بعد إنشاء الطلب.
   *
   * [CRITICAL] يُنفَّذ داخل معاملة إنشاء الطلب. المؤشر الفريد الجزئي على
   * `orders.loyalty_gift_redemption_id` هو الحارس النهائي: لو سبقنا أحدٌ
   * إليها (`rowCount = 0`) نُسقط الطلب كاملاً. سقوط الطلب لأي سبب لاحق
   * يُرجع الربط — الهدية تعود مفتوحةً تلقائياً لأن الطلب يُحذف أو يبقى.
   */
  async linkGiftToOrder(
    client: pg.PoolClient,
    orderId: string,
    redemptionId: string,
  ): Promise<boolean> {
    const { rowCount } = await client.query(
      `UPDATE orders
          SET loyalty_gift_redemption_id = $2
        WHERE id = $1
          AND loyalty_gift_redemption_id IS NULL`,
      [orderId, redemptionId],
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
