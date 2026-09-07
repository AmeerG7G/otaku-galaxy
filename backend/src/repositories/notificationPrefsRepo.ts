import type pg from 'pg';

/** المفاتيح الستة في شاشة الإعدادات — تطابق مفتاح القيد في الهجرة ٠٣٦. */
export const NOTIFICATION_PREF_KEYS = [
  'orders',
  'reviews',
  'stock',
  'offers',
  'points',
  'birthday',
] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

/**
 * الافتراضيات — «مفعّل» للكل عدا العروض.
 *
 * العروض تبقى قبالاً عمداً: الإشعارات الترويجية لا تُرسل إلا بطلب صريح،
 * فالمسؤول الجديد لا يوقظ زبائنه من أول يوم بدعاية لم يطلبوها.
 */
export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationPrefKey, boolean> = {
  orders: true,
  reviews: true,
  stock: true,
  offers: false,
  points: true,
  birthday: true,
};

export const notificationPrefsRepo = {
  /** كل تفضيلات مستخدم — صفّ واحد لكل مفتاح فعّلَه أو عطّله. */
  async getAll(
    db: pg.Pool | pg.PoolClient,
    userId: string,
  ): Promise<Record<NotificationPrefKey, boolean>> {
    const { rows } = await db.query<{ key: string; enabled: boolean }>(
      'SELECT key, enabled FROM user_notification_prefs WHERE user_id = $1',
      [userId],
    );
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS };
    for (const row of rows) {
      if ((NOTIFICATION_PREF_KEYS as readonly string[]).includes(row.key)) {
        prefs[row.key as NotificationPrefKey] = row.enabled;
      }
    }
    return prefs;
  },

  /** حفظ تفضيل واحد — إدراج أو تحديث (المفتاح محصَّن بالتعداد في المدقق). */
  async set(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    key: NotificationPrefKey,
    enabled: boolean,
  ) {
    await db.query(
      `INSERT INTO user_notification_prefs (user_id, key, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [userId, key, enabled],
    );
  },
};