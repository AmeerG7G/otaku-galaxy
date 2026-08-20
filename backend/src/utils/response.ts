import type { Response } from 'express';
import { AppError } from './errors.js';

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

export function httpError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      data: null,
      message: error.message,
      error: { code: error.code, ...(error.details !== undefined ? { details: error.details } : {}) },
    });
    return;
  }
  // أخطاء غير متوقعة: لا نفصّل شيئاً عن التنفيذ الداخلي.
  res.status(500).json({
    success: false,
    data: null,
    message: 'حدث خطأ غير متوقع',
    error: { code: 'INTERNAL_ERROR' },
  });
}