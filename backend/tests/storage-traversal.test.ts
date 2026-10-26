import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { storage, uploadsRoot } from '../src/storage/index.js';

/**
 * حارس الخروج من جذر التخزين.
 *
 * `remove` تأخذ مفتاحاً من القاعدة وتحذف ملفاً. الحارس هو ما يمنع مفتاحاً
 * فاسداً من أن يحذف خارج مجلد الرفع. لم يكن مغطّى بأي اختبار، فبقي عطبه
 * (مقارنة حروف لا حدود مسار) غير مرئي.
 */
const sibling = `${uploadsRoot}-backup`;
const sentinel = path.join(sibling, 'must-survive.txt');

afterAll(async () => {
  await rm(sibling, { recursive: true, force: true });
});

describe('حارس المسار في التخزين المحلي', () => {
  it('[CRITICAL] لا يحذف من مجلد شقيق يبدأ اسمه باسم الجذر', async () => {
    // هذا هو العطب بعينه: `/…/uploads-backup` يجتاز `startsWith('/…/uploads')`
    // لأنه يطابقه حرفاً بحرف، مع أنه خارج الجذر تماماً.
    await mkdir(sibling, { recursive: true });
    await writeFile(sentinel, 'ملف خارج جذر التخزين');

    await storage.remove(`../${path.basename(sibling)}/must-survive.txt`);

    expect(existsSync(sentinel)).toBe(true);
  });

  it('لا يحذف عبر صعود صريح خارج الجذر', async () => {
    await mkdir(sibling, { recursive: true });
    await writeFile(sentinel, 'ملف خارج جذر التخزين');

    await storage.remove('../../../../../../etc/passwd');
    await storage.remove(`../${path.basename(sibling)}/../${path.basename(sibling)}/must-survive.txt`);

    expect(existsSync(sentinel)).toBe(true);
    expect(existsSync('/etc/passwd')).toBe(true);
  });

  it('يحذف فعلاً ما هو داخل الجذر — الحارس لا يمنع الاستعمال المشروع', async () => {
    // حارس يرفض كل شيء «آمن» أيضاً؛ الاختبار يثبت أنه ما زال يعمل.
    const dir = path.join(uploadsRoot, 'product');
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, 'traversal-test-target.txt');
    await writeFile(target, 'x');

    await storage.remove('product/traversal-test-target.txt');

    expect(existsSync(target)).toBe(false);
  });
});
