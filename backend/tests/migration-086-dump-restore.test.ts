import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { productRepo } from '../src/repositories/catalogRepo.js';

/**
 * الهجرة 086 — النسخة الاحتياطية تُستعاد كاملةً.
 *
 * [CRITICAL REGRESSION GUARD] `pg_restore` يعمل بـ`search_path = ''`، وجسم دالّة
 * SQL نصٌّ محفوظ كما كُتب. دالّتا مستند البحث (066) كانتا تستدعيان `search_fold`
 * بلا تأهيل، فتفشل الاستعادة عند `CREATE INDEX` لفهرسَي البحث (الدالّة تُدمَج
 * فيُحلَّل جسمها بمسارٍ فارغ). بروفة الاختبار المسبق (2026-10-25) وقفت هنا. كل
 * اختبارٍ آخر يعمل على القاعدة نفسها بمسار بحث التطبيق، فلا يراه.
 *
 * هنا: `pg_dump -Fc` لقاعدة الاختبار المهاجَرة ← `pg_restore --exit-on-error` في
 * قاعدةٍ فارغة (من `template0`) ← الفهرسان صالحان، وبحث المستودع الحقيقي يُشرَح
 * على القاعدة المستعادة ويمرّ بفهرس لغته.
 *
 * يحتاج `pg_dump`/`pg_restore` ودوراً يُنشئ قواعد. في التكامل المستمر (`CI`) كلاهما
 * موجود (دور `postgres:16` مالك)، والغياب هناك **فشل** لا تخطٍّ. على جهاز تطويرٍ
 * دورُه بلا `CREATEDB` يُتخطّى الاختبار ويقول لماذا.
 */
const run = promisify(execFile);
const TARGET_DB = 'og_restore_check';
const INDEXES = { ar: 'idx_products_search_ar_trgm', ckb: 'idx_products_search_ckb_trgm' } as const;
const FUNCTIONS = ['product_search_text_ar', 'product_search_text_ckb'];

function urlFor(database: string) {
  const url = new URL(config.testDatabaseUrl);
  url.pathname = `/${database}`;
  url.search = '';
  return url.toString();
}

async function hasTool(name: string) {
  try {
    await run(name, ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function prerequisites(): Promise<string | null> {
  for (const tool of ['pg_dump', 'pg_restore']) {
    if (!(await hasTool(tool))) return `${tool} غير موجود`;
  }
  const { rows } = await db.query<{ ok: boolean }>(
    'SELECT rolcreatedb OR rolsuper AS ok FROM pg_roles WHERE rolname = current_user',
  );
  return rows[0]?.ok ? null : 'دور الاختبار لا يملك CREATEDB';
}

const missing = await prerequisites();
if (missing && process.env.CI) throw new Error(`اختبار الاستعادة إلزاميٌّ في CI: ${missing}`);
if (missing) console.warn(`[086 dump/restore] متخطّى على هذا الجهاز: ${missing}`);

/** تعريفا الدالّتين في قاعدةٍ ما — جسماً وصفاتٍ — بالترتيب. */
async function definitions(client: pg.Pool | pg.Client) {
  const { rows } = await client.query<{
    proname: string;
    prosrc: string;
    provolatile: string;
    proparallel: string;
    proconfig: string[] | null;
  }>(
    `SELECT proname, prosrc, provolatile, proparallel, proconfig
       FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1)
      ORDER BY proname`,
    [FUNCTIONS],
  );
  return rows;
}

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

function indexNames(node: PlanNode): string[] {
  return [node['Index Name'] ?? '', ...(node.Plans ?? []).flatMap(indexNames)].filter(Boolean);
}

describe('الهجرة 086 — دالّتا البحث تؤهّلان public.search_fold', () => {
  it('[CRITICAL] الجسمان يستدعيان public.search_fold وحدها، وتبقيان قابلتين للدمج', async () => {
    const rows = await definitions(db);
    expect(rows.map((r) => r.proname)).toEqual(FUNCTIONS);
    for (const row of rows) {
      expect(row.prosrc, row.proname).toContain('public.search_fold(');
      // لا استدعاء بلا تأهيل باقٍ في الجسم.
      expect(row.prosrc.replaceAll('public.search_fold(', ''), row.proname).not.toMatch(/search_fold\s*\(/);
      // `SET search_path` يمنع الدمج، فيخسر البحث مطابقة الفهرس.
      expect(row.proconfig, row.proname).toBeNull();
      expect([row.provolatile, row.proparallel], row.proname).toEqual(['i', 's']);
    }
  });

  // مسار بحثٍ بلا `public` — ما يفعله `pg_restore` — والطيّ نفسه بالعربية والكردية.
  // قبل 086 يفشل كل استدعاءٍ هنا بـ`function search_fold(text) does not exist`.
  it.each(['', 'pg_catalog'])(
    "[CRITICAL] بمسار البحث '%s' الدالّتان تعملان، وناتجهما هو ناتجهما بمسار التطبيق",
    async (searchPath) => {
      const cases = `
        SELECT public.product_search_text_ar('مَكتبةٌ أنمي', 'إصدار ١٢') AS ar,
               public.product_search_text_ckb('مَكتبةٌ', 'وصف', 'کتێبخانە', 'لۆفی ۱۲') AS ckb,
               public.product_search_text_ckb('مَكتبةٌ', 'وصف', '  ', NULL) AS ckb_fallback`;
      const expected = { ar: 'مکتبه انمی\nاصدار 12', ckb: 'کتیبخانه\nلوفی 12', ckb_fallback: 'مکتبه\nوصف' };
      const { rows: appPath } = await db.query(cases);
      expect(appPath[0]).toEqual(expected);

      const client = await db.connect();
      try {
        await client.query(`SET search_path = '${searchPath}'`);
        const { rows } = await client.query(cases);
        expect(rows[0]).toEqual(expected);
        // الشكل الذي فشل في الاستعادة: الدالّة مدموجةً في تعبيرٍ على جدول.
        await client.query(
          `SELECT count(*) FROM public.products
            WHERE public.product_search_text_ar(name, description) LIKE '%x%'
               OR public.product_search_text_ckb(name, description, name_ckb, description_ckb) LIKE '%x%'`,
        );
      } finally {
        await client.query('RESET search_path');
        client.release();
      }
    },
  );
});

describe.skipIf(missing !== null)('الهجرة 086 — pg_dump ← pg_restore --exit-on-error', () => {
  let workDir = '';
  let restored: pg.Pool | undefined;

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'og-restore-'));
    await db.query(`DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`);
  });

  afterAll(async () => {
    await restored?.end();
    await db.query(`DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`);
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('[CRITICAL] نسخة قاعدة مهاجَرة تُستعاد في قاعدةٍ فارغة بلا خطأ، وفهرسا البحث صالحان', async () => {
    const dump = path.join(workDir, 'backup.dump');
    await run('pg_dump', ['-Fc', '-f', dump, `--dbname=${config.testDatabaseUrl}`]);
    await db.query(`CREATE DATABASE ${TARGET_DB} TEMPLATE template0`);
    // `execFile` يرفض عند رمز خروجٍ غير صفري؛ `--exit-on-error` يجعل أول خطأ خروجاً.
    await run('pg_restore', ['--exit-on-error', `--dbname=${urlFor(TARGET_DB)}`, dump]);

    restored = new pg.Pool({ connectionString: urlFor(TARGET_DB), max: 2 });
    const { rows } = await restored.query<{ name: string; valid: boolean; ready: boolean }>(
      `SELECT c.relname AS name, i.indisvalid AS valid, i.indisready AS ready
         FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = ANY($1) ORDER BY c.relname`,
      [Object.values(INDEXES)],
    );
    expect(rows).toEqual([
      { name: INDEXES.ar, valid: true, ready: true },
      { name: INDEXES.ckb, valid: true, ready: true },
    ]);
    // الدالّتان المستعادتان هما نفسهما في المصدر.
    expect(await definitions(restored)).toEqual(await definitions(db));

    // كتالوجٌ في القاعدة المستعادة وحدها (تُمحى كلها بعد الملف): في CI القاعدة بلا
    // منتجات، وعلى جدولٍ فارغ يفضّل المخطّط فهارس `is_active` الجزئية — حقّاً.
    // بألفَي منتج يختار فهرس trigram بحرّية، كما في PERF-4، بلا إجبارٍ على خطة.
    await restored.query(
      `WITH c AS (INSERT INTO categories (name) VALUES ('فئة الاستعادة') RETURNING id)
       INSERT INTO products (name, description, name_ckb, price, category_id)
       SELECT CASE WHEN g = 1 THEN 'One Piece لوفي' ELSE 'منتج ' || g END, 'وصف ' || g,
              CASE WHEN g = 1 THEN 'One Piece لۆفی' ELSE 'بەرهەم ' || g END, 1000, c.id
         FROM c, generate_series(1, 2000) g`,
    );
    await restored.query('VACUUM ANALYZE products');
  }, 120_000);

  it.each(Object.entries(INDEXES) as Array<['ar' | 'ckb', string]>)(
    '[CRITICAL] بحث المستودع (%s) على القاعدة المستعادة يمرّ بفهرس لغته %s',
    async (locale, index) => {
      expect(restored, 'الاستعادة لم تنجح').toBeDefined();
      const pool = restored!;
      // الجمل التي يُصدرها المستودع نفسه — لا نسخةً منها في الاختبار.
      const captured: Array<{ text: string; values: unknown[] }> = [];
      const recording = {
        query: (text: string, values: unknown[]) => {
          captured.push({ text, values });
          return pool.query(text, values);
        },
      } as unknown as pg.Pool;
      const result = await productRepo.search(recording, 'one piece', 1, 12, locale);
      // «يحتوي» لا «يساوي»: ملفّاتٌ أسبق تترك في المصدر امتياز «One Piece Test» مربوطاً
      // بمنتج، فيدخل النسخة ويطابق عبر الامتياز — العدد يتبع ترتيب الملفّات.
      expect(result.items.map((p) => p.nameAr)).toContain('One Piece لوفي');
      expect(captured).toHaveLength(2);

      for (const { text, values } of captured) {
        const { rows } = await pool.query<{ 'QUERY PLAN': Array<{ Plan: PlanNode }> }>(
          `EXPLAIN (FORMAT JSON) ${text}`,
          values,
        );
        expect(indexNames(rows[0]!['QUERY PLAN'][0]!.Plan), text.slice(0, 80)).toContain(index);
      }
    },
  );
});
