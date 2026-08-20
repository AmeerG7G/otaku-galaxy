import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { userRepo, toPublicUser, type UserRow } from '../repositories/userRepo.js';
import type { AuthUser, PublicUser } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { sendVerificationCode, verifyCode } from './otpService.js';

export interface AuthResult {
  token: string;
  user: PublicUser;
}

function signToken(user: UserRow): string {
  const payload = { sub: user.id, role: user.role, phone: user.phone };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export const authService = {
  async register(input: { username: string; phone: string; password: string }) {
    const existing = await userRepo.findByPhone(db, input.phone);
    if (existing) throw Errors.conflict('هذا الرقم مسجّل بالفعل — جرّب تسجيل الدخول');

    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
    const user = await userRepo.create(db, {
      username: input.username,
      phone: input.phone,
      passwordHash,
    });
    await sendVerificationCode(db, input.phone, 'register');
    return { user: toPublicUser(user) };
  },

  async verifyRegistration(phone: string, code: string) {
    await verifyCode(db, phone, 'register', code);
    // المستخدم أنشئ فعلاً عند التسجيل — التنشيط تلقائي، والتحقق يثبت ملكية الرقم.
  },

  async resendCode(phone: string) {
    const user = await userRepo.findByPhone(db, phone);
    if (!user) throw Errors.conflict('هذا الرقم غير مسجّل');
    await sendVerificationCode(db, phone, 'register');
  },

  async login(phone: string, password: string): Promise<AuthResult> {
    const user = await userRepo.findByPhone(db, phone);
    if (!user) throw Errors.unauthorized('رقم الهاتف أو كلمة المرور غير صحيحة');
    if (!user.is_active) throw Errors.forbidden('الحساب موقوف — تواصل مع الدعم');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw Errors.unauthorized('رقم الهاتف أو كلمة المرور غير صحيحة');

    return { token: signToken(user), user: toPublicUser(user) };
  },

  async forgotPassword(phone: string) {
    const user = await userRepo.findByPhone(db, phone);
    if (!user) throw Errors.conflict('هذا الرقم غير مسجّل');
    await sendVerificationCode(db, phone, 'password_reset');
  },

  async resetPassword(phone: string, code: string, newPassword: string) {
    await verifyCode(db, phone, 'password_reset', code);
    const user = await userRepo.findByPhone(db, phone);
    if (!user) throw Errors.conflict('هذا الرقم غير مسجّل');
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await userRepo.update(db, user.id, { passwordHash });
  },

  async me(auth: AuthUser): Promise<PublicUser> {
    const user = await userRepo.findById(db, auth.id);
    if (!user || !user.is_active) throw Errors.unauthorized('الحساب غير موجود أو موقوف');
    return toPublicUser(user);
  },

  async updateProfile(auth: AuthUser, input: { username?: string; avatarUrl?: string | null }) {
    const user = await userRepo.findById(db, auth.id);
    if (!user) throw Errors.unauthorized('الحساب غير موجود');
    const updated = await userRepo.update(db, auth.id, {
      username: input.username,
      avatarUrl: input.avatarUrl,
    });
    return toPublicUser(updated);
  },
};