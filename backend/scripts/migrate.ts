import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { config } from '../src/config/index.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../src/database/migrations');

/**
 * مفتاح قفل استشاري ثابت لهذا المشروع.
 *
 * أي رقم يصلح ما دام ثابتاً؛ المهم أن يتفق عليه كل من يُهاجر نفس القاعدة.
 */
const MIGRATION_LOCK_KEY = 8_274_119_305_461_022;

/**
 * مهاجرات بسيطة: تطبّق ملفات SQL بالترتيب وتبقّي أثرها في schema_migrations.
 * كل ملف يُنفَّذ داخل معاملة (Transaction).
 *
 * [CRITICAL] المُهاجِر محميّ بقفل استشاري — التزامن يكسره بلا ذلك.
 *
 * `CREATE TABLE IF NOT EXISTS` ليس آمناً تحت التزامن في PostgreSQL: عمليتان
 * تجتازان الفحص معاً ثم تصطدمان على فهرس فهرس النظام
 * (`pg_class_relname_nsp_index` / `pg_type_typname_nsp_index`). أُعيد إنتاج
 * ذلك محلياً بمُشغّلَين متزامنين على مخطّط فارغ، وهو نفسه سبب فشل خطوة
 * الاختبارات في CI على قاعدة جديدة.
 *
 * `pg_advisory_lock` يُسلسل المُشغّلين: الثاني ينتظر ثم يجد كل شيء مطبَّقاً
 * فلا يفعل شيئاً. القفل مربوط بالجلسة ويُحرَّر في `finally` ومع إغلاقها.
 */
export async function runMigrations(url: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    locked = true;

    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    );

    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.name));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const appliedNow: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedNow.push(file);
        console.log(`  ✓ applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed: ${file}\n${(error as Error).message}`);
      }
    }
    return appliedNow;
  } finally {
    if (locked) {
      // تحرير صريح قبل الإغلاق — لا نتّكل على انتهاء الجلسة وحده.
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    }
    await client.end();
  }
}

/** مسح كامل (للتطوير فقط): يُحذف كل الجداول ويعيد الإنشاء. */
export async function resetDatabase(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
    `);
    console.log('  ✓ schema dropped & recreated (public)');
  } finally {
    await client.end();
  }
}

async function main() {
  const url = config.migrationDatabaseUrl || config.databaseUrl;
  const shouldReset = process.argv.includes('--reset');
  console.log(`Migrating database … (${shouldReset ? 'resetting first' : 'incremental'})`);
  if (shouldReset) {
    await resetDatabase(url);
  }
  const applied = await runMigrations(url);
  if (applied.length === 0) {
    console.log('  - no pending migrations');
  }
  console.log('Done.');
}

// عند التشغيل مباشرة (npm run db:migrate).
if (process.argv[1] && import.meta.url.includes('scripts/migrate')) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}