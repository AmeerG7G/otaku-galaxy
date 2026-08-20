import { db, withTransaction } from '../database/pool.js';
import {
  categoryRepo,
  productRepo,
  subcategoryRepo,
} from '../repositories/catalogRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { bannerRepo, governorateRepo } from '../repositories/storefrontRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { orderService } from './orderService.js';

/** إدارة المتجر للمشرف (لوحة تحكم React مستقبلية). */
export const adminService = {
  // ===== المنتجات =====
  async createProduct(input: {
    name: string;
    description: string;
    price: number;
    categoryId: string;
    subcategoryId?: string | null;
    stock: number;
    images: string[];
    options: { name: string; values: string[] }[];
    isOffer?: boolean;
    isSelected?: boolean;
  }) {
    return withTransaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_offer, is_selected)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          input.name,
          input.description,
          input.price,
          input.categoryId,
          input.subcategoryId ?? null,
          input.stock,
          input.isOffer ?? false,
          input.isSelected ?? false,
        ],
      );
      const product = rows[0]!;
      for (const [index, url] of input.images.entries()) {
        await tx.query(
          'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3)',
          [product.id, url, index],
        );
      }
      for (const option of input.options) {
        await tx.query(
          'INSERT INTO product_options (product_id, name, values) VALUES ($1, $2, $3)',
          [product.id, option.name, option.values],
        );
      }
      return (await productRepo.findById(tx, product.id))!;
    });
  },

  async listProducts(page: number, limit: number) {
    return productRepo.list(db, { page, limit, includeInactive: true });
  },

  async updateProduct(
    id: string,
    input: {
      name?: string;
      description?: string;
      price?: number;
      categoryId?: string;
      subcategoryId?: string | null;
      stock?: number;
      isActive?: boolean;
      isOffer?: boolean;
      isSelected?: boolean;
      rating?: number | null;
      reviewCount?: number;
      images?: string[];
      options?: { name: string; values: string[] }[];
    },
  ) {
    return withTransaction(async (tx) => {
      const existing = await productRepo.findById(tx, id);
      if (!existing) throw Errors.notFound('المنتج غير موجود');

      const fields = [
        'name',
        'description',
        'price',
        'category_id',
        'subcategory_id',
        'stock',
        'is_active',
        'is_offer',
        'is_selected',
        'rating',
        'review_count',
      ] as const;
      const map: Record<string, unknown> = {
        name: input.name,
        description: input.description,
        price: input.price,
        category_id: input.categoryId,
        subcategory_id: input.subcategoryId,
        stock: input.stock,
        is_active: input.isActive,
        is_offer: input.isOffer,
        is_selected: input.isSelected,
        rating: input.rating,
        review_count: input.reviewCount,
      };
      const sets: string[] = [];
      const values: unknown[] = [id];
      for (const field of fields) {
        if (map[field] !== undefined) {
          values.push(map[field]);
          sets.push(`${field} = $${values.length}`);
        }
      }
      if (sets.length > 0) {
        await tx.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $1`, values);
      }

      if (input.images !== undefined) {
        await tx.query('DELETE FROM product_images WHERE product_id = $1', [id]);
        for (const [index, url] of input.images.entries()) {
          await tx.query(
            'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3)',
            [id, url, index],
          );
        }
      }
      if (input.options !== undefined) {
        await tx.query('DELETE FROM product_options WHERE product_id = $1', [id]);
        for (const option of input.options) {
          await tx.query(
            'INSERT INTO product_options (product_id, name, values) VALUES ($1, $2, $3)',
            [id, option.name, option.values],
          );
        }
      }
      return (await productRepo.findById(tx, id))!;
    });
  },

  /** حذف ناعم: اختفاء من الواجهة مع بقاء السجل في قاعدة البيانات. */
  async softDeleteProduct(id: string) {
    const result = await db.query('UPDATE products SET is_active = FALSE WHERE id = $1', [id]);
    if ((result.rowCount ?? 0) === 0) throw Errors.notFound('المنتج غير موجود');
    return { id, isActive: false };
  },

  // ===== الأقسام =====
  async createCategory(input: { name: string; imageUrl?: string | null; sortOrder?: number }) {
    return categoryRepo.create(db, input);
  },

  async updateCategory(id: string, input: { name?: string; imageUrl?: string | null; isActive?: boolean; sortOrder?: number }) {
    const updated = await categoryRepo.update(db, id, input);
    if (!updated) throw Errors.notFound('القسم غير موجود');
    return updated;
  },

  async listCategoriesAdmin() {
    return categoryRepo.list(db, true);
  },

  async createSubcategory(input: { categoryId: string; name: string; sortOrder?: number }) {
    const category = await categoryRepo.update(db, input.categoryId, {});
    if (!category) throw Errors.notFound('القسم غير موجود');
    return subcategoryRepo.create(db, input);
  },

  // ===== البانرات والمحافظات =====
  async listBanners() {
    return bannerRepo.listAll(db);
  },

  async createBanner(input: {
    imageUrl: string;
    title?: string | null;
    destinationType: 'product' | 'category' | 'subcategory' | 'none';
    destinationValue?: string | null;
    sortOrder?: number;
  }) {
    return bannerRepo.create(db, input);
  },

  async updateBanner(id: string, input: Record<string, unknown>) {
    return bannerRepo.update(db, id, input as never);
  },

  async deleteBanner(id: string) {
    const ok = await bannerRepo.delete(db, id);
    if (!ok) throw Errors.notFound('البنر غير موجود');
    return { id };
  },

  async listGovernorates() {
    return governorateRepo.listActive(db);
  },

  async createGovernorate(input: { name: string; deliveryFee: number }) {
    return governorateRepo.create(db, input);
  },

  async updateGovernorate(id: string, input: { name?: string; deliveryFee?: number; isActive?: boolean }) {
    const updated = await governorateRepo.update(db, id, input);
    if (!updated) throw Errors.notFound('المحافظة غير موجودة');
    return updated;
  },

  // ===== الطلبات =====
  async listOrders(status: OrderStatus | undefined, page: number, limit: number) {
    return orderService.adminList(page, limit, status);
  },

  async getOrder(orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    return order;
  },

  async updateOrderStatus(adminId: string, orderId: string, status: OrderStatus, note?: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status) && order.status !== status) {
      throw Errors.conflict(`غير مسموح بالانتقال من ${order.status} إلى ${status}`);
    }
    await orderRepo.updateStatus(db, order.id, status, note ?? null, adminId);
    return (await orderRepo.findById(db, order.id))!;
  },

  // ===== المستخدمون =====
  async listUsers(page: number, limit: number) {
    const { items, total } = await userRepo.listCustomers(db, page, limit);
    return {
      items: items.map((u) => ({
        id: u.id,
        username: u.username,
        phone: u.phone,
        avatarUrl: u.avatar_url,
        isActive: u.is_active,
        createdAt: u.created_at,
      })),
      page,
      limit,
      total,
    };
  },

  async toggleUserActive(userId: string) {
    const user = await userRepo.findById(db, userId);
    if (!user) throw Errors.notFound('المستخدم غير موجود');
    const updated = await userRepo.update(db, userId, { isActive: !user.is_active });
    return { id: updated.id, isActive: updated.is_active };
  },
};