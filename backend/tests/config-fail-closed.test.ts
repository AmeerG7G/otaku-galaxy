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
 * الافتراضي، ووصلة القاعدة، والوسيط والعنوان العام. (كان هنا أيضاً مزوّد
 * الرسائل ورمز التحقق الثابت — أُزيلا مع رمز SMS كلّه.) كلها ممنوعة في
 * `staging`/`prod` ومسموحة في `dev`. فحين
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
    SMS_BASE_URL: 'https://sms.example.com/send',
    SMS_API_KEY: 'key',
    SMS_SENDER: 'OtakuGalaxy',
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

  it('[CRITICAL] الاستماع على الواجهة المحلية افتراضياً خارج التطوير', async () => {
    // nginx يصل على 127.0.0.1؛ منفذٌ على العنوان العام يتجاوز TLS وحدوده.
    for (const appEnv of ['staging', 'prod']) {
      const result = await boot({ ...REAL_SECRETS, APP_ENV: appEnv, NODE_ENV: 'production', HOST: undefined });
      expect(result.ok, appEnv).toBe(true);
      expect(JSON.parse((result as { stdout: string }).stdout).host, appEnv).toBe('127.0.0.1');
    }
    // صورة Docker تطلب كل الواجهات صراحةً — الحاوية معزولة ومنفذها محلّي على المضيف.
    const docker = await boot({ ...REAL_SECRETS, APP_ENV: 'prod', NODE_ENV: 'production', HOST: '0.0.0.0' });
    expect(JSON.parse((docker as { stdout: string }).stdout).host).toBe('0.0.0.0');
    // التطوير كما كان: كل الواجهات (الهاتف على الشبكة المحلية).
    const dev = await boot({ APP_ENV: 'dev', NODE_ENV: 'development', HOST: undefined });
    expect(JSON.parse((dev as { stdout: string }).stdout).host).toBeNull();
  });

  it('HOST بصيغة غير صالحة يُرفض', async () => {
    const result = await boot({ ...REAL_SECRETS, APP_ENV: 'prod', NODE_ENV: 'production', HOST: 'api.example.com' });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('HOST');
  });

  it('[CRITICAL] WHATSAPP_VERIFY_MODE: الإنتاج يرفض auto، والقيمة المجهولة تُرفض، والافتراض off', async () => {
    const PROD = { ...REAL_SECRETS, APP_ENV: 'prod', NODE_ENV: 'production' };
    const META = {
      WHATSAPP_PROVIDER: 'meta',
      WHATSAPP_APP_SECRET: 'a'.repeat(40),
      WHATSAPP_VERIFY_TOKEN: 'v'.repeat(20),
      WHATSAPP_ACCESS_TOKEN: 't'.repeat(40),
      WHATSAPP_PHONE_NUMBER_ID: '123456789',
      WHATSAPP_BUSINESS_NUMBER: '07701234567',
      WHATSAPP_TOKEN_PEPPER: 'p'.repeat(64),
    };
    const defaulted = await boot({ ...PROD, WHATSAPP_VERIFY_MODE: undefined });
    expect(JSON.parse((defaulted as { stdout: string }).stdout).whatsappMode).toBe('off');
    const explicitOff = await boot({ ...PROD, WHATSAPP_VERIFY_MODE: 'off' });
    expect(explicitOff.ok).toBe(true);
    // كل الأسرار حاضرة ومع ذلك يسقط: الإنتاج لا يعرف هذا الوضع.
    const prodAuto = await boot({ ...PROD, ...META, WHATSAPP_VERIFY_MODE: 'auto' });
    expect(prodAuto.ok).toBe(false);
    expect((prodAuto as { stderr: string }).stderr).toContain('مرفوض في الإنتاج');
    const typo = await boot({ ...REAL_SECRETS, APP_ENV: 'staging', NODE_ENV: 'production', WHATSAPP_VERIFY_MODE: 'on' });
    expect(typo.ok).toBe(false);
    expect((typo as { stderr: string }).stderr).toContain('WHATSAPP_VERIFY_MODE');
  }, 60_000);

  it('[CRITICAL] staging بـauto: fixture مرفوض، والأسرار الناقصة تُسمّى، وكاملها يُقلع', async () => {
    const STAGING = { ...REAL_SECRETS, APP_ENV: 'staging', NODE_ENV: 'production', WHATSAPP_VERIFY_MODE: 'auto' };
    const fixture = await boot({ ...STAGING, WHATSAPP_PROVIDER: 'fixture' });
    expect(fixture.ok).toBe(false);
    expect((fixture as { stderr: string }).stderr).toContain('WHATSAPP_PROVIDER=fixture');
    const missing = await boot({ ...STAGING, WHATSAPP_PROVIDER: 'meta' });
    expect(missing.ok).toBe(false);
    const stderr = (missing as { stderr: string }).stderr;
    for (const name of ['WHATSAPP_APP_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_BUSINESS_NUMBER', 'WHATSAPP_TOKEN_PEPPER']) {
      expect(stderr).toContain(name);
    }
    const full = await boot({
      ...STAGING,
      WHATSAPP_PROVIDER: 'meta',
      WHATSAPP_APP_SECRET: 'a'.repeat(40),
      WHATSAPP_VERIFY_TOKEN: 'v'.repeat(20),
      WHATSAPP_ACCESS_TOKEN: 't'.repeat(40),
      WHATSAPP_PHONE_NUMBER_ID: '123456789',
      WHATSAPP_BUSINESS_NUMBER: '07701234567',
      WHATSAPP_TOKEN_PEPPER: 'p'.repeat(64),
    });
    expect(full.ok).toBe(true);
    expect(JSON.parse((full as { stdout: string }).stdout).whatsappMode).toBe('auto');
    // الأسرار لا تظهر في أي مخرج.
    expect((full as { stdout: string }).stdout).not.toContain('a'.repeat(40));
  }, 60_000);

  it('BFF_SHARED_SECRET اختياري، وقصيره يُرفض', async () => {
    const without = await boot({ ...REAL_SECRETS, APP_ENV: 'prod', NODE_ENV: 'production', BFF_SHARED_SECRET: undefined });
    expect(JSON.parse((without as { stdout: string }).stdout).bffSharedSecretSet).toBe(false);
    const short = await boot({ ...REAL_SECRETS, APP_ENV: 'prod', NODE_ENV: 'production', BFF_SHARED_SECRET: 'short' });
    expect(short.ok).toBe(false);
    expect((short as { stderr: string }).stderr).toContain('BFF_SHARED_SECRET');
    const set = await boot({ ...REAL_SECRETS, APP_ENV: 'prod', NODE_ENV: 'production', BFF_SHARED_SECRET: 'b'.repeat(64) });
    expect(JSON.parse((set as { stdout: string }).stdout).bffSharedSecretSet).toBe(true);
  });

});
