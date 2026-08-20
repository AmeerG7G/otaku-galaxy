import type { RequestHandler } from 'express';
import { adminService } from '../services/adminService.js';
import { created, ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { paginationSchema } from '../validators/catalog.js';
import { adminOrderIdParamSchema, updateOrderStatusSchema } from '../validators/orders.js';
import {
  adminBannerIdSchema,
  adminBannerSchema,
  adminCategoryIdSchema,
  adminCategorySchema,
  adminGovernorateIdSchema,
  adminGovernorateSchema,
  adminProductCreateSchema,
  adminProductIdSchema,
  adminProductUpdateSchema,
  adminSubcategorySchema,
  adminUserIdSchema,
} from '../validators/admin.js';

export const adminController = {
  // ===== المنتجات =====
  createProduct: (async (req, res) => {
    const input = parse(adminProductCreateSchema, req.body);
    const product = await adminService.createProduct(input);
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
    const product = await adminService.updateProduct(id, input);
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
    const input = parse(adminBannerSchema.partial(), req.body);
    const banner = await adminService.updateBanner(id, input);
    return ok(res, banner, 'حُدّث البنر');
  }) as RequestHandler,

  deleteBanner: (async (req, res) => {
    const id = parse(adminBannerIdSchema, req.params).id;
    const data = await adminService.deleteBanner(id);
    return ok(res, data, 'حُذف البنر');
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
    const status = parse(updateOrderStatusSchema.partial().pick({ status: true }), {
      status: req.query.status,
    }).status;
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

  // ===== المستخدمون =====
  listUsers: (async (req, res) => {
    const { page, limit } = parse(paginationSchema, { page: req.query.page, limit: req.query.limit });
    const data = await adminService.listUsers(page, limit);
    return ok(res, data);
  }) as RequestHandler,

  toggleUserActive: (async (req, res) => {
    const { id } = parse(adminUserIdSchema, req.params);
    const data = await adminService.toggleUserActive(id);
    return ok(res, data, 'حُدّثت حالة المستخدم');
  }) as RequestHandler,
};