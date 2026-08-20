import pg from 'pg';
import { config, isTest } from '../config/index.js';

/** Pool واحد للاتصال بقاعدة البيانات (يتغير بتبعية البيئة). */
export function createPool(url: string) {
  return new pg.Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export const pool = createPool(config.databaseUrl);
export const testPool = createPool(config.testDatabaseUrl);

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