import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { uploadsRoot } from './storage/index.js';
import { authenticate, requireAdmin } from './middleware/auth.js';
import { errorHandler, globalRateLimiter, notFoundHandler } from './middleware/error-handler.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { customerRoutes } from './routes/customer.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  /**
   * الثقة بالوسيط — شرطُ صحّة كل حدود المعدّل خلف nginx أو موازن حِمل.
   *
   * بدونها يرى express عنوان الوسيط لكل الطلبات، فتنهار الحدود إلى دلو
   * واحد مشترك بين كل المستخدمين: أول عشرة طلبات في النافذة تُغلق التسجيل
   * والدخول على الجميع. تُضبط من البيئة لأن عدد الوسطاء يختلف بالنشر.
   */
  const trustProxy = config.trustProxy;
  if (trustProxy !== 'false') {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }
  // crossOriginResourcePolicy معطّل لأن الصور تُقدَّم لتطبيق على أصل مختلف.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(globalRateLimiter());

  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  // الصور المرفوعة تُقدَّم كملفات ثابتة (سائق القرص المحلي).
  app.use(
    config.uploads.publicPath,
    express.static(uploadsRoot, { immutable: true, maxAge: '30d', index: false }),
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api', authenticate, customerRoutes);
  app.use('/api/admin', authenticate, requireAdmin, adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}