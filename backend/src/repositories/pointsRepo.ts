import type pg from 'pg';
import type { PointsActivityDto, PointsLedgerRow, PointsReason } from '../types/index.js';

function shapeActivity(row: PointsLedgerRow): PointsActivityDto {
  return {
    id: row.id,
    label: row.label,
    amount: row.amount,
    occurredAt: new Date(row.created_at).toISOString(),
  };
}

export const pointsRepo = {
  /** الرصيد مشتق من الدفتر — لا عمود رصيد مكرّر يمكن أن يتباعد. */
  async balance(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rows } = await db.query<{ balance: string }>(
      'SELECT COALESCE(SUM(amount), 0)::text AS balance FROM points_ledger WHERE user_id = $1',
      [userId],
    );
    return Number(rows[0]?.balance ?? 0);
  },

  /** أرصدة عدّة زبائن في جملة واحدة — من لا سطر له في الدفتر رصيده صفر. */
  async balances(db: pg.Pool | pg.PoolClient, userIds: string[]): Promise<Map<string, number>> {
    const balances = new Map<string, number>(userIds.map((id) => [id, 0]));
    if (userIds.length === 0) return balances;
    const { rows } = await db.query<{ user_id: string; balance: string }>(
      `SELECT user_id, SUM(amount)::text AS balance FROM points_ledger
        WHERE user_id = ANY($1::uuid[]) GROUP BY user_id`,
      [userIds],
    );
    for (const row of rows) balances.set(row.user_id, Number(row.balance));
    return balances;
  },

  async listActivity(db: pg.Pool | pg.PoolClient, userId: string, limit = 100) {
    const { rows } = await db.query<PointsLedgerRow>(
      `SELECT * FROM points_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.map(shapeActivity);
  },

  /**
   * منح نقاط. الفهارس الفريدة تمنع منح نفس الحدث مرتين، فنبتلع التعارض
   * بدل رفع خطأ — المنح عملية جانبية لا يجب أن تُفشل العملية الأصلية.
   */
  async award(
    db: pg.Pool | pg.PoolClient,
    input: {
      userId: string;
      label: string;
      amount: number;
      reason: PointsReason;
      orderId?: string | null;
      reviewId?: string | null;
    },
  ) {
    const { rows } = await db.query<PointsLedgerRow>(
      `INSERT INTO points_ledger (user_id, label, amount, reason, order_id, review_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        input.userId,
        input.label,
        input.amount,
        input.reason,
        input.orderId ?? null,
        input.reviewId ?? null,
      ],
    );
    return rows[0] ? shapeActivity(rows[0]) : null;
  },

  /**
   * الدفتر كما تقرأه الإدارة — مع السبب والارتباط.
   *
   * يختلف عن [listActivity] عمداً: العميل يرى نصّاً معروضاً فقط، والإدارة
   * تحتاج السبب الآلي ومعرّف الطلب/التقييم للتدقيق. لا جدول ولا رصيد ثانٍ —
   * نفس الصفوف بعدسة أوسع.
   *
   * [STEP 66] كل سطرٍ يحمل **الرصيد بعده** ورقمَ طلبه: «كيف صار رصيده ٣٥؟»
   * يُقرأ من السجلّ مباشرةً. الرصيد التراكمي نافذةٌ على دفتر الزبون **كله**
   * قبل القصّ إلى `limit` — لو حُسب على الصفحة لبدأ أقدمُ سطرٍ معروض من صفر
   * وكذب كل ما فوقه. الترتيب (`created_at`, `id`) نفسه في النافذة والعرض،
   * فحركتان في اللحظة نفسها لا تتبادلان رصيدهما.
   */
  async listLedgerForAdmin(db: pg.Pool | pg.PoolClient, userId: string, limit = 200) {
    const { rows } = await db.query<
      PointsLedgerRow & { balance_after: string; order_number: string | null }
    >(
      `SELECT l.*, o.number AS order_number, l.balance_after::text AS balance_after
         FROM (
           SELECT pl.*,
                  SUM(pl.amount) OVER (ORDER BY pl.created_at, pl.id
                                       ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_after
             FROM points_ledger pl
            WHERE pl.user_id = $1
         ) l
         LEFT JOIN orders o ON o.id = l.order_id
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      amount: row.amount,
      reason: row.reason,
      orderId: row.order_id,
      orderNumber: row.order_number,
      reviewId: row.review_id,
      balanceAfter: Number(row.balance_after),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  },

  /**
   * أرقام مجمَّعة للوحة التحكم.
   *
   * كلها مشتقّة من نفس الدفتر — لا عمود رصيد ولا جدول تجميع يمكن أن يتباعد
   * عن الحقيقة. `SUM` على الموجب والسالب منفصلين يفرّق بين ما مُنح وما
   * سُحب (حركةٌ سالبة في الدفتر).
   *
   * [CRITICAL] (STEP 66) **الزبائن وحدهم** — هنا وفي `byReason` و`topBalances`.
   * نقاط المجرّة برنامج ولاءٍ للزبائن، ودفترُ غيرِ الزبون لا يُفتح من اللوحة
   * (`GET /admin/customers/:id/points` يردّ 404 منذ STEP 64). حسابٌ مسؤول
   * كسب نقاطاً بطلبات اختبار كان يتصدّر «أعلى الأرصدة» ثم يُفتح دفتره فارغاً،
   * ويكشف اسمه ورقمه لمسؤولٍ فرعي يملك «النقاط» وحدها.
   */
  async summary(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<{
      total_balance: string;
      awarded: string;
      revoked: string;
      entries: string;
      holders: string;
    }>(
      `SELECT COALESCE(SUM(amount), 0)::text                          AS total_balance,
              COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::text AS awarded,
              COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0)::text AS revoked,
              COUNT(*)::text                                           AS entries,
              COUNT(DISTINCT user_id)::text                            AS holders
         FROM points_ledger
        WHERE user_id IN (SELECT id FROM users WHERE role = 'customer')`,
    );
    const row = rows[0];
    return {
      totalInCirculation: Number(row?.total_balance ?? 0),
      totalAwarded: Number(row?.awarded ?? 0),
      totalRevoked: Math.abs(Number(row?.revoked ?? 0)),
      ledgerEntries: Number(row?.entries ?? 0),
      customersWithPoints: Number(row?.holders ?? 0),
    };
  },

  /** توزيع الحركات على الأسباب — يبيّن من أين تأتي النقاط فعلاً. */
  async byReason(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<{ reason: PointsReason; entries: string; total: string }>(
      `SELECT reason, COUNT(*)::text AS entries, COALESCE(SUM(amount), 0)::text AS total
         FROM points_ledger
        WHERE user_id IN (SELECT id FROM users WHERE role = 'customer')
        GROUP BY reason
        ORDER BY SUM(amount) DESC`,
    );
    return rows.map((r) => ({
      reason: r.reason,
      entries: Number(r.entries),
      total: Number(r.total),
    }));
  },

  /**
   * أعلى الأرصدة.
   *
   * يكشف الاسم والهاتف فقط — وهما ما تعرضه إدارة الزبائن أصلاً. لا عناوين
   * ولا محتويات طلبات: رؤية النقاط لا تستدعي فتح ملف العميل كاملاً.
   */
  async topBalances(db: pg.Pool | pg.PoolClient, limit = 20) {
    const { rows } = await db.query<{
      user_id: string;
      username: string;
      phone: string;
      balance: string;
      entries: string;
    }>(
      `SELECT l.user_id, u.username, u.phone,
              SUM(l.amount)::text AS balance,
              COUNT(*)::text      AS entries
         FROM points_ledger l
         JOIN users u ON u.id = l.user_id AND u.role = 'customer'
        GROUP BY l.user_id, u.username, u.phone
        HAVING SUM(l.amount) > 0
        ORDER BY SUM(l.amount) DESC, u.username
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      phone: r.phone,
      balance: Number(r.balance),
      entries: Number(r.entries),
    }));
  },

  /**
   * مجموع نقاط التقييم الممنوحة عن طلب واحد.
   *
   * أساسُ سقف العشرين نقطة لكل طلب. يُحسب من الدفتر نفسه لا من عدّاد ثانٍ:
   * أي عمود «مجموع مُنح» كان سيتباعد عن الحقيقة أول مرة يُسحب فيها اعتمادُ
   * تقييم. ونقاط الشراء مستثناة بالسبب لا بالمقدار — السقف يخصّ التقييمات
   * وحدها.
   */
  async reviewPointsForOrder(db: pg.Pool | pg.PoolClient, orderId: string) {
    const { rows } = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
         FROM points_ledger
        WHERE order_id = $1
          AND reason IN ('review_approved', 'review_with_photo')`,
      [orderId],
    );
    return Number(rows[0]?.total ?? 0);
  },

  /** إزالة نقاط تقييم عند سحب الاعتماد (رفض بعد اعتماد). */
  async revokeForReview(db: pg.Pool | pg.PoolClient, reviewId: string) {
    await db.query('DELETE FROM points_ledger WHERE review_id = $1', [reviewId]);
  },
};
