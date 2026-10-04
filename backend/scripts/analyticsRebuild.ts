import { realpathSync } from 'node:fs';
import { userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../src/config/index.js';
import { ANALYTICS_DEFINITIONS_VERSION } from '../src/domain/analyticsDefinitions.js';
import { analyticsAggregator } from '../src/services/analytics/aggregator.js';
import { addDays, daysBetween, monthEnd, monthsBetween } from '../src/services/analytics/calendar.js';

/**
 * إعادة بناء التحليلات — الطريق الوحيد لتغيير شهرٍ مُغلق، وسجلٌّ لكل تشغيل.
 *
 *   npm run analytics:rebuild -- --from 2026-07 --to 2026-09 --reason "…"
 *   npm run analytics:rebuild -- --from 2026-07 --to 2026-07 --include-closed --reason "تصحيح تعريف"
 *
 * [CRITICAL]
 *   • شهرٌ مُغلق لا يُعاد بناؤه إلا مع `--include-closed` وسببٍ مكتوب.
 *   • كل شهرٍ معاملةٌ تضبط `analytics.rebuild = on` محلياً (الزناد يسمح بها
 *     وحدها)، وتسجّل ملخّص «قبل» و«بعد» في `analytics_rebuild_log` (إلحاقي).
 *   • الحالة لا تتغيّر: المُغلق يبقى مُغلقاً، ولا يُعاد فتح شهر.
 *   • إعادة البناء **تقرأ** المصادر واللقطات ولا تكتبها: لقطات التكلفة والدور
 *     والقسم لا تُمسّ أبداً، والتكلفة الحالية لا تُقرأ لحساب ربحٍ سابق.
 *
 * الملف مكتبةٌ وسطر أوامر معاً (كـ`migrate.ts`): `main()` لا يعمل إلا حين يكون
 * هو `argv[1]`، فاستيراده من الاختبارات لا يتّصل بشيء.
 */

export interface RebuildOptions {
  from: string;
  to: string;
  includeClosed: boolean;
  reason: string;
  actor: string;
}

async function monthSummary(client: pg.PoolClient, month: string) {
  const { rows } = await client.query<Record<string, string | null>>(
    `SELECT
       (SELECT jsonb_build_object(
          'ordersPlaced', COALESCE(sum(orders_placed), 0),
          'ordersCompleted', COALESCE(sum(orders_completed), 0),
          'grossSales', COALESCE(sum(gross_sales), 0),
          'productDiscounts', COALESCE(sum(product_discounts), 0),
          'salesRevenue', COALESCE(sum(sales_revenue), 0),
          'unitsSold', COALESCE(sum(units_sold), 0),
          'cogs', COALESCE(sum(cogs), 0))
          FROM analytics_daily_sales
         WHERE stat_date >= $1::date AND stat_date < ($1::date + interval '1 month'))::text AS sales,
       (SELECT to_jsonb(c) - 'computed_at' - 'month' FROM analytics_monthly_customers c WHERE c.month = $1::date)::text AS customers,
       (SELECT status FROM analytics_periods WHERE month = $1::date) AS status`,
    [month],
  );
  const row = rows[0]!;
  return {
    month,
    status: row.status,
    sales: row.sales ? JSON.parse(row.sales) : null,
    customers: row.customers ? JSON.parse(row.customers) : null,
  };
}

/**
 * يعيد بناء الأشهر من `from` إلى `to`. `transactional: false` للاختبارات (داخل
 * معاملة المستدعي، التي يجب أن تضبط هي `analytics.rebuild` إن أرادت أشهراً مُغلقة).
 */
export async function rebuildMonths(
  client: pg.PoolClient,
  options: RebuildOptions & { today?: string; transactional?: boolean },
) {
  if (!options.reason.trim()) throw new Error('--reason مطلوب: كل إعادة بناءٍ تُسجَّل بسببها');
  if (!options.actor.trim()) throw new Error('actor مطلوب');
  const tz = config.storeTimezone;
  const transactional = options.transactional ?? true;
  const today = options.today ?? (await analyticsAggregator.today(client, tz));
  const months = monthsBetween(`${options.from}-01`, `${options.to}-01`);
  if (months.length === 0) throw new Error('--from يجب ألّا يتجاوز --to');
  if (months[months.length - 1]! > today) throw new Error('لا يُعاد بناء شهرٍ لم يبدأ بعد');

  const results: Array<{ month: string; status: string }> = [];
  for (const month of months) {
    if (transactional) await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO analytics_periods (month) VALUES ($1::date) ON CONFLICT (month) DO NOTHING`,
        [month],
      );
      const { rows } = await client.query<{ status: string }>(
        'SELECT status FROM analytics_periods WHERE month = $1::date FOR UPDATE',
        [month],
      );
      const status = rows[0]!.status;
      if (status === 'closed' && !options.includeClosed) {
        throw new Error(`الشهر ${month.slice(0, 7)} مُغلق — أعد التشغيل مع --include-closed وسببٍ واضح`);
      }
      await client.query("SELECT set_config('analytics.rebuild', 'on', true)");
      const before = await monthSummary(client, month);

      const lastDayOfMonth = monthEnd(month);
      const lastDay = today < lastDayOfMonth ? today : lastDayOfMonth;
      for (const day of daysBetween(month, lastDay)) {
        await analyticsAggregator.computeDay(client, day, tz);
      }
      const endDay = addDays(lastDay, 1);
      await analyticsAggregator.computeMonthly(client, month, endDay, tz);
      const reconciliation = await analyticsAggregator.reconcile(client, month, endDay, tz);
      await client.query(
        `UPDATE analytics_periods
            SET dirty = FALSE, computed_through = $2::date, computed_at = now(),
                definitions_version = $3, reconciliation = $4::jsonb
          WHERE month = $1::date`,
        [month, lastDay, ANALYTICS_DEFINITIONS_VERSION, JSON.stringify(reconciliation)],
      );
      const after = await monthSummary(client, month);
      await client.query(
        `INSERT INTO analytics_rebuild_log (scope_from, scope_to, include_closed, reason, actor, before, after)
         VALUES ($1::date, $2::date, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [month, lastDayOfMonth, options.includeClosed, options.reason.trim(), options.actor.trim(),
          JSON.stringify(before), JSON.stringify(after)],
      );
      if (transactional) await client.query('COMMIT');
      else await client.query("SELECT set_config('analytics.rebuild', '', true)");
      results.push({ month, status });
    } catch (error) {
      if (transactional) await client.query('ROLLBACK');
      throw error;
    }
  }
  return results;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const from = argValue('--from');
  const to = argValue('--to') ?? from;
  const reason = argValue('--reason') ?? '';
  if (!from || !/^\d{4}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}$/.test(to)) {
    throw new Error('الاستعمال: --from YYYY-MM [--to YYYY-MM] --reason "…" [--include-closed]');
  }
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    const results = await rebuildMonths(client as unknown as pg.PoolClient, {
      from,
      to,
      reason,
      includeClosed: process.argv.includes('--include-closed'),
      actor: argValue('--actor') ?? `cli:${userInfo().username}`,
    });
    for (const result of results) console.log(`  ✓ rebuilt ${result.month.slice(0, 7)} (${result.status})`);
  } finally {
    await client.end();
  }
}

function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(path.resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
