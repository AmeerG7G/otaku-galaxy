import type { RequestHandler } from 'express';
import { adminService } from '../services/adminService.js';
import { orderService } from '../services/orderService.js';
import { created, ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { paginationSchema } from '../validators/catalog.js';
import {
  adminOrderIdParamSchema,
  listOrdersSchema,
  rescheduleReminderSchema,
  updateOrderStatusSchema,
} from '../validators/orders.js';
import { Errors } from '../utils/errors.js';
import {
  adminBannerIdSchema,
  adminBannerSchema,
  adminBannerUpdateSchema,
  adminCategoryIdSchema,
  adminCategorySchema,
  adminCustomerIdSchema,
  adminNotificationQuerySchema,
  adminSubcategoryIdSchema,
  adminSubcategoryUpdateSchema,
  adminGovernorateIdSchema,
  adminGovernorateSchema,
  adminProductCreateSchema,
  adminProductIdSchema,
  adminProductUpdateSchema,
  adminSubcategorySchema,
  adminUserIdSchema,
} from '../validators/admin.js';

/**
 * قيود قاعدة البيانات على المنتج يجب أن تصل للمسؤول كرسالة واضحة لا كـ500.
 * أبرزها: السعر قبل الخصم يجب أن يكون أعلى من السعر الحالي — وهو ما يمنع
 * إظهار شارة خصم بلا خصم حقيقي.
 */
async function withProductConstraints<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
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
}

export const adminController = {
  // ===== المنتجات =====
  createProduct: (async (req, res) => {
    const input = parse(adminProductCreateSchema, req.body);
    const product = await withProductConstraints(() =>
      adminService.createProduct(input),
    );
    return created(res, product, 'أُنشئ المنتج');
  }) as RequestHandler,

  listProducts: (async (req, res) => {
    const { page, limit } = parse(paginationSchema, { page: req.query.page, limit: req.query.limit });
    const data = await adminService.listProducts(page, limit);
    return ok(res, data);
  }) as RequestHandler,

  updateProduct: (async (req, res) => {
    const id = parse(adminProductIdSchema, req.params).id;
    const input = parse(adminProductUpdateSchema, req.body);
    const product = await withProductConstraints(() =>
      adminService.updateProduct(id, input),
    );
    return ok(res, product, 'حُدّث المنتج');
  }) as RequestHandler,

  deleteProduct: (async (req, res) => {
    const id = parse(adminProductIdSchema, req.params).id;
    const data = await adminService.softDeleteProduct(id);
    return ok(res, data, 'أُخفي المنتج');
  }) as RequestHandler,

  // ===== الأقسام =====
  createCategory: (async (req, res) => {
    const input = parse(adminCategorySchema, req.body);
    const category = await adminService.createCategory(input);
    return created(res, category, 'أُنشئ القسم');
  }) as RequestHandler,

  updateCategory: (async (req, res) => {
    const id = parse(adminCategoryIdSchema, req.params).id;
    const input = parse(adminCategorySchema.partial(), req.body);
    const category = await adminService.updateCategory(id, input);
    return ok(res, category, 'حُدّث القسم');
  }) as RequestHandler,

  listCategories: (async (_req, res) => {
    const data = await adminService.listCategoriesAdmin();
    return ok(res, { items: data });
  }) as RequestHandler,

  createSubcategory: (async (req, res) => {
    const input = parse(adminSubcategorySchema, req.body);
    const subcategory = await adminService.createSubcategory(input);
    return created(res, subcategory, 'أُنشئ القسم الفرعي');
  }) as RequestHandler,

  // ===== البانرات =====
  listBanners: (async (_req, res) => {
    const data = await adminService.listBanners();
    return ok(res, { items: data });
  }) as RequestHandler,

  createBanner: (async (req, res) => {
    const input = parse(adminBannerSchema, req.body);
    const banner = await adminService.createBanner(input);
    return created(res, banner, 'أُنشئ البنر');
  }) as RequestHandler,

  updateBanner: (async (req, res) => {
    const id = parse(adminBannerIdSchema, req.params).id;
    const input = parse(adminBannerUpdateSchema, req.body);
    const banner = await adminService.updateBanner(id, input);
    return ok(res, banner, 'حُدّث البنر');
  }) as RequestHandler,

  deleteBanner: (async (req, res) => {
    const id = parse(adminBannerIdSchema, req.params).id;
    const data = await adminService.deleteBanner(id);
    return ok(res, data, 'حُذف البنر');
  }) as RequestHandler,

  deleteCategory: (async (req, res) => {
    const id = parse(adminCategoryIdSchema, req.params).id;
    return ok(res, await adminService.deleteCategory(id), 'حُذف القسم');
  }) as RequestHandler,

  updateSubcategory: (async (req, res) => {
    const id = parse(adminSubcategoryIdSchema, req.params).id;
    const input = parse(adminSubcategoryUpdateSchema, req.body);
    return ok(res, await adminService.updateSubcategory(id, input), 'حُدّث القسم الفرعي');
  }) as RequestHandler,

  deleteSubcategory: (async (req, res) => {
    const id = parse(adminSubcategoryIdSchema, req.params).id;
    return ok(res, await adminService.deleteSubcategory(id), 'حُذف القسم الفرعي');
  }) as RequestHandler,

  // ===== المحافظات =====
  listGovernorates: (async (_req, res) => {
    const data = await adminService.listGovernorates();
    return ok(res, { items: data });
  }) as RequestHandler,

  createGovernorate: (async (req, res) => {
    const input = parse(adminGovernorateSchema, req.body);
    const governorate = await adminService.createGovernorate(input);
    return created(res, governorate, 'أُنشئت المحافظة');
  }) as RequestHandler,

  updateGovernorate: (async (req, res) => {
    const id = parse(adminGovernorateIdSchema, req.params).id;
    const input = parse(adminGovernorateSchema.partial(), req.body);
    const governorate = await adminService.updateGovernorate(id, input);
    return ok(res, governorate, 'حُدّثت المحافظة');
  }) as RequestHandler,

  // ===== الطلبات =====
  listOrders: (async (req, res) => {
    const { page, limit } = parse(paginationSchema, { page: req.query.page, limit: req.query.limit });
    // `listOrdersSchema` هو نفسه الذي يستخدمه مسار العميل — فلترة الحالة
    // معرَّفة مرة واحدة. البديل السابق كان
    // `updateOrderStatusSchema.partial()`، و`updateOrderStatusSchema` يحمل
    // ‎.refine()‎ (سبب الرفض إلزامي)، و‎Zod‎ يرفض ‎.partial()‎ على كائن فيه
    // تنقيح — فكان كل نداء لهذا المسار يرمي ويعود 500.
    const { status } = parse(listOrdersSchema, { status: req.query.status });
    const data = await adminService.listOrders(status, page, limit);
    return ok(res, data);
  }) as RequestHandler,

  getOrder: (async (req, res) => {
    const { id } = parse(adminOrderIdParamSchema, req.params);
    const order = await adminService.getOrder(id);
    return ok(res, order);
  }) as RequestHandler,

  updateOrderStatus: (async (req, res) => {
    const { id } = parse(adminOrderIdParamSchema, req.params);
    const input = parse(updateOrderStatusSchema, req.body);
    const order = await adminService.updateOrderStatus(req.auth!.id, id, input.status, input.note);
    return ok(res, order, 'حُدّثت حالة الطلب');
  }) as RequestHandler,

  /** إعادة جدولة تذكير الاستلام لطلب واحد. */
  rescheduleReminder: (async (req, res) => {
    const { id } = parse(adminOrderIdParamSchema, req.params);
    const input = parse(rescheduleReminderSchema, req.body);
    const order = await orderService.rescheduleReminder(id, input);
    return ok(res, order, 'حُدّث موعد التذكير');
  }) as RequestHandler,

  /** إرسال تذكير الاستلام فوراً. */
  sendReminderNow: (async (req, res) => {
    const { id } = parse(adminOrderIdParamSchema, req.params);
    const order = await orderService.sendReminderNow(id);
    return ok(res, order, 'أُرسل الإشعار');
  }) as RequestHandler,

  // ===== المستخدمون =====
  listUsers: (async (req, res) => {
    const { page, limit } = parse(paginationSchema, { page: req.query.page, limit: req.query.limit });
    const data = await adminService.listUsers(page, limit);
    return ok(res, data);
  }) as RequestHandler,

  deleteGovernorate: (async (req, res) => {
    const id = parse(adminGovernorateIdSchema, req.params).id;
    return ok(res, await adminService.deleteGovernorate(id), 'حُذفت المحافظة');
  }) as RequestHandler,

  // ===== نقاط المجرّة (قراءة فقط) =====

  customerPoints: (async (req, res) => {
    const id = parse(adminCustomerIdSchema, req.params).id;
    return ok(res, await adminService.customerPoints(id));
  }) as RequestHandler,

  pointsSummary: (async (_req, res) => {
    return ok(res, await adminService.pointsSummary());
  }) as RequestHandler,

  // ===== الإشعارات (قراءة فقط) =====

  listNotifications: (async (req, res) => {
    const query = parse(adminNotificationQuerySchema, req.query);
    return ok(res, await adminService.listNotifications(query));
  }) as RequestHandler,

  notificationStats: (async (_req, res) => {
    return ok(res, await adminService.notificationStats());
  }) as RequestHandler,

  listBirthdayCustomers: (async (req, res) => {
    const { page, limit } = parse(paginationSchema, {
      page: req.query.page,
      limit: req.query.limit,
    });
    // `filter=pending` يعرض المؤهَّلين الذين لم يسجّلوا بعد؛ الافتراضي
    // يبقى المسجَّلين وحدهم حتى لا يتغيّر ما تعرضه اللوحة الحالية بلا طلب.
    const raw = String(req.query.filter ?? 'registered');
    const filter = raw === 'all' || raw === 'pending' ? raw : 'registered';
    const data = await adminService.listBirthdayCustomers(page, limit, filter);
    return ok(res, data);
  }) as RequestHandler,

  toggleUserActive: (async (req, res) => {
    const { id } = parse(adminUserIdSchema, req.params);
    const data = await adminService.toggleUserActive(id);
    return ok(res, data, 'حُدّثت حالة المستخدم');
  }) as RequestHandler,
};