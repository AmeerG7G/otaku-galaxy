import type pg from 'pg';

/**
 * حملات الإشعارات (الهجرة ٠٧٤) — هوية دائمة لكل بثٍّ أو إشعارٍ يدوي.
 *
 * [CRITICAL] المصطلحات: «مقبولة لدى FCM» = قبلتها FCM لجهازٍ واحد على الأقل؛
 * «قُرئت داخل التطبيق» = `read_at`؛ «فُتحت بالنقر» = `opened_at`. لا «وصلت».
 * والقائمة لا تحمل أسماء المستلمين ولا أرقامهم أبداً — أعدادٌ ووصفٌ للجمهور فقط.
 *
 * أعداد الدفع لحملةٍ غير مجمَّدة = صفوف الصندوق غير الملخَّصة + الإحصاء الملخَّص
 * لها (لا يقع صفٌّ في المصدرين معاً)؛ بعد التجميد تُقرأ من الحملة نفسها.
 */

export type CampaignKind = 'broadcast' | 'manual';

export interface CampaignInsert {
  kind: CampaignKind;
  title: string;
  body: string;
  audienceType: 'all' | 'users' | 'segment';
  audienceSegment: string | null;
  audienceWindowDays: number | null;
  audienceUserCount: number | null;
  recipients: number;
  createdBy: string;
  idempotencyKey: string;
}

export interface CampaignView {
  id: string;
  kind: CampaignKind;
  title: string;
  body: string;
  audience: { type: string; segment: string | null; windowDays: number | null; userCount: number | null };
  recipients: number;
  createdAt: string;
  createdByName: string | null;
  frozen: boolean;
  push: {
    pending: number;
    acceptedByFcm: number;
    failed: number;
    skippedNotConfigured: number;
    skippedPreference: number;
    skippedNoDevices: number;
    devicesAcceptedByFcm: number;
    devicesInvalid: number;
  };
  readInApp: number;
  openedFromPush: number;
}

const CAMPAIGN_SELECT = `
  SELECT c.id, c.kind, c.title, c.body, c.audience_type, c.audience_segment, c.audience_window_days,
         c.audience_user_count, c.recipients, c.created_at, u.username AS created_by_name,
         c.frozen_at IS NOT NULL AS frozen,
         COALESCE(live.pending, 0) AS pending,
         CASE WHEN c.frozen_at IS NOT NULL THEN c.accepted ELSE COALESCE(live.accepted, 0) + COALESCE(rolled.accepted, 0) END AS accepted,
         CASE WHEN c.frozen_at IS NOT NULL THEN c.failed ELSE COALESCE(live.failed, 0) + COALESCE(rolled.failed, 0) END AS failed,
         CASE WHEN c.frozen_at IS NOT NULL THEN c.skipped_not_configured
              ELSE COALESCE(live.skipped_not_configured, 0) + COALESCE(rolled.skipped_not_configured, 0) END AS skipped_not_configured,
         CASE WHEN c.frozen_at IS NOT NULL THEN c.skipped_pref
              ELSE COALESCE(live.skipped_pref, 0) + COALESCE(rolled.skipped_pref, 0) END AS skipped_pref,
         CASE WHEN c.frozen_at IS NOT NULL THEN c.skipped_no_devices
              ELSE COALESCE(live.skipped_no_devices, 0) + COALESCE(rolled.skipped_no_devices, 0) END AS skipped_no_devices,
         CASE WHEN c.frozen_at IS NOT NULL THEN c.devices_accepted
              ELSE COALESCE(live.devices_accepted, 0) + COALESCE(rolled.devices_accepted, 0) END AS devices_accepted,
         CASE WHEN c.frozen_at IS NOT NULL THEN c.devices_invalid
              ELSE COALESCE(live.devices_invalid, 0) + COALESCE(rolled.devices_invalid, 0) END AS devices_invalid,
         COALESCE(engagement.read_in_app, 0) AS read_in_app,
         COALESCE(engagement.opened, 0) AS opened
    FROM notification_campaigns c
    LEFT JOIN users u ON u.id = c.created_by
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE o.status = 'pending') AS pending,
             count(*) FILTER (WHERE o.status = 'sent') AS accepted,
             count(*) FILTER (WHERE o.status = 'failed') AS failed,
             count(*) FILTER (WHERE o.status = 'skipped' AND o.last_error = 'push_not_configured') AS skipped_not_configured,
             count(*) FILTER (WHERE o.status = 'skipped' AND o.last_error = 'pref_disabled') AS skipped_pref,
             count(*) FILTER (WHERE o.status = 'skipped' AND o.last_error = 'no_devices') AS skipped_no_devices,
             COALESCE(sum(o.devices_accepted), 0) AS devices_accepted,
             COALESCE(sum(o.devices_invalid), 0) AS devices_invalid
        FROM push_outbox o
       WHERE o.campaign_id = c.id AND o.rolled_up_at IS NULL
    ) live ON TRUE
    LEFT JOIN LATERAL (
      SELECT sum(s.accepted) AS accepted, sum(s.failed) AS failed,
             sum(s.skipped_not_configured) AS skipped_not_configured, sum(s.skipped_pref) AS skipped_pref,
             sum(s.skipped_no_devices) AS skipped_no_devices, sum(s.devices_accepted) AS devices_accepted,
             sum(s.devices_invalid) AS devices_invalid
        FROM notification_daily_stats s
       WHERE s.campaign_id = c.id
    ) rolled ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE n.read_at IS NOT NULL) AS read_in_app,
             count(*) FILTER (WHERE n.opened_at IS NOT NULL) AS opened
        FROM notifications n
       WHERE n.campaign_id = c.id
    ) engagement ON TRUE`;

interface CampaignRow {
  id: string;
  kind: CampaignKind;
  title: string;
  body: string;
  audience_type: string;
  audience_segment: string | null;
  audience_window_days: number | null;
  audience_user_count: number | null;
  recipients: number;
  created_at: Date;
  created_by_name: string | null;
  frozen: boolean;
  [key: string]: unknown;
}

function toView(row: CampaignRow): CampaignView {
  const n = (key: string) => Number(row[key] ?? 0);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    audience: {
      type: row.audience_type,
      segment: row.audience_segment,
      windowDays: row.audience_window_days,
      userCount: row.audience_user_count,
    },
    recipients: row.recipients,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    frozen: row.frozen,
    push: {
      pending: n('pending'),
      acceptedByFcm: n('accepted'),
      failed: n('failed'),
      skippedNotConfigured: n('skipped_not_configured'),
      skippedPreference: n('skipped_pref'),
      skippedNoDevices: n('skipped_no_devices'),
      devicesAcceptedByFcm: n('devices_accepted'),
      devicesInvalid: n('devices_invalid'),
    },
    readInApp: n('read_in_app'),
    openedFromPush: n('opened'),
  };
}

export const notificationCampaignsRepo = {
  /**
   * إدراج الحملة — أو لا شيء إن سبق المفتاحُ نفسه. تعارضٌ متزامن ينتظر التزام
   * الأول (فهرس فريد) ثم يعيد `null`، فيقرأ المستدعي الحملة الملتزمة.
   */
  async insert(db: pg.Pool | pg.PoolClient, input: CampaignInsert): Promise<string | null> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO notification_campaigns (kind, title, body, audience_type, audience_segment, audience_window_days,
                                           audience_user_count, recipients, created_by, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.kind,
        input.title,
        input.body,
        input.audienceType,
        input.audienceSegment,
        input.audienceWindowDays,
        input.audienceUserCount,
        input.recipients,
        input.createdBy,
        input.idempotencyKey,
      ],
    );
    return rows[0]?.id ?? null;
  },

  async findByKey(db: pg.Pool | pg.PoolClient, idempotencyKey: string) {
    const { rows } = await db.query<{ id: string; kind: CampaignKind; recipients: number }>(
      'SELECT id, kind, recipients FROM notification_campaigns WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    return rows[0] ?? null;
  },

  async list(db: pg.Pool | pg.PoolClient, options: { page: number; limit: number; kind?: CampaignKind }) {
    const offset = (options.page - 1) * options.limit;
    const [items, total] = await Promise.all([
      db.query<CampaignRow>(
        `${CAMPAIGN_SELECT}
          WHERE ($1::text IS NULL OR c.kind = $1)
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT $2 OFFSET $3`,
        [options.kind ?? null, options.limit, offset],
      ),
      db.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM notification_campaigns WHERE ($1::text IS NULL OR kind = $1)',
        [options.kind ?? null],
      ),
    ]);
    return { items: items.rows.map(toView), total: Number(total.rows[0]?.n ?? 0), page: options.page, limit: options.limit };
  },

  async detail(db: pg.Pool | pg.PoolClient, id: string): Promise<CampaignView | null> {
    const { rows } = await db.query<CampaignRow>(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [id]);
    return rows[0] ? toView(rows[0]) : null;
  },
};
