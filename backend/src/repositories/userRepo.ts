import type pg from 'pg';
import type { PublicUser, Role } from '../types/index.js';

export interface UserRow {
  id: string;
  username: string;
  phone: string;
  password_hash: string;
  avatar_url: string | null;
  role: Role;
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
    isPhoneVerified: row.phone_verified_at !== null,
    createdAt: row.created_at.toISOString(),
  };
}

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

  async create(
    db: pg.Pool | pg.PoolClient,
    input: { username: string; phone: string; passwordHash: string; avatarUrl?: string | null },
  ): Promise<UserRow> {
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (username, phone, password_hash, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.username, input.phone, input.passwordHash, input.avatarUrl ?? null],
    );
    return rows[0]!;
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: {
      username?: string;
      avatarUrl?: string | null;
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
    if (input.avatarUrl !== undefined) {
      values.push(input.avatarUrl);
      sets.push(`avatar_url = $${values.length}`);
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
  async findAuthState(
    db: pg.Pool | pg.PoolClient,
    id: string,
  ): Promise<{ id: string; role: Role; phone: string; isActive: boolean; tokenVersion: number } | null> {
    const { rows } = await db.query<{
      id: string;
      role: Role;
      phone: string;
      is_active: boolean;
      token_version: number;
    }>(
      'SELECT id, role, phone, is_active, token_version FROM users WHERE id = $1',
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
    page: number,
    limit: number,
    filter: 'all' | 'registered' | 'pending' = 'registered',
  ) {
    const conditions = ["u.role = 'customer'"];
    if (filter === 'registered') conditions.push('u.birth_day IS NOT NULL');
    if (filter === 'pending') {
      // مؤهَّل ولم يسجّل: فُتح له الخيار (طلب مكتمل) وما زال الحقل فارغاً.
      conditions.push('u.birth_day IS NULL');
      conditions.push(
        "EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'COMPLETED')",
      );
    }
    if (filter === 'all') {
      conditions.push(
        "(u.birth_day IS NOT NULL OR EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'COMPLETED'))",
      );
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [data, count] = await Promise.all([
      db.query<{
        id: string;
        username: string;
        phone: string;
        avatar_url: string | null;
        birth_day: number | null;
        birth_month: number | null;
        birthday_set_at: Date | null;
        completed_orders: string;
        discount_used_this_year: boolean;
        is_active: boolean;
      }>(
        `SELECT u.id, u.username, u.phone, u.avatar_url,
                u.birth_day, u.birth_month, u.birthday_set_at, u.is_active,
                (SELECT COUNT(*)::text FROM orders o
                  WHERE o.user_id = u.id AND o.status = 'COMPLETED')
                  AS completed_orders,
                EXISTS (SELECT 1 FROM birthday_discount_usage b
                         WHERE b.user_id = u.id
                           AND b.used_year = EXTRACT(YEAR FROM now())::int)
                  AS discount_used_this_year
           FROM users u
          ${where}
          ORDER BY (u.birth_day IS NULL), u.birth_month, u.birth_day, u.username
          LIMIT $1 OFFSET $2`,
        [limit, (page - 1) * limit],
      ),
      db.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM users u ${where}`),
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
        completedOrders: Number(r.completed_orders),
        discountUsedThisYear: r.discount_used_this_year,
        isActive: r.is_active,
      })),
      total: Number(count.rows[0]?.total ?? 0),
    };
  },

  /** قائمة العملاء للإدارة (مع العدد الإجمالي). */
  async listCustomers(
    db: pg.Pool | pg.PoolClient,
    page: number,
    limit: number,
  ): Promise<{ items: UserRow[]; total: number }> {
    const [data, count] = await Promise.all([
      db.query<UserRow>(
        `SELECT * FROM users WHERE role = 'customer'
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, (page - 1) * limit],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM users WHERE role = 'customer'`,
      ),
    ]);
    return { items: data.rows, total: Number(count.rows[0]?.total ?? 0) };
  },
};