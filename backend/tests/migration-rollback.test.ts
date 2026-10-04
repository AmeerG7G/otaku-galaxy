import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../scripts/migrate.js';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';

/**
 * سكربتات العكس (`scripts/rollback/*.down.sql`) — صعود ← نزول ← صعود.
 *
 * [CRITICAL] كل هجرةٍ من ٠٧١ إلى ٠٨٠ تحمل سكربت عكسٍ مُختبَراً هنا: تُطبَّق
 * السلسلة كاملةً في مخطّطٍ معزول، ثم تُعكس هذه الهجرات بترتيبٍ معاكس، ثم تُعاد.
 * بصمة المخطّط (أعمدة، قيود، زنادات، عروض، دوال) بعد الإعادة يجب أن تطابق
 * ما قبل العكس حرفياً — عكسٌ ينسى قيداً أو زناداً يظهر هنا.
 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ROLLBACK_DIR = path.resolve(ROOT, '../scripts/rollback');
const SCHEMA = 'rollback_check';

function scopedUrl() {
  const url = new URL(config.testDatabaseUrl);
  url.searchParams.set('options', `-c search_path=${SCHEMA},public`);
  return url.toString();
}

async function fingerprint() {
  const { rows } = await db.query<{ item: string }>(
    `SELECT 'col:' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable AS item
       FROM information_schema.columns WHERE table_schema = $1
     UNION ALL
     SELECT 'con:' || c.conrelid::regclass::text || ':' || c.conname || ':' || pg_get_constraintdef(c.oid)
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1
     UNION ALL
     SELECT 'trg:' || t.tgrelid::regclass::text || ':' || t.tgname
       FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid JOIN pg_namespace n ON n.oid = r.relnamespace
      WHERE n.nspname = $1 AND NOT t.tgisinternal
     UNION ALL
     SELECT 'rel:' || c.relkind::text || ':' || c.relname
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'v', 'i', 'S')
     UNION ALL
     SELECT 'fn:' || p.proname
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = $1
     ORDER BY 1`,
    [SCHEMA],
  );
  return rows.map((row) => row.item);
}

describe('سكربتات العكس — صعود ← نزول ← صعود', () => {
  afterAll(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  });

  it('[CRITICAL] كل هجرةٍ لها عكس، والعكس ثم الإعادة يعيدان المخطّط نفسه', async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.query(`CREATE SCHEMA ${SCHEMA}`);
    await runMigrations(scopedUrl());
    const before = await fingerprint();

    const downs = (await readdir(ROLLBACK_DIR)).filter((f) => f.endsWith('.down.sql')).sort().reverse();
    const allMigrations = (await readdir(path.resolve(ROOT, '../src/database/migrations')))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    // كل سكربت عكسٍ يقابل هجرةً موجودة، وهجرات التحليلات والإشعارات (٠٧١–٠٨٠)
    // تحمل كلها عكسها. هجرةٌ بلا سكربت (من خارج هذه المجموعة) تبقى مطبَّقة
    // طوال الاختبار، والعكس والإعادة يجريان حولها.
    const migrations = downs.map((f) => f.replace('.down.sql', '.sql')).sort();
    for (const file of migrations) expect(allMigrations).toContain(file);
    const featureMigrations = allMigrations.filter((f) => f >= '071' && f < '081');
    expect(featureMigrations).toHaveLength(10);
    for (const file of featureMigrations) expect(migrations).toContain(file);

    const client = new pg.Client({ connectionString: scopedUrl() });
    await client.connect();
    try {
      for (const file of downs) {
        await client.query('BEGIN');
        await client.query(await readFile(path.join(ROLLBACK_DIR, file), 'utf8'));
        await client.query('COMMIT');
      }
    } finally {
      await client.end();
    }

    const reapplied = await runMigrations(scopedUrl());
    expect(reapplied).toEqual(migrations);
    expect(await fingerprint()).toEqual(before);
  }, 180_000);
});
