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
  created_at: Date;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    role: row.role,
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
    input: { username?: string; avatarUrl?: string | null; passwordHash?: string; isActive?: boolean },
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
    if (sets.length === 0) {
      return (await this.findById(db, id))!;
    }
    const { rows } = await db.query<UserRow>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0]!;
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