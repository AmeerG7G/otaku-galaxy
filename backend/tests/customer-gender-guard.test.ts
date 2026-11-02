import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { purgeTestUsers, registerAndLogin, simulateLegacyNullGender } from './helpers.js';

/**
 * الجنس إلزامي لحساب الزبون (D5، الهجرة ٠٧٢): ذكر أو أنثى، ولا حالة ثالثة.
 *
 * [CRITICAL] هذه الاختبارات تسقط على قاعدة ٠٤٠ وحدها: قيدها يقبل NULL، فكان
 * إدراج زبونٍ بلا جنس أو إفراغ جنسه يمرّان بصمت. الزناد يرفض كل طريقٍ يُنشئ
 * زبوناً بلا جنس، ويترك صفوف ما قبل ٠٤٠ قابلةً للتحديث في أعمدةٍ أخرى إلى أن
 * تُكمَل من مصدرها.
 */

const HASH = `$2a$10$${'g'.repeat(53)}`;
let phoneSeq = 0;
const phone = () => `+96477${String(9_100_000 + (phoneSeq += 1)).padStart(8, '0')}`;

async function rejectionOf(sql: string, params: unknown[]) {
  try {
    await db.query(sql, params);
  } catch (error) {
    return error as { code?: string; constraint?: string };
  }
  return null;
}

afterAll(async () => {
  await purgeTestUsers();
});

describe('زناد جنس الزبون — الإدراج', () => {
  it('[CRITICAL] زبونٌ جديد بلا جنس يُرفض بقيدٍ مسمّى', async () => {
    const error = await rejectionOf(
      'INSERT INTO users (username, phone, password_hash) VALUES ($1, $2, $3)',
      ['بلا جنس', phone(), HASH],
    );
    expect(error?.code).toBe('23514');
    expect(error?.constraint).toBe('users_customer_gender_required');
  });

  it('زبونٌ بذكر أو أنثى يُقبل، وقيمةٌ ثالثة يرفضها قيد ٠٤٠', async () => {
    for (const gender of ['male', 'female']) {
      await db.query(
        'INSERT INTO users (username, phone, password_hash, gender) VALUES ($1, $2, $3, $4)',
        ['بجنس', phone(), HASH, gender],
      );
    }
    const third = await rejectionOf(
      'INSERT INTO users (username, phone, password_hash, gender) VALUES ($1, $2, $3, $4)',
      ['ثالث', phone(), HASH, 'unknown'],
    );
    expect(third?.code).toBe('23514');
  });

  it('حساب المسؤول خارج العقد: يُدرج بلا جنس', async () => {
    const adminPhone = phone();
    await db.query(
      `INSERT INTO users (username, phone, password_hash, role, phone_verified_at)
       VALUES ('مسؤول', $1, $2, 'admin', now())`,
      [adminPhone, HASH],
    );
    // تحويله إلى زبون وهو بلا جنس يُرفض.
    const error = await rejectionOf("UPDATE users SET role = 'customer' WHERE phone = $1", [adminPhone]);
    expect(error?.constraint).toBe('users_customer_gender_required');
  });
});

describe('زناد جنس الزبون — التحديث', () => {
  let customerId: string;

  beforeAll(async () => {
    customerId = (await registerAndLogin(undefined, 'female')).userId;
  });

  it('[CRITICAL] إفراغ جنس زبونٍ يُرفض', async () => {
    const error = await rejectionOf('UPDATE users SET gender = NULL WHERE id = $1', [customerId]);
    expect(error?.constraint).toBe('users_customer_gender_required');
  });

  it('تبديل ذكر ↔ أنثى مسموح', async () => {
    await db.query("UPDATE users SET gender = 'male' WHERE id = $1", [customerId]);
    const { rows } = await db.query<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [customerId]);
    expect(rows[0]!.gender).toBe('male');
  });
});

describe('صفوف ما قبل ٠٤٠ (شذوذ قديم)', () => {
  it('[CRITICAL] تبقى قابلةً للتحديث في أعمدةٍ أخرى (الإيقاف ورفع نسخة التوكن)', async () => {
    const legacy = await registerAndLogin();
    await simulateLegacyNullGender(legacy.userId);
    await db.query(
      'UPDATE users SET is_active = FALSE, token_version = token_version + 1 WHERE id = $1',
      [legacy.userId],
    );
    const { rows } = await db.query<{ gender: string | null; is_active: boolean }>(
      'SELECT gender, is_active FROM users WHERE id = $1',
      [legacy.userId],
    );
    // لا تحويل ولا تخمين: يبقى NULL حتى يُكمَل من مصدره.
    expect(rows[0]).toEqual({ gender: null, is_active: false });
  });

  it('[CRITICAL] لا يُفعَّل (يُقبل) حسابٌ بلا جنس', async () => {
    const legacy = await registerAndLogin();
    await simulateLegacyNullGender(legacy.userId);
    await db.query('UPDATE users SET phone_verified_at = NULL WHERE id = $1', [legacy.userId]);
    const error = await rejectionOf('UPDATE users SET phone_verified_at = now() WHERE id = $1', [legacy.userId]);
    expect(error?.constraint).toBe('users_customer_gender_required');
  });

  it('يُكمَل بإحدى القيمتين فقط', async () => {
    const legacy = await registerAndLogin();
    await simulateLegacyNullGender(legacy.userId);
    await db.query("UPDATE users SET gender = 'female' WHERE id = $1", [legacy.userId]);
    const { rows } = await db.query<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [legacy.userId]);
    expect(rows[0]!.gender).toBe('female');
  });
});
