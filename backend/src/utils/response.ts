import type { Response } from 'express';
import { localizeErrorMessage } from '../domain/errorMessages.js';
import { AppError } from './errors.js';
import type { AppLocale } from './locale.js';

/** استجابة API موحّدة للجميع: { success, data, message }. */
export function ok<T>(res: Response, data: T, message: string | null = null, status = 200) {
  res.status(status).json({ success: true, data, message });
}

export function created<T>(res: Response, data: T, message: string | null = null) {
  ok(res, data, message, 201);
}

export function noContent(res: Response) {
  res.status(204).send();
}

/**
 * `locale` تحسم لغة `message` قبل خروجها — انظر `domain/errorMessages.ts`.
 * غيابها يعني العربية: مواضع النداء التي لا تحمل `req` (نادرة) تبقى كما
 * كانت، والحاجز العالمي يمرّرها دائماً.
 */
export function httpError(res: Response, error: unknown, locale: AppLocale = 'ar') {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      data: null,
      message: localizeErrorMessage(error.message, locale),
      error: { code: error.code, ...(error.details !== undefined ? { details: error.details } : {}) },
    });
    return;
  }
  // أخطاء غير متوقعة: لا نفصّل شيئاً عن التنفيذ الداخلي.
  res.status(500).json({
    success: false,
    data: null,
    message: localizeErrorMessage('حدث خطأ غير متوقع', locale),
    error: { code: 'INTERNAL_ERROR' },
  });
}