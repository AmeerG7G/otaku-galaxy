import pg from 'pg';
import { config, isTest } from '../config/index.js';

/**
 * Pool واحد للاتصال بقاعدة البيانات (يتغير بتبعية البيئة).
 *
 * [CRITICAL] المستمع على `error` ليس تجميلاً — بدونه يسقط الخادم كله.
 *
 * `pg.Pool` يُطلق حدث `error` حين ينقطع عميلٌ **خامل** في المجمّع: تبديل
 * خادم القاعدة، أو `pg_terminate_backend`، أو إعادة تشغيل إدارية، أو قاطع
 * اتصالات خامل في الوسط. وحدث `error` بلا مستمع في Node ليس تحذيراً — إنه
 * استثناء غير ملتقَط يُنهي العملية.
 *
 * لوحظ فعلياً في هذا المشروع: انقطاع اتصال خامل واحد (`57P01: terminating
 * connection due to administrator command`) أسقط خادم الـAPI بالكامل، ومعه
 * جدولةُ تذكير التقييم التي تعيش في العملية نفسها.
 *
 * المجمّع يتخلّص من العميل المعطوب تلقائياً ويفتح آخر عند الطلب التالي،
 * فالتسجيل والمتابعة هما التصرّف الصحيح — لا الانهيار.
 */
export function createPool(url: string, label: string) {
  const created = new pg.Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  created.on('error', (error: Error) => {
    console.error(
      `[db:${label}] عميل خامل انقطع وأُسقط من المجمّع (الخادم يواصل العمل): ${error.message}`,
    );
  });

  return created;
}

export const pool = createPool(config.databaseUrl, 'app');
export const testPool = createPool(config.testDatabaseUrl, 'test');

export const db = isTest ? testPool : pool;

export async function closePools() {
  await pool.end();
  await testPool.end();
}

/** مساعد: معاملة عبر عميل مخصص، يُحرَّر تلقائياً. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}