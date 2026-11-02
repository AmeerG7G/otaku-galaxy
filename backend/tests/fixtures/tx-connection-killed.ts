/**
 * معاملةٌ يُقطع اتصالها من جهة القاعدة وهي جارية.
 *
 * بلا مستمع `error` على العميل المُستعار يصير انقطاعه استثناءً غير ملتقَط
 * فتموت العملية (والخادم الحقيقي يعامله عطلاً قاتلاً). المطلوب: تُرفض
 * المعاملة وحدها، ويبقى المجمّع يخدم. تُستعمل من `tests/performance-audit.test.ts`.
 */
import { closePools, db, withTransaction } from '../../src/database/pool.js';

let failure: unknown;
try {
  await withTransaction(async (tx) => {
    const { rows } = await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    // يُقطع الاتصال **أثناء** جملةٍ جارية — حال إعادة تشغيل القاعدة أو تبديلها.
    const killer = new Promise((resolve) => setTimeout(resolve, 300)).then(() =>
      db.query('SELECT pg_terminate_backend($1)', [rows[0]!.pid]),
    );
    try {
      await tx.query('SELECT pg_sleep(5)');
    } finally {
      await killer;
    }
  });
} catch (error) {
  failure = error;
}
console.log(`TX-REJECTED ${(failure as Error | undefined)?.message ?? 'no error'}`);
await db.query('SELECT 1');
console.log('POOL-SERVING');
await closePools();
