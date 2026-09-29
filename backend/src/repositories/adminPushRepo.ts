import type pg from 'pg';
import { ADMIN_PUSH_EVENT_KEYS, type AdminPushEvent } from './pushOutboxRepo.js';

export type AdminDevicePlatform = 'web' | 'android' | 'ios';

/**
 * أجهزة المسؤولين وتفضيلات إشعاراتهم (هجرة ٠٧٠) — كل استعلامٍ هنا مقيَّد
 * بمعرّف المسؤول من الجلسة: لا مسار يقرأ أو يعطّل جهاز مسؤولٍ آخر.
 */
export const adminPushRepo = {
  /**
   * تسجيل جهاز. الرمز فريد: متصفّحٌ واحد يسجّل فيه مسؤولٌ ثم آخر ينتقل رمزه
   * إلى الثاني (هو من يستعمل المتصفّح الآن).
   *
   * [SECURITY] الرمز يُحذف من أجهزة الزبائن في المعاملة نفسها: رمزٌ واحد لا
   * يكون زبوناً ومسؤولاً معاً، فلا يصل إشعار زبونٍ متصفّحَ اللوحة.
   */
  async register(
    tx: pg.PoolClient,
    input: { userId: string; token: string; platform: AdminDevicePlatform },
  ): Promise<{ created: boolean }> {
    await tx.query('DELETE FROM device_tokens WHERE token = $1', [input.token]);
    const { rows } = await tx.query<{ created: boolean }>(
      `INSERT INTO admin_push_devices (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             is_active = TRUE,
             last_seen_at = now()
       RETURNING (xmax = 0) AS created`,
      [input.userId, input.token, input.platform],
    );
    return { created: rows[0]?.created ?? false };
  },

  /** إلغاء جهازٍ **يملكه** المسؤول — رمزُ غيره لا يُمسّ. */
  async unregister(db: pg.Pool | pg.PoolClient, userId: string, token: string): Promise<boolean> {
    const { rowCount } = await db.query(
      'UPDATE admin_push_devices SET is_active = FALSE WHERE user_id = $1 AND token = $2 AND is_active',
      [userId, token],
    );
    return (rowCount ?? 0) > 0;
  },

  /**
   * تعطيل كل أجهزة المسؤول — مع كل رفعٍ لـ`token_version` (تغيير كلمة
   * المرور، إعادة تعيينها، الإيقاف) في المعاملة نفسها.
   *
   * [SECURITY] جهازٌ مسجَّل قناةٌ مستقلّة عن الجلسة تحمل بيانات زبائن
   * (اسم، هاتف، مبلغ). من سجّل متصفّحه بتوكنٍ مسروق يبقى يستقبلها بعد أن
   * تسقط كل الجلسات لو لم يُعطَّل هنا. متصفّح المسؤول الشرعي يعيد تسجيل
   * رمزه المحفوظ عند جلسته التالية (`resyncWebPush` في اللوحة).
   */
  async deactivateAll(db: pg.Pool | pg.PoolClient, userId: string): Promise<number> {
    const { rowCount } = await db.query(
      'UPDATE admin_push_devices SET is_active = FALSE WHERE user_id = $1 AND is_active',
      [userId],
    );
    return rowCount ?? 0;
  },

  async activeCount(db: pg.Pool | pg.PoolClient, userId: string): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM admin_push_devices WHERE user_id = $1 AND is_active',
      [userId],
    );
    return Number(rows[0]?.n ?? 0);
  },

  /** هل الرمز جهازُ مسؤولٍ فعّال؟ — ليرفض تسجيله جهازَ زبون. */
  async isActiveAdminToken(db: pg.Pool | pg.PoolClient, token: string): Promise<boolean> {
    const { rowCount } = await db.query(
      'SELECT 1 FROM admin_push_devices WHERE token = $1 AND is_active',
      [token],
    );
    return (rowCount ?? 0) > 0;
  },

  /** التفضيلات كاملة — الغائب مفعَّل. */
  async prefs(db: pg.Pool | pg.PoolClient, userId: string): Promise<Record<AdminPushEvent, boolean>> {
    const { rows } = await db.query<{ key: AdminPushEvent; enabled: boolean }>(
      'SELECT key, enabled FROM admin_notification_prefs WHERE user_id = $1',
      [userId],
    );
    const prefs = Object.fromEntries(ADMIN_PUSH_EVENT_KEYS.map((key) => [key, true])) as Record<
      AdminPushEvent,
      boolean
    >;
    for (const row of rows) {
      if (ADMIN_PUSH_EVENT_KEYS.includes(row.key)) prefs[row.key] = row.enabled;
    }
    return prefs;
  },

  async setPref(db: pg.Pool | pg.PoolClient, userId: string, key: AdminPushEvent, enabled: boolean) {
    await db.query(
      `INSERT INTO admin_notification_prefs (user_id, key, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [userId, key, enabled],
    );
  },
};
