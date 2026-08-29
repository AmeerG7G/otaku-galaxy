import type pg from 'pg';
import type { CollectionDto, CollectionRow } from '../types/index.js';

type CollectionWithProducts = CollectionRow & { product_ids: string[] | null };

function shapeCollection(row: CollectionWithProducts): CollectionDto {
  return {
    id: row.id,
    name: row.name,
    productIds: row.product_ids ?? [],
  };
}

const SELECT_WITH_PRODUCTS = `
  SELECT c.*,
         COALESCE(
           (SELECT json_agg(cp.product_id ORDER BY cp.created_at DESC)
            FROM collection_products cp WHERE cp.collection_id = c.id),
           '[]'::json
         ) AS product_ids
  FROM collections c`;

export const collectionRepo = {
  async listMine(db: pg.Pool | pg.PoolClient, userId: string) {
    const { rows } = await db.query<CollectionWithProducts>(
      `${SELECT_WITH_PRODUCTS} WHERE c.user_id = $1 ORDER BY c.created_at DESC`,
      [userId],
    );
    return rows.map(shapeCollection);
  },

  /** يُستخدم للتحقّق من الملكية قبل أي تعديل. */
  async findOwned(db: pg.Pool | pg.PoolClient, userId: string, id: string) {
    const { rows } = await db.query<CollectionWithProducts>(
      `${SELECT_WITH_PRODUCTS} WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    return rows[0] ? shapeCollection(rows[0]) : null;
  },

  async create(db: pg.Pool | pg.PoolClient, userId: string, name: string) {
    const { rows } = await db.query<CollectionRow>(
      'INSERT INTO collections (user_id, name) VALUES ($1, $2) RETURNING *',
      [userId, name],
    );
    return { id: rows[0]!.id, name: rows[0]!.name, productIds: [] } satisfies CollectionDto;
  },

  async rename(db: pg.Pool | pg.PoolClient, userId: string, id: string, name: string) {
    const { rowCount } = await db.query(
      'UPDATE collections SET name = $3 WHERE id = $1 AND user_id = $2',
      [id, userId, name],
    );
    return (rowCount ?? 0) > 0;
  },

  async remove(db: pg.Pool | pg.PoolClient, userId: string, id: string) {
    const { rowCount } = await db.query(
      'DELETE FROM collections WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return (rowCount ?? 0) > 0;
  },

  async addProduct(db: pg.Pool | pg.PoolClient, collectionId: string, productId: string) {
    await db.query(
      `INSERT INTO collection_products (collection_id, product_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [collectionId, productId],
    );
  },

  async removeProduct(db: pg.Pool | pg.PoolClient, collectionId: string, productId: string) {
    await db.query(
      'DELETE FROM collection_products WHERE collection_id = $1 AND product_id = $2',
      [collectionId, productId],
    );
  },
};
