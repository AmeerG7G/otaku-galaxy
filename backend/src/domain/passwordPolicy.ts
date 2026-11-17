/**
 * سياسة كلمة المرور عند **الضبط** — مصدرٌ واحد لكل مسارٍ يكتب `password_hash`.
 *
 * ═══ القرار (2026-11-14، المالك) ═══ طولٌ + قائمة حظر، لا قواعد تعقيد:
 *   • الزبون ٨ أحرف فأكثر، المسؤول ١٢ فأكثر؛ والسقف ٧٢ **بايتاً** للجميع.
 *   • تُرفض: الفراغات وحدها، التكرار (`11111111`، `abababab`)، التسلسل
 *     (`12345678`، `abcdefgh`، `qwertyui`)، الكلمات الشائعة ولو أُلحق بها رقم
 *     أو رمز (`password123`، `P@ssw0rd!`، `qwerty123`)، وما يحوي رقم هاتف
 *     صاحب الحساب أو اسمه.
 *   • لا «حرف كبير + رقم + رمز»: تدفع إلى `Password1!` وتمنع عبارات المرور
 *     العربية والكردية الطويلة، و«الحرف الكبير» لا معنى له في لوحتيهما.
 * انظر `PROJECT_FEATURE_SPEC.md` STEP 84.
 *
 * [CRITICAL] تسري على ما يُضبط من الآن لا على ما ضُبط: الدخول (`loginPassword`)
 * لا يمرّ من هنا، فحسابات الحدّ القديم (ستة أحرف) تبقى تدخل.
 *
 * القائمة ليست حصراً لكل كلمةٍ ضعيفة — هي تقطع الأنماط التي يجرّبها المهاجم
 * أولاً. الحاجز الآخر هو حدّ محاولات الدخول لكل رقم.
 */
import { Errors } from '../utils/errors.js';
import POLICY from './passwordPolicy.data.json' with { type: 'json' };

/**
 * [CRITICAL] البيانات (الحدود، التسلسلات، الكلمات الشائعة، الاستبدالات، الرسائل)
 * في `passwordPolicy.data.json` وحده — مصدرٌ واحد يُنسخ منه إلى Flutter واللوحة
 * بـ`tool/password_policy/sync_password_policy.mjs`. القواعد أدناه تُعاد كتابتها في
 * `lib/core/validation/password_policy.dart` و`admin/src/utils/passwordPolicy.ts`،
 * وتحرس تطابقَها متّجهاتُ `backend/tests/fixtures/password-policy-vectors.json`
 * التي تشغّلها السويتات الثلاث.
 */
export const PASSWORD_MIN_LENGTH: number = POLICY.minLength;
export const ADMIN_PASSWORD_MIN_LENGTH: number = POLICY.adminMinLength;
/** bcrypt يتجاهل ما بعد ٧٢ بايتاً بصمت؛ الحرف العربي بايتان في UTF-8. */
export const PASSWORD_MAX_BYTES: number = POLICY.maxBytes;

export type PasswordProblemCode = keyof typeof POLICY.messages;

/** الرسائل العربية (المرجع)؛ الكردية تُترجَم في `errorMessages.ts` من الملف نفسه. */
export const PASSWORD_MESSAGES = Object.fromEntries(
  Object.entries(POLICY.messages).map(([code, text]) => [code, text.ar]),
) as Readonly<Record<PasswordProblemCode, string>>;

/** للمسرد الكردي: كل رسالة عربية ↦ ترجمتها. */
export const PASSWORD_MESSAGES_CKB: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(POLICY.messages).map((text) => [text.ar, text.ckb]),
);

/** تسلسلات لوحة المفاتيح والأبجدية والأرقام — يُفحص الاتجاهان. */
const ALL_SEQUENCES = [...POLICY.sequences, ...POLICY.sequences.map((s) => [...s].reverse().join(''))];

/**
 * الكلمات الشائعة — تُطابَق على كلمة المرور كاملةً وعلى «لبّها» بعد نزع
 * الأرقام والرموز من الطرفين وفكّ الاستبدالات (`@`→a، `0`→o…).
 */
const COMMON_WORDS: ReadonlySet<string> = new Set(POLICY.commonWords);

/** أرقامٌ عربية-هندية وفارسية → لاتينية، ليُقرأ «١٢٣٤٥٦٧٨» تسلسلاً. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** شكلٌ موحّد للمقارنة: NFKC، أحرف صغيرة، أرقام لاتينية، بلا فراغات ولا تطويل. */
function compactForm(s: string): string {
  return asciiDigits(s.normalize('NFKC').toLowerCase()).replace(/[\sـ]+/g, '');
}

const LEET: Readonly<Record<string, string>> = POLICY.leet;

function unLeet(s: string): string {
  return [...s].map((c) => LEET[c] ?? c).join('');
}

const EDGE_NOISE = /^[\d\p{P}\p{S}]+|[\d\p{P}\p{S}]+$/gu;

function isSequenceRun(s: string): boolean {
  return s.length >= POLICY.minRunLength && ALL_SEQUENCES.some((seq) => seq.includes(s));
}

function isCommon(s: string): boolean {
  return COMMON_WORDS.has(s) || COMMON_WORDS.has(unLeet(s));
}

/**
 * هل كلمة المرور سهلة التخمين بذاتها (بلا معرفة صاحبها)؟ تعيد رسالة الرفض أو `null`.
 * لا تفحص الطول — ذاك للمخطّط.
 */
export function passwordPatternProblem(password: string): string | null {
  const code = passwordPatternCode(password);
  return code ? PASSWORD_MESSAGES[code] : null;
}

/** الرمز لا الرسالة — ما تقارنه المتّجهات المشتركة بين الخادم والعميلين. */
export function passwordPatternCode(password: string): PasswordProblemCode | null {
  if (password.trim().length === 0) return 'blank';
  const compact = compactForm(password);

  // ١. تكرار: أقل من أربعة محارف مختلفة (11111111، abababab، 12121212).
  if (new Set(compact).size < POLICY.minDistinctChars) return 'weak';
  // ٢. تسلسلٌ كامل (12345678، 87654321، abcdefgh، qwertyui).
  if (isSequenceRun(compact)) return 'weak';
  // ٣. كلمة شائعة كاملة (trustno1، p@ssw0rd).
  if (isCommon(compact)) return 'weak';

  // ٤. «اللبّ» بعد نزع الأرقام والرموز من الطرفين: password123، !Qwerty2024، naruto99.
  const core = compact.replace(EDGE_NOISE, '');
  if (core.length >= POLICY.minCoreLength) {
    // `otaku-galaxy`، `pass.word`: الكلمات بلا الفواصل بينها.
    const joined = unLeet(core).replace(/[\d\p{P}\p{S}]/gu, '');
    if (isCommon(core) || isCommon(joined) || isSequenceRun(core) || isSequenceRun(unLeet(core))) {
      return 'weak';
    }
  } else {
    // اللبّ (شبه) فارغ: كلمةٌ من أرقامٍ ورموز — a1234567، 1234567!.
    const digits = compact.replace(/\D/g, '');
    if (digits.length > 0 && (new Set(digits).size < POLICY.minDistinctChars || isSequenceRun(digits))) {
      return 'weak';
    }
  }
  return null;
}

export interface PasswordIdentity {
  phone?: string | null;
  username?: string | null;
}

/** هل تحوي كلمة المرور رقم هاتف صاحبها أو اسمه؟ تعيد رسالة الرفض أو `null`. */
export function passwordIdentityProblem(password: string, identities: PasswordIdentity[]): string | null {
  const code = passwordIdentityCode(password, identities);
  return code ? PASSWORD_MESSAGES[code] : null;
}

export function passwordIdentityCode(
  password: string,
  identities: PasswordIdentity[],
): 'containsPhone' | 'containsUsername' | null {
  const compact = compactForm(password);
  const digits = compact.replace(/\D/g, '');
  for (const { phone, username } of identities) {
    // آخر ثمانية أرقام: تلتقط 07701234567 و7701234567 و+9647701234567 وما فُصل بشرطات.
    const phoneTail = phone ? asciiDigits(phone).replace(/\D/g, '').slice(-POLICY.phoneTailDigits) : '';
    if (phoneTail.length === POLICY.phoneTailDigits && digits.includes(phoneTail)) return 'containsPhone';
    const name = username ? compactForm(username) : '';
    if (name.length >= POLICY.minUsernameLength && compact.includes(name)) return 'containsUsername';
  }
  return null;
}

/**
 * الفحص الكامل في الخدمة، حيث يُعرف صاحب الحساب: الحدّ الأدنى للمسؤول (مسار
 * `/auth/me/password` مشترك فلا يعرف المخطّط الدور)، والنمط، والهوية.
 * المخطّطات تفحص الطول والنمط مبكراً؛ هذا الحارس الأخير قبل التجزئة.
 */
export function assertAcceptablePassword(
  password: string,
  options: { admin?: boolean; identities?: PasswordIdentity[] } = {},
): void {
  const problem =
    (options.admin && password.length < ADMIN_PASSWORD_MIN_LENGTH ? PASSWORD_MESSAGES.adminTooShort : null) ??
    passwordPatternProblem(password) ??
    passwordIdentityProblem(password, options.identities ?? []);
  if (problem) throw Errors.badRequest(problem, 'WEAK_PASSWORD');
}
