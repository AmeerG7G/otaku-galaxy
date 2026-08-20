import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { config } from '../config/index.js';
import { verificationRepo, type VerificationPurpose } from '../repositories/verificationRepo.js';
import { Errors } from '../utils/errors.js';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 دقائق
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return bcrypt.hashSync(code, 8);
}

/**
 * مولّد/مرسل الرموز.
 * في وضع development الرمز ثابت (123456) ويُطبع في السجل المحلي —
 * يطابق التطبيق المحاكي الحالي؛ نظام SMS حقيقي يُستبدل لاحقاً من هنا.
 */
export async function sendVerificationCode(
  db: pg.Pool | pg.PoolClient,
  phone: string,
  purpose: VerificationPurpose,
): Promise<void> {
  // إبطال الرموز السابقة غير المُستهلَكة قبل توليد رمز جديد.
  await db.query(
    `UPDATE verification_codes SET consumed_at = now()
     WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [phone, purpose],
  );

  const code =
    config.verification.provider === 'development'
      ? config.verification.developmentCode
      : crypto.randomInt(100000, 1000000).toString();

  await verificationRepo.create(db, {
    phone,
    purpose,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  // هنا يُدمج مزوّد SMS حقيقي لاحقاً.
  if (config.verification.provider === 'development') {
    console.log(`[OTP:development] phone=${phone} purpose=${purpose} code=${code}`);
  }
}

export async function verifyCode(
  db: pg.Pool | pg.PoolClient,
  phone: string,
  purpose: VerificationPurpose,
  code: string,
): Promise<void> {
  const record = await verificationRepo.latestActive(db, phone, purpose);
  if (!record) throw Errors.badRequest('لا يوجد رمز تحقق صالح لهذا الرقم');

  if (record.consumed_at) throw Errors.badRequest('الرمز مُستهلَك بالفعل');
  if (record.expires_at.getTime() < Date.now()) {
    await verificationRepo.markConsumed(db, record.id);
    throw Errors.badRequest('انتهت صلاحية الرمز — اطلب رمزاً جديداً');
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await verificationRepo.markConsumed(db, record.id);
    throw Errors.badRequest('تجاوزت عدد المحاولات — اطلب رمزاً جديداً');
  }

  await verificationRepo.incrementAttempts(db, record.id);
  const ok = bcrypt.compareSync(code, record.code_hash);
  if (!ok) throw Errors.badRequest('رمز التحقق غير صحيح');

  await verificationRepo.markConsumed(db, record.id);
}