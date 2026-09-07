import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * تشغيل قراءة الإعدادات في عملية منفصلة ببيئة محدَّدة.
 *
 * وحدة الإعدادات تُقيَّم مرة واحدة عند الاستيراد، فلا سبيل لفحص سلوك
 * الإقلاع من داخل عملية الاختبارات نفسها.
 */
async function boot(env: Record<string, string | undefined>) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...env })) {
    if (v !== undefined) clean[k] = v;
  }
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete clean[k];
  }
  // عزل تام عن `.env` المطوّر، وإلا لم يكن الغياب غياباً.
  clean.DOTENV_CONFIG_PATH = path.join(BACKEND_ROOT, 'tests', 'fixtures', 'empty.env');
  try {
    const { stdout } = await execFileAsync(
      'npx',
      ['tsx', path.join('tests', 'fixtures', 'print-config.ts')],
      { cwd: BACKEND_ROOT, env: clean, timeout: 60_000 },
    );
    return { ok: true as const, stdout: stdout.trim() };
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string };
    return { ok: false as const, stderr: (e.stderr ?? '') + (e.stdout ?? '') };
  }
}

/**
 * البيئة تُحسم صراحةً أو يسقط الإقلاع.
 *
 * [CRITICAL] كل حارس أمني في `config` مربوط بـ`appEnv`: مفتاح التوقيع
 * الافتراضي، ومزوّد الرسائل `console` الذي يطبع الرمز في السجلّ، والرمز
 * الثابت `123456`. كلها ممنوعة في `staging`/`prod` ومسموحة في `dev`. فحين
 * كانت البيئة تسقط إلى `dev` بصمت عند غياب المتغيّر أو خطأ في كتابته، كانت
 * نشرةٌ حقيقية تحصل على **كل** بدائل التطوير دفعةً واحدة وتبدو سليمة.
 *
 * هذه السويت تحرس أن ذلك الباب مغلق.
 */
describe('APP_ENV يفشل مغلقاً', () => {
  const REAL_SECRETS = {
    JWT_SECRET: 'c'.repeat(64),
    DATABASE_URL: 'postgres://user:pass@db.example.com:5432/otaku',
    TRUST_PROXY: '1',
    PUBLIC_BASE_URL: 'https://api.example.com',
    SMS_PROVIDER: 'http',
    SMS_BASE_URL: 'https://sms.example.com/send',
    SMS_API_KEY: 'key',
    SMS_SENDER: 'OtakuGalaxy',
    DEV_OTP_ENABLED: undefined,
  };

  it('[CRITICAL] NODE_ENV=production بلا APP_ENV → سقوط لا افتراض', async () => {
    // الخادم لا يملك ما يميّز به الإنتاج من الاختبار المسبق، والتخمين بينهما
    // ليس من حقّه — ولا يجوز أن ينزلق إلى `dev` بأسراره المعروفة.
    const result = await boot({ ...REAL_SECRETS, APP_ENV: undefined, NODE_ENV: 'production' });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('APP_ENV');
  });

  it('[CRITICAL] قيمة APP_ENV غير معروفة → سقوط لا انزلاق إلى dev', async () => {
    // مطبعةٌ واحدة (`prodution`) كانت تعني بيئة تطوير كاملة على خادم حقيقي.
    for (const typo of ['prodution', 'produciton', 'PROD_', 'live']) {
      const result = await boot({ ...REAL_SECRETS, APP_ENV: typo, NODE_ENV: 'production' });
      expect(result.ok, `كان يجب رفض APP_ENV=${typo}`).toBe(false);
      expect((result as { stderr: string }).stderr).toContain('APP_ENV');
    }
  });

  it('التطوير يبقى بلا إعداد — لا تُكسر تجربة المطوّر', async () => {
    const result = await boot({
      APP_ENV: undefined,
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
      DATABASE_URL: undefined,
      TRUST_PROXY: undefined,
      PUBLIC_BASE_URL: undefined,
      SMS_PROVIDER: undefined,
      DEV_OTP_ENABLED: undefined,
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse((result as { stdout: string }).stdout).appEnv).toBe('dev');
  });

  it('الأسماء المعتمدة الثلاثة تُقبل', async () => {
    for (const [value, expected] of [
      ['dev', 'dev'],
      ['development', 'dev'],
      ['staging', 'staging'],
      ['stage', 'staging'],
      ['prod', 'prod'],
      ['production', 'prod'],
    ] as const) {
      const result = await boot({
        ...REAL_SECRETS,
        APP_ENV: value,
        NODE_ENV: value === 'dev' || value === 'development' ? 'development' : 'production',
      });
      expect(result.ok, `APP_ENV=${value}`).toBe(true);
      expect(JSON.parse((result as { stdout: string }).stdout).appEnv).toBe(expected);
    }
  });

  it('[CRITICAL] TRUST_PROXY مطلوب صراحةً خارج التطوير', async () => {
    // بديله `false` يعمل ويعطي سلوكاً خاطئاً: خلف الوسيط تبدو كل الطلبات من
    // عنوان واحد، فينهار حدّ المعدّل إلى دلو مشترك ويُقفل التسجيل على الجميع.
    const result = await boot({ ...REAL_SECRETS, APP_ENV: 'staging', NODE_ENV: 'production', TRUST_PROXY: undefined });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('TRUST_PROXY');
  });

  it('[CRITICAL] PUBLIC_BASE_URL مطلوب صراحةً خارج التطوير', async () => {
    // بديله `http://localhost` يجعل كل رابط صورة يشير إلى الهاتف نفسه.
    const result = await boot({ ...REAL_SECRETS, APP_ENV: 'prod', NODE_ENV: 'production', PUBLIC_BASE_URL: undefined });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('PUBLIC_BASE_URL');
  });

  it('PUBLIC_BASE_URL بصيغة غير صالحة يُرفض', async () => {
    const result = await boot({ ...REAL_SECRETS, APP_ENV: 'prod', NODE_ENV: 'production', PUBLIC_BASE_URL: 'api.example.com' });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('PUBLIC_BASE_URL');
  });

  it('[CRITICAL] DEV_OTP_ENABLED ممنوع خارج التطوير', async () => {
    for (const env of ['staging', 'prod']) {
      const result = await boot({ ...REAL_SECRETS, APP_ENV: env, NODE_ENV: 'production', DEV_OTP_ENABLED: 'true' });
      expect(result.ok, env).toBe(false);
      expect((result as { stderr: string }).stderr).toContain('DEV_OTP_ENABLED');
    }
  });
});
