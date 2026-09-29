import type pg from 'pg';
import { normalizePermissions, type AdminSection } from '../domain/adminPermissions.js';

/**
 * صفوف المسؤولين الفرعيين — كل استعلامٍ هنا مقيَّد بـ
 * `role = 'admin' AND NOT is_super_admin`.
 *
 * [SECURITY] القيد في SQL نفسه لا في الـservice: معرّفٌ لزبون أو للمسؤول
 * الأعلى لا يطابق صفاً فيعود `null` (٤٠٤)، فلا مسار من هنا يلمس غير
 * مسؤولٍ فرعي مهما أُرسل من معرّف.
 */
export interface SubAdminRow {
  id: string;
  username: string;
  phone: string;
  is_active: boolean;
  admin_permissions: string[];
  admin_created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SubAdmin {
  id: string;
  username: string;
  phone: string;
  isActive: boolean;
  permissions: AdminSection[];
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  lastActivityAt: string | null;
}

export function toSubAdmin(
  row: SubAdminRow & { created_by_name?: string | null; last_activity_at?: Date | null },
): SubAdmin {
  return {
    id: row.id,
    username: row.username,
    phone: row.phone,
    isActive: row.is_active,
    permissions: normalizePermissions(row.admin_permissions),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdByName: row.created_by_name ?? null,
    lastActivityAt: row.last_activity_at ? row.last_activity_at.toISOString() : null,
  };
}

const COLUMNS = `u.id, u.username, u.phone, u.is_active, u.admin_permissions, u.admin_created_by,
                 u.created_at, u.updated_at`;

export const adminAccountsRepo = {
  async list(db: pg.Pool | pg.PoolClient): Promise<SubAdmin[]> {
    const { rows } = await db.query<
      SubAdminRow & { created_by_name: string | null; last_activity_at: Date | null }
    >(
      `SELECT ${COLUMNS},
              c.username AS created_by_name,
              (SELECT MAX(a.created_at) FROM admin_audit_log a WHERE a.actor_id = u.id) AS last_activity_at
         FROM users u
         LEFT JOIN users c ON c.id = u.admin_created_by
        WHERE u.role = 'admin' AND NOT u.is_super_admin
        ORDER BY u.created_at DESC, u.id DESC`,
    );
    return rows.map(toSubAdmin);
  },

  /** صفّ المسؤول الفرعي مقفولاً للتعديل داخل معاملة — أو `null`. */
  async lockSubAdmin(tx: pg.PoolClient, id: string): Promise<SubAdminRow | null> {
    const { rows } = await tx.query<SubAdminRow>(
      `SELECT ${COLUMNS} FROM users u WHERE u.id = $1 AND u.role = 'admin' AND NOT u.is_super_admin
        FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  },

  async create(
    tx: pg.PoolClient,
    input: {
      username: string;
      phone: string;
      passwordHash: string;
      permissions: AdminSection[];
      createdBy: string;
    },
  ): Promise<SubAdminRow> {
    // `phone_verified_at = now()`: المسؤول الأعلى أنشأه بنفسه، فالرقم لا يحتاج
    // طلب حساب — والدخول يرفض أي صفٍّ بلا تحقّق.
    const { rows } = await tx.query<SubAdminRow>(
      `INSERT INTO users (username, phone, password_hash, role, phone_verified_at,
                          is_super_admin, admin_permissions, admin_created_by)
       VALUES ($1, $2, $3, 'admin', now(), FALSE, $4::text[], $5)
       RETURNING id, username, phone, is_active, admin_permissions, admin_created_by,
                 created_at, updated_at`,
      [input.username, input.phone, input.passwordHash, input.permissions, input.createdBy],
    );
    return rows[0]!;
  },

  async update(
    tx: pg.PoolClient,
    id: string,
    input: {
      username?: string;
      phone?: string;
      permissions?: AdminSection[];
      isActive?: boolean;
      passwordHash?: string;
      bumpTokenVersion?: boolean;
    },
  ): Promise<SubAdminRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    const set = (column: string, value: unknown, cast = '') => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };
    if (input.username !== undefined) set('username', input.username);
    if (input.phone !== undefined) set('phone', input.phone);
    if (input.permissions !== undefined) set('admin_permissions', input.permissions, '::text[]');
    if (input.isActive !== undefined) set('is_active', input.isActive);
    if (input.passwordHash !== undefined) set('password_hash', input.passwordHash);
    if (input.bumpTokenVersion) sets.push('token_version = token_version + 1');
    if (sets.length === 0) return null;
    const { rows } = await tx.query<SubAdminRow>(
      `UPDATE users SET ${sets.join(', ')}
        WHERE id = $1 AND role = 'admin' AND NOT is_super_admin
        RETURNING id, username, phone, is_active, admin_permissions, admin_created_by,
                  created_at, updated_at`,
      values,
    );
    return rows[0] ?? null;
  },

  async remove(tx: pg.PoolClient, id: string): Promise<boolean> {
    const { rowCount } = await tx.query(
      `DELETE FROM users WHERE id = $1 AND role = 'admin' AND NOT is_super_admin`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  },
};
