import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { processAnalytics } from '../src/jobs/analyticsJob.js';
import { percentChange, absoluteChange } from '../src/domain/analyticsDefinitions.js';
import { addDays, addMonths, daysBetween, isCalendarDate, monthEnd, monthsBetween } from '../src/services/analytics/calendar.js';

/**
 * حرّاس التحليلات على مستوى المصدر والمهمّة.
 *
 * [CRITICAL] (١) لا استعلام تحليلات يقرأ `orders`/`users` متجاوزاً عرضَي النطاق
 * (D2)؛ (٢) لا حذف لملخّصٍ خارج إعادة حساب يومٍ/شهرٍ مفتوح، ولا حذف للإحصاء
 * اليومي للإشعارات إطلاقاً؛ (٣) لا شيء في التحليلات يقرأ سجلّ التكلفة الحالي —
 * الربح التاريخي من لقطات البنود وحدها (D1).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function analyticsSources(): Promise<Array<{ file: string; text: string }>> {
  const files = [
    ...(await readdir(path.join(ROOT, 'src/services/analytics'))).map((f) => `src/services/analytics/${f}`),
    'src/jobs/analyticsJob.ts',
    'scripts/analyticsRebuild.ts',
  ];
  const extra = ['src/repositories/analyticsRepo.ts'];
  for (const file of extra) {
    try {
      await readFile(path.join(ROOT, file));
      files.push(file);
    } catch {
      // يُضاف حين يوجد.
    }
  }
  return Promise.all(files.map(async (file) => ({ file, text: await readFile(path.join(ROOT, file), 'utf8') })));
}

describe('حرّاس المصدر', () => {
  it('[CRITICAL] لا قراءة مباشرة لـorders/users — العرضان وحدهما (والمستبعَد عبر analytics_order_scope)', async () => {
    const offenders: string[] = [];
    for (const { file, text } of await analyticsSources()) {
      for (const match of text.matchAll(/\b(FROM|JOIN)\s+(orders|users)\b[^\n]*(\n[^\n]*)?/g)) {
        const snippet = match[0];
        if (/^FROM orders o\s*\n\s*JOIN analytics_order_scope s ON s\.order_id = o\.id/.test(snippet)) continue;
        offenders.push(`${file}: ${snippet.split('\n')[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('[CRITICAL] الحذف من الملخّصات مقصورٌ على إعادة حساب يومٍ أو شهر', async () => {
    const offenders: string[] = [];
    for (const { file, text } of await analyticsSources()) {
      for (const match of text.matchAll(/DELETE FROM (\w+)[^'`]*/g)) {
        const [statement, table] = match;
        if (table === 'user_daily_activity' || table === 'search_daily_terms') continue; // تطهير الخام فقط
        if (table!.startsWith('notification_daily_stats')) offenders.push(`${file}: ${statement}`);
        else if (!/WHERE (stat_date|month) = \$1::date/.test(statement)) offenders.push(`${file}: ${statement}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('[CRITICAL] التحليلات لا تقرأ سجلّ التكلفة الحالي (product_cost_entries)', async () => {
    for (const { file, text } of await analyticsSources()) {
      expect(text, file).not.toMatch(/product_cost_entries/);
    }
  });
});

describe('التقويم والمقارنة', () => {
  it('حساب الأيام والأشهر نصّي ولا يتأثّر بالمنطقة', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(monthEnd('2024-02-10')).toBe('2024-02-29');
    expect(monthEnd('2026-09-30')).toBe('2026-09-30');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(daysBetween('2024-02-27', '2024-03-01')).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']);
    expect(monthsBetween('2026-11-15', '2027-02-01')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2024-02-29')).toBe(true);
  });

  it('[CRITICAL] التغيّر النسبي لا يُحسب من أساسٍ صفري', () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(null, 100)).toBeNull();
    expect(absoluteChange(150, 100)).toBe(50);
    expect(absoluteChange(5, null)).toBeNull();
  });
});

describe('دور المهمّة كاملاً', () => {
  it('[CRITICAL] يضمن الأشهر، يحسبها، يغلق المنقضي بعد المهلة، ويلتقط المخزون مرة واحدة', async () => {
    const client: pg.PoolClient = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [user] } = await client.query<{ id: string }>(
        `INSERT INTO users (username, phone, password_hash, gender, phone_verified_at)
         VALUES ('مهمة', '+9647719999011', 'x', 'female', '2024-02-01T00:00:00Z') RETURNING id`,
      );
      const { rows: [gov] } = await client.query<{ id: string }>('SELECT id FROM governorates LIMIT 1');
      await client.query(
        `INSERT INTO orders (number, user_id, governorate_id, province, full_address, phone, products_total,
                             delivery_fee, discount, total, status, created_at, delivered_at)
         VALUES ('JOB-1', $1, $2, 'بغداد', 'عنوان', '+9647700000000', 4000, 1000, 0, 5000, 'COMPLETED',
                 '2024-02-10T05:00:00Z', '2024-02-11T05:00:00Z')`,
        [user!.id, gov!.id],
      );
      const summary = await processAnalytics(client, { today: '2024-03-09', transactional: false });
      expect(summary.months).toEqual(
        expect.arrayContaining([
          { month: '2024-02-01', action: 'closed' },
          { month: '2024-03-01', action: 'recomputed' },
        ]),
      );
      const feb = await client.query<{ status: string; revenue: string }>(
        `SELECT p.status, (SELECT sum(sales_revenue)::text FROM analytics_daily_sales
                            WHERE stat_date >= '2024-02-01' AND stat_date < '2024-03-01') AS revenue
           FROM analytics_periods p WHERE p.month = '2024-02-01'`,
      );
      // ٤٠٠٠ لا ٥٠٠٠: رسوم التوصيل ليست إيراداً.
      expect(feb.rows[0]).toEqual({ status: 'closed', revenue: '4000.00' });

      expect(summary.inventorySnapshotRows).toBeGreaterThan(0);
      const again = await processAnalytics(client, { today: '2024-03-09', transactional: false });
      expect(again.inventorySnapshotRows).toBe(0);
      expect(again.months.find((m) => m.month === '2024-02-01')).toBeUndefined();
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
