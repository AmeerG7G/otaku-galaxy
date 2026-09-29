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
import type { ProductNames } from '../utils/locale.js';
import { orderService } from './orderService.js';
import { restockService } from './restockService.js';
import { renumberPlacement, type AssignedOrder, type PlacementRow } from '../utils/bannerOrder.js';
import { franchiseRepo } from '../repositories/franchisesRepo.js';
import bcrypt from 'bcryptjs';
import {
  accountRequestRepo,
  type AccountRequestKind,
  type AccountRequestRow,
  type AccountRequestStatus,
} from '../repositories/accountRequestRepo.js';
import { placeOnLadder } from '../domain/galaxyPoints.js';

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

/**
 * القسم الفرعي للمنتج يجب أن يتبع قسمَ المنتج نفسه.
 *
 * [CRITICAL] لا قيدٌ في القاعدة يربط `products.subcategory_id` بـ
 * `products.category_id` (المفتاحان الأجنبيان مستقلّان)، فكان الإنشاء
 * والتعديل يقبلان منتجاً قسمُه «ملابس» وقسمُه الفرعي من «حقائب» ويحفظانه —
 * فيظهر تحت شريحة قسمٍ ليس قسمه، ولا تراه لوحةُ التحكم لأن نموذجها يحصر
 * الاختيار في فرعيّات القسم المختار. الفحص هنا عند الحدّ، وبالقيم
 * **الفعلية** بعد التعديل: نقلُ القسم وحده مع فرعيٍّ قديم لا يتبعه تناقضٌ
 * كذلك ويُرفض، فينقل المسؤول الاثنين معاً أو يفرّغ الفرعي صراحةً.
 */
async function assertSubcategoryBelongs(
  tx: pg.PoolClient,
  categoryId: string,
  subcategoryId: string | null,
): Promise<void> {
  if (subcategoryId === null) return;
  const subcategory = await subcategoryRepo.findById(tx, subcategoryId);
  if (!subcategory || subcategory.categoryId !== categoryId) {
    throw Errors.badRequest('القسم الفرعي لا يتبع هذا القسم', 'SUBCATEGORY_MISMATCH');
  }
}

export const adminService = {
  // ===== المنتجات =====
  async createProduct(input: {
    /** المحتوى بلغتين (066) — الأربعة إلزامية ومقصوصة في المدقّق. */
    nameAr: string;
    descriptionAr: string;
    nameCkb: string;
    descriptionCkb: string;
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
      await assertSubcategoryBelongs(tx, input.categoryId, input.subcategoryId ?? null);
      const { rows } = await tx.query(
        `INSERT INTO products (
           name, description, price, category_id, subcategory_id, stock,
           is_offer, is_selected, previous_price, has_delivery_promo,
           delivery_promo_amount, restock_at, name_ckb, description_ckb
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          // `name`/`description` هما العمودان العربيان (046، موثَّقان في 066).
          input.nameAr,
          input.descriptionAr,
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
          input.nameCkb,
          input.descriptionCkb,
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
    q?: string;
    categoryId?: string;
    subcategoryId?: string;
    offer?: boolean;
    selected?: boolean;
    missingKurdish?: boolean;
  }) {
    // `includeInactive` هو الفارق عن القائمة العامة: المسؤول يدير المنتجات
    // المعطّلة أيضاً — بما فيها المرفوعة كعروض — لا النشطة وحدها.
    const { offer, selected, q, missingKurdish, ...rest } = options;
    return productRepo.list(db, {
      ...rest,
      ...(q !== undefined ? { query: q } : {}),
      ...(offer !== undefined ? { isOffer: offer } : {}),
      ...(selected !== undefined ? { isSelected: selected } : {}),
      ...(missingKurdish === true ? { missingKurdish: true } : {}),
      includeInactive: true,
    });
  },

  async updateProduct(
    id: string,
    input: {
      /**
       * كل حقلٍ لغويٍّ مستقل (066): الغائب لا يُمسّ. تعديل العربية يكتب
       * عمودَي العربية وحدهما، والكردية عمودَيها وحدهما — لا نسخ بين لغتين.
       */
      nameAr?: string;
      descriptionAr?: string;
      nameCkb?: string;
      descriptionCkb?: string;
      price?: number;
      categoryId?: string;
      subcategoryId?: string | null;
      stock?: number;
      isActive?: boolean;
      isOffer?: boolean;
      isSelected?: boolean;
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

      await assertSubcategoryBelongs(
        tx,
        input.categoryId ?? existing.categoryId,
        input.subcategoryId === undefined ? existing.subcategoryId : input.subcategoryId,
      );

      const fields = [
        'name',
        'description',
        'name_ckb',
        'description_ckb',
        'price',
        'category_id',
        'subcategory_id',
        'stock',
        'is_active',
        'is_offer',
        'is_selected',
        'previous_price',
        'has_delivery_promo',
        'delivery_promo_amount',
        'restock_at',
      ] as const;
      const map: Record<string, unknown> = {
        name: input.nameAr,
        description: input.descriptionAr,
        name_ckb: input.nameCkb,
        description_ckb: input.descriptionCkb,
        price: input.price,
        category_id: input.categoryId,
        subcategory_id: input.subcategoryId,
        stock: input.stock,
        is_active: input.isActive,
        is_offer: input.isOffer,
        is_selected: input.isSelected,
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

      // اسم المنتج بلغتيه **بعد** هذا الحفظ — الإشعار يصل كل مشترك بلغته
      // (`restockService`)، والاسم الذي عدّله المسؤول للتوّ هو الصحيح.
      const names: ProductNames = {
        ar: input.nameAr ?? existing.nameAr,
        ckb: input.nameCkb ?? existing.nameCkb,
      };

      // عودة المخزون من صفر إلى ما فوق: إشعارات المشتركين وفراغ اشتراكاتهم
      // داخل معاملة التحديث نفسها — إمّا كاملة أو لا شيء.
      const cameBackInStock =
        input.stock !== undefined && previousStock === 0 && Number(input.stock) > 0;

      if (cameBackInStock) {
        // إشعارات المشتركين وفراغ اشتراكاتهم ومسح الموعد المتوقَّع — التعريف
        // نفسه الذي يستعمله رفضُ طلبٍ مقبول حين يُرجع القطعة.
        await restockService.stockReturned(tx, id, names);
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
            productNames: names,
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
    /** نصّ البنر بلغتيه (067) — كلٌّ اختياري ومستقل، `null` = لا نصّ. */
    titleAr?: string | null;
    subtitleAr?: string | null;
    titleCkb?: string | null;
    subtitleCkb?: string | null;
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
    // مسار موحّد عبر orderService: تحقق الانتقال + استهلاك المخزون عند القبول
    // (وإرجاعه عند رفض ما قُبل) في معاملة واحدة.
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
    // [SECURITY] زبائن فقط: صفّ مسؤولٍ ليس «عميلاً» يُقرأ من هنا — وإلا قرأ
    // مسؤولٌ فرعي بصلاحية الزبائن اسمَ المسؤول الأعلى ورقمه بمعرّفه.
    if (!user || user.role !== 'customer') throw Errors.notFound('العميل غير موجود');

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

  /**
   * حظر/تفعيل حساب إلى الحالة **المقصودة** — تكرارُه آمن.
   *
   * [CRITICAL] `isActive` هو ما رآه المسؤول وقرّره في النافذة. الحالة نفسها
   * لا تغيّر شيئاً: «حظر» ثانٍ من لوحةٍ قديمة العرض، أو إعادةُ الضغط بعد
   * مهلة، يبقى حظراً ولا يرفع نسخة التوكن ثانيةً (جلسات الموقوف سقطت أصلاً)،
   * و«تفعيل» مكرَّر لا يُسقط الجلسة التي فتحها الزبون بين الضغطتين. غيابه
   * (نسخة لوحة أقدم) يقلب الحالة كما كان.
   */
  async setUserActive(userId: string, isActive?: boolean) {
    const user = await userRepo.findById(db, userId);
    // [SECURITY] إيقاف **الزبائن** وحدهم. كان المسار يقبل أي معرّف، فيوقف
    // مسؤولٌ فرعي بصلاحية الزبائن المسؤولَ الأعلى ويُسقط جلساته. إيقاف
    // المسؤولين مسارُه `PATCH /admin/admins/:id` للمسؤول الأعلى وحده.
    if (!user || user.role !== 'customer') throw Errors.notFound('المستخدم غير موجود');
    const nextActive = isActive ?? !user.is_active;
    if (nextActive === user.is_active) return { id: user.id, isActive: user.is_active };
    const updated = await userRepo.update(db, userId, {
      isActive: nextActive,
      bumpTokenVersion: !nextActive,
    });
    return { id: updated.id, isActive: updated.is_active };
  },

  // ═══════════════════════════════════════════════════════════════════
  // طلبات الحساب — إنشاءٌ وإعادةُ تعيين، تُحسم يدوياً بعد تحقّق واتساب.
  //
  // [CRITICAL] لا مسار هنا يقبل رمزاً أو بياناتِ تعريفٍ ليحسم آلياً. الحسم
  // فعلُ مسؤولٍ مصادَق (`requireAdmin` على المسار) يرى الطلب بجانب الحساب
  // المخزَّن ويقرّر بنفسه. معرّف الطلب وحده لا يُخوِّل شيئاً: كل فعلٍ يعيد
  // التحقّق من أن الطلب معلَّق ومن نوعه ومن ارتباطه بالحساب المستهدف.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * الطلب ومعه لقطة الحساب المرتبط **لمقارنة** المسؤول — لا كلمة مرور ولا
   * تجزئة ولا نسخة توكن، ولا شيء يقول «مطابق ⇒ موافق».
   */
  async shapeAccountRequest(row: AccountRequestRow) {
    return (await this.shapeAccountRequests([row]))[0]!;
  },

  /**
   * صفحة طلبات دفعةً واحدة: الحسابات المرتبطة بجملة والأرصدة بجملة.
   *
   * كان كل صفٍّ يقرأ حسابه ثم رصيده (٢×N جملة لصفحة واحدة، تتزاحم كلها
   * على المجمّع معاً عبر `Promise.all`).
   */
  async shapeAccountRequests(rows: AccountRequestRow[]) {
    const userIds = [...new Set(rows.flatMap((row) => (row.user_id ? [row.user_id] : [])))];
    const users = await userRepo.findByIds(db, userIds);
    const balances = await pointsRepo.balances(db, [...users.keys()]);
    return rows.map((row) => {
      const user = row.user_id ? (users.get(row.user_id) ?? null) : null;
      const balance = user ? (balances.get(user.id) ?? 0) : null;
      return shapeAccountRequestRow(row, user, balance);
    });
  },

  async listAccountRequests(options: {
    page: number;
    limit: number;
    kind?: AccountRequestKind;
    status?: AccountRequestStatus;
    search?: string;
  }) {
    const [{ items, total }, pending] = await Promise.all([
      accountRequestRepo.list(db, options),
      accountRequestRepo.pendingCounts(db),
    ]);
    return {
      items: await this.shapeAccountRequests(items),
      page: options.page,
      limit: options.limit,
      total,
      hasMore: options.page * options.limit < total,
      pending,
    };
  },

  async getAccountRequest(id: string) {
    const row = await accountRequestRepo.findById(db, id);
    if (!row) throw Errors.notFound('الطلب غير موجود');
    return this.shapeAccountRequest(row);
  },

  /**
   * الموافقة على طلب **تسجيل**: يفعّل الحساب المعلَّق.
   *
   * طلب إعادة التعيين لا يُوافَق عليه من هنا عمداً: «موافقة» بلا كلمة مرور
   * جديدة لا معنى لها، والحسم الوحيد له هو `setCustomerPassword` مع معرّفه.
   * فلا يوجد مسار يضع طلب إعادة تعيين في حالة «موافَق» دون أن تُوضع كلمة.
   */
  async approveAccountRequest(id: string, adminId: string, note?: string | null) {
    const row = await accountRequestRepo.findById(db, id);
    if (!row) throw Errors.notFound('الطلب غير موجود');
    if (row.status !== 'pending') throw Errors.conflict('الطلب محسوم مسبقاً', 'REQUEST_RESOLVED');
    if (row.kind !== 'registration') {
      throw Errors.badRequest('طلب إعادة التعيين يُحسم بوضع كلمة مرور جديدة لا بالموافقة', 'USE_SET_PASSWORD');
    }
    if (!row.user_id) throw Errors.conflict('لا حساب مرتبط بهذا الطلب', 'NO_LINKED_ACCOUNT');
    const user = await userRepo.findById(db, row.user_id);
    if (!user) throw Errors.conflict('الحساب المرتبط لم يعد موجوداً', 'NO_LINKED_ACCOUNT');

    return withTransaction(async (tx) => {
      const resolved = await accountRequestRepo.resolve(tx, id, { status: 'approved', resolvedBy: adminId, note });
      if (!resolved) throw Errors.conflict('الطلب محسوم مسبقاً', 'REQUEST_RESOLVED');
      // التفعيل: الحساب يصير قابلاً للدخول هنا فقط — لا عند إنشائه.
      if (user.phone_verified_at === null) {
        await userRepo.update(tx, user.id, { phoneVerifiedAt: new Date() });
      }
      return this.shapeAccountRequest(resolved);
    });
  },

  /** الرفض يبقي الطلب في السجل بحالته وملاحظة المسؤول — لا حذف. */
  async rejectAccountRequest(id: string, adminId: string, note?: string | null) {
    const row = await accountRequestRepo.findById(db, id);
    if (!row) throw Errors.notFound('الطلب غير موجود');
    if (row.status !== 'pending') throw Errors.conflict('الطلب محسوم مسبقاً', 'REQUEST_RESOLVED');
    const resolved = await accountRequestRepo.resolve(db, id, { status: 'rejected', resolvedBy: adminId, note });
    if (!resolved) throw Errors.conflict('الطلب محسوم مسبقاً', 'REQUEST_RESOLVED');
    return this.shapeAccountRequest(resolved);
  },

  /**
   * المسؤول يضع كلمة مرور **جديدة دائمة** لزبون تحقّق منه عبر واتساب.
   *
   * ═══ القرار ═══ هذه كلمةُ المرور الفعلية للحساب، لا مؤقّتة ولا تنتهي ولا
   * تفرض تغييراً بعد الدخول. الزبون يستعملها كما هي إلى أن يغيّرها بنفسه من
   * الإعدادات إن شاء. لا حالة خاصة تُخزَّن ولا حقل يُضاف.
   *
   * [CRITICAL]
   * - الهدف زبونٌ فقط: لا يُغيَّر بها حساب مسؤول.
   * - كلمة المرور تُجزَّأ هنا ولا تُعاد ولا تُسجَّل — الردّ لا يحمل إلا معرّف
   *   الحساب وحالة الطلب.
   * - نسخة التوكن تُرفع: من استعاد حسابه بعد اختراقه يجب ألا يبقى للمخترق
   *   توكنٌ صالح.
   * - `requestId` اختياري: إن وُجد يجب أن يكون **معلَّقاً**، من نوع
   *   `password_reset`، ومرتبطاً **بهذا** الحساب — وإلّا رُفض. معرّف طلبٍ
   *   وحده لا يُخوِّل تغيير كلمة مرور حسابٍ آخر.
   */
  async setCustomerPassword(
    customerId: string,
    adminId: string,
    input: { newPassword: string; requestId?: string | null; note?: string | null },
    options: { requireRequest?: boolean } = {},
  ) {
    const user = await userRepo.findById(db, customerId);
    if (!user || user.role !== 'customer') throw Errors.notFound('الزبون غير موجود');
    // [SECURITY] مسؤولٌ بصلاحية «طلبات الحساب» دون «الزبائن» يحسم طلب إعادة
    // تعيينٍ قائماً فقط — لا يضع كلمة مرورٍ لأي زبونٍ بلا طلب.
    if (options.requireRequest && !input.requestId) {
      throw Errors.forbidden('لا تملك صلاحية هذا القسم', 'ADMIN_PERMISSION_DENIED');
    }

    let request: AccountRequestRow | null = null;
    if (input.requestId) {
      request = await accountRequestRepo.findById(db, input.requestId);
      if (!request || request.kind !== 'password_reset') throw Errors.notFound('الطلب غير موجود');
      if (request.status !== 'pending') throw Errors.conflict('الطلب محسوم مسبقاً', 'REQUEST_RESOLVED');
      if (request.user_id !== user.id) {
        throw Errors.badRequest('الطلب لا يخصّ هذا الحساب', 'REQUEST_ACCOUNT_MISMATCH');
      }
    }

    const passwordHash = await bcrypt.hash(input.newPassword, config.bcryptRounds);
    return withTransaction(async (tx) => {
      await userRepo.update(tx, user.id, { passwordHash, bumpTokenVersion: true });
      let resolved: AccountRequestRow | null = null;
      if (request) {
        resolved = await accountRequestRepo.resolve(tx, request.id, {
          status: 'approved',
          resolvedBy: adminId,
          note: input.note ?? null,
        });
        if (!resolved) throw Errors.conflict('الطلب محسوم مسبقاً', 'REQUEST_RESOLVED');
      }
      return {
        customerId: user.id,
        request: resolved ? { id: resolved.id, status: resolved.status } : null,
      };
    });
  },

  /**
   * ملفّ الزبون الكامل من مكانٍ واحد: هوية، نقاط ومستوى، طلبات الشراء،
   * وتاريخ طلبات الحساب. لا تجزئة ولا توكن ولا نسخة توكن — أبداً.
   */
  async getCustomerDetail(customerId: string) {
    const user = await userRepo.findById(db, customerId);
    if (!user || user.role !== 'customer') throw Errors.notFound('الزبون غير موجود');
    const [balance, orders, requests] = await Promise.all([
      pointsRepo.balance(db, user.id),
      orderRepo.listByUser(db, user.id, 1, 20),
      accountRequestRepo.listForUser(db, user.id),
    ]);
    const placement = placeOnLadder(balance);
    return {
      profile: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        gender: user.gender,
        avatarUrl: user.avatar_url,
        isActive: user.is_active,
        isVerified: user.phone_verified_at !== null,
        verifiedAt: user.phone_verified_at?.toISOString() ?? null,
        preferredLanguage: user.preferred_language,
        createdAt: user.created_at.toISOString(),
      },
      points: {
        balance,
        levelKey: placement.current.key,
        levelNumber: placement.current.number,
        levelName: placement.current.nameMale,
        nextLevelKey: placement.next?.key ?? null,
        pointsToNextLevel: placement.pointsToNext,
      },
      orders: {
        items: orders.items,
        total: orders.total,
      },
      requests: await this.shapeAccountRequests(requests),
    };
  },
};

/** الطلب ومعه لقطة الحساب المرتبط — تحويلٌ خالص بعد أن قُرئ الحساب والرصيد. */
function shapeAccountRequestRow(
  row: AccountRequestRow,
  user: Awaited<ReturnType<typeof userRepo.findById>>,
  balance: number | null,
) {
  const level = balance === null ? null : placeOnLadder(balance).current;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    submitted: {
      phone: row.submitted_phone,
      username: row.submitted_username,
      gender: row.submitted_gender,
      levelKey: row.submitted_level_key,
    },
    account: user
      ? {
          id: user.id,
          username: user.username,
          phone: user.phone,
          gender: user.gender,
          isActive: user.is_active,
          isVerified: user.phone_verified_at !== null,
          levelKey: level?.key ?? null,
          levelNumber: level?.number ?? null,
          points: balance,
          createdAt: user.created_at.toISOString(),
        }
      : null,
    // إشاراتٌ للعين لا قرار: المسؤول يقارن بنفسه ويسأل عبر واتساب.
    match: user
      ? {
          username: user.username.trim().toLowerCase() === row.submitted_username.trim().toLowerCase(),
          gender: user.gender !== null && user.gender === row.submitted_gender,
          level: level !== null && row.submitted_level_key !== null && level.key === row.submitted_level_key,
        }
      : null,
    adminNote: row.admin_note,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

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
