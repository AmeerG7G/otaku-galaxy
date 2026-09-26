import type { RequestHandler } from 'express';
import { visualsService } from '../services/visualsService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  setSlotImageSchema,
  setSlotTemporaryImageSchema,
  slotIdParamSchema,
} from '../validators/visuals.js';

/**
 * الرسوم المُدارة — قراءة عامة وكتابة إدارية.
 *
 * الفصل بين المتحكّمين ليس تنظيماً: مسار العميل يقرأ فقط، ولا يوجد فيه أي
 * دالة كتابة يمكن الوصول إليها بتخمين مسار. الكتابة كلها خلف `adminRoutes`
 * التي تفرض المصادقة ودور المسؤول قبل أن يصل الطلب إلى هنا.
 *
 * [PRODUCT] الفتحات تُعرَّف بالهجرات لا من اللوحة: موضعٌ في التطبيق يقابله
 * صفٌّ مزروع، والمسؤول يبدّل صورته الدائمة أو يزيلها، ويضع فوقها صورةً
 * مؤقّتة إلى لحظةٍ أو ينهيها — لا أكثر (الهجرتان ٠٥٤ و٠٥٥).
 */
export const publicVisualsController = {
  /** الإعداد المنشور — نداء واحد يعيد كل الفتحات ذات الصورة. */
  list: (async (_req, res) => {
    return ok(res, await visualsService.published());
  }) as RequestHandler,
};

export const adminVisualsController = {
  list: (async (_req, res) => {
    return ok(res, await visualsService.listForAdmin());
  }) as RequestHandler,

  setImage: (async (req, res) => {
    const { id } = parse(slotIdParamSchema, req.params);
    const body = parse(setSlotImageSchema, req.body);
    return ok(res, await visualsService.setImage(id, body.url), 'استُبدلت الصورة');
  }) as RequestHandler,

  clearImage: (async (req, res) => {
    const { id } = parse(slotIdParamSchema, req.params);
    return ok(
      res,
      await visualsService.clearImage(id),
      'أُزيلت الصورة — التطبيق يعرض الرسم المضمَّن',
    );
  }) as RequestHandler,

  setTemporaryImage: (async (req, res) => {
    const { id } = parse(slotIdParamSchema, req.params);
    const body = parse(setSlotTemporaryImageSchema, req.body);
    return ok(
      res,
      await visualsService.setTemporaryImage(id, body.url, body.until),
      'وُضعت الصورة المؤقّتة — تعود الدائمة تلقائياً عند انتهائها',
    );
  }) as RequestHandler,

  clearTemporaryImage: (async (req, res) => {
    const { id } = parse(slotIdParamSchema, req.params);
    return ok(
      res,
      await visualsService.clearTemporaryImage(id),
      'أُنهيت الصورة المؤقّتة — التطبيق يعرض الدائمة',
    );
  }) as RequestHandler,
};
