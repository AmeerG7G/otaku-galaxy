import express, { Router, type Request, type Response } from 'express';
import { config } from '../config/index.js';
import { whatsappProvider } from '../services/whatsapp/provider.js';
import { whatsappSignupService } from '../services/whatsappSignupService.js';

/**
 * ويبهوك واتساب — `GET|POST /api/webhooks/whatsapp`.
 *
 * يُركَّب في `app.ts` **قبل** `express.json` (التوقيع على البايتات الخام) و**قبل**
 * حدّ المعدّل العام (Meta ترسل من عناوين قليلة)، وخارج `authenticate`.
 *
 * [SECURITY]
 * - التوقيع (`X-Hub-Signature-256`) يُفحص قبل أي تحليل؛ الخاطئ ٤٠١ بلا تفاصيل.
 * - الويبهوك لا يُنشئ حساباً ولا يضع كلمة مرور: يقلب جلسةً إلى «متحقَّق» وحسب.
 * - بعد توقيعٍ صحيح يردّ ٢٠٠ دائماً — خطأ منطقي لا تصلحه إعادة إرسال Meta، وردٌّ
 *   غير ٢٠٠ يعني إعادةً لسبعة أيام وقد تعطّل Meta الاشتراك.
 * - الوضع `off`: المصافحة تعمل، والأحداث تُقبل وتُهمَل (لا تُخزَّن).
 */
export const whatsappWebhookRoutes = Router();

const MAX_BODY = 256 * 1024;
const rawBody = express.raw({ type: () => true, limit: MAX_BODY });

whatsappWebhookRoutes.get('/', (req: Request, res: Response) => {
  const challenge = whatsappProvider().handshake(req.query as Record<string, unknown>);
  if (challenge === null) {
    res.status(403).type('text/plain').send('forbidden');
    return;
  }
  res.status(200).type('text/plain').send(challenge);
});

whatsappWebhookRoutes.post('/', (req: Request, res: Response) => {
  rawBody(req, res, (parseError?: unknown) => {
    if (parseError) {
      const status = (parseError as { status?: number }).status === 413 ? 413 : 400;
      res.status(status).json({ success: false });
      return;
    }
    void handle(req, res);
  });
});

async function handle(req: Request, res: Response) {
  const provider = whatsappProvider();
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!provider.verifySignature(body, req.get('x-hub-signature-256'))) {
    console.warn('[whatsapp-webhook] rejected: bad signature');
    res.status(401).json({ success: false });
    return;
  }
  if (config.whatsapp.mode === 'auto') {
    for (const event of provider.parse(body)) {
      try {
        const outcome = await whatsappSignupService.handleInboundEvent(provider.name, event);
        if (outcome !== 'duplicate') console.info(`[whatsapp-webhook] ${event.kind} → ${outcome}`);
      } catch (error) {
        // [SECURITY] رسالة الخطأ وحدها (رمز pg مثلاً) — لا حمولة ولا رقم.
        console.error('[whatsapp-webhook] event failed:', (error as { code?: string }).code ?? (error as Error).name);
      }
    }
  }
  res.status(200).json({ success: true });
}
