import { PASSWORD_POLICY as POLICY } from '@/generated/passwordPolicyData';

/**
 * The password policy in the web store: a MIRROR of the API, not a source (STEP 86).
 *
 * The source is `backend/src/domain/passwordPolicy.ts` with its data in
 * `passwordPolicy.data.json`. The data here is generated from it
 * (`src/generated/passwordPolicyData.ts`, by `tool/password_policy/sync_password_policy.mjs`)
 * and the rules are line for line the dashboard's (`admin/src/utils/passwordPolicy.ts`).
 * `password-policy.test.ts` runs the shared vectors that the API, Flutter and
 * the dashboard run, and compares the generated copy with the source.
 *
 * The point is a message at the field before anything is sent; the API decides.
 * The store is Arabic, so messages are the API's own Arabic text.
 */
export type PasswordProblem = keyof typeof POLICY.messages;

export interface PasswordIdentity {
  phone?: string | null;
  username?: string | null;
}

export interface PasswordContext extends PasswordIdentity {
  /** The admin minimum (12) instead of the customer one (8). Never set by the store's forms — kept so the shared vectors run unchanged. */
  admin?: boolean;
  identities?: ReadonlyArray<PasswordIdentity>;
}

/** The API's Arabic message for a problem. */
export function passwordMessage(problem: PasswordProblem): string {
  return POLICY.messages[problem].ar;
}

const ALL_SEQUENCES: readonly string[] = [...POLICY.sequences, ...POLICY.sequences.map((s) => [...s].reverse().join(''))];
const COMMON_WORDS: ReadonlySet<string> = new Set<string>(POLICY.commonWords);
const LEET: Readonly<Record<string, string>> = POLICY.leet;
const EDGE_NOISE = /^[\d\p{P}\p{S}]+|[\d\p{P}\p{S}]+$/gu;

function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function compactForm(s: string): string {
  return asciiDigits(s.normalize('NFKC').toLowerCase()).replace(/[\sـ]+/g, '');
}

function unLeet(s: string): string {
  return [...s].map((c) => LEET[c] ?? c).join('');
}

function isSequenceRun(s: string): boolean {
  return s.length >= POLICY.minRunLength && ALL_SEQUENCES.some((seq) => seq.includes(s));
}

function isCommon(s: string): boolean {
  return COMMON_WORDS.has(s) || COMMON_WORDS.has(unLeet(s));
}

/** As the API's `passwordPatternCode`. */
export function passwordPatternProblem(password: string): PasswordProblem | null {
  if (password.trim().length === 0) return 'blank';
  const compact = compactForm(password);

  if (new Set(compact).size < POLICY.minDistinctChars) return 'weak';
  if (isSequenceRun(compact)) return 'weak';
  if (isCommon(compact)) return 'weak';

  const core = compact.replace(EDGE_NOISE, '');
  if (core.length >= POLICY.minCoreLength) {
    const joined = unLeet(core).replace(/[\d\p{P}\p{S}]/gu, '');
    if (isCommon(core) || isCommon(joined) || isSequenceRun(core) || isSequenceRun(unLeet(core))) {
      return 'weak';
    }
  } else {
    const digits = compact.replace(/\D/g, '');
    if (digits.length > 0 && (new Set(digits).size < POLICY.minDistinctChars || isSequenceRun(digits))) {
      return 'weak';
    }
  }
  return null;
}

/** As the API's `passwordIdentityCode`: the phone's last eight digits, a name of 3+ characters. */
export function passwordIdentityProblem(
  password: string,
  identities: ReadonlyArray<PasswordIdentity>,
): 'containsPhone' | 'containsUsername' | null {
  const compact = compactForm(password);
  const digits = compact.replace(/\D/g, '');
  for (const { phone, username } of identities) {
    const phoneTail = phone ? asciiDigits(phone).replace(/\D/g, '').slice(-POLICY.phoneTailDigits) : '';
    if (phoneTail.length === POLICY.phoneTailDigits && digits.includes(phoneTail)) return 'containsPhone';
    const name = username ? compactForm(username) : '';
    if (name.length >= POLICY.minUsernameLength && compact.includes(name)) return 'containsUsername';
  }
  return null;
}

/**
 * The first problem in the API's order: minimum length → 72 bytes → pattern →
 * identity. `null` = accepted.
 *
 * [CRITICAL] Length counts code points (`[...s].length`), as zod 4 does — not
 * `s.length` (UTF-16 units): four emoji are 8 units but 4 characters to the API.
 */
export function passwordProblem(password: string, context: PasswordContext = {}): PasswordProblem | null {
  const min = context.admin ? POLICY.adminMinLength : POLICY.minLength;
  if ([...password].length < min) return context.admin ? 'adminTooShort' : 'tooShort';
  if (new TextEncoder().encode(password).length > POLICY.maxBytes) return 'tooLong';
  return (
    passwordPatternProblem(password) ??
    passwordIdentityProblem(password, [{ phone: context.phone, username: context.username }, ...(context.identities ?? [])])
  );
}

/** The customer minimum, for hints. */
export const PASSWORD_MIN_LENGTH: number = POLICY.minLength;

/**
 * The message for a new customer password, or `null` when the API would accept it.
 * Registration passes the phone and name typed in the form; change-password the account's own.
 */
export function newPasswordError(password: string, identity: PasswordIdentity): string | null {
  const problem = passwordProblem(password, { phone: identity.phone, username: identity.username });
  return problem ? passwordMessage(problem) : null;
}

export const CURRENT_PASSWORD_REQUIRED = 'أدخل كلمة المرور الحالية';
export const PASSWORDS_DO_NOT_MATCH = 'كلمتا المرور غير متطابقتين';

/**
 * The change-password form's checks before sending, in order: current password
 * present → the new one passes the policy → the confirmation matches.
 * `field: 'newPassword'` is shown under that field; `'form'` in the form's alert.
 */
export function passwordChangeError(
  input: { currentPassword: string; newPassword: string; confirmPassword: string },
  identity: PasswordIdentity,
): { field: 'form' | 'newPassword'; text: string } | null {
  if (!input.currentPassword) return { field: 'form', text: CURRENT_PASSWORD_REQUIRED };
  const policy = newPasswordError(input.newPassword, identity);
  if (policy) return { field: 'newPassword', text: policy };
  if (input.newPassword !== input.confirmPassword) return { field: 'form', text: PASSWORDS_DO_NOT_MATCH };
  return null;
}
