import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';

/**
 * سلسلة الهجرات كاملةً على قاعدةٍ فارغة — كما سيراها أول نشرٍ لبيئة جديدة.
 *
 * [CRITICAL REGRESSION GUARD] كل اختبارٍ آخر يعمل على قاعدة اختبارٍ مهاجَرةٍ
 * سلفاً، فلا يُعاد تشغيل ملفٍّ سُجِّل. لذلك مرّ تعديلٌ لاحق أفسد ٢٩ جملة في
 * `047_kurdish_catalog_backfill.sql` (`IS NULL.` بدل `IS NULL;`) بلا أثر، بينما
 * أي بيئةٍ جديدة كانت ستقف عند ٠٤٧ ولا تبلغ ما بعده. الاختبار يطبّق الملفات
 * كلها بالمشغّل الحقيقي في مخطّطٍ فارغ (`search_path`) ثم يمحوه — دور
 * التطبيق لا يملك إنشاء قاعدة، والمخطّط المعزول يكافئها هنا.
 */
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/database/migrations',
);
const SCHEMA = 'fresh_chain_check';

describe('سلسلة الهجرات على قاعدة فارغة', () => {
  afterAll(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  });

  it('[CRITICAL] كل ملف يُطبَّق بالترتيب بلا خطأ، وفهرس الرسوم يصل إلى صورته الحالية', async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.query(`CREATE SCHEMA ${SCHEMA}`);
    const url = new URL(config.testDatabaseUrl);
    url.searchParams.set('options', `-c search_path=${SCHEMA},public`);

    const applied = await runMigrations(url.toString());

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    expect(applied).toEqual(files);
    const slots = await db.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.visual_slots`);
    expect(slots.rows[0]).toEqual({ n: 43 });
  }, 120_000);
});
