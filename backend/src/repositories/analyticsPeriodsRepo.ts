import type pg from 'pg';

/**
 * سجلّ أشهر التحليلات (الهجرة ٠٧٦) — ما تحتاجه الخدمات خارج مهمّة التجميع.
 *
 * تغييرٌ يمسّ نطاق التحليلات (تعليم حسابٍ داخلياً، إكمال جنسٍ قديم) يعلّم الأشهر
 * **المفتوحة** «متّسخة» فتُعاد حسابها كاملةً في الدور التالي. الأشهر المُغلقة لا
 * تتغيّر إلا بإعادة بناءٍ مُدقَّقة (`scripts/analyticsRebuild.ts`).
 */
export const analyticsPeriodsRepo = {
  async markOpenMonthsDirty(db: pg.Pool | pg.PoolClient): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE analytics_periods SET dirty = TRUE WHERE status = 'open' AND NOT dirty`,
    );
    return rowCount ?? 0;
  },
};
