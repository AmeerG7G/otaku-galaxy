import type pg from 'pg';
import type { AdminSection } from '../domain/adminPermissions.js';

/**
 * صندوق الدفع الصادر (هجرة ٠٧٠) — ما تلتقطه `pushOutboxJob`.
 *
 * صفوف الزبون يكتبها زناد `notifications` وحده. صفوف المسؤول يكتبها
 * `enqueueAdminEvent` هنا، داخل معاملة الحدث (طلبٌ جديد، طلب حساب، طلب توفّر).
 */

export type PushAudience = 'customer' | 'admin';

export interface OutboxRow {
  id: string;
  audience: PushAudience;
  user_id: string;
  notification_id: string | null;
  event_key: string | null;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
}

/** أحداث المسؤول، والقسم الذي يلزم امتلاكه لتلقّيها. */
export const ADMIN_PUSH_EVENTS = {
  new_order: 'orders',
  account_request: 'account_requests',
  restock_request: 'restock',
} as const satisfies Record<string, AdminSection>;

export type AdminPushEvent = keyof typeof ADMIN_PUSH_EVENTS;

export const ADMIN_PUSH_EVENT_KEYS = Object.keys(ADMIN_PUSH_EVENTS) as AdminPushEvent[];

/**
 * مدّة الحجز: الصفّ الملتقَط يصير «مستحقاً» ثانيةً بعدها. عمليةٌ ماتت أثناء
 * الإرسال لا تُضيّع الإشعار — يلتقطه دورٌ لاحق (مع احتمال تكرارٍ نادر، وهو
 * أهون من ضياع تنبيه طلبٍ جديد).
 */
export const CLAIM_LEASE_SECONDS = 120;

export const pushOutboxRepo = {
  /**
   * التقاط دفعةٍ مستحقّة وحجزها — في معاملةٍ قصيرة لا تمتدّ إلى الشبكة.
   *
   * `FOR UPDATE SKIP LOCKED` يجعل نسختين من المهمّة (أو خادمين) تلتقطان صفوفاً
   * مختلفة، ودفعُ `next_attempt_at` إلى ما بعد الحجز يمنع التقاط الصفّ نفسه
   * ثانيةً بينما الإرسال جارٍ خارج المعاملة.
   */
  async claimDue(db: pg.Pool | pg.PoolClient, limit: number): Promise<OutboxRow[]> {
    const { rows } = await db.query<OutboxRow>(
      `UPDATE push_outbox o
          SET attempts = o.attempts + 1,
              next_attempt_at = now() + make_interval(secs => $2)
        WHERE o.id IN (
          SELECT id FROM push_outbox
           WHERE status = 'pending' AND next_attempt_at <= now()
           ORDER BY next_attempt_at, id
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING o.id::text AS id, o.audience, o.user_id, o.notification_id, o.event_key,
                  o.title, o.body, o.data, o.attempts`,
      [limit, CLAIM_LEASE_SECONDS],
    );
    return rows;
  },

  async markSent(db: pg.Pool | pg.PoolClient, id: string, note: string | null = null) {
    await db.query(
      `UPDATE push_outbox SET status = 'sent', sent_at = now(), last_error = $2 WHERE id = $1`,
      [id, note],
    );
  },

  async markSkipped(db: pg.Pool | pg.PoolClient, id: string, reason: string) {
    await db.query(`UPDATE push_outbox SET status = 'skipped', last_error = $2 WHERE id = $1`, [id, reason]);
  },

  async markFailed(db: pg.Pool | pg.PoolClient, id: string, reason: string) {
    await db.query(`UPDATE push_outbox SET status = 'failed', last_error = $2 WHERE id = $1`, [id, reason]);
  },

  /** إعادة المحاولة لاحقاً — الصفّ يبقى معلَّقاً وموعده يتباعد. */
  async scheduleRetry(db: pg.Pool | pg.PoolClient, id: string, delaySeconds: number, reason: string) {
    await db.query(
      `UPDATE push_outbox
          SET next_attempt_at = now() + make_interval(secs => $2), last_error = $3
        WHERE id = $1`,
      [id, delaySeconds, reason],
    );
  },

  /** المحسوم الأقدم من المدّة يُحذف — الصندوق ليس أرشيفاً. */
  async purgeFinished(db: pg.Pool | pg.PoolClient, olderThanDays: number): Promise<number> {
    const { rowCount } = await db.query(
      `DELETE FROM push_outbox WHERE status <> 'pending' AND created_at < now() - make_interval(days => $1)`,
      [olderThanDays],
    );
    return rowCount ?? 0;
  },

  /**
   * حدثٌ إداري — صفٌّ لكل مسؤولٍ يستحقّه، في معاملة الحدث.
   *
   * [SECURITY] المستحقّ: مسؤولٌ فعّال، أعلى أو يملك قسم الحدث، لم يُطفئ الحدث
   * في تفضيلاته، وله جهازٌ مسجَّل في `admin_push_devices`. لا صفّ لمن لا جهاز
   * له — فلا يتراكم الصندوق بما لا يُرسَل أبداً. والزبون لا يطابق شرط الدور.
   */
  async enqueueAdminEvent(
    db: pg.Pool | pg.PoolClient,
    input: {
      event: AdminPushEvent;
      title: string;
      body: string;
      data: Record<string, string>;
    },
  ): Promise<number> {
    const section = ADMIN_PUSH_EVENTS[input.event];
    const { rowCount } = await db.query(
      `INSERT INTO push_outbox (audience, user_id, event_key, title, body, data)
       SELECT 'admin', u.id, $1, $2, $3, $4::jsonb
         FROM users u
        WHERE u.role = 'admin'
          AND u.is_active
          AND (u.is_super_admin OR $5 = ANY(u.admin_permissions))
          AND COALESCE((SELECT p.enabled FROM admin_notification_prefs p
                         WHERE p.user_id = u.id AND p.key = $1), TRUE)
          AND EXISTS (SELECT 1 FROM admin_push_devices d WHERE d.user_id = u.id AND d.is_active)`,
      [input.event, input.title, input.body, JSON.stringify({ ...input.data, event: input.event }), section],
    );
    return rowCount ?? 0;
  },

  /** رموز أجهزة الزبون — من `device_tokens` وحده. */
  async customerTokens(db: pg.Pool | pg.PoolClient, userId: string): Promise<string[]> {
    const { rows } = await db.query<{ token: string }>(
      'SELECT token FROM device_tokens WHERE user_id = $1 AND is_active',
      [userId],
    );
    return rows.map((row) => row.token);
  },

  /** رموز أجهزة المسؤول — من `admin_push_devices` وحده، ولمسؤولٍ فعّال فقط. */
  async adminTokens(db: pg.Pool | pg.PoolClient, userId: string): Promise<string[]> {
    const { rows } = await db.query<{ token: string }>(
      `SELECT d.token FROM admin_push_devices d
         JOIN users u ON u.id = d.user_id AND u.role = 'admin' AND u.is_active
        WHERE d.user_id = $1 AND d.is_active`,
      [userId],
    );
    return rows.map((row) => row.token);
  },

  async deactivateCustomerTokens(db: pg.Pool | pg.PoolClient, tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const { rowCount } = await db.query(
      'UPDATE device_tokens SET is_active = FALSE WHERE token = ANY($1::text[]) AND is_active',
      [tokens],
    );
    return rowCount ?? 0;
  },

  async deactivateAdminTokens(db: pg.Pool | pg.PoolClient, tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const { rowCount } = await db.query(
      'UPDATE admin_push_devices SET is_active = FALSE WHERE token = ANY($1::text[]) AND is_active',
      [tokens],
    );
    return rowCount ?? 0;
  },
};
