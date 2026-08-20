import type pg from 'pg';
import type { BannerRow, GovernorateRow } from '../types/index.js';

export const bannerRepo = {
  async listActive(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<BannerRow>(
      `SELECT * FROM banners WHERE is_active = TRUE ORDER BY sort_order, created_at DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      title: row.title,
      destinationType: row.destination_type,
      destinationValue: row.destination_value,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }));
  },

  async listAll(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<BannerRow>(
      'SELECT * FROM banners ORDER BY sort_order, created_at DESC',
    );
    return rows.map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      title: row.title,
      destinationType: row.destination_type,
      destinationValue: row.destination_value,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }));
  },

  async create(
    db: pg.Pool | pg.PoolClient,
    input: {
      imageUrl: string;
      title?: string | null;
      destinationType: BannerRow['destination_type'];
      destinationValue?: string | null;
      sortOrder?: number;
    },
  ) {
    const { rows } = await db.query<BannerRow>(
      `INSERT INTO banners (image_url, title, destination_type, destination_value, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.imageUrl, input.title ?? null, input.destinationType, input.destinationValue ?? null, input.sortOrder ?? 0],
    );
    return rows[0]!;
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: {
      imageUrl?: string;
      title?: string | null;
      destinationType?: BannerRow['destination_type'];
      destinationValue?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<BannerRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (input.imageUrl !== undefined) {
      values.push(input.imageUrl);
      sets.push(`image_url = $${values.length}`);
    }
    if (input.title !== undefined) {
      values.push(input.title);
      sets.push(`title = $${values.length}`);
    }
    if (input.destinationType !== undefined) {
      values.push(input.destinationType);
      sets.push(`destination_type = $${values.length}`);
    }
    if (input.destinationValue !== undefined) {
      values.push(input.destinationValue);
      sets.push(`destination_value = $${values.length}`);
    }
    if (input.sortOrder !== undefined) {
      values.push(input.sortOrder);
      sets.push(`sort_order = $${values.length}`);
    }
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      sets.push(`is_active = $${values.length}`);
    }
    if (sets.length === 0) {
      const { rows } = await db.query<BannerRow>('SELECT * FROM banners WHERE id = $1', [id]);
      return rows[0] ?? null;
    }
    const { rows } = await db.query<BannerRow>(
      `UPDATE banners SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },

  async delete(db: pg.Pool | pg.PoolClient, id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM banners WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

export const governorateRepo = {
  async listActive(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<GovernorateRow>(
      `SELECT * FROM governorates WHERE is_active = TRUE ORDER BY sort_order, name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      deliveryFee: Number(row.delivery_fee),
      isActive: row.is_active,
    }));
  },

  async create(db: pg.Pool | pg.PoolClient, input: { name: string; deliveryFee: number }) {
    const { rows } = await db.query<GovernorateRow>(
      'INSERT INTO governorates (name, delivery_fee) VALUES ($1, $2) RETURNING *',
      [input.name, input.deliveryFee],
    );
    return rows[0]!;
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { name?: string; deliveryFee?: number; isActive?: boolean },
  ): Promise<GovernorateRow | null> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (input.name !== undefined) {
      values.push(input.name);
      sets.push(`name = $${values.length}`);
    }
    if (input.deliveryFee !== undefined) {
      values.push(input.deliveryFee);
      sets.push(`delivery_fee = $${values.length}`);
    }
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      sets.push(`is_active = $${values.length}`);
    }
    if (sets.length === 0) {
      const { rows } = await db.query<GovernorateRow>('SELECT * FROM governorates WHERE id = $1', [id]);
      return rows[0] ?? null;
    }
    const { rows } = await db.query<GovernorateRow>(
      `UPDATE governorates SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0] ?? null;
  },
};