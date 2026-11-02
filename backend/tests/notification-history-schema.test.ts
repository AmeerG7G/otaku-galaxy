import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { purgeTestUsers, registerAndLogin } from './helpers.js';

/**
 * بنية تاريخ الإشعارات الدائم (الهجرتان ٠٧٤ و٠٧٥).
 *
 * [CRITICAL] الحملة سجلٌّ تاريخي لا يُحذف ولا تتغيّر هويته، والإحصاء اليومي
 * الملخَّص لا يتغيّر ولا يُحذف. لو سقط أحد هذه الحرّاس لأمكن إعادة كتابة تاريخ
 * الإشعارات بصمت.
 */

let customerId: string;

async function insertCampaign(overrides: Record<string, unknown> = {}) {
  const values = {
    kind: 'broadcast',
    title: 'حملة اختبار',
    audience_type: 'all',
    recipients: 1,
    idempotency_key: randomUUID(),
    ...overrides,
  };
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO notification_campaigns (kind, title, audience_type, recipients, idempotency_key)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [values.kind, values.title, values.audience_type, values.recipients, values.idempotency_key],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  customerId = (await registerAndLogin()).userId;
});

afterAll(async () => {
  await purgeTestUsers();
});

describe('الحملة — هوية دائمة', () => {
  it('[CRITICAL] مفتاح عدم التكرار فريد', async () => {
    const key = randomUUID();
    await insertCampaign({ idempotency_key: key });
    await expect(insertCampaign({ idempotency_key: key })).rejects.toMatchObject({ code: '23505' });
  });

  it('[CRITICAL] لا تُحذف، ولا تتغيّر هويتها', async () => {
    const id = await insertCampaign();
    await expect(db.query('DELETE FROM notification_campaigns WHERE id = $1', [id])).rejects.toThrow(
      /permanent history/,
    );
    await expect(
      db.query("UPDATE notification_campaigns SET title = 'معدَّل' WHERE id = $1", [id]),
    ).rejects.toThrow(/immutable/);
  });

  it('[CRITICAL] العدّادات المجمَّدة لا تتغيّر', async () => {
    const id = await insertCampaign();
    await db.query(
      `UPDATE notification_campaigns
          SET accepted = 1, failed = 0, skipped_not_configured = 0, skipped_pref = 0,
              skipped_no_devices = 0, devices_accepted = 1, devices_invalid = 0,
              devices_transient = 0, frozen_at = now()
        WHERE id = $1`,
      [id],
    );
    await expect(
      db.query('UPDATE notification_campaigns SET accepted = 9 WHERE id = $1', [id]),
    ).rejects.toThrow(/frozen/);
  });

  it('تجميدٌ ناقص العدّادات يرفضه القيد', async () => {
    const id = await insertCampaign();
    await expect(
      db.query('UPDATE notification_campaigns SET frozen_at = now() WHERE id = $1', [id]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('الزناد ينسخ هوية الحملة إلى صندوق الدفع', async () => {
    const id = await insertCampaign();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, title, campaign_id)
       VALUES ($1, 'promotion', 'حملة', $2) RETURNING id`,
      [customerId, id],
    );
    const outbox = await db.query<{ campaign_id: string }>(
      'SELECT campaign_id FROM push_outbox WHERE notification_id = $1',
      [rows[0]!.id],
    );
    expect(outbox.rows[0]!.campaign_id).toBe(id);
  });

  it('صفّ صندوقٍ معلَّق لا يُعلَّم ملخَّصاً', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, title) VALUES ($1, 'promotion', 'معلّق') RETURNING id`,
      [customerId],
    );
    await expect(
      db.query('UPDATE push_outbox SET rolled_up_at = now() WHERE notification_id = $1', [rows[0]!.id]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('الإحصاء اليومي — دائم وثابت', () => {
  it('[CRITICAL] الصفّ الملخَّص لا يُعدَّل ولا يُحذف', async () => {
    const day = '2001-01-01';
    await db.query(
      `INSERT INTO notification_daily_stats (stat_date, audience, notif_type, created, accepted)
       VALUES ($1, 'customer', 'promotion', 2, 2)
       ON CONFLICT (stat_date, audience, notif_type,
                    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::UUID)) DO NOTHING`,
      [day],
    );
    await expect(
      db.query("UPDATE notification_daily_stats SET accepted = 1 WHERE stat_date = $1", [day]),
    ).rejects.toThrow(/permanent and immutable/);
    await expect(
      db.query('DELETE FROM notification_daily_stats WHERE stat_date = $1', [day]),
    ).rejects.toThrow(/permanent and immutable/);
  });

  it('النتائج تساوي المُنشأ دائماً', async () => {
    await expect(
      db.query(
        `INSERT INTO notification_daily_stats (stat_date, audience, notif_type, created, accepted)
         VALUES ('2001-01-02', 'customer', 'promotion', 3, 1)`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
