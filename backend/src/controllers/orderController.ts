import type { RequestHandler } from 'express';
import { orderService } from '../services/orderService.js';
import { resolveLocale } from '../utils/locale.js';
import { Errors } from '../utils/errors.js';
import { created, ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  checkoutQuoteSchema,
  createOrderSchema,
  listOrdersSchema,
  orderIdParamSchema,
} from '../validators/orders.js';
import { paginationSchema } from '../validators/catalog.js';

/**
 * صيغة مفتاح عدم التكرار — القيد نفسه في القاعدة (هجرة 071): UUID أو ١٦ بايتاً
 * عشوائية بترميز base64url تكفي، ولا شيء يُخزَّن من نصٍّ حرّ.
 */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

export const orderController = {
  create: (async (req, res) => {
    const input = parse(createOrderSchema, req.body);
    // الترويسة اختيارية: غيابها = السلوك القائم. حضورها بصيغةٍ غير صالحة
    // رفضٌ صريح لا تجاهل — عميلٌ يظنّ أنه محميّ من التكرار يجب أن يعرف أنه ليس.
    const idempotencyKey = req.get('Idempotency-Key');
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw Errors.badRequest('مفتاح الطلب غير صالح', 'INVALID_IDEMPOTENCY_KEY');
    }
    const { order, replayed } = await orderService.create(
      req.auth!.id,
      input,
      resolveLocale(req),
      idempotencyKey ?? null,
    );
    // الإعادة تردّ الطلب الملتزَم بالشكل نفسه (201) — التطبيق يعرضه نجاحاً كما
    // في المحاولة الأولى. الترويسة تقول لمن يهمّه إنها إعادة لا طلبٌ جديد.
    if (replayed) res.setHeader('Idempotency-Replayed', 'true');
    return created(res, order, 'تم استلام طلبك — سنتواصل معك قريباً');
  }) as RequestHandler,

  /** ملخّص الدفع بأرقام الخادم — الخصومات (ومنها مزيّة المستوى) قبل التأكيد. */
  checkoutQuote: (async (req, res) => {
    const input = parse(checkoutQuoteSchema, {
      governorateId: req.query.governorateId,
      zoneId: req.query.zoneId,
    });
    const quote = await orderService.checkoutQuote(req.auth!.id, input);
    return ok(res, quote);
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

  /** الطلب المنتظر تأكيد استلامه (أو null). */
  pendingConfirmation: (async (req, res) => {
    const order = await orderService.pendingConfirmation(req.auth!.id);
    return ok(res, order);
  }) as RequestHandler,

  getMine: (async (req, res) => {
    const { id } = parse(orderIdParamSchema, req.params);
    const order = await orderService.getMyOrder(req.auth!.id, id);
    return ok(res, order);
  }) as RequestHandler,

  /** تأكيد العميل استلام طلبه — ينقله إلى COMPLETED عبر مسار الحالة الموحّد. */
  confirmReceipt: (async (req, res) => {
    const { id } = parse(orderIdParamSchema, req.params);
    const order = await orderService.confirmReceipt(req.auth!.id, id);
    return ok(res, order, 'تم تأكيد استلام الطلب');
  }) as RequestHandler,
};