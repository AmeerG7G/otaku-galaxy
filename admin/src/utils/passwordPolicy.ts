import type { FormRule } from 'antd'
import { PASSWORD_POLICY as POLICY } from '../generated/passwordPolicyData'

/**
 * سياسة كلمة المرور في اللوحة — **مرآةٌ** للخادم لا مصدر (STEP 85).
 *
 * المصدر `backend/src/domain/passwordPolicy.ts` وبياناته `passwordPolicy.data.json`؛
 * البيانات هنا مولَّدة منه (`src/generated/passwordPolicyData.ts`)، والقواعد سطرٌ
 * بسطرٍ كقواعده، ويحرس تطابقهما ملفّ المتّجهات المشترك (`passwordPolicy.test.ts`).
 * الغرض رسالةٌ عند الحقل قبل الإرسال؛ الحكم للخادم.
 *
 * المتصفّح يملك `normalize('NFKC')` فلا فرق هنا عن الخادم.
 */
export type PasswordProblem = keyof typeof POLICY.messages

export interface PasswordContext {
  /** حدّ المسؤول (١٢) بدل حدّ الزبون (٨). */
  admin?: boolean
  phone?: string | null
  username?: string | null
}

/** رسالة الخادم العربية نفسها — اللوحة عربية. */
export function passwordMessage(problem: PasswordProblem): string {
  return POLICY.messages[problem].ar
}

const ALL_SEQUENCES: readonly string[] = [
  ...POLICY.sequences,
  ...POLICY.sequences.map((s) => [...s].reverse().join('')),
]
const COMMON_WORDS: ReadonlySet<string> = new Set<string>(POLICY.commonWords)
const LEET: Readonly<Record<string, string>> = POLICY.leet
const EDGE_NOISE = /^[\d\p{P}\p{S}]+|[\d\p{P}\p{S}]+$/gu

function asciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

function compactForm(s: string): string {
  return asciiDigits(s.normalize('NFKC').toLowerCase()).replace(/[\sـ]+/g, '')
}

function unLeet(s: string): string {
  return [...s].map((c) => LEET[c] ?? c).join('')
}

function isSequenceRun(s: string): boolean {
  return s.length >= POLICY.minRunLength && ALL_SEQUENCES.some((seq) => seq.includes(s))
}

function isCommon(s: string): boolean {
  return COMMON_WORDS.has(s) || COMMON_WORDS.has(unLeet(s))
}

/** كـ`passwordPatternCode` في الخادم. */
export function passwordPatternProblem(password: string): PasswordProblem | null {
  if (password.trim().length === 0) return 'blank'
  const compact = compactForm(password)

  if (new Set(compact).size < POLICY.minDistinctChars) return 'weak'
  if (isSequenceRun(compact)) return 'weak'
  if (isCommon(compact)) return 'weak'

  const core = compact.replace(EDGE_NOISE, '')
  if (core.length >= POLICY.minCoreLength) {
    const joined = unLeet(core).replace(/[\d\p{P}\p{S}]/gu, '')
    if (isCommon(core) || isCommon(joined) || isSequenceRun(core) || isSequenceRun(unLeet(core))) {
      return 'weak'
    }
  } else {
    const digits = compact.replace(/\D/g, '')
    if (digits.length > 0 && (new Set(digits).size < POLICY.minDistinctChars || isSequenceRun(digits))) {
      return 'weak'
    }
  }
  return null
}

/** كـ`passwordIdentityCode` في الخادم: آخر ثمانية أرقام من الهاتف، والاسم من ٣ أحرف. */
export function passwordIdentityProblem(
  password: string,
  identities: ReadonlyArray<{ phone?: string | null; username?: string | null }>,
): 'containsPhone' | 'containsUsername' | null {
  const compact = compactForm(password)
  const digits = compact.replace(/\D/g, '')
  for (const { phone, username } of identities) {
    const phoneTail = phone ? asciiDigits(phone).replace(/\D/g, '').slice(-POLICY.phoneTailDigits) : ''
    if (phoneTail.length === POLICY.phoneTailDigits && digits.includes(phoneTail)) return 'containsPhone'
    const name = username ? compactForm(username) : ''
    if (name.length >= POLICY.minUsernameLength && compact.includes(name)) return 'containsUsername'
  }
  return null
}

/**
 * أول مشكلة بترتيب الخادم: الطول ← ٧٢ بايتاً ← النمط ← الهوية؛ `null` = مقبولة.
 *
 * [CRITICAL] الطول بنقاط الترميز (`[...s].length`) كما يعدّ zod 4، لا
 * `s.length` (وحدات UTF-16): ٤ رموز تعبيرية = ٨ وحدات لكنها ٤ أحرف عند الخادم.
 */
export function passwordProblem(
  password: string,
  context: PasswordContext & { identities?: ReadonlyArray<{ phone?: string | null; username?: string | null }> } = {},
): PasswordProblem | null {
  const min = context.admin ? POLICY.adminMinLength : POLICY.minLength
  if ([...password].length < min) return context.admin ? 'adminTooShort' : 'tooShort'
  if (new TextEncoder().encode(password).length > POLICY.maxBytes) return 'tooLong'
  return (
    passwordPatternProblem(password) ??
    passwordIdentityProblem(password, [
      { phone: context.phone, username: context.username },
      ...(context.identities ?? []),
    ])
  )
}

/**
 * قاعدة antd لحقل كلمة مرور **تُضبط** (لا حقل الدخول).
 *
 * [identities] تُقرأ عند التحقق لا عند البناء: الاسم والرقم قد يتغيّران في
 * النموذج نفسه (إنشاء مسؤول، تعديله)، فيُفحص المكتوب الآن مع المحفوظ.
 * الحقل الفارغ يمرّ هنا؛ الإلزام قاعدة `required` منفصلة حيث يلزم.
 */
export function passwordPolicyRule(
  admin: boolean,
  identities: () => ReadonlyArray<{ phone?: string | null; username?: string | null }> = () => [],
): FormRule {
  return {
    validator: (_rule, value: unknown) => {
      if (typeof value !== 'string' || value === '') return Promise.resolve()
      const problem = passwordProblem(value, { admin, identities: identities() })
      return problem ? Promise.reject(new Error(passwordMessage(problem))) : Promise.resolve()
    },
  }
}
