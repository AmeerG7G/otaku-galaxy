import { db, withTransaction } from '../database/pool.js';
import {
  categoryRepo,
  productRepo,
  subcategoryRepo,
} from '../repositories/catalogRepo.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { orderRepo } from '../repositories/orderRepo.js';
import { pointsRepo } from '../repositories/pointsRepo.js';
import { bannerRepo, governorateRepo } from '../repositories/storefrontRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import type { NotificationType, OrderStatus } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { orderService } from './orderService.js';
import { franchiseRepo } from '../repositories/franchisesRepo.js';

/** إدارة المتجر للمشرف (لوحة تحكم React مستقبلية). */
/**
 * قيود قاعدة البيانات على المنتج (السعر السابق أعلى من الحالي مثلاً) يجب
 * أن تصل للمسؤول كرسالة واضحة لا كـ500 مجهول.
 */
function mapProductConstraintError(error: unknown): never {
  const code = (error as { code?: string }).code;
  const constraint = (error as { constraint?: string }).constraint;
  if (code === '23514' && constraint === 'products_previous_price_higher') {
    throw Errors.badRequest(
      'السعر قبل الخصم يجب أن يكون أعلى من السعر الحالي',
      'INVALID_PREVIOUS_PRICE',
    );
  }
  if (code === '23514') {
    throw Errors.badRequest('قيمة غير صالحة لأحد حقول المنتج', 'INVALID_PRODUCT_FIELD');
  }
  if (code === '23503') {
    throw Errors.badRequest('قسم أو أنمي غير موجود', 'RELATED_NOT_FOUND');
  }
  throw error;
}

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
    previousPrice?: number | null;
    hasDeliveryPromo?: boolean;
    deliveryPromoAmount?: number;
    franchiseIds?: string[];
  }) {
    return withTransaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO products (
           name, description, price, category_id, subcategory_id, stock,
           is_offer, is_selected, previous_price, has_delivery_promo,
           delivery_promo_amount
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
          input.previousPrice ?? null,
          input.hasDeliveryPromo ?? false,
          // القيد في القاعدة يرفض «مفعَّل بمبلغ صفر»، فنُصفّر المبلغ متى
          // كان الترويج مطفأً بدل تمرير قيمة متناقضة.
          input.hasDeliveryPromo ? (input.deliveryPromoAmount ?? 0) : 0,
        ],
      );
      const product = rows[0]!;
      if (input.franchiseIds !== undefined) {
        await franchiseRepo.setProductFranchises(tx, product.id, input.franchiseIds);
      }
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
      previousPrice?: number | null;
      hasDeliveryPromo?: boolean;
      deliveryPromoAmount?: number;
      franchiseIds?: string[];
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
        'previous_price',
        'has_delivery_promo',
        'delivery_promo_amount',
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
        previous_price: input.previousPrice,
        has_delivery_promo: input.hasDeliveryPromo,
        delivery_promo_amount: input.hasDeliveryPromo === false
          ? 0
          : input.deliveryPromoAmount,
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

      if (input.franchiseIds !== undefined) {
        await franchiseRepo.setProductFranchises(tx, id, input.franchiseIds);
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

  /**
   * حذف قسم — مرفوض ما دام شيء يعتمد عليه.
   *
   * [CRITICAL] لا حذف متتالٍ. المنتج المحذوف يختفي من طلبات مغلقة ومن سلات
   * العملاء، والقسم الفرعي المحذوف يترك منتجاته بلا تصنيف. الرفض بـ409
   * برسالة تقول ما الذي يمنع، فيقرّر المسؤول: ينقل المنتجات أو يُعطّل القسم
   * (`isActive = false`) بدل حذفه.
   */
  async deleteCategory(id: string) {
    const dependents = await categoryRepo.countDependents(db, id);
    if (dependents.products > 0 || dependents.subcategories > 0) {
      const parts: string[] = [];
      if (dependents.products > 0) parts.push(`${dependents.products} منتجاً`);
      if (dependents.subcategories > 0) parts.push(`${dependents.subcategories} قسماً فرعياً`);
      throw Errors.conflict(
        `لا يمكن حذف القسم لأنه يحتوي ${parts.join(' و')}. انقلها أو عطّل القسم بدل حذفه.`,
        'CATEGORY_HAS_DEPENDENTS',
      );
    }
    const ok = await categoryRepo.delete(db, id);
    if (!ok) throw Errors.notFound('القسم غير موجود');
    return { id };
  },

  async updateSubcategory(
    id: string,
    input: { name?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const updated = await subcategoryRepo.update(db, id, input);
    if (!updated) throw Errors.notFound('القسم الفرعي غير موجود');
    return updated;
  },

  /** حذف قسم فرعي — مرفوض ما دامت منتجات مرتبطة به. */
  async deleteSubcategory(id: string) {
    const dependents = await subcategoryRepo.countDependents(db, id);
    if (dependents.products > 0) {
      throw Errors.conflict(
        `لا يمكن حذف القسم الفرعي لأن ${dependents.products} منتجاً مرتبط به. انقلها أو عطّله بدل حذفه.`,
        'SUBCATEGORY_HAS_DEPENDENTS',
      );
    }
    const ok = await subcategoryRepo.delete(db, id);
    if (!ok) throw Errors.notFound('القسم الفرعي غير موجود');
    return { id };
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

  /**
   * حذف محافظة — مرفوض ما دامت طلبات تشير إليها.
   *
   * [CRITICAL] الطلب سجلٌّ محاسبي مغلق؛ حذف محافظته يمزّق تاريخاً لا
   * يُستعاد. القيد في القاعدة `ON DELETE RESTRICT` يمنع ذلك أصلاً، لكن
   * الفحص هنا يحوّل خطأ قاعدة غامضاً إلى رسالة يفهمها المسؤول.
   */
  async deleteGovernorate(id: string) {
    const dependents = await governorateRepo.countDependents(db, id);
    if (dependents.orders > 0 || dependents.zones > 0) {
      const parts: string[] = [];
      if (dependents.orders > 0) parts.push(`${dependents.orders} طلباً`);
      if (dependents.zones > 0) parts.push(`${dependents.zones} منطقة توصيل`);
      throw Errors.conflict(
        `لا يمكن حذف المحافظة لأن ${parts.join(' و')} مرتبط بها. عطّلها بدل حذفها.`,
        'GOVERNORATE_HAS_DEPENDENTS',
      );
    }
    const ok = await governorateRepo.delete(db, id);
    if (!ok) throw Errors.notFound('المحافظة غير موجودة');
    return { id };
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
    // مسار موحّد عبر orderService: تحقق الانتقال + استرجاع المخزون عند الرفض في معاملة واحدة.
    const updated = await orderService.adminUpdateStatus(adminId, orderId, {
      status,
      note,
    });
    return updated!;
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

  /** العملاء الذين سجّلوا تاريخ ميلادهم — قسم مستقل في لوحة التحكم. */
  async listBirthdayCustomers(
    page: number,
    limit: number,
    filter: 'all' | 'registered' | 'pending' = 'registered',
  ) {
    const { items, total } = await userRepo.listBirthdayCustomers(db, page, limit, filter);
    return { items, page, limit, total, hasMore: page * limit < total };
  },

  /**
   * إيقاف/تفعيل حساب.
   *
   * الإيقاف يزيد `token_version` أيضاً، فتسقط كل التوكنات المُصدَرة قبله
   * فوراً. بدون ذلك كان «الإيقاف» يمنع تسجيل دخول جديد فقط بينما يواصل
   * الموقوف استعمال توكنه القائم على كل المسارات المحمية حتى تنتهي مدته.
   */
  /**
   * نقاط عميل واحد كما تراها الإدارة.
   *
   * تكشف ما يلزم لتفسير الرصيد ولا شيء غيره: الاسم والهاتف (وهما ما تعرضه
   * إدارة الزبائن أصلاً)، والرصيد، وحركات الدفتر بأسبابها. لا عناوين، ولا
   * محتويات طلبات، ولا أي حقل من ملف العميل خارج ما يفسّر النقاط.
   *
   * قراءة فقط: لا تعديل يدوي للنقاط لأن المنظومة لا تملك مساراً آمناً له —
   * كل حركة في الدفتر مشتقّة من حدث حقيقي (استلام طلب، اعتماد تقييم)
   * ومحميّة بفهرس فريد يمنع التكرار. منحٌ يدوي بلا حدث يكسر ذلك الضمان.
   */
  async customerPoints(userId: string) {
    const user = await userRepo.findById(db, userId);
    if (!user) throw Errors.notFound('العميل غير موجود');

    const [balance, ledger] = await Promise.all([
      pointsRepo.balance(db, userId),
      pointsRepo.listLedgerForAdmin(db, userId),
    ]);

    return {
      customer: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        isActive: user.is_active,
        createdAt: user.created_at,
      },
      balance,
      ledger,
    };
  },

  /** أرقام النقاط المجمَّعة — كلها مشتقّة من الدفتر نفسه. */
  async pointsSummary(topLimit = 20) {
    const [totals, byReason, top] = await Promise.all([
      pointsRepo.summary(db),
      pointsRepo.byReason(db),
      pointsRepo.topBalances(db, topLimit),
    ]);
    return { ...totals, byReason, topBalances: top };
  },

  /** الإشعارات كما تقرأها الإدارة — قراءة فقط، بترشيح وترقيم. */
  async listNotifications(options: {
    page: number;
    limit: number;
    type?: NotificationType;
    userId?: string;
    read?: boolean;
  }) {
    return notificationRepo.listForAdmin(db, options);
  },

  async notificationStats() {
    return notificationRepo.statsForAdmin(db);
  },

  async toggleUserActive(userId: string) {
    const user = await userRepo.findById(db, userId);
    if (!user) throw Errors.notFound('المستخدم غير موجود');
    const nextActive = !user.is_active;
    const updated = await userRepo.update(db, userId, {
      isActive: nextActive,
      bumpTokenVersion: !nextActive,
    });
    return { id: updated.id, isActive: updated.is_active };
  },
};