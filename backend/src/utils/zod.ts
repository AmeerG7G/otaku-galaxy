import { z } from 'zod';
import { AppError } from './errors.js';

/** تحليل مدخلات (body/query/params) عبر Zod وتحويل فشل التحقق إلى خطأ 400 موحّد. */
export function parse<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first?.message ?? 'بيانات غير صالحة';
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}