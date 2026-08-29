import type pg from 'pg';
import { BIRTHDAY_DISCOUNT_PERCENT, type BirthdayStatusDto } from '../types/index.js';

type BirthdayRow = {
  birth_day: number | null;
  birth_month: number | null;
  completed_orders: string;
  used_this_year: string;
};

export const birthdayRepo = {
  /**
   * حالة عيد الميلاد محسوبة كلياً على الخادم:
   * - `unlocked` من وجود طلب مكتمل واحد على الأقل.
   * - `rewardAvailable` من اليوم الحالي + غياب استهلاك لهذه السنة.
   */
  async status(db: pg.Pool | pg.PoolClient, userId: string): Promise<BirthdayStatusDto> {
    const { rows } = await db.query<BirthdayRow>(
      `SELECT u.birth_day,
              u.birth_month,
              (SELECT COUNT(*)::text FROM orders o
                WHERE o.user_id = u.id AND o.status = 'COMPLETED') AS completed_orders,
              (SELECT COUNT(*)::text FROM birthday_discount_usage b
                WHERE b.user_id = u.id
                  AND b.used_year = EXTRACT(YEAR FROM now())::int) AS used_this_year
         FROM users u
        WHERE u.id = $1`,
      [userId],
    );

    const row = rows[0];
    if (!row) {
      return {
        unlocked: false,
        day: null,
        month: null,
        hasBirthday: false,
        isBirthdayToday: false,
        rewardAvailable: false,
        discountPercent: BIRTHDAY_DISCOUNT_PERCENT,
      };
    }

    const hasBirthday = row.birth_day !== null && row.birth_month !== null;
    const now = new Date();
    const isBirthdayToday =
      hasBirthday && now.getDate() === row.birth_day && now.getMonth() + 1 === row.birth_month;

    return {
      unlocked: Number(row.completed_orders) > 0,
      day: row.birth_day,
      month: row.birth_month,
      hasBirthday,
      isBirthdayToday,
      rewardAvailable: isBirthdayToday && Number(row.used_this_year) === 0,
      discountPercent: BIRTHDAY_DISCOUNT_PERCENT,
    };
  },

  /** يُضبط مرة واحدة فقط — الشرط في SQL يمنع التعديل لاحقاً. */
  async setBirthday(db: pg.Pool | pg.PoolClient, userId: string, day: number, month: number) {
    const { rowCount } = await db.query(
      `UPDATE users
          SET birth_day = $2, birth_month = $3, birthday_set_at = now()
        WHERE id = $1 AND birth_day IS NULL AND birth_month IS NULL`,
      [userId, day, month],
    );
    return (rowCount ?? 0) > 0;
  },

  /**
   * تسجيل استهلاك الخصم. القيد الفريد (user_id, used_year) هو ما يمنع
   * الاستخدام مرتين في نفس السنة — لا يُعتمد على أي شرط في الواجهة.
   */
  async consume(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    orderId: string,
    amount: number,
  ) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO birthday_discount_usage (user_id, order_id, used_year, amount)
       VALUES ($1, $2, EXTRACT(YEAR FROM now())::int, $3)
       ON CONFLICT (user_id, used_year) DO NOTHING
       RETURNING id`,
      [userId, orderId, amount],
    );
    return rows.length > 0;
  },
};
