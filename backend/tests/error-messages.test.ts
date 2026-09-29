import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isErrorMessageCovered,
  KNOWN_ERROR_MESSAGES,
  localizeErrorMessage,
} from '../src/domain/errorMessages.js';

/**
 * رسائل الخطأ التي يراها الزبون تخرج بلغته — لا عربيةً في واجهةٍ كردية.
 *
 * [CRITICAL] المسرد في `domain/errorMessages.ts` مفتاحُه النصُّ العربي نفسه
 * كما يُرمى في الخدمة. فأي رسالةٍ تُضاف أو تُعدَّل في خدمةٍ يراها الزبون ولا
 * تُضاف هنا تعود إليه عربيةً بصمت — وهذا الاختبار هو ما يمنع الصمت: يمسح
 * مواضع الرمي نفسها ويسأل المسرد عن كلٍّ منها.
 *
 * ما يُمسح: الخدمات والوسائط التي تخدم مسارات الزبون. ما لا يُمسح عمداً:
 * `adminService` وما يخدم اللوحة وحدها — اللوحة عربية.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

/** ملفّات ترمي أخطاءً يراها الزبون. */
const CUSTOMER_FACING = [
  'services/orderService.ts',
  'services/authService.ts',
  'services/reviewsService.ts',
  'services/collectionsService.ts',
  'services/loyaltyRewardsService.ts',
  'services/cartService.ts',
  'services/notificationsService.ts',
  'services/birthdayService.ts',
  'services/restockService.ts',
  'services/notificationPrefsService.ts',
  'services/pushService.ts',
  'middleware/app-version.ts',
  'services/favoritesService.ts',
  'services/catalogService.ts',
  'services/mediaService.ts',
  'middleware/auth.ts',
  'middleware/error-handler.ts',
  'middleware/upload.ts',
  'controllers/mediaController.ts',
  'utils/errors.ts',
  'utils/zod.ts',
];

/**
 * رسائل تخصّ المسؤول وحده رغم وقوعها في ملفٍّ يخدم الزبون — تُستثنى بالنصّ.
 * `orderService.updateStatus` لا يصل إليه إلا المسؤول من اللوحة، ومثله
 * `consumeStockOnApproval`: القبول انتقالٌ إداري، وتأكيدُ استلام الزبون لا
 * يمرّ به (ليس خروجاً من الانتظار).
 */
const ADMIN_ONLY_TEMPLATES = [
  /^غير مسموح بالانتقال من /,
  /^«\$\{line\.name\}» لم يعد موجوداً في الكتالوج$/,
];

const ARABIC = /[؀-ۿ]/;

/** يلتقط `Errors.x('…')` و`Errors.x(\`…\`)` ورسائل الحدود `message: '…'` والافتراضيات `message = '…'`. */
function extractMessages(source: string): { literal: string[]; templates: string[] } {
  const literal: string[] = [];
  const templates: string[] = [];
  const single = /Errors\.\w+\(\s*'([^']*)'|message(?: =|:)\s*'([^']*)'/g;
  const backtick = /Errors\.\w+\(\s*`([^`]*)`/g;
  for (const m of source.matchAll(single)) {
    const text = m[1] ?? m[2] ?? '';
    if (ARABIC.test(text)) literal.push(text);
  }
  for (const m of source.matchAll(backtick)) {
    const text = m[1] ?? '';
    if (ARABIC.test(text)) templates.push(text);
  }
  return { literal, templates };
}

/** يحوّل قالباً `${x}` إلى مثالٍ ملموس يقبله التعبير النمطي المقابل. */
function instantiate(template: string): string {
  return template
    .replace(/\$\{item\.productName\}/g, 'بەرهەمی تاقیکردنەوە')
    .replace(/\$\{[^}]+\}/g, '7');
}

describe('[CRITICAL] رسائل الخطأ التي يراها الزبون مترجَمة إلى الكردية', () => {
  it('كل رسالة حرفية في الملفّات التي يراها الزبون مغطّاة في المسرد', async () => {
    const missing: string[] = [];
    for (const rel of CUSTOMER_FACING) {
      const source = await readFile(path.join(SRC, rel), 'utf8');
      for (const text of extractMessages(source).literal) {
        if (!isErrorMessageCovered(text)) missing.push(`${rel}: ${text}`);
      }
    }
    expect(missing, `رسائل بلا ترجمة كردية:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('كل قالب (بمتغيّرات) يطابقه تعبيرٌ نمطي في المسرد', async () => {
    const missing: string[] = [];
    for (const rel of CUSTOMER_FACING) {
      const source = await readFile(path.join(SRC, rel), 'utf8');
      for (const template of extractMessages(source).templates) {
        if (ADMIN_ONLY_TEMPLATES.some((re) => re.test(template))) continue;
        const sample = instantiate(template);
        if (!isErrorMessageCovered(sample)) missing.push(`${rel}: ${template}`);
      }
    }
    expect(missing, `قوالب بلا ترجمة كردية:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('القوالب تُعيد المتغيّرات في موضعها', () => {
    expect(localizeErrorMessage('الكمية المطلوبة تتجاوز المخزون المتاح (3)', 'ckb')).toContain('(3)');
    expect(localizeErrorMessage('مخزون «قبعة لوفي» غير كافٍ (المتاح: 2)', 'ckb')).toContain('«قبعة لوفي»');
    expect(localizeErrorMessage('تحتاج 100 نقطة لفتح هذه المزيّة', 'ckb')).toContain('100');
  });

  it('العربية تعود كما هي، وما لا يُعرف يعود عربياً لا فارغاً', () => {
    for (const ar of KNOWN_ERROR_MESSAGES) {
      expect(localizeErrorMessage(ar, 'ar')).toBe(ar);
    }
    expect(localizeErrorMessage('نصٌّ لا يعرفه المسرد', 'ckb')).toBe('نصٌّ لا يعرفه المسرد');
  });

  it('لا ترجمة كردية فارغة أو مطابقة للعربية', () => {
    for (const ar of KNOWN_ERROR_MESSAGES) {
      const ck = localizeErrorMessage(ar, 'ckb');
      expect(ck.trim().length, ar).toBeGreaterThan(0);
      expect(ck, ar).not.toBe(ar);
    }
  });
});
