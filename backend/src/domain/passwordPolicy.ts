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

export const PASSWORD_MIN_LENGTH = 8;
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
/** bcrypt يتجاهل ما بعد ٧٢ بايتاً بصمت؛ الحرف العربي بايتان في UTF-8. */
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_MESSAGES = {
  tooShort: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
  adminTooShort: 'كلمة مرور المسؤول يجب أن تكون 12 حرفاً على الأقل',
  tooLong: 'كلمة المرور طويلة جداً',
  blank: 'كلمة المرور لا يمكن أن تكون فراغات فقط',
  weak: 'كلمة المرور سهلة التخمين — تجنّب الكلمات الشائعة والتكرار والتسلسل مثل 12345678',
  containsPhone: 'كلمة المرور يجب ألا تحتوي رقم هاتفك',
  containsUsername: 'كلمة المرور يجب ألا تحتوي اسم المستخدم',
} as const;

/** تسلسلات لوحة المفاتيح والأبجدية والأرقام — يُفحص الاتجاهان. */
const SEQUENCES = [
  '01234567890',
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'qwertyuiopasdfghjklzxcvbnm',
  '1qaz2wsx3edc4rfv5tgb',
  'zaq12wsxcde3',
  '1q2w3e4r5t6y7u8i9o0p',
  'qazwsxedcrfvtgbyhnujm',
  'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
  'ضصثقفغعهخحجد',
  'شسيبلاتنمكط',
];
const ALL_SEQUENCES = [...SEQUENCES, ...SEQUENCES.map((s) => [...s].reverse().join(''))];

/**
 * الكلمات الشائعة — تُطابَق على كلمة المرور كاملةً وعلى «لبّها» بعد نزع
 * الأرقام والرموز من الطرفين وفكّ الاستبدالات (`@`→a، `0`→o…).
 * أسماء المتجر والأنمي والمدن هنا عمداً: هي أول ما يجرّبه من يعرف المتجر.
 */
const COMMON_WORDS = new Set([
  'password', 'passwort', 'pass', 'passwd', 'passcode', 'qwerty', 'azerty', 'admin',
  'administrator', 'root', 'user', 'guest', 'test', 'tester', 'testing', 'default',
  'changeme', 'welcome', 'letmein', 'login', 'secret', 'iloveyou', 'loveyou', 'love',
  'lovely', 'loveme', 'monkey', 'dragon', 'master', 'sunshine', 'princess', 'football',
  'baseball', 'soccer', 'shadow', 'superman', 'batman', 'spiderman', 'trustno', 'freedom',
  'whatever', 'hello', 'helloworld', 'starwars', 'computer', 'internet', 'michael',
  'jordan', 'ninja', 'mustang', 'access', 'flower', 'charlie', 'google', 'samsung',
  'iphone', 'apple', 'android', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'killer',
  'hunter', 'ranger', 'matrix', 'pokemon', 'pikachu', 'naruto', 'sasuke',
  'itachi', 'kakashi', 'goku', 'vegeta', 'luffy', 'zoro', 'onepiece', 'anime', 'manga',
  'otaku', 'galaxy', 'otakugalaxy', 'galaxyotaku', 'store', 'shop', 'tanjiro', 'nezuko',
  'levi', 'eren', 'mikasa', 'gojo', 'itadori', 'kirito', 'light', 'kira', 'death',
  'deathnote', 'iraq', 'iraqi', 'baghdad', 'basra', 'basrah', 'najaf', 'karbala',
  'mosul', 'erbil', 'kurdistan', 'sulaymaniyah', 'slemani', 'allah', 'muhammad',
  'mohammed', 'mohamed', 'ahmed', 'ali', 'hussein', 'hassan', 'fatima', 'zainab',
  'abcd', 'abc', 'asdf', 'zxcv', 'aaaa', 'ilove', 'mylove', 'baby', 'angel',
  // عربية وكردية
  'كلمةالمرور', 'كلمةسر', 'كلمهالسر', 'كلمةالسر', 'باسورد', 'العراق', 'عراق', 'بغداد',
  'البصرة', 'النجف', 'كربلاء', 'الموصل', 'اربيل', 'كوردستان', 'کوردستان', 'الله',
  'محمد', 'علي', 'حسين', 'حسن', 'فاطمة', 'زينب', 'احبك', 'حبيبي', 'حبيبتي', 'انمي',
  'أنمي', 'اوتاكو', 'أوتاكو', 'مجرة', 'مجرةالاوتاكو', 'وشەینهێنی', 'خۆشمدەوێیت',
]);

/** أرقامٌ عربية-هندية وفارسية → لاتينية، ليُقرأ «١٢٣٤٥٦٧٨» تسلسلاً. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** شكلٌ موحّد للمقارنة: NFKC، أحرف صغيرة، أرقام لاتينية، بلا فراغات ولا تطويل. */
function compactForm(s: string): string {
  return asciiDigits(s.normalize('NFKC').toLowerCase()).replace(/[\sـ]+/g, '');
}

const LEET: Readonly<Record<string, string>> = {
  '@': 'a', '4': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '5': 's', '$': 's', '7': 't', '+': 't',
};

function unLeet(s: string): string {
  return [...s].map((c) => LEET[c] ?? c).join('');
}

const EDGE_NOISE = /^[\d\p{P}\p{S}]+|[\d\p{P}\p{S}]+$/gu;

function isSequenceRun(s: string): boolean {
  return s.length >= 3 && ALL_SEQUENCES.some((seq) => seq.includes(s));
}

function isCommon(s: string): boolean {
  return COMMON_WORDS.has(s) || COMMON_WORDS.has(unLeet(s));
}

/**
 * هل كلمة المرور سهلة التخمين بذاتها (بلا معرفة صاحبها)؟ تعيد رسالة الرفض أو `null`.
 * لا تفحص الطول — ذاك للمخطّط.
 */
export function passwordPatternProblem(password: string): string | null {
  if (password.trim().length === 0) return PASSWORD_MESSAGES.blank;
  const compact = compactForm(password);

  // ١. تكرار: أقل من أربعة محارف مختلفة (11111111، abababab، 12121212).
  if (new Set(compact).size < 4) return PASSWORD_MESSAGES.weak;
  // ٢. تسلسلٌ كامل (12345678، 87654321، abcdefgh، qwertyui).
  if (isSequenceRun(compact)) return PASSWORD_MESSAGES.weak;
  // ٣. كلمة شائعة كاملة (trustno1، p@ssw0rd).
  if (isCommon(compact)) return PASSWORD_MESSAGES.weak;

  // ٤. «اللبّ» بعد نزع الأرقام والرموز من الطرفين: password123، !Qwerty2024، naruto99.
  const core = compact.replace(EDGE_NOISE, '');
  if (core.length >= 3) {
    // `otaku-galaxy`، `pass.word`: الكلمات بلا الفواصل بينها.
    const joined = unLeet(core).replace(/[\d\p{P}\p{S}]/gu, '');
    if (isCommon(core) || isCommon(joined) || isSequenceRun(core) || isSequenceRun(unLeet(core))) {
      return PASSWORD_MESSAGES.weak;
    }
  } else {
    // اللبّ (شبه) فارغ: كلمةٌ من أرقامٍ ورموز — a1234567، 1234567!.
    const digits = compact.replace(/\D/g, '');
    if (digits.length > 0 && (new Set(digits).size < 4 || isSequenceRun(digits))) {
      return PASSWORD_MESSAGES.weak;
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
  const compact = compactForm(password);
  const digits = compact.replace(/\D/g, '');
  for (const { phone, username } of identities) {
    // آخر ثمانية أرقام: تلتقط 07701234567 و7701234567 و+9647701234567 وما فُصل بشرطات.
    const phoneTail = phone ? asciiDigits(phone).replace(/\D/g, '').slice(-8) : '';
    if (phoneTail.length === 8 && digits.includes(phoneTail)) return PASSWORD_MESSAGES.containsPhone;
    const name = username ? compactForm(username) : '';
    if (name.length >= 3 && compact.includes(name)) return PASSWORD_MESSAGES.containsUsername;
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
