// @ts-expect-error — مشروع المتصفّح بلا أنواع Node عمداً (كـ`theme/layoutCss.test.ts`)؛ القراءة من القرص للمقارنة بمصدر الخادم.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PASSWORD_POLICY } from '../generated/passwordPolicyData'
import { passwordMessage, passwordProblem, type PasswordProblem } from './passwordPolicy'

/**
 * سياسة كلمة المرور في اللوحة مقابل الخادم (STEP 85).
 *
 * [CRITICAL] المصدر في `backend/`: البيانات `passwordPolicy.data.json`، والحكم
 * المتوقَّع لكل حالة في `backend/tests/fixtures/password-policy-vectors.json`
 * الذي يشغّله الخادم نفسه وسويت Flutter. تغيّرُ أحدهما دون الآخر يُفشل هذا.
 */
// @ts-expect-error — `process` من Node، كما في `AppUpdatesPage.test.tsx`.
const repoFile = (path: string): string => readFileSync(`${process.cwd()}/../${path}`, 'utf8')

interface Vector {
  password: string
  admin?: boolean
  phone?: string
  username?: string
  expect: PasswordProblem | null
}

const source = JSON.parse(repoFile('backend/src/domain/passwordPolicy.data.json')) as Record<string, unknown>
const { cases } = JSON.parse(repoFile('backend/tests/fixtures/password-policy-vectors.json')) as { cases: Vector[] }

describe('البيانات المولَّدة تطابق المصدر', () => {
  it('كل حقل كما في passwordPolicy.data.json — شغّل sync_password_policy.mjs إن فشل', () => {
    const { $comment: _comment, ...data } = source
    expect(PASSWORD_POLICY).toEqual(data)
  })
})

describe('المتّجهات المشتركة — حكم اللوحة هو حكم الخادم', () => {
  it('الملف يغطي كل رمز رفض والقبول', () => {
    const seen = new Set(cases.map((v) => v.expect))
    for (const code of Object.keys(PASSWORD_POLICY.messages)) expect(seen).toContain(code)
    expect(seen).toContain(null)
  })

  it.each(cases.map((v) => [JSON.stringify(v.password) + (v.admin ? ' (مسؤول)' : ''), v] as const))('%s', (_label, v) => {
    expect(passwordProblem(v.password, { admin: v.admin, phone: v.phone, username: v.username })).toBe(v.expect)
  })
})

describe('الرسائل', () => {
  it('نصّ الخادم العربي نفسه لكل رمز', () => {
    const messages = source.messages as Record<PasswordProblem, { ar: string }>
    for (const code of Object.keys(messages) as PasswordProblem[]) expect(passwordMessage(code)).toBe(messages[code].ar)
  })

  it('[CRITICAL] الطول بنقاط الترميز كـzod 4 لا بـlength', () => {
    expect('😀🎉🌙🍵'.length).toBe(8)
    expect(passwordProblem('😀🎉🌙🍵')).toBe('tooShort')
  })
})
