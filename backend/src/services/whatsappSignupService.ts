import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ipKeyGenerator } from 'express-rate-limit';
import type pg from 'pg';
import { config } from '../config/index.js';
import { db, withTransaction } from '../database/pool.js';
import { WHATSAPP_SIGNUP_TEXTS } from '../domain/whatsappSignupTexts.js';
import { toPublicUser, userRepo, type UserRow } from '../repositories/userRepo.js';
import type { Gender } from '../types/index.js';
import { AppError, Errors } from '../utils/errors.js';
import type { AppLocale } from '../utils/locale.js';
import { normalizeIraqiPhone } from '../utils/phone.js';
import { signToken, type AuthResult } from './authService.js';
import type { InboundEvent } from './whatsapp/metaWebhook.js';

/**
 * التحقق التلقائي عبر واتساب (`WHATSAPP_VERIFY_MODE=auto`).
 *
 * ═══ المسار ═══
 *   ١. `start {phone}` — جلسةٌ برمزٍ عشوائي وسرٍّ يملكه العميل وحده. **لا حساب
 *      ولا كلمة مرور ولا اسم** يُخزَّن هنا.
 *   ٢. الزبون يرسل من واتسابه رسالةً معبّأةً تحمل الرمز.
 *   ٣. الويبهوك (`handleInboundEvent`) يطابق **رقم المرسِل** برقم الجلسة:
 *      - الرقم حاضر ومطابق ← `verified`.
 *      - الرقم غائب (مستخدم اسم مستخدم) ← `awaiting_contact` + زرّ «مشاركة
 *        الرقم»؛ ردّه (`origin: contact_request`) يطابَق بالطريقة نفسها.
 *      - رقمٌ آخر ← محاولةٌ خاطئة؛ الثالثة تُميت الجلسة.
 *   ٤. `complete {sessionId, secret, username, gender, password}` — في معاملةٍ
 *      واحدة: يُنشأ الحساب أو يُحدَّث صفّه غير المفعَّل، ويُفعَّل، ويُحسم طلبه.
 *
 * ═══ لماذا كلمة المرور في الخطوة الأخيرة ═══
 * [SECURITY] `authService.register` يكتب كلمة المرور على صفٍّ معلَّق قبل أي
 * تحقّق، ويُبقي كلمة **أوّل** من أرسل. لو بُني التحقق فوق ذلك لفعّل صاحبُ الرقم
 * الحقيقي كلمةَ من سبقه إلى رقمه. هنا لا تُكتب كلمة مرور إلا بيد من يملك سرّ
 * جلسةٍ أثبتت رسالةُ واتساب من الرقم نفسه ملكيتَه — وتطغى على أي كلمةٍ معلَّقة.
 *
 * ═══ ما لا يتغيّر ═══
 * `/auth/register` والموافقة الإدارية والدخول كما هي في الوضعين؛ هذا مسارٌ
 * إضافي يُطفأ بـ`off` فيعود كل شيء كما كان.
 */

type SessionStatus = 'pending' | 'awaiting_contact' | 'verified' | 'completed' | 'dead';
type DeadReason = 'mismatch' | 'phone_taken' | 'attempts' | 'blocked';

interface SessionRow {
  id: string;
  phone: string;
  code_hash: Buffer;
  secret_hash: Buffer;
  status: SessionStatus;
  dead_reason: DeadReason | null;
  locale: AppLocale;
  provider: string;
  sender_ref: string | null;
  mismatch_count: number;
  complete_attempts: number;
  created_at: Date;
  expires_at: Date;
  contact_deadline: Date | null;
  verified_at: Date | null;
  verified_via: 'sender' | 'contact_request' | null;
  completed_at: Date | null;
  user_id: string | null;
  account_request_id: string | null;
}

export type PublicSessionStatus =
  | 'pending'
  | 'awaiting_contact'
  | 'verified'
  | 'completed'
  | 'expired'
  | 'mismatch'
  | 'phone_taken'
  | 'dead';

// ═══ الرمز والسرّ ═══

/** أبجدية Crockford base32 — بلا I وL وO وU، فلا التباس عند القراءة أو الكتابة. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 10;

/** رمزٌ من ١٠ محارف (٥٠ بت) من `randomBytes` — كل بايتٍ `& 31` بلا انحياز (٢٥٦ ÷ ٣٢). */
export function generateSignupCode(): { normalized: string; display: string } {
  const bytes = randomBytes(CODE_LENGTH);
  let normalized = '';
  for (const byte of bytes) normalized += CROCKFORD[byte & 31];
  return { normalized, display: `OG-${normalized.slice(0, 5)}-${normalized.slice(5)}` };
}

const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;
const CODE_PATTERN = /O\s*G[\s\-_‐-―]*([0-9A-Z]{5})[\s\-_‐-―]*([0-9A-Z]{5})(?![0-9A-Z])/i;

/**
 * يستخرج الرمز من نصّ الرسالة أينما وقع — قبله وبعده نصٌّ عربي أو كردي،
 * بأحرف صغيرة، بفراغاتٍ أو شرطات. يطبّع وفق Crockford (I/L→1، O→0).
 */
export function extractSignupCode(text: string): string | null {
  const ascii = text
    .normalize('NFKC')
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0));
  const match = CODE_PATTERN.exec(ascii);
  if (!match) return null;
  return `${match[1]}${match[2]}`.toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0');
}

const pepper = (purpose: string, value: string) =>
  createHmac('sha256', config.whatsapp.tokenPepper).update(`${purpose}:${value}`).digest();

/**
 * مفتاح العنوان للحدود: IPv4 كاملاً، وIPv6 بشبكته ‎/56 — المفتاح نفسه الذي تبني
 * عليه حدود الذاكرة (`clientRateLimitKey`). عنوانٌ خام كان يُعدّ وحده، فمن يملك
 * شبكة IPv6 (والمشترك المنزلي يملك ‎/64 على الأقل) يبدّل عنوانه مع كل طلب.
 * يُخزَّن مجزَّأً بـHMAC (`ip_hash`) — لا عنوانٌ صريح في القاعدة.
 */
export function signupIpKey(ip: string): string {
  return ipKeyGenerator(ip);
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest();

function secretMatches(row: Pick<SessionRow, 'secret_hash'>, secret: string): boolean {
  const given = sha256(secret);
  return given.length === row.secret_hash.length && timingSafeEqual(given, row.secret_hash);
}

/** للسجلّ وحده: ‎+9647…67 — لا رقمٌ كامل في أي سطر. */
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 5)}…${phone.slice(-2)}` : '…';
}

// ═══ الأخطاء ═══

const unavailable = () =>
  Errors.notFound('التحقق عبر واتساب غير متاح — اطلب حساباً بالطريقة العادية', 'REGISTRATION_METHOD_UNAVAILABLE');
const sessionNotFound = () => Errors.notFound('جلسة التحقق غير موجودة — ابدأ من جديد', 'SESSION_NOT_FOUND');
const sessionExpired = () => new AppError(410, 'SESSION_EXPIRED', 'انتهت مهلة التحقق — ابدأ من جديد');
const phoneTaken = () => Errors.conflict('هذا الرقم مسجّل بالفعل — جرّب تسجيل الدخول', 'PHONE_TAKEN');
// النصّان نفسهما في الدخول (`authService.login`) والوسيط — قرار المسؤول واحدٌ في كل مسار.
const requestRejected = () => Errors.forbidden('تم رفض طلب إنشاء الحساب — تواصل مع الإدارة', 'ACCOUNT_REQUEST_REJECTED');
const accountSuspended = () => Errors.forbidden('الحساب موقوف — تواصل مع الدعم', 'ACCOUNT_SUSPENDED');
type BlockReason = 'rejected' | 'suspended';

export function assertWhatsAppSignupEnabled() {
  if (config.whatsapp.mode !== 'auto') throw unavailable();
}

// ═══ الحالة كما يراها العميل ═══

function computeStatus(row: SessionRow, now = Date.now()): PublicSessionStatus {
  switch (row.status) {
    case 'completed':
      return 'completed';
    case 'dead':
      return row.dead_reason === 'mismatch' ? 'mismatch' : row.dead_reason === 'phone_taken' ? 'phone_taken' : 'dead';
    case 'pending':
      return row.expires_at.getTime() <= now ? 'expired' : 'pending';
    case 'awaiting_contact':
      return (row.contact_deadline?.getTime() ?? 0) <= now ? 'expired' : 'awaiting_contact';
    case 'verified':
      return completeDeadline(row) <= now ? 'expired' : 'verified';
  }
}

const completeDeadline = (row: SessionRow) =>
  (row.verified_at?.getTime() ?? 0) + config.whatsapp.completeWindowSeconds * 1000;

async function isPhoneTaken(client: pg.Pool | pg.PoolClient, phone: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM users WHERE phone = $1 AND (phone_verified_at IS NOT NULL OR role <> 'customer')`,
    [phone],
  );
  return rows.length > 0;
}

/**
 * [SECURITY] قرار المسؤول يسبق واتساب: رقمٌ آخر طلب تسجيلٍ له **مرفوض**، أو
 * حسابه المعلَّق **موقوف**، لا يفعَّل ذاتياً. القاعدة نفسها التي يطبّقها الدخول
 * (آخر طلب مرفوض → `ACCOUNT_REQUEST_REJECTED`؛ موقوف → `ACCOUNT_SUSPENDED`).
 * إعادة التقديم بالطريقة العادية تفتح طلباً جديداً فيسقط «المرفوض» — كما في الدخول.
 * `lock` يقفل الحساب ثم آخر طلب (ترتيب `register` والموافقة والرفض نفسه).
 */
async function blockReason(client: pg.Pool | pg.PoolClient, phone: string, lock = false): Promise<BlockReason | null> {
  const forUpdate = lock ? ' FOR UPDATE' : '';
  const { rows: [user] } = await client.query<{ is_active: boolean; role: string }>(
    `SELECT is_active, role FROM users WHERE phone = $1${forUpdate}`,
    [phone],
  );
  if (user && user.role === 'customer' && !user.is_active) return 'suspended';
  const { rows: [latest] } = await client.query<{ status: string }>(
    `SELECT status FROM account_requests
      WHERE kind = 'registration' AND submitted_phone = $1
      ORDER BY created_at DESC LIMIT 1${forUpdate}`,
    [phone],
  );
  return latest?.status === 'rejected' ? 'rejected' : null;
}

async function findSession(client: pg.Pool | pg.PoolClient, id: string, lock = false): Promise<SessionRow | null> {
  const { rows } = await client.query<SessionRow>(
    `SELECT * FROM whatsapp_signup_sessions WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export const whatsappSignupService = {
  /** ما يقرؤه العميل ليقرّر عرض زرّ واتساب — لا شيء غير الوضع والرقم العام. */
  options() {
    const enabled = config.whatsapp.mode === 'auto';
    return {
      whatsapp: enabled
        ? {
            enabled: true as const,
            businessNumber: config.whatsapp.businessNumber,
            ttlSeconds: config.whatsapp.sessionTtlSeconds,
          }
        : { enabled: false as const },
    };
  },

  /**
   * يبدأ جلسة. الردّ **واحدٌ** لكل رقمٍ صالح — جديد أو معلَّق أو مفعَّل — فلا
   * يكشف وجود حساب. من يملك الرقم المفعَّل يعرف ذلك بعد أن يثبت ملكيته.
   */
  async start(input: { phone: string; ip: string; locale: AppLocale }) {
    assertWhatsAppSignupEnabled();
    const { sessionTtlSeconds } = config.whatsapp;
    const code = generateSignupCode();
    const secret = randomBytes(32).toString('base64url');
    const ipHash = input.ip ? pepper('ip', signupIpKey(input.ip)) : null;

    const row = await withTransaction(async (tx) => {
      // [CONCURRENCY] قفلٌ واحد لكل البدايات: العدّ ثم الإدراج متسلسلان، فلا
      // تقرأ بداياتٌ متزامنة (لرقمٍ أو عنوانٍ أو للمتجر كله) عدّاً واحداً فتتجاوز
      // السقف معاً. القفل كان على الرقم وحده، فتجاوزت بداياتٌ متزامنة لأرقامٍ
      // مختلفة من عنوانٍ واحد حصّته. البداية بضعة استعلاماتٍ مفهرسة — تسلسلها
      // أرخص من سقفٍ لا يصدق.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['wa-signup:start']);
      await enforceStartLimits(tx, input.phone, ipHash);
      const { rows: [inserted] } = await tx.query<SessionRow>(
        `INSERT INTO whatsapp_signup_sessions (phone, code_hash, secret_hash, locale, provider, ip_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7))
         RETURNING *`,
        [input.phone, pepper('code', code.normalized), sha256(secret), input.locale, config.whatsapp.provider, ipHash, sessionTtlSeconds],
      );
      return inserted!;
    });

    const digits = config.whatsapp.businessNumber.replace(/^\+/, '');
    const text = WHATSAPP_SIGNUP_TEXTS[input.locale].prefill(code.display);
    return {
      sessionId: row.id,
      secret,
      code: code.display,
      businessNumber: config.whatsapp.businessNumber,
      waLink: `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
      expiresAt: row.expires_at.toISOString(),
    };
  },

  /** حالة الجلسة لمن يملك سرّها وحده. معرّفٌ مجهول وسرٌّ خاطئ ردٌّ واحد. */
  async status(input: { sessionId: string; secret: string }) {
    assertWhatsAppSignupEnabled();
    const row = await findSession(db, input.sessionId);
    if (!row || !secretMatches(row, input.secret)) throw sessionNotFound();
    let status = computeStatus(row);
    // الرقم المأخوذ يُكشف **بعد** إثبات الملكية وحده.
    if (status === 'verified' && (await isPhoneTaken(db, row.phone))) status = 'phone_taken';
    // المرفوض والموقوف: لا يُطلب منه إكمالٌ سيُرفض — «تعذّر» عامّة، والسبب يظهر عند الإكمال.
    else if (status === 'verified' && (await blockReason(db, row.phone)) !== null) status = 'dead';
    return {
      status,
      expiresAt: row.expires_at.toISOString(),
      contactDeadline: row.contact_deadline?.toISOString() ?? null,
      completeBy: row.verified_at ? new Date(completeDeadline(row)).toISOString() : null,
      lastAttemptMismatched: row.mismatch_count > 0 && (status === 'pending' || status === 'awaiting_contact'),
    };
  },

  /**
   * حدثٌ واحد من الويبهوك — معاملةٌ واحدة: تسجيل المعرّف (منع التكرار) ثم الأثر.
   * الحدث المكرَّر لا يمرّ من الإدراج، فلا أثر ثانٍ له.
   */
  async handleInboundEvent(provider: string, event: InboundEvent): Promise<string> {
    if (config.whatsapp.mode !== 'auto') return 'disabled';
    return withTransaction(async (tx) => {
      const type = event.kind === 'ignored' ? event.type : event.kind;
      const inserted = await tx.query(
        `INSERT INTO whatsapp_webhook_events (provider, event_id, event_type)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_id`,
        [provider, event.eventId.slice(0, 256), type.slice(0, 64)],
      );
      if (inserted.rowCount === 0) return 'duplicate';
      const { outcome, sessionId } = await processEvent(tx, event);
      await tx.query(
        `UPDATE whatsapp_webhook_events SET outcome = $3, session_id = $4 WHERE provider = $1 AND event_id = $2`,
        [provider, event.eventId.slice(0, 256), outcome, sessionId ?? null],
      );
      return outcome;
    });
  },

  /**
   * إكمال التسجيل بعد التحقق — الحساب يُنشأ أو يُحدَّث ويُفعَّل في معاملةٍ واحدة.
   * الرمز `{token, user}` مطابقٌ لعقد الدخول تماماً.
   */
  async complete(input: {
    sessionId: string;
    secret: string;
    username: string;
    gender: Gender;
    password: string;
  }): Promise<AuthResult> {
    assertWhatsAppSignupEnabled();
    const { maxCompleteAttempts } = config.whatsapp;

    // [SECURITY] كل محاولةٍ تُعدّ قبل أي فحص — في جملةٍ مستقلة تبقى ولو رُفض الطلب.
    const { rows: [attempt] } = await db.query<SessionRow>(
      `UPDATE whatsapp_signup_sessions SET complete_attempts = complete_attempts + 1
        WHERE id = $1 AND status <> 'completed' RETURNING *`,
      [input.sessionId],
    );
    if (!attempt) {
      const done = await findSession(db, input.sessionId);
      if (done && secretMatches(done, input.secret)) {
        throw Errors.conflict('اكتمل التسجيل بهذه الجلسة مسبقاً — سجّل الدخول', 'SESSION_COMPLETED');
      }
      throw sessionNotFound();
    }
    if (attempt.complete_attempts > maxCompleteAttempts) {
      await killSession(db, attempt.id, 'attempts');
      throw Errors.tooManyRequests('محاولات كثيرة — ابدأ التحقق من جديد', 'SESSION_ATTEMPTS_EXCEEDED');
    }
    if (!secretMatches(attempt, input.secret)) throw sessionNotFound();
    assertCompletable(attempt);

    // التجزئة قبل المعاملة (لا عمل حسابيّ ثقيل تحت قفل) — كما في `register`.
    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);

    let result: { user: UserRow } | { taken: true } | { blocked: BlockReason } | null = null;
    for (let attemptNo = 0; attemptNo < 2 && result === null; attemptNo++) {
      try {
        result = await withTransaction((tx) => completeInTx(tx, input, passwordHash));
      } catch (error) {
        // [CONCURRENCY] تسجيلٌ عادي أدرج صفّ الرقم بين فحصنا وإدراجنا (23505):
        // نعيد المعاملة مرّةً فتسلك فرع «صفٌّ غير مفعَّل قائم».
        if ((error as { code?: string }).code === '23505' && attemptNo === 0) continue;
        throw error;
      }
    }
    if (result && 'blocked' in result) throw result.blocked === 'rejected' ? requestRejected() : accountSuspended();
    if (!result || 'taken' in result) throw phoneTaken();
    return { token: signToken(result.user), user: toPublicUser(result.user) };
  },
};

// ═══ الحدود الطبقية للبداية ═══

const HOUR = 3600;
const DAY = 86_400;

/**
 * ثوانٍ حتى يهبط عدّ نافذةٍ متحرّكة تحت سقفها: عمر الصفّ الذي بخروجه يصير
 * العدّ `limit - 1`. سقفٌ أعلى لا أدنى — جلسةٌ تتحقّق قبله تخرج من عدّ
 * «غير المتحقَّق منها» أبكر.
 */
async function secondsUntilBelow(
  tx: pg.PoolClient,
  where: string,
  params: unknown[],
  windowSeconds: number,
  count: number,
  limit: number,
): Promise<number> {
  const { rows: [row] } = await tx.query<{ s: number }>(
    `SELECT EXTRACT(EPOCH FROM (created_at + make_interval(secs => ${windowSeconds}) - now()))::float8 AS s
       FROM whatsapp_signup_sessions WHERE ${where}
      ORDER BY created_at ASC OFFSET ${Math.max(0, count - limit)} LIMIT 1`,
    params,
  );
  return Math.max(1, row?.s ?? windowSeconds);
}

const phoneLimited = (retryAfter: number) =>
  Errors.tooManyRequests('طلبات كثيرة لهذا الرقم — حاول بعد قليل', 'WHATSAPP_VERIFY_RATE_LIMITED', retryAfter);

/**
 * [SECURITY] كل حدود البداية — تحت قفل البدايات (`start`)، من القاعدة لا من
 * الذاكرة فتصمد لإعادة التشغيل. الترتيب: الرقم ← العنوان ← المتجر.
 *
 * - الرقم: ٣ حيّة، ٦/ساعة، ١٥/يوم، وتأخيرٌ متصاعد بعد الثالثة في الساعة.
 *   لا يعرف العنوان: تبديل العناوين لا يفتح رقماً.
 * - العنوان: ٣٠ جلسة **غير متحقَّق منها** في الساعة، و٣٠٠ بداية في اليوم.
 *   المتحقَّق منها لا تُحتسب في الأولى — الزبائن خلف NAT المشغّل لا يتزاحمون.
 * - المتجر: ١٠٠٠ غير متحقَّق منها و٥٠٠٠ بداية في اليوم ← «مشغول» (`BUSY`):
 *   الإدارة بديلٌ دائم، والجلسات المتحقَّق منها تكمل كما هي.
 */
async function enforceStartLimits(tx: pg.PoolClient, phone: string, ipHash: Buffer | null) {
  const { limits, completeWindowSeconds } = config.whatsapp;

  const { rows: [p] } = await tx.query<{ live: number; hour: number; day: number; last_age: number | null; live_free_in: number | null }>(
    `SELECT
       COUNT(*) FILTER (WHERE ${LIVE_SQL})::int AS live,
       COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour,
       COUNT(*)::int AS day,
       EXTRACT(EPOCH FROM (now() - MAX(created_at) FILTER (WHERE created_at > now() - interval '1 hour')))::float8 AS last_age,
       EXTRACT(EPOCH FROM (MIN(${LIVE_END_SQL}) FILTER (WHERE ${LIVE_SQL}) - now()))::float8 AS live_free_in
     FROM whatsapp_signup_sessions
     WHERE phone = $1 AND created_at > now() - interval '1 day'`,
    [phone, completeWindowSeconds],
  );
  if (p!.live >= limits.livePerPhone) throw phoneLimited(p!.live_free_in ?? sessionTtlFallback());
  if (p!.day >= limits.perPhoneDay) {
    throw phoneLimited(await secondsUntilBelow(tx, 'phone = $1 AND created_at > now() - interval \'1 day\'', [phone], DAY, p!.day, limits.perPhoneDay));
  }
  if (p!.hour >= limits.perPhoneHour) {
    throw phoneLimited(await secondsUntilBelow(tx, 'phone = $1 AND created_at > now() - interval \'1 hour\'', [phone], HOUR, p!.hour, limits.perPhoneHour));
  }
  // التأخير المتصاعد: البداية رقم (hour + 1) في الساعة تنتظر مهلتها منذ آخر بداية.
  const delays = limits.perPhoneDelaysSeconds;
  const delay = delays[Math.min(p!.hour, delays.length - 1)] ?? 0;
  if (delay > 0 && p!.last_age !== null && p!.last_age < delay) throw phoneLimited(delay - p!.last_age);

  if (ipHash) {
    const { rows: [a] } = await tx.query<{ unverified: number; day: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE verified_at IS NULL AND created_at > now() - interval '1 hour')::int AS unverified,
         COUNT(*)::int AS day
       FROM whatsapp_signup_sessions
       WHERE ip_hash = $1 AND created_at > now() - interval '1 day'`,
      [ipHash],
    );
    if (a!.unverified >= limits.perIpUnverifiedHour) {
      throw Errors.tooManyRequests(
        'طلبات كثيرة، حاول لاحقاً',
        'WHATSAPP_VERIFY_RATE_LIMITED',
        await secondsUntilBelow(tx, 'ip_hash = $1 AND verified_at IS NULL AND created_at > now() - interval \'1 hour\'', [ipHash], HOUR, a!.unverified, limits.perIpUnverifiedHour),
      );
    }
    if (a!.day >= limits.perIpDay) {
      throw Errors.tooManyRequests(
        'طلبات كثيرة، حاول لاحقاً',
        'WHATSAPP_VERIFY_RATE_LIMITED',
        await secondsUntilBelow(tx, 'ip_hash = $1 AND created_at > now() - interval \'1 day\'', [ipHash], DAY, a!.day, limits.perIpDay),
      );
    }
  }

  const { rows: [g] } = await tx.query<{ unverified: number; day: number }>(
    `SELECT COUNT(*) FILTER (WHERE verified_at IS NULL)::int AS unverified, COUNT(*)::int AS day
       FROM whatsapp_signup_sessions WHERE created_at > now() - interval '1 day'`,
  );
  const busy = (retryAfter: number) =>
    Errors.tooManyRequests('التحقق عبر واتساب مشغول الآن — اطلب حساباً بالطريقة العادية', 'WHATSAPP_VERIFY_BUSY', retryAfter);
  if (g!.unverified >= limits.globalUnverifiedDay) {
    console.warn('[whatsapp-signup] global unverified daily cap reached — WhatsApp sign-up busy');
    throw busy(await secondsUntilBelow(tx, `verified_at IS NULL AND created_at > now() - interval '1 day'`, [], DAY, g!.unverified, limits.globalUnverifiedDay));
  }
  if (g!.day >= limits.globalDay) {
    console.warn('[whatsapp-signup] global daily start cap reached — WhatsApp sign-up busy');
    throw busy(await secondsUntilBelow(tx, `created_at > now() - interval '1 day'`, [], DAY, g!.day, limits.globalDay));
  }
  // البداية ستُقبل: العدّان بعدها +١.
  noteCapUsage('global-unverified-starts', g!.unverified + 1, limits.globalUnverifiedDay);
  noteCapUsage('global-starts', g!.day + 1, limits.globalDay);
}

/** جلسةٌ حيّة: تنتظر رسالةً أو مشاركةً أو إكمالاً قبل مهلتها. `$2` = مهلة الإكمال. */
const LIVE_SQL = `((status = 'pending' AND expires_at > now())
   OR (status = 'awaiting_contact' AND contact_deadline > now())
   OR (status = 'verified' AND verified_at + make_interval(secs => $2) > now()))`;
const LIVE_END_SQL = `CASE status WHEN 'pending' THEN expires_at
   WHEN 'awaiting_contact' THEN contact_deadline
   ELSE verified_at + make_interval(secs => $2) END`;
const sessionTtlFallback = () => config.whatsapp.sessionTtlSeconds;

const capWarned = new Map<string, { day: string; level: number }>();
/**
 * تحذيرٌ في السجلّ عند ٥٠٪ و٨٠٪ من سقفٍ يومي عام — مرّةً لكل مستوى في اليوم
 * (UTC) لكل سقف، في هذه العملية. لا رقم ولا عنوان: الاسم والعدّ وحدهما.
 */
export function noteCapUsage(name: string, count: number, limit: number) {
  const ratio = count / limit;
  const level = ratio >= 0.8 ? 80 : ratio >= 0.5 ? 50 : 0;
  if (level === 0) return;
  const day = new Date().toISOString().slice(0, 10);
  const seen = capWarned.get(name);
  if (seen && seen.day === day && seen.level >= level) return;
  capWarned.set(name, { day, level });
  console.warn(`[whatsapp-signup] daily cap ${name} at ${level}% (${count}/${limit})`);
}

/** للاختبارات: تبدأ تحذيرات السقوف من الصفر. */
export function resetCapWarningsForTests() {
  capWarned.clear();
}

function assertCompletable(row: SessionRow) {
  const status = computeStatus(row);
  if (status === 'verified') return;
  if (status === 'expired') throw sessionExpired();
  if (status === 'phone_taken') throw phoneTaken();
  if (status === 'pending' || status === 'awaiting_contact') {
    throw Errors.conflict('لم يكتمل التحقق عبر واتساب بعد', 'SESSION_NOT_VERIFIED');
  }
  if (status === 'completed') {
    throw Errors.conflict('اكتمل التسجيل بهذه الجلسة مسبقاً — سجّل الدخول', 'SESSION_COMPLETED');
  }
  throw Errors.conflict('تعذّر التحقق من هذا الرقم — اطلب حساباً بالطريقة العادية', 'SESSION_DEAD');
}

async function killSession(client: pg.Pool | pg.PoolClient, id: string, reason: DeadReason) {
  await client.query(
    `UPDATE whatsapp_signup_sessions SET status = 'dead', dead_reason = $2
      WHERE id = $1 AND status IN ('pending', 'awaiting_contact', 'verified')`,
    [id, reason],
  );
}

/**
 * قلب الإكمال. ترتيب الأقفال: الجلسة ← الحساب ← الطلب. الحساب قبل الطلب هو
 * ترتيب `register` و`approveAccountRequest` نفسه، فلا تبادل انتظار (40P01).
 */
async function completeInTx(
  tx: pg.PoolClient,
  input: { sessionId: string; username: string; gender: Gender },
  passwordHash: string,
): Promise<{ user: UserRow } | { taken: true } | { blocked: BlockReason }> {
  const session = await findSession(tx, input.sessionId, true);
  if (!session) throw sessionNotFound();
  assertCompletable(session);

  const { rows: [existing] } = await tx.query<UserRow>('SELECT * FROM users WHERE phone = $1 FOR UPDATE', [session.phone]);
  if (existing && (existing.phone_verified_at !== null || existing.role !== 'customer')) {
    // الرقم صار مفعَّلاً (موافقة إدارية سبقت، أو تسجيلٌ آخر). الجلسة تموت
    // وتُلتزم، ثم يُرمى الخطأ خارج المعاملة.
    await killSession(tx, session.id, 'phone_taken');
    return { taken: true };
  }
  // [SECURITY] تحت قفل الحساب (أُخذ أعلاه) ثم قفل آخر طلب: رفضٌ متزامن من
  // المسؤول إما يسبقنا فنراه، أو ينتظرنا فيجد الطلب محسوماً (REQUEST_RESOLVED).
  const blocked = await blockReason(tx, session.phone, true);
  if (blocked) {
    await killSession(tx, session.id, 'blocked');
    return { blocked };
  }

  let user: UserRow;
  if (existing) {
    // [SECURITY] صفٌّ معلَّق (ربما لمن سبق صاحبَ الرقم إليه): بيانات صاحب الرقم
    // المُثبَت تطغى، ونسخة التوكن تُرفع فلا يبقى أثرٌ لأي جلسة سابقة.
    user = await userRepo.update(tx, existing.id, {
      username: input.username,
      gender: input.gender,
      passwordHash,
      preferredLanguage: session.locale,
      phoneVerifiedAt: new Date(),
      bumpTokenVersion: true,
    });
  } else {
    const created = await userRepo.create(tx, {
      username: input.username,
      phone: session.phone,
      passwordHash,
      gender: input.gender,
    });
    user = await userRepo.update(tx, created.id, { preferredLanguage: session.locale, phoneVerifiedAt: new Date() });
  }

  // سجلّ الطلب كما يراه المسؤول: المعلَّق يُحسم «مقبولاً» بلا مسؤول، أو يُنشأ
  // صفٌّ مقبول. الوسم «عبر واتساب» يُشتقّ من ربط الجلسة به (`account_request_id`).
  const { rows: [pending] } = await tx.query<{ id: string }>(
    `SELECT id FROM account_requests
      WHERE kind = 'registration' AND submitted_phone = $1 AND status = 'pending'
      FOR UPDATE`,
    [session.phone],
  );
  let requestId: string;
  if (pending) {
    const { rows: [resolved] } = await tx.query<{ id: string }>(
      `UPDATE account_requests
          SET status = 'approved', resolved_at = now(), resolved_by = NULL, admin_note = NULL,
              user_id = $2, submitted_username = $3, submitted_gender = $4, updated_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING id`,
      [pending.id, user.id, input.username, input.gender],
    );
    requestId = resolved!.id;
  } else {
    const { rows: [created] } = await tx.query<{ id: string }>(
      `INSERT INTO account_requests
         (kind, status, user_id, submitted_phone, submitted_username, submitted_gender, resolved_at)
       VALUES ('registration', 'approved', $1, $2, $3, $4, now())
       RETURNING id`,
      [user.id, session.phone, input.username, input.gender],
    );
    requestId = created!.id;
  }

  const { rowCount } = await tx.query(
    `UPDATE whatsapp_signup_sessions
        SET status = 'completed', completed_at = now(), user_id = $2, account_request_id = $3
      WHERE id = $1 AND status = 'verified'`,
    [session.id, user.id, requestId],
  );
  if (rowCount !== 1) throw Errors.conflict('اكتمل التسجيل بهذه الجلسة مسبقاً — سجّل الدخول', 'SESSION_COMPLETED');

  if (config.whatsapp.confirmationMessage) {
    await tx.query(
      `INSERT INTO whatsapp_outbox (session_id, kind) VALUES ($1, 'confirmation') ON CONFLICT DO NOTHING`,
      [session.id],
    );
  }
  return { user };
}

async function registerMismatch(tx: pg.PoolClient, session: SessionRow): Promise<string> {
  const { rows: [row] } = await tx.query<{ status: SessionStatus }>(
    `UPDATE whatsapp_signup_sessions
        SET mismatch_count = mismatch_count + 1,
            status      = CASE WHEN mismatch_count + 1 >= $2 THEN 'dead' ELSE status END,
            dead_reason = CASE WHEN mismatch_count + 1 >= $2 THEN 'mismatch' ELSE dead_reason END
      WHERE id = $1 AND status IN ('pending', 'awaiting_contact')
      RETURNING status`,
    [session.id, config.whatsapp.maxMismatches],
  );
  return row?.status === 'dead' ? 'mismatch_dead' : 'mismatch';
}

/** أثر الحدث على جلسته. كل انتقالٍ جملةٌ مشروطة بالحالة المتوقَّعة — فائزٌ واحد. */
async function processEvent(
  tx: pg.PoolClient,
  event: InboundEvent,
): Promise<{ outcome: string; sessionId?: string }> {
  const { clockSkewSeconds, webhookGraceSeconds, contactTtlSeconds } = config.whatsapp;
  const now = Date.now();

  if (event.kind === 'ignored') return { outcome: 'ignored' };

  if (event.kind === 'text') {
    const code = extractSignupCode(event.text);
    if (!code) return { outcome: 'no_code' };
    const { rows: [session] } = await tx.query<SessionRow>(
      'SELECT * FROM whatsapp_signup_sessions WHERE code_hash = $1 FOR UPDATE',
      [pepper('code', code)],
    );
    if (!session) return { outcome: 'unknown_code' };
    const sessionId = session.id;
    if (session.status !== 'pending') return { outcome: 'stale', sessionId };
    // الطابع طابعُ Meta لحظةَ الإرسال: رسالةٌ أُرسلت في المهلة تُقبل ولو تأخّر
    // ويبهوكها، ضمن مهلةٍ إضافية لا تقبل إعادة إرسالٍ بعد أيام.
    const sent = event.sentAt.getTime();
    if (sent < session.created_at.getTime() - clockSkewSeconds * 1000) return { outcome: 'before_session', sessionId };
    if (sent > session.expires_at.getTime() + clockSkewSeconds * 1000) return { outcome: 'expired', sessionId };
    if (now > session.expires_at.getTime() + webhookGraceSeconds * 1000) return { outcome: 'late', sessionId };

    if (event.senderPhone) {
      if (normalizeIraqiPhone(event.senderPhone) !== session.phone) {
        return { outcome: await registerMismatch(tx, session), sessionId };
      }
      await tx.query(
        `UPDATE whatsapp_signup_sessions
            SET status = 'verified', verified_at = now(), verified_via = 'sender', sender_ref = $2
          WHERE id = $1 AND status = 'pending'`,
        [session.id, event.senderRef ?? null],
      );
      return { outcome: 'verified', sessionId };
    }

    // [META] لا رقم في الويبهوك (اسم مستخدم بلا تفاعلٍ سابق): نطلب مشاركته.
    if (!event.senderRef) return { outcome: 'no_sender', sessionId };
    await tx.query(
      `UPDATE whatsapp_signup_sessions
          SET status = 'awaiting_contact', sender_ref = $2,
              contact_deadline = now() + make_interval(secs => $3)
        WHERE id = $1 AND status = 'pending'`,
      [session.id, event.senderRef, contactTtlSeconds],
    );
    await tx.query(
      `INSERT INTO whatsapp_outbox (session_id, kind) VALUES ($1, 'contact_request') ON CONFLICT DO NOTHING`,
      [session.id],
    );
    return { outcome: 'contact_requested', sessionId };
  }

  // ردّ زرّ «مشاركة الرقم» — يُربط بالجلسة بمعرّف المرسِل (BSUID) الذي طلبناه منه.
  if (!event.senderRef) return { outcome: 'no_sender' };
  const { rows: [session] } = await tx.query<SessionRow>(
    `SELECT * FROM whatsapp_signup_sessions
      WHERE status = 'awaiting_contact' AND sender_ref = $1
      ORDER BY created_at DESC LIMIT 1
      FOR UPDATE`,
    [event.senderRef],
  );
  if (!session) return { outcome: 'no_session' };
  const sessionId = session.id;
  if ((session.contact_deadline?.getTime() ?? 0) + clockSkewSeconds * 1000 < event.sentAt.getTime()) {
    return { outcome: 'expired', sessionId };
  }
  if (now > (session.contact_deadline?.getTime() ?? 0) + webhookGraceSeconds * 1000) return { outcome: 'late', sessionId };
  const shared = normalizeIraqiPhone(event.sharedWaId);
  // إن كشف الويبهوك رقمَ المرسِل أيضاً فلا بدّ أن يطابق الرقمَ المُشارَك.
  const sender = event.senderPhone ? normalizeIraqiPhone(event.senderPhone) : shared;
  if (shared === null || shared !== session.phone || sender !== shared) {
    return { outcome: await registerMismatch(tx, session), sessionId };
  }
  await tx.query(
    `UPDATE whatsapp_signup_sessions
        SET status = 'verified', verified_at = now(), verified_via = 'contact_request'
      WHERE id = $1 AND status = 'awaiting_contact'`,
    [session.id],
  );
  return { outcome: 'verified', sessionId };
}
