import type pg from 'pg';

export type DevicePlatform = 'android' | 'ios' | 'web';

/**
 * رموز أجهزة الإشعارات الفورية.
 *
 * كل دالة هنا تأخذ `userId` من سياق المصادقة عند المستدعي — لا يوجد مسار
 * يقبل معرّف مستخدم من العميل، فلا يستطيع أحد تسجيل رمزٍ باسم غيره ولا
 * قراءة أجهزته.
 */
export const deviceTokenRepo = {
  /**
   * تسجيل رمز أو تحديثه.
   *
   * [CRITICAL] التعارض على `token` لا على `(user_id, token)`.
   *
   * المزوّدون يعيدون تدوير الرموز: جهازٌ يُمسح ويُعاد ضبطه قد يعطي رمزاً
   * كان لمستخدمٍ آخر. لو أدرجنا صفاً جديداً لبقي الصفّ القديم نشطاً وأرسلنا
   * إشعارات المستخدم الأول إلى جهاز المستخدم الثاني — تسريبٌ صامت. نقلُ
   * ملكية الرمز عند التعارض يمنع ذلك.
   */
  async register(
    db: pg.Pool | pg.PoolClient,
    input: { userId: string; token: string; platform: DevicePlatform },
  ): Promise<{ id: string; created: boolean }> {
    const { rows } = await db.query<{ id: string; created: boolean }>(
      `INSERT INTO device_tokens (user_id, token, platform)
            VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
              SET user_id      = EXCLUDED.user_id,
                  platform     = EXCLUDED.platform,
                  is_active    = TRUE,
                  last_seen_at = now()
        RETURNING id, (xmax = 0) AS created`,
      [input.userId, input.token, input.platform],
    );
    return rows[0]!;
  },

  /** إلغاء تسجيل رمز — عند تسجيل الخروج. مقيَّد بصاحب الرمز. */
  async deactivate(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    token: string,
  ): Promise<boolean> {
    const { rowCount } = await db.query(
      `UPDATE device_tokens SET is_active = FALSE
        WHERE token = $1 AND user_id = $2 AND is_active`,
      [token, userId],
    );
    return (rowCount ?? 0) > 0;
  },

  /** الرموز النشطة لمجموعة مستخدمين — مسار الإرسال. */
  async activeTokensFor(
    db: pg.Pool | pg.PoolClient,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const { rows } = await db.query<{ token: string }>(
      `SELECT token FROM device_tokens
        WHERE user_id = ANY($1::uuid[]) AND is_active`,
      [userIds],
    );
    return rows.map((r) => r.token);
  },

  /** أجهزة المستخدم كما يراها هو. */
  async listMine(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rows } = await db.query<{
      id: string;
      platform: DevicePlatform;
      last_seen_at: Date;
    }>(
      `SELECT id, platform, last_seen_at FROM device_tokens
        WHERE user_id = $1 AND is_active
        ORDER BY last_seen_at DESC`,
      [userId],
    );
    // الرمز نفسه لا يُعاد إلى العميل: لا حاجة له، وإعادتُه تسرّبه إلى أي
    // سجلّ أو أداة تفحص الاستجابات.
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      lastSeenAt: r.last_seen_at.toISOString(),
    }));
  },

  /**
   * تعطيل الرموز التي رفضها المزوّد.
   *
   * الرمز المنتهي يبقى في القاعدة معطَّلاً لا يُحذف: نعرف أن الجهاز كان
   * مسجَّلاً وتوقّف، بدل أن يختفي بلا أثر.
   */
  async deactivateTokens(
    db: pg.Pool | pg.PoolClient,
    tokens: string[],
  ): Promise<number> {
    if (tokens.length === 0) return 0;
    const { rowCount } = await db.query(
      `UPDATE device_tokens SET is_active = FALSE
        WHERE token = ANY($1::text[]) AND is_active`,
      [tokens],
    );
    return rowCount ?? 0;
  },
};
