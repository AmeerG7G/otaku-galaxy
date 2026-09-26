import type pg from 'pg';
import type { Gender } from '../types/index.js';
import { phoneSearchFragment } from '../utils/phone.js';

export type AccountRequestKind = 'registration' | 'password_reset';
export type AccountRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccountRequestRow {
  id: string;
  kind: AccountRequestKind;
  status: AccountRequestStatus;
  user_id: string | null;
  submitted_phone: string;
  submitted_username: string;
  submitted_gender: Gender | null;
  submitted_level_key: string | null;
  admin_note: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * طلبات الحساب — إنشاءٌ وإعادةُ تعيين — كما تحسمها الإدارة يدوياً.
 *
 * [CRITICAL] لا كلمة مرور تمرّ من هنا بأي صورة. طلبُ التسجيل يشير إلى صفّ
 * `users` المعلَّق الذي يحمل التجزئة؛ وطلبُ إعادة التعيين لا يحمل كلمةً لأن
 * الإدارة تضعها لاحقاً عبر `adminService.setCustomerPassword`.
 *
 * البيانات المرسَلة تُحفظ كما أُرسلت — انظر رأس الهجرة 048.
 */
export const accountRequestRepo = {
  /**
   * ينشئ طلباً معلَّقاً أو يستأنف المعلَّق القائم لنفس (النوع، الرقم).
   *
   * الاستئناف يحدّث ما أُرسل: من أعاد الإرسال بعد تصحيح اسمه يجب أن ترى
   * الإدارة الأحدث. الفهرس الجزئي الفريد هو ما يجعل «واحد معلَّق» قاعدةً لا
   * أملاً — أي سباقٍ بين طلبين يخسره الثاني ويستأنف.
   */
  async upsertPending(
    db: pg.Pool | pg.PoolClient,
    input: {
      kind: AccountRequestKind;
      userId: string | null;
      submittedPhone: string;
      submittedUsername: string;
      submittedGender: Gender | null;
      submittedLevelKey?: string | null;
    },
  ): Promise<AccountRequestRow> {
    const { rows } = await db.query<AccountRequestRow>(
      `INSERT INTO account_requests
         (kind, user_id, submitted_phone, submitted_username, submitted_gender, submitted_level_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (kind, submitted_phone) WHERE status = 'pending'
       DO UPDATE SET
         user_id             = EXCLUDED.user_id,
         submitted_username  = EXCLUDED.submitted_username,
         submitted_gender    = EXCLUDED.submitted_gender,
         submitted_level_key = EXCLUDED.submitted_level_key,
         updated_at          = now()
       RETURNING *`,
      [
        input.kind,
        input.userId,
        input.submittedPhone,
        input.submittedUsername,
        input.submittedGender,
        input.submittedLevelKey ?? null,
      ],
    );
    return rows[0]!;
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string): Promise<AccountRequestRow | null> {
    const { rows } = await db.query<AccountRequestRow>(
      'SELECT * FROM account_requests WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  },

  /** الطلب المعلَّق لهذا (النوع، الرقم) إن وُجد. */
  async findPending(
    db: pg.Pool | pg.PoolClient,
    kind: AccountRequestKind,
    phone: string,
  ): Promise<AccountRequestRow | null> {
    const { rows } = await db.query<AccountRequestRow>(
      `SELECT * FROM account_requests
        WHERE kind = $1 AND submitted_phone = $2 AND status = 'pending'`,
      [kind, phone],
    );
    return rows[0] ?? null;
  },

  /** آخر طلب من نوعٍ لرقمٍ — بأي حالة. يقرؤه الدخول ليقول «مرفوض» لا «معلَّق». */
  async findLatest(
    db: pg.Pool | pg.PoolClient,
    kind: AccountRequestKind,
    phone: string,
  ): Promise<AccountRequestRow | null> {
    const { rows } = await db.query<AccountRequestRow>(
      `SELECT * FROM account_requests
        WHERE kind = $1 AND submitted_phone = $2
        ORDER BY created_at DESC LIMIT 1`,
      [kind, phone],
    );
    return rows[0] ?? null;
  },

  /**
   * يحسم طلباً معلَّقاً — **ذرّياً**: `WHERE status = 'pending'` في الجملة
   * نفسها، فلو ضغط مسؤولان معاً فاز واحد وقرأ الآخر `null` بدل أن يُحسم
   * الطلب مرّتين.
   */
  async resolve(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { status: 'approved' | 'rejected'; resolvedBy: string; note?: string | null },
  ): Promise<AccountRequestRow | null> {
    const { rows } = await db.query<AccountRequestRow>(
      `UPDATE account_requests
          SET status = $2, resolved_by = $3, admin_note = $4,
              resolved_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, input.status, input.resolvedBy, input.note ?? null],
    );
    return rows[0] ?? null;
  },

  async list(
    db: pg.Pool | pg.PoolClient,
    options: {
      page: number;
      limit: number;
      kind?: AccountRequestKind;
      status?: AccountRequestStatus;
      /** بحث جزئي في الرقم أو الاسم المرسَلين. */
      search?: string;
    },
  ): Promise<{ items: AccountRequestRow[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const push = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (options.kind) conditions.push(`kind = ${push(options.kind)}`);
    if (options.status) conditions.push(`status = ${push(options.status)}`);
    if (options.search) {
      // الرقم يُبحث عنه بأرقامه كما في قائمة الزبائن: المخزَّن `+96477…` والمسؤول
      // يكتب `0777…` — `phoneSearchFragment` ينزع ما ليس رقماً وأصفار البداية
      // فيلتقيان. بدونه كان البحث بالرقم المحلي يعود فارغاً (اكتُشف في تحقّق حيّ).
      const like = push(`%${options.search}%`);
      const fragment = phoneSearchFragment(options.search);
      if (fragment) {
        const digitsLike = push(`%${fragment}%`);
        conditions.push(`(submitted_phone ILIKE ${digitsLike} OR submitted_username ILIKE ${like})`);
      } else {
        conditions.push(`(submitted_phone ILIKE ${like} OR submitted_username ILIKE ${like})`);
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countValues = [...values];
    const limitParam = push(options.limit);
    const offsetParam = push((options.page - 1) * options.limit);

    const [data, count] = await Promise.all([
      db.query<AccountRequestRow>(
        `SELECT * FROM account_requests ${where}
          ORDER BY (status = 'pending') DESC, created_at DESC
          LIMIT ${limitParam} OFFSET ${offsetParam}`,
        values,
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM account_requests ${where}`,
        countValues,
      ),
    ]);
    return { items: data.rows, total: Number(count.rows[0]?.total ?? 0) };
  },

  /** تاريخ طلبات حسابٍ بعينه — لملفّ الزبون. */
  async listForUser(db: pg.Pool | pg.PoolClient, userId: string): Promise<AccountRequestRow[]> {
    const { rows } = await db.query<AccountRequestRow>(
      `SELECT * FROM account_requests
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
    return rows;
  },

  /** عدد المعلَّق لكل نوع — شارة اللوحة. */
  async pendingCounts(db: pg.Pool | pg.PoolClient): Promise<Record<AccountRequestKind, number>> {
    const { rows } = await db.query<{ kind: AccountRequestKind; n: string }>(
      `SELECT kind, COUNT(*)::text AS n FROM account_requests
        WHERE status = 'pending' GROUP BY kind`,
    );
    const out: Record<AccountRequestKind, number> = { registration: 0, password_reset: 0 };
    for (const row of rows) out[row.kind] = Number(row.n);
    return out;
  },
};
