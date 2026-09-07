import type { RequestHandler } from 'express';
import { visualsService } from '../services/visualsService.js';
import { created, noContent, ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  addSlotImageSchema,
  createSlotSchema,
  reorderSlotImagesSchema,
  slotIdParamSchema,
  slotImageParamSchema,
  updateSlotImageSchema,
  updateSlotSchema,
} from '../validators/visuals.js';

/**
 * الرسوم المُدارة — قراءة عامة وكتابة إدارية.
 *
 * الفصل بين المتحكّمين ليس تنظيماً: مسار العميل يقرأ فقط، ولا يوجد فيه أي
 * دالة كتابة يمكن الوصول إليها بتخمين مسار. الكتابة كلها خلف `adminRoutes`
 * التي تفرض المصادقة ودور المسؤول قبل أن يصل الطلب إلى هنا.
 */
export const publicVisualsController = {
  /**
   * الإعداد المنشور — نداء واحد يعيد كل الفتحات.
   *
   * الخادم يختار الصورة ويعيدها جاهزة: التطبيق يحمل رابطاً واحداً لا خوارزمية
   * اختيار، فلا يمكن أن تتبدّل الشخصية مع إعادة بناء عنصر واجهة.
   */
  list: (async (_req, res) => {
    return ok(res, await visualsService.published());
  }) as RequestHandler,
};

export const adminVisualsController = {
  list: (async (_req, res) => {
    return ok(res, await visualsService.listForAdmin());
  }) as RequestHandler,

  createSlot: (async (req, res) => {
    const body = parse(createSlotSchema, req.body);
    return created(res, await visualsService.createSlot(body), 'أُضيفت الفتحة');
  }) as RequestHandler,

  updateSlot: (async (req, res) => {
    const { id } = parse(slotIdParamSchema, req.params);
    const body = parse(updateSlotSchema, req.body);
    return ok(res, await visualsService.updateSlot(id, body), 'تم التحديث');
  }) as RequestHandler,

  deleteSlot: (async (req, res) => {
    const { id } = parse(slotIdParamSchema, req.params);
    await visualsService.deleteSlot(id);
    return noContent(res);
  }) as RequestHandler,

  addImage: (async (req, res) => {
    const { id } = parse(slotIdParamSchema, req.params);
    const body = parse(addSlotImageSchema, req.body);
    return created(
      res,
      await visualsService.addImage(id, body.url, body.mode),
      body.mode === 'replace' ? 'استُبدلت الصورة' : 'أُضيفت الصورة',
    );
  }) as RequestHandler,

  updateImage: (async (req, res) => {
    const { id, imageId } = parse(slotImageParamSchema, req.params);
    const body = parse(updateSlotImageSchema, req.body);
    return ok(res, await visualsService.updateImage(id, imageId, body), 'تم التحديث');
  }) as RequestHandler,

  deleteImage: (async (req, res) => {
    const { id, imageId } = parse(slotImageParamSchema, req.params);
    return ok(res, await visualsService.removeImage(id, imageId), 'حُذفت الصورة');
  }) as RequestHandler,

  reorderImages: (async (req, res) => {
    const { id } = parse(slotIdParamSchema, req.params);
    const body = parse(reorderSlotImagesSchema, req.body);
    return ok(res, await visualsService.reorderImages(id, body.imageIds), 'حُفظ الترتيب');
  }) as RequestHandler,
};
