import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PasswordForm } from '@/components/AccountForms';
import { RegisterForm } from '@/components/AuthForms';
import { PASSWORD_POLICY } from '@/generated/passwordPolicyData';
import {
  CURRENT_PASSWORD_REQUIRED,
  newPasswordError,
  passwordChangeError,
  passwordMessage,
  passwordProblem,
  PASSWORDS_DO_NOT_MATCH,
  type PasswordProblem,
} from './password-policy';

/**
 * STEP 86 — the web store's password checks against the API's policy.
 *
 * [CRITICAL] The source lives in `backend/`: the data in
 * `src/domain/passwordPolicy.data.json`, the expected verdict of every case in
 * `tests/fixtures/password-policy-vectors.json`, which the API itself, Flutter
 * and the dashboard also run. Changing one without the other fails here.
 * (Read from the repository at test time only — the Docker build never sees backend/.)
 */
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const repoFile = (file: string): string => readFileSync(path.join(repoRoot, file), 'utf8');

interface Vector {
  password: string;
  admin?: boolean;
  phone?: string;
  username?: string;
  expect: PasswordProblem | null;
}

const source = JSON.parse(repoFile('backend/src/domain/passwordPolicy.data.json')) as Record<string, unknown>;
const { cases } = JSON.parse(repoFile('backend/tests/fixtures/password-policy-vectors.json')) as { cases: Vector[] };
const message = (code: PasswordProblem) => (source.messages as Record<PasswordProblem, { ar: string }>)[code].ar;

describe('the generated data matches the source', () => {
  it('every field as in passwordPolicy.data.json — run tool/password_policy/sync_password_policy.mjs if this fails', () => {
    const data = Object.fromEntries(Object.entries(source).filter(([key]) => key !== '$comment'));
    expect(PASSWORD_POLICY).toEqual(data);
  });

  it('is byte-identical to the dashboard copy (one generator, one content)', () => {
    expect(repoFile('web-store/src/generated/passwordPolicyData.ts')).toBe(repoFile('admin/src/generated/passwordPolicyData.ts'));
  });
});

describe('shared vectors — the store says what the API says', () => {
  it('cover every rejection code and acceptance', () => {
    const seen = new Set(cases.map((v) => v.expect));
    for (const code of Object.keys(PASSWORD_POLICY.messages)) expect(seen).toContain(code);
    expect(seen).toContain(null);
  });

  it.each(cases.map((v) => [JSON.stringify(v.password) + (v.admin ? ' (admin)' : ''), v] as const))('%s', (_label, v) => {
    expect(passwordProblem(v.password, { admin: v.admin, phone: v.phone, username: v.username })).toBe(v.expect);
  });
});

describe('messages and counting', () => {
  it("the API's own Arabic text for every code", () => {
    for (const code of Object.keys(PASSWORD_POLICY.messages) as PasswordProblem[]) expect(passwordMessage(code)).toBe(message(code));
  });

  it('[CRITICAL] length counts code points like zod 4, not UTF-16 units', () => {
    expect('😀🎉🌙🍵'.length).toBe(8);
    expect(passwordProblem('😀🎉🌙🍵')).toBe('tooShort');
  });

  it('72 UTF-8 bytes is the ceiling: 36 Arabic letters pass the byte rule, 37 do not', () => {
    const arabic = 'شمسقمرنجمبحرجبلوردغيمريحثلجنهرطيرزهر'; // 36 letters × 2 bytes
    expect([...arabic].length).toBe(36);
    expect(new TextEncoder().encode(arabic).length).toBe(72);
    expect(passwordProblem(arabic)).not.toBe('tooLong');
    expect(passwordProblem(`${arabic}ك`)).toBe('tooLong');
    expect(passwordProblem('k7#mPq2z'.repeat(9) + 'x')).toBe('tooLong'); // 73 ASCII bytes
  });
});

describe('registration — checked against the name and phone typed in the form', () => {
  const typed = { username: 'ساكورا', phone: '+9647701234567' };
  const cases: Array<[string, string, PasswordProblem | null]> = [
    ['too short', 'k7#mPq2', 'tooShort'],
    ['whitespace only', '         ', 'blank'],
    ['common word', 'password123', 'weak'],
    ['leet common word', 'P@ssw0rd!', 'weak'],
    ['keyboard sequence', 'qwertyui', 'weak'],
    ['digit sequence', '12345678', 'weak'],
    ['Arabic-Indic sequence', '١٢٣٤٥٦٧٨', 'weak'],
    ['repeated characters', 'abababab', 'weak'],
    ['contains the phone', 'zq01234567x', 'containsPhone'],
    ['contains the name', 'x-ساكورا-42q', 'containsUsername'],
    ['over 72 bytes', 'k7#mPq2z'.repeat(10), 'tooLong'],
    ['strong Arabic passphrase', 'قمر على جبل الشتاء', null],
    ['strong mixed password', 'k7#mPq2z', null],
  ];
  it.each(cases)('%s', (_label, password, expected) => {
    expect(newPasswordError(password, typed)).toBe(expected ? message(expected) : null);
  });

  it('the name or phone only counts once typed', () => {
    expect(newPasswordError('x-ساكورا-42q', { username: '', phone: '' })).toBeNull();
    expect(newPasswordError('zq01234567x', { username: '', phone: '' })).toBeNull();
  });
});

describe('change password — checked against the account’s own phone and name', () => {
  const account = { username: 'Hinata', phone: '+9647801958274' };
  const ok = 'k7#mPq2z';

  it('asks for the current password first', () => {
    expect(passwordChangeError({ currentPassword: '', newPassword: ok, confirmPassword: ok }, account)).toEqual({
      field: 'form',
      text: CURRENT_PASSWORD_REQUIRED,
    });
  });

  const policyCases: Array<[string, string, PasswordProblem]> = [
    ['too short', 'abc', 'tooShort'],
    ['whitespace only', '          ', 'blank'],
    ['common word', 'naruto2024', 'weak'],
    ['sequence', '87654321', 'weak'],
    ['repeated characters', '11111111', 'weak'],
    ['contains the phone', 'pw01958274!', 'containsPhone'],
    ['contains the name', 'xhinata!77', 'containsUsername'],
    ['over 72 bytes', ok.repeat(10), 'tooLong'],
  ];
  it.each(policyCases)('%s → under the new-password field', (_label, password, expected) => {
    expect(passwordChangeError({ currentPassword: 'old', newPassword: password, confirmPassword: password }, account)).toEqual({
      field: 'newPassword',
      text: message(expected),
    });
  });

  it('the policy is reported before a mismatched confirmation', () => {
    expect(passwordChangeError({ currentPassword: 'old', newPassword: 'abc', confirmPassword: 'xyz' }, account)?.field).toBe('newPassword');
  });

  it('a mismatched confirmation is still caught', () => {
    expect(passwordChangeError({ currentPassword: 'old', newPassword: ok, confirmPassword: `${ok}!` }, account)).toEqual({
      field: 'form',
      text: PASSWORDS_DO_NOT_MATCH,
    });
  });

  it('a strong password with a matching confirmation is sent', () => {
    expect(passwordChangeError({ currentPassword: 'old', newPassword: ok, confirmPassword: ok }, account)).toBeNull();
    expect(passwordChangeError({ currentPassword: 'old', newPassword: 'قمر على جبل الشتاء', confirmPassword: 'قمر على جبل الشتاء' }, account)).toBeNull();
  });
});

describe('the forms render the policy field', () => {
  const passwordInputs = (html: string) => html.match(/<input[^>]*type="password"[^>]*>/g) ?? [];

  it('registration: a new-password field with no UTF-16 minLength', () => {
    const html = renderToStaticMarkup(createElement(RegisterForm));
    const [input] = passwordInputs(html);
    expect(input).toContain('id="password"');
    expect(input).toContain('name="password"');
    expect(input).toMatch(/autocomplete="new-password"/i);
    expect(input).not.toMatch(/minlength/i);
    expect(html).toContain('8 أحرف على الأقل');
  });

  it('change password: current, new (policy, no minLength) and confirmation fields', () => {
    const html = renderToStaticMarkup(createElement(PasswordForm, { identity: { phone: '+9647809876543', username: 'Hinata' } }));
    const inputs = passwordInputs(html);
    expect(inputs).toHaveLength(3);
    expect(inputs.map((input) => input.match(/id="([^"]+)"/)?.[1])).toEqual(['currentPassword', 'newPassword', 'confirmPassword']);
    for (const input of inputs) expect(input).not.toMatch(/minlength/i);
  });
});
