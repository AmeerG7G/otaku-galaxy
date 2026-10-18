import { realpathSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * [CRITICAL] `--reset` يحذف المخطّط كاملاً (`DROP SCHEMA public CASCADE`) —
 * لقاعدة تطويرٍ محلية وحدها. كان يعمل في أي بيئة وعلى أي قاعدة. شرطان معاً،
 * والرفض قبل أي اتصال:
 *   - البيئة `dev` و`NODE_ENV` ليس `production` (`docker compose run migrate
 *     … --reset` بملف الإنتاج).
 *   - القاعدة على هذا الجهاز (localhost / 127.0.0.1 / ::1 / مقبس unix): `npm
 *     run db:reset` يضبط `APP_ENV=dev` بنفسه، و`DATABASE_URL` مُصدَّرٌ في
 *     الصدفة نحو خادمٍ بعيد يسبق `.env.dev` — فالبيئة وحدها لا تكفي.
 */
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '']);

export function resetRefusal(env: { appEnv: string; nodeEnv: string; url: string }): string | null {
  if (env.appEnv !== 'dev' || env.nodeEnv === 'production') {
    return `--reset مرفوض في APP_ENV=${env.appEnv} NODE_ENV=${env.nodeEnv}: يحذف القاعدة كاملةً، وهو للتطوير وحده.`;
  }
  let host: string;
  try {
    const parsed = new URL(env.url);
    // `?host=/var/run/postgresql` مقبس unix محلي.
    host = parsed.searchParams.get('host')?.startsWith('/') ? '' : parsed.hostname.toLowerCase();
  } catch {
    return '--reset مرفوض: عنوان القاعدة غير مفهوم.';
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    return `--reset مرفوض: القاعدة على ${host} لا على هذا الجهاز — يحذف القاعدة كاملةً، وهو لقاعدة تطويرٍ محلية وحدها.`;
  }
  return null;
}

async function main() {
  const url = config.migrationDatabaseUrl || config.databaseUrl;
  const shouldReset = process.argv.includes('--reset');
  if (shouldReset) {
    const refusal = resetRefusal({ appEnv: config.appEnv, nodeEnv: process.env.NODE_ENV ?? '', url });
    if (refusal) throw new Error(refusal);
  }
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

/**
 * هل هذا الملف هو نقطة دخول العملية (`tsx scripts/migrate.ts`) لا وحدةً مستورَدة؟
 *
 * [CRITICAL] الاستيراد ≠ التنفيذ. هذه الوحدة تُستورَد من `scripts/seed.ts`
 * و`tests/global-setup.ts` من أجل `runMigrations` وحدها، فلا يجوز أن يجرّ
 * الاستيراد اتصالاً بالقاعدة ولا هجرة. الحارس السابق قارن `import.meta.url`
 * — عنوان هذه الوحدة نفسها، وفيه `scripts/migrate` دائماً — فكان صادقاً تحت
 * أي مشغّل، و`npm test` هاجر قاعدة **التطوير** لمجرّد أن global-setup
 * استورد الملف. الفرق الوحيد بين الاستيراد والتشغيل المباشر هو
 * `process.argv[1]`، وهو ما يُقارَن هنا بمسار الوحدة على القرص.
 *
 * `import.meta.main` يُغني عن هذا في Node ≥ 24.2، لكن CI وصورة الهجرة على
 * Node 22. وأي شكّ (لا `argv[1]`، أو مسارٌ لا يُحلّ) يُفشل مغلقاً: لا هجرة.
 */
function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(path.resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// عند التشغيل مباشرة فقط (npm run db:migrate / db:reset / db:migrate:*).
if (isInvokedDirectly()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
