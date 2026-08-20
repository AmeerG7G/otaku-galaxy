import type { RequestHandler } from 'express';
import { orderService } from '../services/orderService.js';
import { created, ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { listOrdersSchema, orderIdParamSchema, createOrderSchema } from '../validators/orders.js';
import { paginationSchema } from '../validators/catalog.js';

export const orderController = {
  create: (async (req, res) => {
    const input = parse(createOrderSchema, req.body);
    const order = await orderService.create(req.auth!.id, input);
    return created(res, order, 'تم استلام طلبك — سنتواصل معك قريباً');
  }) as RequestHandler,

  listMine: (async (req, res) => {
    const { page, limit } = parse(paginationSchema, {
      page: req.query.page,
      limit: req.query.limit,
    });
    const statusInput = parse(listOrdersSchema, { status: req.query.status });
    const data = await orderService.listMyOrders(req.auth!.id, page, limit, statusInput.status);
    return ok(res, data);
  }) as RequestHandler,

  getMine: (async (req, res) => {
    const { id } = parse(orderIdParamSchema, req.params);
    const order = await orderService.getMyOrder(req.auth!.id, id);
    return ok(res, order);
  }) as RequestHandler,

  cancel: (async (req, res) => {
    const { id } = parse(orderIdParamSchema, req.params);
    const order = await orderService.cancelOrder(req.auth!.id, id);
    return ok(res, order, 'أُلغي الطلب');
  }) as RequestHandler,
};