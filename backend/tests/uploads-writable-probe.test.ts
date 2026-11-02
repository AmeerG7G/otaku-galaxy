import { chmod, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeUploadsWritable } from '../src/storage/index.js';

/**
 * فحص الكتابة عند الإقلاع (2026-10-26).
 *
 * رفع البنرات على الاختبار المسبق فشل بـ`STORAGE_FAILED` وسببه في سجلّ الحاوية
 * وحده. الحالة المحاكاة هنا: مجلّد غرضٍ واحد لا يكتبه مستخدم الخادم (أنشأه
 * الجذر)، والبقية سليمة — فيفشل غرضٌ واحد ويُسمّى في السجلّ برمز الخطأ.
 */
const now = new Date('2026-10-26T12:00:00Z');
let root: string | null = null;

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) {
    await chmod(path.join(root, 'banner'), 0o755).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    root = null;
  }
});

describe('probeUploadsWritable', () => {
  it('ينجح بصمت حين تُكتب كل المجلّدات، ولا يترك ملفّ فحص', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'og-probe-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const failures = await probeUploadsWritable(['product', 'banner'], root, now);

    expect(failures).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(await readdir(path.join(root, 'banner/2026/10'))).toEqual([]);
  });

  it.skipIf(process.getuid?.() === 0)(
    '[CRITICAL] مجلّد غرضٍ غير قابل للكتابة يُسمّى برمز خطئه، والبقية لا تتأثّر',
    async () => {
      root = await mkdtemp(path.join(tmpdir(), 'og-probe-'));
      await mkdir(path.join(root, 'banner'));
      await chmod(path.join(root, 'banner'), 0o555);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const failures = await probeUploadsWritable(['product', 'banner'], root, now);

      expect(failures).toEqual([{ purpose: 'banner', code: 'EACCES' }]);
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).toContain('purpose=banner');
      expect(line).toContain('code=EACCES');
      // المسار المطلق لا يُطبع — الغرض والشهر يكفيان المشغّل.
      expect(line).not.toContain(root);
    },
  );
});
