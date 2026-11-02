import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../src/config/index.js';
import { seedAdminUser } from './seedAdmin.js';

/**
 * إنشاء حساب المالك (المسؤول الأعلى) في قاعدة إنتاجٍ **فارغة** — مرّة واحدة.
 *
 * خطة الإنتاج (2026-11-01): الإنتاج يبدأ بلا أي بيانات، والحساب الوحيد الذي
 * يُحفظ هو حساب المالك، ويُعاد إنشاؤه لا يُنسخ — لا صفّ ولا تجزئة كلمة مرور
 * تخرج من قاعدة الاختبار. `seed.ts` كان الطريق الوحيد إلى `seedAdminUser`،
 * لكنه يزرع كتالوج العرض معه، فهذا المدخل يستدعي إنشاء المسؤول وحده.
 *
 * [CRITICAL] الحدود:
 *   - يرفض إن كان في `users` أي صفّ — لا يكتب فوق حسابٍ ولا يمسّ غيره. القفل
 *     على الجدول داخل المعاملة يمنع تسجيلاً متزامناً بين الفحص والإدراج.
 *   - الإنتاج وحده، وبعلَمٍ صريح `--confirm-empty-production`.
 *   - كلمة المرور من stdin فقط، لا من argv ولا من البيئة (كلاهما يُقرأ من
 *     `/proc` ويبقى في السجلّات)، ولا تُطبع بحال.
 *
 * المدخل على stdin أربعة أسطر: الرقم، الاسم الظاهر، كلمة المرور، تأكيدها.
 * غلاف النشر يقرؤها بلا صدى من طرفية المالك ويمرّرها هنا عبر أنبوب.
 */
export const CONFIRM_FLAG = '--confirm-empty-production';

export interface OwnerInput {
  phone: string;
  username: string;
  password: string;
}

export type OwnerResult = { phone: string; username: string };

/** سبب رفض التشغيل من سطر الأوامر، أو `null` إن جاز. */
export function cliRefusal(appEnv: string, argv: readonly string[]): string | null {
  if (appEnv !== 'prod') return `createOwner للإنتاج وحده (APP_ENV=${appEnv}).`;
  if (argv.length !== 1 || argv[0] !== CONFIRM_FLAG) {
    return `createOwner يتطلّب العلَم ${CONFIRM_FLAG} وحده.`;
  }
  return null;
}

/**
 * يقرأ أسطر stdin الأربعة. كلمة المرور لا تُقصّ: المسافة جزء منها.
 * يُزال فقط فاصل السطر (`\n` أو `\r\n`).
 */
export function parseOwnerInput(raw: string): OwnerInput {
  const lines = raw.split('\n').map((line) => line.replace(/\r$/, ''));
  if (lines.length > 4 && lines.slice(4).some((line) => line !== '')) {
    throw new Error('المدخل أكثر من أربعة أسطر.');
  }
  const [phone = '', username = '', password = '', confirm = ''] = lines;
  if (!phone.trim()) throw new Error('الرقم فارغ.');
  if (!username.trim()) throw new Error('الاسم الظاهر فارغ.');
  if (!password) throw new Error('كلمة المرور فارغة.');
  if (password !== confirm) throw new Error('كلمتا المرور غير متطابقتين.');
  return { phone: phone.trim(), username: username.trim(), password };
}

export async function createOwner(
  pool: pg.Pool,
  input: OwnerInput,
  log: (line: string) => void = console.log,
): Promise<OwnerResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // يمنع أي إدراجٍ في users حتى نهاية المعاملة، ويسمح بالقراءة.
    await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query<{ n: string }>('SELECT count(*)::text AS n FROM users');
    if (rows[0]!.n !== '0') {
      throw new Error(`رفض: جدول users فيه ${rows[0]!.n} صفّاً — المالك يُنشأ في قاعدةٍ فارغة فقط.`);
    }

    const result = await seedAdminUser(
      client,
      {
        SEED_ADMIN_PHONE: input.phone,
        SEED_ADMIN_PASSWORD: input.password,
        SEED_ADMIN_USERNAME: input.username,
      },
      () => undefined,
    );
    if (result.status !== 'created') throw new Error('لم يُنشأ الحساب.');

    const check = await client.query<{ n: string; supers: string }>(
      `SELECT count(*)::text AS n, count(*) FILTER (WHERE is_super_admin AND role = 'admin')::text AS supers
         FROM users`,
    );
    if (check.rows[0]!.n !== '1' || check.rows[0]!.supers !== '1') {
      throw new Error('التحقّق بعد الإدراج فشل — لا شيء حُفظ.');
    }
    await client.query('COMMIT');
    log(`Owner ready: ${result.phone} is_super_admin=true users=1 (password not logged).`);
    return { phone: result.phone, username: result.username };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const refusal = cliRefusal(config.appEnv, process.argv.slice(2));
  if (refusal) throw new Error(refusal);
  const input = parseOwnerInput(await readStdin());
  const pool = new pg.Pool({ connectionString: config.migrationDatabaseUrl || config.databaseUrl, max: 1 });
  try {
    await createOwner(pool, input);
  } finally {
    await pool.end();
  }
}

/** نفس حارس `migrate.ts`: الاستيراد لا يشغّل شيئاً، وأي شكّ يُفشل مغلقاً. */
function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(path.resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
