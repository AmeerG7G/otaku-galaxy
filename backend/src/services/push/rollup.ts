import type pg from 'pg';

/**
 * تلخيص صندوق الدفع في الإحصاء اليومي الدائم — قبل أن يُسمح بتطهيره.
 *
 * [CRITICAL]
 *   • يومٌ (بتقويم المتجر) يُلخَّص **مرة واحدة**: حين لا يبقى من صفوفه معلَّق، وبعد
 *     انقضائه بيومٍ كامل. صفوفه تُقفل وتُعلَّم `rolled_up_at` في معاملة الإدراج نفسها،
 *     وصفّ اليوم في `notification_daily_stats` لا يتغيّر بعدها (زناد ٠٧٥) —
 *     فلا عدٌّ مزدوج ولو تكرّر الدور أو تزامن.
 *   • الإدراج عاديّ لا `ON CONFLICT DO NOTHING`: تعارضٌ يعني خللاً، فيفشل اليوم
 *     ويُسجَّل بدل أن تُبتلع أعداده بصمت.
 *   • «مقبولة» = `status = 'sent'` = قبلتها FCM لجهازٍ واحدٍ على الأقل — لا «وصلت».
 *   • الحملة تُجمَّد عدّاداتها حين تُلخَّص كل صفوفها.
 */

type Client = pg.PoolClient;

export interface RollupSummary {
  days: string[];
  rows: number;
  campaignsFrozen: number;
}

/** الأيام المؤهَّلة: قبل «أمس» بتقويم المتجر، وكل صفوفها محسومة وغير ملخَّصة. */
async function eligibleDays(client: Client, tz: string, today: string): Promise<string[]> {
  const { rows } = await client.query<{ day: string }>(
    `SELECT DISTINCT ((o.created_at AT TIME ZONE $1)::date)::text AS day
       FROM push_outbox o
      WHERE o.rolled_up_at IS NULL
        AND (o.created_at AT TIME ZONE $1)::date < ($2::date - 1)
        AND NOT EXISTS (
          SELECT 1 FROM push_outbox p
           WHERE p.status = 'pending'
             AND (p.created_at AT TIME ZONE $1)::date = (o.created_at AT TIME ZONE $1)::date
        )
      ORDER BY 1`,
    [tz, today],
  );
  return rows.map((row) => row.day);
}

async function rollUpDay(client: Client, day: string, tz: string): Promise<number> {
  const bounds = [`${day}`, tz];
  // قفل صفوف اليوم — دورٌ متزامن ينتظر ثم لا يجد غير الملخَّص.
  const locked = await client.query<{ pending: boolean }>(
    `SELECT status = 'pending' AS pending FROM push_outbox
      WHERE rolled_up_at IS NULL
        AND created_at >= ($1::date)::timestamp AT TIME ZONE $2
        AND created_at < ($1::date + 1)::timestamp AT TIME ZONE $2
      FOR UPDATE`,
    bounds,
  );
  if (locked.rows.length === 0 || locked.rows.some((row) => row.pending)) return 0;

  await client.query(
    `INSERT INTO notification_daily_stats (
       stat_date, audience, notif_type, campaign_id, created, accepted, failed,
       skipped_not_configured, skipped_pref, skipped_no_devices,
       devices_accepted, devices_invalid, devices_transient
     )
     SELECT $1::date, audience, COALESCE(event_key, data ->> 'type'), campaign_id,
            count(*),
            count(*) FILTER (WHERE status = 'sent'),
            count(*) FILTER (WHERE status = 'failed'),
            count(*) FILTER (WHERE status = 'skipped' AND last_error = 'push_not_configured'),
            count(*) FILTER (WHERE status = 'skipped' AND last_error = 'pref_disabled'),
            count(*) FILTER (WHERE status = 'skipped' AND last_error = 'no_devices'),
            COALESCE(sum(devices_accepted), 0), COALESCE(sum(devices_invalid), 0), COALESCE(sum(devices_transient), 0)
       FROM push_outbox
      WHERE rolled_up_at IS NULL
        AND created_at >= ($1::date)::timestamp AT TIME ZONE $2
        AND created_at < ($1::date + 1)::timestamp AT TIME ZONE $2
      GROUP BY audience, COALESCE(event_key, data ->> 'type'), campaign_id`,
    bounds,
  );
  const marked = await client.query(
    `UPDATE push_outbox SET rolled_up_at = now()
      WHERE rolled_up_at IS NULL
        AND created_at >= ($1::date)::timestamp AT TIME ZONE $2
        AND created_at < ($1::date + 1)::timestamp AT TIME ZONE $2`,
    bounds,
  );
  return marked.rowCount ?? 0;
}

/** تجميد عدّادات الحملات التي لُخِّصت كل صفوفها (ولا تتغيّر بعدها — زناد ٠٧٤). */
async function freezeCampaigns(client: Client, tz: string, today: string): Promise<number> {
  const { rowCount } = await client.query(
    `WITH ready AS (
       SELECT c.id FROM notification_campaigns c
        WHERE c.frozen_at IS NULL
          AND (c.created_at AT TIME ZONE $1)::date < ($2::date - 1)
          AND NOT EXISTS (SELECT 1 FROM push_outbox o WHERE o.campaign_id = c.id AND o.rolled_up_at IS NULL)
        FOR UPDATE OF c
     ), totals AS (
       SELECT r.id,
              COALESCE(sum(s.accepted), 0) AS accepted, COALESCE(sum(s.failed), 0) AS failed,
              COALESCE(sum(s.skipped_not_configured), 0) AS skipped_not_configured,
              COALESCE(sum(s.skipped_pref), 0) AS skipped_pref, COALESCE(sum(s.skipped_no_devices), 0) AS skipped_no_devices,
              COALESCE(sum(s.devices_accepted), 0) AS devices_accepted, COALESCE(sum(s.devices_invalid), 0) AS devices_invalid,
              COALESCE(sum(s.devices_transient), 0) AS devices_transient
         FROM ready r LEFT JOIN notification_daily_stats s ON s.campaign_id = r.id
        GROUP BY r.id
     )
     UPDATE notification_campaigns c
        SET accepted = t.accepted, failed = t.failed, skipped_not_configured = t.skipped_not_configured,
            skipped_pref = t.skipped_pref, skipped_no_devices = t.skipped_no_devices,
            devices_accepted = t.devices_accepted, devices_invalid = t.devices_invalid,
            devices_transient = t.devices_transient, frozen_at = now()
       FROM totals t
      WHERE c.id = t.id`,
    [tz, today],
  );
  return rowCount ?? 0;
}

/**
 * الدور: كل يومٍ مؤهَّل في معاملته، ثم تجميد الحملات. `transactional: false`
 * للاختبارات (داخل معاملة المستدعي التي تُلغى).
 */
export async function rollUpPushOutbox(
  client: Client,
  options: { tz: string; today: string; transactional?: boolean },
): Promise<RollupSummary> {
  const transactional = options.transactional ?? true;
  const summary: RollupSummary = { days: [], rows: 0, campaignsFrozen: 0 };
  for (const day of await eligibleDays(client, options.tz, options.today)) {
    if (transactional) await client.query('BEGIN');
    try {
      const rows = await rollUpDay(client, day, options.tz);
      if (transactional) await client.query('COMMIT');
      if (rows > 0) {
        summary.days.push(day);
        summary.rows += rows;
      }
    } catch (error) {
      if (transactional) await client.query('ROLLBACK');
      if (!transactional) throw error;
      console.error('[push-rollup] day failed — outbox rows kept, retried next run', { day, error });
    }
  }
  summary.campaignsFrozen = await freezeCampaigns(client, options.tz, options.today);
  return summary;
}
