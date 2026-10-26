import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/index.js';
import { startPushOutboxScheduler } from '../src/jobs/pushOutboxJob.js';
import { resetPushProvider } from '../src/services/push/index.js';

/**
 * [SECURITY] أسرار Firebase/FCM لا تدخل Git ولا السجلّات (STEP 67، Gate J).
 *
 * السرّ الوحيد هو مفتاح حساب الخدمة على الخادم (`FCM_PRIVATE_KEY`)، ومكانه ملفّ
 * البيئة على الخادم وحده. هذا الملفّ يفحص **المستودع كلّه** (الملفات المتتبَّعة
 * بمحتواها الحالي)، لا مساراً واحداً: ملفّ حساب خدمة يُنسخ إلى أي مجلد، أو مفتاحٌ
 * يُلصق في مثالٍ أو اختبار، يسقط هنا قبل أن يُدفع.
 */
const ROOT = path.resolve(process.cwd(), '..');
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** ملفّاتٌ متتبَّعة تحوي النصّ حرفياً — `git grep` يخرج بـ1 حين لا تطابق. */
function trackedFilesContaining(text: string): string[] {
  try {
    return git('grep', '-lIF', '-e', text).split('\n').filter(Boolean);
  } catch (error) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

// مُركَّبةٌ في وقت التشغيل كي لا يطابق هذا الملفّ نفسَه.
const PEM_MARKER = ['PRIVATE', 'KEY-----'].join(' ');
const SERVICE_ACCOUNT_MARKER = ['"type"', '"service_account"'].join(': ');

describe('[SECURITY] لا سرّ Firebase في Git', () => {
  it('لا ملفّ حساب خدمة ولا google-services.json ولا GoogleService-Info.plist متتبَّع', () => {
    const banned = git('ls-files')
      .split('\n')
      .filter((file) =>
        /(^|\/)(google-services\.json|GoogleService-Info\.plist)$|firebase-adminsdk[^/]*\.json$|service[-_]?account[^/]*\.json$/i.test(file),
      );
    expect(banned).toEqual([]);
  });

  it('لا ملفّ متتبَّع يحوي مفتاحاً خاصّاً (PEM) أو جسم حساب خدمة', () => {
    // الماسح نفسه يعمل: نصٌّ معروف في ملفٍّ متتبَّع يُوجد — لا «لا شيء» صامت.
    expect(trackedFilesContaining('Otaku Galaxy API running')).toContain('backend/src/server.ts');
    expect(trackedFilesContaining(PEM_MARKER)).toEqual([]);
    expect(trackedFilesContaining(SERVICE_ACCOUNT_MARKER)).toEqual([]);
  });

  it('أمثلة البيئة تشحن FCM_PRIVATE_KEY فارغاً', () => {
    const examples = git('ls-files', 'backend').split('\n').filter((f) => /\.env[^/]*\.example$/.test(f));
    expect(examples.length).toBeGreaterThan(0);
    for (const file of examples) {
      const keyLines = readFileSync(path.join(ROOT, file), 'utf8')
        .split('\n')
        .filter((line) => /^\s*FCM_PRIVATE_KEY\s*=/.test(line));
      for (const line of keyLines) expect(line.trim(), file).toBe('FCM_PRIVATE_KEY=');
    }
  });
});

describe('[SECURITY] إقلاع الدفع لا يطبع المفتاح ولا بريد حساب الخدمة', () => {
  const saved = { ...config.push };

  afterEach(() => {
    Object.assign(config.push, saved);
    resetPushProvider();
    vi.restoreAllMocks();
  });

  function bootOutput(): string {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      });
    }
    resetPushProvider();
    const stop = startPushOutboxScheduler();
    stop();
    return lines.join('\n');
  }

  it('إعدادٌ ناقص: السبب يسمّي المتغيّر الناقص وحده — لا قيمة غيره', () => {
    Object.assign(config.push, {
      provider: 'fcm',
      projectId: 'leakprobe-project',
      clientEmail: 'leakprobe@leakprobe.iam.gserviceaccount.com',
      privateKey: '',
    });
    const output = bootOutput();
    expect(output).toContain('FCM_PRIVATE_KEY');
    expect(output).not.toContain('leakprobe');
  });

  it('مفتاحٌ موجود والبريد ناقص: المفتاح لا يظهر في أي سطر', () => {
    // كل سطر مُركَّب: نصٌّ حرفيّ للعلامة في هذا الملفّ كان يطابقه الماسح نفسه.
    const fakeKey = [['-----BEGIN', PEM_MARKER].join(' '), 'LEAKPROBEKEYMATERIAL', ['-----END', PEM_MARKER].join(' ')].join('\n');
    Object.assign(config.push, { provider: 'fcm', projectId: 'p', clientEmail: '', privateKey: fakeKey });
    const output = bootOutput();
    expect(output).toContain('FCM_CLIENT_EMAIL');
    expect(output).not.toContain('LEAKPROBEKEYMATERIAL');
  });
});
