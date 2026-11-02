import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { runMigrations } from '../scripts/migrate.js';
import { CONFIRM_FLAG, cliRefusal, createOwner, parseOwnerInput } from '../scripts/createOwner.js';

/**
 * حساب المالك في قاعدة الإنتاج الفارغة (خطة الإنتاج، 2026-11-01).
 *
 * [CRITICAL] السلوك المحميّ: مسؤولٌ أعلى واحد يُنشأ في جدول users **فارغ** فقط،
 * ولا شيء غيره يُكتب؛ وأي صفٍّ موجود يرفض التشغيل بلا تعديل. كلمة المرور لا تظهر
 * في السجلّ ولا تُقرأ من البيئة.
 *
 * قاعدة الاختبار المشتركة فيها مستخدمو الملفات الأخرى، فيُختبر المسار الحقيقي على
 * قاعدةٍ جديدة مهاجَرة بالكامل — ما سيكون عليه الإنتاج يوم الإنشاء. يحتاج دوراً
 * يُنشئ قواعد: في CI غيابه فشل، وعلى جهاز تطويرٍ بلا `CREATEDB` يُتخطّى.
 */
const TARGET_DB = 'og_create_owner_check';
const PASSWORD = 'owner password with spaces 2026';
const LOCAL = '07800000888';
const E164 = '+9647800000888';

function urlFor(database: string) {
  const url = new URL(config.testDatabaseUrl);
  url.pathname = `/${database}`;
  url.search = '';
  return url.toString();
}

const { rows: roleRows } = await db.query<{ ok: boolean }>(
  'SELECT rolcreatedb OR rolsuper AS ok FROM pg_roles WHERE rolname = current_user',
);
const canCreateDb = roleRows[0]?.ok === true;
if (!canCreateDb && process.env.CI) throw new Error('اختبار createOwner إلزاميٌّ في CI: دور الاختبار لا يملك CREATEDB');
if (!canCreateDb) console.warn('[createOwner] متخطّى على هذا الجهاز: دور الاختبار لا يملك CREATEDB');

describe('createOwner — حدود سطر الأوامر', () => {
  it('الإنتاج وحده، وبالعلَم الصريح وحده', () => {
    expect(cliRefusal('prod', [CONFIRM_FLAG])).toBeNull();
    for (const env of ['dev', 'staging', 'test']) expect(cliRefusal(env, [CONFIRM_FLAG])).toContain(env);
    expect(cliRefusal('prod', [])).not.toBeNull();
    expect(cliRefusal('prod', [CONFIRM_FLAG, PASSWORD])).not.toBeNull();
    expect(cliRefusal('prod', ['--confirm'])).not.toBeNull();
  });

  it('[CRITICAL] المصدر لا يقرأ كلمة المرور من البيئة ولا من argv', () => {
    const source = readFileSync(new URL('../scripts/createOwner.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/process\.env/);
    // argv يُمرَّر إلى cliRefusal وحده — العلَم، لا قيمة.
    expect(source.match(/process\.argv/g)).toHaveLength(2);
    expect(source).toContain('cliRefusal(config.appEnv, process.argv.slice(2))');
  });
});

describe('createOwner — مدخل stdin', () => {
  it('أربعة أسطر؛ كلمة المرور لا تُقصّ، و\\r\\n مقبول', () => {
    expect(parseOwnerInput(` ${LOCAL} \r\nالمالك\r\n ${PASSWORD} \r\n ${PASSWORD} \r\n`)).toEqual({
      phone: LOCAL,
      username: 'المالك',
      password: ` ${PASSWORD} `,
    });
  });

  it.each([
    ['كلمتان مختلفتان', `${LOCAL}\nالمالك\n${PASSWORD}\n${PASSWORD}x\n`],
    ['بلا تأكيد', `${LOCAL}\nالمالك\n${PASSWORD}\n`],
    ['رقم فارغ', `\nالمالك\n${PASSWORD}\n${PASSWORD}\n`],
    ['اسم فارغ', `${LOCAL}\n \n${PASSWORD}\n${PASSWORD}\n`],
    ['سطر زائد', `${LOCAL}\nالمالك\n${PASSWORD}\n${PASSWORD}\nextra\n`],
  ])('يرفض: %s — ولا تظهر كلمة المرور في الرسالة', (_case, raw) => {
    let message = '';
    try {
      parseOwnerInput(raw);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain(PASSWORD);
  });
});

describe.skipIf(!canCreateDb)('createOwner — قاعدة مهاجَرة فارغة', () => {
  let target: pg.Pool | undefined;

  beforeAll(async () => {
    await db.query(`DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`);
    await db.query(`CREATE DATABASE ${TARGET_DB} TEMPLATE template0`);
    await runMigrations(urlFor(TARGET_DB));
    target = new pg.Pool({ connectionString: urlFor(TARGET_DB), max: 2 });
  }, 120_000);

  afterAll(async () => {
    await target?.end();
    await db.query(`DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`);
  });

  it('[CRITICAL] ينشئ مسؤولاً أعلى واحداً، والسجلّ يحمل الرقم المعتمد لا كلمة المرور', async () => {
    const lines: string[] = [];
    const result = await createOwner(
      target!,
      { phone: LOCAL, username: 'المالك', password: PASSWORD },
      (line) => lines.push(line),
    );
    expect(result).toEqual({ phone: E164, username: 'المالك' });

    const { rows } = await target!.query<{
      phone: string;
      role: string;
      is_super_admin: boolean;
      admin_permissions: string[];
      is_active: boolean;
      password_hash: string;
    }>('SELECT phone, role, is_super_admin, admin_permissions, is_active, password_hash FROM users');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      phone: E164,
      role: 'admin',
      is_super_admin: true,
      admin_permissions: [],
      is_active: true,
    });
    expect(await bcrypt.compare(PASSWORD, rows[0]!.password_hash)).toBe(true);

    const out = lines.join('\n');
    expect(out).toContain(E164);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(rows[0]!.password_hash);
  });

  it('[CRITICAL] تشغيلٌ ثانٍ يُرفض ولا يغيّر الحساب الموجود ولا كلمة مروره', async () => {
    const before = await target!.query('SELECT id, phone, password_hash, updated_at FROM users');
    await expect(
      createOwner(target!, { phone: LOCAL, username: 'آخر', password: 'another password 2026' }, () => undefined),
    ).rejects.toThrow(/فارغة فقط/);
    await expect(
      createOwner(target!, { phone: '07800000999', username: 'آخر', password: 'another password 2026' }, () => undefined),
    ).rejects.toThrow(/فارغة فقط/);
    const after = await target!.query('SELECT id, phone, password_hash, updated_at FROM users');
    expect(after.rows).toEqual(before.rows);
  });

  it('لا يكتب إلا في users: كل جدول آخر فارغ ما عدا سجلّ الهجرات والإعدادات', async () => {
    const { rows } = await target!.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
    );
    const nonEmpty: string[] = [];
    for (const { tablename } of rows) {
      const { rows: count } = await target!.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${tablename}"`);
      if (count[0]!.n !== '0') nonEmpty.push(tablename);
    }
    expect(nonEmpty.sort()).toEqual(['schema_migrations', 'store_settings', 'users']);
  });

  it('كلمة مرور قصيرة تُرفض في قاعدةٍ فارغة بلا صفّ', async () => {
    await target!.query('DELETE FROM users');
    await expect(
      createOwner(target!, { phone: LOCAL, username: 'المالك', password: 'short' }, () => undefined),
    ).rejects.toThrow(/12/);
    const { rows } = await target!.query<{ n: string }>('SELECT count(*)::text AS n FROM users');
    expect(rows[0]!.n).toBe('0');
  });
});
