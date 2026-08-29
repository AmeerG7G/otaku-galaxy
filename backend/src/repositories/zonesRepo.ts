import type pg from 'pg';
import type { GovernorateZoneRow } from '../types/index.js';

export interface ZoneDto {
  id: string;
  governorateId: string;
  name: string;
  deliveryFee: number;
  sortOrder: number;
  isActive: boolean;
}

function shapeZone(row: GovernorateZoneRow): ZoneDto {
  return {
    id: row.id,
    governorateId: row.governorate_id,
    name: row.name,
    deliveryFee: Number(row.delivery_fee),
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export const zoneRepo = {
  async listForGovernorate(db: pg.Pool | pg.PoolClient, governorateId: string, activeOnly = true) {
    const { rows } = await db.query<GovernorateZoneRow>(
      `SELECT * FROM governorate_zones
        WHERE governorate_id = $1 ${activeOnly ? 'AND is_active = TRUE' : ''}
        ORDER BY sort_order, name`,
      [governorateId],
    );
    return rows.map(shapeZone);
  },

  async listAll(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<GovernorateZoneRow>(
      'SELECT * FROM governorate_zones ORDER BY governorate_id, sort_order, name',
    );
    return rows.map(shapeZone);
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<GovernorateZoneRow>(
      'SELECT * FROM governorate_zones WHERE id = $1',
      [id],
    );
    return rows[0] ? shapeZone(rows[0]) : null;
  },

  async create(
    db: pg.Pool | pg.PoolClient,
    input: { governorateId: string; name: string; deliveryFee: number; sortOrder?: number },
  ) {
    const { rows } = await db.query<GovernorateZoneRow>(
      `INSERT INTO governorate_zones (governorate_id, name, delivery_fee, sort_order)
       VALUES ($1, $2, $3, COALESCE($4, 0))
       RETURNING *`,
      [input.governorateId, input.name, input.deliveryFee, input.sortOrder ?? null],
    );
    return shapeZone(rows[0]!);
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { name?: string; deliveryFee?: number; sortOrder?: number; isActive?: boolean },
  ) {
    const sets: string[] = [];
    const values: unknown[] = [id];
    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (input.name !== undefined) push('name', input.name);
    if (input.deliveryFee !== undefined) push('delivery_fee', input.deliveryFee);
    if (input.sortOrder !== undefined) push('sort_order', input.sortOrder);
    if (input.isActive !== undefined) push('is_active', input.isActive);
    if (sets.length === 0) return this.findById(db, id);

    const { rows } = await db.query<GovernorateZoneRow>(
      `UPDATE governorate_zones SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return rows[0] ? shapeZone(rows[0]) : null;
  },

  async remove(db: pg.Pool | pg.PoolClient, id: string) {
    const { rowCount } = await db.query('DELETE FROM governorate_zones WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
