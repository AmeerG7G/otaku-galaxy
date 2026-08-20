import { db } from '../database/pool.js';
import { categoryRepo, productRepo } from '../repositories/catalogRepo.js';
import { bannerRepo, governorateRepo } from '../repositories/storefrontRepo.js';
import { Errors } from '../utils/errors.js';

export const catalogService = {
  /** بيانات الصفحة الرئيسية: بانرات، عروض، مختارات، أقسام، اكتشاف عشوائي. */
  async getHome() {
    const [banners, offers, selected, categories, all] = await Promise.all([
      bannerRepo.listActive(db),
      productRepo.list(db, { page: 1, limit: 8, isOffer: true }),
      productRepo.list(db, { page: 1, limit: 8, isSelected: true }),
      categoryRepo.list(db),
      productRepo.list(db, { page: 1, limit: 24 }),
    ]);

    // اكتشاف: قائمة عشوائية مستقرة لكل صفحة (ترتيب md5 ثابت للمعرّف).
    const seed = 'home';
    const { rows } = await db.query(
      `SELECT p.*,
              COALESCE(
                (SELECT json_agg(pi.url ORDER BY pi.sort_order)
                 FROM product_images pi WHERE pi.product_id = p.id),
                '[]'::json
              ) AS images
       FROM products p
       WHERE p.is_active = TRUE
       ORDER BY md5(p.id::text || $1) LIMIT $2`,
      [seed, 10],
    );
    const discover = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      stock: row.stock,
      images: (row.images as string[]) ?? [],
      categoryId: row.category_id,
      subcategoryId: row.subcategory_id,
      isOffer: row.is_offer,
      isSelected: row.is_selected,
      rating: row.rating === null ? null : Number(row.rating),
      reviewCount: row.review_count,
    }));

    return {
      banners,
      offers: offers.items,
      selectedProducts: selected.items,
      categories,
      discover,
    };
  },

  async listCategories() {
    return categoryRepo.list(db);
  },

  async listProducts(options: {
    page: number;
    limit: number;
    categoryId?: string;
    subcategoryId?: string;
    isOffer?: boolean;
    isSelected?: boolean;
  }) {
    return productRepo.list(db, options);
  },

  async search(query: string, page: number, limit: number) {
    return productRepo.search(db, query, page, limit);
  },

  async productDetail(id: string) {
    const { rows } = await db.query(
      `SELECT p.*,
              COALESCE(
                (SELECT json_agg(pi.url ORDER BY pi.sort_order)
                 FROM product_images pi WHERE pi.product_id = p.id),
                '[]'::json
              ) AS images,
              COALESCE(
                (SELECT json_agg(json_build_object('id', po.id, 'name', po.name, 'values', po.values))
                 FROM product_options po WHERE po.product_id = p.id),
                '[]'::json
              ) AS options
       FROM products p
       WHERE p.id = $1 AND p.is_active = TRUE`,
      [id],
    );
    const row = rows[0];
    if (!row) throw Errors.notFound('المنتج غير موجود');
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      stock: row.stock,
      images: (row.images as string[]) ?? [],
      options: (row.options as { id: string; name: string; values: string[] }[]) ?? [],
      categoryId: row.category_id,
      subcategoryId: row.subcategory_id,
      rating: row.rating === null ? null : Number(row.rating),
      reviewCount: row.review_count,
      isOffer: row.is_offer,
      isSelected: row.is_selected,
    };
  },

  async listGovernorates() {
    return governorateRepo.listActive(db);
  },
};