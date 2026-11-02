import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { pushOutboxRepo } from '../src/repositories/pushOutboxRepo.js';
import { rollUpPushOutbox } from '../src/services/push/rollup.js';
import { purgeTestUsers, registerAndLogin } from './helpers.js';

/**
 * التاريخ الدائم للدفع: يُلخَّص قبل التطهير، ولا يُعدّ مرتين.
 *
 * [CRITICAL] كان التطهير يمحو كل صفٍّ محسوم أقدم من ٣٠ يوماً — ومعه تاريخ الدفع
 * كله. الآن: يومٌ لا معلَّق فيه يُلخَّص مرة واحدة، ثم وحده يجوز حذفه.
 * كل اختبار في معاملةٍ تُلغى (صفوف الإحصاء دائمة لا تُحذف).
 */

const TZ = config.storeTimezone;
let userId: string;

async function inTx(fn: (client: pg.PoolClient) => Promise<void>) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** صفّ صندوقٍ لإشعارٍ حقيقي، مؤرَّخٌ ومحسومٌ كما يطلب الاختبار. */
async function outboxRow(
  client: pg.PoolClient,
  input: { at: string; status: string; lastError?: string | null; devices?: number; campaignId?: string | null },
) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO notifications (user_id, type, title, campaign_id) VALUES ($1, 'promotion', 'تلخيص', $2) RETURNING id`,
    [userId, input.campaignId ?? null],
  );
  const updated = await client.query<{ id: string }>(
    `UPDATE push_outbox SET created_at = $2, status = $3, last_error = $4, devices_accepted = $5
      WHERE notification_id = $1 RETURNING id::text`,
    [rows[0]!.id, input.at, input.status, input.lastError ?? null, input.devices ?? 0],
  );
  return updated.rows[0]!.id;
}

async function stats(client: pg.PoolClient, day: string) {
  const { rows } = await client.query<Record<string, number>>(
    `SELECT created, accepted, failed, skipped_not_configured, skipped_pref, skipped_no_devices, devices_accepted
       FROM notification_daily_stats WHERE stat_date = $1::date AND notif_type = 'promotion' AND campaign_id IS NULL`,
    [day],
  );
  return rows[0];
}

beforeAll(async () => {
  userId = (await registerAndLogin()).userId;
});

afterAll(async () => {
  await purgeTestUsers();
});

describe('التلخيص اليومي', () => {
  it('[CRITICAL] يومٌ محسوم يُلخَّص مرة واحدة بأعداده، ويومٌ فيه معلَّق ينتظر', async () => {
    await inTx(async (client) => {
      await outboxRow(client, { at: '2001-03-05T10:00:00Z', status: 'sent', devices: 2 });
      await outboxRow(client, { at: '2001-03-05T11:00:00Z', status: 'failed', lastError: 'all_tokens_invalid' });
      await outboxRow(client, { at: '2001-03-05T12:00:00Z', status: 'skipped', lastError: 'pref_disabled' });
      await outboxRow(client, { at: '2001-03-05T13:00:00Z', status: 'skipped', lastError: 'push_not_configured' });
      const pending = await outboxRow(client, { at: '2001-03-06T10:00:00Z', status: 'pending' });

      const first = await rollUpPushOutbox(client, { tz: TZ, today: '2001-03-10', transactional: false });
      expect(first.days).toContain('2001-03-05');
      expect(first.days).not.toContain('2001-03-06');
      expect(await stats(client, '2001-03-05')).toEqual({
        created: 4, accepted: 1, failed: 1, skipped_not_configured: 1, skipped_pref: 1, skipped_no_devices: 0, devices_accepted: 2,
      });
      expect(await stats(client, '2001-03-06')).toBeUndefined();

      // تكرار الدور لا يضاعف شيئاً.
      const again = await rollUpPushOutbox(client, { tz: TZ, today: '2001-03-10', transactional: false });
      expect(again.days).not.toContain('2001-03-05');
      expect((await stats(client, '2001-03-05'))!.created).toBe(4);

      // حين يُحسم المعلَّق يُلخَّص يومه.
      await client.query("UPDATE push_outbox SET status = 'skipped', last_error = 'no_devices' WHERE id = $1", [pending]);
      await rollUpPushOutbox(client, { tz: TZ, today: '2001-03-10', transactional: false });
      expect(await stats(client, '2001-03-06')).toMatchObject({ created: 1, skipped_no_devices: 1 });
    });
  });

  it('[CRITICAL] حدّ اليوم بتوقيت بغداد، ولا يُلخَّص «أمس» ولا اليوم', async () => {
    await inTx(async (client) => {
      // ٢٠٢٣ لا ٢٠٠١: العراق طبّق التوقيت الصيفي حتى ٢٠٠٧ (UTC+4 من ١ أبريل ٢٠٠١)،
      // فالحدّ يتبع المنطقة الزمنية الحقيقية لا إزاحةً ثابتة — وهذا هو المقصود.
      await outboxRow(client, { at: '2023-04-01T20:59:59Z', status: 'sent' }); // ٢٣:٥٩:٥٩ بغداد — ١ أبريل
      await outboxRow(client, { at: '2023-04-01T21:00:00Z', status: 'sent' }); // ٠٠:٠٠ بغداد — ٢ أبريل
      const summary = await rollUpPushOutbox(client, { tz: TZ, today: '2023-04-03', transactional: false });
      expect(summary.days).toContain('2023-04-01');
      expect(summary.days).not.toContain('2023-04-02');
      expect((await stats(client, '2023-04-01'))!.created).toBe(1);
    });
  });

  it('الحملة تُجمَّد عدّاداتها حين تُلخَّص كل صفوفها', async () => {
    await inTx(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO notification_campaigns (kind, title, audience_type, recipients, idempotency_key, created_at)
         VALUES ('broadcast', 'حملة تلخيص', 'all', 2, $1, '2001-05-01T09:00:00Z') RETURNING id`,
        [randomUUID()],
      );
      const campaignId = rows[0]!.id;
      await outboxRow(client, { at: '2001-05-01T09:00:00Z', status: 'sent', devices: 1, campaignId });
      await outboxRow(client, { at: '2001-05-01T09:00:00Z', status: 'skipped', lastError: 'no_devices', campaignId });
      const summary = await rollUpPushOutbox(client, { tz: TZ, today: '2001-05-05', transactional: false });
      expect(summary.campaignsFrozen).toBeGreaterThanOrEqual(1);
      const campaign = await client.query<Record<string, number | null>>(
        `SELECT accepted, failed, skipped_no_devices, devices_accepted, (frozen_at IS NOT NULL)::int AS frozen
           FROM notification_campaigns WHERE id = $1`,
        [campaignId],
      );
      expect(campaign.rows[0]).toEqual({ accepted: 1, failed: 0, skipped_no_devices: 1, devices_accepted: 1, frozen: 1 });
    });
  });
});

describe('التطهير', () => {
  it('[CRITICAL] يحذف الملخَّص القديم وحده — المحسوم غير الملخَّص يبقى مهما قدُم', async () => {
    await inTx(async (client) => {
      const rolled = await outboxRow(client, { at: '2001-06-01T10:00:00Z', status: 'sent' });
      const unrolled = await outboxRow(client, { at: '2001-06-02T10:00:00Z', status: 'sent' });
      await client.query('UPDATE push_outbox SET rolled_up_at = now() WHERE id = $1', [rolled]);
      await pushOutboxRepo.purgeFinished(client, 30);
      const { rows } = await client.query<{ id: string }>(
        'SELECT id::text FROM push_outbox WHERE id = ANY($1::bigint[])',
        [[rolled, unrolled]],
      );
      expect(rows.map((r) => r.id)).toEqual([unrolled]);
    });
  });
});
