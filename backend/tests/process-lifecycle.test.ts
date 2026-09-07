import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BACKEND_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * يُشغَّل `node` مباشرةً لا عبر `npx`.
 *
 * [CRITICAL] هذا ليس تفصيلاً في الاختبار بل جوهر ما يُختبَر. `npx` يلفّ
 * العملية بعمليةٍ وسيطة تبتلع الإشارة ولا تمرّرها، فيبدو الخادم عاجزاً عن
 * الإغلاق المنظَّم وهو لم يستلم الإشارة أصلاً. هذا بالضبط ما يحدث داخل
 * الحاوية حين تعمل node بالمعرّف 1 بلا `dumb-init` — ولذلك أُضيف في
 * `Dockerfile`. الاختبار يشغّل عملية node واحدة كما يفعل Docker وPM2.
 */
const NODE_ARGS = ['--import', 'tsx'];

/**
 * بيئة إقلاع صالحة للتطوير، معزولة عن `.env` المطوّر ومنفذ عشوائي.
 *
 * `PORT=0` يجعل النظام يختار منفذاً حرّاً، فلا يتصادم الاختبار مع خادم
 * تطوير يعمل على 4000.
 */
const ENV = {
  ...process.env,
  APP_ENV: 'dev',
  NODE_ENV: 'development',
  PORT: '0',
  SMS_PROVIDER: 'noop',
  DEV_OTP_ENABLED: undefined as unknown as string,
  DOTENV_CONFIG_PATH: path.join(BACKEND_ROOT, 'tests', 'fixtures', 'empty.env'),
};

/** ينتظر ظهور سطر الإقلاع على المخرج، أو يفشل بمهلة. */
function waitForListening(child: ChildProcess, timeoutMs = 30_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('لم يُقلع الخادم في الوقت المتاح')), timeoutMs);
    let buffered = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      buffered += chunk.toString();
      if (buffered.includes('Otaku Galaxy API running')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`خرجت العملية قبل الإقلاع برمز ${code}`));
    });
  });
}

/** ينتظر خروج العملية ويعيد رمز الخروج والإشارة. */
function waitForExit(child: ChildProcess, timeoutMs = 20_000) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('لم تخرج العملية في الوقت المتاح'));
    }, timeoutMs);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

/**
 * دورة حياة العملية — ما يعتمد عليه مديرُ التشغيل.
 *
 * [CRITICAL] هذه ليست تفاصيل داخلية: Docker وPM2 يقرآن هذا السلوك بالضبط.
 * الإشارة يجب أن تُنهي العملية برمز صفر (توقّف مقصود، لا تُعِد التشغيل)،
 * والعطل غير القابل للتعافي برمز غير صفري (سقوط، أعِد التشغيل). خلطُ
 * الرمزين يعني إما حاوياً يُعاد تشغيله عند كل نشر مقصود، أو خادماً ساقطاً
 * يظنّه المدير متوقّفاً عن عمد فيتركه ميتاً.
 */
describe('دورة حياة العملية', () => {
  it('[CRITICAL] SIGTERM يُغلق بهدوء ويخرج بالرمز صفر', async () => {
    const child = spawn('node', [...NODE_ARGS, 'src/server.ts'], {
      cwd: BACKEND_ROOT,
      env: ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForListening(child);
    child.kill('SIGTERM');
    const { code, signal } = await waitForExit(child);

    // خرج بنفسه لا بقتلٍ خارجي: لو عَلِق لأنهته المهلة بـSIGKILL.
    expect(signal).toBeNull();
    expect(code).toBe(0);
  }, 60_000);

  it('SIGINT يُعامَل بالسلوك نفسه', async () => {
    const child = spawn('node', [...NODE_ARGS, 'src/server.ts'], {
      cwd: BACKEND_ROOT,
      env: ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForListening(child);
    child.kill('SIGINT');
    const { code } = await waitForExit(child);
    expect(code).toBe(0);
  }, 60_000);

  it('[CRITICAL] الرفض غير المعالَج يُنهي العملية برمز غير صفري', async () => {
    // المواصلة بعد عطل غير قابل للتعافي أخطر من التوقّف: قد تكون معاملةٌ
    // نصفَ منفَّذة أو قفلٌ لم يُحرَّر، وخادمٌ يردّ ببيانات فاسدة لا يُلاحَظ.
    const child = spawn('node', [...NODE_ARGS, 'tests/fixtures/server-fatal.ts'], {
      cwd: BACKEND_ROOT,
      env: ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });

    await waitForListening(child);
    const { code } = await waitForExit(child);

    expect(code).not.toBe(0);
    // العطل يُسجَّل ولا يُبتلع.
    expect(stderr).toContain('unhandledRejection');
  }, 60_000);
});
