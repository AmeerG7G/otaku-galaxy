import type { RequestHandler } from 'express';
import { db } from '../database/pool.js';
import { trackingService } from '../services/trackingService.js';
import { noContent } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import { notificationIdParamSchema, shareSignalSchema } from '../validators/tracking.js';

/**
 * إشارات التطبيق (D3) — تجميعيّة، ومطفأة افتراضياً. الردّ ٢٠٤ دائماً (مُشغَّل أو
 * مطفأ، سُجِّلت أم لا): لا يكشف الردّ حالة التتبّع ولا وجود إشعار غيرك.
 */
export const trackingController = {
  share: (async (req, res) => {
    const input = parse(shareSignalSchema, req.body ?? {});
    trackingService.share(input.productId, input.result, req.auth!.id);
    return noContent(res);
  }) as RequestHandler,

  /**
   * نقرة إشعار الدفع التي فتحت التطبيق — أول كتابةٍ تفوز، ولإشعار صاحب الطلب
   * وحده (إشعار غيره = لا أثر، كعقد «تعليم مقروء»). حدٌّ أدنى: لا نقرة لا تبلغ
   * الخادم تُعدّ، ولا يُدّعى «وصول».
   */
  notificationOpened: (async (req, res) => {
    const { id } = parse(notificationIdParamSchema, req.params);
    if (trackingService.isEnabled()) {
      await db.query(
        'UPDATE notifications SET opened_at = now() WHERE id = $1 AND user_id = $2 AND opened_at IS NULL',
        [id, req.auth!.id],
      );
    }
    return noContent(res);
  }) as RequestHandler,
};
