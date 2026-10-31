import type pg from 'pg';

/** الاسم الثابت لصفّ الحساب المحذوف — يظهر في اللوحة على طلباته الباقية. */
export const DELETED_ACCOUNT_NAME = 'حساب محذوف';

/** حالات الطلب التي انتهى أمرها — ما عداها طلبٌ قيد التنفيذ يمنع الحذف. */
const FINISHED_ORDER_STATUSES = ['COMPLETED', 'REJECTED'];

/**
 * جداول بيانات الزبون الشخصية التي تُمحى صفوفها كلها عند الحذف.
 *
 * [CRITICAL] كل مفتاح أجنبي إلى `users(id)` إمّا هنا، وإمّا في `RETAINED`
 * بسببٍ مكتوب، وإمّا عمودُ فاعلٍ إداري (`SET NULL`) لا يخصّ الزبون. يحرس
 * ذلك `tests/account-deletion.test.ts` بقراءة `pg_constraint`: جدولٌ جديد
 * يحمل `user_id` يسقط الاختبار حتى يُقرَّر مصيره هنا.
 *
 * `cart_items` و`collection_products` تسقط مع أصلها (`ON DELETE CASCADE`)،
 * و`push_outbox` مع إشعاراتها ومع `user_id` نفسه.
 */
export const ERASED_TABLES = [
  'reviews',
  'points_ledger',
  'favorites',
  'carts',
  'collections',
  'notifications',
  'push_outbox',
  'restock_subscriptions',
  'restock_variant_subscriptions',
  'user_notification_prefs',
  'device_tokens',
  'user_daily_activity',
  'admin_push_devices',
  'admin_notification_prefs',
] as const;

/**
 * ما يبقى مربوطاً بصفّ الحساب المحذوف — سجلّاتٌ ماليّة للطلبات، بلا بيانات
 * شخصية غير معرّف الشاهد. الطلبات نفسها تبقى **كاملة** (قرار المالك
 * 2026-10-31): رقم التوصيل وعنوانه ومحتوياتها ومبالغها.
 */
export const RETAINED_TABLES = {
  orders: 'سجلّ مالي — يبقى كاملاً (رقم التوصيل والعنوان والمحتويات والمبالغ)',
  birthday_discount_usage: 'خصمٌ طُبِّق على طلبٍ باقٍ — جزء من سجلّه المالي',
  loyalty_reward_redemptions: 'مكافأةٌ طُبِّقت على طلبٍ باقٍ أو سُلِّمت — جزء من سجلّه المالي (غير المستعملة تُحذف)',
  account_deletions: 'سجلّ الحذف نفسه: المرجع والسبب وعدد الطلبات الباقية',
  // admin_audit_log: بلا FK على الهدف — يبقى الإجراء والفاعل والوقت، و`details` تُفرَّغ.
} as const;

export const accountDeletionRepo = {
  /**
   * أقفال الحذف بترتيب إنشاء الطلب نفسه: العربة ثم الحساب.
   *
   * [CRITICAL] الإرسال يقفل العربة `FOR UPDATE` ثم يُدرج الطلب (فيأخذ
   * `KEY SHARE` على صفّ الحساب). بالترتيب نفسه هنا لا جمود: إرسالٌ سبق
   * يلتزم أولاً فيُرى طلبُه قيد التنفيذ ويُرفض الحذف، وإرسالٌ تأخّر يجد
   * العربة محذوفة فيُرفض بـ«العربة فارغة».
   */
  async lockForDeletion(tx: pg.PoolClient, userId: string) {
    await tx.query('SELECT id FROM carts WHERE user_id = $1 FOR UPDATE', [userId]);
    // التقييمات قبل الحساب أيضاً: اعتمادُ تقييمٍ في اللوحة يقفل صفّه ثم يُدرج
    // نقاطاً (فيأخذ `KEY SHARE` على الحساب). لو قفلنا الحساب أولاً ثم انتظرنا
    // صفّ التقييم في `DELETE` لتبادل الطرفان الانتظار (40P01 → 500).
    await tx.query('SELECT id FROM reviews WHERE user_id = $1 ORDER BY id FOR UPDATE', [userId]);
    const { rows } = await tx.query<{ role: string; password_hash: string; token_version: number; phone: string | null }>(
      'SELECT role, password_hash, token_version, phone FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    return rows[0] ?? null;
  },

  async orderCounts(tx: pg.PoolClient, userId: string) {
    const { rows } = await tx.query<{ total: string; active: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status <> ALL($2::text[]))::text AS active
         FROM orders WHERE user_id = $1`,
      [userId, FINISHED_ORDER_STATUSES],
    );
    return { total: Number(rows[0]?.total ?? 0), active: Number(rows[0]?.active ?? 0) };
  },

  /** صور الزبون الخاصة (الملف الشخصي والتقييمات) — صفوفها تُحذف، وملفاتها بعد الالتزام. */
  async deletePersonalMedia(tx: pg.PoolClient, userId: string): Promise<string[]> {
    const { rows } = await tx.query<{ storage_key: string }>(
      `DELETE FROM media_files
        WHERE uploaded_by = $1 AND purpose IN ('avatar', 'review')
        RETURNING storage_key`,
      [userId],
    );
    return rows.map((row) => row.storage_key);
  },

  async erasePersonalRows(tx: pg.PoolClient, userId: string, phone: string) {
    for (const table of ERASED_TABLES) {
      await tx.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
    // مكافآت طُلبت ولم تُستعمل في طلب ولم تُسلَّم: لا طلب تخصّه، وبقاؤها يترك
    // «حساب محذوف» في طابور الهدايا بلا وسيلة تواصل. المرتبطة بطلبٍ باقٍ تبقى.
    await tx.query(
      `DELETE FROM loyalty_reward_redemptions r
        WHERE r.user_id = $1 AND r.consumed_order_id IS NULL AND r.fulfilled_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.loyalty_gift_redemption_id = r.id)`,
      [userId],
    );
    // تنبيه المسؤول بطلب حسابٍ جديد يحمل اسم الزبون ورقمه في نصّه (صفٌّ للمسؤول لا للزبون).
    await tx.query(
      `DELETE FROM push_outbox
        WHERE data->>'requestId' IN (
          SELECT id::text FROM account_requests WHERE user_id = $1 OR submitted_phone = $2)`,
      [userId, phone],
    );
    // طلبات التسجيل وإعادة التعيين تحمل الرقم والاسم كما أُرسلا، ويبقى الصفّ
    // بعد فكّ الربط (`SET NULL`) — فتُحذف بالحساب **وبالرقم** معاً.
    await tx.query('DELETE FROM account_requests WHERE user_id = $1 OR submitted_phone = $2', [userId, phone]);
    // سجلّ إجراءات الإدارة يبقى (من فعل ماذا ومتى)، لكن **محتواه** عن الزبون
    // يُمحى: تعديل الجنس، تصحيح الميلاد (من/إلى والسبب)، سبب الحساب الداخلي.
    // صفوف الوسيط العام (`admin-audit.ts`) لا تحمل إلا أسماء الحقول.
    await tx.query(
      `UPDATE admin_audit_log SET details = '{}'::jsonb
        WHERE target_type = 'customer' AND target_id = $1 AND details <> '{}'::jsonb`,
      [userId],
    );
    // جدول رموز SMS القديم (لا مسار يكتبه بعد ٠٤٨) — بالصيغتين احتياطاً.
    const local = phone.startsWith('+964') ? `0${phone.slice(4)}` : phone;
    await tx.query('DELETE FROM verification_codes WHERE phone = ANY($1::text[])', [[phone, local]]);
  },

  /** صفّ الحساب يصير شاهداً بلا بيانات شخصية — انظر الهجرة ٠٩١. */
  async tombstone(tx: pg.PoolClient, userId: string) {
    await tx.query(
      `UPDATE users
          SET role = 'deleted',
              deleted_at = now(),
              phone = NULL,
              username = $2,
              password_hash = '!deleted',
              avatar_url = NULL,
              gender = NULL,
              birth_day = NULL,
              birth_month = NULL,
              birthday_set_at = NULL,
              preferred_language = 'ar',
              is_active = FALSE,
              token_version = token_version + 1
        WHERE id = $1`,
      [userId, DELETED_ACCOUNT_NAME],
    );
  },

  async record(
    tx: pg.PoolClient,
    input: { reference: string; userId: string; reason: string | null; retainedOrders: number },
  ) {
    const { rows } = await tx.query<{ reference: string; deleted_at: Date }>(
      `INSERT INTO account_deletions (reference, user_id, reason, retained_orders)
       VALUES ($1, $2, $3, $4)
       RETURNING reference, deleted_at`,
      [input.reference, input.userId, input.reason, input.retainedOrders],
    );
    return rows[0]!;
  },
};
