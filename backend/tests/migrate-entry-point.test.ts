import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';

const BACKEND_ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'src', 'database', 'migrations');
const EMPTY_ENV = path.join(BACKEND_ROOT, 'tests', 'fixtures', 'empty.env');

/** `node --import tsx` مباشرةً، كما في `process-lifecycle.test.ts` — لا وسيط يبتلع رمز الخروج. */
const NODE_ARGS = ['--import', 'tsx'];

/**
 * حدّ الاستيراد/التنفيذ في مُشغّل الهجرات.
 *
 * [CRITICAL] الخلل الذي يحرسه هذا الملف وقع فعلاً: `npm test` هاجر قاعدة
 * **التطوير**. السبب أن `scripts/migrate.ts` كان يستدعي `main()` عند
 * الاستيراد لا عند التشغيل المباشر فقط — حارسُه قارن `import.meta.url`
 * (عنوان الوحدة نفسها، وفيه `scripts/migrate` دائماً) بدل `process.argv[1]`،
 * فصار الشرط صادقاً تحت أي مشغّل: vitest وtsx وseed. و`tests/global-setup.ts`
 * يستورد `runMigrations` ليهاجر قاعدة الاختبار، فكان استيرادُه يهاجر معها
 * قاعدة `DATABASE_URL` أيضاً — بلا انتظار ولا إذن.
 *
 * القاعدة: **الاستيراد ≠ التنفيذ**. الوحدة تُصدِّر دوالّ فقط؛ الاتصال
 * والهجرة يحدثان بأمرٍ صريح (`npm run db:migrate`) لا غير. والشقّ الثاني
 * بالأهمية نفسها: الأمر الصريح ما زال يعمل ويُبلّغ فشله برمز خروج غير صفري
 * ويُغلق اتصاله في الحالتين.
 */

/**
 * قاعدة بيانات «طُعم»: مستمع TCP يعدّ من يطرق بابه ويغلق فوراً.
 *
 * لا قاعدة حقيقية تُلمس: أي اتصال يصل هنا يُحسب ويُقطع، فالعميل يرى
 * «Connection terminated» ولا يُنفَّذ شيء. عدّاد الاتصالات هو الشاهد.
 */
async function startCanary() {
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `postgres://canary:canary@127.0.0.1:${port}/canary`,
    connections: () => connections,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * بيئة عملية معزولة عن `.env` المطوّر تماماً.
 *
 * كل وصلات القاعدة الثلاث تُوجَّه إلى الهدف المطلوب، فلا يبقى مسارٌ يقود
 * إلى قاعدة التطوير مهما كان الذي يُقرأ منها. `NODE_ENV=development` لأن
 * الأمر الحقيقي (`db:migrate`) يعمل خارج vitest، ووراثة `test` من عملية
 * الاختبار تجعل الفحص يفحص شيئاً غير ما يُشغَّل فعلاً.
 */
function isolatedEnv(databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APP_ENV: 'dev',
    NODE_ENV: 'development',
    DOTENV_CONFIG_PATH: EMPTY_ENV,
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: '',
    TEST_DATABASE_URL: databaseUrl,
  };
}

/** يشغّل ملفاً بـtsx في عملية مستقلة ويعيد رمز الخروج والمخرجين. */
function run(script: string, env: NodeJS.ProcessEnv, args: string[] = []) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('node', [...NODE_ARGS, script, ...args], {
      cwd: BACKEND_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    // عمليةٌ لا تخرج = اتصالٌ لم يُغلق يُبقي حلقة الأحداث حيّة. المهلة تحوّل
    // التعليق إلى فشلٍ صريح بدل انتظار أبدي.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`لم تخرج العملية في الوقت المتاح\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`));
    }, 30_000);
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** يضيف معاملات استعلام إلى وصلة postgres (application_name, options…). */
function withParams(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [k, v] of Object.entries(params)) parsed.searchParams.set(k, v);
  return parsed.toString();
}

/** عدد الجلسات المفتوحة على القاعدة بهذا الاسم — صفرٌ يعني أن `end()` نُفِّذ. */
async function openSessions(applicationName: string): Promise<number> {
  const client = new pg.Client({ connectionString: config.testDatabaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1',
      [applicationName],
    );
    return rows[0]!.n;
  } finally {
    await client.end();
  }
}

describe('مُشغّل الهجرات: الاستيراد ≠ التنفيذ', () => {
  it('[CRITICAL] استيراد الوحدة لا يتصل بالقاعدة ولا يُهاجر ولا يُنهي العملية', async () => {
    const canary = await startCanary();
    try {
      const result = await run('tests/fixtures/import-migrate.ts', isolatedEnv(canary.url));

      // الشاهد الأول: لا أحد طرق باب `DATABASE_URL` أثناء الاستيراد.
      expect(canary.connections(), 'الاستيراد فتح اتصالاً بقاعدة DATABASE_URL').toBe(0);
      // الشاهد الثاني: لا أثر لـ`main()` في المخرج.
      expect(result.stdout).not.toContain('Migrating database');
      // الشاهد الثالث: المستورِد يعيش ويخرج بسلام — لا `process.exit(1)` من
      // وحدةٍ مستورَدة يقتل vitest إن كانت قاعدة التطوير غير متاحة.
      expect(result.code, `stderr: ${result.stderr}`).toBe(0);
      // والوحدة أدّت عملها الوحيد عند الاستيراد: تصدير الدوالّ.
      expect(JSON.parse(result.stdout.trim())).toEqual({
        exports: ['resetDatabase', 'runMigrations'],
      });
    } finally {
      await canary.close();
    }
  }, 60_000);
});

describe('مُشغّل الهجرات: التشغيل المباشر', () => {
  it('[CRITICAL] `tsx scripts/migrate.ts` يُهاجر ويخرج بالرمز صفر', async () => {
    // قاعدة الاختبار مهاجَرة كاملةً عبر global-setup، فالتشغيل هنا يقرأ
    // حالتها ويقارنها بالملفات ويجد لا شيء معلّقاً — وهذا هو المسار الحقيقي
    // نفسه الذي يسلكه `npm run db:migrate` على قاعدة محدّثة.
    const result = await run('scripts/migrate.ts', isolatedEnv(config.testDatabaseUrl));

    expect(result.code, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Migrating database');
    expect(result.stdout).toContain('no pending migrations');
    expect(result.stdout).toContain('Done.');

    // ما رآه المُشغّل «مطبَّقاً» هو مجموع الملفات فعلاً، لا قاعدةٌ أخرى فارغة.
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'));
    const client = new pg.Client({ connectionString: config.testDatabaseUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrations');
      expect(rows[0]!.n).toBe(files.length);
    } finally {
      await client.end();
    }
  }, 60_000);

  it('[CRITICAL] التشغيل المباشر هو الذي يتصل بـDATABASE_URL — وفشلُ الاتصال رمزٌ غير صفري', async () => {
    // نفس الطُّعم الذي لم يُطرق بابه عند الاستيراد يُطرق هنا: هذا هو الفرق
    // كله بين الاستيراد والتنفيذ.
    const canary = await startCanary();
    try {
      const result = await run('scripts/migrate.ts', isolatedEnv(canary.url));

      expect(canary.connections()).toBeGreaterThanOrEqual(1);
      expect(result.code).not.toBe(0);
      // الخطأ يُرى ولا يُبتلع.
      expect(result.stderr.trim()).not.toBe('');
    } finally {
      await canary.close();
    }
  }, 60_000);

  it('[CRITICAL] فشل خطوة الهجرة نفسها يُبلَّغ برمز غير صفري ورسالة مرئية', async () => {
    // جلسة للقراءة فقط: الاتصال ينجح، والقفل الاستشاري يُؤخذ، ثم تسقط أول
    // كتابة (`CREATE TABLE IF NOT EXISTS schema_migrations`). فشلٌ حقيقي بعد
    // الاتصال — لا مجرّد تعذّر وصول — ولا يمكنه أن يمسّ القاعدة بحرف.
    const readOnly = withParams(config.testDatabaseUrl, {
      options: '-c default_transaction_read_only=on',
    });
    const result = await run('scripts/migrate.ts', isolatedEnv(readOnly));

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('read-only');
  }, 60_000);
});

describe('مُشغّل الهجرات: دورة حياة الاتصال', () => {
  it('runMigrations يُغلق اتصاله بعد النجاح', async () => {
    const { runMigrations } = await import('../scripts/migrate.js');
    const name = `migrate-test-ok-${process.pid}`;

    const applied = await runMigrations(withParams(config.testDatabaseUrl, { application_name: name }));

    expect(applied).toEqual([]); // global-setup سبقنا — لا شيء معلّق.
    expect(await openSessions(name)).toBe(0);
  });

  it('[CRITICAL] runMigrations يُغلق اتصاله بعد الفشل أيضاً', async () => {
    // فشلٌ بعد الاتصال وأخذ القفل — أخطر حالة: اتصالٌ متروك يحمل قفلاً
    // استشارياً يُعطّل كل مُهاجِر لاحق إلى أن تُقتل الجلسة.
    const { runMigrations } = await import('../scripts/migrate.js');
    const name = `migrate-test-fail-${process.pid}`;
    const readOnly = withParams(config.testDatabaseUrl, {
      application_name: name,
      options: '-c default_transaction_read_only=on',
    });

    await expect(runMigrations(readOnly)).rejects.toThrow(/read-only/);
    expect(await openSessions(name)).toBe(0);
  });
});
