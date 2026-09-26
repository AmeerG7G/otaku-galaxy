import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { config } from '../src/config/index.js';
import { normalizeIraqiPhone } from '../src/utils/phone.js';

/**
 * حساب المسؤول الأولي — اختياري، صريح، وغير مطبوع.
 *
 * كان البذر ينشئ مسؤولاً بكلمة `admin123` ثابتة ويطبعها في السجل. أي نشرة
 * تشغّل البذر تحصل على مسؤولٍ بكلمة مرور يعرفها كل من قرأ المستودع، ويبقى
 * أثرها في سجلّات الخادم وأنابيب النشر. الآن:
 *   - لا يُنشأ حساب إطلاقاً ما لم تُضبط `SEED_ADMIN_PHONE` و`SEED_ADMIN_PASSWORD`.
 *   - الإنتاج يرفض البذر ما لم يُطلَب صراحةً بـ `ALLOW_PRODUCTION_SEED=true`.
 *   - لا تُطبع كلمة المرور ولا تُشتق من قيمة افتراضية.
 *
 * ═══ الرقم ═══ يُقبل بأي صيغة عراقية يقبلها التطبيق (`07…`، `7…`، `964…`،
 * `+964…`، `00964…`) ويُخزَّن **بالصيغة المعتمدة E.164** عبر
 * `normalizeIraqiPhone` — التنفيذ الواحد الذي يمرّ منه كل رقم في الخادم.
 *
 * [CRITICAL] كان البذر يتحقّق بتعبيرٍ محلي خاص (`^07\d{9}$`) ثم يُدرج النصّ
 * كما ورد، فيرتطم بقيد `users_phone_check` الذي صار E.164 منذ الهجرة 037:
 * لم يكن ممكناً إنشاء مسؤولٍ بالبذر أصلاً. الحلّ عند حدّ البذر لا في القيد:
 * القيد يبقى كما هو، والرقم يُوحَّد قبل الإدراج كما تُوحَّد أرقام التسجيل.
 *
 * مفصولٌ في ملفّه ليُختبر في العملية نفسها بلا تشغيل بذر الكتالوج كلّه.
 */
export interface SeedAdminEnv {
  SEED_ADMIN_PHONE?: string;
  SEED_ADMIN_PASSWORD?: string;
  SEED_ADMIN_USERNAME?: string;
}

export type SeedAdminResult =
  | { status: 'skipped' }
  | { status: 'created'; phone: string; username: string };

export async function seedAdminUser(
  client: pg.PoolClient | pg.Pool,
  env: SeedAdminEnv = process.env,
  log: (line: string) => void = console.log,
): Promise<SeedAdminResult> {
  const rawPhone = env.SEED_ADMIN_PHONE?.trim();
  const password = env.SEED_ADMIN_PASSWORD;

  if (!rawPhone || !password) {
    log('Admin user: skipped — set SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD to create one.');
    return { status: 'skipped' };
  }

  const phone = normalizeIraqiPhone(rawPhone);
  if (!phone) {
    throw new Error(
      'SEED_ADMIN_PHONE غير صالح — رقم موبايل عراقي بأي صيغة: 07XXXXXXXXX أو +9647XXXXXXXXX.',
    );
  }
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD قصيرة — 12 حرفاً على الأقل.');
  }
  // نفس سقف التسجيل (`validators/auth.ts`): bcrypt يقتطع بصمت بعد 72 بايت،
  // والعربية حرفان بايتان — فكلمةٌ أطول تُخزَّن ناقصةً وصاحبها لا يعلم.
  if (bcrypt.truncates(password)) {
    throw new Error('SEED_ADMIN_PASSWORD طويلة جداً — 72 بايت على الأكثر.');
  }

  const username = env.SEED_ADMIN_USERNAME?.trim() || 'مدير المتجر';
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  await client.query(
    `INSERT INTO users (username, phone, password_hash, role, phone_verified_at)
     VALUES ($1, $2, $3, 'admin', now())
     ON CONFLICT (phone) DO UPDATE
       SET role = 'admin',
           password_hash = EXCLUDED.password_hash,
           phone_verified_at = COALESCE(users.phone_verified_at, now())`,
    [username, phone, passwordHash],
  );
  // الرقم المعتمد وحده يكفي للتأكيد؛ كلمة المرور لا تُطبع بحال.
  log(`Admin user ready: ${phone} (password taken from SEED_ADMIN_PASSWORD, not logged).`);
  return { status: 'created', phone, username };
}
