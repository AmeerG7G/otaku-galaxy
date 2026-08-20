/** خطأ أعمال موحّد يحمل رمزاً وكود HTTP واضحاً. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest: (message: string, code = 'BAD_REQUEST') =>
    new AppError(400, code, message),
  unauthorized: (message = 'غير مصرح', code = 'UNAUTHORIZED') =>
    new AppError(401, code, message),
  forbidden: (message = 'لا تملك صلاحية', code = 'FORBIDDEN') =>
    new AppError(403, code, message),
  notFound: (message = 'غير موجود', code = 'NOT_FOUND') =>
    new AppError(404, code, message),
  conflict: (message: string, code = 'CONFLICT') => new AppError(409, code, message),
  validation: (message: string, details?: unknown) =>
    new AppError(422, 'VALIDATION_ERROR', message, details),
  tooManyRequests: (message = 'طلبات كثيرة، حاول لاحقاً', code = 'RATE_LIMITED') =>
    new AppError(429, code, message),
} as const;