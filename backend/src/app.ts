import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { authenticate, requireAdmin } from './middleware/auth.js';
import { errorHandler, globalRateLimiter, notFoundHandler } from './middleware/error-handler.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { customerRoutes } from './routes/customer.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(globalRateLimiter());

  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api', authenticate, customerRoutes);
  app.use('/api/admin', authenticate, requireAdmin, adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}