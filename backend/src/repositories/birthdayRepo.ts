import type pg from 'pg';
import { BIRTHDAY_DISCOUNT_PERCENT } from '../domain/birthday.js';
import { type BirthdayStatusDto } from '../types/index.js';

type BirthdayRow = {
  birth_day: number | null;
  birth_month: number | null;
  today_day: number;
  today_month: number;
  completed_orders: string;
  used_this_year: string;
};

/**
 * «اليوم» بتقويم المتجر — التعبير نفسه الذي تستعمله قوائم الإدارة
 * (`userRepo`/`audienceRepo`)، فلا يختلف الزبون والمسؤول على تاريخ عيدٍ واحد.
 *
 * [CRITICAL] كان هذا الملف وحده يقيس «اليوم» بساعة عملية Node
 * (`new Date().getDate()`) وسنةَ الاستهلاك بـ`now()` بمنطقة جلسة القاعدة،
 * بينما توثّق `config.storeTimezone` أن كل استعلام ميلاد يمرّ بها. خادمٌ
 * بـUTC كان ينكر على الزبون عيده من منتصف الليل حتى الثالثة فجراً ببغداد
 * ويمنحه إيّاه في الساعات الثلاث التالية لليوم — وخصمُ الميلاد يُحسم هنا.
 */
const STORE_TODAY = `(now() AT TIME ZONE $2)`;

export const birthdayRepo = {
  /**
   * حالة عيد الميلاد محسوبة كلياً على الخادم:
   * - `unlocked` من وجود طلب مكتمل واحد على الأقل.
   * - `rewardAvailable` من اليوم الحالي (بتقويم `timezone`) + غياب استهلاك
   *   لهذه السنة (بالتقويم نفسه).
   */
  async status(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    timezone: string,
  ): Promise<BirthdayStatusDto> {
    const { rows } = await db.query<BirthdayRow>(
      `SELECT u.birth_day,
              u.birth_month,
              EXTRACT(DAY FROM ${STORE_TODAY})::int   AS today_day,
              EXTRACT(MONTH FROM ${STORE_TODAY})::int AS today_month,
              (SELECT COUNT(*)::text FROM orders o
                WHERE o.user_id = u.id AND o.status = 'COMPLETED') AS completed_orders,
              (SELECT COUNT(*)::text FROM birthday_discount_usage b
                WHERE b.user_id = u.id
                  AND b.used_year = EXTRACT(YEAR FROM ${STORE_TODAY})::int) AS used_this_year
         FROM users u
        WHERE u.id = $1`,
      [userId, timezone],
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
    const isBirthdayToday =
      hasBirthday && row.today_day === row.birth_day && row.today_month === row.birth_month;

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
    timezone: string,
  ) {
    // السنة بالتقويم نفسه الذي حكم على «اليوم» في [status]، وإلا اختلف
    // فحصُ الأهلية عن مفتاح الاستهلاك حول رأس السنة.
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO birthday_discount_usage (user_id, order_id, used_year, amount)
       VALUES ($1, $2, EXTRACT(YEAR FROM (now() AT TIME ZONE $4))::int, $3)
       ON CONFLICT (user_id, used_year) DO NOTHING
       RETURNING id`,
      [userId, orderId, amount, timezone],
    );
    return rows.length > 0;
  },
};
