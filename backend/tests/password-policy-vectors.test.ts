import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localizeErrorMessage } from '../src/domain/errorMessages.js';
import POLICY from '../src/domain/passwordPolicy.data.json' with { type: 'json' };
import { PASSWORD_MESSAGES, passwordIdentityCode } from '../src/domain/passwordPolicy.js';
import { adminNewPasswordSchema, newPasswordSchema } from '../src/validators/auth.js';

/**
 * المتّجهات المشتركة (STEP 85): الملف نفسه تشغّله سويت Flutter وسويت اللوحة.
 * هنا يُثبت أن الخادم — المرجع — يعطي ما في الملف؛ هناك يُثبت أن العميلين
 * يطابقانه. أيّ تعديلٍ في القواعد يكسر إحدى السويتات الثلاث حتى تتطابق.
 */
interface Vector {
  password: string;
  admin?: boolean;
  phone?: string;
  username?: string;
  expect: string | null;
}

const { cases } = JSON.parse(
  readFileSync(new URL('./fixtures/password-policy-vectors.json', import.meta.url), 'utf8'),
) as { cases: Vector[] };

const codeOfMessage = Object.fromEntries(Object.entries(PASSWORD_MESSAGES).map(([code, text]) => [text, code]));

/** ترتيب الخادم: المخطّط (الطول → البايتات → النمط) ثم الخدمة (الهوية). */
function serverVerdict(v: Vector): string | null {
  const parsed = (v.admin ? adminNewPasswordSchema : newPasswordSchema).safeParse(v.password);
  if (!parsed.success) return codeOfMessage[parsed.error.issues[0]!.message] ?? `unmapped: ${parsed.error.issues[0]!.message}`;
  return passwordIdentityCode(v.password, [{ phone: v.phone, username: v.username }]);
}

describe('متّجهات سياسة كلمة المرور — الخادم مرجعها', () => {
  it('الملف غير فارغ ويغطي كل رمز رفض والقبول', () => {
    const seen = new Set(cases.map((v) => v.expect));
    for (const code of [...Object.keys(POLICY.messages), null]) expect(seen, String(code)).toContain(code);
  });

  it.each(cases.map((v) => [JSON.stringify(v.password), v] as const))('%s', (_label, v) => {
    expect(serverVerdict(v)).toBe(v.expect);
  });
});

describe('رسائل السياسة من مصدرٍ واحد', () => {
  it('كل رسالة عربية تُترجَم إلى كرديتها من الملف نفسه', () => {
    for (const text of Object.values(POLICY.messages)) {
      expect(localizeErrorMessage(text.ar, 'ckb')).toBe(text.ckb);
      expect(localizeErrorMessage(text.ar, 'ar')).toBe(text.ar);
    }
  });
});
