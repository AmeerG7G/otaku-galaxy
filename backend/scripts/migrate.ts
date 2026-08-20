import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { config } from '../src/config/index.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../src/database/migrations');

/**
 * مهاجرات بسيطة: تطبّق ملفات SQL بالترتيب وتبقّي أثرها في schema_migrations.
 * كل ملف يُنفَّذ داخل معاملة (Transaction).
 */
export async function runMigrations(url: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
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