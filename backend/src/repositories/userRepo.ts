import type pg from 'pg';
import { GALAXY_LEVELS } from '../domain/galaxyPoints.js';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '../utils/locale.js';
import type { Gender, PublicUser, Role } from '../types/index.js';
import { phoneSearchFragment } from '../utils/phone.js';

export interface UserRow {
  /** لغة المخاطبة المختارة (هجرة ٠٤٦) — `ar` افتراضاً لكل حساب قائم. */
  preferred_language: string;
  id: string;
  username: string;
  phone: string;
  password_hash: string;
  avatar_url: string | null;
  role: Role;
  /** `null` = لم يُسأل بعد. لا يُخمَّن أبداً. */
  gender: Gender | null;
  is_active: boolean;
  /** لحظة إثبات ملكية الرقم — `null` يعني حساباً لم يُتمّ التحقق بعد. */
  phone_verified_at: Date | null;
  /** نسخة التوكن — زيادتها تُبطل كل التوكنات المُصدَرة قبلها. */
  token_version: number;
  created_at: Date;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    role: row.role,
    gender: row.gender,
    isPhoneVerified: row.phone_verified_at !== null,
    preferredLanguage: isAppLocale(row.preferred_language)
      ? row.preferred_language
      : DEFAULT_LOCALE,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * رصيد النقاط مشتقّاً من الدفتر — تعريف واحد يُستعمل في الترشيح والعرض
 * والترتيب معاً، فلا تختلف قيمةُ عمودٍ عن قيمة شرطٍ يفترض أنه يقيسها.
 */
const POINTS_BALANCE = `COALESCE(
  (SELECT SUM(pl.amount) FROM points_ledger pl WHERE pl.user_id = u.id), 0
)`;

export const CUSTOMER_SORTS = [
  'newest',
  'oldest',
  'name',
  'points_desc',
  'orders_desc',
  'last_order',
] as const;

export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

const CUSTOMER_SORT_CLAUSES: Record<CustomerSort, string> = {
  newest: 'u.created_at DESC',
  oldest: 'u.created_at ASC',
  name: 'u.username ASC',
  points_desc: `${POINTS_BALANCE} DESC, u.created_at DESC`,
  orders_desc:
    '(SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) DESC, u.created_at DESC',
  // الزبائن بلا طلبات في الآخر لا في الأول — الترتيب سؤال عن الأنشط.
  last_order:
    '(SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id) DESC NULLS LAST',
};

/**
 * نطاق التقويم لكل استعلام ميلاد: المنطقة الزمنية والنافذة كعمودين.
 *
 * [CRITICAL] الوصل الصريح ليس زينة. لو حُقن المتغيّران في الشروط مباشرةً
 * لبقيا بلا مرجع في المرشِّحات التي لا تحتاجهما («غير مسجّل» مثلاً)،
 * ويرفض PostgreSQL أي جملة تُمرَّر إليها متغيّرات أكثر مما تستعمل. الوصل
 * يضمن أن كليهما مستعمَل دائماً مهما كان المرشِّح، والشروط تقرؤهما بالاسم.
 */
const SCOPE_JOIN = `CROSS JOIN (SELECT $1::text AS tz, $2::int AS days) k`;

/** «اليوم» بتقويم المتجر لا بساعة الخادم. */
const TODAY = `(now() AT TIME ZONE k.tz)::date`;

/** أقرب عيد قادم (أو اليوم) — الدالة في هجرة ٠٢٦. */
const NEXT_BIRTHDAY = `next_birthday(u.birth_day, u.birth_month, ${TODAY})`;

/** العيد الماضي = القادم ناقص سنة؛ يعالج التفاف السنة من تلقائه. */
const LAST_BIRTHDAY = `(${NEXT_BIRTHDAY} - interval '1 year')::date`;

const HAS_COMPLETED_ORDER =
  "EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'COMPLETED')";

/** شروط كل مرشِّح — مصدر واحد تقرأ منه القائمةُ والعدّاداتُ معاً. */
const BIRTHDAY_CONDITIONS: Record<BirthdayFilter, string[]> = {
  all: [`(u.birth_day IS NOT NULL OR ${HAS_COMPLETED_ORDER})`],
  registered: ['u.birth_day IS NOT NULL'],
  // مؤهَّل ولم يسجّل: فُتح له الخيار (طلب مكتمل) وما زال الحقل فارغاً.
  pending: ['u.birth_day IS NULL', HAS_COMPLETED_ORDER],
  // كل من لم يسجّل ميلاده — جمهور رسالة «أكمل تاريخ ميلادك».
  missing: ['u.birth_day IS NULL'],
  today: ['u.birth_day IS NOT NULL', `${NEXT_BIRTHDAY} = ${TODAY}`],
  upcoming: [
    'u.birth_day IS NOT NULL',
    `${NEXT_BIRTHDAY} BETWEEN ${TODAY} AND ${TODAY} + make_interval(days => k.days)`,
  ],
  recent: [
    'u.birth_day IS NOT NULL',
    `${LAST_BIRTHDAY} BETWEEN ${TODAY} - make_interval(days => k.days) AND ${TODAY}`,
  ],
};

export const BIRTHDAY_FILTERS = [
  'all',
  'registered',
  'pending',
  'missing',
  'today',
  'upcoming',
  'recent',
] as const;

export type BirthdayFilter = (typeof BIRTHDAY_FILTERS)[number];

export const userRepo = {
  async findByPhone(db: pg.Pool | pg.PoolClient, phone: string): Promise<UserRow | null> {
    const { rows } = await db.query<UserRow>(
      'SELECT * FROM users WHERE phone = $1',
      [phone],
    );
    return rows[0] ?? null;
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string): Promise<UserRow | null> {
    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ?? null;
  },

  /** عدّة حسابات بمعرّفاتها في جملة واحدة — لصفحةٍ تعرض صفوفاً لحساباتٍ شتّى. */
  async findByIds(db: pg.Pool | pg.PoolClient, ids: string[]): Promise<Map<string, UserRow>> {
    const users = new Map<string, UserRow>();
    if (ids.length === 0) return users;
    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = ANY($1::uuid[])', [ids]);
    for (const row of rows) users.set(row.id, row);
    return users;
  },

  async create(
    db: pg.Pool | pg.PoolClient,
    input: {
      username: string;
      phone: string;
      passwordHash: string;
      avatarUrl?: string | null;
      gender?: Gender | null;
    },
  ): Promise<UserRow> {
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (username, phone, password_hash, avatar_url, gender)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.username,
        input.phone,
        input.passwordHash,
        input.avatarUrl ?? null,
        input.gender ?? null,
      ],
    );
    return rows[0]!;
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: {
      username?: string;
      avatarUrl?: string | null;
      gender?: Gender;
      preferredLanguage?: AppLocale;
      passwordHash?: string;
      isActive?: boolean;
      phoneVerifiedAt?: Date | null;
      /** يزيد `token_version` بواحد — يُبطل كل جلسة سابقة لهذا المستخدم. */
      bumpTokenVersion?: boolean;
    },
  ): Promise<UserRow> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (input.username !== undefined) {
      values.push(input.username);
      sets.push(`username = $${values.length}`);
    }
    if (input.preferredLanguage !== undefined) {
      values.push(input.preferredLanguage);
      sets.push(`preferred_language = $${values.length}`);
    }
    if (input.avatarUrl !== undefined) {
      values.push(input.avatarUrl);
      sets.push(`avatar_url = $${values.length}`);
    }
    // الجنس يُضبط ولا يُمحى: القيمة الغائبة عن الطلب تعني «لا تغيّر»، ولا
    // مسار يعيد الحساب إلى «مجهول» بعد أن اختار صاحبه.
    if (input.gender !== undefined) {
      values.push(input.gender);
      sets.push(`gender = $${values.length}`);
    }
    if (input.passwordHash !== undefined) {
      values.push(input.passwordHash);
      sets.push(`password_hash = $${values.length}`);
    }
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      sets.push(`is_active = $${values.length}`);
    }
    if (input.phoneVerifiedAt !== undefined) {
      values.push(input.phoneVerifiedAt);
      sets.push(`phone_verified_at = $${values.length}`);
    }
    if (input.bumpTokenVersion) {
      sets.push('token_version = token_version + 1');
    }
    if (sets.length === 0) {
      return (await this.findById(db, id))!;
    }
    const { rows } = await db.query<UserRow>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0]!;
  },

  /**
   * الحالة الأمنية للمستخدم — يقرؤها وسيط المصادقة عند كل طلب محمي.
   *
   * استعلام مفتاحٍ أساسي بثلاثة أعمدة، لا `SELECT *`: التوكن وحده لا يكفي
   * للإذن لأنه ثابتٌ لسبعة أيام بينما الإيقاف لحظي. هذا هو الفارق بين
   * «إيقاف الحساب» و«إيقاف الحساب فعلاً».
   */
  /**
   * لغة مخاطبة مستخدمٍ بعينه — للإشعارات.
   *
   * [CRITICAL] المُرسِل ليس المستلِم: الإدارة تغيّر حالة الطلب، والإشعار
   * يذهب للزبون. أخذُ اللغة من `req.auth` كان سيرسل للزبون الكرديّ إشعاراً
   * بلغة المسؤول. تُقرأ من صفّ المستلِم دائماً.
   */
  async localeOf(db: pg.Pool | pg.PoolClient, userId: string): Promise<AppLocale> {
    const { rows } = await db.query<{ preferred_language: string }>(
      'SELECT preferred_language FROM users WHERE id = $1',
      [userId],
    );
    const value = rows[0]?.preferred_language;
    return isAppLocale(value) ? value : DEFAULT_LOCALE;
  },

  /**
   * تقسيم قائمة مستلِمين حسب لغتهم — للإشعارات الجماعية.
   *
   * [CRITICAL] `createMany` يكتب صفّاً واحداً بنصٍّ واحد لكل المستلِمين.
   * مشتركو منتجٍ واحد قد يكون بعضهم عربياً وبعضهم كردياً، فإرسالٌ واحد كان
   * سيصل نصفَهم بلغةٍ ليست لغتهم. التقسيم هنا يجعل كل لغةٍ إرسالاً مستقلاً.
   */
  async groupIdsByLocale(
    db: pg.Pool | pg.PoolClient,
    userIds: string[],
  ): Promise<Map<AppLocale, string[]>> {
    const groups = new Map<AppLocale, string[]>();
    if (userIds.length === 0) return groups;
    const { rows } = await db.query<{ id: string; preferred_language: string }>(
      'SELECT id, preferred_language FROM users WHERE id = ANY($1::uuid[])',
      [userIds],
    );
    for (const row of rows) {
      const locale = isAppLocale(row.preferred_language)
        ? row.preferred_language
        : DEFAULT_LOCALE;
      const bucket = groups.get(locale) ?? [];
      bucket.push(row.id);
      groups.set(locale, bucket);
    }
    return groups;
  },

  async findAuthState(
    db: pg.Pool | pg.PoolClient,
    id: string,
  ): Promise<{
    id: string;
    role: Role;
    phone: string;
    isActive: boolean;
    tokenVersion: number;
    locale: AppLocale;
  } | null> {
    const { rows } = await db.query<{
      id: string;
      role: Role;
      phone: string;
      is_active: boolean;
      token_version: number;
      preferred_language: string;
    }>(
      `SELECT id, role, phone, is_active, token_version, preferred_language
         FROM users WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      phone: row.phone,
      isActive: row.is_active,
      tokenVersion: row.token_version,
      locale: isAppLocale(row.preferred_language) ? row.preferred_language : DEFAULT_LOCALE,
    };
  },

  /**
   * سجلّ أعياد الميلاد كما تقرأه الإدارة.
   *
   * يقرأ نفس أعمدة `users` التي يكتبها مسار العميل — لا جدول ولا حقل ميلاد
   * ثانٍ. الجديد هو **حالة التسجيل**: القائمة تشمل الآن العملاء المؤهَّلين
   * الذين لم يسجّلوا بعد، لأن «من لم يسجّل» سؤالٌ إداري حقيقي لا يجيب عنه
   * عرضُ المسجَّلين وحدهم.
   *
   * الأهلية = طلب مكتمل واحد على الأقل، وهي نفس القاعدة التي يفرضها
   * `birthdayRepo.status` — لا تعريف ثانٍ لها هنا.
   *
   * يُرفق عدد الطلبات المكتملة (سبب فتح الخيار أصلاً) وهل استُهلك خصم هذه
   * السنة. لا عناوين ولا محتويات طلبات: عيد الميلاد لا يستدعي فتح الملف.
   */
  async listBirthdayCustomers(
    db: pg.Pool | pg.PoolClient,
    options: {
      page: number;
      limit: number;
      filter?: BirthdayFilter;
      /** نافذة «قريباً»/«مؤخّراً» بالأيام. */
      windowDays?: number;
      /** منطقة المتجر — «اليوم» تقويمُ الزبون لا ساعة الخادم. */
      timezone: string;
    },
  ) {
    const filter = options.filter ?? 'registered';
    const windowDays = options.windowDays ?? 7;

    const conditions = ["u.role = 'customer'", ...BIRTHDAY_CONDITIONS[filter]];
    const where = `WHERE ${conditions.join(' AND ')}`;
    const scope = [options.timezone, windowDays];

    const [data, count] = await Promise.all([
      db.query<{
        id: string;
        username: string;
        phone: string;
        avatar_url: string | null;
        birth_day: number | null;
        birth_month: number | null;
        birthday_set_at: Date | null;
        next_birthday: string | null;
        days_until: number | null;
        completed_orders: string;
        discount_used_this_year: boolean;
        is_active: boolean;
      }>(
        `SELECT u.id, u.username, u.phone, u.avatar_url,
                u.birth_day, u.birth_month, u.birthday_set_at, u.is_active,
                ${NEXT_BIRTHDAY} AS next_birthday,
                (${NEXT_BIRTHDAY} - ${TODAY}) AS days_until,
                (SELECT COUNT(*)::text FROM orders o
                  WHERE o.user_id = u.id AND o.status = 'COMPLETED')
                  AS completed_orders,
                EXISTS (SELECT 1 FROM birthday_discount_usage b
                         WHERE b.user_id = u.id
                           AND b.used_year = EXTRACT(YEAR FROM ${TODAY})::int)
                  AS discount_used_this_year
           FROM users u ${SCOPE_JOIN}
          ${where}
          ORDER BY (u.birth_day IS NULL), ${NEXT_BIRTHDAY}, u.username
          LIMIT $3 OFFSET $4`,
        [...scope, options.limit, (options.page - 1) * options.limit],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM users u ${SCOPE_JOIN} ${where}`,
        scope,
      ),
    ]);

    return {
      items: data.rows.map((r) => ({
        id: r.id,
        username: r.username,
        phone: r.phone,
        avatarUrl: r.avatar_url,
        birthDay: r.birth_day,
        birthMonth: r.birth_month,
        birthdaySetAt: r.birthday_set_at,
        /** مشتقّة من `birthday_set_at` — لا عمود حالة مكرّر. */
        isRegistered: r.birth_day !== null,
        /** أقرب عيد قادم بتقويم المتجر (null لمن لم يسجّل). */
        nextBirthday: r.next_birthday,
        daysUntilBirthday: r.days_until === null ? null : Number(r.days_until),
        completedOrders: Number(r.completed_orders),
        discountUsedThisYear: r.discount_used_this_year,
        isActive: r.is_active,
      })),
      total: Number(count.rows[0]?.total ?? 0),
    };
  },

  /**
   * عدّادات تصنيف الزبائن بالجنس — استعلامٌ واحد على كامل الجدول.
   *
   * [CRITICAL] تُحسب في القاعدة لا من الصفحة المحمَّلة. جمعُ الصفحة الحالية
   * كان سيقول «الذكور ١٢» عن عشرين صفاً معروضاً بينما هم سبعمئة في المتجر.
   * ولا تُجلب القائمة كاملةً إلى المتصفّح لعدّها — ذلك يعمل على مئة زبون
   * وينهار على عشرين ألفاً.
   *
   * يحترم البحث والترشيحات الأخرى إن مُرِّرت، فيبقى العدّاد متسقاً مع ما
   * يراه المسؤول أمامه.
   */
  async genderCounts(
    db: pg.Pool | pg.PoolClient,
    options: { search?: string; isActive?: boolean } = {},
  ) {
    const conditions = ["u.role = 'customer'"];
    const values: unknown[] = [];
    if (options.search) {
      const fragment = phoneSearchFragment(options.search);
      values.push(`%${options.search}%`);
      const like = `$${values.length}`;
      if (fragment) {
        values.push(`%${fragment}%`);
        conditions.push(`(u.username ILIKE ${like} OR u.phone ILIKE $${values.length})`);
      } else {
        conditions.push(`(u.username ILIKE ${like} OR u.phone ILIKE ${like})`);
      }
    }
    if (options.isActive !== undefined) {
      values.push(options.isActive);
      conditions.push(`u.is_active = $${values.length}`);
    }

    const { rows } = await db.query<{
      total: string;
      male: string;
      female: string;
      unknown: string;
    }>(
      `SELECT COUNT(*)::text                                        AS total,
              COUNT(*) FILTER (WHERE u.gender = 'male')::text       AS male,
              COUNT(*) FILTER (WHERE u.gender = 'female')::text     AS female,
              COUNT(*) FILTER (WHERE u.gender IS NULL)::text        AS unknown
         FROM users u
        WHERE ${conditions.join(' AND ')}`,
      values,
    );
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      male: Number(row?.male ?? 0),
      female: Number(row?.female ?? 0),
      unknown: Number(row?.unknown ?? 0),
    };
  },

  /**
   * عدّادات تبويبات أعياد الميلاد — استعلام واحد بدل ستة.
   *
   * المسؤول يحتاج الأرقام قبل أن يفتح أي تبويب ليعرف أين يوجّه جهده.
   */
  async birthdayCounts(
    db: pg.Pool | pg.PoolClient,
    timezone: string,
    windowDays = 7,
  ) {
    const filterFor = (filter: BirthdayFilter) =>
      BIRTHDAY_CONDITIONS[filter].join(' AND ');
    const { rows } = await db.query<Record<string, string>>(
      `SELECT
         COUNT(*) FILTER (WHERE ${filterFor('registered')})::text AS registered,
         COUNT(*) FILTER (WHERE ${filterFor('missing')})::text    AS missing,
         COUNT(*) FILTER (WHERE ${filterFor('today')})::text      AS today,
         COUNT(*) FILTER (WHERE ${filterFor('upcoming')})::text   AS upcoming,
         COUNT(*) FILTER (WHERE ${filterFor('recent')})::text     AS recent
       FROM users u ${SCOPE_JOIN}
      WHERE u.role = 'customer'`,
      [timezone, windowDays],
    );
    const row = rows[0] ?? {};
    const n = (key: string) => Number(row[key] ?? 0);
    return {
      registered: n('registered'),
      missing: n('missing'),
      today: n('today'),
      upcoming: n('upcoming'),
      recent: n('recent'),
      windowDays,
    };
  },

  /**
   * قائمة الزبائن للإدارة — بحث وترشيح وترتيب وترقيم، كلها في القاعدة.
   *
   * [CRITICAL] الترشيح على الخادم لا في المتصفح. القائمة تنمو بلا سقف،
   * وجلبها كاملةً لترشيحها في الواجهة يعني تحميل كل زبون في المتجر على كل
   * كتابة حرف في مربع البحث — يعمل على عشرين زبوناً، وينهار على عشرين ألفاً.
   *
   * الرصيد وعدد الطلبات مشتقّان في الاستعلام نفسه: لا عمود رصيد مكرّر في
   * `users` يمكن أن يتباعد عن الدفتر.
   */
  async listCustomers(
    db: pg.Pool | pg.PoolClient,
    options: {
      page: number;
      limit: number;
      /** بحث جزئي في الاسم أو الهاتف. */
      search?: string;
      isActive?: boolean;
      hasBirthday?: boolean;
      hasOrders?: boolean;
      minPoints?: number;
      maxPoints?: number;
      /**
       * ترشيح بالجنس. `unknown` يعني الحسابات التي لم تُسأل بعد (`NULL`).
       *
       * [CRITICAL] الترشيح في القاعدة لا في المتصفح: قائمة الزبائن مرقَّمة،
       * وترشيحُ الصفحة المحمَّلة وحدها يعطي المسؤول «الذكور» في هذه العشرين
       * لا في المتجر كله — رقمٌ يبدو جواباً وهو ليس كذلك.
       */
      gender?: Gender | 'unknown';
      /** ترشيح بمستوى المجرّة — مدى نقاطٍ من السلّم الثابت. */
      levelKey?: string;
      sort?: CustomerSort;
    },
  ) {
    const conditions = ["u.role = 'customer'"];
    const values: unknown[] = [];
    const push = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (options.search) {
      // الرقم يُبحث عنه بأرقامه فقط، فيجد «٠٧٧١ ٢٣٤ ٥٦٧٨» صاحبَه رغم الفراغات.
      //
      // بعد اعتماد E.164 صار المخزَّن `+9647701234567`، والمسؤول يكتب ما
      // اعتاده (`07701234567`). `phoneSearchFragment` ينزع ما ليس رقماً ثم
      // أصفار البداية، فتنتهي الصيغتان إلى `7701234567` وهو مقطعٌ داخل
      // المخزَّن — فيبقى البحث بالصيغة القديمة صالحاً بعد التحويل.
      const fragment = phoneSearchFragment(options.search);
      const like = push(`%${options.search}%`);
      // معرّف الحساب أيضاً: المسؤول يلصق معرّفاً من طلبٍ أو تذكرة دعم فيجد
      // صاحبه. مطابقةٌ من البداية (بادئة) لا احتواء — المعرّف ليس اسماً.
      const idLike = push(`${options.search.trim().toLowerCase()}%`);
      if (fragment) {
        const digitsLike = push(`%${fragment}%`);
        conditions.push(
          `(u.username ILIKE ${like} OR u.phone ILIKE ${digitsLike} OR u.id::text LIKE ${idLike})`,
        );
      } else {
        conditions.push(
          `(u.username ILIKE ${like} OR u.phone ILIKE ${like} OR u.id::text LIKE ${idLike})`,
        );
      }
    }
    if (options.isActive !== undefined) {
      conditions.push(`u.is_active = ${push(options.isActive)}`);
    }
    if (options.levelKey !== undefined) {
      // المستوى مشتقٌّ من الرصيد لا عمودٌ: المدى [عتبة المستوى، عتبة التالي).
      const index = GALAXY_LEVELS.findIndex((l) => l.key === options.levelKey);
      if (index >= 0) {
        const floor = GALAXY_LEVELS[index]!.requiredPoints;
        const next = GALAXY_LEVELS[index + 1];
        conditions.push(`${POINTS_BALANCE} >= ${push(floor)}`);
        if (next) conditions.push(`${POINTS_BALANCE} < ${push(next.requiredPoints)}`);
      }
    }
    if (options.hasBirthday !== undefined) {
      conditions.push(`u.birth_day IS ${options.hasBirthday ? 'NOT NULL' : 'NULL'}`);
    }
    if (options.hasOrders !== undefined) {
      const exists = `EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id)`;
      conditions.push(options.hasOrders ? exists : `NOT ${exists}`);
    }
    if (options.minPoints !== undefined) {
      conditions.push(`${POINTS_BALANCE} >= ${push(options.minPoints)}`);
    }
    if (options.maxPoints !== undefined) {
      conditions.push(`${POINTS_BALANCE} <= ${push(options.maxPoints)}`);
    }
    if (options.gender !== undefined) {
      conditions.push(
        options.gender === 'unknown'
          ? 'u.gender IS NULL'
          : `u.gender = ${push(options.gender)}`,
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countValues = [...values];
    const limitParam = push(options.limit);
    const offsetParam = push((options.page - 1) * options.limit);

    const [data, count] = await Promise.all([
      db.query<{
        id: string;
        username: string;
        phone: string;
        avatar_url: string | null;
        is_active: boolean;
        created_at: Date;
        birth_day: number | null;
        birth_month: number | null;
        gender: Gender | null;
        points: string;
        orders_total: string;
        orders_completed: string;
        last_order_at: Date | null;
      }>(
        `SELECT u.id, u.username, u.phone, u.avatar_url, u.is_active, u.created_at,
                u.birth_day, u.birth_month, u.gender,
                ${POINTS_BALANCE}::text AS points,
                (SELECT COUNT(*)::text FROM orders o WHERE o.user_id = u.id)
                  AS orders_total,
                (SELECT COUNT(*)::text FROM orders o
                  WHERE o.user_id = u.id AND o.status = 'COMPLETED')
                  AS orders_completed,
                (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id)
                  AS last_order_at
           FROM users u
          ${where}
          ORDER BY ${CUSTOMER_SORT_CLAUSES[options.sort ?? 'newest']}
          LIMIT ${limitParam} OFFSET ${offsetParam}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM users u ${where}`,
        countValues,
      ),
    ]);

    return {
      items: data.rows.map((row) => ({
        id: row.id,
        username: row.username,
        phone: row.phone,
        avatarUrl: row.avatar_url,
        isActive: row.is_active,
        createdAt: row.created_at,
        hasBirthday: row.birth_day !== null,
        birthDay: row.birth_day,
        birthMonth: row.birth_month,
        // `null` يبقى `null` — «غير محدَّد» حالةٌ حقيقية لا تُخمَّن.
        gender: row.gender,
        points: Number(row.points),
        ordersTotal: Number(row.orders_total),
        ordersCompleted: Number(row.orders_completed),
        lastOrderAt: row.last_order_at,
      })),
      total: Number(count.rows[0]?.total ?? 0),
    };
  },
};