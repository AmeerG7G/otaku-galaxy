import type pg from 'pg';
import type { FranchiseRow } from '../types/index.js';

export interface FranchiseDto {
  id: string;
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

type FranchiseWithCount = FranchiseRow & { product_count: string };

function shapeFranchise(row: FranchiseWithCount): FranchiseDto {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    productCount: Number(row.product_count ?? 0),
  };
}

/** العدّ يقتصر على المنتجات النشطة — وهو ما يراه العميل فعلياً. */
const SELECT_WITH_COUNT = `
  SELECT f.*,
         (SELECT COUNT(*)::text FROM product_franchises pf
           JOIN products p ON p.id = pf.product_id AND p.is_active = TRUE
          WHERE pf.franchise_id = f.id) AS product_count
  FROM franchises f`;

export const franchiseRepo = {
  /** الامتيازات النشطة فقط (واجهة العميل). */
  async listPublic(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<FranchiseWithCount>(
      `${SELECT_WITH_COUNT} WHERE f.is_active = TRUE ORDER BY f.sort_order, f.name`,
    );
    return rows.map(shapeFranchise);
  },

  /** كل الامتيازات بما فيها الموقوفة (لوحة التحكم). */
  async listAll(db: pg.Pool | pg.PoolClient) {
    const { rows } = await db.query<FranchiseWithCount>(
      `${SELECT_WITH_COUNT} ORDER BY f.sort_order, f.name`,
    );
    return rows.map(shapeFranchise);
  },

  async findById(db: pg.Pool | pg.PoolClient, id: string) {
    const { rows } = await db.query<FranchiseWithCount>(
      `${SELECT_WITH_COUNT} WHERE f.id = $1`,
      [id],
    );
    return rows[0] ? shapeFranchise(rows[0]) : null;
  },

  async create(
    db: pg.Pool | pg.PoolClient,
    input: { name: string; imageUrl?: string | null; sortOrder?: number },
  ) {
    const { rows } = await db.query<FranchiseRow>(
      `INSERT INTO franchises (name, image_url, sort_order)
       VALUES ($1, $2, COALESCE($3, 0))
       RETURNING *`,
      [input.name, input.imageUrl ?? null, input.sortOrder ?? null],
    );
    return { ...shapeFranchise({ ...rows[0]!, product_count: '0' }) };
  },

  async update(
    db: pg.Pool | pg.PoolClient,
    id: string,
    input: { name?: string; imageUrl?: string | null; sortOrder?: number; isActive?: boolean },
  ) {
    const sets: string[] = [];
    const values: unknown[] = [id];
    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (input.name !== undefined) push('name', input.name);
    if (input.imageUrl !== undefined) push('image_url', input.imageUrl);
    if (input.sortOrder !== undefined) push('sort_order', input.sortOrder);
    if (input.isActive !== undefined) push('is_active', input.isActive);
    if (sets.length === 0) return this.findById(db, id);

    const { rows } = await db.query<FranchiseRow>(
      `UPDATE franchises SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    if (!rows[0]) return null;
    return this.findById(db, id);
  },

  async remove(db: pg.Pool | pg.PoolClient, id: string) {
    const { rowCount } = await db.query('DELETE FROM franchises WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },

  /** يستبدل ارتباطات المنتج بالامتيازات دفعة واحدة. */
  async setProductFranchises(
    db: pg.Pool | pg.PoolClient,
    productId: string,
    franchiseIds: string[],
  ) {
    await db.query('DELETE FROM product_franchises WHERE product_id = $1', [productId]);
    if (franchiseIds.length === 0) return;
    await db.query(
      `INSERT INTO product_franchises (product_id, franchise_id)
       SELECT $1, UNNEST($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [productId, franchiseIds],
    );
  },

  async franchiseIdsForProduct(db: pg.Pool | pg.PoolClient, productId: string) {
    const { rows } = await db.query<{ franchise_id: string }>(
      'SELECT franchise_id FROM product_franchises WHERE product_id = $1',
      [productId],
    );
    return rows.map((row) => row.franchise_id);
  },
};
