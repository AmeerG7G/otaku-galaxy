import type pg from 'pg';
import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { analyticsAggregator } from '../services/analytics/aggregator.js';

/**
 * مهمّة التحليلات — تبني الملخّصات التاريخية وتغلق الأشهر المنقضية.
 *
 * [CRITICAL]
 *   • قفلٌ استشاري للجلسة: دورٌ واحد في كل لحظة ولو تعدّدت عمليات الخادم.
 *   • كل شهرٍ معاملةٌ مستقلة: عطلٌ في شهرٍ لا يُفسد غيره، والشهر يُعاد كاملاً.
 *   • الشهر المُغلق لا يُلمس (زناد ٠٧٦)؛ تغييره إعادة بناءٍ مُدقَّقة لا مهمّة.
 *   • لا حذف لأي ملخّص — التطهير للتتبّع **الخام** بعد ٤٠٠ يوم فقط.
 */

/** مفتاح القفل الاستشاري لهذه المهمّة (ثابت، مختلف عن مفتاح المهاجر). */
export const ANALYTICS_LOCK_KEY = 6_441_907_215_330_871;

export interface AnalyticsTickSummary {
  today: string;
  months: Array<{ month: string; action: 'skipped' | 'refreshed' | 'recomputed' | 'closed' }>;
  inventorySnapshotRows: number;
  purged: { activity: number; searchTerms: number };
}

/**
 * الدور كاملاً على عميلٍ معطى.
 *
 * `transactional: false` للاختبارات: يجري الدور داخل معاملة المستدعي (التي
 * تُلغى بعده) فلا تُغلق أشهرٌ حقيقية في قاعدة الاختبار المشتركة.
 */
export async function processAnalytics(
  client: pg.PoolClient,
  options: { today?: string; transactional?: boolean } = {},
): Promise<AnalyticsTickSummary> {
  const tz = config.storeTimezone;
  const transactional = options.transactional ?? true;
  const inTx = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (!transactional) return fn();
    await client.query('BEGIN');
    try {
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  };

  const today = options.today ?? (await analyticsAggregator.today(client, tz));
  await inTx(() => analyticsAggregator.ensurePeriods(client, tz, today));

  const { rows } = await client.query<{ month: string }>(
    `SELECT month::text FROM analytics_periods WHERE status = 'open' AND month <= $1::date ORDER BY month`,
    [today],
  );
  const months: AnalyticsTickSummary['months'] = [];
  for (const { month } of rows) {
    try {
      months.push(await inTx(() => analyticsAggregator.processOpenMonth(client, month, today, tz)));
    } catch (error) {
      if (!transactional) throw error;
      console.error('[analytics] month failed — will retry next tick', { month, error });
    }
  }

  const inventorySnapshotRows = await inTx(() => analyticsAggregator.snapshotInventory(client, today));
  const purged = await inTx(() => analyticsAggregator.purgeRawTracking(client, today));
  return { today, months, inventorySnapshotRows, purged };
}

/** دورٌ واحد بقفلٍ استشاري — `null` إن كان دورٌ آخر جارياً. */
export async function runAnalyticsTick(options: { today?: string } = {}): Promise<AnalyticsTickSummary | null> {
  const client = await db.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [
      ANALYTICS_LOCK_KEY,
    ]);
    if (!rows[0]?.locked) return null;
    try {
      return await processAnalytics(client, options);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ANALYTICS_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

/** جدولة المهمّة مع الخادم — دورٌ عند الإقلاع ثم كل ساعة. يعيد دالة إيقاف. */
export function startAnalyticsScheduler(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runAnalyticsTick();
    } catch (error) {
      console.error('[analytics] tick failed', error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), config.analytics.jobIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
