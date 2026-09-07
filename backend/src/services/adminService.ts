import type pg from 'pg';
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
import {
  userRepo,
  type BirthdayFilter,
  type CustomerSort,
} from '../repositories/userRepo.js';
import { config } from '../config/index.js';
import type { NotificationType, OrderStatus } from '../types/index.js';
import type { Gender } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { orderService } from './orderService.js';
import { restockService } from './restockService.js';
import { renumberPlacement, type AssignedOrder, type PlacementRow } from '../utils/bannerOrder.js';
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

/**
 * مجموعة البنرات النشطة لموضعٍ ما، مقفولة (FOR UPDATE) كي تتسلسل تعديلات
 * الموضع المتزامنة. تُستقى بعد التحديث فيضمّ البنرُ بنفسه حتى عند تنقّله
 * من موضعه أو تفعيله للتو.
 */
async function bannerPlacementGroup(
  tx: pg.PoolClient,
  placement: string,
): Promise<PlacementRow[]> {
  const { rows } = await tx.query<{ id: string; sort_order: number; created_at: Date }>(
    `SELECT id, sort_order, created_at FROM banners
      WHERE placement = $1 AND is_active = TRUE
      ORDER BY sort_order, created_at
      FOR UPDATE`,
    [placement],
  );
  return rows.map((row) => ({
    id: row.id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }));
}

/**
 * تطبيق أوامر الترقيم على دفعة واحدة — على مرحلتين.
 *
 * جلستنا الأولى صفاً صفاً ثم دفعةٌ واحدة، كلاهما اصطدم بالفهرس الفريد
 * الجزئي (هجرة ٠٣٥): بوستغرِس يفحص الفائدة بعد كل صفٍّ داخل الجملة نفسها،
 * فتبادل ترتيبين يعني لحظةً يصطفّ فيها اثنان على نفس الترتيب. الحل مرحلتان:
 * (١) إزاحة الجميع بمقدار ثابت كبير — إزاحة متزاحة تحفظ التمييز فلا تصادم؛
 * (٢) تثبيت القيم النهائية الصغيرة على ساحة بلا عشّاقٍ سابقين.
 */
async function applyBannerOrders(tx: pg.PoolClient, assignments: AssignedOrder[]) {
  if (assignments.length === 0) return;
  const clauses = assignments
    .map((_, index) => `($${index * 2 + 1}::uuid, $${index * 2 + 2}::int)`)
    .join(', ');
  const params: unknown[] = [];
  for (const assignment of assignments) {
    params.push(assignment.id, assignment.sortOrder);
  }
  const values = `FROM (VALUES ${clauses}) AS v(id, sort_order) WHERE b.id = v.id`;
  const offsetParam = params.length + 1;
  await tx.query(
    `UPDATE banners b SET sort_order = b.sort_order + $${offsetParam} ${values}`,
    [...params, assignments.length + 1_000_000],
  );
  await tx.query(`UPDATE banners b SET sort_order = v.sort_order ${values}`, params);
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
    restockAt?: string | null;
  }) {
    return withTransaction(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO products (
           name, description, price, category_id, subcategory_id, stock,
           is_offer, is_selected, previous_price, has_delivery_promo,
           delivery_promo_amount, restock_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
          input.restockAt ?? null,
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

  /**
   * منتجات الإدارة — بما فيها الموقوفة، مع ترشيح اختياري بالقسم.
   *
   * الترشيح على الخادم لا في المتصفح: قائمة مرقَّمة تُرشَّح بعد جلبها تعرض
   * منتجات الصفحة الحالية فقط، فيبدو القسم الفرعي فارغاً وفيه عشرات
   * المنتجات على الصفحة الثانية.
   */
  async listProducts(options: {
    page: number;
    limit: number;
    categoryId?: string;
    subcategoryId?: string;
    offer?: boolean;
    selected?: boolean;
  }) {
    // `includeInactive` هو الفارق عن القائمة العامة: المسؤول يدير المنتجات
    // المعطّلة أيضاً — بما فيها المرفوعة كعروض — لا النشطة وحدها.
    const { offer, selected, ...rest } = options;
    return productRepo.list(db, {
      ...rest,
      ...(offer !== undefined ? { isOffer: offer } : {}),
      ...(selected !== undefined ? { isSelected: selected } : {}),
      includeInactive: true,
    });
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
      /** موعد التوفر القادم — معلومة إرشادية، لا يغيّر المخزون. */
      restockAt?: string | null;
    },
  ) {
    return withTransaction(async (tx) => {
      // [CRITICAL] قفل صفّ المنتج قبل قراءته.
      //
      // القرارات التالية كلها مبنيّة على المقارنة بين القديم والجديد: هل
      // عاد المخزون؟ هل تغيّر موعد التوفر؟ مسؤولان يحفظان معاً كانا يقرآن
      // القيمة القديمة نفسها ثم يكتبان، فيُرسل إشعارُ «تغيّر الموعد» مرتين
      // أو لا يُرسل إطلاقاً بحسب ترتيب الكتابة. القفل يُسلسلهما.
      await tx.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [id]);

      const existing = await productRepo.findById(tx, id);
      if (!existing) throw Errors.notFound('المنتج غير موجود');
      const previousStock = Number(existing.stock);
      const previousRestockAt = existing.restockAt;

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
        'restock_at',
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
        // التحديث لا يمسّ تاريخ الإعادة إلا إن حُدّد صراحةً — لا يحذفه أي
        // حفظٍ لاحقٍ لسعر أو مخزون.
        ...(input.restockAt !== undefined
          ? { restock_at: input.restockAt ?? null }
          : {}),
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

      // عودة المخزون من صفر إلى ما فوق: إشعارات المشتركين وفراغ اشتراكاتهم
      // داخل معاملة التحديث نفسها — إمّا كاملة أو لا شيء.
      const cameBackInStock =
        input.stock !== undefined && previousStock === 0 && Number(input.stock) > 0;

      if (cameBackInStock) {
        await restockService.notifyRestocked(tx, id, existing.name);
        // الموعد المتوقَّع تحقّق، فلا معنى لبقائه: تركُه يترك في القاعدة
        // «متوقَّع أن يتوفر يوم كذا» عن منتج متوفر الآن — بيانات تصير كاذبة
        // بمرور اليوم، وقد تُعرض ثانيةً لو نفد المخزون لاحقاً.
        await tx.query('UPDATE products SET restock_at = NULL WHERE id = $1', [id]);
      } else if (input.restockAt !== undefined) {
        // ═══ تغيّر موعد التوفر المتوقَّع ═══
        //
        // [CRITICAL] الإشعار مشروط بتغيّر **فعلي** في القيمة، لا بضغطة حفظ.
        // المسؤول الذي يفتح الصفحة ويحفظ نفس التاريخ لم يُحدث شيئاً يستحق
        // إزعاج مئة زبون به. المقارنة على اللحظة نفسها، فحفظُ اليوم ذاته
        // يُنتج القيمة ذاتها ولا يُشعر.
        //
        // ولا يقع هذا في نفس الحفظ الذي أعاد المخزون: هناك يفوز «عاد
        // للتوفر»، وهو الخبر الصحيح — لا موعدٌ متوقَّع لشيء صار متاحاً.
        const nextRestockAt = input.restockAt ?? null;
        const changed = !sameInstant(previousRestockAt, nextRestockAt);

        // إفراغ الموعد (تاريخ → لا شيء) لا يُشعر أحداً: ليس خبراً يُبلَّغ،
        // والحالة المعروضة للزبون تعود إلى «بانتظار التوفر» من تلقائها.
        if (changed && nextRestockAt !== null) {
          await restockService.notifyExpectedRestock(tx, {
            productId: id,
            productName: input.name ?? existing.name,
            restockAt: nextRestockAt,
            updated: previousRestockAt !== null,
          });
        }
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
  /** البنرات مع ترتيبها — منها يبني لوحة التحكم قائمة «الترتيب» القابلة للتعديل. */
  async listBanners() {
    return bannerRepo.listAll(db);
  },

  /** طلبات «أخبرني عند توفره» من وجهة الإدارة — المنتجات النافدة وعليها اشتراكات. */
  async restockDemand() {
    return restockService.adminDemand();
  },

  async createBanner(input: {
    imageUrl: string;
    title?: string | null;
    subtitle?: string;
    placement?: 'hero' | 'promo';
    destinationType: 'product' | 'category' | 'subcategory' | 'anime' | 'none';
    destinationValue?: string | null;
    sortOrder?: number;
  }) {
    return withTransaction(async (tx) => {
      const placement = input.placement ?? 'promo';
      // قفلُ صفّي الموضع يسلسل إدراجين متزامنين.
      await tx.query(
        'SELECT id FROM banners WHERE placement = $1 AND is_active = TRUE FOR UPDATE',
        [placement],
      );
      const group = await bannerPlacementGroup(tx, placement);
      const occupied = new Set(group.map((row) => row.sortOrder));
      const requested = input.sortOrder ?? 0;

      // إدراجٌ لا يصطدم بالفهرس الفريد الجزئي: القيمة الأقصى بالزيادة.
      const safeOrder =
        group.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
      const banner = await bannerRepo.create(tx, {
        ...input,
        placement,
        sortOrder: safeOrder,
      });

      // الإنشاء لا يزاحم أحداً: الترتيب الحر يُثبَّت كما طلبه المسؤول، والترتيب
      // المحجوز يُبقيه في مؤخرة الموضع. إعادةُ الترقيم شأنُ «النقلة» فقط
      // (تحديث البنر الموجود بترتيب جديد) — لا مصادفة خلف إنشاءٍ عابر.
      if (banner.isActive && !occupied.has(requested) && requested !== safeOrder) {
        await tx.query('UPDATE banners SET sort_order = $2 WHERE id = $1', [
          banner.id,
          requested,
        ]);
      }
      return banner;
    });
  },

  async updateBanner(id: string, input: Record<string, unknown>) {
    return withTransaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; placement: string; is_active: boolean }>(
        'SELECT id, placement, is_active FROM banners WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (rows.length === 0) throw Errors.notFound('البنر غير موجود');
      const before = rows[0]!;

      // الترتيب يُحسم بإعادة الترقيم الذرّية لا كحقل تحديثٍ قد يصطدم
      // بصفٍّ آخر على نفس الموضع وهو لا يزال واقفاً في مكانه.
      const { sortOrder, ...fields } = input as Record<string, unknown> & { sortOrder?: number };
      const banner = await bannerRepo.update(tx, id, fields as never);

      // إعادة الترقيم فقط متى تغيّر انتماءُ البنر أو ترتيبه — تعديلُ الصورة
      // وحدها يبقى كما هو تماماً، فلا يُعاد خلط ترتيب موضعٍ لا مساس به.
      const membershipChanged =
        sortOrder !== undefined ||
        before.placement !== banner?.placement ||
        !before.is_active;
      if (banner?.isActive && membershipChanged) {
        const assigned = renumberPlacement(
          await bannerPlacementGroup(tx, banner.placement),
          banner.id,
          sortOrder ?? banner.sortOrder,
        );
        await applyBannerOrders(tx, assigned);
      }
      return banner;
    });
  },

  async deleteBanner(id: string) {
    const ok = await bannerRepo.delete(db, id);
    if (!ok) throw Errors.notFound('البنر غير موجود');
    return { id };
  },

  async listGovernorates() {
    return governorateRepo.listAll(db);
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
    // المسار الإداري يقرأ الشكل الإداري: يحمل الفائض المحاسبي الذي لا
    // يخرج في استجابة العميل.
    const order = await orderRepo.findByIdForAdmin(db, orderId);
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
  /**
   * قائمة الزبائن للإدارة — البحث والترشيح يجريان في القاعدة.
   *
   * الشكل المُعاد يحمل ما تحتاجه شاشة الزبائن للقرار (النقاط، عدد الطلبات،
   * آخر طلب) لا الصفَّ الخام: `password_hash` و`token_version` لا يخرجان
   * من هذه الطبقة أبداً.
   */
  async listUsers(options: {
    page: number;
    limit: number;
    search?: string;
    isActive?: boolean;
    hasBirthday?: boolean;
    hasOrders?: boolean;
    minPoints?: number;
    maxPoints?: number;
    gender?: Gender | 'unknown';
    sort?: CustomerSort;
  }) {
    // العدّادات تُحسب على كامل المطابق للبحث لا على الصفحة المعروضة، وتُرسل
    // مع كل صفحة ليبقى تصنيف اللوحة صحيحاً مهما تنقّل المسؤول.
    const [{ items, total }, genderCounts] = await Promise.all([
      userRepo.listCustomers(db, options),
      userRepo.genderCounts(db, {
        ...(options.search !== undefined ? { search: options.search } : {}),
        ...(options.isActive !== undefined ? { isActive: options.isActive } : {}),
      }),
    ]);
    return {
      items,
      page: options.page,
      limit: options.limit,
      total,
      hasMore: options.page * options.limit < total,
      genderCounts,
    };
  },

  /**
   * العملاء حسب حالة عيد الميلاد — قسم مستقل في لوحة التحكم.
   *
   * «اليوم» و«قريباً» تُحسبان بمنطقة المتجر الزمنية لا بساعة الخادم، وإلا
   * وصلت تهنئةُ الغد قبل منتصف ليل صاحبها بثلاث ساعات.
   */
  async listBirthdayCustomers(options: {
    page: number;
    limit: number;
    filter?: BirthdayFilter;
    windowDays?: number;
  }) {
    const [{ items, total }, counts] = await Promise.all([
      userRepo.listBirthdayCustomers(db, {
        ...options,
        timezone: config.storeTimezone,
      }),
      userRepo.birthdayCounts(db, config.storeTimezone, options.windowDays ?? 7),
    ]);
    return {
      items,
      page: options.page,
      limit: options.limit,
      total,
      hasMore: options.page * options.limit < total,
      counts,
      timezone: config.storeTimezone,
    };
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

/**
 * هل يشير التاريخان إلى اللحظة نفسها؟ (`null` يساوي `null`.)
 *
 * المقارنة على اللحظة لا على النصّ: `2026-09-15T00:00:00Z` و
 * `2026-09-15T03:00:00+03:00` نصّان مختلفان للحظة واحدة، وإشعارٌ بـ«تغيّر
 * الموعد» بينهما كذبٌ على الزبون.
 */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}
