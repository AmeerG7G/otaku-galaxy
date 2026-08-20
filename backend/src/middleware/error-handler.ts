import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config, isTest } from '../config/index.js';
import { Errors } from '../utils/errors.js';
import { httpError } from '../utils/response.js';

/** حاجز أخطاء عالمي — كل الأخطاء تمر من هنا بلا تسريب التفاصيل الداخلية. */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  // lazy import لتجنب دورة استيراد.
  if (error instanceof SyntaxError) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'جسم الطلب غير صالح JSON',
      error: { code: 'INVALID_JSON' },
    });
    return;
  }
  httpError(res, error);
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    data: null,
    message: 'المسار غير موجود',
    error: { code: 'NOT_FOUND' },
  });
}

export function authRateLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, res) => {
      httpError(res, Errors.tooManyRequests());
    },
  });
}

export function globalRateLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.globalMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, res) => {
      httpError(res, Errors.tooManyRequests());
    },
  });
}