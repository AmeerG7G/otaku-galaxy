import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { config } from '../config/index.js';
import { verificationRepo, type VerificationPurpose } from '../repositories/verificationRepo.js';
import { Errors } from '../utils/errors.js';
import { smsProvider } from './sms/index.js';

const CODE_LENGTH = 6;

/**
 * توليد رمز عشوائي آمن تشفيرياً.
 *
 * `crypto.randomInt` يمنح توزيعاً منتظماً بلا انحياز القسمة، ويُشتق من
 * مولّد النظام لا من `Math.random` — فالرمز غير قابل للتنبؤ حتى لو عرف
 * المهاجم رموزاً سابقة ولحظة الإصدار.
 */
function generateCode(): string {
  const max = 10 ** CODE_LENGTH;
  return crypto.randomInt(0, max).toString().padStart(CODE_LENGTH, '0');
}

function hashCode(code: string): string {
  return bcrypt.hashSync(code, 8);
}

function codeTtlMs(): number {
  return config.verification.lifetimeMinutes * 60 * 1000;
}

function messageFor(code: string, purpose: VerificationPurpose): string {
  return purpose === 'password_reset'
    ? `رمز استعادة كلمة المرور الخاص بك: ${code}`
    : `رمز تفعيل حسابك في مجرة الأوتاكو: ${code}`;
}

/**
 * حراسة إعادة الإرسال — تُطبَّق على الرقم لا على الـIP.
 *
 * الحدّ بالـIP وحده لا يحمي صاحب الرقم: مهاجم بعناوين متعددة يقصف رقماً
 * واحداً برسائل، والضحية تدفع الإزعاج والمشروع يدفع كلفة الرسائل. العدّ
 * هنا من القاعدة لأنه يجب أن يصمد عبر إعادة تشغيل الخادم وعبر أكثر من
 * نسخة تعمل خلف موازن حِمل.
 */
async function assertSendAllowed(
  db: pg.Pool | pg.PoolClient,
  phone: string,
  purpose: VerificationPurpose,
): Promise<void> {
  const { resendCooldownSeconds, maxSendsPerWindow, resendWindowMinutes } = config.verification;

  const lastSentAt = await verificationRepo.lastSentAt(db, phone, purpose);
  if (lastSentAt) {
    const elapsedMs = Date.now() - lastSentAt.getTime();
    const cooldownMs = resendCooldownSeconds * 1000;
    if (elapsedMs < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      throw Errors.tooManyRequests(
        `انتظر ${waitSeconds} ثانية قبل طلب رمز جديد`,
        'OTP_RESEND_COOLDOWN',
      );
    }
  }

  const recentSends = await verificationRepo.countSince(
    db,
    phone,
    purpose,
    new Date(Date.now() - resendWindowMinutes * 60 * 1000),
  );
  if (recentSends >= maxSendsPerWindow) {
    throw Errors.tooManyRequests(
      'طلبت رموزاً كثيرة — حاول بعد قليل',
      'OTP_RESEND_LIMIT',
    );
  }
}

/**
 * توليد رمز وإرساله.
 *
 * الرمز لا يُعاد للمستدعي ولا يظهر في أي استجابة API — الطريق الوحيد إليه
 * هو الرسالة النصية (أو طرفية التطوير حين يُفعَّل ذلك صراحةً).
 */
export async function sendVerificationCode(
  db: pg.Pool | pg.PoolClient,
  phone: string,
  purpose: VerificationPurpose,
): Promise<void> {
  await assertSendAllowed(db, phone, purpose);

  // إبطال الرموز السابقة غير المُستهلَكة قبل توليد رمز جديد — رمز واحد حيّ
  // لكل (رقم، غرض) في أي لحظة.
  await verificationRepo.consumeAllActive(db, phone, purpose);

  const code = config.verification.devOtpEnabled
    ? config.verification.devOtpCode
    : generateCode();

  await verificationRepo.create(db, {
    phone,
    purpose,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + codeTtlMs()),
  });

  if (config.verification.devOtpEnabled) {
    // مسار التطوير فقط: `devOtpEnabled` مستحيلٌ أن يكون صحيحاً في الإنتاج
    // (تُجبره طبقة الإعدادات)، فلا يوجد فرعٌ يطبع رمز مستخدم حقيقي.
    console.log(`[OTP:dev] phone=${phone} purpose=${purpose} code=${code}`);
    return;
  }

  await smsProvider().send({ to: phone, message: messageFor(code, purpose) });
}

/**
 * التحقق من الرمز.
 *
 * ملاحظة أمنية: كل مسارات الفشل تُعيد رسالة واحدة تقريباً بلا تمييز بين
 * «لا رمز لهذا الرقم» و«رمز خاطئ»، فلا يُستدلّ من الردّ على وجود الحساب.
 * التمييز الوحيد المتعمَّد هو انتهاء الصلاحية وتجاوز المحاولات، لأن
 * المستخدم الشرعي يحتاج أن يعرف أن عليه طلب رمز جديد.
 */
export async function verifyCode(
  db: pg.Pool | pg.PoolClient,
  phone: string,
  purpose: VerificationPurpose,
  code: string,
): Promise<void> {
  const record = await verificationRepo.latestActive(db, phone, purpose);
  if (!record) throw Errors.badRequest('رمز التحقق غير صحيح أو منتهي', 'OTP_INVALID');

  if (record.expires_at.getTime() < Date.now()) {
    await verificationRepo.markConsumed(db, record.id);
    throw Errors.badRequest('انتهت صلاحية الرمز — اطلب رمزاً جديداً', 'OTP_EXPIRED');
  }

  if (record.attempts >= config.verification.maxAttempts) {
    await verificationRepo.markConsumed(db, record.id);
    throw Errors.badRequest('تجاوزت عدد المحاولات — اطلب رمزاً جديداً', 'OTP_ATTEMPTS_EXCEEDED');
  }

  // العدّاد يزيد **قبل** المقارنة: لو انقطع التنفيذ بعدها لأي سبب تبقى
  // المحاولة محسوبة، فلا يتحوّل الخطأ إلى محاولات مجانية غير محدودة.
  await verificationRepo.incrementAttempts(db, record.id);

  if (!bcrypt.compareSync(code, record.code_hash)) {
    // آخر محاولة مسموحة: نُبطل الرمز فوراً بدل تركه هدفاً لمحاولة أخرى.
    if (record.attempts + 1 >= config.verification.maxAttempts) {
      await verificationRepo.markConsumed(db, record.id);
    }
    throw Errors.badRequest('رمز التحقق غير صحيح', 'OTP_INVALID');
  }

  // الاستهلاك يمنع إعادة استعمال نفس الرمز مرة ثانية.
  await verificationRepo.markConsumed(db, record.id);
}
