import type pg from 'pg';

/**
 * جمهور الإشعار — من يستقبله.
 *
 * الاستهداف يُحسم في القاعدة لا في التطبيق: قائمة الزبائن تنمو، وجلبها
 * كاملةً إلى Node لترشيحها هناك يكلّف ذاكرةً ووقتاً بلا مقابل، ويجعل
 * «اليوم» و«قريباً» عرضةً لساعة العملية بدل تقويم المتجر.
 */
export type Audience =
  | { type: 'all' }
  | { type: 'users'; userIds: string[] }
  | { type: 'segment'; segment: AudienceSegment; windowDays?: number };

export const AUDIENCE_SEGMENTS = [
  /** عيد ميلادهم اليوم بتقويم المتجر. */
  'birthday_today',
  /** عيد ميلادهم خلال النافذة القادمة (٧/١٤/٣٠ يوماً عادةً). */
  'birthday_upcoming',
  /** لم يسجّلوا تاريخ ميلادهم بعد. */
  'birthday_missing',
  /** مرّ عيد ميلادهم خلال النافذة الماضية. */
  'birthday_recent',
  /** لهم طلب مكتمل واحد على الأقل. */
  'has_orders',
  /** لا طلب مكتمل لهم بعد. */
  'no_orders',
] as const;

export type AudienceSegment = (typeof AUDIENCE_SEGMENTS)[number];

/**
 * نطاق التقويم كعمودين مربوطين بالاستعلام.
 *
 * [CRITICAL] الوصل الصريح يضمن أن المتغيّرين مستعملان دائماً. حقنهما في
 * الشروط مباشرةً كان سيتركهما بلا مرجع في شرائح لا تحتاجهما («لم يسجّل
 * ميلاده»، «له طلبات»)، وPostgreSQL يرفض جملةً تُمرَّر إليها متغيّرات
 * أكثر مما تستعمل — فتنهار الشريحةُ البسيطة دون غيرها.
 */
const SCOPE_JOIN = (tz: string, days: string) =>
  `CROSS JOIN (SELECT ${tz}::text AS tz, ${days}::int AS days) k`;

/** «اليوم» بتقويم المتجر — يُبنى مرة ويُعاد استعماله في كل شرط. */
const TODAY = `(now() AT TIME ZONE k.tz)::date`;

const NEXT_BIRTHDAY = `next_birthday(u.birth_day, u.birth_month, ${TODAY})`;

/** العيد الماضي = القادم ناقص سنة؛ يعالج التفاف السنة من تلقائه. */
const LAST_BIRTHDAY = `(${NEXT_BIRTHDAY} - interval '1 year')::date`;

/** شرط SQL لكل شريحة، معبَّراً عنه على `u` (صف المستخدم) و`k` (النطاق). */
const SEGMENT_CONDITIONS: Record<AudienceSegment, string> = {
  birthday_today: `u.birth_day IS NOT NULL AND ${NEXT_BIRTHDAY} = ${TODAY}`,
  birthday_upcoming: `u.birth_day IS NOT NULL
       AND ${NEXT_BIRTHDAY}
             BETWEEN ${TODAY} AND ${TODAY} + make_interval(days => k.days)`,
  birthday_missing: 'u.birth_day IS NULL',
  birthday_recent: `u.birth_day IS NOT NULL
       AND ${LAST_BIRTHDAY}
             BETWEEN ${TODAY} - make_interval(days => k.days) AND ${TODAY}`,
  has_orders: `EXISTS (SELECT 1 FROM orders o
                        WHERE o.user_id = u.id AND o.status = 'COMPLETED')`,
  no_orders: `NOT EXISTS (SELECT 1 FROM orders o
                           WHERE o.user_id = u.id AND o.status = 'COMPLETED')`,
};

export const DEFAULT_BIRTHDAY_WINDOW_DAYS = 7;

export interface AudienceQuery {
  /** وصل النطاق — يُدرج بعد `FROM users u` متى احتاجه الشرط. */
  join: string;
  where: string;
  values: unknown[];
}

/**
 * يبني شرط الاستهداف مع قيمه.
 *
 * الزبائن الموقوفون مستبعدون دائماً: حسابٌ أوقفته الإدارة لا يُرسَل إليه
 * إعلان، والإشعار الذي لا يستطيع صاحبه فتح التطبيق لقراءته ضجيجٌ في
 * الجدول لا أكثر.
 */
export function audienceWhere(
  audience: Audience,
  timezone: string,
  startIndex = 1,
): AudienceQuery {
  const values: unknown[] = [];
  const next = () => `$${startIndex + values.length - 1}`;

  const base = ["u.role = 'customer'", 'u.is_active = TRUE'];

  if (audience.type === 'all') {
    return { join: '', where: base.join(' AND '), values };
  }

  if (audience.type === 'users') {
    values.push(audience.userIds);
    base.push(`u.id = ANY(${next()}::uuid[])`);
    return { join: '', where: base.join(' AND '), values };
  }

  values.push(timezone);
  const tz = next();
  values.push(audience.windowDays ?? DEFAULT_BIRTHDAY_WINDOW_DAYS);
  const days = next();

  base.push(`(${SEGMENT_CONDITIONS[audience.segment]})`);
  return { join: SCOPE_JOIN(tz, days), where: base.join(' AND '), values };
}

export const audienceRepo = {
  /** عدد المستهدفين — يُعرض للمسؤول قبل الإرسال. */
  async count(db: pg.Pool | pg.PoolClient, audience: Audience, timezone: string) {
    const { join, where, values } = audienceWhere(audience, timezone);
    const { rows } = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM users u ${join} WHERE ${where}`,
      values,
    );
    return Number(rows[0]?.total ?? 0);
  },

  /** معرّفات المستهدفين. */
  async ids(db: pg.Pool | pg.PoolClient, audience: Audience, timezone: string) {
    const { join, where, values } = audienceWhere(audience, timezone);
    const { rows } = await db.query<{ id: string }>(
      `SELECT u.id FROM users u ${join} WHERE ${where}`,
      values,
    );
    return rows.map((row) => row.id);
  },
};
