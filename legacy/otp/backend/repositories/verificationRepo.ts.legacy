import type pg from 'pg';

export type VerificationPurpose = 'register' | 'password_reset';

export interface VerificationCodeRow {
  id: string;
  phone: string;
  purpose: VerificationPurpose;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  consumed_at: Date | null;
  created_at: Date;
}

export const verificationRepo = {
  async create(
    db: pg.Pool | pg.PoolClient,
    input: { phone: string; purpose: VerificationPurpose; codeHash: string; expiresAt: Date },
  ): Promise<VerificationCodeRow> {
    const { rows } = await db.query<VerificationCodeRow>(
      `INSERT INTO verification_codes (phone, purpose, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.phone, input.purpose, input.codeHash, input.expiresAt],
    );
    return rows[0]!;
  },

  /** أحدث رمز غير مُستهلَك للهاتف والغرض. */
  async latestActive(
    db: pg.Pool | pg.PoolClient,
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationCodeRow | null> {
    const { rows } = await db.query<VerificationCodeRow>(
      `SELECT * FROM verification_codes
       WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone, purpose],
    );
    return rows[0] ?? null;
  },

  /** إبطال كل الرموز الحيّة لهذا (الرقم، الغرض) — يُستدعى قبل إصدار رمز جديد. */
  async consumeAllActive(
    db: pg.Pool | pg.PoolClient,
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<void> {
    await db.query(
      `UPDATE verification_codes SET consumed_at = now()
       WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [phone, purpose],
    );
  },

  /**
   * لحظة آخر إصدار رمز لهذا الرقم — أساس فترة التهدئة بين إرسالين.
   * تشمل الرموز المُستهلَكة عمداً: الإرسال حدث فعلاً ودُفعت كلفته.
   */
  async lastSentAt(
    db: pg.Pool | pg.PoolClient,
    phone: string,
    purpose: VerificationPurpose,
  ): Promise<Date | null> {
    const { rows } = await db.query<{ created_at: Date }>(
      `SELECT created_at FROM verification_codes
       WHERE phone = $1 AND purpose = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone, purpose],
    );
    return rows[0]?.created_at ?? null;
  },

  /** عدد الرموز المُصدَرة لهذا الرقم منذ لحظة معيّنة — أساس سقف النافذة. */
  async countSince(
    db: pg.Pool | pg.PoolClient,
    phone: string,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<number> {
    const { rows } = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM verification_codes
       WHERE phone = $1 AND purpose = $2 AND created_at >= $3`,
      [phone, purpose, since],
    );
    return Number(rows[0]?.total ?? 0);
  },

  async incrementAttempts(db: pg.Pool | pg.PoolClient, id: string): Promise<void> {
    await db.query('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1', [id]);
  },

  async markConsumed(db: pg.Pool | pg.PoolClient, id: string): Promise<void> {
    await db.query(
      'UPDATE verification_codes SET consumed_at = now() WHERE id = $1',
      [id],
    );
  },
};
