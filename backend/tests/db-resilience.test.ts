import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';

/**
 * [CRITICAL REGRESSION GUARD] — انقطاع اتصال خامل لا يُسقط الخادم.
 *
 * `pg.Pool` يُطلق حدث `error` حين يُقطع عميلٌ خامل من طرف القاعدة (تبديل
 * خادم، أو `pg_terminate_backend`، أو إعادة تشغيل إدارية). في Node، حدث
 * `error` بلا مستمع ليس تحذيراً بل استثناء يُنهي العملية.
 *
 * حدث ذلك فعلاً أثناء تدقيق هذه الدفعة: `57P01` أسقط خادم الـAPI كاملاً،
 * ومعه جدولةُ تذكير التقييم التي تعيش في نفس العملية.
 *
 * الاختبار نفسه هو البرهان: لو غاب المستمع لانهار مُشغّل الاختبارات هنا
 * بدل أن يفشل التأكيد.
 */
describe('صمود مجمّع الاتصالات', () => {
  it('قطع اتصال خامل لا يُنهي العملية، والاستعلام التالي ينجح', async () => {
    // 1) نحجز عميلاً من المجمّع ونعرف رقم عمليته، ثم نُعيده فيصير **خاملاً**
    //    داخل المجمّع. هذا هو العميل الذي سيُقطع من طرف القاعدة.
    // الثابت المحروس مباشرةً: وجود مستمع `error` على المجمّع. بدونه يتحوّل
    // انقطاعُ عميل خامل إلى استثناء غير ملتقَط يُنهي العملية — يلتقطه
    // مُشغّل الاختبارات فيبدو الاختبار ناجحاً بينما الخادم الحقيقي يموت.
    expect(
      db.listenerCount('error'),
      'لا مستمع `error` على المجمّع — انقطاع اتصال خامل سيُسقط الخادم',
    ).toBeGreaterThan(0);

    const held = await db.connect();
    const { rows } = await held.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const idlePid = rows[0]!.pid;
    held.release();

    // 2) القطع يجب أن يأتي من اتصال **خارج** المجمّع، وإلا قطعنا أنفسنا أو
    //    أعاد المجمّع استعمال نفس العميل فلا يحدث شيء (وهو ما جعل نسخةً
    //    سابقة من هذا الاختبار تمرّ بلا أن تفحص شيئاً).
    const outsider = new pg.Client({ connectionString: config.testDatabaseUrl });
    await outsider.connect();
    try {
      const killed = await outsider.query<{ terminated: boolean }>(
        'SELECT pg_terminate_backend($1) AS terminated',
        [idlePid],
      );
      expect(
        killed.rows[0]!.terminated,
        'لم يُقطع أي اتصال — الاختبار لا يفحص شيئاً',
      ).toBe(true);
    } finally {
      await outsider.end();
    }

    // 3) مهلة قصيرة حتى يصل حدث الانقطاع إلى المجمّع.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 4) بلا مستمع `error` على المجمّع تكون العملية قد ماتت قبل هذا السطر.
    const after = await db.query<{ ok: number }>('SELECT 1 AS ok');
    expect(after.rows[0]!.ok).toBe(1);

    // واستعلام حقيقي ثانٍ للتأكد أن التعافي ليس صدفة اتصال واحد.
    const again = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM users',
    );
    expect(Number(again.rows[0]!.total)).toBeGreaterThanOrEqual(0);
  });
});
