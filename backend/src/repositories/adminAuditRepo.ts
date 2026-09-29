import type pg from 'pg';

/**
 * سجلّ نشاط الإدارة (هجرة ٠٦٨) — الكاتب والقارئ الوحيدان.
 *
 * [SECURITY] كل ما يُكتب في `details` يمرّ بـ`scrubSecrets` هنا، لا في مواضع
 * النداء: موضعٌ ينسى التنقية لا يستطيع أن يكتب سرّاً لأن الكتابة كلها من هنا.
 */

/** مفاتيح لا تُكتب قيمتها ولا اسمها في السجلّ، بأي عمق. */
const SECRET_KEY = /pass(word)?|token|secret|hash|authorization|private|credential/i;

/** حدّ عمق التنقية وطول النصوص — السجلّ لقطةٌ للتدقيق لا نسخةٌ من الحمولة. */
const MAX_DEPTH = 4;
const MAX_STRING = 500;
const MAX_ARRAY = 50;

export function scrubSecrets(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return '…';
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => scrubSecrets(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = scrubSecrets(inner, depth + 1);
    }
    return out;
  }
  return null;
}

/** أسماء الحقول المرسَلة بلا قيمها — لكل فعلٍ لا يملك تسجيلاً دلالياً. */
export function fieldNames(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body as Record<string, unknown>)
    .filter((key) => !SECRET_KEY.test(key))
    .sort();
}

export interface AuditEntryInput {
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}

function mapRow(row: AuditRow): AuditEntry {
  return {
    id: String(row.id),
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export const adminAuditRepo = {
  /**
   * صفٌّ واحد. اسم الفاعل يُقرأ من صفّه لحظة الكتابة (لقطة): حذفُه لاحقاً
   * يُفرغ `actor_id` ويُبقي الاسم.
   *
   * يُمرَّر `tx` من داخل معاملة الفعل حيث يلزم أن يكون السجلّ جزءاً منه
   * (إدارة المسؤولين): فعلٌ بلا سجلّ لا يُلتزم، وسجلٌّ بلا فعل لا يُكتب.
   */
  async record(db: pg.Pool | pg.PoolClient, entry: AuditEntryInput): Promise<void> {
    await db.query(
      `INSERT INTO admin_audit_log (actor_id, actor_name, action, target_type, target_id, details)
       SELECT $1, COALESCE((SELECT username FROM users WHERE id = $1), '—'), $2, $3, $4, $5::jsonb`,
      [
        entry.actorId,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        JSON.stringify(scrubSecrets(entry.details ?? {})),
      ],
    );
  },

  async list(
    db: pg.Pool | pg.PoolClient,
    options: { page: number; limit: number; actorId?: string; action?: string },
  ): Promise<{ items: AuditEntry[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (options.actorId) {
      values.push(options.actorId);
      conditions.push(`actor_id = $${values.length}`);
    }
    if (options.action) {
      // بادئة حرفية: `%` و`_` في المُدخل نصٌّ لا أحرف بدل.
      values.push(`${options.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      conditions.push(`action LIKE $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countValues = [...values];
    values.push(options.limit, (options.page - 1) * options.limit);
    const [rows, count] = await Promise.all([
      db.query<AuditRow>(
        `SELECT id, actor_id, actor_name, action, target_type, target_id, details, created_at
           FROM admin_audit_log ${where}
          ORDER BY created_at DESC, id DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      ),
      db.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM admin_audit_log ${where}`, countValues),
    ]);
    return { items: rows.rows.map(mapRow), total: Number(count.rows[0]?.total ?? 0) };
  },
};
